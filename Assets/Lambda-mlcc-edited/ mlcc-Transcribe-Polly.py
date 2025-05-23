import json
import boto3
import wave
from pydub import AudioSegment
import os
import io
import tempfile
import uuid
import time
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from decimal import Decimal
import requests
from gql import gql, Client
from gql.transport.requests import RequestsHTTPTransport

print("Initializing AWS clients")
translator = boto3.client(service_name="translate")
polly = boto3.client("polly")
s3 = boto3.resource("s3")

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(os.environ["DYNAMODB_TABLE_NAME"])

# Initialize AppSync client
APPSYNC_API_URL = os.environ["APPSYNC_API_URL"]
APPSYNC_API_KEY = os.environ["APPSYNC_API_KEY"]

transport = RequestsHTTPTransport(
    url=APPSYNC_API_URL,
    headers={
        'x-api-key': APPSYNC_API_KEY,
        'Content-Type': 'application/json'
    },
    verify=True,
    retries=3,
)

appsync_client = Client(
    transport=transport,
    fetch_schema_from_transport=False  # Don't fetch schema to avoid auth issues
)

# Define the mutation
add_transcript_segment_mutation = gql("""
    mutation AddTranscriptSegment($input: AddTranscriptSegmentInput!) {
        addTranscriptSegment(input: $input) {
            PK
            SK
            CallId
            SegmentId
            StartTime
            EndTime
            Transcript
            IsPartial
            Channel
            CreatedAt
            UpdatedAt
            ExpiresAfter
            Sentiment
            SentimentWeighted
        }
    }
""")

