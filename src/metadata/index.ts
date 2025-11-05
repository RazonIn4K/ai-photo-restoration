/**
 * Metadata module - EXIF and C2PA metadata handling
 *
 * This module provides comprehensive metadata management for photo restoration:
 * - EXIF metadata reading and writing
 * - C2PA manifest creation and validation
 * - Combined metadata embedding
 * - Provenance tracking
 */

// EXIF operations
export {
  readEXIF,
  writeEXIF,
  verifyEXIF,
  stripEXIF,
  getImageDimensions,
  closeExifTool,
  type PhotoRestorationMetadata,
  type EXIFMetadata,
} from './exif.js';

// C2PA operations
export {
  createRestorationManifest,
  validateManifest,
  serializeManifest,
  parseManifest,
  getActionSummary,
  isAIGenerated,
  extractActors,
  type C2PAManifest,
  type C2PAAction,
  type C2PAActionEntry,
  type C2PAActor,
  type C2PAAssertion,
  type C2PAValidationResult,
} from './c2pa.js';

// Combined operations
export {
  embedCompleteMetadata,
  extractCompleteMetadata,
  verifyMetadataIntegrity,
  getMetadataSummary,
  type EmbedResult,
} from './embed.js';
