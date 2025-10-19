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

// Google OAuth credentials - using environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

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
  memory: '512MiB'
}, async (req, res) => {
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

// Google Drive operations - direct integration (bypasses Railway backend)
export const googleDriveOperations = onRequest({ 
  region: 'us-south1',
  timeoutSeconds: 300,
  memory: '512MiB'
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { operation, params, userTokens } = req.body;

    if (!userTokens) {
      res.status(400).json({ error: 'User tokens required' });
      return;
    }

    // Initialize Google APIs with user tokens
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      'postmessage' // For server-to-server communication
    );
    
    oauth2Client.setCredentials(userTokens);
    
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const docs = google.docs({ version: 'v1', auth: oauth2Client });

    let result;

    switch (operation) {
      case 'list_files':
        const filesResponse = await drive.files.list({
          q: "mimeType='application/vnd.google-apps.document'",
          spaces: 'drive',
          fields: 'files(id, name, createdTime, modifiedTime)',
          pageSize: params?.maxResults || 50,
        });
        result = {
          totalFiles: filesResponse.data.files?.length || 0,
          files: filesResponse.data.files?.map((file: any) => ({
            id: file.id,
            name: file.name,
            createdTime: file.createdTime,
            modifiedTime: file.modifiedTime,
            url: `https://docs.google.com/document/d/${file.id}/edit`,
          })) || [],
        };
        break;

      case 'get_document':
        const docResponse = await docs.documents.get({ documentId: params.documentId });
        result = {
          documentId: docResponse.data.documentId,
          title: docResponse.data.title,
          content: docResponse.data.body?.content?.map((item: any) => ({
            type: item.paragraph ? 'paragraph' : 'other',
            text: item.paragraph?.elements?.map((el: any) => el.textRun?.content || '').join('') || '',
          })),
        };
        break;

      case 'replace_text':
        const requests = [{
          replaceAllText: {
            replaceText: params.replaceWithText,
            containsText: { text: params.findText, matchCase: false },
          },
        }];
        await docs.documents.batchUpdate({
          documentId: params.documentId,
          requestBody: { requests },
        });
        result = { documentId: params.documentId, message: 'Text replaced successfully' };
        break;

      case 'create_document':
        const createResponse = await docs.documents.create({
          requestBody: { title: params.title },
        });
        result = {
          documentId: createResponse.data.documentId,
          title: createResponse.data.title,
          url: `https://docs.google.com/document/d/${createResponse.data.documentId}/edit`,
        };
        break;

      default:
        res.status(400).json({ error: 'Unknown operation' });
        return;
    }

    res.json({ result });
  } catch (error) {
    console.error('Google Drive operations error:', error);
    res.status(500).json({ error: 'Failed to perform Google Drive operation' });
  }
});

