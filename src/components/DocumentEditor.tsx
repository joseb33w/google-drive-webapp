'use client';

import { useState, useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';

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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Start typing your document...',
      }),
    ],
    content: documentContent,
    onUpdate: ({ editor }) => {
      const content = editor.getHTML();
      setDocumentContent(content);
      onContentChange(content);
    },
  });

  // Update editor content when documentContent changes
  useEffect(() => {
    if (editor && documentContent !== editor.getHTML()) {
      editor.commands.setContent(documentContent);
    }
  }, [documentContent, editor]);

  const loadDocumentContent = useCallback(async () => {
    if (!file?.id) return;

    setLoading(true);
    try {
      // For now, we'll use a placeholder approach
      // In a real implementation, you'd get the user's Google tokens
      const response = await fetch('https://us-south1-try-mcp-15e08.cloudfunctions.net/googleDriveOperations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'get_document',
          params: {
            documentId: file.id
          },
          userTokens: {
            // Placeholder - in real implementation, get from user's OAuth flow
            access_token: 'placeholder',
            refresh_token: 'placeholder'
          }
        })
      });

      const data = await response.json();
      if (data.result) {
        // Convert Google Docs content to HTML
        const htmlContent = convertGoogleDocsToHTML(data.result.content);
        setDocumentContent(htmlContent);
      }
    } catch (error) {
      console.error('Error loading document:', error);
    } finally {
      setLoading(false);
    }
  }, [file?.id]);

  // Load document content when file changes
  useEffect(() => {
    if (file && file.id) {
      loadDocumentContent();
    } else {
      setDocumentContent('');
      editor?.commands.setContent('');
    }
  }, [file, editor?.commands, loadDocumentContent]);

  const saveDocument = async () => {
    if (!file?.id || !documentContent) return;

    setSaving(true);
    try {
      // For now, we'll use replace_text to update the entire document
      // In a real implementation, you'd want to track changes and update incrementally
      const response = await fetch('https://us-south1-try-mcp-15e08.cloudfunctions.net/googleDriveOperations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          operation: 'replace_text',
          params: {
            documentId: file.id,
            findText: '', // This would need to be the current content
            replaceWithText: convertHTMLToPlainText(documentContent)
          },
          userTokens: {
            // Placeholder - in real implementation, get from user's OAuth flow
            access_token: 'placeholder',
            refresh_token: 'placeholder'
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

  // Convert Google Docs content to HTML
  const convertGoogleDocsToHTML = (content: Array<{type: string; text?: string}>): string => {
    if (!content) return '';
    
    return content
      .map((item) => {
        if (item.type === 'paragraph' && item.text) {
          return `<p>${item.text}</p>`;
        }
        return '';
      })
      .join('');
  };

  // Convert HTML to plain text for Google Docs
  const convertHTMLToPlainText = (html: string): string => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  };

  if (!file) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
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
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-white">
      {/* Toolbar */}
      <div className="border-b border-gray-200 p-4">
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

      {/* Editor */}
      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          <EditorContent 
            editor={editor} 
            className="prose prose-lg max-w-none focus:outline-none"
          />
        </div>
      </div>
    </div>
  );
}
