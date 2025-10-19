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
    <div className="h-screen flex bg-gray-50">
      {/* Left Panel - File List */}
      <div className="w-1/4 border-r border-gray-200 bg-white">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Google Drive Files</h2>
        </div>
        <FileList 
          onFileSelect={setSelectedFile}
          selectedFile={selectedFile}
        />
      </div>

      {/* Middle Panel - Document Editor */}
      <div className="flex-1 flex flex-col">
        <div className="p-4 border-b border-gray-200 bg-white">
          <h2 className="text-lg font-semibold text-gray-800">
            {selectedFile ? selectedFile.name : 'Select a document to edit'}
          </h2>
        </div>
        <DocumentEditor 
          file={selectedFile}
          onContentChange={(content) => {
            // Handle content changes
            console.log('Content changed:', content);
          }}
        />
      </div>

      {/* Right Panel - AI Chat */}
      <div className="w-1/4 border-l border-gray-200 bg-white">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">AI Assistant</h2>
        </div>
        <ChatPanel 
          selectedFile={selectedFile}
          chatHistory={chatHistory}
          onChatUpdate={setChatHistory}
        />
      </div>
    </div>
  );
}