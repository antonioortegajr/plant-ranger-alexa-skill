/*
 Basic local tester for the Alexa handler. Usage:
   node local-test.js launch
   node local-test.js intent
*/

process.env.PLANT_RANGER_API_BASE_URL = process.env.PLANT_RANGER_API_BASE_URL || 'https://api.plantranger.com';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const { handler } = require('./alexa-handler.js');

function buildLaunchRequest() {
  return {
    version: '1.0',
    session: {
      new: true,
      sessionId: 'amzn1.echo-api.session.local-test',
      application: { applicationId: 'amzn1.ask.skill.eff9208b-20fb-4dea-9a3c-4676ff6c9fbd' },
      attributes: {},
      user: { userId: 'amzn1.ask.account.LOCALTEST' }
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.eff9208b-20fb-4dea-9a3c-4676ff6c9fbd' },
        user: { userId: 'amzn1.ask.account.LOCALTEST' },
        device: { deviceId: 'local-device', supportedInterfaces: {} },
        apiEndpoint: 'https://api.amazonalexa.com'
      }
    },
    request: {
      type: 'LaunchRequest',
      requestId: 'amzn1.echo-api.request.local-launch',
      timestamp: new Date().toISOString(),
      locale: 'en-US'
    }
  };
}

function buildIntentRequest() {
  return {
    version: '1.0',
    session: {
      new: false,
      sessionId: 'amzn1.echo-api.session.local-test',
      application: { applicationId: 'amzn1.ask.skill.eff9208b-20fb-4dea-9a3c-4676ff6c9fbd' },
      attributes: {},
      user: { userId: 'amzn1.ask.account.LOCALTEST' }
    },
    context: {
      System: {
        application: { applicationId: 'amzn1.ask.skill.eff9208b-20fb-4dea-9a3c-4676ff6c9fbd' },
        user: { userId: 'amzn1.ask.account.LOCALTEST' },
        device: { deviceId: 'local-device', supportedInterfaces: {} },
        apiEndpoint: 'https://api.amazonalexa.com'
      }
    },
    request: {
      type: 'IntentRequest',
      requestId: 'amzn1.echo-api.request.local-intent',
      timestamp: new Date().toISOString(),
      locale: 'en-US',
      intent: { name: 'CheckPlantHealthIntent' }
    }
  };
}

async function main() {
  const kind = (process.argv[2] || 'launch').toLowerCase();
  const alexaPayload = kind === 'intent' ? buildIntentRequest() : buildLaunchRequest();

  // Wrap into an API Gateway event as the Lambda expects
  const event = {
    body: JSON.stringify(alexaPayload)
  };

  try {
    const result = await handler(event, {});
    console.log('statusCode:', result.statusCode);
    try {
      const parsed = JSON.parse(result.body || '{}');
      console.log('response JSON:', JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log('raw body:', result.body);
    }
  } catch (err) {
    console.error('Handler threw error:', err);
  }
}

main();


