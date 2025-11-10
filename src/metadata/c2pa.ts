/**
 * C2PA (Coalition for Content Provenance and Authenticity) Manifest Handling
 *
 * C2PA provides a standard for content provenance and authenticity.
 * It allows embedding cryptographically-signed manifests in media files
 * to prove:
 * - Who created the content
 * - What modifications were made
 * - When actions occurred
 * - What tools/AI were used
 *
 * This module provides C2PA manifest creation and validation.
 *
 * Note: Full C2PA signing requires certificates. This implementation
 * focuses on manifest structure and will be enhanced with proper
 * signing when certificates are configured.
 *
 * Spec: https://c2pa.org/specifications/
 */

/**
 * C2PA Action types
 */
export type C2PAAction =
  | 'c2pa.created' // Content was created
  | 'c2pa.edited' // Content was edited
  | 'c2pa.filtered' // Filter applied
  | 'c2pa.color_adjustments' // Color adjusted
  | 'c2pa.resized' // Image resized
  | 'c2pa.ai.inference' // AI inference applied
  | 'c2pa.ai.generative' // AI generation
  | 'c2pa.ai.training' // Used in AI training
  | 'c2pa.opened' // File opened
  | 'c2pa.placed' // Asset placed
  | 'c2pa.published' // Content published
  | 'c2pa.transcoded'; // Transcoded to different format

/**
 * C2PA Actor (person or organization)
 */
export interface C2PAActor {
  /** Actor type */
  type: 'person' | 'organization' | 'software';
  /** Name */
  name: string;
  /** Identifier (URL, email, etc.) */
  identifier?: string;
  /** Credentials */
  credentials?: Array<{
    type: string;
    value: string;
  }>;
}

/**
 * C2PA Assertion
 */
export interface C2PAAssertion {
  /** Assertion label */
  label: string;
  /** Assertion data */
  data: Record<string, unknown>;
  /** Optional hash of assertion data */
  hash?: string;
}

/**
 * C2PA Action entry
 */
export interface C2PAActionEntry {
  /** Action type */
  action: C2PAAction;
  /** When the action occurred */
  when: Date;
  /** Software that performed the action */
  softwareAgent?: string;
  /** Participants in the action */
  participants?: Array<{
    type: 'person' | 'organization';
    name: string;
  }>;
  /** Parameters used */
  parameters?: Record<string, unknown>;
  /** Changes made */
  changes?: Array<{
    description: string;
    region?: string;
  }>;
  /** Digital source type */
  digitalSourceType?: 'trainedAlgorithmicMedia' | 'compositeSynthetic' | 'algorithmicMedia';
}

/**
 * C2PA Manifest
 */
export interface C2PAManifest {
  /** Manifest version */
  '@context': string;
  /** Manifest type */
  type: 'CreativeWork' | 'ImageObject' | 'VideoObject';
  /** Title */
  title?: string;
  /** Claim generator */
  claimGenerator: string;
  /** Format (MIME type) */
  format?: string;
  /** Claim generator info */
  claimGeneratorInfo?: Array<{
    name: string;
    version?: string;
    icon?: string;
  }>;
  /** Actions performed */
  actions?: C2PAActionEntry[];
  /** Assertions */
  assertions?: C2PAAssertion[];
  /** Signature info (placeholder for actual signing) */
  signature?: {
    algorithm: string;
    value?: string;
    certificate?: string;
  };
  /** Ingredients (source materials) */
  ingredients?: Array<{
    title?: string;
    format?: string;
    documentId?: string;
    relationship?: 'parentOf' | 'componentOf';
    hash?: string;
  }>;
}

/**
 * Validation result
 */
export interface C2PAValidationResult {
  /** Is the manifest valid? */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Manifest data (if valid) */
  manifest?: C2PAManifest;
}

/**
 * Create a C2PA manifest for photo restoration
 *
 * @param params - Manifest parameters
 * @returns C2PA manifest
 */
export function createRestorationManifest(params: {
  originalPostId: string;
  requestId: string;
  aiModel: string;
  approvedBy?: string;
  approvalTimestamp?: Date;
  restorationTimestamp: Date;
  originalSHA256: string;
  restoredSHA256?: string;
}): C2PAManifest {
  const manifest: C2PAManifest = {
    '@context': 'https://c2pa.org/specifications/1.0/context',
    type: 'ImageObject',
    title: `Photo Restoration - Request ${params.requestId}`,
    claimGenerator: 'ai-photo-restoration-service/1.0.0',
    claimGeneratorInfo: [
      {
        name: 'AI Photo Restoration Service',
        version: '1.0.0'
      }
    ],
    actions: [
      {
        action: 'c2pa.ai.inference',
        when: params.restorationTimestamp,
        softwareAgent: params.aiModel,
        digitalSourceType: 'trainedAlgorithmicMedia',
        parameters: {
          model: params.aiModel,
          originalPostId: params.originalPostId,
          requestId: params.requestId
        },
        changes: [
          {
            description: 'AI-powered photo restoration applied'
          }
        ]
      },
      ...(params.approvedBy
        ? [
            {
              action: 'c2pa.published' as const,
              when: params.approvalTimestamp || params.restorationTimestamp,
              participants: [
                {
                  type: 'person' as const,
                  name: params.approvedBy
                }
              ]
            }
          ]
        : [])
    ],
    assertions: [
      {
        label: 'c2pa.hash.data',
        data: {
          name: 'sha256',
          value: params.originalSHA256
        }
      },
      {
        label: 'stds.schema-org.CreativeWork',
        data: {
          author: [
            {
              '@type': 'Person',
              name: params.approvedBy || 'Unknown'
            }
          ],
          datePublished: params.restorationTimestamp.toISOString()
        }
      }
    ],
    ingredients: [
      {
        title: `Original Photo (${params.originalPostId})`,
        format: 'image/jpeg',
        documentId: params.originalPostId,
        relationship: 'parentOf',
        hash: params.originalSHA256
      }
    ]
  };

  // Add approval timestamp if provided
  if (params.approvalTimestamp) {
    manifest.assertions?.push({
      label: 'restoration.approval',
      data: {
        approvedBy: params.approvedBy || 'Unknown',
        approvedAt: params.approvalTimestamp.toISOString()
      }
    });
  }

  return manifest;
}

