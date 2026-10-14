import type { Request, Response } from "express";
import { Types } from "mongoose";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { BadRequestError, ConflictError } from "../../errors";
import { Store } from "../stores/stores.model";
import {
  Round,
  generateToken,
  hashToken,
  type RoundDocument,
  type RoundItem,
  type RoundOrder,
  type RoundStoreSummary,
} from "./rounds.model";
import { calculateRoundBill } from "./settlement";
import {
  freezeSettlement,
  pushParticipant,
  saveParticipantOrder,
  setRoundFields,
  setRoundStatus,
} from "./rounds.service";

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

const locationSchema = z.object({
  lat: z.number(),
  lon: z.number(),
  city: z.string().optional(),
  cityLabel: z.string().optional(),
  radiusKm: z.number().min(0.1).max(100).optional(),
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

/**
 * A round sums one bill across every store in its shortlist, so a shortlist
 * mixing currencies would add pesos to euros. Reject it at the edge rather than
 * returning a total that means nothing.
 */
const assertSingleCurrency = (shortlist: RoundStoreSummary[], requested?: string): string => {
  const currencies = [...new Set(shortlist.map((s) => (s.currency || "EUR").toUpperCase()))];
  if (currencies.length > 1) {
    throw new BadRequestError(`All restaurants in a round must share one currency (got ${currencies.join(", ")})`);
  }
  const currency = currencies[0] ?? "EUR";
  if (requested && requested.toUpperCase() !== currency) {
    throw new BadRequestError(`Round currency ${requested.toUpperCase()} does not match the restaurants' ${currency}`);
  }
  return currency;
};

/** Older rounds stored only items; derive a shortlist for display. */
const backfillShortlist = (round: RoundDocument) => {
  if (!round.shortlist?.length && round.items?.length) {
    const storesById = new Map<string, any>();
    for (const item of round.items) {
      if (item.storeId && item.storeName) {
        storesById.set(item.storeId, { _id: item.storeId, name: item.storeName });
      }
    }
    round.shortlist = Array.from(storesById.values());
  }
  return round;
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

  const formatted = rounds.map((round) => backfillShortlist(round as RoundDocument));
  res.json({ rounds: formatted });
};

export const createRound = async (req: Request, res: Response) => {
  const body = z.object({
    title: z.string().min(1).max(120),
    venue: z.string().max(120).optional(),
    currency: z.string().max(10).optional(),
    location: locationSchema.nullable().optional(),
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

  const currency = assertSingleCurrency(shortlist, body.currency);
  const venue = body.venue?.trim()
    || (shortlist.length === 1 ? shortlist[0].name : shortlist.length > 1 ? "Multiple restaurants" : "Lunch Venue");

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
  const roundObj = req.round!.toObject() as RoundDocument;
  backfillShortlist(roundObj);
  const bill = roundObj.bill || calculateRoundBill(roundObj);
  res.json({ round: { ...roundObj, bill } });
};

export const updateRound = async (req: Request, res: Response) => {
  const round = req.round!;
  if (round.status === "settled") throw new BadRequestError("Cannot modify a settled round");

  const body = z.object({
    title: z.string().min(1).max(120).optional(),
    venue: z.string().max(120).optional(),
    currency: z.string().max(10).optional(),
    location: locationSchema.nullable().optional(),
    feeCents: z.number().int().min(0).optional(),
    closesAt: z.coerce.date().nullable().optional(),
    status: z.enum(["open", "locked", "ordered"]).optional(),
    storeIds: z.array(z.string()).optional(),
    shortlist: z.array(z.any()).optional(),
    items: z.array(itemSchema).optional(),
  }).parse(req.body);

  const fields: Record<string, unknown> = {};
  if (body.title !== undefined) fields.title = body.title.trim();
  if (body.venue !== undefined) fields.venue = body.venue.trim();
  if (body.location !== undefined) {
    fields.location = body.location ? { ...body.location, radiusKm: body.location.radiusKm || 10 } : null;
  }
  if (body.feeCents !== undefined) fields.feeCents = body.feeCents;
  if (body.closesAt !== undefined) fields.closesAt = body.closesAt;
  if (body.status !== undefined) fields.status = body.status;

  if (body.items !== undefined) fields.items = body.items;

  let nextShortlist: RoundStoreSummary[] | undefined;
  if (body.shortlist !== undefined) {
    nextShortlist = body.shortlist;
  } else if (body.storeIds !== undefined) {
    nextShortlist = await populateShortlist(body.storeIds, (body.items ?? round.items) as RoundItem[]);
    if (body.items === undefined) {
      const stores = await Store.find({ _id: { $in: body.storeIds } }).lean();
      fields.items = extractItemsFromStores(stores);
    }
  } else if (body.items !== undefined) {
    const storeIds = [...new Set(body.items.map((i) => i.storeId).filter(Boolean))] as string[];
    if (storeIds.length) nextShortlist = await populateShortlist(storeIds, body.items);
  }

  if (nextShortlist) {
    fields.currency = assertSingleCurrency(nextShortlist, body.currency);
    fields.shortlist = nextShortlist;
  } else if (body.currency !== undefined && round.shortlist?.length) {
    fields.currency = assertSingleCurrency(round.shortlist, body.currency);
  }

  const updated = await setRoundFields(round._id, fields, { status: { $ne: "settled" } });
  res.json({ round: updated });
};

export const deleteRound = async (req: Request, res: Response) => {
  const result = await Round.deleteOne({ _id: req.round!._id });
  res.json({ result: { round: result.deletedCount ?? 0 } });
};

export const joinRound = async (req: Request, res: Response) => {
  const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
  const round = req.round!;
  if (round.status !== "open") throw new BadRequestError(`Cannot join: round is ${round.status}`);

  const participantName = name.trim();
  const taken = round.orders.some((o) => o.name.trim().toLowerCase() === participantName.toLowerCase());
  if (taken) {
    throw new ConflictError("Someone in this round already uses that name");
  }

  const token = generateToken();
  const participantId = new Types.ObjectId();
  const userId = req.user ? new Types.ObjectId(req.user.id) : null;

  const participant: RoundOrder = {
    participantId,
    name: participantName,
    userId,
    tokenHash: hashToken(token),
    joinedAt: new Date(),
    quantities: {},
    updatedAt: new Date(),
  };

  // $push is atomic, so two people joining at the same moment both land.
  await pushParticipant(round._id, participant, {
    participantId,
    name: participantName,
    userId,
    isOrganizer: false,
  });

  res.status(201).json({ participant, token });
};

export const getMyParticipant = (req: Request, res: Response) => {
  res.json({ participant: req.participant ?? null, isOrganizer: Boolean(req.isOrganizer) });
};

export const updateRoundItems = async (req: Request, res: Response) => {
  const round = req.round!;
  if (round.status === "settled") throw new BadRequestError("Cannot modify items in a settled round");

  const { items } = z.object({ items: z.array(itemSchema) }).parse(req.body);
  const storeIds = [...new Set(items.map((i) => i.storeId).filter(Boolean))] as string[];
  const fields: Record<string, unknown> = { items };
  if (storeIds.length) fields.shortlist = await populateShortlist(storeIds, items);

  const updated = await setRoundFields(round._id, fields, { status: { $ne: "settled" } });
  if (!updated) throw new BadRequestError("Cannot modify items in a settled round");
  res.json({ items: updated.items, shortlist: updated.shortlist });
};

export const saveOrder = async (req: Request, res: Response) => {
  const round = req.round!;
  if (round.status !== "open") throw new BadRequestError(`Cannot modify order: round is ${round.status}`);

  const { quantities, name } = z.object({
    quantities: z.record(z.string(), z.number().int().min(0)),
    name: z.string().min(1).max(100).optional(),
  }).parse(req.body);

  const participantId = req.participant!.participantId;
  const updated = await saveParticipantOrder(
    round._id,
    participantId,
    quantities,
    name && name.trim() ? name.trim() : undefined,
  );
  if (!updated) throw new BadRequestError(`Cannot modify order: round is no longer open`);

  const order = updated.orders.find((o) => o.participantId.equals(participantId));
  res.json({ order });
};

export const lockRound = async (req: Request, res: Response) => {
  const updated = await setRoundStatus(req.round!._id, "locked");
  if (!updated) throw new BadRequestError("Cannot lock a settled round");
  res.json({ round: updated });
};

export const settleRound = async (req: Request, res: Response) => {
  const round = req.round!;
  if (!round.orders.length) throw new BadRequestError("Cannot settle an empty round");

  const body = z.object({
    feeCents: z.number().int().min(0).optional(),
    items: z.array(itemSchema).optional(),
  }).parse(req.body ?? {});

  const fields: Record<string, unknown> = {};
  if (body.feeCents !== undefined) fields.feeCents = body.feeCents;
  if (body.items !== undefined) fields.items = body.items;

  // Bill the round as it will be stored, so the frozen numbers match the document.
  const billSource = {
    items: (body.items ?? round.items) as RoundItem[],
    orders: round.orders as RoundOrder[],
    feeCents: body.feeCents ?? round.feeCents,
  };
  const bill = calculateRoundBill(billSource);

  const settlement = {
    isLive: false,
    totalCents: bill.totalCents,
    orderTotalCents: bill.totalCents,
    perParticipant: bill.people.map((person, idx) => ({
      participantId: String(round.orders[idx]?.participantId ?? ""),
      participantName: person.name,
      totalCents: person.amountCents,
      itemsCents: person.amountCents,
      adjustmentsCents: 0,
    })),
    frozenAt: bill.settledAt.toISOString(),
  };

  const updated = await freezeSettlement(round._id, {
    ...fields,
    bill,
    settlement,
    status: "settled",
  });
  res.json({ round: updated });
};
