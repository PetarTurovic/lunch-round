import { Router } from "express";
import { z } from "zod";
import {
  registerController,
  loginController,
  meController,
  claimController,
} from "./users.controller";
import { requireAuth } from "./auth.middleware";
import { validate } from "../../shared/middleware";

const router = Router();

const registerSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(254),
  password: z.string().min(6).max(128),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const claimSchema = z.object({
  roundId: z.string(),
  participantToken: z.string().min(1),
});

router.post("/register", validate({ body: registerSchema }), registerController);
router.post("/login", validate({ body: loginSchema }), loginController);
router.get("/me", requireAuth, meController);
router.post("/claim", requireAuth, validate({ body: claimSchema }), claimController);

export default router;
