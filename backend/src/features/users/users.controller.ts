import type { Request, Response } from "express";
import { Types } from "mongoose";
import {
  registerUserService,
  loginUserService,
  getUserProfileService,
  claimParticipantSessionService,
} from "./users.service";
import { BadRequestError } from "../../shared/errors";

export const registerController = async (req: Request, res: Response) => {
  const { name, email, password } = req.body;
  res.status(201).json(await registerUserService(name, email, password));
};

export const loginController = async (req: Request, res: Response) => {
  const { email, password } = req.body;
  res.json(await loginUserService(email, password));
};

export const meController = async (req: Request, res: Response) => {
  if (!req.user) throw new BadRequestError("User context missing");
  res.json({ user: await getUserProfileService(new Types.ObjectId(req.user.id)) });
};

export const claimController = async (req: Request, res: Response) => {
  if (!req.user) throw new BadRequestError("User context missing");
  const { roundId, participantToken } = req.body;
  const participant = await claimParticipantSessionService(new Types.ObjectId(req.user.id), new Types.ObjectId(roundId), participantToken);
  res.json({ success: true, participant });
};
