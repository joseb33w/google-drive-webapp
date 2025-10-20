'use client';

import { useState } from 'react';
import FileList from '@/components/FileList';
import DocumentEditor from '@/components/DocumentEditor';
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

  return (
    <div className="h-screen flex bg-white">
      {/* Left Panel - File List */}
      <div className="w-1/4 border-r border-gray-200 bg-white flex flex-col h-full">
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">Google Drive Files</h2>
        </div>
        <div className="flex-1 min-h-0">
          <FileList 
            onFileSelect={setSelectedFile}
            selectedFile={selectedFile}
          />
        </div>
      </div>

      {/* Middle Panel - Document Editor */}
      <div className="flex-1 flex flex-col bg-white h-full">
        <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">
            {selectedFile ? selectedFile.name : 'Select a document to edit'}
          </h2>
        </div>
        <div className="flex-1 min-h-0">
          <DocumentEditor 
            file={selectedFile}
            onContentChange={(content) => {
              // Handle content changes
              console.log('Content changed:', content);
            }}
          />
        </div>
      </div>

      {/* Right Panel - AI Chat */}
      <div className="w-1/4 border-l border-gray-200 bg-white flex flex-col h-full">
        <div className="p-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-800">AI Assistant</h2>
        </div>
        <div className="flex-1 min-h-0">
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