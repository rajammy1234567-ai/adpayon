import { Router } from 'express';
import {
  getNewsFeed,
  listAllNewsAdmin,
  createNewsArticle,
  updateNewsArticle,
  publishNewsArticle,
  unpublishNewsArticle,
  deleteNewsArticle,
} from '../controllers/news.controller';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// Public / User read endpoint
router.get('/news', getNewsFeed);

// Protected Admin curation endpoints
router.get('/admin/news', requireAdmin, listAllNewsAdmin);
router.post('/admin/news', requireAdmin, createNewsArticle);
router.patch('/admin/news/:id', requireAdmin, updateNewsArticle);
router.post('/admin/news/:id/publish', requireAdmin, publishNewsArticle);
router.post('/admin/news/:id/unpublish', requireAdmin, unpublishNewsArticle);
router.delete('/admin/news/:id', requireAdmin, deleteNewsArticle);

export const newsRouter = router;
