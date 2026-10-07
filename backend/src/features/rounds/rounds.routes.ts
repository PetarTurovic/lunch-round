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

// Simplified item & order operations matching frontend
router.put("/:idOrSlug/items", rMid, reqOrg, c.updateRoundItemsController);
router.post("/:idOrSlug/order", rMid, reqPart, c.saveOrderController);

router.post("/:idOrSlug/lock", rMid, reqOrg, c.lockRoundController);
router.post("/:idOrSlug/settle", rMid, reqOrg, c.settleRoundController);

export default router;
