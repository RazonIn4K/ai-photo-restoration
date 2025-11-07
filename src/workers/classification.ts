/**
 * Intent Classification Worker
 *
 * Analyzes user requests to determine restoration intent and routing decisions.
 * Implements text analysis, confidence scoring, and human triage flagging.
 */

import type { Job } from 'bullmq';

import { logger } from '../lib/logger.js';
import { RequestRecordModel } from '../models/index.js';
import type { ClassificationJobData } from '../queues/manager.js';

/**
 * Intent categories for photo restoration
 */
export type IntentCategory =
  | 'color_restoration' // Colorize black & white photos
  | 'damage_repair' // Fix tears, scratches, stains
  | 'quality_enhancement' // Upscale, denoise, sharpen
  | 'face_restoration' // Restore facial details
  | 'general_restoration' // Multiple restoration needs
  | 'unknown'; // Unable to determine intent

/**
 * Routing decision for AI processing
 */
export type RoutingDecision = 'local' | 'cloud' | 'triage';

/**
 * Classification result
 */
export interface ClassificationResult {
  intentCategory: IntentCategory;
  confidence: number; // 0.0 to 1.0
  routingDecision: RoutingDecision;
  keywords: string[];
  requiresHumanReview: boolean;
  metadata: {
    textLength: number;
    hasSpecificRequest: boolean;
    complexityScore: number;
  };
}

/**
 * Intent keywords for classification
 */
const INTENT_KEYWORDS: Record<IntentCategory, string[]> = {
  color_restoration: [
    'color',
    'colorize',
    'colorise',
    'colour',
    'black and white',
    'b&w',
    'bw',
    'monochrome',
    'add color',
    'bring color'
  ],
  damage_repair: [
    'repair',
    'fix',
    'restore',
    'torn',
    'ripped',
    'damaged',
    'scratch',
    'stain',
    'crack',
    'fold',
    'crease',
    'water damage',
    'faded'
  ],
  quality_enhancement: [
    'enhance',
    'improve',
    'sharpen',
    'upscale',
    'enlarge',
    'quality',
    'resolution',
    'clarity',
    'detail',
    'denoise',
    'blur'
  ],
  face_restoration: [
    'face',
    'facial',
    'portrait',
    'person',
    'people',
    'eyes',
    'nose',
    'mouth',
    'features',
    'expression'
  ],
  general_restoration: ['restore', 'fix', 'help', 'improve', 'better', 'old photo', 'vintage'],
  unknown: []
};

/**
 * Confidence thresholds
 */
const CONFIDENCE_THRESHOLDS = {
  HIGH: 0.8, // High confidence - proceed with local processing
  MEDIUM: 0.5, // Medium confidence - use cloud processing
  LOW: 0.3 // Low confidence - flag for human triage
};

/**
 * Analyze user request text to extract intent
 */
function analyzeText(userRequest: string): {
  intentScores: Record<IntentCategory, number>;
  keywords: string[];
  textLength: number;
  hasSpecificRequest: boolean;
} {
  const normalizedText = userRequest.toLowerCase().trim();
  const textLength = normalizedText.length;
  const words = normalizedText.split(/\s+/);

  // Calculate intent scores based on keyword matching
  const intentScores: Record<IntentCategory, number> = {
    color_restoration: 0,
    damage_repair: 0,
    quality_enhancement: 0,
    face_restoration: 0,
    general_restoration: 0,
    unknown: 0
  };

  const matchedKeywords: string[] = [];

  // Score each intent category
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'unknown') continue;

    for (const keyword of keywords) {
      if (normalizedText.includes(keyword)) {
        intentScores[intent as IntentCategory] += 1;
        if (!matchedKeywords.includes(keyword)) {
          matchedKeywords.push(keyword);
        }
      }
    }
  }

  // Determine if request is specific or generic
  const hasSpecificRequest = textLength > 10 && (matchedKeywords.length > 0 || words.length > 3);

  return {
    intentScores,
    keywords: matchedKeywords,
    textLength,
    hasSpecificRequest
  };
}

/**
 * Calculate confidence score based on text analysis
 */
function calculateConfidence(
  intentScores: Record<IntentCategory, number>,
  textLength: number,
  hasSpecificRequest: boolean
): number {
  // Get the highest intent score
  const maxScore = Math.max(...Object.values(intentScores));

  if (maxScore === 0) {
    // No keywords matched - low confidence
    return hasSpecificRequest ? 0.4 : 0.2;
  }

  // Base confidence from keyword matches
  let confidence = Math.min(maxScore / 5, 1.0); // Normalize to 0-1

  // Boost confidence for longer, more detailed requests
  if (textLength > 50) {
    confidence = Math.min(confidence + 0.1, 1.0);
  }

  // Boost confidence for specific requests
  if (hasSpecificRequest) {
    confidence = Math.min(confidence + 0.1, 1.0);
  }

  return Math.round(confidence * 100) / 100; // Round to 2 decimal places
}

