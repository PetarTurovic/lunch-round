import type { Request, Response } from "express";
import { Types } from "mongoose";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { BadRequestError, NotFoundError } from "../../errors";
import { Store } from "../stores/stores.model";
import {
  Round,
  generateToken,
  hashToken,
  type RoundDocument,
  type RoundItem,
  type RoundOrder,
  type RoundBill,
  type RoundStoreSummary,
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
  storeId: z.string().optional(),
  storeName: z.string().optional(),
  section: z.string().optional(),
  imageUrl: z.string().optional(),
});

const parseRating = (r: any): number | null => {
  if (typeof r === "number" && Number.isFinite(r)) return r;
  if (r && typeof r === "object") {
    const val = Number(r.value);
    if (Number.isFinite(val)) return val;
  }
  return null;
};

const populateShortlist = async (storeIds: string[], items: RoundItem[] = []): Promise<RoundStoreSummary[]> => {
  if (!storeIds.length) return [];
  const stores = await Store.find({ _id: { $in: storeIds } }).lean();
  return storeIds.map((id) => {
    const store = stores.find((s) => String(s._id) === String(id));
    const item = items.find((i) => String(i.storeId) === String(id));
    const count = items.filter((i) => String(i.storeId) === String(id)).length;
    return {
      _id: String(id),
      slug: store?.slug || null,
      name: store?.name || item?.storeName || id,
      platform: store?.platform || "",
      currency: (store?.currency || "EUR").toUpperCase(),
      rating: parseRating(store?.rating),
      ...(count > 0 ? { itemCount: count } : {}),
    };
  });
};

const extractItemsFromStores = (stores: any[]): RoundItem[] => {
  return stores.flatMap((store) =>
    (store.menu?.sections || []).flatMap((section: any) =>
      (section.items || [])
        .filter((item: any) => item.available !== false && typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0)
        .map((item: any) => ({
          id: `${store._id}:${item._id || item.externalId}`,
          name: item.name,
          description: item.description || undefined,
          priceCents: Math.round(Number(item.price) * 100),
          storeId: String(store._id),
          storeName: store.name,
          section: section.title,
          imageUrl: item.imageUrl || undefined,
        }))
    )
  );
};

