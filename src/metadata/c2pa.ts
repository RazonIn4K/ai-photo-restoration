import {
  ManifestBuilder,
  createC2pa,
  createTestSigner,
  type BufferAsset,
  type SignOptions,
  type SignOutput,
  types
} from 'c2pa-node';

type ManifestAssertion = types.ManifestAssertion;

export interface C2paSignOptions {
  title: string;
  format: string;
  vendor?: string;
  claimGenerator?: string;
  assertions?: ManifestAssertion[];
  embed?: boolean;
  outputPath?: string;
}

export async function signBufferWithC2pa(
  buffer: Buffer,
  options: C2paSignOptions
): Promise<Buffer> {
  const signer = await createTestSigner();

  const c2pa = createC2pa({ signer });

  const manifest = new ManifestBuilder({
    claim_generator: options.claimGenerator ?? 'face-restore-ai/c2pa@1.0.0',
    format: options.format,
    title: options.title,
    vendor: options.vendor ?? 'face-restore-ai'
  });

  if (options.assertions?.length) {
    manifest.definition.assertions = options.assertions;
  }

  const asset: BufferAsset = {
    buffer,
    mimeType: options.format
  };

  const signOptions: SignOptions = {
    embed: options.embed ?? true,
    outputPath: options.outputPath
  };

  const result: SignOutput<BufferAsset> = await c2pa.sign({
    manifest,
    asset,
    options: signOptions
  });

  return result.signedAsset.buffer;
}

export async function readC2paManifest(buffer: Buffer, mimeType: string) {
  const c2pa = createC2pa();
  return c2pa.read({ buffer, mimeType });
}
