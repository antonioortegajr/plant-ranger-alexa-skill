import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

export class PlantRangerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Lambda execution role
    const lambdaRole = new iam.Role(this, 'PlantRangerLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Main Alexa handler Lambda function
    const alexaHandler = new lambda.Function(this, 'AlexaHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'alexa-handler.handler',
      code: lambda.Code.fromAsset('../lambda'),
      role: lambdaRole,
      environment: {
        PLANT_RANGER_API_BASE_URL: 'https://api.plantranger.com',
        LOG_LEVEL: 'INFO',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(30),
    });

    // Output the Lambda function ARN for Alexa skill configuration
    new cdk.CfnOutput(this, 'AlexaHandlerArn', {
      value: alexaHandler.functionArn,
      description: 'ARN of the Alexa handler Lambda function',
    });
  }
}
