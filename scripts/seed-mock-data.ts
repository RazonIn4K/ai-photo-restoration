#!/usr/bin/env tsx
/**
 * Seed Mock Data Script
 * Generates mock RequestRecord data and synthetic PNG images for development
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ulid } from 'ulid';

import type { RequestStatus, IntentCategory, PhotoAsset, ProcessingMetadata } from '../src/types/index.js';

const MOCK_DIR = path.join(process.cwd(), 'data', 'mock');
const IMAGES_DIR = path.join(MOCK_DIR, 'images');
const MOCK_REQUESTS_FILE = path.join(MOCK_DIR, 'mock-requests.json');

interface MockRequest {
  requestId: string;
  facebookPostId: string;
  facebookGroupId: string;
  posterName: string;
  posterFacebookId?: string;
  postUrl: string;
  userRequest: string;
  assets: PhotoAsset[];
  intentCategory?: IntentCategory;
  classificationConfidence?: number;
  routingDecision?: 'local' | 'cloud' | 'triage';
  status: RequestStatus;
  queuedAt?: string;
  processedAt?: string;
  reviewedAt?: string;
  postedAt?: string;
  processingMetadata?: ProcessingMetadata;
  reviewedBy?: string;
  approvalNotes?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Generate a synthetic PNG image
 */
async function generateSyntheticImage(
  width: number,
  height: number,
  color: { r: number; g: number; b: number },
  label: string
): Promise<Buffer> {
  // Create a solid color background
  const background = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color
    }
  })
    .png()
    .toBuffer();

  // Add text label (simple approach - just use the base image)
  // In a real scenario, you might use a library to add text
  return background;
}

/**
 * Calculate SHA-256 hash of buffer
 */
function calculateHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Generate a simple perceptual hash (mock)
 */
