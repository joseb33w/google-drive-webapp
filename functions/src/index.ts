import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import axios from 'axios';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { google } from 'googleapis';

// Initialize Firebase Admin
admin.initializeApp();

// Railway API URL - using environment variables
const RAILWAY_API_URL = process.env.RAILWAY_API_URL || 'https://google-mcp-tools-access-production.up.railway.app';

// Secure chat endpoint
export const chat = onCall({ 
  region: 'us-south1',
  timeoutSeconds: 300,
  memory: '512MiB'
}, async (request) => {
  // Initialize OpenAI with environment variable
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Verify user is authenticated
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { message, documentContext, chatHistory } = request.data;

  if (!message) {
    throw new functions.https.HttpsError('invalid-argument', 'Message is required');
  }

  try {
    // Build the system prompt
    let systemPrompt = `You are an AI assistant that helps users edit and work with Google Docs. You can:
- Help users write, edit, and format documents
- Suggest improvements to text
- Answer questions about document content
- Help with document structure and organization
- Provide writing assistance and feedback

Be helpful, concise, and professional in your responses.`;

    if (documentContext) {
      systemPrompt += `\n\nCurrent document context:
- Document ID: ${documentContext.id}
- Document Name: ${documentContext.name}
- Content: ${documentContext.content || 'No content available'}`;
    }

    // Build the conversation history
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add chat history (last 10 messages)
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach((msg: any) => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }

    // Add the current user message
    messages.push({
      role: 'user',
      content: message
    });

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    return { response };

  } catch (error) {
    console.error('Chat function error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to generate response');
  }
});

// Secure Railway API proxy
export const railwayProxy = onCall({ 
  region: 'us-south1',
  timeoutSeconds: 300,
  memory: '256MiB'
}, async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { method, params, sessionId } = request.data;

  try {
    const response = await axios.post(`${RAILWAY_API_URL}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      }
    });

    return response.data;
  } catch (error) {
    console.error('Railway proxy error:', error);
    throw new functions.https.HttpsError('internal', 'Failed to communicate with Railway API');
  }
});

// HTTP endpoints for Cloud Run health checks
export const healthCheck = onRequest({ 
  region: 'us-south1',
  timeoutSeconds: 300,
  memory: '256MiB'
}, (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'google-drive-webapp-functions'
  });
});

// HTTP endpoint for chat (alternative to callable function)
export const chatHttp = onRequest({ 
  region: 'us-south1',
  timeoutSeconds: 300,
  memory: '512MiB',
  invoker: 'public'
}, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Verify authentication
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authorization header required' });
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];
  
  try {
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    console.log('Authenticated user:', uid);
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({ error: 'Invalid authentication token' });
    return;
  }

  // Initialize OpenAI with environment variable
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { message, documentContext, chatHistory } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Build the system prompt
    let systemPrompt = `You are an AI assistant that helps users edit and work with Google Docs. You can:
- Help users write, edit, and format documents
- Suggest improvements to text
- Answer questions about document content
- Help with document structure and organization
- Provide writing assistance and feedback

When a user requests an edit to the document, you should return a structured response with both a human-readable message and the specific edit operation. 

For edit requests, respond with this JSON format:
{
  "response": "Your human-readable response explaining what you'll do",
  "edit": {
    "type": "replace" | "insert" | "delete",
    "findText": "exact text to find in the document",
    "replaceText": "new text to replace with (empty string for deletions)",
    "position": 0 // optional, for insertions at specific positions
  }
}

For non-edit requests (questions, general help), respond normally with just text.

Be helpful, concise, and professional in your responses.`;

    if (documentContext) {
      systemPrompt += `\n\nCurrent document context:
- Document ID: ${documentContext.id}
- Document Name: ${documentContext.name}
- Content: ${documentContext.content || 'No content available'}`;
    }

    // Build the conversation history
    const messages: any[] = [
      { role: 'system', content: systemPrompt }
    ];

    // Add chat history (last 10 messages)
    if (chatHistory && chatHistory.length > 0) {
      chatHistory.forEach((msg: any) => {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      });
    }

    // Add the current user message
    messages.push({
      role: 'user',
      content: message
    });

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 1000,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';

    // Try to parse JSON response for edit proposals
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(response);
      // If it's a valid JSON with edit structure, return it
      if (parsedResponse.response && parsedResponse.edit) {
        res.json(parsedResponse);
        return;
      }
    } catch (e) {
      // Not JSON, continue with normal text response
    }

    // Return normal text response
    res.json({ response });

  } catch (error) {
    console.error('Chat HTTP function error:', error);
    res.status(500).json({ error: 'Failed to generate response' });
  }
});

// HTTP endpoint for Railway proxy (alternative to callable function)
export const railwayProxyHttp = onRequest({ 
  region: 'us-south1',
  timeoutSeconds: 300,
  memory: '256MiB'
}, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { method, params, sessionId } = req.body;

    const response = await axios.post(`${RAILWAY_API_URL}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method,
      params
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': sessionId
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('Railway proxy HTTP error:', error);
    res.status(500).json({ error: 'Failed to communicate with Railway API' });
  }
});

