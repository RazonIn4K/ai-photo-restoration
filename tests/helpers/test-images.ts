/**
 * Test Image Generator
 *
 * Provides utilities for generating test images for integration tests.
 * Uses Sharp to create various image formats and patterns.
 */

import sharp from 'sharp';

export interface TestImageOptions {
  width?: number;
  height?: number;
  format?: 'jpeg' | 'png' | 'webp';
  pattern?: 'solid' | 'gradient' | 'noise';
  color?: { r: number; g: number; b: number };
}

/**
 * Create a test image with specified characteristics
 *
 * @param options - Image generation options
 * @returns Image buffer
 */
export async function createTestImage(options: TestImageOptions = {}): Promise<Buffer> {
  const {
    width = 640,
    height = 480,
    format = 'jpeg',
    pattern = 'gradient',
    color = { r: 120, g: 180, b: 220 }
  } = options;

  let pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color
    }
  });

  // Apply pattern effects
  if (pattern === 'gradient') {
    // Create gradient effect by adjusting brightness
    pipeline = pipeline.linear(1.2, -10);
  } else if (pattern === 'noise') {
    // Add noise effect
    pipeline = pipeline.recomb([
      [1.1, 0.1, 0.1],
      [0.1, 1.1, 0.1],
      [0.1, 0.1, 1.1]
    ]);
  }

  // Convert to requested format
  switch (format) {
    case 'jpeg':
      return pipeline.jpeg({ quality: 90 }).toBuffer();
    case 'png':
      return pipeline.png({ compressionLevel: 6 }).toBuffer();
    case 'webp':
      return pipeline.webp({ quality: 90 }).toBuffer();
    default:
      return pipeline.jpeg().toBuffer();
  }
}

/**
 * Create a solid color test image
 */
export async function createSolidImage(
  color: { r: number; g: number; b: number } = { r: 255, g: 0, b: 0 },
  width = 100,
  height = 100
): Promise<Buffer> {
  return createTestImage({ width, height, pattern: 'solid', color });
}

/**
 * Create a gradient test image
 */
export async function createGradientImage(width = 640, height = 480): Promise<Buffer> {
  return createTestImage({ width, height, pattern: 'gradient' });
}

/**
 * Create a small thumbnail test image
 */
export async function createThumbnailImage(): Promise<Buffer> {
  return createTestImage({
    width: 150,
    height: 150,
    format: 'jpeg',
    pattern: 'gradient'
  });
}

/**
 * Create multiple test images for batch testing
 */
export async function createTestImageBatch(count: number): Promise<Buffer[]> {
  const images: Buffer[] = [];

  for (let i = 0; i < count; i++) {
    const hue = (i * 60) % 360; // Vary colors across images
    const color = hslToRgb(hue, 70, 60);

    images.push(
      await createTestImage({
        width: 640,
        height: 480,
        pattern: 'gradient',
        color
      })
    );
  }

  return images;
}

/**
 * Convert HSL to RGB for color variation
 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

/**
 * Get image metadata without full decode
 */
export async function getImageInfo(buffer: Buffer): Promise<{
  width: number;
  height: number;
  format: string;
  size: number;
}> {
  const metadata = await sharp(buffer).metadata();

  return {
    width: metadata.width || 0,
    height: metadata.height || 0,
    format: metadata.format || 'unknown',
    size: buffer.length
  };
}
