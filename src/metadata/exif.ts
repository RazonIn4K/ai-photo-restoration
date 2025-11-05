import { exiftool } from 'exiftool-vendored';

export type ExifMetadata = Record<string, string | number | boolean | Date | null | undefined>;

export async function writeExifMetadata(filePath: string, metadata: ExifMetadata): Promise<void> {
  await exiftool.write(filePath, metadata, ['-overwrite_original']);
}

export async function readExifMetadata(filePath: string): Promise<Record<string, unknown>> {
  return exiftool.read(filePath);
}

export async function removeExifMetadata(filePath: string): Promise<void> {
  await exiftool.write(filePath, {}, ['-all=', '-overwrite_original']);
}

export async function shutdownExifTool(): Promise<void> {
  await exiftool.end();
}
