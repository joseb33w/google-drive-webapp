import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import OpenAI from 'openai';
import axios from 'axios';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import { google } from 'googleapis';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Firebase Admin
admin.initializeApp();

// Full editing capabilities enabled for AI models

// Initialize AI clients (will be initialized when needed)
let openai: OpenAI;
let anthropic: Anthropic;
let genAI: GoogleGenerativeAI;

function initializeClients() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  if (!anthropic) {
    anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
  }
  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }
}

// Function to fix common JSON formatting issues
function fixCommonJsonIssues(jsonString: string): string {
  try {
    // First, try to parse as-is
    JSON.parse(jsonString);
    return jsonString;
  } catch (e) {
    console.log('Attempting to fix JSON issues...');
    
    let fixed = jsonString.trim();
    
    // Fix 1: Handle unescaped newlines in strings (most common issue with Claude and GPT)
    // Simple approach: replace all literal newlines with escaped newlines when inside strings
    let newlineCount = 0;
    let result = '';
    let inString = false;
    let backslashCount = 0;
    
    for (let i = 0; i < fixed.length; i++) {
      const char = fixed[i];
      
      // Count consecutive backslashes
      if (char === '\\') {
        backslashCount++;
        result += char;
        continue;
      }
      
      // Check if quote is escaped (odd number of backslashes before it)
      if (char === '"') {
        const isEscaped = backslashCount % 2 === 1;
        if (!isEscaped) {
          inString = !inString;
        }
        result += char;
        backslashCount = 0;
        continue;
      }
      
      // Reset backslash count for non-backslash, non-quote chars
      backslashCount = 0;
      
      // If we're inside a string, escape newlines
      if (inString && char === '\n') {
        result += '\\n';
        newlineCount++;
      } else if (inString && char === '\r') {
        result += '\\r';
      } else if (inString && char === '\t') {
        result += '\\t';
      } else {
        result += char;
      }
    }
    
    console.log('Escaped', newlineCount, 'newlines in JSON strings');
    console.log('Final inString state:', inString, '(should be false)');
    
    // If we're still in a string at the end, close it
    if (inString) {
      result += '"';
      console.log('Added closing quote to fix unterminated string');
    }
    
    fixed = result;
    
    // Fix 2: Try to find and close unclosed objects/arrays
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    
    // Add missing closing braces
    for (let i = 0; i < openBraces - closeBraces; i++) {
      fixed += '}';
    }
    
    // Add missing closing brackets
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
      fixed += ']';
    }
    
    // Fix 3: Handle trailing commas
    fixed = fixed.replace(/,(\s*[}\]])/g, '$1');
    
    console.log('Applied JSON fixes, attempting to parse...');
    
    try {
      // Test if the fixed JSON is valid
      JSON.parse(fixed);
      return fixed;
    } catch (e2) {
      console.log('JSON fixes failed, returning original:', e2 instanceof Error ? e2.message : String(e2));
      return jsonString;
    }
  }
}

// Railway API URL - using environment variables
const RAILWAY_API_URL = process.env.RAILWAY_API_URL || 'https://google-mcp-tools-access-production.up.railway.app';

// Individual AI model functions
async function callOpenAI(messages: any[], systemPrompt: string) {
  initializeClients();
  
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages
  ];

  const openaiCompletion = await openai.chat.completions.create({
    model: 'gpt-5-chat-latest',
    messages: fullMessages,
    max_tokens: 1000,
    temperature: 0.7,
  });
  
  return openaiCompletion.choices[0]?.message?.content || 'Sorry, I could not generate a response.';
}

async function callClaude(messages: any[], systemPrompt: string) {
  initializeClients();
  
  // For Claude, we need to include the system prompt in the messages properly
  const claudeMessages = [
    { role: 'user', content: `System: ${systemPrompt}` },
    ...messages.map(msg => ({
      role: msg.role,
      content: msg.content
    }))
  ];
  
  const claudeCompletion = await anthropic.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1000,
    temperature: 0.7,
    messages: claudeMessages
  });
  
  return claudeCompletion.content[0]?.type === 'text' ? claudeCompletion.content[0].text : 'Sorry, I could not generate a response.';
}

async function callGemini(messages: any[], systemPrompt: string) {
  initializeClients();
  
  const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
  const geminiCompletion = await geminiModel.generateContent(
    `${systemPrompt}\n\n${messages.map(m => `${m.role}: ${m.content}`).join('\n')}`
  );
  
  return geminiCompletion.response.text() || 'Sorry, I could not generate a response.';
}

