import React from 'react';
import { SheetData } from '../types';

interface SpreadsheetGridProps {
  data: SheetData;
}

// Helper to convert column index to letter (0 -> A, 25 -> Z, 26 -> AA)
function columnIndexToLetter(index: number): string {
  let letter = '';
  while (index >= 0) {
    letter = String.fromCharCode((index % 26) + 65) + letter;
    index = Math.floor(index / 26) - 1;
  }
  return letter;
}

export default function SpreadsheetGrid({ data }: SpreadsheetGridProps) {
  const { rows, gridProperties } = data;
  const columnCount = gridProperties.columnCount || Math.max(rows[0]?.length || 0, 26);
  const rowCount = Math.max(gridProperties.rowCount || rows.length, 50); // Show at least 50 rows
  
  return (
    <div className="overflow-auto bg-white">
      <table className="border-collapse min-w-full">
        <thead>
          <tr>
            {/* Top-left corner cell */}
            <th className="sticky top-0 left-0 z-20 bg-gray-100 border border-gray-300 w-12"></th>
            {/* Column headers (A, B, C, ...) */}
            {Array.from({ length: columnCount }).map((_, colIndex) => (
              <th
                key={colIndex}
                className="sticky top-0 z-10 bg-gray-100 border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 min-w-[100px]"
              >
                {columnIndexToLetter(colIndex)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }, (_, rowIndex) => {
            const rowData = rows[rowIndex] || [];
            return (
              <tr key={rowIndex}>
                {/* Row number */}
                <td className="sticky left-0 z-10 bg-gray-100 border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 text-center">
                  {rowIndex + 1}
                </td>
                {/* Cell data */}
                {Array.from({ length: columnCount }).map((_, colIndex) => (
                  <td
                    key={colIndex}
                    className="border border-gray-300 px-2 py-1 text-sm text-gray-900 min-h-[24px]"
                  >
                    {rowData[colIndex] || ''}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
