import { Router } from 'express';
import { requireAdmin } from '../middleware/adminAuth';
import {
  createCampaign,
  listCampaigns,
  updateCampaign,
  createTask,
  listTasks,
  updateTask,
  publishTask,
  pauseTask,
  expireTask,
  reviewCompletion,
  getAdminMetrics,
  getCampaignDetails,
  revealCampaignSecret,
  getTaskDetails,
  listCompletions,
  listAuditLogs,
} from '../controllers/adminTask.controller';

export const adminTaskRouter = Router();

// All admin task routes require strict ADMIN authentication
adminTaskRouter.use('/admin', requireAdmin);

// Dashboard overview metrics
adminTaskRouter.get('/admin/metrics', getAdminMetrics);

// Campaign endpoints
adminTaskRouter.post('/admin/campaigns', createCampaign);
adminTaskRouter.get('/admin/campaigns', listCampaigns);
adminTaskRouter.get('/admin/campaigns/:id', getCampaignDetails);
adminTaskRouter.patch('/admin/campaigns/:id', updateCampaign);
adminTaskRouter.post('/admin/campaigns/:id/reveal-secret', revealCampaignSecret);

// Task completions & fraud review queue (registered before parameterized /admin/tasks/:id)
adminTaskRouter.get('/admin/tasks/completions', listCompletions);
adminTaskRouter.post('/admin/tasks/completions/:id/review', reviewCompletion);

// Task endpoints
adminTaskRouter.post('/admin/tasks', createTask);
adminTaskRouter.get('/admin/tasks', listTasks);
adminTaskRouter.get('/admin/tasks/:id', getTaskDetails);
adminTaskRouter.patch('/admin/tasks/:id', updateTask);
adminTaskRouter.post('/admin/tasks/:id/publish', publishTask);
adminTaskRouter.post('/admin/tasks/:id/pause', pauseTask);
adminTaskRouter.post('/admin/tasks/:id/expire', expireTask);

// Platform Audit Logs
adminTaskRouter.get('/admin/audit-logs', listAuditLogs);
