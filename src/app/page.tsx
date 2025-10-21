'use client';

// Main page component for Google Drive web app - Retry deployment
import { useState, useEffect } from 'react';

// Suppress jQuery errors that are breaking React rendering
if (typeof window !== 'undefined') {
  const originalError = console.error;
  console.error = (...args) => {
    const message = args.join(' ');
    if (message.includes("'*,:x' is not a valid selector")) {
      // Ignore this specific jQuery error
      return;
    }
    originalError.apply(console, args);
  };

  // Prevent debugger from pausing on jQuery errors
  window.addEventListener('error', (event) => {
    if (event.message && event.message.includes("'*,:x' is not a valid selector")) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  });
}
import FileList from '@/components/FileList';
import DocumentEditor from '@/components/DocumentEditor';

console.log('🔍 DocumentEditor imported:', DocumentEditor);
import ChatPanel from '@/components/ChatPanel';

interface File {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
  isGoogleDoc: boolean;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);

  // Debug log for DocumentEditor rendering
  useEffect(() => {
    console.log('🚨 About to render DocumentEditor with file:', selectedFile?.name);
  }, [selectedFile]);

  return (
    <div className="h-screen w-full flex bg-white">
      {/* Left Panel - File List */}
      <div className="w-1/4 border-r border-gray-200 bg-white flex flex-col min-h-0 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-800">Google Drive Files</h2>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 bg-white">
          <FileList 
            onFileSelect={setSelectedFile}
            selectedFile={selectedFile}
          />
        </div>
      </div>

      {/* Middle Panel - Document Editor */}
      <DocumentEditor 
        file={selectedFile}
        onContentChange={(content) => {
          // Handle content changes
          console.log('Content changed:', content);
        }}
      />

      {/* Right Panel - AI Chat */}
      <div className="w-1/4 border-l border-gray-200 bg-white flex flex-col min-h-0 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-800">AI Assistant</h2>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 bg-white">
          <ChatPanel 
            selectedFile={selectedFile}
            chatHistory={chatHistory}
            onChatUpdate={setChatHistory}
          />
        </div>
      </div>
    </div>
  );
}