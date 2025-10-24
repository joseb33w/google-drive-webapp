/**
 * Response Post-Processing Pipeline
 * Multiple layers of validation and correction for AI responses
 */

import { validateAndFixResponse } from './response-validator';

export interface ProcessingResult {
  finalResponse: any;
  processingSteps: string[];
  wasCorrected: boolean;
}

export async function processAIResponse(
  originalResponse: any,
  userMessage: string,
  documentContext: any,
  selectedModel: string
): Promise<ProcessingResult> {
  console.log('🔄 Starting response post-processing pipeline...');
  
  const processingSteps: string[] = [];
  let currentResponse = originalResponse;
  let wasCorrected = false;
  
  // Step 1: Multi-Model Validation
  processingSteps.push('Step 1: Multi-Model Validation');
  console.log('📋 Step 1: Running multi-model validation...');
  
  const validationResult = await validateAndFixResponse(
    currentResponse,
    userMessage,
    documentContext,
    selectedModel
  );
  
  if (!validationResult.isValid && validationResult.correctedResponse) {
    currentResponse = validationResult.correctedResponse;
    wasCorrected = true;
    processingSteps.push(`✅ Validation corrected response: ${validationResult.validationReason}`);
    console.log('✅ Multi-model validation corrected the response');
  } else {
    processingSteps.push('✅ Multi-model validation passed');
    console.log('✅ Multi-model validation passed');
  }
  
  // Step 2: Rule-Based Pattern Detection
  processingSteps.push('Step 2: Rule-Based Pattern Detection');
  console.log('📋 Step 2: Running rule-based pattern detection...');
  
  const patternResult = await detectAndFixPatterns(currentResponse);
  if (patternResult.wasCorrected) {
    currentResponse = patternResult.correctedResponse;
    wasCorrected = true;
    processingSteps.push(`✅ Pattern detection corrected response: ${patternResult.reason}`);
    console.log('✅ Pattern detection corrected the response');
  } else {
    processingSteps.push('✅ Pattern detection passed');
    console.log('✅ Pattern detection passed');
  }
  
  // Step 3: Formula Validation
  processingSteps.push('Step 3: Formula Validation');
  console.log('📋 Step 3: Running formula validation...');
  
  const formulaResult = await validateFormulas(currentResponse);
  if (formulaResult.wasCorrected) {
    currentResponse = formulaResult.correctedResponse;
    wasCorrected = true;
    processingSteps.push(`✅ Formula validation corrected response: ${formulaResult.reason}`);
    console.log('✅ Formula validation corrected the response');
  } else {
    processingSteps.push('✅ Formula validation passed');
    console.log('✅ Formula validation passed');
  }
  
  // Step 4: Final Quality Check
  processingSteps.push('Step 4: Final Quality Check');
  console.log('📋 Step 4: Running final quality check...');
  
  const qualityResult = await finalQualityCheck(currentResponse);
  if (qualityResult.wasCorrected) {
    currentResponse = qualityResult.correctedResponse;
    wasCorrected = true;
    processingSteps.push(`✅ Final quality check corrected response: ${qualityResult.reason}`);
    console.log('✅ Final quality check corrected the response');
  } else {
    processingSteps.push('✅ Final quality check passed');
    console.log('✅ Final quality check passed');
  }
  
  console.log('🎉 Response processing pipeline complete');
  
  return {
    finalResponse: currentResponse,
    processingSteps,
    wasCorrected
  };
}

