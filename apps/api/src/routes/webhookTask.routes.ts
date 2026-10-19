import { Router } from 'express';
import { handlePartnerPostback } from '../controllers/webhookTask.controller';

export const webhookTaskRouter = Router();

// Partner Server-to-Server Webhook Postback
webhookTaskRouter.post('/webhooks/tasks/postback/:campaignId', handlePartnerPostback);