def lambda_handler(event, context):
    try:
        print("=== LAMBDA HANDLER STARTED ===")
        print(f"Event: {event}")
        # Get environment variables
        bucket_name = os.environ["bucketname"]  # format bucketname /
        cloudfronturl = os.environ["cloudfronturl"]

        # Extract parameters
        print("Extracting parameters from event")
        text = event["queryStringParameters"]["txt"]
        sourceLanguage = event["queryStringParameters"]["sourceLanguageCode"]
        targetLanguage = event["queryStringParameters"]["targetLanguageCode"]
        contactId = event["queryStringParameters"]["contactId"]
        bucket = s3.Bucket(bucket_name)

        print(
            f"Parameters: text={text[:20]}..., sourceLanguage={sourceLanguage}, targetLanguage={targetLanguage}, contactId={contactId}"
        )

        # Initializing variables
        CHANNELS = 1  # Polly's output is a mono audio stream
        RATE = 8000  # Polly supports 16000Hz and 8000Hz output for PCM format
        OUTPUT_FILE_IN_WAVE = (
            "/tmp/" + contactId + ".wav"
        )  # WAV format Output file name
        FRAMES = []
        WAV_SAMPLE_WIDTH_BYTES = (
            2  # Polly's output is a stream of 16-bits (2 bytes) samples
        )

        print("=== GETTING LAST SEGMENT TIME ===")
        # Get last segment time
        last_end_time = get_last_segment_time(contactId)
        print(f"Last segment end time: {last_end_time}")

        print(f"=== TRANSLATING FROM {sourceLanguage} TO {targetLanguage} ===")
        # Get voice for target language
        voices = polly.describe_voices(LanguageCode=targetLanguage)
        voiceId = voices["Voices"][0]["Id"]
        print(f"Selected voice: {voiceId}")

        # Translate text
        print("Translating text...")
        result = translator.translate_text(
            Text=text,
            SourceLanguageCode=sourceLanguage,
            TargetLanguageCode=targetLanguage,
        )

        translated_text = result.get("TranslatedText")
        print(f"Translated text: {translated_text[:50]}...")

        print("=== GENERATING SPEECH WITH POLLY ===")
        # Generate speech
        r = polly.synthesize_speech(
            Text=translated_text,
            OutputFormat="pcm",
            LanguageCode=targetLanguage,
            SampleRate="8000",
            VoiceId=voiceId,
        )

        # Processing the response to audio stream
        print("Processing audio stream")
        STREAM = r.get("AudioStream")
        FRAMES.append(STREAM.read())

        print("Creating WAV file")
        WAVEFORMAT = wave.open(OUTPUT_FILE_IN_WAVE, "wb")
        WAVEFORMAT.setnchannels(CHANNELS)
        WAVEFORMAT.setsampwidth(WAV_SAMPLE_WIDTH_BYTES)
        WAVEFORMAT.setframerate(RATE)
        WAVEFORMAT.writeframes(b"".join(FRAMES))
        WAVEFORMAT.close()

        # Calculate audio duration
        print("Calculating audio duration")
        audio_duration = calculate_audio_duration(OUTPUT_FILE_IN_WAVE)
        print(f"Audio duration: {audio_duration} seconds")

        # Create new segment for DynamoDB
        print("=== CREATING DYNAMODB SEGMENT ===")
        # Convert float values to Decimal for DynamoDB compatibility
        print(
            f"Converting float values to Decimal: last_end_time={last_end_time}, audio_duration={audio_duration}"
        )
        start_time = Decimal(
            str(last_end_time + 0.1)
        )  # Convert to string first to avoid precision issues
        end_time = Decimal(str(last_end_time + 0.1 + audio_duration))

        # Generate a new segment ID
        segment_id = str(uuid.uuid4())

        # Calculate expiry time (30 days from now in seconds since epoch)
        expires_after = int(time.time()) + (30 * 24 * 60 * 60)

        # Create sentiment score structure as seen in the example
        # The structure needs to match exactly what DynamoDB expects
        sentiment_score = {
            "Mixed": Decimal("0"),
            "Negative": Decimal("0"),
            "Neutral": Decimal("0"),
            "Positive": Decimal("0")
        }

        # Get current time in ISO format with timezone
        current_time = datetime.now(timezone.utc).isoformat()

        # Create the input for AppSync mutation
        mutation_input = {
            "CallId": contactId,
            "Status": "TRANSCRIBING",
            "SegmentId": segment_id,
            "StartTime": float(start_time),
            "EndTime": float(end_time),
            "Transcript": translated_text,
            "IsPartial": False,
            "Channel": "AGENT",
            "CreatedAt": current_time,
            "ExpiresAfter": expires_after,
            "Sentiment": "NEUTRAL",
            "SentimentScore": {
                "Positive": 0,
                "Negative": 0,
                "Neutral": 0,
                "Mixed": 0
            },
            "SentimentWeighted": 0
        }

        print(f"Created mutation input: {json.dumps(mutation_input, default=str)}")

        # Process and upload audio file
        print("=== PROCESSING AND UPLOADING AUDIO ===")
        finalfile = io.BytesIO()
        track = AudioSegment.from_wav(OUTPUT_FILE_IN_WAVE)
        track.export(
            finalfile, format="wav", codec="pcm_mulaw", parameters=["-ar", "8000"]
        )
        finalfile.seek(0)

        # Upload to S3
        print(f"Uploading audio to S3: {bucket_name}/customerprompts/{contactId}.wav")
        s3.Object(bucket_name, "customerprompts/" + contactId + ".wav").upload_fileobj(
            finalfile
        )
        print("Upload complete")

        # Save to DynamoDB using AppSync mutation
        print("Saving segment using AppSync mutation")
        try:
            result = appsync_client.execute(
                add_transcript_segment_mutation,
                variable_values={'input': mutation_input}
            )
            print(f"AppSync mutation result: {json.dumps(result, default=str)}")
        except Exception as e:
            print(f"Error executing AppSync mutation: {str(e)}")
            # Fallback to direct DynamoDB write if AppSync fails
            print("Falling back to direct DynamoDB write")
            # Create the DynamoDB item
            dynamodb_item = {
                "PK": f"trs#{contactId}",
                "SK": f"s#{segment_id}",
                "CallId": contactId,
                "SegmentId": segment_id,
                "Transcript": translated_text,
                "Channel": "AGENT",
                "IsPartial": False,
                "StartTime": start_time,
                "EndTime": end_time,
                "CreatedAt": current_time,
                "ExpiresAfter": expires_after,
                "Status": "TRANSCRIBING",
                "Sentiment": "NEUTRAL",
                "SentimentScore": sentiment_score,
                "SentimentWeighted": Decimal("0")
            }
            table.put_item(Item=dynamodb_item)
            print(f"Segment saved with ID: {segment_id}")

        # Cleanup
        print("Cleaning up temporary files")
        os.remove(OUTPUT_FILE_IN_WAVE)

        print("=== LAMBDA HANDLER COMPLETED SUCCESSFULLY ===")
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
            },
            "body": len(track)
        }

    except Exception as e:
        print(f"=== ERROR IN LAMBDA HANDLER: {str(e)} ===")
        import traceback

        print(traceback.format_exc())
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Headers": "Content-Type",
                "Access-Control-Allow-Origin": cloudfronturl,
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
            },
            "body": json.dumps({"error": str(e)}),
        }


