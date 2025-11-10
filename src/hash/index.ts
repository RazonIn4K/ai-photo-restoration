/**
 * Hash module - Perceptual hashing for image similarity
 */

export {
  computePerceptualHash,
  hammingDistance,
  compareSimilarity,
  findSimilar,
  batchComputePerceptualHash,
  detectDuplicates,
  groupBySimilarity,
  DEFAULT_SIMILARITY_THRESHOLD,
  type PerceptualHashResult,
  type SimilarityResult
} from './perceptual.js';
