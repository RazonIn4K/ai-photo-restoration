import { describe, expect, it } from 'vitest';

import {
  createRestorationManifest,
  extractActors,
  getActionSummary,
  isAIGenerated,
  parseManifest,
  serializeManifest,
  validateManifest
} from '../../src/metadata/c2pa.js';

describe('C2PA manifest helpers', () => {
  describe('createRestorationManifest', () => {
    it('creates a valid restoration manifest', () => {
      const manifest = createRestorationManifest({
        originalPostId: 'fb_123456',
        requestId: 'req_abc123',
        aiModel: 'CodeFormer-v1.0',
        approvedBy: 'operator@example.com',
        approvalTimestamp: new Date('2025-11-05T10:00:00Z'),
        restorationTimestamp: new Date('2025-11-05T11:00:00Z'),
        originalSHA256: '1234abcd'.repeat(8),
        restoredSHA256: '5678efgh'.repeat(8)
      });

      expect(manifest['@context']).toBe('https://c2pa.org/specifications/1.0/context');
      expect(manifest.type).toBe('ImageObject');
      expect(manifest.claimGenerator).toContain('Face Restore AI');
      expect(manifest.actions).toHaveLength(2); // AI inference + approval
      expect(manifest.ingredients).toHaveLength(1);
    });

    it('includes AI inference action', () => {
      const manifest = createRestorationManifest({
        originalPostId: 'fb_test',
        requestId: 'req_test',
        aiModel: 'TestModel-v1',
        restorationTimestamp: new Date('2025-11-05T12:00:00Z'),
        originalSHA256: 'abc123'.repeat(10)
      });

      const aiAction = manifest.actions?.find((a) => a.action === 'c2pa.ai.inference');
      expect(aiAction).toBeDefined();
      expect(aiAction?.softwareAgent).toBe('TestModel-v1');
      expect(aiAction?.digitalSourceType).toBe('trainedAlgorithmicMedia');
    });

    it('includes approval action when approver is provided', () => {
      const manifest = createRestorationManifest({
        originalPostId: 'fb_test',
        requestId: 'req_test',
        aiModel: 'TestModel',
        approvedBy: 'approver@test.com',
        approvalTimestamp: new Date('2025-11-05T10:00:00Z'),
        restorationTimestamp: new Date('2025-11-05T11:00:00Z'),
        originalSHA256: 'test123'.repeat(8)
      });

      const approvalAction = manifest.actions?.find((a) => a.action === 'c2pa.published');
      expect(approvalAction).toBeDefined();

      const approver = approvalAction?.participants?.find((p) => p.type === 'person');
      expect(approver?.name).toBe('approver@test.com');
    });

    it('includes original image as ingredient', () => {
      const originalHash = 'original123'.repeat(5);
      const manifest = createRestorationManifest({
        originalPostId: 'fb_parent',
        requestId: 'req_parent',
        aiModel: 'Model',
        restorationTimestamp: new Date(),
        originalSHA256: originalHash
      });

      expect(manifest.ingredients).toHaveLength(1);
      expect(manifest.ingredients?.[0].title).toBe('Original Photo (fb_parent)');
      expect(manifest.ingredients?.[0].hash).toBe(originalHash);
      expect(manifest.ingredients?.[0].relationship).toBe('parentOf');
    });
  });

  describe('validateManifest', () => {
    it('accepts a valid manifest', () => {
      const manifest = createRestorationManifest({
        originalPostId: 'fb_valid',
        requestId: 'req_valid',
        aiModel: 'ValidModel',
        restorationTimestamp: new Date(),
        originalSHA256: 'valid'.repeat(12)
      });

      const validation = validateManifest(manifest);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('rejects manifest without required context', () => {
      const invalidManifest = {
        type: 'ImageObject',
        claimGenerator: 'Test'
      } as any;

      const validation = validateManifest(invalidManifest);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required @context field');
    });

    it('rejects manifest without claim generator', () => {
      const invalidManifest = {
        '@context': 'https://c2pa.org/specifications/1.0/context',
        type: 'ImageObject'
      } as any;

      const validation = validateManifest(invalidManifest);
      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing required claimGenerator field');
    });
  });

  describe('serializeManifest and parseManifest', () => {
    it('serializes and parses manifests correctly', () => {
      const original = createRestorationManifest({
        originalPostId: 'fb_serialize',
        requestId: 'req_serialize',
        aiModel: 'SerializeModel',
        restorationTimestamp: new Date('2025-11-05T12:00:00Z'),
        originalSHA256: 'serialize'.repeat(7)
      });

      const serialized = serializeManifest(original);
      expect(typeof serialized).toBe('string');

      const parsed = parseManifest(serialized);
      expect(parsed['@context']).toBe(original['@context']);
      expect(parsed.claimGenerator).toBe(original.claimGenerator);
      expect(parsed.actions?.length).toBe(original.actions?.length);
    });

    it('handles invalid JSON in parseManifest', () => {
      const invalidJSON = '{ invalid json }';
      expect(() => parseManifest(invalidJSON)).toThrow();
    });

    it('preserves dates through serialization', () => {
      const testDate = new Date('2025-11-05T15:30:00Z');
      const manifest = createRestorationManifest({
        originalPostId: 'fb_date',
        requestId: 'req_date',
        aiModel: 'DateModel',
        restorationTimestamp: testDate,
        originalSHA256: 'dates'.repeat(10)
      });

      const serialized = serializeManifest(manifest);
      const parsed = parseManifest(serialized);

      const aiAction = parsed.actions?.find((a) => a.action === 'c2pa.ai.inference');
      expect(aiAction?.when).toBeDefined();
      expect(new Date(aiAction!.when as Date).toISOString()).toBe(testDate.toISOString());
    });
  });

  describe('getActionSummary', () => {
    it('summarizes manifest actions', () => {
      const manifest = createRestorationManifest({
        originalPostId: 'fb_summary',
        requestId: 'req_summary',
        aiModel: 'SummaryModel',
        approvedBy: 'approver@test.com',
        approvalTimestamp: new Date(),
        restorationTimestamp: new Date(),
        originalSHA256: 'summary'.repeat(8)
      });

      const summary = getActionSummary(manifest);
      expect(summary).toContain('c2pa.ai.inference');
      expect(summary).toContain('c2pa.published');
      expect(summary).toContain('SummaryModel');
    });

    it('handles manifest without actions', () => {
      const manifest = {
        '@context': 'https://c2pa.org/specifications/1.0/context',
        type: 'ImageObject' as const,
        claimGenerator: 'Test'
      };

      const summary = getActionSummary(manifest);
      expect(summary).toContain('No actions recorded');
    });
  });

  describe('isAIGenerated', () => {
    it('detects AI inference actions', () => {
      const manifest = createRestorationManifest({
        originalPostId: 'fb_ai',
        requestId: 'req_ai',
        aiModel: 'AIModel',
        restorationTimestamp: new Date(),
        originalSHA256: 'ai'.repeat(16)
      });

      expect(isAIGenerated(manifest)).toBe(true);
    });

    it('returns false for non-AI manifests', () => {
      const manifest = {
        '@context': 'https://c2pa.org/specifications/1.0/context',
        type: 'ImageObject' as const,
        claimGenerator: 'Manual Editor',
        actions: [
          {
            action: 'c2pa.edited' as const,
            when: new Date()
          }
        ]
      };

      expect(isAIGenerated(manifest)).toBe(false);
    });

    it('returns false for manifest without actions', () => {
      const manifest = {
        '@context': 'https://c2pa.org/specifications/1.0/context',
        type: 'ImageObject' as const,
        claimGenerator: 'Test'
      };

      expect(isAIGenerated(manifest)).toBe(false);
    });
  });

  describe('extractActors', () => {
    it('extracts actors from manifest actions', () => {
      const manifest = createRestorationManifest({
        originalPostId: 'fb_actors',
        requestId: 'req_actors',
        aiModel: 'ActorModel',
        approvedBy: 'operator@example.com',
        approvalTimestamp: new Date(),
        restorationTimestamp: new Date(),
        originalSHA256: 'actors'.repeat(8)
      });

      const actors = extractActors(manifest);
      expect(actors.length).toBeGreaterThan(0);

      const humanActor = actors.find((a) => a.type === 'person');
      expect(humanActor?.name).toBe('operator@example.com');

      const softwareActor = actors.find((a) => a.type === 'software');
      expect(softwareActor?.name).toBe('ActorModel');
    });

    it('returns empty array for manifest without participants', () => {
      const manifest = {
        '@context': 'https://c2pa.org/specifications/1.0/context',
        type: 'ImageObject' as const,
        claimGenerator: 'Test'
      };

      const actors = extractActors(manifest);
      expect(actors).toEqual([]);
    });
  });
});
