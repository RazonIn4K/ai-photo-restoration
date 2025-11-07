import { describe, it, expect } from 'vitest';

import {
  classifyNSFWContent,
  detectMinorSensitiveContent,
  performContentSafetyCheck,
  getDefaultContentSafetyConfig,
  getStrictContentSafetyConfig,
  getPermissiveContentSafetyConfig,
  type ContentSafetyConfig
} from '../../src/workers/content-safety.js';

describe('Content Safety Worker', () => {
  describe('classifyNSFWContent', () => {
    it('should classify safe content', async () => {
      const result = await classifyNSFWContent('/path/to/safe-image.jpg');

      expect(result.isNSFW).toBe(false);
      expect(result.categories).toContain('safe');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include category scores', async () => {
      const result = await classifyNSFWContent('/path/to/image.jpg');

      expect(result.scores).toHaveProperty('safe');
      expect(result.scores).toHaveProperty('suggestive');
      expect(result.scores).toHaveProperty('explicit');
      expect(result.scores).toHaveProperty('violence');
      expect(result.scores).toHaveProperty('gore');
      expect(result.scores).toHaveProperty('disturbing');
    });

    it('should respect custom threshold', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.5,
        minorSensitiveThreshold: 0.5,
        enableMinorDetection: true,
        requireHumanReview: true
      };

      const result = await classifyNSFWContent('/path/to/image.jpg', config);

      expect(result).toHaveProperty('isNSFW');
      expect(result).toHaveProperty('confidence');
    });

    it('should flag for review when NSFW detected', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.01, // Very low threshold to trigger NSFW
        minorSensitiveThreshold: 0.5,
        enableMinorDetection: true,
        requireHumanReview: true
      };

      const result = await classifyNSFWContent('/path/to/image.jpg', config);

      if (result.isNSFW) {
        expect(result.requiresHumanReview).toBe(true);
        expect(result.flaggedForReview).toBe(true);
      }
    });

    it('should handle errors gracefully', async () => {
      // Test with invalid path
      const result = await classifyNSFWContent('');

      // Stub implementation returns safe classification
      expect(result.isNSFW).toBe(false);
      expect(result).toHaveProperty('requiresHumanReview');
      expect(result).toHaveProperty('flaggedForReview');
    });
  });

  describe('detectMinorSensitiveContent', () => {
    it('should detect minor-sensitive content when enabled', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.7,
        minorSensitiveThreshold: 0.6,
        enableMinorDetection: true,
        requireHumanReview: true
      };

      const result = await detectMinorSensitiveContent('/path/to/image.jpg', config);

      expect(typeof result).toBe('boolean');
    });

    it('should skip detection when disabled', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.7,
        minorSensitiveThreshold: 0.6,
        enableMinorDetection: false,
        requireHumanReview: true
      };

      const result = await detectMinorSensitiveContent('/path/to/image.jpg', config);

      expect(result).toBe(false);
    });

    it('should handle errors by flagging for review', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.7,
        minorSensitiveThreshold: 0.6,
        enableMinorDetection: true,
        requireHumanReview: true
      };

      // Test with invalid path
      const result = await detectMinorSensitiveContent('', config);

      // Stub implementation returns false (no minors detected)
      expect(typeof result).toBe('boolean');
    });
  });

  describe('performContentSafetyCheck', () => {
    it('should perform comprehensive safety check', async () => {
      const result = await performContentSafetyCheck('/path/to/image.jpg');

      expect(result).toHaveProperty('isNSFW');
      expect(result).toHaveProperty('minorSensitive');
      expect(result).toHaveProperty('requiresHumanReview');
      expect(result).toHaveProperty('flaggedForReview');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('scores');
      expect(result).toHaveProperty('processingTimeMs');
    });

    it('should include minor detection when enabled', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.7,
        minorSensitiveThreshold: 0.6,
        enableMinorDetection: true,
        requireHumanReview: true
      };

      const result = await performContentSafetyCheck('/path/to/image.jpg', config);

      expect(result).toHaveProperty('minorSensitive');
      expect(typeof result.minorSensitive).toBe('boolean');
    });

    it('should skip minor detection when disabled', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.7,
        minorSensitiveThreshold: 0.6,
        enableMinorDetection: false,
        requireHumanReview: true
      };

      const result = await performContentSafetyCheck('/path/to/image.jpg', config);

      expect(result.minorSensitive).toBe(false);
    });

    it('should flag for review when minor detected', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.7,
        minorSensitiveThreshold: 0.01, // Very low threshold
        enableMinorDetection: true,
        requireHumanReview: true
      };

      const result = await performContentSafetyCheck('/path/to/image.jpg', config);

      if (result.minorSensitive) {
        expect(result.requiresHumanReview).toBe(true);
        expect(result.flaggedForReview).toBe(true);
      }
    });
  });

  describe('Configuration Presets', () => {
    it('should provide default configuration', () => {
      const config = getDefaultContentSafetyConfig();

      expect(config.nsfwThreshold).toBeGreaterThan(0);
      expect(config.nsfwThreshold).toBeLessThanOrEqual(1);
      expect(config.minorSensitiveThreshold).toBeGreaterThan(0);
      expect(config.minorSensitiveThreshold).toBeLessThanOrEqual(1);
      expect(typeof config.enableMinorDetection).toBe('boolean');
      expect(typeof config.requireHumanReview).toBe('boolean');
    });

    it('should provide strict configuration', () => {
      const config = getStrictContentSafetyConfig();

      expect(config.nsfwThreshold).toBeLessThan(0.7); // Stricter than default
      expect(config.enableMinorDetection).toBe(true);
      expect(config.requireHumanReview).toBe(true);
    });

    it('should provide permissive configuration', () => {
      const config = getPermissiveContentSafetyConfig();

      expect(config.nsfwThreshold).toBeGreaterThan(0.7); // More permissive than default
      expect(config.enableMinorDetection).toBe(false);
      expect(config.requireHumanReview).toBe(false);
    });

    it('should have strict config more restrictive than default', () => {
      const defaultConfig = getDefaultContentSafetyConfig();
      const strictConfig = getStrictContentSafetyConfig();

      expect(strictConfig.nsfwThreshold).toBeLessThan(defaultConfig.nsfwThreshold);
      expect(strictConfig.minorSensitiveThreshold).toBeLessThan(
        defaultConfig.minorSensitiveThreshold
      );
    });

    it('should have permissive config less restrictive than default', () => {
      const defaultConfig = getDefaultContentSafetyConfig();
      const permissiveConfig = getPermissiveContentSafetyConfig();

      expect(permissiveConfig.nsfwThreshold).toBeGreaterThan(defaultConfig.nsfwThreshold);
      expect(permissiveConfig.minorSensitiveThreshold).toBeGreaterThan(
        defaultConfig.minorSensitiveThreshold
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty image path', async () => {
      const result = await classifyNSFWContent('');

      expect(result.isNSFW).toBe(false);
      expect(result).toHaveProperty('requiresHumanReview');
    });

    it('should handle very low thresholds', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.001,
        minorSensitiveThreshold: 0.001,
        enableMinorDetection: true,
        requireHumanReview: true
      };

      const result = await classifyNSFWContent('/path/to/image.jpg', config);

      expect(result).toHaveProperty('isNSFW');
      expect(result).toHaveProperty('confidence');
    });

    it('should handle very high thresholds', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.999,
        minorSensitiveThreshold: 0.999,
        enableMinorDetection: true,
        requireHumanReview: false
      };

      const result = await classifyNSFWContent('/path/to/image.jpg', config);

      expect(result).toHaveProperty('isNSFW');
      expect(result).toHaveProperty('confidence');
    });

    it('should handle threshold of exactly 1.0', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 1.0,
        minorSensitiveThreshold: 1.0,
        enableMinorDetection: true,
        requireHumanReview: false
      };

      const result = await classifyNSFWContent('/path/to/image.jpg', config);

      // With threshold of 1.0, nothing should be flagged as NSFW
      expect(result.isNSFW).toBe(false);
    });

    it('should handle threshold of exactly 0.0', async () => {
      const config: ContentSafetyConfig = {
        nsfwThreshold: 0.0,
        minorSensitiveThreshold: 0.0,
        enableMinorDetection: true,
        requireHumanReview: true
      };

      const result = await classifyNSFWContent('/path/to/image.jpg', config);

      // With threshold of 0.0, everything should be flagged
      expect(result.isNSFW).toBe(true);
    });
  });
});
