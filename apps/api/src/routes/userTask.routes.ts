import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
  getTaskFeed,
  startTask,
  verifyFirstPartyAction,
  recordTaskHeartbeat,
  getTaskHistory,
  getTaskStatus,
} from '../controllers/userTask.controller';

export const userTaskRouter = Router();

// All user task endpoints require authenticated active user
userTaskRouter.use('/tasks', requireAuth);

userTaskRouter.get('/tasks/feed', getTaskFeed);
userTaskRouter.post('/tasks/:id/start', startTask);
userTaskRouter.post('/tasks/:id/heartbeat', recordTaskHeartbeat);
userTaskRouter.post('/tasks/:id/verify-action', verifyFirstPartyAction);
userTaskRouter.get('/tasks/history', getTaskHistory);
userTaskRouter.get('/tasks/:id/status', getTaskStatus);
