#!/bin/bash

# Simple deployment script for Plant Ranger Alexa Skill

echo "🌱 Deploying Plant Ranger Check Alexa Skill..."

# Create deployment package
echo "📦 Creating Lambda deployment package..."
cd lambda
zip -r ../plant-ranger-lambda.zip .
cd ..

# Create Lambda function
echo "🚀 Creating Lambda function..."
aws lambda create-function \
  --function-name plant-ranger-alexa-handler \
  --runtime nodejs18.x \
  --role arn:aws:iam::529123413029:role/lambda-execution-role \
  --handler alexa-handler.handler \
  --zip-file fileb://plant-ranger-lambda.zip \
  --environment Variables='{PLANT_RANGER_API_BASE_URL=https://api.plantranger.com,LOG_LEVEL=INFO}' \
  --timeout 30 \
  --memory-size 256 \
  --region us-east-1

# Get the function ARN
FUNCTION_ARN=$(aws lambda get-function --function-name plant-ranger-alexa-handler --query 'Configuration.FunctionArn' --output text)

echo "✅ Lambda function created!"
echo "📋 Lambda ARN: $FUNCTION_ARN"
echo ""
echo "🔧 Next Steps:"
echo "1. Update alexa-skill/skill.json with Lambda ARN: $FUNCTION_ARN"
echo "2. Upload skill configuration to Alexa Developer Console"
echo "3. Test the skill"

# Clean up
rm plant-ranger-lambda.zip
