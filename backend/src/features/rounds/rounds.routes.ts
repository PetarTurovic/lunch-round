import { Router } from "express";
import * as c from "./rounds.controller";
import {
  requireAuth,
  optionalAuth,
  resolveRoundMiddleware as rMid,
  resolveParticipantMiddleware as pMid,
  requireParticipant as reqPart,
  requireOrganizer as reqOrg,
} from "../users/auth.middleware";

const router = Router();

router.get("/", requireAuth, c.getRoundsController);
router.post("/", requireAuth, c.createRoundController);

router.get("/:idOrSlug", c.getRoundController);
router.patch("/:idOrSlug", rMid, reqOrg, c.updateRoundController);
router.delete("/:idOrSlug", rMid, reqOrg, c.deleteRoundController);

router.post("/:idOrSlug/join", rMid, optionalAuth, c.joinRoundController);
router.get("/:idOrSlug/me", rMid, pMid, c.getMyParticipantController);

router.post("/:idOrSlug/selections", rMid, reqPart, c.addSelectionController);
router.patch("/:idOrSlug/selections/:selectionId", rMid, reqPart, c.updateSelectionController);
router.delete("/:idOrSlug/selections/:selectionId", rMid, reqPart, c.removeSelectionController);
router.post("/:idOrSlug/selections/:selectionId/price", rMid, reqOrg, c.overridePriceController);

router.post("/:idOrSlug/orders/:orderId/adjustments", rMid, reqOrg, c.addAdjustmentController);
router.delete("/:idOrSlug/orders/:orderId/adjustments/:adjustmentId", rMid, reqOrg, c.removeAdjustmentController);
router.post("/:idOrSlug/orders/:orderId/payments", rMid, reqOrg, c.recordPaymentController);

router.post("/:idOrSlug/lock", rMid, reqOrg, c.lockRoundController);
router.post("/:idOrSlug/settle", rMid, reqOrg, c.settleRoundController);
router.get("/:idOrSlug/timeline", rMid, c.getTimelineController);

export default router;
