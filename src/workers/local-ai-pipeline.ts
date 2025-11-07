/**
 * Local AI Pipeline Worker
 *
 * Implements multi-platform AI processing with compute backend selection.
 * Supports PyTorch MPS (Apple Silicon), DirectML (Windows), and CPU fallback.
 */

import { logger } from '../lib/logger.js';

/**
 * Supported compute backends for local AI processing
 */
export type ComputeBackend = 'mps' | 'mlx' | 'directml' | 'onnx-dml' | 'cuda' | 'cpu';

/**
 * Platform detection results
 */
export interface PlatformInfo {
  platform: NodeJS.Platform;
  arch: string;
  isAppleSilicon: boolean;
  isWindows: boolean;
  isLinux: boolean;
  hasCuda: boolean;
}

/**
 * Model license types
 */
export type ModelLicense = 'mit' | 'apache-2.0' | 'cc-by-nc' | 'proprietary' | 'unknown';

/**
 * Model metadata for license compliance
 */
export interface ModelMetadata {
  name: string;
  version: string;
  license: ModelLicense;
  allowCommercialUse: boolean;
  requiresAttribution: boolean;
  restrictions?: string[];
}

/**
 * Restoration pipeline configuration
 */
export interface PipelineConfig {
  backend: ComputeBackend;
  models: string[];
  maxResolution: number;
  enableNSFWFilter: boolean;
  preserveMetadata: boolean;
}

/**
 * Restoration result
 */
export interface RestorationResult {
  success: boolean;
  outputPath?: string;
  processingTimeMs: number;
  modelsUsed: string[];
  backend: ComputeBackend;
  error?: string;
  metadata?: {
    inputResolution: { width: number; height: number };
    outputResolution: { width: number; height: number };
    appliedEffects: string[];
  };
}

export interface ComfyUINode {
  id: number;
  type: string;
  inputs: Record<string, string>;
}

export interface ComfyUIConnection {
  from: number;
  to: number;
  output: string;
}

export interface ComfyUIWorkflow {
  nodes: ComfyUINode[];
  connections: ComfyUIConnection[];
  metadata: {
    backend: ComputeBackend;
    models: string[];
    maxResolution: number;
  };
}

/**
 * Model registry for license compliance
 */
const MODEL_REGISTRY: Record<string, ModelMetadata> = {
  gfpgan: {
    name: 'GFPGAN',
    version: '1.4',
    license: 'apache-2.0',
    allowCommercialUse: true,
    requiresAttribution: true
  },
  'real-esrgan': {
    name: 'Real-ESRGAN',
    version: '0.3.0',
    license: 'apache-2.0',
    allowCommercialUse: true,
    requiresAttribution: true
  },
  deoldify: {
    name: 'DeOldify',
    version: '1.0',
    license: 'mit',
    allowCommercialUse: true,
    requiresAttribution: true
  },
  codeformer: {
    name: 'CodeFormer',
    version: '0.1.0',
    license: 'cc-by-nc',
    allowCommercialUse: false,
    requiresAttribution: true,
    restrictions: ['Non-commercial use only', 'Research purposes']
  }
};

/**
 * Detect platform and available compute capabilities
 */
export function detectPlatform(): PlatformInfo {
  const platform = process.platform;
  const arch = process.arch;

  // Detect Apple Silicon (M1, M2, M3, etc.)
  const isAppleSilicon = platform === 'darwin' && arch === 'arm64';

  // Detect Windows
  const isWindows = platform === 'win32';

  // Detect Linux
  const isLinux = platform === 'linux';

  // CUDA detection would require checking for nvidia-smi or CUDA libraries
  // For now, we'll assume CUDA is not available unless explicitly configured
  const hasCuda = false;

  return {
    platform,
    arch,
    isAppleSilicon,
    isWindows,
    isLinux,
    hasCuda
  };
}

/**
 * Select optimal compute backend based on platform
 */
export function selectComputeBackend(platformInfo: PlatformInfo): ComputeBackend {
  // Apple Silicon: Prefer MPS (Metal Performance Shaders)
  if (platformInfo.isAppleSilicon) {
    logger.info('Detected Apple Silicon, selecting MPS backend');
    return 'mps';
  }

  // Windows: Prefer DirectML for GPU acceleration
  if (platformInfo.isWindows) {
    logger.info('Detected Windows, selecting DirectML backend');
    return 'directml';
  }

  // Linux with CUDA: Use CUDA
  if (platformInfo.isLinux && platformInfo.hasCuda) {
    logger.info('Detected Linux with CUDA, selecting CUDA backend');
    return 'cuda';
  }

  // Fallback to CPU
  logger.info('No GPU acceleration detected, falling back to CPU backend');
  return 'cpu';
}

/**
 * Validate model license for commercial use
 */
