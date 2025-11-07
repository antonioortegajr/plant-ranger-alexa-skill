import { DynamoDB } from 'aws-sdk';
import { SecretsManager } from 'aws-sdk';
import axios from 'axios';

const dynamodb = new DynamoDB.DocumentClient();
const secretsManager = new SecretsManager();

interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
}

interface StoredTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  tokenType: string;
}

export class OAuthManager {
  private credentials: OAuthCredentials | null = null;

  async getCredentials(): Promise<OAuthCredentials> {
    if (!this.credentials) {
      const secretName = process.env.OAUTH_SECRETS_NAME || 'plant-ranger-oauth-credentials';
      const result = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
      this.credentials = JSON.parse(result.SecretString || '{}');
    }
    return this.credentials!;
  }

  async getAuthorizationUrl(userId: string): Promise<string> {
    const credentials = await this.getCredentials();
    const state = Buffer.from(JSON.stringify({ userId, timestamp: Date.now() })).toString('base64');
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: credentials.clientId,
      redirect_uri: 'https://your-alexa-skill-endpoint.com/oauth/callback', // Update with actual callback URL
      scope: 'read:plants', // Adjust scope based on API requirements
      state: state,
    });

    return `${credentials.authUrl}?${params.toString()}`;
  }

  async getTokens(userId: string): Promise<StoredTokens | null> {
    const tableName = process.env.OAUTH_TOKENS_TABLE || 'plant-ranger-oauth-tokens';
    
    try {
      const result = await dynamodb.get({
        TableName: tableName,
        Key: {
          userId,
          tokenType: 'access',
        },
      }).promise();

      if (!result.Item) {
        return null;
      }

      return {
        accessToken: result.Item.token,
        refreshToken: result.Item.refreshToken,
        expiresAt: result.Item.expiresAt,
        tokenType: result.Item.tokenTypeValue,
      };
    } catch (error) {
      console.error('Error getting tokens:', error);
      return null;
    }
  }

  async ensureValidTokens(userId: string, tokens: StoredTokens): Promise<StoredTokens> {
    // Check if access token is expired
    if (Date.now() >= tokens.expiresAt) {
      console.log('Access token expired, refreshing...');
      
      if (!tokens.refreshToken) {
        throw new Error('No refresh token available');
      }

      const credentials = await this.getCredentials();
      const tokenResponse = await this.refreshAccessToken(tokens.refreshToken, credentials);
      
      // Update stored tokens
      await this.updateTokens(userId, tokenResponse);
      
      return {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || tokens.refreshToken,
        expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
        tokenType: tokenResponse.token_type,
      };
    }

    return tokens;
  }

  private async refreshAccessToken(refreshToken: string, credentials: OAuthCredentials): Promise<any> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await axios.post(credentials.tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    return response.data;
  }

  private async updateTokens(userId: string, tokenResponse: any): Promise<void> {
    const tableName = process.env.OAUTH_TOKENS_TABLE || 'plant-ranger-oauth-tokens';
    const expiresAt = Date.now() + (tokenResponse.expires_in * 1000);

    const accessTokenItem = {
      userId,
      tokenType: 'access',
      token: tokenResponse.access_token,
      expiresAt,
      tokenTypeValue: tokenResponse.token_type,
    };

    await dynamodb.put({ TableName: tableName, Item: accessTokenItem }).promise();
  }

  /**
   * Store a token directly (for manual token entry)
   */
  async storeToken(userId: string, token: string): Promise<void> {
    const tableName = process.env.OAUTH_TOKENS_TABLE || 'plant-ranger-oauth-tokens';
    // Set expiration to 1 year from now (API tokens typically don't expire, but we set a long expiration)
    const expiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000);

    const accessTokenItem = {
      userId,
      tokenType: 'access',
      token: token,
      expiresAt,
      tokenTypeValue: 'Bearer',
    };

    await dynamodb.put({ TableName: tableName, Item: accessTokenItem }).promise();
  }
}
