import type { Request, Response } from "express";
import { Types } from "mongoose";
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { z } from "zod";
import { ConflictError, NotFoundError, UnauthorizedError } from "../../errors";
import { signUserToken } from "../../auth.middleware";
import { User } from "./users.model";
import { Round, hashToken, type RoundOrder } from "../rounds/rounds.model";

const scryptAsync = promisify(scrypt);

const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString("hex");
  const key = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt}:${key.toString("hex")}`;
};

const verifyPassword = async (password: string, storedHash: string): Promise<boolean> => {
  const [salt, key] = storedHash.split(":");
  if (!salt || !key) return false;
  const keyBuffer = Buffer.from(key, "hex");
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return keyBuffer.length === derivedKey.length && timingSafeEqual(keyBuffer, derivedKey);
};

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

  const passwordHash = await hashPassword(password);
  const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash });
  res.status(201).json(authResponse(user));
};

export const login = async (req: Request, res: Response) => {
  const { email, password } = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }).parse(req.body);

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
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
      location: user.location ?? null,
      createdAt: user.createdAt,
      stats: { organizedRounds, joinedRounds },
    },
  });
};

export const updateMe = async (req: Request, res: Response) => {
  const userId = new Types.ObjectId(req.user!.id);
  const body = z.object({
    name: z.string().min(1).max(100).optional(),
    location: z.object({
      lat: z.number(),
      lon: z.number(),
      radiusKm: z.number().min(0.1).max(100).optional(),
    }).nullable().optional(),
  }).parse(req.body);

  const user = await User.findById(userId);
  if (!user) throw new NotFoundError("User");

  if (body.name !== undefined) user.name = body.name.trim();
  if (body.location !== undefined) {
    user.location = body.location
      ? { ...body.location, radiusKm: body.location.radiusKm || 10 }
      : null;
  }
  await user.save();

  res.json({
    user: {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      location: user.location ?? null,
      createdAt: user.createdAt,
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
