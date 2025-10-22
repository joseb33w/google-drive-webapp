'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import { auth, functions } from '@/lib/firebase';
import Image from 'next/image';
import { httpsCallable } from 'firebase/functions';
import { File, AuthUser } from '@/types';
import { FIREBASE_FUNCTIONS, getGoogleClientId } from '@/lib/config';
import { ErrorToast, useErrorToast } from './ErrorToast';

interface FileListProps {
  onFileSelect: (file: File) => void;
  selectedFile: File | null;
}

export default function FileList({ onFileSelect, selectedFile }: FileListProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [needsOAuth, setNeedsOAuth] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [lastRequestTime, setLastRequestTime] = useState<number>(0);
  const { toasts, addToast, removeToast } = useErrorToast();
  
  // Store interval reference for cleanup
  const oauthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Request cancellation and debouncing
  const abortControllerRef = useRef<AbortController | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Handle Google Sign-In with Google Drive scopes
  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      // Add Google Drive and Docs scopes for API access
      provider.addScope('https://www.googleapis.com/auth/drive');
      provider.addScope('https://www.googleapis.com/auth/documents');
      provider.addScope('https://www.googleapis.com/auth/drive.readonly');
      provider.addScope('https://www.googleapis.com/auth/documents.readonly');
      
      const result = await signInWithPopup(auth, provider);
      setUser(result.user);
      
      // Extract OAuth tokens from Google credential
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        // Store OAuth tokens in Firestore via Firebase Functions
        const storeTokens = httpsCallable(functions, 'storeOAuthTokens');
        
        try {
          await storeTokens({
            oauthAccessToken: credential.accessToken,
            oauthRefreshToken: null, // Firebase Auth doesn't provide refresh token directly
            oauthExpiry: Date.now() + (3600 * 1000) // 1 hour default
          });
          console.log('OAuth tokens stored successfully');
        } catch (error) {
          console.error('Failed to store OAuth tokens:', error);
        }
      } else {
        console.warn('No OAuth access token received. User may need to re-authorize.');
        setNeedsOAuth(true);
      }
      
      // Clear any existing session ID since we're using Firebase Auth now
      setSessionId(null);
      localStorage.removeItem('sessionId');
      
    } catch (error) {
      console.error('Sign-in error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign in with Google';
      addToast(`Sign-in failed: ${errorMessage}`, 'error');
    }
  };

  // Handle Google Drive OAuth authorization
  const handleGoogleDriveAuth = async () => {
    try {
      // Clean up any existing interval first
      if (oauthCheckIntervalRef.current) {
        clearInterval(oauthCheckIntervalRef.current);
        oauthCheckIntervalRef.current = null;
      }
      
      // Create OAuth URL for Google Drive access
      const clientId = getGoogleClientId();
      const redirectUri = encodeURIComponent(window.location.origin);
      const scope = encodeURIComponent([
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/documents',
        'https://www.googleapis.com/auth/drive.readonly',
        'https://www.googleapis.com/auth/documents.readonly'
      ].join(' '));
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${clientId}&` +
        `redirect_uri=${redirectUri}&` +
        `scope=${scope}&` +
        `response_type=code&` +
        `access_type=offline&` +
        `prompt=consent`;
      
      // Open OAuth popup
      const popup = window.open(authUrl, 'google-oauth', 'width=500,height=600');
      
      // Listen for the popup to close or receive the authorization code
      oauthCheckIntervalRef.current = setInterval(() => {
        if (popup?.closed) {
          // Clean up interval
          if (oauthCheckIntervalRef.current) {
            clearInterval(oauthCheckIntervalRef.current);
            oauthCheckIntervalRef.current = null;
          }
          
          // Check if we have the authorization code in the URL
          const urlParams = new URLSearchParams(window.location.search);
          const code = urlParams.get('code');
          if (code) {
            handleOAuthCallback(code);
          }
        }
      }, 1000);
      
    } catch (error) {
      console.error('OAuth authorization error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to authorize Google Drive access';
      addToast(`OAuth authorization failed: ${errorMessage}`, 'error');
      
      // Clean up interval on error
      if (oauthCheckIntervalRef.current) {
        clearInterval(oauthCheckIntervalRef.current);
        oauthCheckIntervalRef.current = null;
      }
    }
  };

  // Handle OAuth callback
  const handleOAuthCallback = async (code: string) => {
    try {
      if (!user) {
        console.error('User not authenticated');
        return;
      }
      
      // Exchange authorization code for tokens
      const idToken = await user.getIdToken();
      const response = await fetch(FIREBASE_FUNCTIONS.exchangeOAuthCode, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          code: code,
          redirectUri: window.location.origin
        })
      });
      
      const data = await response.json();
      if (data.success) {
        console.log('OAuth tokens exchanged successfully');
        setNeedsOAuth(false);
        // Try to load files now
        loadFiles();
      } else {
        console.error('Failed to exchange OAuth code:', data.error);
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
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
    
    // Cancel any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Clear any existing debounce timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Debounce requests - wait 500ms before making the actual request
    return new Promise<void>((resolve) => {
      debounceTimeoutRef.current = setTimeout(async () => {
        try {
          // Rate limiting: prevent requests more than once every 2 seconds
          const now = Date.now();
          const timeSinceLastRequest = now - lastRequestTime;
          if (timeSinceLastRequest < 2000) {
            const waitTime = Math.ceil((2000 - timeSinceLastRequest) / 1000);
            addToast(`Please wait ${waitTime} second(s) before refreshing files`, 'warning');
            resolve();
            return;
          }
          
          setLastRequestTime(now);
          setLoading(true);
          
          // Create new abort controller for this request
          abortControllerRef.current = new AbortController();
          
          // Get user's Firebase ID token for authentication with Firebase Functions
          const idToken = await user.getIdToken();
          
          // Call Firebase Functions directly (no more Railway proxy)
          const response = await fetch(FIREBASE_FUNCTIONS.googleDriveOperations, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${idToken}`, // Authenticate Firebase Function call
            },
            body: JSON.stringify({
              operation: 'list_files',
              params: {
                maxResults: 50
              }
            }),
            signal: abortControllerRef.current.signal // Add abort signal
          });

      const data = await response.json();
      
      // Check if the response contains a result (success case)
      if (data.result && data.result.files) {
        setFiles(data.result.files);
        setNeedsOAuth(false);
        console.log('Files loaded successfully:', data.result.files.length);
      } else if (data.error) {
        // Only show error if there's actually an error message
        console.error('Error loading files:', data.error);
        const errorMessage = data.error;
        
        // Check for specific error types
        if (data.error.includes('Quota exceeded') || data.error.includes('quota metric')) {
          addToast('Google Drive API quota exceeded. Please wait a minute and try again.', 'warning');
        } else if (data.error.includes('OAuth tokens not found') || data.needsAuth) {
          addToast('Please authorize Google Drive access first', 'warning');
          setNeedsOAuth(true);
        } else {
          addToast(`Failed to load files: ${errorMessage}`, 'error');
        }
        setFiles([]);
      } else {
        // Fallback case - no result and no error
        console.warn('Unexpected response format:', data);
        setFiles([]);
      }
        } catch (error) {
          // Don't show error if request was aborted
          if (error instanceof Error && error.name === 'AbortError') {
            console.log('Request was cancelled');
            resolve();
            return;
          }
          
          console.error('Error loading files:', error);
          
          // Handle different types of errors more specifically
          let errorMessage = 'Failed to load files from Google Drive';
          let errorType: 'error' | 'warning' = 'error';
          
          if (error instanceof Error) {
            if (error.message.includes('Failed to fetch')) {
              errorMessage = 'Network error. Please check your connection and try again.';
              errorType = 'warning';
            } else if (error.message.includes('User not authenticated')) {
              errorMessage = 'Please sign in to access your Google Drive files.';
              errorType = 'warning';
            } else {
              errorMessage = error.message;
            }
          }
          
          addToast(`Failed to load files: ${errorMessage}`, errorType);
          setNeedsOAuth(true);
          setFiles([]);
        } finally {
          setLoading(false);
          resolve();
        }
      }, 500); // 500ms debounce delay
    });
  }, [user, addToast, lastRequestTime]); // Added lastRequestTime dependency

  // No longer needed - Firebase Auth handles Google Drive access


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

  // Cleanup intervals and requests on component unmount
  useEffect(() => {
    return () => {
      if (oauthCheckIntervalRef.current) {
        clearInterval(oauthCheckIntervalRef.current);
        oauthCheckIntervalRef.current = null;
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  if (!user) {
    return (
      <div className="p-6">
        <div className="text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Welcome to Google Drive</h2>
            <p className="text-gray-600">Sign in to access your documents and start editing</p>
          </div>
          <button
            onClick={handleGoogleSignIn}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 flex items-center justify-center space-x-3 font-medium"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Sign in with Google</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white min-h-0">
      {/* User info and sign out */}
      <div className="p-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Image
                src={user.photoURL || '/default-avatar.png'}
                alt={user.displayName || 'User'}
                width={40}
                height={40}
                className="w-10 h-10 rounded-full border-2 border-white shadow-md"
              />
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-white rounded-full"></div>
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium text-gray-800 truncate">
                {user.displayName || 'User'}
              </span>
              <span className="text-xs text-gray-500 truncate">
                {user.email}
              </span>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 hover:text-gray-800 rounded-lg transition-all duration-200 flex items-center space-x-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>
        <button
          onClick={loadFiles}
          disabled={loading}
          className="w-full mt-3 bg-gradient-to-r from-green-600 to-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:from-green-700 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
        >
          {loading ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Loading...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>Refresh Files</span>
            </>
          )}
        </button>
        {needsOAuth && (
          <div className="mt-3 p-3 bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg shadow-sm">
            <div className="flex items-start space-x-2 mb-3">
              <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-800">Google Drive Authorization Required</p>
                <p className="text-xs text-yellow-700 mt-1">Click the button below to authorize Google Drive access.</p>
              </div>
            </div>
            <button
              onClick={handleGoogleDriveAuth}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Authorize Google Drive</span>
            </button>
          </div>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto bg-white min-h-0">
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
