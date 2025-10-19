import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import axios from 'axios';
import { onCall, onRequest } from 'firebase-functions/v2/https';

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

// Google Drive operations - proxy to Railway MCP server
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
    const { operation, params, userTokens } = req.body;

    // Map frontend operations to Railway MCP server operations
    let mcpMethod = '';
    let mcpParams = {};

    switch (operation) {
      case 'list_files':
        mcpMethod = 'tools/call';
        mcpParams = {
          name: 'drive_list_files',
          arguments: {
            maxResults: params?.maxResults || 50,
            mimeType: 'application/vnd.google-apps.document'
          }
        };
        break;

      case 'get_document':
        mcpMethod = 'tools/call';
        mcpParams = {
          name: 'docs_get_document',
          arguments: {
            documentId: params.documentId
          }
        };
        break;

      case 'replace_text':
        mcpMethod = 'tools/call';
        mcpParams = {
          name: 'docs_replace_text',
          arguments: {
            documentId: params.documentId,
            findText: params.findText,
            replaceWithText: params.replaceWithText
          }
        };
        break;

      case 'create_document':
        mcpMethod = 'tools/call';
        mcpParams = {
          name: 'docs_create_document',
          arguments: {
            title: params.title
          }
        };
        break;

      default:
        res.status(400).json({ error: 'Unknown operation' });
        return;
    }

    // Proxy request to Railway MCP server
    const response = await axios.post(`${RAILWAY_API_URL}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method: mcpMethod,
      params: mcpParams
    }, {
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': userTokens?.sessionId || 'default'
      }
    });

    // Extract result from MCP response
    const mcpResult = response.data.result;
    if (mcpResult && mcpResult.content && mcpResult.content[0]) {
      const result = JSON.parse(mcpResult.content[0].text);
      res.json({ result });
    } else {
      res.status(500).json({ error: 'Invalid response from MCP server' });
    }

  } catch (error) {
    console.error('Google Drive operations error:', error);
    res.status(500).json({ error: 'Failed to perform Google Drive operation' });
  }
});

// Google OAuth authorization endpoint - proxy to Railway MCP server
export const googleOAuth = onRequest({ 
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

  try {
    if (req.method === 'GET') {
      // Get OAuth URL from Railway MCP server
      const response = await axios.get(`${RAILWAY_API_URL}/auth/google`);
      res.json({ authUrl: response.data.authUrl || `${RAILWAY_API_URL}/auth/google` });
    } else if (req.method === 'POST') {
      // Exchange authorization code for tokens via Railway MCP server
      const { code } = req.body;
      
      if (!code) {
        res.status(400).json({ error: 'Authorization code required' });
        return;
      }

      const response = await axios.post(`${RAILWAY_API_URL}/auth/callback`, { code });
      res.json({ tokens: response.data.tokens });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(500).json({ error: 'OAuth flow failed' });
  }
});

