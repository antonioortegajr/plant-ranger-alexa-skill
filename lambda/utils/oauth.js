"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OAuthManager = void 0;
const aws_sdk_1 = require("aws-sdk");
const aws_sdk_2 = require("aws-sdk");
const axios_1 = __importDefault(require("axios"));
const dynamodb = new aws_sdk_1.DynamoDB.DocumentClient();
const secretsManager = new aws_sdk_2.SecretsManager();
class OAuthManager {
    constructor() {
        this.credentials = null;
    }
    async getCredentials() {
        if (!this.credentials) {
            const secretName = process.env.OAUTH_SECRETS_NAME || 'plant-ranger-oauth-credentials';
            const result = await secretsManager.getSecretValue({ SecretId: secretName }).promise();
            this.credentials = JSON.parse(result.SecretString || '{}');
        }
        return this.credentials;
    }
    async getAuthorizationUrl(userId) {
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
    async getTokens(userId) {
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
        }
        catch (error) {
            console.error('Error getting tokens:', error);
            return null;
        }
    }
    async ensureValidTokens(userId, tokens) {
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
    async refreshAccessToken(refreshToken, credentials) {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: credentials.clientId,
            client_secret: credentials.clientSecret,
            refresh_token: refreshToken,
        });
        const response = await axios_1.default.post(credentials.tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        return response.data;
    }
    async updateTokens(userId, tokenResponse) {
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
    async storeToken(userId, token) {
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
exports.OAuthManager = OAuthManager;
