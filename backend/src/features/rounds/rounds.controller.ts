import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  createRoundService, getRoundsService, getRoundByIdOrSlugService, updateRoundService,
  deleteRoundCascadeService, addSelectionService, updateSelectionService, removeSelectionService,
  overrideSelectionPriceInRoundService, addAdjustmentToOrderService, removeAdjustmentFromOrderService,
  recordPaymentService, lockRoundService, settleRoundFreezeService,
} from "./rounds.service";
import { joinRoundService } from "../participants/participants.service";
import { getRoundMoneyTimelineService } from "../order-events/order-events.service";

const toId = (val: unknown) => new Types.ObjectId(String(Array.isArray(val) ? val[0] : val));
const wrap = (fn: (req: Request, res: Response) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export const createRoundController = wrap(async (req, res) => {
  const body = z.object({
    title: z.string().min(1).max(120), shortlist: z.array(z.string()).min(1),
    currency: z.string().length(3).optional(), notes: z.string().max(500).optional(),
    closesAt: z.coerce.date().optional(), organizerName: z.string().min(1).max(100).optional(),
  }).parse(req.body);
  res.status(201).json(await createRoundService({
    ...body, organizerName: body.organizerName?.trim() || req.user!.name,
    userId: new Types.ObjectId(req.user!.id),
  }));
});

export const getRoundsController = wrap(async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }).parse(req.query);
  res.json({ rounds: await getRoundsService({ userId: new Types.ObjectId(req.user!.id), limit }) });
});

export const getRoundController = wrap(async (req, res) => {
  const raw = req.params.idOrSlug;
  res.json({ round: await getRoundByIdOrSlugService(String(Array.isArray(raw) ? raw[0] : raw)) });
});

export const updateRoundController = wrap(async (req, res) => {
  const body = z.object({
    title: z.string().min(1).max(120).optional(), notes: z.string().max(500).optional(),
    shortlist: z.array(z.string()).min(1).optional(), closesAt: z.coerce.date().nullable().optional(),
  }).parse(req.body);
  res.json({ round: await updateRoundService(req.round!._id, body) });
});

export const deleteRoundController = wrap(async (req, res) => {
  res.json({ result: await deleteRoundCascadeService(req.round!._id) });
});

export const joinRoundController = wrap(async (req, res) => {
  const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
  res.status(201).json(await joinRoundService(req.round!._id, name, req.user ? new Types.ObjectId(req.user.id) : null));
});

export const addSelectionController = wrap(async (req, res) => {
  const body = z.object({ storeId: z.string(), itemId: z.string(), quantity: z.number().int().min(1).default(1), note: z.string().max(300).optional() }).parse(req.body);
  const item = await addSelectionService(req.round!._id, req.participant!._id, body);
  res.status(201).json({ selection: item, item });
});

export const updateSelectionController = wrap(async (req, res) => {
  const body = z.object({ quantity: z.number().int().min(0).optional(), note: z.string().max(300).optional() }).parse(req.body);
  const item = await updateSelectionService(req.round!._id, toId(req.params.selectionId), req.participant!._id, !!req.isOrganizer, body);
  res.json({ selection: item, item });
});

export const removeSelectionController = wrap(async (req, res) => {
  res.json(await removeSelectionService(req.round!._id, toId(req.params.selectionId), req.participant!._id, !!req.isOrganizer));
});

export const overrideSelectionPriceController = wrap(async (req, res) => {
  const { unitPriceCents } = z.object({ unitPriceCents: z.number().int().min(0) }).parse(req.body);
  const resPrice = await overrideSelectionPriceInRoundService(req.round!._id, toId(req.params.selectionId), req.participant!._id, unitPriceCents);
  res.json({ unitPriceCents: resPrice });
});

export const overridePriceController = overrideSelectionPriceController;

export const getMyParticipantController = wrap(async (req, res) => {
  res.json({ participant: req.participant ?? null, isOrganizer: !!req.isOrganizer });
});

export const addAdjustmentController = wrap(async (req, res) => {
  const body = z.object({
    label: z.string().min(1).max(80), type: z.enum(["tip", "fee", "discount"]),
    amountCents: z.number().int().min(0), allocation: z.enum(["proportional", "equal"]).default("proportional"),
  }).parse(req.body);
  res.status(201).json({ order: await addAdjustmentToOrderService(req.round!._id, toId(req.params.orderId), req.participant!._id, body) });
});

export const removeAdjustmentController = wrap(async (req, res) => {
  res.json({ order: await removeAdjustmentFromOrderService(req.round!._id, toId(req.params.orderId), req.participant!._id, toId(req.params.adjustmentId)) });
});

export const recordPaymentController = wrap(async (req, res) => {
  const body = z.object({
    participantId: z.string(), amountCents: z.number().int().min(1),
    method: z.string().max(40).optional(), note: z.string().max(300).optional(),
  }).parse(req.body);
  res.status(201).json({ order: await recordPaymentService(req.round!._id, toId(req.params.orderId), req.participant!._id, {
    participantId: new Types.ObjectId(body.participantId), amountCents: body.amountCents, method: body.method, note: body.note,
  }) });
});

export const lockRoundController = wrap(async (req, res) => {
  res.json({ round: await lockRoundService(req.round!._id) });
});

export const settleRoundController = wrap(async (req, res) => {
  res.json({ round: await settleRoundFreezeService(req.round!._id, req.participant!._id) });
});

export const getTimelineController = wrap(async (req, res) => {
  res.json({ timeline: await getRoundMoneyTimelineService(req.round!._id) });
});
