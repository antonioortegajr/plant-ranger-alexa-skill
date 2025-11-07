import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export class PlantRangerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // DynamoDB table for OAuth tokens
    const oauthTokensTable = new dynamodb.Table(this, 'OAuthTokensTable', {
      tableName: 'plant-ranger-oauth-tokens',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'tokenType', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Secrets Manager secret for OAuth credentials
    const oauthCredentialsSecret = new secretsmanager.Secret(this, 'OAuthCredentialsSecret', {
      secretName: 'plant-ranger-oauth-credentials',
      description: 'OAuth credentials for Plant Ranger API',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          clientId: 'your-client-id',
          clientSecret: 'your-client-secret',
          authUrl: 'https://api.plantranger.com/oauth/authorize',
          tokenUrl: 'https://api.plantranger.com/oauth/token',
          apiBaseUrl: 'https://api.plantranger.com/v1'
        }),
        generateStringKey: 'placeholder',
        excludeCharacters: '"@/\\'
      }
    });

    // Lambda execution role with proper permissions
    const lambdaRole = new iam.Role(this, 'PlantRangerLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Add DynamoDB permissions
    oauthTokensTable.grantReadWriteData(lambdaRole);
    
    // Add Secrets Manager permissions
    oauthCredentialsSecret.grantRead(lambdaRole);

    // Main Alexa handler Lambda function
    const alexaHandler = new lambda.Function(this, 'AlexaHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'alexa-handler.handler',
      code: lambda.Code.fromAsset('../lambda'),
      role: lambdaRole,
      environment: {
        PLANT_RANGER_API_BASE_URL: 'https://api.plantranger.com',
        OAUTH_TOKENS_TABLE: oauthTokensTable.tableName,
        OAUTH_SECRETS_NAME: oauthCredentialsSecret.secretName,
        LOG_LEVEL: 'INFO',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(30),
    });

    // Token handler Lambda function (for users to enter API tokens)
    const tokenHandler = new lambda.Function(this, 'TokenHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'token-handler.handler',
      code: lambda.Code.fromAsset('../lambda'),
      role: lambdaRole,
      environment: {
        OAUTH_TOKENS_TABLE: oauthTokensTable.tableName,
        LOG_LEVEL: 'INFO',
      },
      logRetention: logs.RetentionDays.ONE_WEEK,
      timeout: cdk.Duration.seconds(30),
    });

    // API Gateway for token entry
    const api = new apigateway.RestApi(this, 'PlantRangerApi', {
      restApiName: 'Plant Ranger Token API',
      description: 'API Gateway for Plant Ranger token entry',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key'],
      },
    });

    // Token entry endpoint (authorization page)
    const authorizeResource = api.root.addResource('authorize');
    authorizeResource.addMethod('GET', new apigateway.LambdaIntegration(tokenHandler));
    authorizeResource.addMethod('POST', new apigateway.LambdaIntegration(tokenHandler));

    // Token endpoint (for OAuth token exchange)
    const tokenResource = api.root.addResource('token');
    tokenResource.addMethod('POST', new apigateway.LambdaIntegration(tokenHandler));

    // Outputs
    new cdk.CfnOutput(this, 'AlexaHandlerArn', {
      value: alexaHandler.functionArn,
      description: 'ARN of the Alexa handler Lambda function',
    });

    new cdk.CfnOutput(this, 'TokenHandlerArn', {
      value: tokenHandler.functionArn,
      description: 'ARN of the token handler Lambda function',
    });

    new cdk.CfnOutput(this, 'AuthorizationUrl', {
      value: `${api.url}authorize`,
      description: 'Authorization URL for Alexa account linking',
    });

    new cdk.CfnOutput(this, 'TokenUrl', {
      value: `${api.url}token`,
      description: 'Token URL for Alexa account linking',
    });

    new cdk.CfnOutput(this, 'DynamoDBTableName', {
      value: oauthTokensTable.tableName,
      description: 'DynamoDB table name for OAuth tokens',
    });
  }
}
