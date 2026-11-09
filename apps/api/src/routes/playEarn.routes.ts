import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/adminAuth';
import {
  getActivitiesStatus,
  spinWheel,
  scratchCard,
  validatePuzzle,
  getQuizQuestions,
  submitQuizAnswers,
  adminGetConfigs,
  adminUpdateConfig,
  adminListAttempts,
  adminReviewAttempt,
} from '../controllers/playEarn.controller';

export const playEarnRouter = Router();

// User routes
playEarnRouter.get('/play-earn/activities', requireAuth, getActivitiesStatus);
playEarnRouter.post('/play-earn/spin', requireAuth, spinWheel);
playEarnRouter.post('/play-earn/scratch', requireAuth, scratchCard);
playEarnRouter.post('/play-earn/puzzle/validate', requireAuth, validatePuzzle);
playEarnRouter.get('/play-earn/quiz/questions', requireAuth, getQuizQuestions);
playEarnRouter.post('/play-earn/quiz/submit', requireAuth, submitQuizAnswers);

// Admin routes
playEarnRouter.get('/admin/play-earn/configs', requireAdmin, adminGetConfigs);
playEarnRouter.put('/admin/play-earn/configs/:activityType', requireAdmin, adminUpdateConfig);
playEarnRouter.get('/admin/play-earn/attempts', requireAdmin, adminListAttempts);
playEarnRouter.post('/admin/play-earn/attempts/:id/review', requireAdmin, adminReviewAttempt);

