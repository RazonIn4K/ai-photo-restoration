/**
 * Content Safety and NSFW Detection Worker
 *
 * Implements content classification for NSFW and minor-sensitive content detection.
 * Uses TensorFlow.js models for image analysis and flagging.
 */

import { logger } from '../lib/logger.js';
import type { ContentClassification } from '../types/index.js';

/**
 * NSFW classification categories
 */
export type NSFWCategory = 'safe' | 'suggestive' | 'explicit' | 'violence' | 'gore' | 'disturbing';

/**
 * Content safety result
 */
export interface ContentSafetyResult extends ContentClassification {
  categories: NSFWCategory[];
  scores: Record<NSFWCategory, number>;
  flaggedForReview: boolean;
  minorSensitive: boolean;
  processingTimeMs: number;
}

/**
 * Content safety configuration
 */
export interface ContentSafetyConfig {
  nsfwThreshold: number; // 0.0 to 1.0
  minorSensitiveThreshold: number;
  enableMinorDetection: boolean;
  requireHumanReview: boolean;
}

/**
 * Default content safety configuration
 */
const DEFAULT_CONFIG: ContentSafetyConfig = {
  nsfwThreshold: 0.7, // 70% confidence threshold
  minorSensitiveThreshold: 0.6,
  enableMinorDetection: true,
  requireHumanReview: true
};

/**
 * Analyze image for NSFW content
 *
 * NOTE: This is a stub implementation. In production, this would:
 * 1. Load a TensorFlow.js NSFW detection model (e.g., nsfwjs)
 * 2. Preprocess the image for the model
 * 3. Run inference to get category scores
 * 4. Apply thresholds and return classification
 */
export async function classifyNSFWContent(
  imagePath: string,
  config: ContentSafetyConfig = DEFAULT_CONFIG
): Promise<ContentSafetyResult> {
  const startTime = Date.now();

  logger.info({ imagePath, config }, 'Starting NSFW content classification');

  try {
    // TODO: Implement actual NSFW detection
    // This would involve:
    // 1. const tf = require('@tensorflow/tfjs-node');
    // 2. const nsfwjs = require('nsfwjs');
    // 3. const model = await nsfwjs.load();
    // 4. const image = await loadImage(imagePath);
    // 5. const predictions = await model.classify(image);

    // For now, return a stub result indicating safe content
    const scores: Record<NSFWCategory, number> = {
      safe: 0.95,
      suggestive: 0.03,
      explicit: 0.01,
      violence: 0.005,
      gore: 0.003,
      disturbing: 0.002
    };

    // Determine if content is NSFW based on threshold
    const isNSFW =
      scores.explicit >= config.nsfwThreshold ||
      scores.violence >= config.nsfwThreshold ||
      scores.gore >= config.nsfwThreshold ||
      scores.disturbing >= config.nsfwThreshold;

    // Get flagged categories
    const flaggedCategories: NSFWCategory[] = [];
    for (const [category, score] of Object.entries(scores)) {
      if (category !== 'safe' && score >= config.nsfwThreshold) {
        flaggedCategories.push(category as NSFWCategory);
      }
    }

    const processingTimeMs = Date.now() - startTime;

    const result: ContentSafetyResult = {
      isNSFW,
      confidence: Math.max(...Object.values(scores)),
      categories: flaggedCategories.length > 0 ? flaggedCategories : ['safe'],
      scores,
      requiresHumanReview: isNSFW && config.requireHumanReview,
      flaggedForReview: isNSFW,
      minorSensitive: false, // Will be set by minor detection
      processingTimeMs
    };

    logger.info(
      {
        imagePath,
        isNSFW,
        categories: result.categories,
        processingTimeMs
      },
      'NSFW classification complete'
    );

    return result;
  } catch (error) {
    const processingTimeMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(
      {
        error: errorMessage,
        imagePath,
        processingTimeMs
      },
      'NSFW classification failed'
    );

    // Return safe classification on error (fail-open for availability)
    return {
      isNSFW: false,
      confidence: 0,
      categories: ['safe'],
      scores: {
        safe: 1.0,
        suggestive: 0,
        explicit: 0,
        violence: 0,
        gore: 0,
        disturbing: 0
      },
      requiresHumanReview: true, // Flag for review on error
      flaggedForReview: true,
      minorSensitive: false,
      processingTimeMs
    };
  }
}

/**
 * Detect minor-sensitive content
 *
 * NOTE: This is a stub implementation. In production, this would:
 * 1. Use a specialized model for detecting minors in images
 * 2. Apply age estimation algorithms
 * 3. Flag content that may involve minors for mandatory human review
 */
export async function detectMinorSensitiveContent(
  imagePath: string,
  config: ContentSafetyConfig = DEFAULT_CONFIG
): Promise<boolean> {
  if (!config.enableMinorDetection) {
    return false;
  }

  logger.info({ imagePath }, 'Starting minor-sensitive content detection');

  try {
    // TODO: Implement actual minor detection
    // This would involve:
    // 1. Face detection to identify people in the image
    // 2. Age estimation for detected faces
    // 3. Flagging if any faces appear to be minors

    // For now, return false (no minors detected)
    const minorDetected = false;

    logger.info(
      {
        imagePath,
        minorDetected
      },
      'Minor-sensitive content detection complete'
    );

    return minorDetected;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error(
      {
        error: errorMessage,
        imagePath
      },
      'Minor-sensitive content detection failed'
    );

    // Fail-safe: flag for review on error
    return true;
  }
}

/**
 * Perform comprehensive content safety check
 */
export async function performContentSafetyCheck(
  imagePath: string,
  config: ContentSafetyConfig = DEFAULT_CONFIG
): Promise<ContentSafetyResult> {
  logger.info({ imagePath }, 'Starting comprehensive content safety check');

  // Run NSFW classification
  const nsfwResult = await classifyNSFWContent(imagePath, config);

  // Run minor detection if enabled
  if (config.enableMinorDetection) {
    const minorDetected = await detectMinorSensitiveContent(imagePath, config);
    nsfwResult.minorSensitive = minorDetected;

    // Flag for review if minor detected
    if (minorDetected) {
      nsfwResult.requiresHumanReview = true;
      nsfwResult.flaggedForReview = true;
    }
  }

  logger.info(
    {
      imagePath,
      isNSFW: nsfwResult.isNSFW,
      minorSensitive: nsfwResult.minorSensitive,
      requiresHumanReview: nsfwResult.requiresHumanReview
    },
    'Content safety check complete'
  );

  return nsfwResult;
}

/**
 * Get default content safety configuration
 */
export function getDefaultContentSafetyConfig(): ContentSafetyConfig {
  return { ...DEFAULT_CONFIG };
}

/**
 * Create strict content safety configuration
 */
export function getStrictContentSafetyConfig(): ContentSafetyConfig {
  return {
    nsfwThreshold: 0.5, // Lower threshold = more strict
    minorSensitiveThreshold: 0.4,
    enableMinorDetection: true,
    requireHumanReview: true
  };
}

/**
 * Create permissive content safety configuration
 */
export function getPermissiveContentSafetyConfig(): ContentSafetyConfig {
  return {
    nsfwThreshold: 0.9, // Higher threshold = less strict
    minorSensitiveThreshold: 0.8,
    enableMinorDetection: false,
    requireHumanReview: false
  };
}
