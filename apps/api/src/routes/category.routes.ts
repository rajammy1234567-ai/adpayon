import { Router } from 'express';
import {
  getCategories,
  getCategoryByIdOrSlug,
  getAdminCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// Public / Client endpoints
router.get('/categories', getCategories);
router.get('/categories/:idOrSlug', getCategoryByIdOrSlug);

// Protected Admin endpoints
router.get('/admin/categories', requireAdmin, getAdminCategories);
router.post('/admin/categories', requireAdmin, createCategory);
router.put('/admin/categories/:id', requireAdmin, updateCategory);
router.delete('/admin/categories/:id', requireAdmin, deleteCategory);

export const categoryRouter = router;