function generatePerceptualHash(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/**
 * Generate mock photo asset
 */
async function generateMockAsset(
  requestId: string,
  index: number,
  withRestored: boolean = false
): Promise<PhotoAsset> {
  const assetId = ulid();

  // Generate original image
  const originalImage = await generateSyntheticImage(
    800,
    600,
    { r: 200 + index * 10, g: 150 + index * 5, b: 100 + index * 3 },
    `Original ${index + 1}`
  );
  const originalHash = calculateHash(originalImage);
  const originalPath = path.join(IMAGES_DIR, `${originalHash}.png`);

  // Save original image
  await fs.writeFile(originalPath, originalImage);

  const asset: PhotoAsset = {
    assetId,
    originalImageUrl: `https://facebook.com/photos/${assetId}`,
    originalImageHash: originalHash,
    originalImagePath: `./data/mock/images/${originalHash}.png`,
    originalStorageId: originalHash,
    originalSHA256: originalHash,
    perceptualHash: generatePerceptualHash(),
    selected: true
  };

  // Generate restored image if requested
  if (withRestored) {
    const restoredImage = await generateSyntheticImage(
      800,
      600,
      { r: 220 + index * 10, g: 180 + index * 5, b: 140 + index * 3 },
      `Restored ${index + 1}`
    );
    const restoredHash = calculateHash(restoredImage);
    const restoredPath = path.join(IMAGES_DIR, `${restoredHash}.png`);

    await fs.writeFile(restoredPath, restoredImage);

    asset.restoredImageUrl = `https://restored.example.com/${restoredHash}.png`;
    asset.restoredImageHash = restoredHash;
    asset.restoredImagePath = `./data/mock/images/${restoredHash}.png`;
    asset.restoredStorageId = restoredHash;
    asset.restoredSHA256 = restoredHash;
    asset.restoredPerceptualHash = generatePerceptualHash();
    asset.c2paManifestRef = JSON.stringify({
      claim: 'AI restoration performed',
      timestamp: new Date().toISOString()
    });
  }

  return asset;
}

/**
 * Generate mock request
 */
async function generateMockRequest(
  groupId: string,
  status: RequestStatus,
  withRestored: boolean = false
): Promise<MockRequest> {
  const requestId = ulid();
  const createdAt = new Date(Date.now() - Math.random() * 86400000 * 7); // Within last 7 days

  const assets = await Promise.all([
    generateMockAsset(requestId, 0, withRestored)
  ]);

  const request: MockRequest = {
    requestId,
    facebookPostId: `post_${requestId}`,
    facebookGroupId: groupId,
    posterName: `User ${requestId.slice(0, 6)}`,
    posterFacebookId: `fb_${requestId.slice(0, 8)}`,
    postUrl: `https://facebook.com/groups/${groupId}/posts/${requestId}`,
    userRequest: 'Can you please restore this old family photo? It has some damage and fading.',
    assets,
    intentCategory: ['simple_enhance', 'colorize_only', 'restore_heavy_damage'][Math.floor(Math.random() * 3)] as IntentCategory,
    classificationConfidence: 0.7 + Math.random() * 0.3,
    routingDecision: 'local',
    status,
    createdAt: createdAt.toISOString(),
    updatedAt: new Date().toISOString()
  };

  // Add timestamps based on status
  if (status !== 'queued') {
    request.queuedAt = createdAt.toISOString();
  }

  if (['processing', 'awaiting_manual_approval', 'approved_pending_post', 'rejected', 'completed', 'failed'].includes(status)) {
    const processedDate = new Date(createdAt.getTime() + 60000);
    request.processedAt = processedDate.toISOString();

    if (withRestored) {
      request.processingMetadata = {
        modelUsed: 'gfpgan-v1.4',
        cost: 0.05 + Math.random() * 0.1,
        appliedEffects: ['denoise', 'enhance', 'colorize'],
        processingTimeMs: 5000 + Math.floor(Math.random() * 10000),
        confidenceScore: 0.85 + Math.random() * 0.15
      };
    }
  }

  if (['awaiting_manual_approval', 'approved_pending_post', 'rejected', 'completed'].includes(status)) {
    const reviewedDate = new Date(createdAt.getTime() + 120000);
    request.reviewedAt = reviewedDate.toISOString();
    request.reviewedBy = 'operator_001';

    if (status === 'approved_pending_post' || status === 'completed') {
      request.approvalNotes = 'Looks good, approved for posting.';
    } else if (status === 'rejected') {
      request.approvalNotes = 'Quality does not meet standards.';
    }
  }

  if (status === 'completed') {
    const postedDate = new Date(createdAt.getTime() + 180000);
    request.postedAt = postedDate.toISOString();
  }

  return request;
}

/**
 * Main seed function
 */
async function seedMockData(): Promise<void> {
  console.log('🌱 Seeding mock data...\n');

  // Create directories
  console.log('📁 Creating directories...');
  await fs.mkdir(MOCK_DIR, { recursive: true });
  await fs.mkdir(IMAGES_DIR, { recursive: true });
  console.log(`   ✓ Created ${MOCK_DIR}`);
  console.log(`   ✓ Created ${IMAGES_DIR}\n`);

  // Generate mock requests
  console.log('📝 Generating mock requests...');
  const groupId = 'test_group_123';

  const requests: MockRequest[] = [];

  // Generate various statuses
  requests.push(await generateMockRequest(groupId, 'queued', false));
  requests.push(await generateMockRequest(groupId, 'processing', false));
  requests.push(await generateMockRequest(groupId, 'awaiting_manual_approval', true));
  requests.push(await generateMockRequest(groupId, 'awaiting_manual_approval', true));
  requests.push(await generateMockRequest(groupId, 'awaiting_manual_approval', true));
  requests.push(await generateMockRequest(groupId, 'approved_pending_post', true));
  requests.push(await generateMockRequest(groupId, 'completed', true));
  requests.push(await generateMockRequest(groupId, 'rejected', true));
  requests.push(await generateMockRequest(groupId, 'failed', false));

  console.log(`   ✓ Generated ${requests.length} mock requests\n`);

  // Write mock requests to file
  console.log('💾 Writing mock data to file...');
  await fs.writeFile(
    MOCK_REQUESTS_FILE,
    JSON.stringify(requests, null, 2),
    'utf-8'
  );
  console.log(`   ✓ Wrote ${MOCK_REQUESTS_FILE}\n`);

  // Count images
  const imageFiles = await fs.readdir(IMAGES_DIR);
  console.log(`📸 Generated ${imageFiles.length} synthetic images\n`);

  // Summary
  console.log('✅ Mock data seeding complete!\n');
  console.log('Summary:');
  console.log(`   - Mock requests: ${requests.length}`);
  console.log(`   - Images: ${imageFiles.length}`);
  console.log(`   - Data location: ${MOCK_DIR}`);
  console.log('\nYou can now run the API in mock mode with:');
  console.log('   USE_MOCK_DASHBOARD=true npm run dev:api\n');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedMockData().catch((error) => {
    console.error('❌ Error seeding mock data:', error);
    process.exit(1);
  });
}

export { seedMockData };
