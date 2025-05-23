import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import { Duration } from 'aws-cdk-lib';

export class CicMultiLambdaV5Stack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // layer gql, requests
    // creating the layer for all the dependencies for gql, requests
    const gql_requests_layer_2 = new lambda.LayerVersion(
      this,
      "gql_requests_layer",
      {
        compatibleRuntimes: [
          lambda.Runtime.PYTHON_3_10,
          lambda.Runtime.PYTHON_3_9,
          lambda.Runtime.PYTHON_3_8,
        ],
        code: lambda.Code.fromAsset("layers/gql_requests"),
        description: "The gql_requests layer",
      }
    );

  }
}
