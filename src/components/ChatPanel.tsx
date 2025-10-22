'use client';

import { useState, useRef, useEffect } from 'react';
import { File, Message, DocumentContent, DocumentContentItem } from '@/types';
import { ErrorToast, useErrorToast } from './ErrorToast';

interface EditProposal {
  messageId: string;
  type: string;
  findText: string;
  replaceText: string;
}

interface ChatPanelProps {
  selectedFile: File | null;
  documentContent: DocumentContent | null;
  chatHistory: Message[];
  onChatUpdate: (messages: Message[]) => void;
  onEditProposal: (edit: EditProposal) => void;
  onAcceptEdit: (messageId: string) => void;
  onRejectEdit: (messageId: string) => void;
  selectedModel: string;
  onModelChange: (model: string) => void;
  isApplyingEdit?: boolean;
}

export default function ChatPanel({ selectedFile, documentContent, chatHistory, onChatUpdate, onEditProposal, onAcceptEdit, onRejectEdit, selectedModel, onModelChange, isApplyingEdit = false }: ChatPanelProps) {
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toasts, addToast, removeToast } = useErrorToast();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage,
      timestamp: new Date(),
    };

    const newMessages = [...chatHistory, userMessage];
    onChatUpdate(newMessages);
    setInputMessage('');
    setIsLoading(true);

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // Get Firebase ID token for authentication
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        throw new Error('User not authenticated');
      }

      const idToken = await user.getIdToken();

      // Send message to OpenAI API
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: inputMessage,
          documentContext: selectedFile && documentContent ? {
            id: selectedFile.id,
            name: selectedFile.name,
            content: documentContent.content?.map((item: DocumentContentItem) => item.text).join('\n') || 'No content available'
          } : null,
          chatHistory: newMessages.slice(-10), // Send last 10 messages for context
          idToken: idToken, // Pass ID token to API route
          model: selectedModel // Pass selected model
        }),
        signal: abortControllerRef.current.signal // Add abort signal
      });

      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }

      const data = await response.json();
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response,
        timestamp: new Date(),
      };

      // Check if this is an edit proposal
      if (data.edit) {
        assistantMessage.editProposal = {
          type: data.edit.type,
          findText: data.edit.findText,
          replaceText: data.edit.replaceText,
          newContent: data.edit.newContent, // For rewrite operations
          position: data.edit.position,
          confidence: data.edit.confidence,
          reasoning: data.edit.reasoning,
          status: 'pending'
        };
        
        // Notify parent component about the edit proposal
        onEditProposal({
          messageId: assistantMessage.id,
          type: data.edit.type,
          findText: data.edit.findText,
          replaceText: data.edit.replaceText
        });
      }

      onChatUpdate([...newMessages, assistantMessage]);
    } catch (error) {
      // Don't show error if request was aborted
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Chat request was cancelled');
        return;
      }
      
      console.error('Error sending message:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to send message';
      
      // Show user-friendly error toast
      if (errorMsg.includes('User not authenticated')) {
        addToast('Please sign in to continue chatting', 'warning');
      } else if (errorMsg.includes('Failed to fetch')) {
        addToast('Network error. Please check your connection and try again.', 'error');
      } else {
        addToast(`Chat error: ${errorMsg}`, 'error');
      }
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };
      onChatUpdate([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    onChatUpdate([]);
  };

  // Cleanup abort controller on component unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);


  return (
    <div className="flex flex-col h-full bg-white min-h-0">
      {/* Chat header */}
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-900">AI Assistant</h3>
            {selectedFile && (
              <p className="text-xs text-gray-500 truncate">
                Context: {selectedFile.name}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Model Selection */}
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="gpt-5-chat-latest">GPT-5 Chat Latest</option>
              <option value="claude-4.5-sonnet">Claude 4.5 Sonnet</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
            </select>
            <button
              onClick={clearChat}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white min-h-0">
        {chatHistory.length === 0 ? (
          <div className="text-center text-gray-500">
            <div className="w-12 h-12 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-sm">Start a conversation with the AI assistant</p>
            <p className="text-xs text-gray-400 mt-1">
              Ask questions about your document or request edits
            </p>
          </div>
        ) : (
          chatHistory.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-900'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                <p className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                }`}>
                  {message.timestamp.toLocaleTimeString()}
                </p>
                
                   {/* Accept/Reject buttons for edit proposals */}
                   {message.editProposal && message.editProposal.status === 'pending' && (
                     <div className="mt-3 space-y-2">
                       {/* Edit Type Indicator */}
                       <div className="flex items-center gap-2 text-xs">
                         <span className="text-gray-500">Edit Type:</span>
                         <span className={`px-2 py-1 rounded font-medium ${
                           message.editProposal.type === 'rewrite' ? 'bg-purple-100 text-purple-800' :
                           message.editProposal.type === 'replace' ? 'bg-blue-100 text-blue-800' :
                           message.editProposal.type === 'insert' ? 'bg-green-100 text-green-800' :
                           'bg-red-100 text-red-800'
                         }`}>
                           {message.editProposal.type === 'rewrite' ? '🔄 Complete Rewrite' :
                            message.editProposal.type === 'replace' ? '✏️ Replace' :
                            message.editProposal.type === 'insert' ? '➕ Insert' :
                            '🗑️ Delete'}
                         </span>
                       </div>
                       
                       {/* Confidence indicator */}
                       {message.editProposal.confidence && (
                         <div className="flex items-center gap-2 text-xs">
                           <span className="text-gray-500">Confidence:</span>
                           <span className={`px-2 py-1 rounded font-medium ${
                             message.editProposal.confidence === 'high' ? 'bg-green-100 text-green-800' :
                             message.editProposal.confidence === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                             'bg-red-100 text-red-800'
                           }`}>
                             {message.editProposal.confidence}
                           </span>
                         </div>
                       )}
                       
                       {/* Reasoning */}
                       {message.editProposal.reasoning && (
                         <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                           <strong>Reasoning:</strong> {message.editProposal.reasoning}
                         </div>
                       )}
                       
                       {/* Action buttons */}
                       <div className="flex gap-2">
                         <button 
                           onClick={() => onAcceptEdit(message.id)}
                           disabled={isApplyingEdit}
                           className="px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                         >
                           {isApplyingEdit ? (
                             <>
                               <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></div>
                               Applying...
                             </>
                           ) : (
                             <>✓ Accept</>
                           )}
                         </button>
                         <button 
                           onClick={() => onRejectEdit(message.id)}
                           disabled={isApplyingEdit}
                           className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                         >
                           ✗ Reject
                         </button>
                       </div>
                     </div>
                   )}
                
                {/* Status indicator for accepted/rejected edits */}
                {message.editProposal && message.editProposal.status !== 'pending' && (
                  <div className="mt-2">
                    <span className={`text-xs px-2 py-1 rounded ${
                      message.editProposal.status === 'accepted' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {message.editProposal.status === 'accepted' ? '✓ Accepted' : '✗ Rejected'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
        <div className="flex space-x-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask the AI to help with your document..."
            className="flex-1 resize-none border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
          >
            Send
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
      
      {/* Error Toasts */}
      {toasts.map((toast) => (
        <ErrorToast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          duration={toast.duration}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
