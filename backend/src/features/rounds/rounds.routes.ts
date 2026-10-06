import { Router } from "express";
import {
  createRoundController,
  getRoundsController,
  getRoundController,
  updateRoundController,
  deleteRoundController,
  joinRoundController,
  getMyParticipantController,
  addSelectionController,
  updateSelectionController,
  removeSelectionController,
  overridePriceController,
  addAdjustmentController,
  removeAdjustmentController,
  recordPaymentController,
  lockRoundController,
  settleRoundController,
  getTimelineController,
} from "./rounds.controller";
import {
  requireAuth,
  optionalAuth,
  resolveRoundMiddleware,
  resolveParticipantMiddleware,
  requireParticipant,
  requireOrganizer,
} from "../users/auth.middleware";

const router = Router();

// Round list & creation (requires logged-in user)
router.get("/", requireAuth, getRoundsController);
router.post("/", requireAuth, createRoundController);

// Single round details
router.get("/:idOrSlug", getRoundController);
router.patch(
  "/:idOrSlug",
  resolveRoundMiddleware,
  requireOrganizer,
  updateRoundController,
);
router.delete(
  "/:idOrSlug",
  resolveRoundMiddleware,
  requireOrganizer,
  deleteRoundController,
);

// Participant operations
router.post(
  "/:idOrSlug/join",
  resolveRoundMiddleware,
  optionalAuth,
  joinRoundController,
);
router.get(
  "/:idOrSlug/me",
  resolveRoundMiddleware,
  resolveParticipantMiddleware,
  getMyParticipantController,
);

// Selection operations
router.post(
  "/:idOrSlug/selections",
  resolveRoundMiddleware,
  requireParticipant,
  addSelectionController,
);
router.patch(
  "/:idOrSlug/selections/:selectionId",
  resolveRoundMiddleware,
  requireParticipant,
  updateSelectionController,
);
router.delete(
  "/:idOrSlug/selections/:selectionId",
  resolveRoundMiddleware,
  requireParticipant,
  removeSelectionController,
);
router.post(
  "/:idOrSlug/selections/:selectionId/price",
  resolveRoundMiddleware,
  requireOrganizer,
  overridePriceController,
);

// Adjustments & Payments (organizer)
router.post(
  "/:idOrSlug/orders/:orderId/adjustments",
  resolveRoundMiddleware,
  requireOrganizer,
  addAdjustmentController,
);
router.delete(
  "/:idOrSlug/orders/:orderId/adjustments/:adjustmentId",
  resolveRoundMiddleware,
  requireOrganizer,
  removeAdjustmentController,
);
router.post(
  "/:idOrSlug/orders/:orderId/payments",
  resolveRoundMiddleware,
  requireOrganizer,
  recordPaymentController,
);

// Round lifecycle actions
router.post(
  "/:idOrSlug/lock",
  resolveRoundMiddleware,
  requireOrganizer,
  lockRoundController,
);
router.post(
  "/:idOrSlug/settle",
  resolveRoundMiddleware,
  requireOrganizer,
  settleRoundController,
);

// Money timeline / audit trail
router.get(
  "/:idOrSlug/timeline",
  resolveRoundMiddleware,
  getTimelineController,
);

export default router;
