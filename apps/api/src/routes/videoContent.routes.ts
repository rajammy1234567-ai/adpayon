import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import {
  getPublishedVideos,
  adminListVideos,
  adminCreateVideo,
  adminUpdateVideo,
  adminDeleteVideo,
} from '../controllers/videoContent.controller';

export const videoContentRouter = Router();

// Public / User routes
videoContentRouter.get('/videos', getPublishedVideos);

// Admin routes
videoContentRouter.get('/admin/videos', requireAdmin, adminListVideos);
videoContentRouter.post('/admin/videos', requireAdmin, adminCreateVideo);
videoContentRouter.put('/admin/videos/:id', requireAdmin, adminUpdateVideo);
videoContentRouter.delete('/admin/videos/:id', requireAdmin, adminDeleteVideo);

