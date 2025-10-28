import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ApiClient } from './utils/api-client';


interface AlexaRequest {
  version: string;
  session: {
    sessionId: string;
    application: {
      applicationId: string;
    };
    user: {
      userId: string;
      accessToken?: string;
    };
    new: boolean;
  };
  context: {
    System: {
      application: {
        applicationId: string;
      };
      user: {
        userId: string;
        accessToken?: string;
      };
    };
  };
  request: {
    type: string;
    requestId: string;
    timestamp: string;
    locale: string;
    intent?: {
      name: string;
      slots?: any;
    };
  };
}

interface AlexaResponse {
  version: string;
  sessionAttributes?: any;
  response: {
    outputSpeech?: {
      type: string;
      text?: string;
      ssml?: string;
    };
    card?: {
      type: string;
      title: string;
      content: string;
    };
    reprompt?: {
      outputSpeech: {
        type: string;
        text: string;
      };
    };
    shouldEndSession: boolean;
  };
}

export const handler = async (
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  console.log('Received Alexa request:', JSON.stringify(event, null, 2));

  try {
    const alexaRequest: AlexaRequest = JSON.parse(event.body || '{}');
    const response = await handleAlexaRequest(alexaRequest);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error handling Alexa request:', error);
    
    const errorResponse: AlexaResponse = {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: 'Sorry, I encountered an error while processing your request. Please try again later.',
        },
        shouldEndSession: true,
      },
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(errorResponse),
    };
  }
};

async function handleAlexaRequest(request: AlexaRequest): Promise<AlexaResponse> {
  const { request: alexaRequest, session } = request;
  const userId = session.user.userId;

  switch (alexaRequest.type) {
    case 'LaunchRequest':
      return handleLaunchRequest();

    case 'IntentRequest':
      return handleIntentRequest(alexaRequest.intent!, userId);

    case 'SessionEndedRequest':
      return handleSessionEndedRequest();

    default:
      return createErrorResponse('Unknown request type');
  }
}

async function handleLaunchRequest(): Promise<AlexaResponse> {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: 'Welcome to Plant Ranger Check! I can help you check the health of your plants. Just say "check my plant health" to get started.',
      },
      reprompt: {
        outputSpeech: {
          type: 'PlainText',
          text: 'You can say "check my plant health" to check your plant status, or "help" for more information.',
        },
      },
      shouldEndSession: false,
    },
  };
}

async function handleIntentRequest(intent: any, userId: string): Promise<AlexaResponse> {
  switch (intent.name) {
    case 'CheckPlantHealthIntent':
      return await handleCheckPlantHealth(userId);

    case 'AMAZON.HelpIntent':
      return handleHelpIntent();

    case 'AMAZON.StopIntent':
    case 'AMAZON.CancelIntent':
      return handleStopIntent();

    default:
      return createErrorResponse('I didn\'t understand that. Please try again.');
  }
}

async function handleCheckPlantHealth(userId: string): Promise<AlexaResponse> {
  try {
    // Make API call to check plant health (no authentication needed)
    const apiClient = new ApiClient();
    const plantHealth = await apiClient.checkPlantHealth();

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: `Your plant health status is: ${plantHealth.status}. ${plantHealth.message}`,
        },
        card: {
          type: 'Simple',
          title: 'Plant Health Check',
          content: `Status: ${plantHealth.status}\n${plantHealth.message}`,
        },
        shouldEndSession: true,
      },
    };

  } catch (error) {
    console.error('Error checking plant health:', error);
    return createErrorResponse('Sorry, I couldn\'t check your plant health right now. Please try again later.');
  }
}

function handleHelpIntent(): AlexaResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: 'Plant Ranger Check can help you monitor your plant health. You can say "check my plant health" to get a status update. You can also say "stop" to end the session.',
      },
      reprompt: {
        outputSpeech: {
          type: 'PlainText',
          text: 'What would you like to do? You can say "check my plant health" or "help" for more information.',
        },
      },
      shouldEndSession: false,
    },
  };
}

function handleStopIntent(): AlexaResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: 'Goodbye! Take care of your plants!',
      },
      shouldEndSession: true,
    },
  };
}

function handleSessionEndedRequest(): AlexaResponse {
  return {
    version: '1.0',
    response: {
      shouldEndSession: true,
    },
  };
}

function createErrorResponse(message: string): AlexaResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: message,
      },
      shouldEndSession: true,
    },
  };
}