export function validateModelLicense(
  modelName: string,
  isCommercialUse: boolean
): { valid: boolean; reason?: string } {
  const model = MODEL_REGISTRY[modelName.toLowerCase()];

  if (!model) {
    return {
      valid: false,
      reason: `Model '${modelName}' not found in registry`
    };
  }

  if (isCommercialUse && !model.allowCommercialUse) {
    return {
      valid: false,
      reason: `Model '${model.name}' (${model.license}) does not allow commercial use. Restrictions: ${model.restrictions?.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Validate all models in pipeline for license compliance
 */
export function validatePipelineLicenses(
  models: string[],
  isCommercialUse: boolean
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  for (const modelName of models) {
    const validation = validateModelLicense(modelName, isCommercialUse);
    if (!validation.valid && validation.reason) {
      violations.push(validation.reason);
    }
  }

  return {
    valid: violations.length === 0,
    violations
  };
}

/**
 * Build ComfyUI workflow for model chaining
 */
export function buildComfyUIWorkflow(
  config: PipelineConfig,
  inputPath: string,
  outputPath: string
): ComfyUIWorkflow {
  // ComfyUI workflow structure (simplified)
  // In a real implementation, this would generate a complete ComfyUI JSON workflow
  const workflow: ComfyUIWorkflow = {
    nodes: [
      {
        id: 1,
        type: 'LoadImage',
        inputs: { image: inputPath }
      }
    ],
    connections: [],
    metadata: {
      backend: config.backend,
      models: config.models,
      maxResolution: config.maxResolution
    }
  };

  // Add model nodes based on configuration
  let nodeId = 2;
  let previousNodeId = 1;

  for (const model of config.models) {
    workflow.nodes.push({
      id: nodeId,
      type: `Apply${model}`,
      inputs: { image: `node_${previousNodeId}` }
    });

    workflow.connections.push({
      from: previousNodeId,
      to: nodeId,
      output: 'image'
    });

    previousNodeId = nodeId;
    nodeId++;
  }

  // Add save node
  workflow.nodes.push({
    id: nodeId,
    type: 'SaveImage',
    inputs: {
      image: `node_${previousNodeId}`,
      filename: outputPath
    }
  });

  return workflow;
}

/**
 * Execute local AI restoration pipeline
 *
 * NOTE: This is a stub implementation. In production, this would:
 * 1. Initialize the selected compute backend (MPS/DirectML/CUDA)
 * 2. Load the AI models with the appropriate backend
 * 3. Execute the ComfyUI workflow or direct model inference
 * 4. Apply the restoration effects in sequence
 * 5. Save the output with metadata
 */
export async function executeLocalRestoration(
  inputPath: string,
  outputPath: string,
  config: PipelineConfig,
  isCommercialUse: boolean = false
): Promise<RestorationResult> {
  const startTime = Date.now();

  logger.info(
    {
      inputPath,
      outputPath,
      backend: config.backend,
      models: config.models
    },
    'Starting local AI restoration'
  );

  try {
    // Validate model licenses
    const licenseValidation = validatePipelineLicenses(config.models, isCommercialUse);
    if (!licenseValidation.valid) {
      throw new Error(`License validation failed:\n${licenseValidation.violations.join('\n')}`);
    }

    // Build ComfyUI workflow
    const workflow = buildComfyUIWorkflow(config, inputPath, outputPath);

    logger.debug({ workflow }, 'Generated ComfyUI workflow');

    // TODO: Execute actual restoration
    // This would involve:
    // 1. Loading models with the selected backend
    // 2. Processing the image through the pipeline
    // 3. Applying each model in sequence
    // 4. Saving the final result

    // For now, return a stub result
    const processingTimeMs = Date.now() - startTime;

    logger.info(
      {
        outputPath,
        processingTimeMs,
        backend: config.backend,
        modelsUsed: config.models
      },
      'Local AI restoration completed'
    );

    return {
      success: true,
      outputPath,
      processingTimeMs,
      modelsUsed: config.models,
      backend: config.backend,
      metadata: {
        inputResolution: { width: 0, height: 0 },
        outputResolution: { width: 0, height: 0 },
        appliedEffects: config.models
      }
    };
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(
      {
        error: errorMessage,
        inputPath,
        backend: config.backend,
        processingTimeMs
      },
      'Local AI restoration failed'
    );

    return {
      success: false,
      processingTimeMs,
      modelsUsed: [],
      backend: config.backend,
      error: errorMessage
    };
  }
}

/**
 * Get default pipeline configuration for intent category
 */
export function getDefaultPipelineConfig(
  intentCategory: string,
  backend: ComputeBackend
): PipelineConfig {
  const baseConfig: PipelineConfig = {
    backend,
    models: [],
    maxResolution: 2048,
    enableNSFWFilter: true,
    preserveMetadata: true
  };

  switch (intentCategory) {
    case 'color_restoration':
      baseConfig.models = ['deoldify'];
      break;

    case 'damage_repair':
      baseConfig.models = ['gfpgan', 'real-esrgan'];
      break;

    case 'quality_enhancement':
      baseConfig.models = ['real-esrgan'];
      break;

    case 'face_restoration':
      baseConfig.models = ['gfpgan', 'codeformer'];
      break;

    case 'general_restoration':
      baseConfig.models = ['gfpgan', 'real-esrgan', 'deoldify'];
      break;

    default:
      baseConfig.models = ['real-esrgan'];
  }

  return baseConfig;
}
