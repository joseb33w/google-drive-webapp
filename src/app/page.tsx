'use client';

import { useState, useRef, useEffect } from 'react';
import FileList from '@/components/FileList';
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
  const [documentContent, setDocumentContent] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  // Panel widths (in percentages)
  const [leftWidth, setLeftWidth] = useState(25);
  const [middleWidth, setMiddleWidth] = useState(50);
  const [rightWidth, setRightWidth] = useState(25);
  
  const [isResizing, setIsResizing] = useState(false);
  const [resizeType, setResizeType] = useState<'left' | 'right' | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Handle mouse move for resizing
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing || !containerRef.current) return;
      
      const containerRect = containerRef.current.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const containerWidth = containerRect.width;
      const newLeftPercent = (mouseX / containerWidth) * 100;
      
      if (resizeType === 'left') {
        // Resize left panel
        const newLeft = Math.max(15, Math.min(60, newLeftPercent));
        const newMiddle = 100 - newLeft - rightWidth;
        const newRight = rightWidth;
        
        if (newMiddle >= 20) {
          setLeftWidth(newLeft);
          setMiddleWidth(newMiddle);
        }
      } else if (resizeType === 'right') {
        // Resize right panel
        const newRight = Math.max(15, Math.min(60, ((containerWidth - mouseX) / containerWidth) * 100));
        const newMiddle = 100 - leftWidth - newRight;
        const newLeft = leftWidth;
        
        if (newMiddle >= 20) {
          setRightWidth(newRight);
          setMiddleWidth(newMiddle);
        }
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      setResizeType(null);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, resizeType, leftWidth, rightWidth]);

  const startResize = (type: 'left' | 'right') => {
    setIsResizing(true);
    setResizeType(type);
  };

  // Load document content when a file is selected
  const loadDocumentContent = async (file: File) => {
    if (!file.isGoogleDoc) {
      setDocumentContent({ error: 'This file type is not supported for editing' });
      return;
    }

    setLoading(true);
    try {
      // Get Firebase auth token
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        setDocumentContent({ error: 'Please sign in to view documents' });
        return;
      }

      const idToken = await user.getIdToken();
      
      // Call Firebase function to get document content
      const response = await fetch('https://us-south1-try-mcp-15e08.cloudfunctions.net/googleDriveOperations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          operation: 'get_document',
          params: {
            documentId: file.id
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to load document');
      }

      const data = await response.json();
      setDocumentContent(data.result);
    } catch (error) {
      console.error('Error loading document:', error);
      setDocumentContent({ error: 'Failed to load document content' });
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    loadDocumentContent(file);
  };

  return (
    <div 
      ref={containerRef}
      className="h-screen w-full flex bg-gray-50 overflow-hidden"
      style={{
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale'
      }}
    >
      {/* Left Panel - File List */}
      <div 
        className="bg-white border-r border-gray-200 flex flex-col min-h-0"
        style={{ width: `${leftWidth}%` }}
      >
        <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-800">Google Drive Files</h2>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 bg-white">
          <FileList 
            onFileSelect={handleFileSelect}
            selectedFile={selectedFile}
          />
        </div>
      </div>

      {/* Left Resize Handle */}
      <div
        className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0"
        onMouseDown={() => startResize('left')}
      />

      {/* Middle Panel - Document Editor */}
      <div 
        className="bg-white flex flex-col min-h-0"
        style={{ width: `${middleWidth}%` }}
      >
        <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-800">
            {selectedFile ? selectedFile.name : 'Document Editor'}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 bg-white p-6">
          {selectedFile ? (
            <div className="max-w-4xl mx-auto">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading document content...</p>
                  </div>
                </div>
              ) : documentContent ? (
                <div>
                  {documentContent.error ? (
                    <div className="bg-red-50 border border-red-200 rounded-md p-4">
                      <p className="text-red-800">{documentContent.error}</p>
                    </div>
                  ) : (
                    <div>
                      <div className="mb-6">
                        <h3 className="text-xl font-semibold text-gray-900 mb-2">{documentContent.title}</h3>
                        <div className="bg-gray-50 p-3 rounded-md text-sm text-gray-700">
                          <p><strong>Document ID:</strong> {documentContent.documentId}</p>
                          <p><strong>Last Modified:</strong> {new Date(selectedFile.modifiedTime).toLocaleString()}</p>
                        </div>
                      </div>
                      
                      {/* Display actual document content */}
                      <div className="prose max-w-none">
                        {documentContent.content && documentContent.content.length > 0 ? (
                          documentContent.content.map((item: any, index: number) => (
                            <p key={index} className="text-gray-900 leading-relaxed text-base mb-4">
                              {item.text}
                            </p>
                          ))
                        ) : (
                          <p className="text-gray-500 italic">No content available in this document.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <p className="text-gray-500">Click on a document to load its content.</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <h3 className="text-lg font-medium mb-2">No Document Selected</h3>
                <p>Select a document from the file list to start editing.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Resize Handle */}
      <div
        className="w-1 bg-gray-200 hover:bg-blue-400 cursor-col-resize flex-shrink-0"
        onMouseDown={() => startResize('right')}
      />

      {/* Right Panel - AI Chat */}
      <div 
        className="bg-white border-l border-gray-200 flex flex-col min-h-0"
        style={{ width: `${rightWidth}%` }}
      >
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