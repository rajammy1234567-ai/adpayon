import { Router } from 'express';
import {
  handlePartnerPostback,
  handleAppInstallConversion,
} from '../controllers/webhookTask.controller';

export const webhookTaskRouter = Router();

// Dedicated App Acquisition Conversion Webhook Endpoint (Phase 10.5C)
webhookTaskRouter.post(
  '/webhooks/campaigns/:campaignId/install-conversion',
  handleAppInstallConversion
);

// General Partner Server-to-Server Webhook Postback (Backward compatible)
webhookTaskRouter.post(
  '/webhooks/tasks/postback/:campaignId',
  handlePartnerPostback
);
