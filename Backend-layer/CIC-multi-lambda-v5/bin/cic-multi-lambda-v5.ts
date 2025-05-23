#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CicMultiLambdaV5Stack } from '../lib/cic-multi-lambda-v5-stack';
require("dotenv").config();


const envDev = {
  account: process.env.AWS_ACCOUNT,
  region: process.env.AWS_REGION,
};


const app = new cdk.App();
new CicMultiLambdaV5Stack(app, "CicMultiLambdaV5Stack", {
  env: envDev,
  description: "lambda function layer necessary libraries for gql)",
});