def get_last_segment_time(contact_id):
    """Get the last segment's end time for the given contact ID"""
    print(f"Querying DynamoDB for last segment time for contact ID: {contact_id}")
    try:
        # Query using the partition key (PK) which is trs#{contactId}
        partition_key = f"trs#{contact_id}"
        print(f"Using partition key: {partition_key}")

        response = table.query(
            KeyConditionExpression=Key("PK").eq(partition_key),
            ScanIndexForward=False,  # Sort in descending order to get the most recent first
        )

        print(f"DynamoDB query response: {response}")
        print(f"Found {len(response.get('Items', []))} items")

        # If we have items, find the one with the highest EndTime
        if response.get("Items"):
            print("Examining items to find the highest EndTime")

            # Debug: Print the first item to see its structure
            if response["Items"]:
                print(
                    f"First item structure: {json.dumps(response['Items'][0], default=str)}"
                )

            # Sort items by EndTime in descending order
            # Handle different possible formats of EndTime based on the example
            def get_end_time(item):
                end_time = item.get("EndTime", 0)
                print(f"Processing EndTime: {end_time}, type: {type(end_time)}")

                # If it's already a number (float or Decimal), return it
                if isinstance(end_time, (float, int, Decimal)):
                    return float(end_time)

                # If it's a string, try to convert it to float
                if isinstance(end_time, str):
                    try:
                        return float(end_time)
                    except (ValueError, TypeError):
                        print(
                            f"Warning: Could not convert EndTime string '{end_time}' to float"
                        )
                        return 0.0

                # If it's a dictionary (as in the example with {"N": "0.797"}), extract the value
                if isinstance(end_time, dict):
                    # Handle direct {"N": "0.797"} format
                    if "N" in end_time:
                        try:
                            return float(end_time["N"])
                        except (ValueError, TypeError):
                            print(
                                f"Warning: Could not convert EndTime dict value '{end_time}' to float"
                            )
                            return 0.0
                    # Handle nested format from raw DynamoDB response
                    elif isinstance(end_time, dict) and end_time.get("N"):
                        try:
                            return float(end_time["N"])
                        except (ValueError, TypeError):
                            print(
                                f"Warning: Could not convert nested EndTime dict value '{end_time}' to float"
                            )
                            return 0.0

                print(f"Warning: Unhandled EndTime format: {end_time}")
                return 0.0

            # Sort the items
            sorted_items = sorted(
                response["Items"],
                key=get_end_time,
                reverse=True,
            )

            # Get the highest EndTime
            highest_item = sorted_items[0]
            end_time_value = highest_item.get("EndTime", 0)

            # Extract the numeric value based on the format
            if isinstance(end_time_value, (float, int, Decimal)):
                end_time = float(end_time_value)
            elif isinstance(end_time_value, str):
                try:
                    end_time = float(end_time_value)
                except (ValueError, TypeError):
                    print(
                        f"Error: Could not convert EndTime string '{end_time_value}' to float"
                    )
                    end_time = 0.0
            elif isinstance(end_time_value, dict):
                # Handle direct {"N": "0.797"} format
                if "N" in end_time_value:
                    try:
                        end_time = float(end_time_value["N"])
                    except (ValueError, TypeError):
                        print(
                            f"Error: Could not convert EndTime dict value '{end_time_value}' to float"
                        )
                        end_time = 0.0
                # Handle nested format from raw DynamoDB response
                elif "N" in end_time_value.get("N", {}):
                    try:
                        end_time = float(end_time_value["N"]["N"])
                    except (ValueError, TypeError, KeyError):
                        print(
                            f"Error: Could not convert nested EndTime dict value '{end_time_value}' to float"
                        )
                        end_time = 0.0
            else:
                print(
                    f"Error: Unhandled EndTime format in highest item: {end_time_value}"
                )
                end_time = 0.0

            print(f"Found last segment with end time: {end_time}")
            return end_time

        print("No previous segments found, returning default time 0.0")
        return 0.0
    except Exception as e:
        print(f"Error querying DynamoDB: {str(e)}")
        print(f"Exception details: {type(e).__name__}")
        import traceback

        print(traceback.format_exc())
        return 0.0


def calculate_audio_duration(audio_stream):
    """Calculate duration of the Polly generated audio"""
    print(f"Calculating duration for audio file: {audio_stream}")
    try:
        with wave.open(audio_stream, "rb") as wave_file:
            frames = wave_file.getnframes()
            rate = wave_file.getframerate()
            duration = frames / float(rate)
            print(
                f"Audio details: frames={frames}, rate={rate}, calculated duration={duration}"
            )
            return duration
    except Exception as e:
        print(f"Error calculating audio duration: {str(e)}")
        return 0.0
