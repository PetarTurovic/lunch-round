import type { Request, Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as roundSvc from "./rounds.service";
import { joinRoundService } from "../participants/participants.service";

const toObjectId = (v: unknown) => new Types.ObjectId(String(Array.isArray(v) ? v[0] : v));

export const createRoundController = async (req: Request, res: Response) => {
  const body = z.object({
    title: z.string().min(1).max(120),
    shortlist: z.array(z.string()).min(1),
    currency: z.string().length(3).optional(),
    notes: z.string().max(500).optional(),
    closesAt: z.coerce.date().optional(),
    organizerName: z.string().min(1).max(100).optional(),
  }).parse(req.body);
  const result = await roundSvc.createRoundService({
    ...body,
    organizerName: body.organizerName?.trim() || req.user!.name,
    userId: new Types.ObjectId(req.user!.id),
  });
  res.status(201).json(result);
};

export const getRoundsController = async (req: Request, res: Response) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(50).optional() }).parse(req.query);
  res.json({ rounds: await roundSvc.getRoundsService({ userId: new Types.ObjectId(req.user!.id), limit }) });
};

export const getRoundController = async (req: Request, res: Response) => {
  const id = String(Array.isArray(req.params.idOrSlug) ? req.params.idOrSlug[0] : req.params.idOrSlug);
  res.json({ round: await roundSvc.getRoundByIdOrSlugService(id) });
};

export const updateRoundController = async (req: Request, res: Response) => {
  const body = z.object({
    title: z.string().min(1).max(120).optional(),
    notes: z.string().max(500).optional(),
    shortlist: z.array(z.string()).min(1).optional(),
    closesAt: z.coerce.date().nullable().optional(),
  }).parse(req.body);
  res.json({ round: await roundSvc.updateRoundService(req.round!, body) });
};

export const deleteRoundController = async (req: Request, res: Response) => {
  res.json({ result: await roundSvc.deleteRoundCascadeService(req.round!._id) });
};

export const joinRoundController = async (req: Request, res: Response) => {
  const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
  const result = await joinRoundService(req.round!._id, name, req.user ? new Types.ObjectId(req.user.id) : null);
  res.status(201).json(result);
};

export const addSelectionController = async (req: Request, res: Response) => {
  const body = z.object({
    storeId: z.string(), itemId: z.string(), quantity: z.number().int().min(1).default(1), note: z.string().max(300).optional(),
  }).parse(req.body);
  const item = await roundSvc.addSelectionService(req.round!, req.participant!._id, body);
  res.status(201).json({ selection: item, item });
};

export const updateSelectionController = async (req: Request, res: Response) => {
  const body = z.object({ quantity: z.number().int().min(0).optional(), note: z.string().max(300).optional() }).parse(req.body);
  const item = await roundSvc.updateSelectionService(req.round!, toObjectId(req.params.selectionId), req.participant!._id, Boolean(req.isOrganizer), body);
  res.json({ selection: item, item });
};

export const removeSelectionController = async (req: Request, res: Response) => {
  res.json(await roundSvc.removeSelectionService(req.round!, toObjectId(req.params.selectionId), req.participant!._id, Boolean(req.isOrganizer)));
};

export const overridePriceController = async (req: Request, res: Response) => {
  const { unitPriceCents } = z.object({ unitPriceCents: z.number().int().min(0) }).parse(req.body);
  const updatedPrice = await roundSvc.overrideSelectionPriceInRoundService(req.round!, toObjectId(req.params.selectionId), req.participant!._id, unitPriceCents);
  res.json({ unitPriceCents: updatedPrice });
};

export const getMyParticipantController = async (req: Request, res: Response) => {
  res.json({ participant: req.participant ?? null, isOrganizer: Boolean(req.isOrganizer) });
};

export const addAdjustmentController = async (req: Request, res: Response) => {
  const body = z.object({
    label: z.string().min(1).max(80),
    type: z.enum(["tip", "fee", "discount"]),
    amountCents: z.number().int().min(0),
    allocation: z.enum(["proportional", "equal"]).default("proportional"),
  }).parse(req.body);
  const order = await roundSvc.addAdjustmentToOrderService(req.round!, toObjectId(req.params.orderId), req.participant!._id, body);
  res.status(201).json({ order });
};

export const removeAdjustmentController = async (req: Request, res: Response) => {
  const order = await roundSvc.removeAdjustmentFromOrderService(req.round!, toObjectId(req.params.orderId), req.participant!._id, toObjectId(req.params.adjustmentId));
  res.json({ order });
};

export const recordPaymentController = async (req: Request, res: Response) => {
  const body = z.object({
    participantId: z.string(),
    amountCents: z.number().int().min(1),
    method: z.string().max(40).optional(),
    note: z.string().max(300).optional(),
  }).parse(req.body);
  const order = await roundSvc.recordPaymentService(req.round!, toObjectId(req.params.orderId), req.participant!._id, {
    ...body, participantId: new Types.ObjectId(body.participantId),
  });
  res.status(201).json({ order });
};

export const lockRoundController = async (req: Request, res: Response) => {
  res.json({ round: await roundSvc.lockRoundService(req.round!) });
};

export const settleRoundController = async (req: Request, res: Response) => {
  res.json({ round: await roundSvc.settleRoundFreezeService(req.round!, req.participant!._id) });
};
