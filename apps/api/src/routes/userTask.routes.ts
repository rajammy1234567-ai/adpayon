import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getTaskFeed,
  startTask,
  verifyFirstPartyAction,
  recordTaskHeartbeat,
  getTaskHistory,
  getTaskSummary,
  getTaskStatus,
  recordStoreVisit,
} from '../controllers/userTask.controller';
import {
  startVideoSession,
  recordVideoProgress,
  getVideoSessionStatus,
  verifyVideoWatch,
} from '../controllers/videoTask.controller';
import {
  startArticleSession,
  recordArticleProgress,
  getArticleSessionStatus,
  submitArticleQuizAnswer,
  verifyArticleRead,
} from '../controllers/articleTask.controller';

export const userTaskRouter = Router();

// All user task endpoints require authenticated active user
userTaskRouter.use('/tasks', requireAuth);

userTaskRouter.get('/tasks/feed', getTaskFeed);
userTaskRouter.post('/tasks/:id/start', startTask);
userTaskRouter.post('/tasks/:id/heartbeat', recordTaskHeartbeat);
userTaskRouter.post('/tasks/:id/verify-action', verifyFirstPartyAction);
userTaskRouter.get('/tasks/history', getTaskHistory);
userTaskRouter.get('/tasks/summary', getTaskSummary);
userTaskRouter.get('/tasks/:id/status', getTaskStatus);
userTaskRouter.post('/tasks/:id/store-visit', recordStoreVisit);

// Video Watch dedicated verification session endpoints
userTaskRouter.post('/tasks/:id/video-session/start', startVideoSession);
userTaskRouter.post('/tasks/:id/video-session/progress', recordVideoProgress);
userTaskRouter.get('/tasks/:id/video-session/:sessionId', getVideoSessionStatus);
userTaskRouter.post('/tasks/:id/video-session/verify', verifyVideoWatch);

// Article Reading dedicated verification session endpoints
userTaskRouter.post('/tasks/:id/article-session/start', startArticleSession);
userTaskRouter.post('/tasks/:id/article-session/progress', recordArticleProgress);
userTaskRouter.get('/tasks/:id/article-session/:sessionId', getArticleSessionStatus);
userTaskRouter.post('/tasks/:id/article-session/quiz', submitArticleQuizAnswer);
userTaskRouter.post('/tasks/:id/article-session/verify', verifyArticleRead);
