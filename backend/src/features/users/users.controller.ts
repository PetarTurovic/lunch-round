import type { Request, Response } from "express";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../errors";
import { signUserToken } from "../../auth.middleware";
import { User } from "./users.model";
import { Round, hashToken, type RoundOrder } from "../rounds/rounds.model";

const authResponse = (u: any) => ({
  token: signUserToken({ _id: u._id, email: u.email, name: u.name }),
  user: { id: u._id.toString(), email: u.email, name: u.name, createdAt: u.createdAt },
});

export const register = async (req: Request, res: Response) => {
  const { name, email, password } = z.object({
    name: z.string().min(1).max(100),
    email: z.string().email().max(254),
    password: z.string().min(6).max(128),
  }).parse(req.body);

  const normalizedEmail = email.toLowerCase().trim();
  if (await User.findOne({ email: normalizedEmail }).lean()) {
    throw new ConflictError("A user with this email already exists");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash });
  res.status(201).json(authResponse(user));
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }).parse(req.body);

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password");
  }

  res.json(authResponse(user));
};

export const me = async (req: Request, res: Response) => {
  const userId = new Types.ObjectId(req.user!.id);
  const user = await User.findById(userId).select("-passwordHash").lean();
  if (!user) throw new NotFoundError("User");

  const [organizedRounds, joinedRounds] = await Promise.all([
    Round.countDocuments({ "organizer.userId": userId }),
    Round.countDocuments({ "orders.userId": userId }),
  ]);

  res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      stats: { organizedRounds, joinedRounds },
    },
  });
};

export const claim = async (req: Request, res: Response) => {
  const { roundId, participantToken } = z.object({
    roundId: z.string(),
    participantToken: z.string().min(1),
  }).parse(req.body);

  const rId = new Types.ObjectId(roundId);
  const uId = new Types.ObjectId(req.user!.id);
  const tokenHash = hashToken(participantToken);

  const round = await Round.findOne({ _id: rId, "orders.tokenHash": tokenHash });
  if (!round) throw new NotFoundError("Participant session not found or invalid token");

  const order = round.orders.find((o: RoundOrder) => o.tokenHash === tokenHash);
  if (!order) throw new NotFoundError("Participant order");
  if (order.userId && !order.userId.equals(uId)) {
    throw new ConflictError("This participant is already claimed by another user");
  }

  order.userId = uId;
  if (round.organizer.participantId.equals(order.participantId)) {
    round.organizer.userId = uId;
  }
  await round.save();

  res.json({ success: true, participant: order });
};
