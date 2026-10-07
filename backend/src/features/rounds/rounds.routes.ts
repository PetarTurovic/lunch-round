import { Router } from "express";
import * as roundCtrl from "./rounds.controller";
import { requireAuth, optionalAuth, resolveRound } from "../../auth.middleware";

export const roundsRouter = Router();

roundsRouter.get("/", requireAuth, roundCtrl.getRounds);
roundsRouter.post("/", requireAuth, roundCtrl.createRound);

roundsRouter.get("/:idOrSlug", resolveRound(), roundCtrl.getRound);
roundsRouter.patch("/:idOrSlug", resolveRound({ requireOrganizer: true }), roundCtrl.updateRound);
roundsRouter.delete("/:idOrSlug", resolveRound({ requireOrganizer: true }), roundCtrl.deleteRound);

roundsRouter.post("/:idOrSlug/join", resolveRound(), optionalAuth, roundCtrl.joinRound);
roundsRouter.get("/:idOrSlug/me", resolveRound(), roundCtrl.getMyParticipant);

roundsRouter.put("/:idOrSlug/items", resolveRound({ requireOrganizer: true }), roundCtrl.updateRoundItems);
roundsRouter.post("/:idOrSlug/order", resolveRound({ requireParticipant: true }), roundCtrl.saveOrder);

roundsRouter.post("/:idOrSlug/lock", resolveRound({ requireOrganizer: true }), roundCtrl.lockRound);
roundsRouter.post("/:idOrSlug/settle", resolveRound({ requireOrganizer: true }), roundCtrl.settleRound);

export default roundsRouter;
