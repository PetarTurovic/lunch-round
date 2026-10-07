import type { Request, Response } from "express";
import { Types } from "mongoose";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../../errors";
import {
  Round,
  generateToken,
  hashToken,
  type RoundDocument,
  type RoundOrder,
  type RoundBill,
} from "./rounds.model";

export const calculateRoundBill = (round: RoundDocument): RoundBill => {
  const priceMap = new Map((round.items || []).map((item) => [item.id, Number(item.priceCents || 0)]));

  const peopleFood = (round.orders || []).map((order) => {
    const quantities = order.quantities || {};
    const foodCents = Object.entries(quantities).reduce(
      (sum, [itemId, qty]) => sum + Number(qty || 0) * (priceMap.get(itemId) || 0),
      0,
    );
    return { name: order.name, foodCents };
  });

  const totalFoodCents = peopleFood.reduce((sum, p) => sum + p.foodCents, 0);
  const feeCents = Number(round.feeCents || 0);

  const people = peopleFood.map((p) => {
    const feeShare = totalFoodCents > 0 ? Math.round((feeCents * p.foodCents) / totalFoodCents) : 0;
    return { name: p.name, amountCents: p.foodCents + feeShare };
  });

  return {
    settledAt: new Date(),
    totalCents: totalFoodCents + feeCents,
    people,
  };
};

const itemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  priceCents: z.number().int().min(0),
});

export const getRounds = async (req: Request, res: Response) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const userId = new Types.ObjectId(req.user!.id);
  const rounds = await Round.find({
    $or: [{ "organizer.userId": userId }, { "orders.userId": userId }],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
  res.json({ rounds });
};

export const createRound = async (req: Request, res: Response) => {
  const body = z.object({
    title: z.string().min(1).max(120),
    venue: z.string().max(120).optional(),
    organizerName: z.string().min(1).max(100).optional(),
    closesAt: z.coerce.date().optional(),
    feeCents: z.number().int().min(0).optional(),
    items: z.array(itemSchema).optional(),
  }).parse(req.body);

  const organizerToken = generateToken();
  const organizerParticipantId = new Types.ObjectId();
  const userId = new Types.ObjectId(req.user!.id);
  const organizerName = (body.organizerName || req.user!.name).trim();

  const organizerOrder: RoundOrder = {
    participantId: organizerParticipantId,
    name: organizerName,
    userId,
    tokenHash: hashToken(organizerToken),
    joinedAt: new Date(),
    quantities: {},
    updatedAt: new Date(),
  };

  const round = await Round.create({
    slug: randomBytes(4).toString("hex"),
    title: body.title.trim(),
    venue: body.venue?.trim() || "Lunch Venue",
    organizer: { participantId: organizerParticipantId, name: organizerName, userId },
    items: body.items || [],
    orders: [organizerOrder],
    feeCents: body.feeCents || 0,
    status: "open",
    closesAt: body.closesAt ?? null,
  });

  res.status(201).json({ round, organizerToken, organizerParticipant: organizerOrder });
};

export const getRound = (req: Request, res: Response) => {
  const roundObj = req.round!.toObject();
  const bill = roundObj.bill || calculateRoundBill(roundObj as any);
  res.json({ round: { ...roundObj, bill } });
};

export const updateRound = async (req: Request, res: Response) => {
  const round = req.round!;
  if (round.status === "settled") throw new BadRequestError("Cannot modify a settled round");

  const body = z.object({
    title: z.string().min(1).max(120).optional(),
    venue: z.string().max(120).optional(),
    feeCents: z.number().int().min(0).optional(),
    closesAt: z.coerce.date().nullable().optional(),
  }).parse(req.body);

  if (body.title !== undefined) round.title = body.title.trim();
  if (body.venue !== undefined) round.venue = body.venue.trim();
  if (body.feeCents !== undefined) round.feeCents = body.feeCents;
  if (body.closesAt !== undefined) round.closesAt = body.closesAt;
  await round.save();

  res.json({ round });
};

export const deleteRound = async (req: Request, res: Response) => {
  const result = await Round.deleteOne({ _id: req.round!._id });
  res.json({ result: { round: result.deletedCount ?? 0 } });
};

export const joinRound = async (req: Request, res: Response) => {
  const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
  const token = generateToken();
  const participant: RoundOrder = {
    participantId: new Types.ObjectId(),
    name: name.trim(),
    userId: req.user ? new Types.ObjectId(req.user.id) : null,
    tokenHash: hashToken(token),
    joinedAt: new Date(),
    quantities: {},
    updatedAt: new Date(),
  };

  req.round!.orders.push(participant);
  await req.round!.save();
  res.status(201).json({ participant, token });
};

export const getMyParticipant = (req: Request, res: Response) => {
  res.json({ participant: req.participant ?? null, isOrganizer: Boolean(req.isOrganizer) });
};

export const updateRoundItems = async (req: Request, res: Response) => {
  const round = req.round!;
  if (round.status === "settled") throw new BadRequestError("Cannot modify items in a settled round");

  const { items } = z.object({ items: z.array(itemSchema) }).parse(req.body);
  round.items = items;
  await round.save();
  res.json({ items: round.items });
};

export const saveOrder = async (req: Request, res: Response) => {
  const round = req.round!;
  if (round.status !== "open") throw new BadRequestError(`Cannot modify order: round is ${round.status}`);

  const { quantities } = z.object({
    quantities: z.record(z.string(), z.number().int().min(0)),
  }).parse(req.body);

  const order = round.orders.find((o) => o.participantId.equals(req.participant!.participantId));
  if (!order) throw new NotFoundError("Participant order");

  order.quantities = quantities;
  order.updatedAt = new Date();
  round.markModified("orders");
  await round.save();

  res.json({ order });
};

export const lockRound = async (req: Request, res: Response) => {
  const round = req.round!;
  round.status = "locked";
  await round.save();
  res.json({ round });
};

export const settleRound = async (req: Request, res: Response) => {
  const round = req.round!;
  if (!round.orders.length) throw new BadRequestError("Cannot settle an empty round");

  if (typeof req.body?.feeCents === "number") round.feeCents = req.body.feeCents;
  if (Array.isArray(req.body?.items)) round.items = req.body.items;

  round.bill = calculateRoundBill(round.toObject() as any);
  round.status = "settled";
  await round.save();

  res.json({ round });
};
