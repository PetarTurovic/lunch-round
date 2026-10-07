import { Router } from "express";
import {
  registerController,
  loginController,
  meController,
  claimController,
} from "./users.controller";
import { requireAuth } from "./auth.middleware";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginController);
router.get("/me", requireAuth, meController);
router.post("/claim", requireAuth, claimController);

export default router;