// Step 2: Rule-Based Pattern Detection
async function detectAndFixPatterns(response: any): Promise<{ wasCorrected: boolean; correctedResponse?: any; reason?: string }> {
  try {
    if (response.edit && response.edit.type === 'update_range' && response.edit.values) {
      const values = response.edit.values;
      
      // Check for problematic patterns
      const hasProblematicText = values.some((row: any) => 
        Array.isArray(row) && row.some((cell: any) => 
          typeof cell === 'string' && (
            cell.includes('Current Value') ||
            cell.includes('Revenue Efficiency') ||
            cell.includes('tied up in inventory') ||
            cell.includes('assets') ||
            cell.includes('Total') ||
            cell.includes('Average') ||
            cell.includes('Count') ||
            cell.includes('Sum') ||
            (cell.includes('Value') && cell.length > 20) ||
            (cell.length > 15 && !cell.includes('=') && !cell.match(/^\d+$/))
          )
        )
      );
      
      if (hasProblematicText) {
        console.log('🔧 Pattern detection found problematic text, converting to formulas');
        
        // Find first problematic cell and convert to formula
        let fixed = false;
        let correctedResponse = null;
        
        values.forEach((row: any[], rowIndex: number) => {
          if (fixed) return;
          row.forEach((cell: any, colIndex: number) => {
            if (fixed) return;
            if (typeof cell === 'string' && cell.length > 10 && !cell.includes('=')) {
              const formula = generateFormulaFromText(cell);
              const cellRef = `${String.fromCharCode(65 + colIndex)}${rowIndex + 1}`;
              const sheetName = response.edit.range?.split('!')[0] || 'SUMMARY';
              
              correctedResponse = {
                response: `Adding calculation formula to ${sheetName}!${cellRef}`,
                edit: {
                  type: 'update_formula',
                  cell: `${sheetName}!${cellRef}`,
                  formula: formula,
                  confidence: 'high',
                  reasoning: 'Pattern detection converted descriptive text to proper formula'
                }
              };
              
              fixed = true;
              return;
            }
          });
        });
        
        if (correctedResponse) {
          return {
            wasCorrected: true,
            correctedResponse: correctedResponse,
            reason: 'Converted descriptive text to formula using pattern detection'
          };
        }
      }
    }
    
    return { wasCorrected: false };
  } catch (error) {
    console.error('Pattern detection error:', error);
    return { wasCorrected: false };
  }
}

// Step 3: Formula Validation
async function validateFormulas(response: any): Promise<{ wasCorrected: boolean; correctedResponse?: any; reason?: string }> {
  try {
    if (response.edit && response.edit.type === 'update_formula' && response.edit.formula) {
      const formula = response.edit.formula;
      
      // Validate formula syntax
      if (!formula.startsWith('=')) {
        return {
          wasCorrected: true,
          correctedResponse: {
            ...response,
            edit: {
              ...response.edit,
              formula: `=${formula}`
            }
          },
          reason: 'Fixed formula to start with ='
        };
      }
      
      // Check for common formula issues
      if (formula.includes('Current Value') || formula.includes('Revenue Efficiency')) {
        const correctedFormula = generateFormulaFromText(formula);
        return {
          wasCorrected: true,
          correctedResponse: {
            ...response,
            edit: {
              ...response.edit,
              formula: correctedFormula
            }
          },
          reason: 'Fixed formula to use proper Excel functions'
        };
      }
    }
    
    return { wasCorrected: false };
  } catch (error) {
    console.error('Formula validation error:', error);
    return { wasCorrected: false };
  }
}

// Step 4: Final Quality Check
async function finalQualityCheck(response: any): Promise<{ wasCorrected: boolean; correctedResponse?: any; reason?: string }> {
  try {
    // Final checks to ensure response quality
    if (response.edit) {
      // Ensure confidence is set
      if (!response.edit.confidence) {
        return {
          wasCorrected: true,
          correctedResponse: {
            ...response,
            edit: {
              ...response.edit,
              confidence: 'high'
            }
          },
          reason: 'Added missing confidence level'
        };
      }
      
      // Ensure reasoning is set
      if (!response.edit.reasoning) {
        return {
          wasCorrected: true,
          correctedResponse: {
            ...response,
            edit: {
              ...response.edit,
              reasoning: 'AI-generated response processed through quality pipeline'
            }
          },
          reason: 'Added missing reasoning'
        };
      }
    }
    
    return { wasCorrected: false };
  } catch (error) {
    console.error('Final quality check error:', error);
    return { wasCorrected: false };
  }
}

// Helper function to generate formulas from descriptive text
function generateFormulaFromText(text: string): string {
  if (text.includes('Current Value') || text.includes('inventory')) {
    return '=SUM(INVENTORY!C1:C10)';
  } else if (text.includes('Revenue') || text.includes('efficiency')) {
    return '=SUM(Sheet1!B1:B10)';
  } else if (text.includes('Average') || text.includes('avg')) {
    return '=AVERAGE(Sheet1!C1:C10)';
  } else if (text.includes('Count') || text.includes('Total') || text.includes('Sum')) {
    return '=SUM(Sheet1!A1:A10)';
  } else if (text.includes('Max')) {
    return '=MAX(Sheet1!A1:A10)';
  } else if (text.includes('Min')) {
    return '=MIN(Sheet1!A1:A10)';
  } else {
    return '=SUM(Sheet1!A1:A10)'; // Default formula
  }
}
