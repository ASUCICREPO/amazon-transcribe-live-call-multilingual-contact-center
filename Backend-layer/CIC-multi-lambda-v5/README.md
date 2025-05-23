# Welcome to your CDK TypeScript project

This is a lambda layer CDK project with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Creating the layer by using docker and installing the dependencies

1. Pull a docker image of the python version that you want to use. We are using AWS ECR’s image of Python9 in this one: 
    
    ```jsx
    // python 10
    docker pull public.ecr.aws/sam/build-python3.10:1.139.0-20250522205927
    
    // python 9
    docker pull public.ecr.aws/sam/build-python3.9:1.139.0-20250522205922
    ```
    
2. This command below is starting a new Docker container from the image that was just pulled. The `-it` option is instructing Docker to allocate a pseudo-TTY connected to the container’s stdin and stdout, allowing interactive bash shell access. The `-v $(pwd):/var/task` option is mounting the current directory (where this command is being run) as a volume to the directory `/var/task` in the Docker container.
    
    ```jsx
    // python 10
    docker run -it -v $(pwd):/var/task public.ecr.aws/sam/build-python3.10:1.139.0-20250522205927
    
    // python 9
    docker run -it -v $(pwd):/var/task public.ecr.aws/sam/build-python3.9:1.139.0-20250522205922
    
    ```
    
3. Create a folder “python”, so it can be used for the next command “./python” 

4. Now inside the docker container, we can write pip install all the dependencies we want. This command is using pip, the Python package manager, to install the packages in requirements.txt into the `./python` directory. The `-t` option tells pip to install the packages into the specified directory.
    
    ```jsx
    pip install -r requirements.txt -t ./python
    ```
    
5. This command is creating a zip archive named `python.zip` from the contents of the `./python` directory. The `-r` option is telling zip to work recursively, including the contents of any subdirectories.
    
    ```jsx
    zip -r python.zip ./python
    ```
    
6. Now copy paste that in the CDK project as per the structure as in the `code: lambda.Code.fromAsset("layers/gql_requests"),` in the `lib/cic-multi-lambda-v5-stack.ts` file.



## ⇒ Medium Article for Lambda layer example

[https://medium.com/sopmac-labs/langchain-aws-lambda-serverless-q-a-chatbot-203470b9906f#:~:text=AWS Lambda Layers are like,easier to manage and update](https://medium.com/sopmac-labs/langchain-aws-lambda-serverless-q-a-chatbot-203470b9906f#:~:text=AWS%20Lambda%20Layers%20are%20like,easier%20to%20manage%20and%20update).

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy`  deploy this stack to your default AWS account/region
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
