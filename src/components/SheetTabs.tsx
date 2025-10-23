import React from 'react';
import { SheetMetadata } from '../types';

interface SheetTabsProps {
  sheets: SheetMetadata[];
  activeSheetId: number;
  onSheetChange: (sheetId: number) => void;
}

export default function SheetTabs({ sheets, activeSheetId, onSheetChange }: SheetTabsProps) {
  return (
    <div className="flex items-center space-x-1 bg-gray-50 border-t border-gray-200 px-4 py-2 overflow-x-auto">
      {sheets.map(sheet => (
        <button
          key={sheet.sheetId}
          onClick={() => onSheetChange(sheet.sheetId)}
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            sheet.sheetId === activeSheetId
              ? 'bg-white text-gray-900 border-t-2 border-blue-500'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {sheet.title}
        </button>
      ))}
    </div>
  );
}
