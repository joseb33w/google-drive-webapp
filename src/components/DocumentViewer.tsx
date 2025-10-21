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
  const [user, setUser] = useState<User | null>(null);

  // Set up auth state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Load document when file is selected
  useEffect(() => {
    // This effect is intentionally empty for the test
  }, [selectedFile, user]);

  return (
    <div 
      className="flex-1 bg-white relative" 
      style={{ 
        height: '100vh',
        border: '3px solid red', // Debug border
        backgroundColor: 'lightblue' // Debug background
      }}
    >
      {/* Header - Fixed at top */}
      <div 
        className="absolute top-0 left-0 right-0 bg-white border-b border-gray-200 p-4 z-10"
        style={{ 
          height: '80px',
          border: '2px solid green' // Debug border
        }}
      >
        <h2 className="text-lg font-semibold text-gray-800">
          {selectedFile ? selectedFile.name : 'No file selected'}
        </h2>
      </div>
      
      {/* Content Area - Scrollable, positioned below header */}
      <div 
        className="absolute left-0 right-0 bg-white p-4"
        style={{
          top: '80px',
          bottom: '0px',
          overflowY: 'auto',
          overflowX: 'hidden',
          border: '2px solid orange', // Debug border
          backgroundColor: 'lightyellow' // Debug background
        }}
      >
        {/* VERY VERY LONG TEST CONTENT */}
        <div style={{ maxWidth: 'none', margin: 0 }}>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">TEST DOCUMENT - SCROLLING TEST</h1>
          {Array.from({ length: 1000 }, (_, i) => (
            <p key={i} className="text-gray-700 leading-relaxed mb-4">
              This is test paragraph {i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit. 
              Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, 
              quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. 
              Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
              Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.
              This paragraph is intentionally very long to test scrolling behavior and ensure the content area
              properly constrains the text and shows a scrollbar when needed. If you can see this text, 
              the scrolling is working correctly. If the text overflows without a scrollbar, there&apos;s still an issue.
              Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
              Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
              Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
              Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
              Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam.
              Eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.
              Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit, sed quia consequuntur magni dolores.
              At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis praesentium voluptatum deleniti atque.
              Et harum quidem rerum facilis est et expedita distinctio. Nam libero tempore, cum soluta nobis est eligendi.
              Optio cumque nihil impedit quo minus id quod maxime placeat facere possimus, omnis voluptas assumenda est.
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}
