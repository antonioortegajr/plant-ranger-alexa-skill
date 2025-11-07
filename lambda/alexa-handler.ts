import { APIGatewayProxyEvent, APIGatewayProxyResult, Context } from 'aws-lambda';
import { ApiClient } from './utils/api-client';
import { OAuthManager } from './utils/oauth';


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
    reason?: string;
    error?: {
      type: string;
      message: string;
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
      title?: string;
      content?: string;
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
  event: any,
  context: Context
): Promise<any> => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    // Support both API Gateway proxy (event.body string) and direct Alexa (event.version)
    let alexaRequest: AlexaRequest;
    if (event && typeof event.body === 'string') {
      alexaRequest = JSON.parse(event.body || '{}');
    } else if (event && typeof event.body === 'object' && event.body !== null) {
      // Some invokers may pass already-parsed body
      alexaRequest = event.body as AlexaRequest;
    } else {
      alexaRequest = event as AlexaRequest;
    }

    const response = await handleAlexaRequest(alexaRequest);

    // If invoked via API Gateway proxy, return APIGatewayProxyResult
    if (event && Object.prototype.hasOwnProperty.call(event, 'resource')) {
      const apiResult: APIGatewayProxyResult = {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(response),
      };
      return apiResult;
    }

    // Direct Alexa invocation expects the response object directly
    return response;
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

    if (event && Object.prototype.hasOwnProperty.call(event, 'resource')) {
      const apiError: APIGatewayProxyResult = {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(errorResponse),
      };
      return apiError;
    }

    return errorResponse;
  }
};

/**
 * Get access token from request (Alexa-hosted account linking), DynamoDB (self-hosted), or environment variable (static token)
 * Returns null if no token is available
 */
async function getAccessToken(request: AlexaRequest, userId: string): Promise<string | null> {
  // First, try to get token from request (Alexa-hosted account linking)
  const tokenFromRequest = request.context?.System?.user?.accessToken || 
                          (request as any).session?.user?.accessToken;
  
  if (tokenFromRequest) {
    console.log('Using access token from request (Alexa-hosted account linking)');
    return tokenFromRequest;
  }
  
  // Fall back to DynamoDB (self-hosted account linking)
  console.log('No token in request, checking DynamoDB (self-hosted account linking)');
  const oauthManager = new OAuthManager();
  const tokens = await oauthManager.getTokens(userId);
  
  if (tokens) {
    const validTokens = await oauthManager.ensureValidTokens(userId, tokens);
    return validTokens.accessToken;
  }
  
  // Fall back to static API token from environment variable (for testing/single-user scenarios)
  const staticToken = process.env.PLANT_RANGER_API_TOKEN;
  if (staticToken) {
    console.log('Using static API token from environment variable');
    return staticToken;
  }
  
  return null;
}

