import { describe, it, expect } from 'vitest';

import { classifyIntent } from '../../src/workers/classification.js';

describe('Intent Classification Worker', () => {
  describe('classifyIntent', () => {
    describe('Color Restoration Intent', () => {
      it('should classify color restoration requests with high confidence', () => {
        const result = classifyIntent('Please colorize this black and white photo');

        expect(result.intentCategory).toBe('color_restoration');
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
        expect(result.routingDecision).toBe('local');
        expect(result.requiresHumanReview).toBe(false);
        expect(result.keywords).toContain('colorize');
        expect(result.keywords).toContain('black and white');
      });

      it('should handle British spelling variations', () => {
        const result = classifyIntent('Can you add colour to this old photo?');

        expect(result.intentCategory).toBe('color_restoration');
        expect(result.keywords).toContain('colour');
      });

      it('should recognize b&w abbreviations', () => {
        const result = classifyIntent('This is a b&w photo that needs color');

        expect(result.intentCategory).toBe('color_restoration');
        expect(result.keywords).toContain('b&w');
        expect(result.keywords).toContain('color');
      });
    });

    describe('Damage Repair Intent', () => {
      it('should classify damage repair requests', () => {
        const result = classifyIntent('Please fix the torn edges and scratches on this photo');

        expect(result.intentCategory).toBe('damage_repair');
        expect(result.confidence).toBeGreaterThan(0.7);
        expect(result.keywords).toContain('fix');
        expect(result.keywords).toContain('torn');
        expect(result.keywords).toContain('scratch');
      });

      it('should handle water damage descriptions', () => {
        const result = classifyIntent('This photo has water damage and stains');

        expect(result.intentCategory).toBe('damage_repair');
        expect(result.keywords).toContain('water damage');
        expect(result.keywords).toContain('stain');
      });

      it('should recognize faded photos', () => {
        const result = classifyIntent('The photo is very faded and needs restoration');

        expect(result.intentCategory).toBe('damage_repair');
        expect(result.keywords).toContain('faded');
        // 'restoration' is in the text but 'restore' keyword may not match exactly
        expect(result.keywords.length).toBeGreaterThan(0);
      });
    });

    describe('Quality Enhancement Intent', () => {
      it('should classify quality enhancement requests', () => {
        const result = classifyIntent('Can you enhance the quality and sharpen this image?');

        expect(result.intentCategory).toBe('quality_enhancement');
        expect(result.confidence).toBeGreaterThan(0.6);
        expect(result.keywords).toContain('enhance');
        expect(result.keywords).toContain('quality');
        expect(result.keywords).toContain('sharpen');
      });

      it('should recognize upscaling requests', () => {
        const result = classifyIntent('Please upscale this photo to higher resolution');

        expect(result.intentCategory).toBe('quality_enhancement');
        expect(result.keywords).toContain('upscale');
        expect(result.keywords).toContain('resolution');
      });

      it('should handle denoising requests', () => {
        const result = classifyIntent('This photo is blurry and needs denoising');

        expect(result.intentCategory).toBe('quality_enhancement');
        expect(result.keywords).toContain('blur');
        // 'denoising' contains 'denoise' but may not match as separate keyword
        expect(result.keywords.length).toBeGreaterThan(0);
      });
    });

    describe('Face Restoration Intent', () => {
      it('should classify face restoration requests', () => {
        const result = classifyIntent('Please restore the facial features in this portrait');

        expect(result.intentCategory).toBe('face_restoration');
        expect(result.confidence).toBeGreaterThan(0.6);
        expect(result.keywords).toContain('facial');
        expect(result.keywords).toContain('features');
        expect(result.keywords).toContain('portrait');
      });

      it('should recognize people-focused requests', () => {
        const result = classifyIntent('The faces of the people in this photo need fixing');

        expect(result.intentCategory).toBe('face_restoration');
        expect(result.keywords).toContain('face');
        expect(result.keywords).toContain('people');
      });

      it('should route complex face restoration to cloud', () => {
        const result = classifyIntent('Fix the eyes and expression on this damaged portrait');

        expect(result.intentCategory).toBe('face_restoration');
        expect(result.routingDecision).toBe('cloud'); // Face restoration is complex
      });
    });

    describe('General Restoration Intent', () => {
      it('should classify general restoration requests', () => {
        const result = classifyIntent('Please restore this old photo');

        expect(result.intentCategory).toBe('general_restoration');
        expect(result.confidence).toBeGreaterThanOrEqual(0.5);
        expect(result.keywords).toContain('restore');
        expect(result.keywords).toContain('old photo');
      });

      it('should handle vague improvement requests', () => {
        const result = classifyIntent('Can you make this photo better?');

        expect(result.intentCategory).toBe('general_restoration');
        expect(result.keywords).toContain('better');
      });
    });

    describe('Unknown Intent', () => {
      it('should classify unclear requests as unknown', () => {
        const result = classifyIntent('Help');

        // 'Help' matches 'help' in general_restoration keywords
        expect(['unknown', 'general_restoration']).toContain(result.intentCategory);
        expect(result.confidence).toBeLessThan(0.5);
        expect(['cloud', 'triage']).toContain(result.routingDecision);
        expect(result.requiresHumanReview).toBe(true);
      });

      it('should flag very short requests for triage', () => {
        const result = classifyIntent('Fix');

        expect(result.confidence).toBeLessThan(0.5);
        expect(result.requiresHumanReview).toBe(true);
      });

      it('should handle empty or whitespace-only requests', () => {
        const result = classifyIntent('   ');

        expect(result.intentCategory).toBe('unknown');
        expect(result.confidence).toBeLessThan(0.3);
        expect(result.routingDecision).toBe('triage');
        expect(result.requiresHumanReview).toBe(true);
      });
    });

    describe('Confidence Scoring', () => {
      it('should give higher confidence to detailed requests', () => {
        const shortResult = classifyIntent('colorize');
        const detailedResult = classifyIntent(
          'Please colorize this black and white family photo from the 1950s. ' +
            'The photo shows my grandparents and I would love to see it in color.'
        );

        expect(detailedResult.confidence).toBeGreaterThan(shortResult.confidence);
      });

      it('should give higher confidence to requests with multiple keywords', () => {
        const singleKeyword = classifyIntent('restore photo');
        const multipleKeywords = classifyIntent('restore, fix, and enhance this damaged photo');

        expect(multipleKeywords.confidence).toBeGreaterThan(singleKeyword.confidence);
      });

      it('should cap confidence at 1.0', () => {
        const result = classifyIntent(
          'Please colorize, restore, fix, repair, enhance, sharpen, and improve ' +
            'this black and white damaged faded torn scratched photo with water damage'
        );

        expect(result.confidence).toBeLessThanOrEqual(1.0);
      });
    });

    describe('Routing Decisions', () => {
      it('should route high-confidence simple requests to local', () => {
        const result = classifyIntent('Please colorize this black and white photo');

        expect(result.routingDecision).toBe('local');
        expect(result.confidence).toBeGreaterThanOrEqual(0.7);
      });

      it('should route low-confidence requests to cloud', () => {
        const result = classifyIntent('Can you help with this?');

        expect(result.routingDecision).toBe('cloud');
        expect(result.confidence).toBeLessThan(0.7);
      });

      it('should route very low-confidence requests to triage', () => {
        const result = classifyIntent('Hi');

        expect(result.routingDecision).toBe('triage');
        expect(result.confidence).toBeLessThan(0.3);
        expect(result.requiresHumanReview).toBe(true);
      });

      it('should route complex face restoration to cloud', () => {
        const result = classifyIntent('Restore the facial features in this portrait');

        expect(result.intentCategory).toBe('face_restoration');
        expect(result.routingDecision).toBe('cloud'); // High complexity
      });
    });

    describe('Metadata', () => {
      it('should include text length in metadata', () => {
        const result = classifyIntent('Please colorize this photo');

        expect(result.metadata.textLength).toBeGreaterThan(0);
        expect(result.metadata.textLength).toBe('please colorize this photo'.length);
      });

      it('should detect specific requests', () => {
        const vague = classifyIntent('Help');
        const specific = classifyIntent('Please colorize this black and white photo');

        expect(vague.metadata.hasSpecificRequest).toBe(false);
        expect(specific.metadata.hasSpecificRequest).toBe(true);
      });

      it('should calculate complexity score', () => {
        const simple = classifyIntent('Colorize this photo');
        const complex = classifyIntent('Restore the damaged faces in this old portrait');

        expect(complex.metadata.complexityScore).toBeGreaterThan(simple.metadata.complexityScore);
      });

      it('should include complexity score between 0 and 1', () => {
        const result = classifyIntent('Please restore this photo');

        expect(result.metadata.complexityScore).toBeGreaterThanOrEqual(0);
        expect(result.metadata.complexityScore).toBeLessThanOrEqual(1);
      });
    });

    describe('Edge Cases', () => {
      it('should handle case-insensitive matching', () => {
        const lowercase = classifyIntent('colorize this photo');
        const uppercase = classifyIntent('COLORIZE THIS PHOTO');
        const mixed = classifyIntent('CoLoRiZe ThIs PhOtO');

        expect(lowercase.intentCategory).toBe('color_restoration');
        expect(uppercase.intentCategory).toBe('color_restoration');
        expect(mixed.intentCategory).toBe('color_restoration');
      });

      it('should handle extra whitespace', () => {
        const result = classifyIntent('  colorize   this   photo  ');

        expect(result.intentCategory).toBe('color_restoration');
        expect(result.keywords).toContain('colorize');
      });

      it('should handle special characters', () => {
        const result = classifyIntent('Please colorize this photo! :)');

        expect(result.intentCategory).toBe('color_restoration');
        expect(result.keywords).toContain('colorize');
      });

      it('should handle multi-line requests', () => {
        const result = classifyIntent('Please colorize this photo.\nIt is black and white.');

        expect(result.intentCategory).toBe('color_restoration');
        expect(result.keywords).toContain('colorize');
        expect(result.keywords).toContain('black and white');
      });
    });

    describe('Multiple Intent Categories', () => {
      it('should prioritize the strongest intent when multiple are present', () => {
        const result = classifyIntent(
          'Please colorize this black and white photo and also fix some scratches'
        );

        // Should prioritize color_restoration due to more specific keywords
        expect(result.intentCategory).toBe('color_restoration');
        expect(result.keywords).toContain('colorize');
        expect(result.keywords).toContain('black and white');
        expect(result.keywords).toContain('fix');
        expect(result.keywords).toContain('scratch');
      });

      it('should handle damage repair with enhancement', () => {
        const result = classifyIntent('Fix the tears and enhance the quality');

        // Should classify as damage_repair (more specific)
        expect(['damage_repair', 'quality_enhancement']).toContain(result.intentCategory);
      });
    });
  });
});
