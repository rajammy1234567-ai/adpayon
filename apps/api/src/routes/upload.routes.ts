import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { uploadMiddleware, uploadProof, getProof } from '../controllers/upload.controller';

const router = Router();

// Upload proof screenshot (authenticated submitter)
router.post('/uploads/proof', requireAuth, uploadMiddleware, uploadProof);

// Retrieve proof screenshot (authenticated submitter or admin)
router.get('/uploads/proof/:fileId', requireAuth, getProof);

export const uploadRouter = router;