export const getRounds = async (req: Request, res: Response) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
  const userId = new Types.ObjectId(req.user!.id);
  const rounds = await Round.find({
    $or: [{ "organizer.userId": userId }, { "orders.userId": userId }],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const formatted = rounds.map((round) => {
    if (!round.shortlist?.length && round.items?.length) {
      const storesById = new Map();
      for (const item of round.items) {
        if (item.storeId && item.storeName) {
          storesById.set(item.storeId, { _id: item.storeId, name: item.storeName });
        }
      }
      round.shortlist = Array.from(storesById.values());
    }
    return round;
  });

  res.json({ rounds: formatted });
};

export const createRound = async (req: Request, res: Response) => {
  const body = z.object({
    title: z.string().min(1).max(120),
    venue: z.string().max(120).optional(),
    currency: z.string().max(10).optional(),
    location: z.object({
      lat: z.number(),
      lon: z.number(),
      city: z.string().optional(),
      cityLabel: z.string().optional(),
      radiusKm: z.number().min(0.1).max(100).optional(),
    }).nullable().optional(),
    organizerName: z.string().min(1).max(100).optional(),
    closesAt: z.coerce.date().optional(),
    feeCents: z.number().int().min(0).optional(),
    storeIds: z.array(z.string()).optional(),
    shortlist: z.array(z.any()).optional(),
    items: z.array(itemSchema).optional(),
  }).parse(req.body);

  const organizerToken = generateToken();
  const organizerParticipantId = new Types.ObjectId();
  const userId = new Types.ObjectId(req.user!.id);
  const organizerName = (body.organizerName || req.user!.name).trim();

  let items: RoundItem[] = body.items || [];
  let shortlist: RoundStoreSummary[] = body.shortlist || [];

  if (!shortlist.length && body.storeIds?.length) {
    const stores = await Store.find({ _id: { $in: body.storeIds } }).lean();
    shortlist = await populateShortlist(body.storeIds, items);
    if (!items.length) {
      items = extractItemsFromStores(stores);
    }
  } else if (!shortlist.length && items.length) {
    const storeIds = [...new Set(items.map((i) => i.storeId).filter(Boolean))] as string[];
    shortlist = await populateShortlist(storeIds, items);
  }

  if (!shortlist.length) {
    throw new BadRequestError("At least one restaurant must be selected for the round");
  }

  const venue = body.venue?.trim()
    || (shortlist.length === 1 ? shortlist[0].name : shortlist.length > 1 ? "Multiple restaurants" : "Lunch Venue");
  const currency = (body.currency || shortlist[0]?.currency || "EUR").toUpperCase();

  const organizerOrder: RoundOrder = {
    participantId: organizerParticipantId,
    name: organizerName,
    userId,
    tokenHash: hashToken(organizerToken),
    joinedAt: new Date(),
    quantities: {},
    updatedAt: new Date(),
  };

  const organizerParticipant = {
    participantId: organizerParticipantId,
    name: organizerName,
    userId,
    isOrganizer: true,
  };

  const round = await Round.create({
    slug: randomBytes(4).toString("hex"),
    title: body.title.trim(),
    venue,
    currency,
    location: body.location ? { ...body.location, radiusKm: body.location.radiusKm || 10 } : null,
    organizer: { participantId: organizerParticipantId, name: organizerName, userId },
    shortlist,
    items,
    participants: [organizerParticipant],
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
  if (!roundObj.shortlist?.length && roundObj.items?.length) {
    const storesById = new Map();
    for (const item of roundObj.items) {
      if (item.storeId && item.storeName) {
        storesById.set(item.storeId, { _id: item.storeId, name: item.storeName });
      }
    }
    roundObj.shortlist = Array.from(storesById.values());
  }
  res.json({ round: { ...roundObj, bill } });
};

export const updateRound = async (req: Request, res: Response) => {
  const round = req.round!;
  if (round.status === "settled") throw new BadRequestError("Cannot modify a settled round");

  const body = z.object({
    title: z.string().min(1).max(120).optional(),
    venue: z.string().max(120).optional(),
    currency: z.string().max(10).optional(),
    location: z.object({
      lat: z.number(),
      lon: z.number(),
      city: z.string().optional(),
      cityLabel: z.string().optional(),
      radiusKm: z.number().min(0.1).max(100).optional(),
    }).nullable().optional(),
    feeCents: z.number().int().min(0).optional(),
    closesAt: z.coerce.date().nullable().optional(),
    status: z.enum(["open", "locked", "ordered"]).optional(),
    storeIds: z.array(z.string()).optional(),
    shortlist: z.array(z.any()).optional(),
    items: z.array(itemSchema).optional(),
  }).parse(req.body);

  if (body.title !== undefined) round.title = body.title.trim();
  if (body.venue !== undefined) round.venue = body.venue.trim();
  if (body.currency !== undefined) round.currency = body.currency;
  if (body.location !== undefined) {
    round.location = body.location ? { ...body.location, radiusKm: body.location.radiusKm || 10 } : null;
  }
  if (body.feeCents !== undefined) round.feeCents = body.feeCents;
  if (body.closesAt !== undefined) round.closesAt = body.closesAt;
  if (body.status !== undefined) round.status = body.status;

  if (body.items !== undefined) {
    round.items = body.items;
  }

  if (body.shortlist !== undefined) {
    round.shortlist = body.shortlist;
  } else if (body.storeIds !== undefined) {
    round.shortlist = await populateShortlist(body.storeIds, round.items);
    if (body.items === undefined) {
      const stores = await Store.find({ _id: { $in: body.storeIds } }).lean();
      round.items = extractItemsFromStores(stores);
    }
  } else if (body.items !== undefined) {
    const storeIds = [...new Set(body.items.map((i) => i.storeId).filter(Boolean))] as string[];
    if (storeIds.length) {
      round.shortlist = await populateShortlist(storeIds, body.items);
    }
  }

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
  const participantId = new Types.ObjectId();
  const userId = req.user ? new Types.ObjectId(req.user.id) : null;
  const participantName = name.trim();

  const participant: RoundOrder = {
    participantId,
    name: participantName,
    userId,
    tokenHash: hashToken(token),
    joinedAt: new Date(),
    quantities: {},
    updatedAt: new Date(),
  };

  req.round!.participants.push({
    participantId,
    name: participantName,
    userId,
    isOrganizer: false,
  });
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
  const storeIds = [...new Set(items.map((i) => i.storeId).filter(Boolean))] as string[];
  if (storeIds.length) {
    round.shortlist = await populateShortlist(storeIds, items);
  }
  await round.save();
  res.json({ items: round.items, shortlist: round.shortlist });
};

export const saveOrder = async (req: Request, res: Response) => {
  const round = req.round!;
  if (round.status !== "open") throw new BadRequestError(`Cannot modify order: round is ${round.status}`);

  const { quantities, name } = z.object({
    quantities: z.record(z.string(), z.number().int().min(0)),
    name: z.string().min(1).max(100).optional(),
  }).parse(req.body);

  const order = round.orders.find((o) => o.participantId.equals(req.participant!.participantId));
  if (!order) throw new NotFoundError("Participant order");

  order.quantities = quantities;
  if (name && name.trim()) {
    const trimmed = name.trim();
    order.name = trimmed;
    const p = round.participants.find((item) => item.participantId.equals(req.participant!.participantId));
    if (p) p.name = trimmed;
    round.markModified("participants");
  }
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

  const bill = calculateRoundBill(round.toObject() as any);
  round.bill = bill;
  round.settlement = {
    isLive: false,
    totalCents: bill.totalCents,
    orderTotalCents: bill.totalCents,
    perParticipant: bill.people.map((p, idx) => ({
      participantId: String(round.orders[idx]?.participantId || ""),
      participantName: p.name,
      totalCents: p.amountCents,
      itemsCents: p.amountCents,
      adjustmentsCents: 0,
    })),
    frozenAt: bill.settledAt.toISOString(),
  };
  round.status = "settled";
  await round.save();

  res.json({ round });
};
