import { constants } from 'node:fs';
import { mkdir, writeFile, copyFile, access } from 'node:fs/promises';
import { join } from 'node:path';

const mockDir = join(process.cwd(), 'data', 'mock');
const imagesDir = join(mockDir, 'images');
const requestsFile = join(mockDir, 'mock-requests.json');

const sampleImages = [
  {
    source: join(process.cwd(), 'docs', 'assets', 'demo-original.jpg'),
    target: join(imagesDir, 'original-01.jpg')
  },
  {
    source: join(process.cwd(), 'docs', 'assets', 'demo-restored.jpg'),
    target: join(imagesDir, 'restored-01.jpg')
  }
];

async function ensureSampleImages() {
  for (const { source, target } of sampleImages) {
    try {
      await access(target, constants.F_OK);
      continue;
    } catch {
      // swallow
    }

    try {
      await copyFile(source, target);
    } catch {
      const placeholder = Buffer.alloc(2048, 0xff);
      await writeFile(target, placeholder);
    }
  }
}

async function seedRequests() {
  const mockRequests = {
    requests: [
      {
        requestId: 'req_mock_001',
        status: 'ready_for_review',
        posterName: 'Mock User',
        facebookPostUrl: 'https://facebook.com/mock/post/1',
        originalImageHash: 'original-01.jpg',
        restoredImageHash: 'restored-01.jpg',
        perceptualHashDistance: 4.5,
        contentSafety: {
          isNSFW: false,
          requiresBlur: false
        },
        altText: 'Mock alt text for restored photo',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    ]
  };

  await writeFile(requestsFile, JSON.stringify(mockRequests, null, 2), 'utf8');
}

export async function seedMockData(): Promise<void> {
  await mkdir(imagesDir, { recursive: true });
  await ensureSampleImages();
  await seedRequests();
  console.log('Mock data seeded in data/mock');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedMockData().catch(error => {
    console.error('Failed to seed mock data', error);
    process.exit(1);
  });
}
