/**
 * Multi-Model Validation System
 * Uses a second AI model to validate and fix the first model's responses
 */

import { callAIModel } from './index';

export interface ValidationResult {
  isValid: boolean;
  correctedResponse?: any;
  validationReason?: string;
}

export async function validateAndFixResponse(
  originalResponse: any,
  userMessage: string,
  documentContext: any,
  selectedModel: string
): Promise<ValidationResult> {
  console.log('🔍 Starting multi-model validation...');
  
  try {
    // Create validation prompt for the second model
    const validationPrompt = createValidationPrompt(originalResponse, userMessage, documentContext);
    
    // Use Claude as the validator model for better validation
    const validatorModel = 'claude-4.5-sonnet';
    
    const validationResponse = await callAIModel(
      validatorModel,
      [
        {
          role: 'system',
          content: validationPrompt
        },
        {
          role: 'user',
          content: `Please validate this AI response for spreadsheet operations:\n\n${JSON.stringify(originalResponse, null, 2)}`
        }
      ],
      validationPrompt
    );
    
    console.log('📋 Validation response:', validationResponse);
    
    // Parse validation response
    const validationResult = parseValidationResponse(validationResponse);
    
    if (!validationResult.isValid && validationResult.correctedResponse) {
      console.log('✅ Validation found issues, returning corrected response');
      return {
        isValid: false,
        correctedResponse: validationResult.correctedResponse,
        validationReason: validationResult.validationReason
      };
    }
    
    console.log('✅ Validation passed, original response is correct');
    return {
      isValid: true,
      validationReason: 'Response validated successfully'
    };
    
  } catch (error) {
    console.error('❌ Validation error:', error);
    return {
      isValid: true, // Default to valid if validation fails
      validationReason: 'Validation failed, using original response'
    };
  }
}

function createValidationPrompt(originalResponse: any, userMessage: string, documentContext: any): string {
  return `You are a spreadsheet operation validator. Your job is to validate AI responses for Google Sheets operations and fix any issues.

CRITICAL VALIDATION RULES:
1. Check if the AI used the correct operation type for calculations
2. Verify that formulas are used instead of descriptive text
3. Ensure proper cell references and sheet names
4. Validate that calculations will not produce #VALUE! errors

COMMON ISSUES TO DETECT AND FIX:
- Using "update_range" with descriptive text instead of "update_formula" with actual formulas
- Putting text like "Current Value tied up in inventory assets" in calculation cells
- Missing proper Excel formulas (=SUM, =AVERAGE, =COUNT, etc.)
- Incorrect cell references or sheet names

VALIDATION PROCESS:
1. Analyze the AI response for spreadsheet operations
2. Check if calculations use proper formulas
3. Verify operation types are correct
4. If issues found, provide corrected response

RESPONSE FORMAT:
If the response is CORRECT, return:
{
  "isValid": true,
  "reason": "Response is correct"
}

If the response has ISSUES, return:
{
  "isValid": false,
  "correctedResponse": {
    "response": "Corrected response message",
    "edit": {
      "type": "update_formula",
      "cell": "SUMMARY!B2",
      "formula": "=SUM(Sheet1!B1:B10)",
      "confidence": "high",
      "reasoning": "Fixed calculation to use proper formula"
    }
  },
  "validationReason": "Fixed update_range to update_formula with proper formula"
}

ALWAYS prioritize fixing formula issues over other problems.`;
}

function parseValidationResponse(response: string): any {
  try {
    // Clean the response
    let cleanResponse = response.trim();
    
    // Look for JSON within markdown code blocks
    const jsonMatch = cleanResponse.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      cleanResponse = jsonMatch[1];
    } else if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    return JSON.parse(cleanResponse);
  } catch (error) {
    console.error('Failed to parse validation response:', error);
    return {
      isValid: true,
      validationReason: 'Could not parse validation response'
    };
  }
}
