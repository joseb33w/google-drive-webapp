'use client';

import { useState, useEffect, useCallback } from 'react';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import Image from 'next/image';

interface File {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
  isGoogleDoc: boolean;
}

interface FileListProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
}

export default function FileList({ onFileSelect, selectedFile }: FileListProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<{displayName: string | null; email: string | null; photoURL: string | null; getIdToken: () => Promise<string>} | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  // Handle Google Sign-In
  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/documents');
      
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      
      // Get the session ID from the URL or create one
      const urlParams = new URLSearchParams(window.location.search);
      const session = urlParams.get('session') || Math.random().toString(36).substring(2, 15);
      setSessionId(session);
      
      // Store the session ID for API calls
      localStorage.setItem('sessionId', session);
      
    } catch (error) {
      console.error('Sign-in error:', error);
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setSessionId(null);
      setFiles([]);
      localStorage.removeItem('sessionId');
    } catch (error) {
      console.error('Sign-out error:', error);
    }
  };

  // Load files from Google Drive via Firebase Functions
  const loadFiles = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      // Get user's Google tokens from Firebase Auth
      const token = await user.getIdToken();
      
      const response = await fetch('https://us-south1-try-mcp-15e08.cloudfunctions.net/googleDriveOperations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          operation: 'list_files',
          params: {
            maxResults: 50
          },
          userTokens: {
            // We'll need to get these from the user's OAuth flow
            // For now, we'll use a placeholder approach
            access_token: 'placeholder',
            refresh_token: 'placeholder'
          }
        })
      });

      const data = await response.json();
      if (data.result) {
        setFiles(data.result.files || []);
      }
    } catch (error) {
      console.error('Error loading files:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      if (user) {
        const session = localStorage.getItem('sessionId') || Math.random().toString(36).substring(2, 15);
        setSessionId(session);
        localStorage.setItem('sessionId', session);
      }
    });

    return () => unsubscribe();
  }, []);

  // Load files when session is available
  useEffect(() => {
    if (sessionId && user) {
      loadFiles();
    }
  }, [sessionId, user, loadFiles]);

  if (!user) {
    return (
      <div className="p-4">
        <div className="text-center">
          <p className="text-gray-600 mb-4">Sign in to view your Google Drive files</p>
          <button
            onClick={handleGoogleSignIn}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* User info and sign out */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Image
              src={user.photoURL || '/default-avatar.png'}
              alt={user.displayName || 'User'}
              width={32}
              height={32}
              className="w-8 h-8 rounded-full"
            />
            <span className="text-sm text-gray-700 truncate">
              {user.displayName || user.email}
            </span>
          </div>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Sign out
          </button>
        </div>
        <button
          onClick={loadFiles}
          disabled={loading}
          className="w-full mt-2 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh Files'}
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {files.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            {loading ? 'Loading files...' : 'No Google Docs found'}
          </div>
        ) : (
          <div className="p-2">
            {files.map((file) => (
              <div
                key={file.id}
                onClick={() => onFileSelect(file)}
                className={`p-3 mb-2 rounded-lg cursor-pointer transition-colors ${
                  selectedFile?.id === file.id
                    ? 'bg-blue-100 border border-blue-300'
                    : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                    <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      Modified: {new Date(file.modifiedTime).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