async function handleAlexaRequest(request: AlexaRequest): Promise<AlexaResponse> {
  const alexaRequest = request.request;
  const session = (request as any).session;
  const contextSystemUserId = (request as any)?.context?.System?.user?.userId;
  const sessionUserId = session?.user?.userId;
  const userId = sessionUserId || contextSystemUserId || 'unknown';
  
  // Store the full request for FallbackIntent processing
  (alexaRequest as any).__fullRequest = request;

  switch (alexaRequest.type) {
    case 'LaunchRequest':
      return handleLaunchRequest();

    case 'IntentRequest':
      return handleIntentRequest(alexaRequest.intent!, userId, request);

    case 'SessionEndedRequest':
      console.log('Session ended:', alexaRequest.reason, alexaRequest.error);
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

async function handleIntentRequest(intent: any, userId: string, request: AlexaRequest): Promise<AlexaResponse> {
  console.log('Intent received:', intent.name, 'Slots:', JSON.stringify(intent.slots));
  
  switch (intent.name) {
    case 'CheckTeamPlantStatusIntent':
      // Extract team name from slot - AMAZON.SearchQuery can have value in different formats
      const teamNameSlot = intent.slots?.TeamName;
      let teamName: string | undefined;
      
      if (teamNameSlot) {
        // Try different ways to extract the value
        teamName = teamNameSlot.value || 
                   teamNameSlot.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.name ||
                   teamNameSlot.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.id;
      }
      
      console.log('Team name slot object:', JSON.stringify(teamNameSlot));
      console.log('Extracted team name:', teamName);
      return await handleCheckTeamPlantStatus(userId, teamName, request);

    case 'CheckPlantHealthIntent':
      return await handleCheckPlantHealth(userId, request);

    case 'ListPlantStatusIntent':
      return await handleListPlantStatus(userId, request);

    case 'AMAZON.FallbackIntent':
      // FallbackIntent doesn't have slots, but we can try to extract from common patterns
      // Since we can't get the raw utterance, we'll list teams and ask user to specify
      console.log('FallbackIntent received - asking user to specify team name');
      
      // Try to get teams and list them so user can choose
      try {
        const apiClient = new ApiClient();
        const accessToken = await getAccessToken(request, userId);
        
        if (accessToken) {
          const teamsResponse = await apiClient.getTeams(accessToken);
          const teams = teamsResponse.teams || [];
          
          if (teams.length > 0) {
            const teamNames = teams.map((t: any) => t.name || 'Unnamed Team').join(', ');
            return {
              version: '1.0',
              response: {
                outputSpeech: {
                  type: 'PlainText',
                  text: `I didn't quite understand. Which team would you like to check? Your teams are: ${teamNames}. Please say something like "check plants in" followed by the team name.`,
                },
                reprompt: {
                  outputSpeech: {
                    type: 'PlainText',
                    text: `Which team? Your teams are: ${teamNames}.`,
                  },
                },
                shouldEndSession: false,
              },
            };
          }
        }
      } catch (error) {
        console.error('Error getting teams in FallbackIntent:', error);
      }
      
      // If we can't get teams, give generic response
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'I didn\'t understand. Try saying "what plants need water in" followed by your team name, or "list my plant status" to see all plants.',
          },
          reprompt: {
            outputSpeech: {
              type: 'PlainText',
              text: 'Say "what plants need water in" followed by your team name.',
            },
          },
          shouldEndSession: false,
        },
      };

    case 'AMAZON.HelpIntent':
      return handleHelpIntent();

    case 'AMAZON.StopIntent':
    case 'AMAZON.CancelIntent':
      return handleStopIntent();

    default:
      return createErrorResponse('I didn\'t understand that. Please try again.');
  }
}

async function handleCheckPlantHealth(userId: string, request: AlexaRequest): Promise<AlexaResponse> {
  try {
    const apiClient = new ApiClient();
    
    // Get access token (from request or DynamoDB)
    const accessToken = await getAccessToken(request, userId);
    
    let plantHealth;
    if (accessToken) {
      // Make API call with authentication
      plantHealth = await apiClient.checkPlantHealth(accessToken);
    } else {
      // No tokens found, try API call without authentication for testing
      console.log('No OAuth tokens found, attempting API call without authentication');
      try {
        plantHealth = await apiClient.checkPlantHealth();
      } catch (apiError: any) {
        // If API call fails without auth, provide account linking instructions
        if (apiError.response && (apiError.response.status === 401 || apiError.response.status === 403)) {
          return {
            version: '1.0',
            response: {
              outputSpeech: {
                type: 'PlainText',
                text: 'To check your plant health, you need to link your Plant Ranger account first. Please visit the Alexa app to complete the account linking process.',
              },
              card: {
                type: 'LinkAccount'
              },
              shouldEndSession: true,
            },
          };
        }
        throw apiError;
      }
    }

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: plantHealth.status,
        },
        card: {
          type: 'Simple',
          title: 'Plant Health Check',
          content: `Status: ${plantHealth.status}`,
        },
        shouldEndSession: true,
      },
    };

  } catch (error) {
    console.error('Error checking plant health:', error);
    return createErrorResponse('Sorry, I couldn\'t check your plant health right now. Please try again later.');
  }
}

