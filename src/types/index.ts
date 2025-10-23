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
  isGoogleSheet: boolean;
}

export interface DocumentContentItem {
  type: string;
  text: string;
  rowIndex?: number; // For spreadsheet rows
}

export interface SheetMetadata {
  sheetId: number;
  title: string;
  index: number;
  gridProperties: {
    rowCount: number;
    columnCount: number;
  };
}

export interface SheetData {
  sheetId: number;
  title: string;
  rows: string[][]; // 2D array of cell values
  gridProperties: {
    rowCount: number;
    columnCount: number;
  };
}

export interface DocumentContent {
  documentId: string;
  title: string;
  content?: DocumentContentItem[]; // For Google Docs
  sheets?: SheetMetadata[]; // For Google Sheets
  activeSheet?: SheetData; // Currently displayed sheet
  error?: string;
}

export interface EditProposal {
  type: 'replace' | 'insert' | 'delete' | 'rewrite';
  findText?: string;
  replaceText?: string;
  newContent?: string; // For complete document rewrites
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

