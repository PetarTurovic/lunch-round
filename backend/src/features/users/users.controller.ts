import type { Request, Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  registerUserService,
  loginUserService,
  getUserProfileService,
  claimParticipantSessionService,
} from "./users.service";
import { BadRequestError } from "../../shared/errors";

export const registerController = async (req: Request, res: Response) => {
  const { name, email, password } = z.object({
    name: z.string().min(1).max(100), email: z.string().email().max(254), password: z.string().min(6).max(128),
  }).parse(req.body);
  res.status(201).json(await registerUserService(name, email, password));
};

export const loginController = async (req: Request, res: Response) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  res.json(await loginUserService(email, password));
};

export const meController = async (req: Request, res: Response) => {
  if (!req.user) throw new BadRequestError("User context missing");
  res.json({ user: await getUserProfileService(new Types.ObjectId(req.user.id)) });
};

export const claimController = async (req: Request, res: Response) => {
  if (!req.user) throw new BadRequestError("User context missing");
  const { roundId, participantToken } = z.object({ roundId: z.string(), participantToken: z.string().min(1) }).parse(req.body);
  const participant = await claimParticipantSessionService(new Types.ObjectId(req.user.id), new Types.ObjectId(roundId), participantToken);
  res.json({ success: true, participant });
};
