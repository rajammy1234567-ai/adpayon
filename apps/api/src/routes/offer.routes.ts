import { publicOfferLandingPage } from '../controllers/publicOfferPage.controller';
import { listOfferSubmissions, reviewOfferSubmission, getOfferActivity } from '../controllers/offerSubmission.controller';
import { Router } from 'express';
import {
  getOffers,
  getOfferByIdOrSlug,
  getPublicOfferBySlug,
  generateOfferShareLink,
  completeOffer,
  getAdminOffers,
  createOffer,
  updateOffer,
  deleteOffer,
} from '../controllers/offer.controller';
import { requireAdmin } from '../middleware/adminAuth';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Public / Client endpoints
router.get('/offers', getOffers);
router.get('/offers/landing/:slug', publicOfferLandingPage);
router.get('/offers/public/:slug', getPublicOfferBySlug);
router.get('/offers/:idOrSlug', getOfferByIdOrSlug);

router.get('/offers/:id/activity', requireAuth, getOfferActivity);
router.get('/admin/offers/:id', requireAdmin, getOfferByIdOrSlug);

// Authenticated user actions
router.post('/offers/:id/share-link', requireAuth, generateOfferShareLink);
router.post('/offers/:id/complete', requireAuth, completeOffer);

router.get('/admin/offer-submissions', requireAdmin, listOfferSubmissions);
router.post('/admin/offer-submissions/:id/review', requireAdmin, reviewOfferSubmission);

// Protected Admin endpoints
router.get('/admin/offers', requireAdmin, getAdminOffers);
router.post('/admin/offers', requireAdmin, createOffer);
router.put('/admin/offers/:id', requireAdmin, updateOffer);
router.delete('/admin/offers/:id', requireAdmin, deleteOffer);

export const offerRouter = router;

