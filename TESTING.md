# Plant Ranger Check - Testing Guide

## Overview
This guide provides comprehensive testing instructions for the Plant Ranger Check Alexa skill.

## Prerequisites
- AWS CDK stack deployed
- Lambda functions deployed and accessible
- OAuth credentials configured in Secrets Manager
- Alexa skill created in Developer Console

## Test Scenarios

### 1. Launch Request Test
**Test Case**: User opens the skill
**Expected Behavior**: 
- Skill responds with welcome message
- Provides instructions on how to use the skill
- Does not end session

**Test Command**: "Alexa, open Plant Ranger Check"

### 2. Plant Health Check - First Time User
**Test Case**: User checks plant health without OAuth tokens
**Expected Behavior**:
- Skill detects no OAuth tokens
- Provides account linking instructions
- Shows LinkAccount card
- Ends session

**Test Command**: "Check my plant health"

### 3. Plant Health Check - Authenticated User
**Test Case**: User with valid OAuth tokens checks plant health
**Expected Behavior**:
- Skill retrieves tokens from DynamoDB
- Makes API call to Plant Ranger API
- Returns plant health status
- Shows Simple card with results
- Ends session

**Test Command**: "Check my plant health"

### 4. Token Refresh Test
**Test Case**: User with expired access token checks plant health
**Expected Behavior**:
- Skill detects expired token
- Uses refresh token to get new access token
- Updates tokens in DynamoDB
- Makes API call with new token
- Returns plant health status

### 5. Help Intent Test
**Test Case**: User asks for help
**Expected Behavior**:
- Skill provides usage instructions
- Lists available commands
- Does not end session
- Provides reprompt

**Test Command**: "Help"

### 6. Stop Intent Test
**Test Case**: User wants to stop the skill
**Expected Behavior**:
- Skill provides goodbye message
- Ends session gracefully

**Test Command**: "Stop"

### 7. Error Handling Tests

#### API Unavailable
**Test Case**: Plant Ranger API is down
**Expected Behavior**:
- Skill handles API error gracefully
- Provides user-friendly error message
- Logs error details

#### Invalid OAuth Token
**Test Case**: OAuth token is invalid or revoked
**Expected Behavior**:
- Skill detects invalid token
- Initiates re-authentication flow
- Provides account linking instructions

#### Network Timeout
**Test Case**: API call times out
**Expected Behavior**:
- Skill handles timeout gracefully
- Provides retry suggestion
- Logs timeout error

## Testing Tools

### 1. Alexa Developer Console Test Simulator
- Use the built-in test simulator
- Test all intents and utterances
- Verify response format and content

### 2. Physical Alexa Device
- Test on actual Echo device
- Verify voice recognition accuracy
- Test account linking flow

### 3. AWS CloudWatch Logs
- Monitor Lambda function logs
- Check for errors and exceptions
- Verify OAuth flow execution

### 4. DynamoDB Console
- Verify token storage
- Check token expiration times
- Monitor table operations

## Test Data Setup

### 1. OAuth Credentials
```bash
aws secretsmanager update-secret \
  --secret-id plant-ranger-oauth-credentials \
  --secret-string '{
    "clientId": "test-client-id",
    "clientSecret": "test-client-secret",
    "authUrl": "https://api.plantranger.com/oauth/authorize",
    "tokenUrl": "https://api.plantranger.com/oauth/token",
    "apiBaseUrl": "https://api.plantranger.com/v1"
  }'
```

### 2. Test Tokens in DynamoDB
```bash
aws dynamodb put-item \
  --table-name plant-ranger-oauth-tokens \
  --item '{
    "userId": {"S": "test-user-123"},
    "tokenType": {"S": "access"},
    "token": {"S": "test-access-token"},
    "expiresAt": {"N": "1700000000000"},
    "tokenTypeValue": {"S": "Bearer"}
  }'
```

## Performance Testing

### 1. Response Time
- Measure Lambda cold start time
- Test API response times
- Verify timeout handling

### 2. Concurrent Users
- Test multiple users simultaneously
- Verify DynamoDB performance
- Check for rate limiting

### 3. Token Refresh Performance
- Measure token refresh time
- Test concurrent refresh requests
- Verify token storage efficiency

## Security Testing

### 1. OAuth Flow Security
- Verify state parameter validation
- Test authorization code exchange
- Check token storage encryption

### 2. Input Validation
- Test malformed requests
- Verify error message sanitization
- Check for information leakage

### 3. Access Control
- Test unauthorized access attempts
- Verify IAM role permissions
- Check Secrets Manager access

## Monitoring and Alerts

### 1. CloudWatch Metrics
- Lambda invocation count
- Lambda error rate
- DynamoDB read/write capacity
- API Gateway metrics

### 2. Custom Metrics
- OAuth flow success rate
- Token refresh frequency
- API response times
- User engagement metrics

### 3. Alerts
- High error rates
- Lambda timeouts
- DynamoDB throttling
- API failures

## Test Checklist

- [ ] Launch request works correctly
- [ ] Help intent provides proper guidance
- [ ] Stop intent ends session gracefully
- [ ] Plant health check without tokens prompts for linking
- [ ] Plant health check with valid tokens returns data
- [ ] Token refresh works automatically
- [ ] Error handling provides user-friendly messages
- [ ] All utterances are recognized correctly
- [ ] Response cards display properly
- [ ] Session management works correctly
- [ ] OAuth flow completes successfully
- [ ] API integration functions properly
- [ ] DynamoDB operations work correctly
- [ ] Secrets Manager access is secure
- [ ] Logging captures all necessary information
- [ ] Performance meets requirements
- [ ] Security measures are effective

## Troubleshooting

### Common Issues
1. **Skill not responding**: Check Lambda ARN in skill configuration
2. **OAuth flow fails**: Verify redirect URI and client credentials
3. **API calls fail**: Check network connectivity and API endpoints
4. **Token storage issues**: Verify DynamoDB permissions and table structure

### Debug Commands
```bash
# Check Lambda logs
aws logs tail /aws/lambda/PlantRangerStack-AlexaHandler-XXXXXXXXX --follow

# Test Lambda function directly
aws lambda invoke \
  --function-name PlantRangerStack-AlexaHandler-XXXXXXXXX \
  --payload '{"test": "data"}' \
  response.json

# Check DynamoDB items
aws dynamodb scan --table-name plant-ranger-oauth-tokens
```
