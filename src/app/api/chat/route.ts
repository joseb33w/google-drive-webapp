import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { message, documentContext, chatHistory, idToken, model } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!idToken) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Call Firebase Functions instead of direct OpenAI API
    const firebaseFunctionUrl = 'https://us-south1-try-mcp-15e08.cloudfunctions.net/chatHttp';
    
    const response = await fetch(firebaseFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
    body: JSON.stringify({
      message,
      documentContext,
      chatHistory,
      model: model || 'gpt-5-chat-latest'
    })
    });

    if (!response.ok) {
      throw new Error(`Firebase Function error: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