/**
 * Determine the primary intent category
 */
function determineIntent(intentScores: Record<IntentCategory, number>): IntentCategory {
  const maxScore = Math.max(...Object.values(intentScores));

  if (maxScore === 0) {
    return 'unknown';
  }

  // Find the intent with the highest score
  for (const [intent, score] of Object.entries(intentScores)) {
    if (score === maxScore) {
      return intent as IntentCategory;
    }
  }

  return 'general_restoration';
}

/**
 * Calculate complexity score for routing decisions
 */
function calculateComplexity(
  intentCategory: IntentCategory,
  confidence: number,
  textLength: number
): number {
  let complexity = 0.5; // Base complexity

  // Adjust based on intent category
  switch (intentCategory) {
    case 'face_restoration':
      complexity += 0.3; // Face restoration is complex
      break;
    case 'damage_repair':
      complexity += 0.2; // Damage repair can be complex
      break;
    case 'color_restoration':
      complexity += 0.1; // Color restoration is moderate
      break;
    case 'quality_enhancement':
      complexity += 0.1; // Enhancement is moderate
      break;
    case 'general_restoration':
      complexity += 0.2; // General restoration varies
      break;
    case 'unknown':
      complexity += 0.3; // Unknown intent is risky
      break;
  }

  // Adjust based on confidence
  if (confidence < CONFIDENCE_THRESHOLDS.MEDIUM) {
    complexity += 0.2; // Low confidence increases complexity
  }

  // Adjust based on request detail
  if (textLength > 100) {
    complexity += 0.1; // Detailed requests may be complex
  }

  return Math.min(complexity, 1.0);
}

/**
 * Determine routing decision based on classification
 */
function determineRouting(
  intentCategory: IntentCategory,
  confidence: number,
  complexityScore: number
): RoutingDecision {
  // Flag for human triage if confidence is too low
  if (confidence < CONFIDENCE_THRESHOLDS.LOW) {
    return 'triage';
  }

  // Route to cloud for complex or uncertain cases
  if (
    complexityScore > 0.7 ||
    confidence < CONFIDENCE_THRESHOLDS.MEDIUM ||
    intentCategory === 'unknown'
  ) {
    return 'cloud';
  }

  // Route to local for simple, high-confidence cases
  return 'local';
}

/**
 * Classify user request intent
 */
export function classifyIntent(userRequest: string): ClassificationResult {
  // Analyze the text
  const { intentScores, keywords, textLength, hasSpecificRequest } = analyzeText(userRequest);

  // Determine primary intent
  const intentCategory = determineIntent(intentScores);

  // Calculate confidence
  const confidence = calculateConfidence(intentScores, textLength, hasSpecificRequest);

  // Calculate complexity
  const complexityScore = calculateComplexity(intentCategory, confidence, textLength);

  // Determine routing
  const routingDecision = determineRouting(intentCategory, confidence, complexityScore);

  // Flag for human review if needed
  const requiresHumanReview =
    routingDecision === 'triage' ||
    confidence < CONFIDENCE_THRESHOLDS.MEDIUM ||
    intentCategory === 'unknown';

  return {
    intentCategory,
    confidence,
    routingDecision,
    keywords,
    requiresHumanReview,
    metadata: {
      textLength,
      hasSpecificRequest,
      complexityScore
    }
  };
}

/**
 * Process classification job
 */
export async function processClassificationJob(
  job: Job<ClassificationJobData>
): Promise<ClassificationResult> {
  const { requestId } = job.data;

  logger.info({ jobId: job.id, requestId }, 'Starting intent classification');

  // Fetch the request record
  const request = await RequestRecordModel.findOne({ requestId });
  if (!request) {
    throw new Error(`Request ${requestId} not found`);
  }

  // Update status to processing
  request.status = 'processing';
  await request.save();

  await job.updateProgress(20);

  // Classify the intent
  const classification = classifyIntent(request.userRequest);

  logger.info(
    {
      requestId,
      intentCategory: classification.intentCategory,
      confidence: classification.confidence,
      routingDecision: classification.routingDecision
    },
    'Intent classification complete'
  );

  await job.updateProgress(60);

  // Update the request record with classification results
  request.intentCategory = classification.intentCategory;
  request.classificationConfidence = classification.confidence;
  request.routingDecision = classification.routingDecision;

  // Add classification metadata
  if (!request.processingMetadata) {
    request.processingMetadata = {};
  }

  request.processingMetadata.classification = {
    keywords: classification.keywords,
    requiresHumanReview: classification.requiresHumanReview,
    complexityScore: classification.metadata.complexityScore,
    classifiedAt: new Date()
  };

  await request.save();

  await job.updateProgress(100);

  logger.info(
    {
      requestId,
      intentCategory: classification.intentCategory,
      requiresHumanReview: classification.requiresHumanReview
    },
    'Classification results saved'
  );

  return classification;
}