// Helper function to get OAuth client with user tokens
async function getOAuthClient(uid: string) {
  // Get user's OAuth tokens from Firestore
  const db = admin.firestore();
  const userDoc = await db.collection('userTokens').doc(uid).get();
  
  if (!userDoc.exists) {
    throw new Error('User OAuth tokens not found. Please sign in with Google again.');
  }
  
  const tokens = userDoc.data();
  
  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://google-drive-webapp-9xjr.vercel.app'
  );
  
  oauth2Client.setCredentials({
    access_token: tokens?.access_token,
    refresh_token: tokens?.refresh_token,
    expiry_date: tokens?.expiry_date
  });
  
  // Set up automatic token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('Refreshing tokens for user:', uid);
    await db.collection('userTokens').doc(uid).update({
      access_token: newTokens.access_token,
      expiry_date: newTokens.expiry_date,
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });
  });
  
  return oauth2Client;
}


// Google Drive operations - direct integration with Firebase Auth
export const googleDriveOperations = onRequest({ 
  region: 'us-south1',
  timeoutSeconds: 300,
  memory: '512MiB'
}, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { operation, params } = req.body;
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    console.log('Authenticated user:', uid);

    // Get OAuth client with user's tokens
    const oauth2Client = await getOAuthClient(uid);
    
    // Initialize Google APIs
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const docs = google.docs({ version: 'v1', auth: oauth2Client });

    let result;
    switch (operation) {
      case 'list_files': {
        // List Google Docs files
        const response = await drive.files.list({
          q: "mimeType='application/vnd.google-apps.document' and trashed=false",
          spaces: 'drive',
          fields: 'files(id, name, mimeType, createdTime, modifiedTime, webViewLink)',
          pageSize: params?.maxResults || 50,
          orderBy: 'modifiedTime desc'
        });
        
        result = {
          files: response.data.files?.map((file: any) => ({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            createdTime: file.createdTime,
            modifiedTime: file.modifiedTime,
            webViewLink: file.webViewLink,
            isGoogleDoc: file.mimeType === 'application/vnd.google-apps.document'
          })) || []
        };
        break;
      }

      case 'get_document': {
        // Get document content
        const response = await docs.documents.get({
          documentId: params.documentId
        });
        
        // Extract text content from document
        const content = response.data.body?.content?.map((item: any) => {
          if (item.paragraph) {
            const text = item.paragraph.elements?.map((el: any) => 
              el.textRun?.content || ''
            ).join('') || '';
            return { type: 'paragraph', text: text.trim() };
          }
          return { type: 'other', text: '' };
        }).filter((item: any) => item.text) || [];
        
        result = {
          documentId: response.data.documentId,
          title: response.data.title,
          content
        };
        break;
      }

      case 'replace_text': {
        // Replace text in document
        const requests = [{
          replaceAllText: {
            replaceText: params.replaceWithText,
            containsText: {
              text: params.findText || '',
              matchCase: false
            }
          }
        }];
        
        await docs.documents.batchUpdate({
          documentId: params.documentId,
          requestBody: { requests }
        });
        
        result = { 
          documentId: params.documentId, 
          message: 'Text replaced successfully' 
        };
        break;
      }

      case 'create_document': {
        // Create new document
        const response = await docs.documents.create({
          requestBody: {
            title: params.title
          }
        });
        
        result = {
          documentId: response.data.documentId,
          title: response.data.title,
          url: `https://docs.google.com/document/d/${response.data.documentId}/edit`
        };
        break;
      }

      case 'insert_text': {
        // Insert text at specific position
        const requests = [{
          insertText: {
            location: {
              index: params.position || 1
            },
            text: params.text
          }
        }];
        
        await docs.documents.batchUpdate({
          documentId: params.documentId,
          requestBody: { requests }
        });
        
        result = { 
          documentId: params.documentId, 
          message: 'Text inserted successfully' 
        };
        break;
      }

      case 'delete_text': {
        // Delete specific text
        const requests = [{
          deleteContentRange: {
            range: {
              startIndex: params.startIndex || 1,
              endIndex: params.endIndex || 2
            }
          }
        }];
        
        await docs.documents.batchUpdate({
          documentId: params.documentId,
          requestBody: { requests }
        });
        
        result = { 
          documentId: params.documentId, 
          message: 'Text deleted successfully' 
        };
        break;
      }

      default:
        res.status(400).json({ error: 'Unknown operation' });
        return;
    }

    res.json({ result });

  } catch (error: any) {
    console.error('Google Drive operations error:', error);
    
    // Check if it's an OAuth error
    if (error.message?.includes('OAuth tokens not found')) {
      res.status(401).json({ 
        error: 'OAuth tokens not found',
        needsAuth: true,
        message: 'Please sign in with Google again to authorize Drive access'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to perform Google Drive operation',
        details: error.message 
      });
    }
  }
});

