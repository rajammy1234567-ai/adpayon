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
  submitAppFeedback,
  verifyAppInstall,
} from '../controllers/userTask.controller';
import {
  startVideoSession,
  recordVideoProgress,
  getVideoSessionStatus,
  submitVideoQuizAnswer,
  verifyVideoWatch,
} from '../controllers/videoTask.controller';
import {
  startArticleSession,
  recordArticleProgress,
  getArticleSessionStatus,
  submitArticleQuizAnswer,
  verifyArticleRead,
} from '../controllers/articleTask.controller';
import {
  startYouTubeSession,
  recordYouTubeProgress,
  getYouTubeSessionStatus,
  submitYouTubeQuizAnswer,
  verifyYouTubeLearning,
} from '../controllers/youtubeTask.controller';
import {
  startExternalLinkSession,
  reportLinkLaunch,
  recordLinkReturn,
  getExternalLinkSessionStatus,
  verifyExternalLinkElapsed,
} from '../controllers/externalLinkTask.controller';

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
userTaskRouter.post('/tasks/:id/verify-install', verifyAppInstall);
userTaskRouter.post('/tasks/:id/app-install/complete', verifyAppInstall);
userTaskRouter.post('/tasks/:id/app-feedback/submit', submitAppFeedback);
userTaskRouter.post('/tasks/:id/app-testing/submit', submitAppFeedback);

// Video Watch dedicated verification session endpoints
userTaskRouter.post('/tasks/:id/video-session/start', startVideoSession);
userTaskRouter.post('/tasks/:id/video-session/progress', recordVideoProgress);
userTaskRouter.get('/tasks/:id/video-session/:sessionId', getVideoSessionStatus);
userTaskRouter.post('/tasks/:id/video-session/quiz', submitVideoQuizAnswer);
userTaskRouter.post('/tasks/:id/video-session/verify', verifyVideoWatch);
userTaskRouter.post('/tasks/:id/video-session/claim', verifyVideoWatch);

// Article Reading dedicated verification session endpoints
userTaskRouter.post('/tasks/:id/article-session/start', startArticleSession);
userTaskRouter.post('/tasks/:id/article-session/progress', recordArticleProgress);
userTaskRouter.get('/tasks/:id/article-session/:sessionId', getArticleSessionStatus);
userTaskRouter.post('/tasks/:id/article-session/quiz', submitArticleQuizAnswer);
userTaskRouter.post('/tasks/:id/article-session/verify', verifyArticleRead);
userTaskRouter.post('/tasks/:id/article-session/claim', verifyArticleRead);

// YouTube Video Learning dedicated verification endpoints (with mobile alias support)
userTaskRouter.post('/tasks/:id/youtube-learning/start', startYouTubeSession);
userTaskRouter.post('/tasks/:id/youtube-session/start', startYouTubeSession);
userTaskRouter.post('/tasks/:id/youtube-learning/progress', recordYouTubeProgress);
userTaskRouter.post('/tasks/:id/youtube-session/progress', recordYouTubeProgress);
userTaskRouter.get('/tasks/:id/youtube-learning/:sessionId', getYouTubeSessionStatus);
userTaskRouter.get('/tasks/:id/youtube-session/:sessionId', getYouTubeSessionStatus);
userTaskRouter.get('/tasks/:id/youtube-session/status', getYouTubeSessionStatus);
userTaskRouter.post('/tasks/:id/youtube-learning/quiz', submitYouTubeQuizAnswer);
userTaskRouter.post('/tasks/:id/youtube-session/quiz', submitYouTubeQuizAnswer);
userTaskRouter.post('/tasks/:id/youtube-learning/verify', verifyYouTubeLearning);
userTaskRouter.post('/tasks/:id/youtube-session/verify', verifyYouTubeLearning);
userTaskRouter.post('/tasks/:id/youtube-learning/claim', verifyYouTubeLearning);
userTaskRouter.post('/tasks/:id/youtube-session/claim', verifyYouTubeLearning);

// External Link Elapsed-Time completion endpoints
userTaskRouter.post('/tasks/:id/external-link/start', startExternalLinkSession);
userTaskRouter.post('/tasks/:id/external-link/launch', reportLinkLaunch);
userTaskRouter.post('/tasks/:id/external-link/return', recordLinkReturn);
userTaskRouter.get('/tasks/:id/external-link/status', getExternalLinkSessionStatus);
userTaskRouter.get('/tasks/:id/external-link/:sessionId', getExternalLinkSessionStatus);
userTaskRouter.post('/tasks/:id/external-link/verify', verifyExternalLinkElapsed);
userTaskRouter.post('/tasks/:id/external-link/claim', verifyExternalLinkElapsed);

