import sharp from 'sharp';

/**
 * Generate a test image buffer for testing purposes
 */
export async function generateTestImage(
  width: number = 400,
  height: number = 300,
  format: 'jpeg' | 'png' | 'webp' = 'jpeg'
): Promise<Buffer> {
  // Create a simple colored rectangle
  const channels = format === 'png' ? 4 : 3; // PNG has alpha channel
  const pixelData = Buffer.alloc(width * height * channels);

  // Fill with a gradient pattern
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * channels;

      // Create a simple gradient pattern
      pixelData[offset] = Math.floor((x / width) * 255); // Red
      pixelData[offset + 1] = Math.floor((y / height) * 255); // Green
      pixelData[offset + 2] = Math.floor(((x + y) / (width + height)) * 255); // Blue

      if (channels === 4) {
        pixelData[offset + 3] = 255; // Alpha (fully opaque)
      }
    }
  }

  // Convert raw pixel data to image buffer
  const image = sharp(pixelData, {
    raw: {
      width,
      height,
      channels
    }
  });

  // Convert to the requested format
  switch (format) {
    case 'jpeg':
      return image.jpeg({ quality: 90 }).toBuffer();
    case 'png':
      return image.png().toBuffer();
    case 'webp':
      return image.webp({ quality: 90 }).toBuffer();
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

/**
 * Generate a test image with specific content for testing
 */
export async function generateTestImageWithText(
  text: string,
  width: number = 400,
  height: number = 300
): Promise<Buffer> {
  // Create a simple SVG with text
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#f0f0f0"/>
      <text x="50%" y="50%" font-family="Arial" font-size="24" fill="#333" text-anchor="middle" dominant-baseline="middle">
        ${text}
      </text>
    </svg>
  `;

  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Generate a solid color test image
 */
export async function generateSolidColorImage(
  color: { r: number; g: number; b: number },
  width: number = 400,
  height: number = 300
): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color
    }
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}
