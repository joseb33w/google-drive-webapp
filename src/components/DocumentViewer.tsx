'use client';

import { useState, useEffect } from 'react';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';

interface File {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
  isGoogleDoc: boolean;
}

interface DocumentViewerProps {
  selectedFile: File | null;
}

export default function DocumentViewer({ selectedFile }: DocumentViewerProps) {
  const [documentContent, setDocumentContent] = useState<{title: string; content: Array<{type: string; text?: string}>} | null>(null);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Set up auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Load document content when a file is selected
  const loadDocumentContent = async (file: File) => {
    if (!file?.id || !user) return;

    setLoading(true);
    try {
      const idToken = await user.getIdToken();
      
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

      const data = await response.json();
      if (data.result) {
        setDocumentContent(data.result);
      }
    } catch (error) {
      console.error('Error loading document:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load document when file is selected
  useEffect(() => {
    if (selectedFile) {
      loadDocumentContent(selectedFile);
    } else {
      setDocumentContent(null);
    }
  }, [selectedFile, user]);

  return (
    <div className="flex-1 flex flex-col bg-white min-h-0 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-white">
        <h2 className="text-lg font-semibold text-gray-800">
          {selectedFile ? selectedFile.name : 'No file selected'}
        </h2>
      </div>
      
      {/* Content Area - Scrollable Container */}
      <div 
        className="flex-1 overflow-y-auto min-h-0 bg-white p-4"
        style={{
          height: '0px', // Force flex item to respect container height
          flex: '1 1 0%'
        }}
      >
        {loading ? (
          <div className="text-gray-500 text-center mt-8">
            Loading document...
          </div>
        ) : documentContent ? (
          <div style={{ maxWidth: 'none', margin: 0 }}>
            <h1 className="text-2xl font-bold text-gray-900 mb-6">
              {documentContent.title}
            </h1>
            {documentContent.content?.map((item: {type: string; text?: string}, index: number) => (
              <div key={index} className="mb-3">
                {item.type === 'paragraph' && item.text && (
                  <p className="text-gray-700 leading-relaxed">
                    {item.text}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : selectedFile ? (
          <div className="text-gray-500 text-center mt-8">
            No content available for this document
          </div>
        ) : (
          <div className="text-gray-500 text-center mt-8">
            Select a file from the left panel to view its content
          </div>
        )}
      </div>
    </div>
  );
}
