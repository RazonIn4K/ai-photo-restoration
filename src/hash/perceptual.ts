/**
 * Perceptual Hashing for Image Similarity Detection
 *
 * This module provides perceptual hashing (pHash) functionality to detect
 * similar or duplicate images even when they have been slightly modified.
 *
 * pHash is robust to:
 * - Compression artifacts
 * - Minor color changes
 * - Small resizing
 * - Format conversion
 *
 * Use cases:
 * - Duplicate detection
 * - Near-duplicate detection
 * - Content-based image retrieval
 */

import sharp from 'sharp';
import phashModule from 'sharp-phash';

// sharp-phash has incorrect TypeScript module exports, cast to proper type
const phashLib = phashModule as unknown as (buffer: Buffer) => Promise<string>;

/**
 * Perceptual hash result
 */
export interface PerceptualHashResult {
  /** Perceptual hash as hex string */
  hash: string;
  /** Image dimensions */
  width: number;
  height: number;
  /** Image format */
  format?: string;
}

/**
 * Similarity comparison result
 */
export interface SimilarityResult {
  /** Hamming distance between hashes */
  distance: number;
  /** Similarity percentage (0-100) */
  similarity: number;
  /** Whether images are considered similar (distance <= threshold) */
  isSimilar: boolean;
}

/**
 * Default similarity threshold (Hamming distance)
 * - Distance 0: Identical
 * - Distance 1-5: Very similar
 * - Distance 6-10: Similar
 * - Distance 11-20: Somewhat similar
 * - Distance >20: Different
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 10;

/**
 * Maximum possible Hamming distance for 64-bit hash
 */
const MAX_HAMMING_DISTANCE = 64;

/**
 * Compute perceptual hash for an image buffer
 *
 * @param imageBuffer - Image data (any format supported by sharp)
 * @returns Perceptual hash result
 */
export async function computePerceptualHash(imageBuffer: Buffer): Promise<PerceptualHashResult> {
  // Load image with sharp
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  // Compute perceptual hash
  const hash = await phashLib(imageBuffer);

  return {
    hash,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format: metadata.format,
  };
}

/**
 * Calculate Hamming distance between two perceptual hashes
 *
 * Hamming distance = number of differing bits
 *
 * @param hash1 - First perceptual hash (hex string)
 * @param hash2 - Second perceptual hash (hex string)
 * @returns Hamming distance (0 = identical, 64 = completely different)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  if (hash1.length !== hash2.length) {
    throw new Error('Hash lengths must match');
  }

  let distance = 0;

  // Compare each hex character
  for (let i = 0; i < hash1.length; i++) {
    const val1 = parseInt(hash1[i], 16);
    const val2 = parseInt(hash2[i], 16);

    // XOR to find differing bits
    const xor = val1 ^ val2;

    // Count set bits
    distance += countBits(xor);
  }

  return distance;
}

/**
 * Count number of set bits in a number
 */
function countBits(n: number): number {
  let count = 0;
  while (n > 0) {
    count += n & 1;
    n >>= 1;
  }
  return count;
}

/**
 * Compare two perceptual hashes for similarity
 *
 * @param hash1 - First perceptual hash
 * @param hash2 - Second perceptual hash
 * @param threshold - Similarity threshold (Hamming distance)
 * @returns Similarity comparison result
 */
export function compareSimilarity(
  hash1: string,
  hash2: string,
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): SimilarityResult {
  const distance = hammingDistance(hash1, hash2);
  const similarity = Math.max(0, ((MAX_HAMMING_DISTANCE - distance) / MAX_HAMMING_DISTANCE) * 100);
  const isSimilar = distance <= threshold;

  return {
    distance,
    similarity: Math.round(similarity * 100) / 100, // Round to 2 decimal places
    isSimilar,
  };
}

/**
 * Find similar images from a collection
 *
 * @param targetHash - Hash to compare against
 * @param hashes - Collection of hashes to search
 * @param threshold - Similarity threshold
 * @returns Array of similar hashes with their distances
 */
export function findSimilar(
  targetHash: string,
  hashes: string[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): Array<{ hash: string; distance: number; similarity: number }> {
  const results = hashes
    .map(hash => {
      const comparison = compareSimilarity(targetHash, hash, threshold);
      return {
        hash,
        distance: comparison.distance,
        similarity: comparison.similarity,
      };
    })
    .filter(result => result.distance <= threshold)
    .sort((a, b) => a.distance - b.distance); // Sort by distance (most similar first)

  return results;
}

/**
 * Batch compute perceptual hashes for multiple images
 *
 * @param imageBuffers - Array of image buffers
 * @returns Array of perceptual hash results
 */
export async function batchComputePerceptualHash(imageBuffers: Buffer[]): Promise<PerceptualHashResult[]> {
  return Promise.all(imageBuffers.map(buffer => computePerceptualHash(buffer)));
}

/**
 * Detect exact duplicates (distance = 0)
 *
 * @param hashes - Array of perceptual hashes
 * @returns Groups of duplicate hashes
 */
export function detectDuplicates(hashes: string[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const hash of hashes) {
    if (!groups.has(hash)) {
      groups.set(hash, []);
    }
    groups.get(hash)!.push(hash);
  }

  // Filter to only duplicates (more than one instance)
  const duplicates = new Map<string, string[]>();
  for (const [hash, instances] of groups.entries()) {
    if (instances.length > 1) {
      duplicates.set(hash, instances);
    }
  }

  return duplicates;
}

/**
 * Group images by similarity
 *
 * @param hashes - Array of perceptual hashes
 * @param threshold - Similarity threshold
 * @returns Groups of similar images
 */
export function groupBySimilarity(
  hashes: string[],
  threshold: number = DEFAULT_SIMILARITY_THRESHOLD
): Array<string[]> {
  const groups: Array<string[]> = [];
  const processed = new Set<string>();

  for (const hash of hashes) {
    if (processed.has(hash)) continue;

    const group = [hash];
    processed.add(hash);

    // Find all similar hashes
    for (const otherHash of hashes) {
      if (processed.has(otherHash)) continue;

      const distance = hammingDistance(hash, otherHash);
      if (distance <= threshold) {
        group.push(otherHash);
        processed.add(otherHash);
      }
    }

    groups.push(group);
  }

  return groups;
}