/**
 * Validate a C2PA manifest structure
 *
 * Note: This validates structure only. Full cryptographic validation
 * requires proper certificate validation.
 *
 * @param manifest - Manifest to validate
 * @returns Validation result
 */
export function validateManifest(manifest: unknown): C2PAValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: false,
      errors: ['Manifest must be an object'],
      warnings: []
    };
  }

  const m = manifest as Partial<C2PAManifest>;

  // Required fields
  if (!m['@context']) {
    errors.push('Missing required @context field');
  }
  if (!m.type) {
    errors.push('Missing required type field');
  }
  if (!m.claimGenerator) {
    errors.push('Missing required claimGenerator field');
  }

  // Optional but recommended
  if (!m.actions || m.actions.length === 0) {
    warnings.push('No actions recorded');
  }
  if (!m.assertions || m.assertions.length === 0) {
    warnings.push('No assertions included');
  }

  // Validate actions if present
  if (m.actions) {
    m.actions.forEach((action, i) => {
      if (!action.action) {
        errors.push(`Action ${i}: missing action type`);
      }
      if (!action.when) {
        errors.push(`Action ${i}: missing timestamp`);
      }
    });
  }

  const valid = errors.length === 0;

  return {
    valid,
    errors,
    warnings,
    manifest: valid ? (m as C2PAManifest) : undefined
  };
}

/**
 * Serialize manifest to JSON string
 *
 * @param manifest - Manifest to serialize
 * @returns JSON string
 */
export function serializeManifest(manifest: C2PAManifest): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Parse manifest from JSON string
 *
 * @param json - JSON string
 * @returns Parsed manifest
 */
export function parseManifest(json: string): C2PAManifest {
  const manifest = JSON.parse(json);

  // Convert date strings back to Date objects
  if (manifest.actions) {
    manifest.actions.forEach((action: C2PAActionEntry) => {
      if (typeof action.when === 'string') {
        action.when = new Date(action.when);
      }
    });
  }

  return manifest as C2PAManifest;
}

/**
 * Get a summary of manifest actions
 *
 * @param manifest - Manifest
 * @returns Human-readable action summary
 */
export function getActionSummary(manifest: C2PAManifest): string[] {
  if (!manifest.actions || manifest.actions.length === 0) {
    return ['No actions recorded'];
  }

  return manifest.actions.map(action => {
    const when = action.when.toLocaleString();
    const software = action.softwareAgent || 'Unknown software';
    const actionType = action.action.replace('c2pa.', '').replace(/_/g, ' ');

    return `${actionType} - ${software} at ${when}`;
  });
}

/**
 * Check if manifest indicates AI-generated content
 *
 * @param manifest - Manifest
 * @returns True if AI was used
 */
export function isAIGenerated(manifest: C2PAManifest): boolean {
  if (!manifest.actions) {
    return false;
  }

  return manifest.actions.some(
    action =>
      action.action === 'c2pa.ai.inference' ||
      action.action === 'c2pa.ai.generative' ||
      action.digitalSourceType === 'trainedAlgorithmicMedia' ||
      action.digitalSourceType === 'algorithmicMedia' ||
      action.digitalSourceType === 'compositeSynthetic'
  );
}

/**
 * Extract all actors from a manifest
 *
 * @param manifest - Manifest
 * @returns List of actors
 */
export function extractActors(manifest: C2PAManifest): C2PAActor[] {
  const actors: C2PAActor[] = [];

  // Extract from assertions
  if (manifest.assertions) {
    manifest.assertions.forEach(assertion => {
      if (assertion.label === 'stds.schema-org.CreativeWork' && assertion.data.author) {
        const authors = Array.isArray(assertion.data.author)
          ? assertion.data.author
          : [assertion.data.author];

        authors.forEach((author: { '@type': string; name: string; identifier?: string }) => {
          if (author['@type'] === 'Person' || author['@type'] === 'Organization') {
            actors.push({
              type: author['@type'] === 'Person' ? 'person' : 'organization',
              name: author.name,
              identifier: author.identifier
            });
          }
        });
      }
    });
  }

  // Extract from actions
  if (manifest.actions) {
    manifest.actions.forEach(action => {
      if (action.softwareAgent) {
        actors.push({
          type: 'software',
          name: action.softwareAgent
        });
      }
    });
  }

  return actors;
}
