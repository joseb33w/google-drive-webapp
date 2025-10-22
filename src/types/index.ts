/**
 * Shared type definitions for the Google Drive Web App
 * This file contains all common interfaces used across components
 */

export interface File {
  id: string;
  name: string;
  mimeType: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink: string;
  isGoogleDoc: boolean;
}

export interface DocumentContentItem {
  type: string;
  text: string;
}

export interface DocumentContent {
  documentId: string;
  title: string;
  content: DocumentContentItem[];
  error?: string;
}

export interface EditProposal {
  type: 'replace' | 'insert' | 'delete';
  findText: string;
  replaceText: string;
  position?: number;
  status: 'pending' | 'accepted' | 'rejected';
  confidence?: 'high' | 'medium' | 'low';
  reasoning?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  editProposal?: EditProposal;
}

export interface AuthUser {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  getIdToken: () => Promise<string>;
}