// Main AI model router function
async function callAIModel(model: string, messages: any[], systemPrompt: string) {
  switch (model) {
    case 'gpt-5-chat-latest':
      return await callOpenAI(messages, systemPrompt);
    case 'claude-4.5-sonnet':
      return await callClaude(messages, systemPrompt);
    case 'gemini-2.5-pro':
      return await callGemini(messages, systemPrompt);
    default:
      throw new Error(`Unsupported model: ${model}`);
  }
}

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

  // Log successful initialization for debugging
  console.log('AI client initialized successfully');

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { message, documentContext, chatHistory, model } = req.body;

    if (!message) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Build the system prompt
    let systemPrompt = `You are an advanced AI editor similar to Cursor with FULL document and spreadsheet editing capabilities.

EDITING CAPABILITIES:
You can perform ANY of these operations on documents and spreadsheets:

DOCUMENT OPERATIONS:
- "replace": Find and replace specific text (for small targeted changes)
- "insert": Add new text at a specific location
- "delete": Remove specific text
- "rewrite": COMPLETELY REWRITE the entire document (for major restructuring or full rewrites)

SPREADSHEET OPERATIONS:
- "update_cell": Update a specific cell value (e.g., A1, B2, etc.)
- "update_range": Update multiple cells in a range (e.g., A1:C3)
- "insert_row": Insert a new row at a specific position
- "insert_column": Insert a new column at a specific position
- "delete_row": Delete a specific row
- "delete_column": Delete a specific column
- "update_formula": Update or add formulas to cells
- "format_cell": Apply formatting to cells (bold, italic, color, etc.)

WHEN TO USE EACH TYPE:
DOCUMENT EDITS:
- Use "replace" for small, targeted changes to existing text
- Use "insert" to add new content at the end or middle of document
- Use "delete" to remove specific sections
- Use "rewrite" when you need to:
  * Completely restructure the document
  * Rewrite the entire document from scratch
  * Make major organizational changes
  * Change the document's overall structure or flow
  * Transform the document's format or style completely

SPREADSHEET EDITS:
- Use "update_cell" for single cell changes
- Use "update_range" for updating multiple related cells
- Use "insert_row"/"insert_column" to add new data structure
- Use "delete_row"/"delete_column" to remove data
- Use "update_formula" for calculations and data analysis
- Use "format_cell" for visual improvements

PRECISION REQUIREMENTS:
- For "replace" edits: Include 2-3 words of surrounding context for unique matching
- For "rewrite" edits: Provide the COMPLETE new document content
- Score confidence: high (unique match), medium (2-3 matches), low (many matches)
- Provide reasoning explaining your approach
- Analyze document structure before suggesting edits

CRITICAL CONTENT REQUIREMENTS:
- NEVER use computer programming language, technical jargon, or code-related terms
- Use natural, human language appropriate for the document context
- Avoid terms like "protocol", "source code", "algorithm", "system", "program", "function", "implementation", "execute", "process", "data"
- Write in the same style and tone as the existing document
- Focus on narrative, descriptive, and human-centered language
- Write clean, natural paragraphs with proper spacing between them
- Do NOT use markdown formatting like # or ## - this is a Google Doc, not markdown
- Do NOT include technical notation like \\n or \\t - write natural, readable text
- Ensure the content flows naturally and is well-structured
- Use clear paragraph breaks for readability

CRITICAL FORMATTING REQUIREMENTS:
- NEVER use literal \\n\\n sequences in your text - these will appear as text in the document
- Write natural paragraph breaks by simply pressing Enter between paragraphs
- Structure your content with proper headings, subheadings, and paragraph organization
- Use proper sentence structure and complete thoughts
- ALWAYS finish your complete thoughts - never leave sentences or paragraphs incomplete
- Ensure every section has a proper conclusion
- Write complete, coherent paragraphs that flow logically from one to the next
- For historical content, organize chronologically with clear time periods
- For complex topics, break into logical sections with clear transitions

CRITICAL JSON FORMATTING REQUIREMENTS:
- ALWAYS return valid JSON - no unterminated strings, no unescaped quotes
- Escape all quotes inside string values with backslashes (\\")
- For newContent in rewrite operations: Use actual line breaks (not \\n sequences) for paragraph separation
- For findText and replaceText: Use actual line breaks (not \\n sequences) for natural text
- Escape all carriage returns with \\\\r and tabs with \\\\t
- Ensure all JSON objects and arrays are properly closed
- NO trailing commas before closing braces or brackets
- Test your JSON before responding - it MUST be parseable
- IMPORTANT: When writing document content, use real paragraph breaks, not \\n\\n sequences

JSON VALIDATION CHECKLIST:
1. Every opening brace { has a closing brace }
2. Every opening bracket [ has a closing bracket ]
3. Every string starts and ends with quotes
4. All quotes inside strings are escaped with \\
5. All newlines inside strings are escaped as \\\\n
6. No trailing commas before } or ]
7. The entire response is valid JSON

Return JSON format for TARGETED EDITS (replace/insert/delete):
{
  "response": "Brief explanation of what you're changing and why",
  "edit": {
    "type": "replace" | "insert" | "delete",
    "findText": "context before TARGET TEXT context after",
    "replaceText": "new text",
    "confidence": "high" | "medium" | "low",
    "reasoning": "Why this specific text was chosen and how it fits the context"
  }
}

Return JSON format for COMPLETE REWRITES:
{
  "response": "Brief explanation of what you're changing and why",
  "edit": {
    "type": "rewrite",
    "newContent": "THE COMPLETE NEW DOCUMENT CONTENT WITH ALL TEXT - MUST BE COMPLETE AND FINISHED",
    "confidence": "high",
    "reasoning": "Why a complete rewrite is needed and how it improves the document"
  }
}

Return JSON format for SPREADSHEET OPERATIONS:

For updating a single cell:
{
  "response": "Brief explanation of what you're changing and why",
  "edit": {
    "type": "update_cell",
    "cell": "A1",
    "value": "new value",
    "confidence": "high",
    "reasoning": "Why this cell needs to be updated"
  }
}

For updating a range of cells:
{
  "response": "Brief explanation of what you're changing and why",
  "edit": {
    "type": "update_range",
    "range": "A1:C3",
    "values": [["Header1", "Header2", "Header3"], ["Data1", "Data2", "Data3"], ["Data4", "Data5", "Data6"]],
    "confidence": "high",
    "reasoning": "Why this range needs to be updated"
  }
}

For updating cells with cross-sheet formulas:
{
  "response": "Adding formulas that reference other sheets for dynamic data",
  "edit": {
    "type": "update_range",
    "range": "A1:D3",
    "values": [["Product", "Units Sold", "Price", "Revenue"], ["Laptop Pro", "='Sheet1'!B5", "1499.99", "=B2*C2"], ["Mouse", "='Sheet1'!C5", "49.99", "=B3*C3"]],
    "confidence": "high",
    "reasoning": "Using proper sheet reference syntax with single quotes around ALL sheet names"
  }
}

IMPORTANT: Before creating any formulas, check the "Available Sheets" in the spreadsheet context. For example:
- If context shows "Available Sheets: Sheet1, INVENTORY" → Use 'Sheet1' and 'INVENTORY' in formulas
- If context shows "Available Sheets: Summary" → Use 'Summary' in formulas  
- If context shows "Available Sheets: Sheet1" → Use 'Sheet1' in formulas
- NEVER use sheet names that are not listed in the available sheets

SAFE FORMULA STRATEGY:
- If you see multiple sheets available, you can use cross-sheet formulas
- If you see only one sheet or no sheet list, use static values instead of formulas
- When in doubt, use static calculated values rather than formulas that might fail
- Example: Instead of =SUM('Sheet1'!A:A), use a calculated value like 15000 if you know the total

CRITICAL: PREFER STATIC VALUES OVER COMPLEX FORMULAS:
- If you can calculate the result manually, use a static value instead of a formula
- Static values are more reliable than formulas that might reference non-existent data
- Example: If you know the total revenue is 15000, use "15000" instead of =SUM('Sheet1'!A:A)
- Only use formulas when you're 100% certain the referenced cells exist and contain data

FORMULA STRATEGY GUIDE:
WHEN TO USE DIFFERENT EXCEL FUNCTIONS:

1. BASIC CALCULATIONS (Use these first):
   - SUM: For adding numbers =SUM(A1:A10)
   - AVERAGE: For finding averages =AVERAGE(B1:B10)
   - COUNT: For counting items =COUNT(C1:C10)
   - Simple arithmetic: =A1+B1, =A1/B1, =A1*B1

2. CONDITIONAL LOGIC (When you need IF statements):
   - IF: For conditional results =IF(A1>100, "High", "Low")
   - AND/OR: For multiple conditions =AND(A1>0, B1>0)

3. DATA ANALYSIS (When analyzing existing data):
   - COUNTIF: Count cells meeting criteria =COUNTIF(A1:A10, ">100")
   - SUMIF: Sum cells meeting criteria =SUMIF(A1:A10, ">100", B1:B10)
   - MAX/MIN: Find highest/lowest values =MAX(D1:D10)

4. CROSS-SHEET OPERATIONS (When referencing other sheets):
   - Always use single quotes: =SUM('Sheet1'!A1:A10)
   - Validate sheet exists in "Available Sheets" first
   - Use specific ranges, not entire columns

5. TEXT OPERATIONS (When working with text data):
   - CONCATENATE: Join text =CONCATENATE(A1, " ", B1)
   - LEFT/RIGHT: Extract characters =LEFT(A1, 5)
   - LEN: Get text length =LEN(A1)

6. DATE/TIME (When working with dates):
   - TODAY: Current date =TODAY()
   - NOW: Current date/time =NOW()
   - DATE: Create dates =DATE(2025, 10, 23)

DATA VALIDATION BEFORE FORMULAS:
- ALWAYS check the "Current Data" section to see what data actually exists
- If you see "Row 1: Header1 | Header2 | Header3", then columns A, B, C have data
- If you see "Row 2: Value1 | Value2 | Value3", then you can reference A2, B2, C2
- NEVER reference cells beyond the data shown in the context
- If you need to sum column A and see data in A1, A2, A3, use =SUM(A1:A3) not =SUM(A:A)
- If you see "Available Sheets: Sheet1, INVENTORY" and need data from INVENTORY, use ='INVENTORY'!A1

// Updated: Enhanced formula validation for google-drive-webapp-9xjr deployment

For updating cells with COUNTIF and other functions referencing other sheets:
{
  "response": "Adding COUNTIF formulas to count items from other sheets",
  "edit": {
    "type": "update_cell",
    "cell": "B8",
    "value": "=COUNTIF('INVENTORY'!F:F, \"Reorder\")",
    "confidence": "high",
    "reasoning": "Using single quotes around sheet name INVENTORY in COUNTIF function"
  }
}

For using static values when cross-sheet formulas might fail:
{
  "response": "Adding calculated financial summary with static values for reliability",
  "edit": {
    "type": "update_cell",
    "cell": "B5",
    "value": "15000",
    "confidence": "high",
    "reasoning": "Using static value instead of formula to prevent reference errors"
  }
}

For working with actual spreadsheet data (based on context):
{
  "response": "Adding formula based on actual data shown in spreadsheet context",
  "edit": {
    "type": "update_cell",
    "cell": "B6",
    "value": "=SUM(A1:A3)",
    "confidence": "high",
    "reasoning": "Using specific range A1:A3 based on data shown in context, not entire column"
  }
}

For creating working formulas with real data:
{
  "response": "Creating formula that references actual data from the spreadsheet context",
  "edit": {
    "type": "update_cell",
    "cell": "C8",
    "value": "=B6/B7",
    "confidence": "high",
    "reasoning": "Simple division formula using cells that contain actual data from the context"
  }
}

For cross-sheet formulas with validation:
{
  "response": "Adding cross-sheet formula with proper sheet validation",
  "edit": {
    "type": "update_cell",
    "cell": "D10",
    "value": "=SUM('Sheet1'!B1:B5)",
    "confidence": "high",
    "reasoning": "Using specific range B1:B5 from Sheet1 (which exists in Available Sheets) with proper single quotes"
  }
}

For business calculations using Excel functions:
{
  "response": "Adding business calculation using Excel functions",
  "edit": {
    "type": "update_cell",
    "cell": "E5",
    "value": "=IF(SUM(B1:B4)>1000, \"High Volume\", \"Low Volume\")",
    "confidence": "high",
    "reasoning": "Using IF function with SUM to categorize based on total volume"
  }
}

For financial analysis formulas:
{
  "response": "Adding financial analysis with Excel functions",
  "edit": {
    "type": "update_cell",
    "cell": "F8",
    "value": "=ROUND(AVERAGE(C1:C10), 2)",
    "confidence": "high",
    "reasoning": "Using AVERAGE and ROUND functions for precise financial calculations"
  }
}

For data lookup operations:
{
  "response": "Adding lookup formula for data analysis",
  "edit": {
    "type": "update_cell",
    "cell": "G12",
    "value": "=COUNTIF('INVENTORY'!F1:F20, \"Reorder\")",
    "confidence": "high",
    "reasoning": "Using COUNTIF to count items needing reorder from INVENTORY sheet"
  }
}

For updating ranges with correct column count (CRITICAL):
{
  "response": "Updating summary data with proper range validation",
  "edit": {
    "type": "update_range",
    "range": "A1:D10",
    "values": [
      ["Header1", "Header2", "Header3", "Header4"],
      ["Data1", "Data2", "Data3", "Data4"],
      ["Data5", "Data6", "Data7", "Data8"]
    ],
    "confidence": "high",
    "reasoning": "Range A1:D10 has 4 columns (A,B,C,D), so each row has exactly 4 values"
  }
}

CRITICAL RANGE VALIDATION: When using "update_range", ensure the range EXACTLY matches your data dimensions:
- COUNT YOUR COLUMNS: If your data has 4 columns, use range like "A1:D10" (A, B, C, D = 4 columns)
- COUNT YOUR ROWS: If your data has 10 rows, use range like "A1:D10" (rows 1-10)
- NEVER exceed the range: If range is "A1:D10", your data can only have 4 columns (A, B, C, D)
- CHECK EACH ROW: Every row in your values array must have the same number of columns
- Example: If range is "A1:D10", each row must have exactly 4 values: ["col1", "col2", "col3", "col4"]
- If you need 5 columns, change range to "A1:E10" (A, B, C, D, E = 5 columns)

CROSS-SHEET FORMULAS: When referencing other sheets in formulas, use the correct syntax:
- To reference a cell from another sheet: ='SheetName'!A1 (use single quotes around sheet name)
- To reference a range from another sheet: ='SheetName'!A1:B10
- For functions with sheet references: =SUM('Sheet1'!A1:A10) or =COUNTIF('INVENTORY'!F:F, "Reorder")
- ALWAYS use single quotes around sheet names, even in function arguments
- Sheet names with spaces MUST be quoted: ='My Sheet'!A1
- Sheet names without spaces should STILL be quoted for consistency: ='INVENTORY'!F:F

CRITICAL: ALL sheet references in formulas MUST use single quotes around the sheet name:
✅ CORRECT: =SUM('Sheet1'!D:D)
✅ CORRECT: =COUNTIF('INVENTORY'!F:F, "Reorder")
✅ CORRECT: ='Sheet1'!B5
❌ WRONG: =SUM(Sheet1!D:D)
❌ WRONG: =COUNTIF(INVENTORY!F:F, "Reorder")
❌ WRONG: =Sheet1!B5

This is MANDATORY - Google Sheets requires single quotes around sheet names in cross-sheet references.

FORMULA PRECISION RULES:
- ALWAYS use specific cell ranges instead of entire columns (e.g., use A1:A10 instead of A:A)
- When referencing other sheets, use the EXACT sheet names from "Available Sheets"
- For calculations, use simple formulas first, then complex ones
- If you see data in the context, reference the actual cells that contain data
- Example: If context shows "Row 1: Revenue | 1000 | 2000", use =SUM(B1:C1) not =SUM(B:B)
- NEVER use entire column references (A:A, B:B) unless you're certain the column has data
- Use specific ranges based on the actual data shown in the spreadsheet context

EXCEL FUNCTIONS REFERENCE (Based on Microsoft Excel Functions):
COMMON MATHEMATICAL FUNCTIONS:
- SUM(range): Adds all numbers in a range =SUM(A1:A10)
- AVERAGE(range): Returns average of numbers =AVERAGE(B1:B10)
- COUNT(range): Counts numbers in range =COUNT(C1:C10)
- MAX(range): Returns largest value =MAX(D1:D10)
- MIN(range): Returns smallest value =MIN(E1:E10)
- ROUND(number, digits): Rounds to specified digits =ROUND(F1, 2)

LOGICAL FUNCTIONS:
- IF(condition, true_value, false_value): Conditional logic =IF(A1>100, "High", "Low")
- AND(condition1, condition2): Returns TRUE if all conditions true =AND(A1>0, B1>0)
- OR(condition1, condition2): Returns TRUE if any condition true =OR(A1>100, B1>100)

LOOKUP FUNCTIONS:
- VLOOKUP(value, table, column, exact): Vertical lookup =VLOOKUP(A1, Sheet1!A:C, 3, FALSE)
- HLOOKUP(value, table, row, exact): Horizontal lookup =HLOOKUP(A1, Sheet1!1:3, 2, FALSE)
- INDEX(array, row, column): Returns value at intersection =INDEX(A1:C10, 2, 3)
- MATCH(value, array, type): Returns position of value =MATCH(A1, B1:B10, 0)

TEXT FUNCTIONS:
- CONCATENATE(text1, text2): Joins text =CONCATENATE(A1, " ", B1)
- LEFT(text, num_chars): Returns left characters =LEFT(A1, 5)
- RIGHT(text, num_chars): Returns right characters =RIGHT(A1, 5)
- LEN(text): Returns text length =LEN(A1)

DATE/TIME FUNCTIONS:
- TODAY(): Returns current date =TODAY()
- NOW(): Returns current date and time =NOW()
- DATE(year, month, day): Creates date =DATE(2025, 10, 23)
- YEAR(date): Extracts year =YEAR(A1)

STATISTICAL FUNCTIONS:
- COUNTIF(range, criteria): Counts cells meeting criteria =COUNTIF(A1:A10, ">100")
- SUMIF(range, criteria, sum_range): Sums cells meeting criteria =SUMIF(A1:A10, ">100", B1:B10)
- AVERAGEIF(range, criteria, average_range): Averages cells meeting criteria =AVERAGEIF(A1:A10, ">100", B1:B10)

CRITICAL FORMULA VALIDATION:
- ONLY reference sheets that are listed in "Available Sheets" in the spreadsheet context
- ONLY reference cells that exist in the current spreadsheet structure
- If you see "Available Sheets: Sheet1, INVENTORY" then ONLY use 'Sheet1' and 'INVENTORY' in formulas
- If you see "Available Sheets: Summary" then ONLY use 'Summary' in formulas
- NEVER reference sheets that are not listed in the available sheets
- NEVER reference cells outside the grid size shown in the context
- If you're unsure about available data, use simple formulas or ask for clarification

FORMULA ERROR PREVENTION:
- Before creating ANY formula, check the "Available Sheets" list in the context
- If no sheets are listed or only one sheet exists, use simple calculations without cross-sheet references
- If you see "Available Sheets: [sheet names]", ONLY use those exact sheet names in formulas
- Use absolute cell references (like $A$1) when possible to prevent reference errors
- Test formulas with simple values first before using complex cross-sheet references
- If cross-sheet formulas fail, fall back to static values or simple calculations

For inserting a row:
{
  "response": "Brief explanation of what you're changing and why",
  "edit": {
    "type": "insert_row",
    "position": 2,
    "values": ["New", "Row", "Data"],
    "confidence": "high",
    "reasoning": "Why a new row is needed at this position"
  }
}

For inserting a column:
{
  "response": "Brief explanation of what you're changing and why",
  "edit": {
    "type": "insert_column",
    "position": 1,
    "values": ["New", "Column", "Data"],
    "confidence": "high",
    "reasoning": "Why a new column is needed at this position"
  }
}

For updating formulas:
{
  "response": "Brief explanation of what you're changing and why",
  "edit": {
    "type": "update_formula",
    "cell": "C1",
    "formula": "=A1+B1",
    "confidence": "high",
    "reasoning": "Why this formula is needed"
  }
}

COMPLETION REQUIREMENTS:
- ALWAYS write complete, finished content - never leave sentences or thoughts incomplete
- For historical topics: Cover the full timeline from beginning to end
- For complex subjects: Address all major aspects and provide proper conclusions
- Ensure every paragraph has a complete thought and proper ending
- Write with proper document structure: introduction, main content, conclusion
- Use clear transitions between sections and paragraphs
- Never cut off mid-sentence or mid-thought

For non-edit requests, respond with plain text.`;

    if (documentContext) {
      systemPrompt += `\n\nCurrent document context:
- Document ID: ${documentContext.id}
- Document Name: ${documentContext.name}
- Document Type: ${documentContext.mimeType || 'Unknown'}`;
      
      if (documentContext.mimeType === 'application/vnd.google-apps.document') {
        systemPrompt += `\n- Content: ${documentContext.content || 'No content available'}`;
      } else if (documentContext.mimeType === 'application/vnd.google-apps.spreadsheet' && documentContext.spreadsheetData) {
        systemPrompt += `\n- Spreadsheet Data:
  * Current Sheet: ${documentContext.spreadsheetData.sheetTitle} (ID: ${documentContext.spreadsheetData.sheetId})
  * Grid Size: ${documentContext.spreadsheetData.gridProperties?.rowCount || 'Unknown'} rows × ${documentContext.spreadsheetData.gridProperties?.columnCount || 'Unknown'} columns
  * Available Sheets: ${documentContext.spreadsheetData.allSheets?.map((s: any) => s.title).join(', ') || 'Unknown'}
  * Current Data (first 10 rows):`;
        
        // Include first 10 rows of spreadsheet data for context
        if (documentContext.spreadsheetData.rows && documentContext.spreadsheetData.rows.length > 0) {
          const displayRows = documentContext.spreadsheetData.rows.slice(0, 10);
          displayRows.forEach((row: any, index: number) => {
            const rowData = row.map((cell: any) => cell || '').join(' | ');
            systemPrompt += `\n    Row ${index + 1}: ${rowData}`;
          });
        } else {
          systemPrompt += `\n    No data found in current sheet`;
        }
      }
    }

    // Build the conversation history (without system message)
    const messages: any[] = [];

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

    // Call AI model using the unified handler
    const selectedModel = model || 'gpt-5-chat-latest';
    console.log('Calling AI model:', selectedModel);
    console.log('System prompt:', systemPrompt.substring(0, 200) + '...');
    console.log('User message:', message);
    
    const response = await callAIModel(selectedModel, messages, systemPrompt);
    console.log('AI Response length:', response.length, 'characters');
    console.log('AI Response preview:', response.substring(0, 200) + '...');

    // Try to parse JSON response for edit proposals
    let parsedResponse;
    try {
      // Clean the response by extracting JSON from markdown code blocks
      let cleanResponse = response.trim();
      
      // Look for JSON within markdown code blocks
      const jsonMatch = cleanResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        cleanResponse = jsonMatch[1];
      } else if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }
      
      // Apply JSON fixes BEFORE trying to parse
      console.log('Clean response length before fix:', cleanResponse.length);
      console.log('Clean response preview:', cleanResponse.substring(0, 300));
      cleanResponse = fixCommonJsonIssues(cleanResponse);
      console.log('Clean response length after fix:', cleanResponse.length);
      
      parsedResponse = JSON.parse(cleanResponse);
      console.log('Parsed JSON successfully');
      
      // If it's a valid JSON with edit structure, return it
      if (parsedResponse.response && parsedResponse.edit) {
        console.log('Returning edit proposal');
        res.json(parsedResponse);
        return;
      }
    } catch (e) {
      console.log('JSON parsing failed:', e instanceof Error ? e.message : String(e));
      console.log('Attempting aggressive fix...');
      
      // Try aggressive fix with better newContent handling
      try {
        let aggressiveFix = response.trim();
        
        // Remove markdown code blocks
        aggressiveFix = aggressiveFix.replace(/```json\s*/g, '').replace(/```\s*$/g, '');
        
        // Find the first { and last } to extract just the JSON part
        const firstBrace = aggressiveFix.indexOf('{');
        const lastBrace = aggressiveFix.lastIndexOf('}');
        
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          aggressiveFix = aggressiveFix.substring(firstBrace, lastBrace + 1);
          
          // Apply aggressive JSON fixes
          aggressiveFix = fixCommonJsonIssues(aggressiveFix);
          
          parsedResponse = JSON.parse(aggressiveFix);
          console.log('Aggressive fix succeeded');
          
          if (parsedResponse.response && parsedResponse.edit) {
            console.log('Returning edit proposal from aggressive fix');
            res.json(parsedResponse);
            return;
          }
        }
      } catch (aggressiveError) {
        console.log('Aggressive fix failed:', aggressiveError instanceof Error ? aggressiveError.message : String(aggressiveError));
      }
      
      // Not JSON, continue with normal text response
    }

    // Return normal text response
    console.log('Returning plain text response');
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
  
  // Validate that we have the required tokens
  if (!tokens?.access_token) {
    throw new Error('Access token not found. Please sign in with Google again.');
  }
  
  if (!tokens?.refresh_token) {
    throw new Error('Refresh token not found. Please sign in with Google again to get a new refresh token.');
  }
  
  // Create OAuth2 client
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    'https://google-drive-webapp-9xjr-cfywzqbha-knight-s-projects-9ddc5f2b.vercel.app'
  );
  
  oauth2Client.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date
  });
  
  // Set up automatic token refresh
  oauth2Client.on('tokens', async (newTokens) => {
    console.log('Refreshing tokens for user:', uid);
    try {
      await db.collection('userTokens').doc(uid).update({
        access_token: newTokens.access_token,
        expiry_date: newTokens.expiry_date,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });
      console.log('Tokens refreshed successfully for user:', uid);
    } catch (error) {
      console.error('Failed to update refreshed tokens:', error);
    }
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
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

    let result;
    switch (operation) {
      case 'list_files': {
        // List Google Docs and Sheets files
        const response = await drive.files.list({
          q: "(mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.google-apps.spreadsheet') and trashed=false",
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
            isGoogleDoc: file.mimeType === 'application/vnd.google-apps.document',
            isGoogleSheet: file.mimeType === 'application/vnd.google-apps.spreadsheet'
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

      case 'rewrite_document': {
        // Complete document rewrite - delete all content and insert new content
        // Fixed: Handle empty documents correctly (endIndex > 2 check prevents empty range error)
        const doc = await docs.documents.get({
          documentId: params.documentId
        });
        
        // Get the full document length (end index)
        const endIndex = doc.data.body?.content?.reduce((max: number, item: any) => {
          if (item.endIndex && item.endIndex > max) {
            return item.endIndex;
          }
          return max;
        }, 1) || 1;
        
        // Create batch update: delete all content, then insert new content
        const requests = [];
        
        // Only delete content if document has meaningful content
        // endIndex > 2 means there's more than just the final newline
        // Google Docs always has at least 1 character (the final newline at index 1)
        if (endIndex > 2) {
          requests.push({
            deleteContentRange: {
              range: {
                startIndex: 1,
                endIndex: endIndex - 1 // Don't delete the final newline
              }
            }
          });
        }
        
        // Always insert the new content
        requests.push({
          insertText: {
            location: {
              index: 1
            },
            text: params.newContent
          }
        });
        
        await docs.documents.batchUpdate({
          documentId: params.documentId,
          requestBody: { requests }
        });
        
        result = { 
          documentId: params.documentId, 
          message: 'Document rewritten successfully' 
        };
        break;
      }

      case 'get_sheet': {
        // Get spreadsheet content - Google Sheets integration is now live!
        const response = await sheets.spreadsheets.get({
          spreadsheetId: params.documentId,
          includeGridData: true
        });

        // Extract all sheet metadata
        const sheetMetadata = response.data.sheets?.map(sheet => ({
          sheetId: sheet.properties?.sheetId,
          title: sheet.properties?.title,
          index: sheet.properties?.index,
          gridProperties: {
            rowCount: sheet.properties?.gridProperties?.rowCount,
            columnCount: sheet.properties?.gridProperties?.columnCount
          }
        }));

        // Extract data from requested sheet (first sheet if not specified)
        const targetSheet = params.sheetId 
          ? response.data.sheets?.find(s => s.properties?.sheetId === params.sheetId)
          : response.data.sheets?.[0];
        
        const gridData = targetSheet?.data?.[0];
        
        if (!gridData) {
          result = {
            documentId: params.documentId,
            title: response.data.properties?.title || 'Untitled Spreadsheet',
            sheets: sheetMetadata,
            activeSheet: {
              sheetId: targetSheet?.properties?.sheetId,
              title: targetSheet?.properties?.title,
              rows: [],
              gridProperties: targetSheet?.properties?.gridProperties
            },
            error: 'No data found in spreadsheet'
          };
          break;
        }

        // Convert grid data to 2D array
        const rows = gridData.rowData?.map(row => {
          const cells = row.values || [];
          return cells.map(cell => 
            cell.formattedValue || cell.userEnteredValue?.stringValue || ''
          );
        }) || [];

        result = {
          documentId: params.documentId,
          title: response.data.properties?.title || 'Untitled Spreadsheet',
          sheets: sheetMetadata,
          activeSheet: {
            sheetId: targetSheet?.properties?.sheetId,
            title: targetSheet?.properties?.title,
            rows: rows,
            gridProperties: targetSheet?.properties?.gridProperties
          }
        };
        break;
      }

      case 'update_sheet': {
        // Update spreadsheet content
        const { range, values } = params;
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: params.documentId,
          range: range || 'A1',
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: values
          }
        });

        result = {
          documentId: params.documentId,
          message: 'Spreadsheet updated successfully'
        };
        break;
      }

      case 'create_sheet': {
        // Create new spreadsheet
        const response = await sheets.spreadsheets.create({
          requestBody: {
            properties: {
              title: params.title || 'New Spreadsheet'
            }
          }
        });

        result = {
          documentId: response.data.spreadsheetId,
          title: response.data.properties?.title || 'New Spreadsheet',
          url: `https://docs.google.com/spreadsheets/d/${response.data.spreadsheetId}/edit`
        };
        break;
      }

      case 'update_cell': {
        // Update a single cell
        const { cell, value } = params;
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: params.documentId,
          range: cell,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [[value]]
          }
        });

        result = {
          documentId: params.documentId,
          message: `Cell ${cell} updated successfully`
        };
        break;
      }

      case 'update_range': {
        // Update a range of cells
        const { range, values } = params;
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: params.documentId,
          range: range,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: values
          }
        });

        result = {
          documentId: params.documentId,
          message: `Range ${range} updated successfully`
        };
        break;
      }

      case 'insert_row': {
        // Insert a new row
        const { position, values } = params;
        
        // First, insert the row
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: params.documentId,
          requestBody: {
            requests: [{
              insertDimension: {
                range: {
                  sheetId: params.sheetId || 0,
                  dimension: 'ROWS',
                  startIndex: position - 1,
                  endIndex: position
                }
              }
            }]
          }
        });

        // Then, if values are provided, update the new row
        if (values && values.length > 0) {
          const rowRange = `${String.fromCharCode(65)}${position}:${String.fromCharCode(65 + values.length - 1)}${position}`;
          await sheets.spreadsheets.values.update({
            spreadsheetId: params.documentId,
            range: rowRange,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: [values]
            }
          });
        }

        result = {
          documentId: params.documentId,
          message: `Row inserted at position ${position} successfully`
        };
        break;
      }

      case 'insert_column': {
        // Insert a new column
        const { position, values } = params;
        
        // First, insert the column
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: params.documentId,
          requestBody: {
            requests: [{
              insertDimension: {
                range: {
                  sheetId: params.sheetId || 0,
                  dimension: 'COLUMNS',
                  startIndex: position - 1,
                  endIndex: position
                }
              }
            }]
          }
        });

        // Then, if values are provided, update the new column
        if (values && values.length > 0) {
          const columnLetter = String.fromCharCode(65 + position - 1);
          const columnRange = `${columnLetter}1:${columnLetter}${values.length}`;
          await sheets.spreadsheets.values.update({
            spreadsheetId: params.documentId,
            range: columnRange,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
              values: values.map((value: any) => [value])
            }
          });
        }

        result = {
          documentId: params.documentId,
          message: `Column inserted at position ${position} successfully`
        };
        break;
      }

      case 'delete_row': {
        // Delete a row
        const { position } = params;
        
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: params.documentId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: params.sheetId || 0,
                  dimension: 'ROWS',
                  startIndex: position - 1,
                  endIndex: position
                }
              }
            }]
          }
        });

        result = {
          documentId: params.documentId,
          message: `Row ${position} deleted successfully`
        };
        break;
      }

      case 'delete_column': {
        // Delete a column
        const { position } = params;
        
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: params.documentId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: {
                  sheetId: params.sheetId || 0,
                  dimension: 'COLUMNS',
                  startIndex: position - 1,
                  endIndex: position
                }
              }
            }]
          }
        });

        result = {
          documentId: params.documentId,
          message: `Column ${position} deleted successfully`
        };
        break;
      }

      case 'update_formula': {
        // Update or add a formula to a cell
        const { cell, formula } = params;
        
        await sheets.spreadsheets.values.update({
          spreadsheetId: params.documentId,
          range: cell,
          valueInputOption: 'USER_ENTERED', // Use USER_ENTERED for formulas
          requestBody: {
            values: [[formula]]
          }
        });

        result = {
          documentId: params.documentId,
          message: `Formula added to cell ${cell} successfully`
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
    } else if (error.message?.includes('No refresh token is set')) {
      res.status(401).json({ 
        error: 'Refresh token missing',
        needsAuth: true,
        message: 'Please sign in with Google again to get a new refresh token'
      });
    } else if (error.message?.includes('Refresh token not found')) {
      res.status(401).json({ 
        error: 'Refresh token not found',
        needsAuth: true,
        message: 'Please sign in with Google again to get a new refresh token'
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to perform Google Drive operation',
        details: error.message 
      });
    }
  }
});

// Clear OAuth tokens for re-authorization
export const clearOAuthTokens = onCall({ 
  region: 'us-south1',
  timeoutSeconds: 30,
  memory: '256MiB'
}, async (request) => {
  // Verify user is authenticated
  if (!request.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }

  const uid = request.auth.uid;
  const db = admin.firestore();
  
  try {
    // Delete user's OAuth tokens
    await db.collection('userTokens').doc(uid).delete();
    console.log('Cleared OAuth tokens for user:', uid);
    return { success: true };
  } catch (error: any) {
    console.error('Error clearing OAuth tokens:', error);
    throw new functions.https.HttpsError('internal', 'Failed to clear OAuth tokens');
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
      redirectUri || 'https://google-drive-webapp-9xjr-cfywzqbha-knight-s-projects-9ddc5f2b.vercel.app'
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

