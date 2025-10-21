'use client';

import { useState, useEffect, useCallback } from 'react';
// Removed TipTap imports
// Removed TipTap placeholder import
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

interface DocumentEditorProps {
  file: File | null;
  onContentChange: (content: string) => void;
}

export default function DocumentEditor({ file, onContentChange }: DocumentEditorProps) {
  const [documentContent, setDocumentContent] = useState('');
  const [documentData, setDocumentData] = useState<{title: string; content: Array<{type: string; text?: string}>} | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // Content change handler removed since we're not using textarea anymore


  const loadDocumentContent = useCallback(async () => {
    if (!file?.id || !user) return;

    setLoading(true);
    try {
      // Get the user's ID token for authentication
      const idToken = await user.getIdToken();
      
      const response = await fetch('https://us-south1-try-mcp-15e08.cloudfunctions.net/googleDriveOperations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
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
        // Store the raw document data for better display
        setDocumentData(data.result);
      }
    } catch (error) {
      console.error('Error loading document:', error);
    } finally {
      setLoading(false);
    }
  }, [file?.id, user]);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Load document content when file changes
  useEffect(() => {
    if (file && file.id) {
      loadDocumentContent();
    } else {
      setDocumentContent('');
    }
  }, [file, loadDocumentContent]);

  const saveDocument = async () => {
    if (!file?.id || !documentContent || !user) return;

    setSaving(true);
    try {
      // Get the user's ID token for authentication
      const idToken = await user.getIdToken();
      
      // For now, we'll use replace_text to update the entire document
      // In a real implementation, you'd want to track changes and update incrementally
      const response = await fetch('https://us-south1-try-mcp-15e08.cloudfunctions.net/googleDriveOperations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          operation: 'replace_text',
          params: {
            documentId: file.id,
            findText: '', // This would need to be the current content
            replaceWithText: documentContent
          }
        })
      });

      const data = await response.json();
      if (data.result) {
        console.log('Document saved successfully');
      }
    } catch (error) {
      console.error('Error saving document:', error);
    } finally {
      setSaving(false);
    }
  };


  if (!file) {
    return (
      <div className="h-full flex flex-col bg-white">
        <div className="flex-1 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No document selected</h3>
            <p className="text-gray-500">Choose a document from the left panel to start editing</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white min-h-0 overflow-y-auto">
      {/* Toolbar */}
      <div className="border-b border-gray-200 p-4 flex-shrink-0 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <button
              onClick={loadDocumentContent}
              disabled={loading}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Reload'}
            </button>
            <button
              onClick={saveDocument}
              disabled={saving}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
          <div className="text-sm text-gray-500">
            {file.name}
          </div>
        </div>
      </div>

    </div>
  );
}
