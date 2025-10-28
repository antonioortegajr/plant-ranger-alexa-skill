#!/bin/bash

# Plant Ranger Check - Deployment Script
# This script deploys the AWS CDK stack and sets up the Alexa skill

set -e

echo "🌱 Plant Ranger Check - Deployment Script"
echo "========================================"

# Check if AWS CLI is installed
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed. Please install it first."
    exit 1
fi

# Check if CDK CLI is installed
if ! command -v cdk &> /dev/null; then
    echo "❌ AWS CDK CLI is not installed. Please install it first."
    echo "Run: npm install -g aws-cdk"
    exit 1
fi

# Check AWS credentials
echo "🔐 Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured. Please run 'aws configure' first."
    exit 1
fi

echo "✅ AWS credentials configured"

# Install dependencies
echo "📦 Installing dependencies..."
cd cdk
npm install
cd ../lambda
npm install
cd ..

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build
cd cdk
npm run build
cd ..

# Bootstrap CDK (if needed)
echo "🚀 Bootstrapping CDK..."
cdk bootstrap

# Deploy the stack
echo "🚀 Deploying CDK stack..."
cdk deploy --require-approval never

# Get the Lambda ARN from CDK output
echo "📋 Getting Lambda function ARN..."
ALEXA_HANDLER_ARN=$(aws cloudformation describe-stacks \
    --stack-name PlantRangerStack \
    --query 'Stacks[0].Outputs[?OutputKey==`AlexaHandlerArn`].OutputValue' \
    --output text)

echo "✅ Deployment complete!"
echo ""
echo "📋 Next Steps:"
echo "1. Update the skill.json file with your Lambda ARN: $ALEXA_HANDLER_ARN"
echo "2. Configure OAuth credentials in AWS Secrets Manager"
echo "3. Upload the skill configuration to Alexa Developer Console"
echo "4. Test the skill"
echo ""
echo "🔧 Configuration:"
echo "- Lambda ARN: $ALEXA_HANDLER_ARN"
echo "- DynamoDB Table: plant-ranger-oauth-tokens"
echo "- Secrets Manager: plant-ranger-oauth-credentials"
