import { beforeEach, describe, expect, it, vi } from 'vitest';

import { generateAltText, generateBatchAltText, validateAltText } from '../../src/services/alt-text.js';

// Mock the config module
vi.mock('../../src/config/index.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    useMockDashboard: vi.fn(() => true)
  };
});

describe('Alt-Text Service', () => {
  beforeEach(() => {
    // Set mock mode for tests
    process.env.USE_MOCK_DASHBOARD = '1';
  });

  describe('generateAltText', () => {
    it('should generate alt-text suggestion in mock mode', async () => {
      const result = await generateAltText({
        assetId: 'test-asset-123'
      });

      expect(result).toBeDefined();
      expect(result.assetId).toBe('test-asset-123');
      expect(result.suggestedAltText).toBeDefined();
      expect(typeof result.suggestedAltText).toBe('string');
      expect(result.suggestedAltText.length).toBeGreaterThan(0);
      expect(result.confidence).toBeGreaterThanOrEqual(0.85);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
      expect(Array.isArray(result.keywords)).toBe(true);
      expect(result.keywords.length).toBeGreaterThan(0);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should include context in suggestion when provided', async () => {
      const result = await generateAltText({
        assetId: 'test-asset-456',
        context: {
          intentCategory: 'colorize_only'
        }
      });

      expect(result.suggestedAltText).toContain('Colorized');
      expect(result.keywords).toContain('colorized');
    });

    it('should handle restore_heavy_damage intent', async () => {
      const result = await generateAltText({
        assetId: 'test-asset-789',
        context: {
          intentCategory: 'restore_heavy_damage'
        }
      });

      expect(result.suggestedAltText.toLowerCase()).toContain('damaged');
      expect(result.keywords).toContain('reconstructed');
    });

    it('should handle simple_enhance intent', async () => {
      const result = await generateAltText({
        assetId: 'test-asset-101',
        context: {
          intentCategory: 'simple_enhance'
        }
      });

      expect(result.suggestedAltText.toLowerCase()).toContain('enhanced');
      expect(result.keywords).toContain('enhanced');
    });
  });

  describe('generateBatchAltText', () => {
    it('should generate multiple suggestions', async () => {
      const requests = [
        { assetId: 'asset-1' },
        { assetId: 'asset-2' },
        { assetId: 'asset-3' }
      ];

      const results = await generateBatchAltText(requests);

      expect(results).toHaveLength(3);
      expect(results[0].assetId).toBe('asset-1');
      expect(results[1].assetId).toBe('asset-2');
      expect(results[2].assetId).toBe('asset-3');

      results.forEach(result => {
        expect(result.suggestedAltText).toBeDefined();
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.keywords.length).toBeGreaterThan(0);
      });
    });

    it('should handle empty batch', async () => {
      const results = await generateBatchAltText([]);
      expect(results).toHaveLength(0);
    });
  });

  describe('validateAltText', () => {
    it('should pass valid alt-text', () => {
      const validation = validateAltText('A restored vintage family photograph from the 1940s');

      expect(validation.valid).toBe(true);
      expect(validation.warnings).toHaveLength(0);
      expect(validation.suggestions).toHaveLength(0);
    });

    it('should warn about excessive length', () => {
      const longText = 'A'.repeat(150);
      const validation = validateAltText(longText);

      expect(validation.valid).toBe(false);
      expect(validation.warnings).toContain('Alt-text exceeds recommended length of 125 characters');
      expect(validation.suggestions.length).toBeGreaterThan(0);
    });

    it('should warn about redundant phrases', () => {
      const validation = validateAltText('Image of a restored photograph');

      expect(validation.valid).toBe(false);
      expect(validation.warnings).toContain('Alt-text starts with redundant phrase');
      expect(validation.suggestions.some(s => s.includes('Remove phrases'))).toBe(true);
    });

    it('should detect empty alt-text', () => {
      const validation = validateAltText('');

      expect(validation.valid).toBe(false);
      expect(validation.warnings).toContain('Alt-text is empty');
    });

    it('should detect generic descriptions', () => {
      const validation = validateAltText('photo');

      expect(validation.valid).toBe(false);
      expect(validation.warnings).toContain('Alt-text is too generic');
    });

    it('should handle multiple issues', () => {
      const validation = validateAltText('Image of '.repeat(30)); // Long and redundant

      expect(validation.valid).toBe(false);
      expect(validation.warnings.length).toBeGreaterThan(1);
      expect(validation.suggestions.length).toBeGreaterThan(1);
    });
  });
});
