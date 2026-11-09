import { Response } from 'express';
import multer from 'multer';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { uploadProofToGridFS, getProofFromGridFS } from '../services/storage/proofStorage';
import { logger } from '../config/logger';

// Memory storage for multer with 5MB limit
const storage = multer.memoryStorage();
export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1,
  },
}).fields([
  { name: 'proof', maxCount: 1 },
  { name: 'screenshot', maxCount: 1 },
  { name: 'image', maxCount: 1 },
]);

/**
 * POST /api/uploads/proof
 * Authenticated upload of screenshot proof for Task Hub & Earn Hub.
 */
export async function uploadProof(req: AuthenticatedRequest, res: Response): Promise<void> {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ success: false, error: { message: 'Authentication required' } });
    return;
  }

  const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
  const singleFile = req.file;

  const targetFile =
    singleFile ||
    files?.proof?.[0] ||
    files?.screenshot?.[0] ||
    files?.image?.[0];

  if (!targetFile || !targetFile.buffer || targetFile.buffer.length === 0) {
    res.status(400).json({
      success: false,
      error: { code: 'NO_FILE', message: 'No screenshot file was uploaded. Select an image to upload.' },
    });
    return;
  }

  try {
    const result = await uploadProofToGridFS(
      targetFile.buffer,
      targetFile.originalname || 'screenshot.png',
      userId.toString()
    );

    res.status(201).json({
      success: true,
      data: result,
      message: 'Screenshot uploaded successfully.',
    });
  } catch (err: any) {
    logger.warn({ err }, 'Proof upload validation failed');
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_IMAGE', message: err.message || 'Image validation failed' },
    });
  }
}

/**
 * GET /api/uploads/proof/:fileId
 * Authenticated retrieval of screenshot proof.
 * Restricted strictly to submitter and admins.
 */
export async function getProof(req: AuthenticatedRequest, res: Response): Promise<void> {
  const { fileId } = req.params;
  const currentUser = req.user;

  if (!currentUser) {
    res.status(401).json({ success: false, error: { message: 'Authentication required' } });
    return;
  }

  try {
    const proof = await getProofFromGridFS(fileId);
    if (!proof) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Proof file not found' },
      });
      return;
    }

    // Authorization check: Submitter OR Admin
    const isOwner = proof.metadata?.userId === currentUser._id.toString();
    const isAdmin = currentUser.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Access denied. You do not have permission to view this proof screenshot.',
        },
      });
      return;
    }

    res.setHeader('Content-Type', proof.metadata.mimeType || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    proof.stream.pipe(res);
  } catch (err: any) {
    logger.error({ err }, 'Failed to stream proof file');
    res.status(500).json({
      success: false,
      error: { code: 'STORAGE_ERROR', message: 'Failed to retrieve proof file' },
    });
  }
}

