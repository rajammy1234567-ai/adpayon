import mongoose from 'mongoose';
import { Types } from 'mongoose';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export interface ProofFileMetadata {
  userId: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

export function validateImageBuffer(buffer: Buffer): { valid: boolean; mimeType: string | null; error?: string } {
  if (!buffer || buffer.length === 0) {
    return { valid: false, mimeType: null, error: 'Empty file provided' };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return { valid: false, mimeType: null, error: `File size exceeds limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
  }

  // Magic bytes check
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mimeType: 'image/png' };
  }

  // WebP: RIFF ... WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { valid: true, mimeType: 'image/webp' };
  }

  return {
    valid: false,
    mimeType: null,
    error: 'Invalid image format. Only authentic JPEG, PNG, and WebP images are allowed.',
  };
}

let bucketInstance: mongoose.mongo.GridFSBucket | null = null;

function getGridFSBucket(): mongoose.mongo.GridFSBucket {
  if (!mongoose.connection.db) {
    throw new Error('Database connection is not established');
  }
  if (!bucketInstance || (bucketInstance as any).s?.db !== mongoose.connection.db) {
    bucketInstance = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'proofUploads',
    });
  }
  return bucketInstance;
}

export async function uploadProofToGridFS(
  buffer: Buffer,
  originalName: string,
  userId: string
): Promise<{ fileId: string; url: string; mimeType: string; size: number }> {
  const validation = validateImageBuffer(buffer);
  if (!validation.valid || !validation.mimeType) {
    throw new Error(validation.error || 'Invalid image buffer');
  }

  const bucket = getGridFSBucket();
  const fileId = new Types.ObjectId();
  const cleanOriginalName = (originalName || 'screenshot').replace(/[^a-zA-Z0-9_.-]/g, '_');
  const filename = `${fileId.toString()}-${cleanOriginalName}`;

  const metadata: ProofFileMetadata = {
    userId,
    originalName: cleanOriginalName,
    mimeType: validation.mimeType,
    size: buffer.length,
    uploadedAt: new Date(),
  };

  await new Promise<void>((resolve, reject) => {
    const uploadStream = bucket.openUploadStreamWithId(fileId, filename, {
      metadata: metadata as any,
    });

    uploadStream.on('error', (err) => reject(err));
    uploadStream.on('finish', () => resolve());
    uploadStream.end(buffer);
  });

  return {
    fileId: fileId.toString(),
    url: `/api/uploads/proof/${fileId.toString()}`,
    mimeType: validation.mimeType,
    size: buffer.length,
  };
}

export async function findProofFile(
  fileId: string
): Promise<{ _id: Types.ObjectId; filename: string; metadata?: ProofFileMetadata } | null> {
  if (!Types.ObjectId.isValid(fileId)) {
    return null;
  }
  const bucket = getGridFSBucket();
  const id = new Types.ObjectId(fileId);
  const files = await bucket.find({ _id: id }).toArray();
  if (!files || files.length === 0) {
    return null;
  }
  return files[0] as any;
}

export async function getProofFromGridFS(
  fileId: string
): Promise<{ stream: NodeJS.ReadableStream; metadata: ProofFileMetadata; filename: string } | null> {
  if (!Types.ObjectId.isValid(fileId)) {
    return null;
  }

  const bucket = getGridFSBucket();
  const id = new Types.ObjectId(fileId);

  const files = await bucket.find({ _id: id }).toArray();
  if (!files || files.length === 0) {
    return null;
  }

  const fileDoc = files[0];
  const stream = bucket.openDownloadStream(id);

  return {
    stream,
    metadata: fileDoc.metadata as any as ProofFileMetadata,
    filename: fileDoc.filename,
  };
}

export async function deleteProofFromGridFS(fileId: string): Promise<boolean> {
  if (!Types.ObjectId.isValid(fileId)) {
    return false;
  }
  try {
    const bucket = getGridFSBucket();
    await bucket.delete(new Types.ObjectId(fileId));
    return true;
  } catch {
    return false;
  }
}
