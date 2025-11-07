import { describe, it, expect } from 'vitest';

import {
  detectPlatform,
  selectComputeBackend,
  validateModelLicense,
  validatePipelineLicenses,
  buildComfyUIWorkflow,
  getDefaultPipelineConfig,
  type ComputeBackend,
  type PipelineConfig,
  type ComfyUINode
} from '../../src/workers/local-ai-pipeline.js';

describe('Local AI Pipeline Worker', () => {
  describe('detectPlatform', () => {
    it('should detect platform information', () => {
      const platformInfo = detectPlatform();

      expect(platformInfo).toHaveProperty('platform');
      expect(platformInfo).toHaveProperty('arch');
      expect(platformInfo).toHaveProperty('isAppleSilicon');
      expect(platformInfo).toHaveProperty('isWindows');
      expect(platformInfo).toHaveProperty('isLinux');
      expect(platformInfo).toHaveProperty('hasCuda');

      expect(typeof platformInfo.isAppleSilicon).toBe('boolean');
      expect(typeof platformInfo.isWindows).toBe('boolean');
      expect(typeof platformInfo.isLinux).toBe('boolean');
    });

    it('should correctly identify platform type', () => {
      const platformInfo = detectPlatform();

      // At least one platform flag should be true
      const platformFlags = [
        platformInfo.isAppleSilicon,
        platformInfo.isWindows,
        platformInfo.isLinux
      ];

      expect(platformFlags.some(flag => flag)).toBe(true);
    });
  });

  describe('selectComputeBackend', () => {
    it('should select MPS for Apple Silicon', () => {
      const platformInfo = {
        platform: 'darwin' as NodeJS.Platform,
        arch: 'arm64',
        isAppleSilicon: true,
        isWindows: false,
        isLinux: false,
        hasCuda: false
      };

      const backend = selectComputeBackend(platformInfo);
      expect(backend).toBe('mps');
    });

    it('should select DirectML for Windows', () => {
      const platformInfo = {
        platform: 'win32' as NodeJS.Platform,
        arch: 'x64',
        isAppleSilicon: false,
        isWindows: true,
        isLinux: false,
        hasCuda: false
      };

      const backend = selectComputeBackend(platformInfo);
      expect(backend).toBe('directml');
    });

    it('should select CUDA for Linux with CUDA', () => {
      const platformInfo = {
        platform: 'linux' as NodeJS.Platform,
        arch: 'x64',
        isAppleSilicon: false,
        isWindows: false,
        isLinux: true,
        hasCuda: true
      };

      const backend = selectComputeBackend(platformInfo);
      expect(backend).toBe('cuda');
    });

    it('should fallback to CPU when no GPU acceleration available', () => {
      const platformInfo = {
        platform: 'linux' as NodeJS.Platform,
        arch: 'x64',
        isAppleSilicon: false,
        isWindows: false,
        isLinux: true,
        hasCuda: false
      };

      const backend = selectComputeBackend(platformInfo);
      expect(backend).toBe('cpu');
    });
  });

  describe('validateModelLicense', () => {
    it('should validate MIT licensed models for commercial use', () => {
      const result = validateModelLicense('deoldify', true);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should validate Apache 2.0 licensed models for commercial use', () => {
      const result = validateModelLicense('gfpgan', true);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject CC-BY-NC models for commercial use', () => {
      const result = validateModelLicense('codeformer', true);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('does not allow commercial use');
      expect(result.reason).toContain('CodeFormer');
    });

    it('should allow CC-BY-NC models for non-commercial use', () => {
      const result = validateModelLicense('codeformer', false);

      expect(result.valid).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject unknown models', () => {
      const result = validateModelLicense('unknown-model', false);

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('not found in registry');
    });

    it('should be case-insensitive', () => {
      const lowercase = validateModelLicense('gfpgan', true);
      const uppercase = validateModelLicense('GFPGAN', true);
      const mixed = validateModelLicense('GfPgAn', true);

      expect(lowercase.valid).toBe(true);
      expect(uppercase.valid).toBe(true);
      expect(mixed.valid).toBe(true);
    });
  });

  describe('validatePipelineLicenses', () => {
    it('should validate all models in pipeline for non-commercial use', () => {
      const models = ['gfpgan', 'real-esrgan', 'deoldify', 'codeformer'];
      const result = validatePipelineLicenses(models, false);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should validate commercial-friendly models for commercial use', () => {
      const models = ['gfpgan', 'real-esrgan', 'deoldify'];
      const result = validatePipelineLicenses(models, true);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should reject pipeline with non-commercial models for commercial use', () => {
      const models = ['gfpgan', 'codeformer'];
      const result = validatePipelineLicenses(models, true);

      expect(result.valid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0]).toContain('CodeFormer');
      expect(result.violations[0]).toContain('does not allow commercial use');
    });

    it('should collect all violations', () => {
      const models = ['unknown-model-1', 'unknown-model-2'];
      const result = validatePipelineLicenses(models, false);

      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it('should handle empty model list', () => {
      const result = validatePipelineLicenses([], true);

      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });
  });

  describe('buildComfyUIWorkflow', () => {
    it('should build workflow with single model', () => {
      const config: PipelineConfig = {
        backend: 'mps',
        models: ['gfpgan'],
        maxResolution: 2048,
        enableNSFWFilter: true,
        preserveMetadata: true
      };

      const workflow = buildComfyUIWorkflow(config, '/input.jpg', '/output.jpg');

      expect(workflow).toHaveProperty('nodes');
      expect(workflow).toHaveProperty('connections');
      expect(workflow).toHaveProperty('metadata');
      expect(Array.isArray(workflow.nodes)).toBe(true);
      expect(workflow.nodes.length).toBeGreaterThan(0);
    });

    it('should build workflow with multiple models', () => {
      const config: PipelineConfig = {
        backend: 'directml',
        models: ['gfpgan', 'real-esrgan', 'deoldify'],
        maxResolution: 2048,
        enableNSFWFilter: true,
        preserveMetadata: true
      };

      const workflow = buildComfyUIWorkflow(config, '/input.jpg', '/output.jpg');

      expect(workflow.nodes.length).toBeGreaterThan(3); // LoadImage + 3 models + SaveImage
      expect(workflow.metadata).toMatchObject({
        backend: 'directml',
        models: ['gfpgan', 'real-esrgan', 'deoldify'],
        maxResolution: 2048
      });
    });

    it('should include load and save nodes', () => {
      const config: PipelineConfig = {
        backend: 'cpu',
        models: ['real-esrgan'],
        maxResolution: 1024,
        enableNSFWFilter: false,
        preserveMetadata: false
      };

      const workflow = buildComfyUIWorkflow(config, '/input.jpg', '/output.jpg');

      const nodeTypes = workflow.nodes.map((node: ComfyUINode) => node.type);
      expect(nodeTypes).toContain('LoadImage');
      expect(nodeTypes).toContain('SaveImage');
    });
  });

  describe('getDefaultPipelineConfig', () => {
    it('should return config for color restoration', () => {
      const config = getDefaultPipelineConfig('color_restoration', 'mps');

      expect(config.backend).toBe('mps');
      expect(config.models).toContain('deoldify');
      expect(config.maxResolution).toBeGreaterThan(0);
      expect(config.enableNSFWFilter).toBe(true);
      expect(config.preserveMetadata).toBe(true);
    });

    it('should return config for damage repair', () => {
      const config = getDefaultPipelineConfig('damage_repair', 'directml');

      expect(config.backend).toBe('directml');
      expect(config.models).toContain('gfpgan');
      expect(config.models).toContain('real-esrgan');
    });

    it('should return config for quality enhancement', () => {
      const config = getDefaultPipelineConfig('quality_enhancement', 'cuda');

      expect(config.backend).toBe('cuda');
      expect(config.models).toContain('real-esrgan');
    });

    it('should return config for face restoration', () => {
      const config = getDefaultPipelineConfig('face_restoration', 'cpu');

      expect(config.backend).toBe('cpu');
      expect(config.models).toContain('gfpgan');
      expect(config.models).toContain('codeformer');
    });

    it('should return config for general restoration', () => {
      const config = getDefaultPipelineConfig('general_restoration', 'mps');

      expect(config.backend).toBe('mps');
      expect(config.models.length).toBeGreaterThan(1);
      expect(config.models).toContain('gfpgan');
      expect(config.models).toContain('real-esrgan');
      expect(config.models).toContain('deoldify');
    });

    it('should return default config for unknown intent', () => {
      const config = getDefaultPipelineConfig('unknown', 'cpu');

      expect(config.backend).toBe('cpu');
      expect(config.models).toContain('real-esrgan');
    });

    it('should preserve backend selection', () => {
      const backends: ComputeBackend[] = ['mps', 'mlx', 'directml', 'onnx-dml', 'cuda', 'cpu'];

      for (const backend of backends) {
        const config = getDefaultPipelineConfig('color_restoration', backend);
        expect(config.backend).toBe(backend);
      }
    });
  });
});
