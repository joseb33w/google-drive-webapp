'use client';

import { useState, useRef, useEffect } from 'react';
import FileList from '@/components/FileList';
import ChatPanel from '@/components/ChatPanel';
import { File, Message, DocumentContent, DocumentContentItem } from '@/types';
import { FIREBASE_FUNCTIONS } from '@/lib/config';

export default function Home() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [documentContent, setDocumentContent] = useState<DocumentContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingEdit, setPendingEdit] = useState<{
    messageId: string;
    type: string;
    findText: string;
    replaceText: string;
  } | null>(null);
  
  // Model selection state
  const [selectedModel, setSelectedModel] = useState('gpt-5-chat-latest');
  
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
        
        if (newMiddle >= 20) {
          setLeftWidth(newLeft);
          setMiddleWidth(newMiddle);
        }
      } else if (resizeType === 'right') {
        // Resize right panel
        const newRight = Math.max(15, Math.min(60, ((containerWidth - mouseX) / containerWidth) * 100));
        const newMiddle = 100 - leftWidth - newRight;
        
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
      setDocumentContent({ 
        documentId: file.id, 
        title: file.name, 
        content: [], 
        error: 'This file type is not supported for viewing' 
      });
      return;
    }

    setLoading(true);
    try {
      // Get Firebase auth token
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        setDocumentContent({ 
          documentId: file.id, 
          title: file.name, 
          content: [], 
          error: 'Please sign in to view documents' 
        });
        setLoading(false);
        return;
      }

      const idToken = await user.getIdToken();
      
      // Call Firebase function to get document content
      const response = await fetch(FIREBASE_FUNCTIONS.googleDriveOperations, {
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
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load document');
      }

      const data = await response.json();
      
      if (data.result) {
        setDocumentContent(data.result);
      } else if (data.error) {
        setDocumentContent({ 
          documentId: file.id, 
          title: file.name, 
          content: [], 
          error: data.error 
        });
      }
    } catch (error) {
      console.error('Error loading document:', error);
      setDocumentContent({ 
        documentId: file.id, 
        title: file.name, 
        content: [], 
        error: error instanceof Error ? error.message : 'Failed to load document content' 
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    loadDocumentContent(file);
  };

  // Handle accepting an edit
  const handleAcceptEdit = async (messageId: string) => {
    const message = chatHistory.find(m => m.id === messageId);
    if (!message || !message.editProposal) return;

    try {
      // Get Firebase auth token
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user || !selectedFile) return;

      const idToken = await user.getIdToken();
      
      // Call Firebase function to apply the edit
      const response = await fetch(FIREBASE_FUNCTIONS.googleDriveOperations, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          operation: 'replace_text',
          params: {
            documentId: selectedFile.id,
            findText: message.editProposal.findText,
            replaceWithText: message.editProposal.replaceText
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to apply edit');
      }

      // Update message status to accepted
      const updatedMessages = chatHistory.map(m => 
        m.id === messageId 
          ? { ...m, editProposal: { ...m.editProposal!, status: 'accepted' as const } }
          : m
      );
      setChatHistory(updatedMessages);

      // Clear pending edit
      setPendingEdit(null);

      // Reload document content to show the changes
      if (selectedFile) {
        loadDocumentContent(selectedFile);
      }
    } catch (error) {
      console.error('Error accepting edit:', error);
    }
  };

  // Handle rejecting an edit
  const handleRejectEdit = (messageId: string) => {
    // Update message status to rejected
    const updatedMessages = chatHistory.map(m => 
      m.id === messageId 
        ? { ...m, editProposal: { ...m.editProposal!, status: 'rejected' as const } }
        : m
    );
    setChatHistory(updatedMessages);

    // Clear pending edit
    setPendingEdit(null);
  };

  // Smart text matching function
  const findTextWithFuzzyMatching = (content: DocumentContentItem[], findText: string) => {
    const matches: Array<{paragraphIndex: number, index: number, length: number, confidence: string}> = [];
    
    // Try exact match first
    content.forEach((item, pIndex) => {
      if (item.text.includes(findText)) {
        matches.push({
          paragraphIndex: pIndex,
          index: item.text.indexOf(findText),
          length: findText.length,
          confidence: 'high'
        });
      }
    });
    
    if (matches.length === 1) return matches[0];
    
    // Normalize whitespace and try again
    const normalizedFind = findText.replace(/\s+/g, ' ').trim();
    content.forEach((item, pIndex) => {
      const normalized = item.text.replace(/\s+/g, ' ').trim();
      if (normalized.includes(normalizedFind)) {
        const index = item.text.indexOf(normalizedFind);
        matches.push({
          paragraphIndex: pIndex,
          index,
          length: normalizedFind.length,
          confidence: 'medium'
        });
      }
    });
    
    if (matches.length === 1) return matches[0];
    
    // Extract core text (remove first/last word which are likely context)
    const words = normalizedFind.split(' ');
    if (words.length > 2) {
      const coreText = words.slice(1, -1).join(' ');
      content.forEach((item, pIndex) => {
        if (item.text.includes(coreText)) {
          matches.push({
            paragraphIndex: pIndex,
            index: item.text.indexOf(coreText),
            length: coreText.length,
            confidence: 'medium'
          });
        }
      });
    }
    
    // Return best match (first one found, prioritizing higher confidence)
    return matches.length > 0 ? matches[0] : null;
  };

  // Render document content with diff highlighting
  const renderDocumentContent = (content: DocumentContentItem[]) => {
    if (!content || content.length === 0) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">This document appears to be empty.</p>
        </div>
      );
    }

    return content.map((item: DocumentContentItem, index: number) => {
      if (!item.text || !item.text.trim()) {
        return null;
      }

      // If there's a pending edit, use smart text matching
      if (pendingEdit) {
        const match = findTextWithFuzzyMatching(content, pendingEdit.findText);
        
        if (match && match.paragraphIndex === index) {
          const beforeText = item.text.substring(0, match.index);
          const matchedText = item.text.substring(match.index, match.index + match.length);
          const afterText = item.text.substring(match.index + match.length);
          
          return (
            <p key={index} className="text-gray-900 text-lg leading-relaxed mb-4">
              {beforeText}
              <span className={`line-through text-red-600 bg-red-50 px-1 rounded ${
                match.confidence === 'medium' ? 'border-2 border-orange-300' : ''
              }`}>
                {matchedText}
                {match.confidence === 'medium' && <span className="text-xs text-orange-600 ml-1">(fuzzy match)</span>}
              </span>
              <span className="text-green-600 bg-green-50 font-semibold px-1 rounded">
                {pendingEdit.replaceText}
              </span>
              {afterText}
            </p>
          );
        }
      }

      // Normal rendering without diff
      return (
        <p key={index} className="text-gray-900 text-lg leading-relaxed mb-4">
          {item.text}
        </p>
      );
    });
  };

  return (
    <div 
      ref={containerRef}
      className="h-screen w-full flex bg-gray-50 overflow-hidden"
    >
      {/* Left Panel - File List */}
      <div 
        className="bg-white border-r border-gray-200 flex flex-col min-h-0"
        style={{ width: `${leftWidth}%` }}
      >
        <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-800">Files</h2>
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

      {/* Middle Panel - Document Viewer */}
      <div 
        className="bg-white flex flex-col min-h-0"
        style={{ width: `${middleWidth}%` }}
      >
        <div className="p-4 border-b border-gray-200 flex-shrink-0 bg-white">
          <h2 className="text-lg font-semibold text-gray-800">
            {selectedFile ? selectedFile.name : 'Document'}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 bg-white">
          {selectedFile ? (
            <div className="p-8">
              {loading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading document...</p>
                  </div>
                </div>
              ) : documentContent ? (
                <div className="max-w-4xl mx-auto">
                  {documentContent.error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6">
                      <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Document</h3>
                      <p className="text-red-800">{documentContent.error}</p>
                      {documentContent.error.includes('OAuth') && (
                        <p className="text-sm text-red-700 mt-4">
                          Please click &quot;Authorize Google Drive&quot; in the left panel to grant access.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="prose prose-lg max-w-none">
                      <h1 className="text-3xl font-bold text-gray-900 mb-8">{documentContent.title}</h1>
                      {renderDocumentContent(documentContent.content)}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-xl font-medium mb-2">No Document Selected</h3>
                <p className="text-gray-400">Select a document from the left to view its content</p>
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
            documentContent={documentContent}
            chatHistory={chatHistory}
            onChatUpdate={setChatHistory}
            onEditProposal={setPendingEdit}
            onAcceptEdit={handleAcceptEdit}
            onRejectEdit={handleRejectEdit}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        </div>
      </div>
    </div>
  );
}