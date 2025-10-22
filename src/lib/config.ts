/**
 * Centralized configuration for Firebase Function URLs
 * All Firebase Cloud Run function endpoints are defined here for easy maintenance
 */

export const FIREBASE_FUNCTIONS = {
  chatHttp: 'https://us-south1-try-mcp-15e08.cloudfunctions.net/chatHttp',
  googleDriveOperations: 'https://us-south1-try-mcp-15e08.cloudfunctions.net/googleDriveOperations',
  exchangeOAuthCode: 'https://us-south1-try-mcp-15e08.cloudfunctions.net/exchangeOAuthCode',
  storeOAuthTokens: 'https://us-south1-try-mcp-15e08.cloudfunctions.net/storeOAuthTokens',
} as const;

/**
 * Google OAuth Configuration
 * Client ID should be set via environment variable in production
 */
export function getGoogleClientId(): string {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  
  if (!clientId) {
    throw new Error(
      'NEXT_PUBLIC_GOOGLE_CLIENT_ID environment variable is not configured. ' +
      'Please set this in your Vercel environment variables or .env.local file.'
    );
  }
  
  return clientId;
}

