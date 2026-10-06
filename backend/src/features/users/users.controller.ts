import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  registerUserService,
  loginUserService,
  getUserProfileService,
  claimParticipantSessionService,
} from "./users.service";
import { BadRequestError } from "../../shared/errors";

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

export const registerController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name, email, password } = registerSchema.parse(req.body);
    const result = await registerUserService(name, email, password);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const loginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await loginUserService(email, password);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const meController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new BadRequestError("User context missing");
    }
    const profile = await getUserProfileService(
      new Types.ObjectId(req.user.id),
    );
    res.json({ user: profile });
  } catch (error) {
    next(error);
  }
};

export const claimController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      throw new BadRequestError("User context missing");
    }
    const { roundId, participantToken } = claimSchema.parse(req.body);
    const updated = await claimParticipantSessionService(
      new Types.ObjectId(req.user.id),
      new Types.ObjectId(roundId),
      participantToken,
    );
    res.json({ success: true, participant: updated });
  } catch (error) {
    next(error);
  }
};