// Store OAuth tokens when user signs in with Google
export const storeOAuthTokens = onCall({ 
  region: 'us-south1',
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const { oauthAccessToken, oauthRefreshToken, oauthExpiry } = request.data;
  const uid = request.auth.uid;

  if (!oauthAccessToken) {
    throw new functions.https.HttpsError('invalid-argument', 'OAuth access token is required');
  }

  try {
    const db = admin.firestore();
    await db.collection('userTokens').doc(uid).set({
      access_token: oauthAccessToken,
      refresh_token: oauthRefreshToken || null,
      expiry_date: oauthExpiry || Date.now() + (3600 * 1000), // Default 1 hour
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Stored OAuth tokens for user:', uid);
    return { success: true };
  } catch (error) {
    console.error('Error storing OAuth tokens:', error);
    throw new functions.https.HttpsError('internal', 'Failed to store OAuth tokens');
  }
});

// Exchange OAuth authorization code for tokens
export const exchangeOAuthCode = onRequest({ 
  region: 'us-south1',
  timeoutSeconds: 60,
  memory: '256MiB'
}, async (req, res) => {
  // Set CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { code, redirectUri } = req.body;
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authorization header required' });
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the Firebase ID token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    if (!code) {
      res.status(400).json({ error: 'Authorization code is required' });
      return;
    }

    // Exchange authorization code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      redirectUri || 'https://google-drive-webapp-9xjr.vercel.app'
    );

    const { tokens } = await oauth2Client.getToken(code);
    
    // Store tokens in Firestore
    const db = admin.firestore();
    await db.collection('userTokens').doc(uid).set({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      updated_at: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log('Exchanged OAuth code for tokens for user:', uid);
    res.json({ success: true });

  } catch (error: any) {
    console.error('OAuth code exchange error:', error);
    res.status(500).json({ 
      error: 'Failed to exchange OAuth code',
      details: error.message 
    });
  }
});

