/**
 * Alt-Text Suggestion Service
 * Provides AI-generated alt-text suggestions for restored images
 */

import { useMockDashboard } from '../config/index.js';
import { logger } from '../lib/logger.js';

export interface AltTextSuggestion {
  assetId: string;
  suggestedAltText: string;
  confidence: number;
  keywords: string[];
  generatedAt: Date;
}

export interface GenerateAltTextOptions {
  assetId: string;
  imageUrl?: string;
  context?: {
    userRequest?: string;
    intentCategory?: string;
  };
}

/**
 * Generate mock alt-text suggestions for development
 */
function generateMockAltText(options: GenerateAltTextOptions): AltTextSuggestion {
  const templates = [
    'A restored vintage photograph showing a family portrait with enhanced clarity and color',
    'Black and white photograph digitally restored with improved contrast and detail',
    'Historical photo from the early 1900s, professionally restored with AI enhancement',
    'Colorized restoration of an old family photograph, showing improved detail and vibrancy',
    'Digitally enhanced vintage photograph with reduced damage and improved sharpness'
  ];

  const keywords = [
    'vintage',
    'restored',
    'photograph',
    'family',
    'historical',
    'enhanced',
    'AI-restored'
  ];

  // Select template based on context
  let selectedTemplate = templates[Math.floor(Math.random() * templates.length)];
  let contextKeywords: string[] = [];

  if (options.context?.intentCategory) {
    switch (options.context.intentCategory) {
      case 'colorize_only':
        selectedTemplate = 'Colorized vintage photograph with restored color accuracy';
        contextKeywords = ['colorized', 'color-restoration'];
        break;
      case 'restore_heavy_damage':
        selectedTemplate = 'Heavily damaged photograph digitally restored with AI reconstruction';
        contextKeywords = ['reconstructed', 'damage-repair'];
        break;
      case 'simple_enhance':
        selectedTemplate = 'Enhanced vintage photograph with improved clarity and contrast';
        contextKeywords = ['enhanced', 'clarity'];
        break;
    }
  }

  // Combine keywords: context-specific first, then base keywords (to ensure context ones are included)
  const allKeywords = [...new Set([...contextKeywords, ...keywords])];

  return {
    assetId: options.assetId,
    suggestedAltText: selectedTemplate,
    confidence: 0.85 + Math.random() * 0.15, // 0.85-1.0
    keywords: allKeywords.slice(0, 8), // Include context-specific keywords first
    generatedAt: new Date()
  };
}

/**
 * Generate alt-text suggestions for an asset
 * Uses mock data when USE_MOCK_DASHBOARD is enabled
 */
export async function generateAltText(
  options: GenerateAltTextOptions
): Promise<AltTextSuggestion> {
  if (useMockDashboard()) {
    logger.info({ assetId: options.assetId, mode: 'mock' }, 'Generating mock alt-text suggestion');
    return generateMockAltText(options);
  }

  // Production path: would integrate with actual AI service
  logger.info({ assetId: options.assetId }, 'Generating alt-text suggestion via AI service');

  // TODO: Integrate with actual AI service (e.g., OpenAI Vision, Azure Computer Vision)
  // For now, return a placeholder
  return {
    assetId: options.assetId,
    suggestedAltText: 'Restored historical photograph (AI service not configured)',
    confidence: 0.5,
    keywords: ['restored', 'photograph'],
    generatedAt: new Date()
  };
}

/**
 * Batch generate alt-text for multiple assets
 */
export async function generateBatchAltText(
  requests: GenerateAltTextOptions[]
): Promise<AltTextSuggestion[]> {
  logger.info({ count: requests.length }, 'Batch generating alt-text suggestions');

  const results = await Promise.all(
    requests.map(request => generateAltText(request))
  );

  return results;
}

/**
 * Validate alt-text meets accessibility guidelines
 */
export function validateAltText(altText: string): {
  valid: boolean;
  warnings: string[];
  suggestions: string[];
} {
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check length (WCAG recommends 125 characters or less for concise alt-text)
  if (altText.length > 125) {
    warnings.push('Alt-text exceeds recommended length of 125 characters');
    suggestions.push('Consider condensing the description to focus on key visual elements');
  }

  // Check if it starts with redundant phrases
  const redundantPhrases = [
    'image of',
    'picture of',
    'photo of',
    'photograph of',
    'graphic of'
  ];

  const lowerAltText = altText.toLowerCase();
  const startsWithRedundant = redundantPhrases.some(phrase =>
    lowerAltText.startsWith(phrase)
  );

  if (startsWithRedundant) {
    warnings.push('Alt-text starts with redundant phrase');
    suggestions.push('Remove phrases like "image of" or "photo of" - they add no value');
  }

  // Check for meaningful content
  if (altText.trim().length === 0) {
    warnings.push('Alt-text is empty');
    suggestions.push('Provide a meaningful description of the image content');
  }

  // Check for overly generic descriptions
  const genericPhrases = ['photo', 'image', 'picture'];
  if (genericPhrases.includes(altText.toLowerCase().trim())) {
    warnings.push('Alt-text is too generic');
    suggestions.push('Describe the specific content, not just that it is an image');
  }

  return {
    valid: warnings.length === 0,
    warnings,
    suggestions
  };
}