async function handleListPlantStatus(userId: string, request: AlexaRequest): Promise<AlexaResponse> {
  try {
    const apiClient = new ApiClient();
    
    // Get access token (from request or DynamoDB)
    const accessToken = await getAccessToken(request, userId);
    
    if (!accessToken) {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'To check your plant status, you need to link your Plant Ranger account first. Please visit the Alexa app to complete the account linking process.',
          },
          card: {
            type: 'LinkAccount'
          },
          shouldEndSession: true,
        },
      };
    }

    // Get all teams
    const teamsResponse = await apiClient.getTeams(accessToken);
    const teams = teamsResponse.teams || [];

    if (teams.length === 0) {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'You don\'t have any teams set up yet. Please add a team in the Plant Ranger app first.',
          },
          shouldEndSession: true,
        },
      };
    }

    // Collect all plants from all teams
    const allPlants: Array<{ name: string; id: string; needsWatered: boolean }> = [];

    for (const team of teams) {
      try {
        const teamDetails = await apiClient.getTeamDetails(accessToken, team.id);
        const plants = teamDetails.plants || [];

        // For each plant, check status from team details first, then get full details if needed
        for (const plant of plants) {
          try {
            // First check if status is in the plant object from team details
            let needsWatered = false;
            const plantFromTeam = plant;
            
            // Check status in team details plant object
            if (plantFromTeam.status === 'needs_water' || plantFromTeam.status === 'needs water') {
              needsWatered = true;
              console.log(`Plant ${plant.id} (${plantFromTeam.name || plant.name}): Found status=needs_water in team details`);
            } else if (plantFromTeam.needs_water === true || plantFromTeam.needsWater === true) {
              needsWatered = true;
              console.log(`Plant ${plant.id}: Found needs_water=true in team details`);
            } else {
              // If not found in team details, get full plant details
              const plantDetails = await apiClient.getPlantDetails(accessToken, plant.id);
              
              // Check plant details for status
              if (plantDetails.status === 'needs_water' || plantDetails.status === 'needs water') {
                needsWatered = true;
                console.log(`Plant ${plant.id}: Found status=needs_water in plantDetails.status`);
              } else if (plantDetails.needs_water === true || plantDetails.needsWater === true) {
                needsWatered = true;
                console.log(`Plant ${plant.id}: Found needs_water=true in plantDetails`);
              } else {
                // Check checkups
                const checkups = plantDetails.checkups || [];
                if (checkups.length > 0) {
                  const latestCheckup = checkups[0];
                  needsWatered = latestCheckup.status === 'needs_water' || 
                                latestCheckup.status === 'needs water' ||
                                latestCheckup.needs_watered === true || 
                                latestCheckup.needsWatered === true || 
                                false;
                  console.log(`Plant ${plant.id}: Checkup status=${latestCheckup.status}, needs_watered=${latestCheckup.needs_watered}, final=${needsWatered}`);
                } else {
                  console.log(`Plant ${plant.id}: No status found, teamDetails.status=${plantFromTeam.status}, plantDetails.status=${plantDetails.status}`);
                }
              }
            }

            // Use name from team details or plant details
            const plantName = plantFromTeam.name || plant.name || 'Unnamed Plant';

            allPlants.push({
              name: plantName,
              id: plant.id,
              needsWatered,
            });
          } catch (plantError) {
            console.error(`Error getting details for plant ${plant.id}:`, plantError);
            // Continue with other plants even if one fails
          }
        }
      } catch (teamError) {
        console.error(`Error getting details for team ${team.id}:`, teamError);
        // Continue with other teams even if one fails
      }
    }

    if (allPlants.length === 0) {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'You don\'t have any plants set up yet. Please add plants to your teams in the Plant Ranger app.',
          },
          shouldEndSession: true,
        },
      };
    }

    // Separate plants into those that need water and those that don't
    const plantsNeedingWater = allPlants.filter(p => p.needsWatered);
    const plantsNotNeedingWater = allPlants.filter(p => !p.needsWatered);

    console.log(`Total plants: ${allPlants.length}, Needing water: ${plantsNeedingWater.length}, Not needing: ${plantsNotNeedingWater.length}`);

    // Build the response message - when asking "which plants need water", only mention those that need water
    let message = '';

    if (plantsNeedingWater.length > 0) {
      message = `${plantsNeedingWater.length} plant${plantsNeedingWater.length !== 1 ? 's need' : ' needs'} water: `;
      message += plantsNeedingWater.map(p => p.name).join(', ');
    } else {
      message = `None of your ${allPlants.length} plant${allPlants.length !== 1 ? 's need' : ' needs'} water right now. All your plants are doing fine!`;
    }

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: message,
        },
        card: {
          type: 'Simple',
          title: 'Plant Status',
          content: `Total Plants: ${allPlants.length}\nNeeds Water: ${plantsNeedingWater.length}\n${plantsNeedingWater.length > 0 ? 'Plants needing water: ' + plantsNeedingWater.map(p => p.name).join(', ') : 'All plants are doing well!'}`,
        },
        shouldEndSession: true,
      },
    };

  } catch (error) {
    console.error('Error listing plant status:', error);
    
    // Handle specific error messages
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'To check your plant status, you need to link your Plant Ranger account first. Please visit the Alexa app to complete the account linking process.',
          },
          shouldEndSession: true,
        },
      };
    }

    return createErrorResponse('Sorry, I couldn\'t retrieve your plant status right now. Please try again later.');
  }
}

async function handleCheckTeamPlantStatus(userId: string, teamName: string | undefined, request: AlexaRequest): Promise<AlexaResponse> {
  try {
    const apiClient = new ApiClient();
    
    // Get access token (from request or DynamoDB)
    const accessToken = await getAccessToken(request, userId);
    
    if (!accessToken) {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'To check your plant status, you need to link your Plant Ranger account first. Please visit the Alexa app to complete the account linking process.',
          },
          card: {
            type: 'LinkAccount'
          },
          shouldEndSession: true,
        },
      };
    }

    // If no team name provided, ask for it
    if (!teamName || teamName.trim() === '') {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'Which team would you like to check? Please tell me the name of the team or group.',
          },
          reprompt: {
            outputSpeech: {
              type: 'PlainText',
              text: 'Please say the name of the team you want to check, for example "check plants in kitchen" or "what plants need water in office".',
            },
          },
          shouldEndSession: false,
        },
      };
    }

    // Get all teams
    const teamsResponse = await apiClient.getTeams(accessToken);
    const teams = teamsResponse.teams || [];

    if (teams.length === 0) {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'You don\'t have any teams set up yet. Please add a team in the Plant Ranger app first.',
          },
          shouldEndSession: true,
        },
      };
    }

    // Find the team by name (case-insensitive, partial match)
    // Remove "team" prefix if present
    let normalizedTeamName = teamName.toLowerCase().trim();
    normalizedTeamName = normalizedTeamName.replace(/^team\s+/, ''); // Remove "team " prefix
    
    const matchingTeam = teams.find((team: any) => {
      const teamNameLower = (team.name || '').toLowerCase();
      // Check if either contains the other, or if normalized name matches team name
      return teamNameLower.includes(normalizedTeamName) || 
             normalizedTeamName.includes(teamNameLower) ||
             teamNameLower === normalizedTeamName;
    });

    if (!matchingTeam) {
      // List available teams to help user
      const teamNames = teams.map((t: any) => t.name || 'Unnamed Team').join(', ');
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: `I couldn't find a team named "${teamName}". Your available teams are: ${teamNames}. Please try again with one of these team names.`,
          },
          reprompt: {
            outputSpeech: {
              type: 'PlainText',
              text: `Which team would you like to check? Your teams are: ${teamNames}.`,
            },
          },
          shouldEndSession: false,
        },
      };
    }

    // Get team details
    const teamDetails = await apiClient.getTeamDetails(accessToken, matchingTeam.id);
    const plants = teamDetails.plants || [];

    if (plants.length === 0) {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: `The ${matchingTeam.name} team doesn't have any plants set up yet.`,
          },
          shouldEndSession: true,
        },
      };
    }

    // Collect plant details with watering status
    const teamPlants: Array<{ name: string; id: string; needsWatered: boolean }> = [];

    for (const plant of plants) {
      try {
        const plantDetails = await apiClient.getPlantDetails(accessToken, plant.id);
        
        // Get needs_watered from the latest checkup or plant status
        const checkups = plantDetails.checkups || [];
        let needsWatered = false;
        
        // First check if plant has a status field indicating needs_water
        if (plantDetails.status === 'needs_water') {
          needsWatered = true;
        } else if (checkups.length > 0) {
          const latestCheckup = checkups[0];
          // Check status field first, then needs_watered fields
          needsWatered = latestCheckup.status === 'needs_water' || 
                        latestCheckup.needs_watered || 
                        latestCheckup.needsWatered || 
                        false;
        }

        const plantName = plantDetails.name || plant.name || 'Unnamed Plant';

        teamPlants.push({
          name: plantName,
          id: plant.id,
          needsWatered,
        });
      } catch (plantError) {
        console.error(`Error getting details for plant ${plant.id}:`, plantError);
        // Continue with other plants even if one fails
      }
    }

    if (teamPlants.length === 0) {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: `I couldn't retrieve the plant details for ${matchingTeam.name}. Please try again later.`,
          },
          shouldEndSession: true,
        },
      };
    }

    // Separate plants into those that need water and those that don't
    const plantsNeedingWater = teamPlants.filter(p => p.needsWatered);
    const plantsNotNeedingWater = teamPlants.filter(p => !p.needsWatered);

    // Build the response message
    let message = `In ${matchingTeam.name}, you have ${teamPlants.length} plant${teamPlants.length !== 1 ? 's' : ''}. `;

    if (plantsNeedingWater.length > 0) {
      message += `${plantsNeedingWater.length} plant${plantsNeedingWater.length !== 1 ? 's need' : ' needs'} water: `;
      message += plantsNeedingWater.map(p => p.name).join(', ');
      
      if (plantsNotNeedingWater.length > 0) {
        message += `. ${plantsNotNeedingWater.length} plant${plantsNotNeedingWater.length !== 1 ? 's are' : ' is'} doing fine: `;
        message += plantsNotNeedingWater.map(p => p.name).join(', ');
      }
    } else {
      message += `All plants in ${matchingTeam.name} are doing fine! `;
      message += plantsNotNeedingWater.map(p => p.name).join(', ');
    }

    return {
      version: '1.0',
      response: {
        outputSpeech: {
          type: 'PlainText',
          text: message,
        },
        card: {
          type: 'Simple',
          title: `Plant Status - ${matchingTeam.name}`,
          content: `Total Plants: ${teamPlants.length}\nNeeds Water: ${plantsNeedingWater.length}\n${plantsNeedingWater.length > 0 ? 'Plants needing water: ' + plantsNeedingWater.map(p => p.name).join(', ') : 'All plants are doing well!'}`,
        },
        shouldEndSession: true,
      },
    };

  } catch (error) {
    console.error('Error checking team plant status:', error);
    
    // Handle specific error messages
    if (error instanceof Error && error.message.includes('Unauthorized')) {
      return {
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'To check your plant status, you need to link your Plant Ranger account first. Please visit the Alexa app to complete the account linking process.',
          },
          shouldEndSession: true,
        },
      };
    }

    return createErrorResponse('Sorry, I couldn\'t retrieve the plant status for that team right now. Please try again later.');
  }
}

function handleHelpIntent(): AlexaResponse {
  return {
    version: '1.0',
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: 'Plant Ranger Check can help you monitor your plant health. You can say "check my plant health" to get a status update, "list my plant status" to see which plants need water, or "check plants in [team name]" to check a specific team. You can also say "stop" to end the session.',
      },
      reprompt: {
        outputSpeech: {
          type: 'PlainText',
          text: 'What would you like to do? You can say "check my plant health", "list my plant status", "check plants in [team name]", or "help" for more information.',
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
