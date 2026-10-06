import type { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import {
  createRoundService,
  getRoundsService,
  getRoundByIdOrSlugService,
  updateRoundService,
  deleteRoundCascadeService,
  addSelectionService,
  updateSelectionService,
  removeSelectionService,
  overrideSelectionPriceInRoundService,
  addAdjustmentToOrderService,
  removeAdjustmentFromOrderService,
  recordPaymentService,
  lockRoundService,
  settleRoundFreezeService,
} from "./rounds.service";
import { joinRoundService } from "../participants/participants.service";
import { getRoundMoneyTimelineService } from "../order-events/order-events.service";
import { BadRequestError } from "../../shared/errors";

const paramStr = (val: string | string[] | undefined): string =>
  String(Array.isArray(val) ? val[0] : val || "");

export const createRoundController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(120),
      shortlist: z.array(z.string()).min(1),
      currency: z.string().length(3).optional(),
      notes: z.string().max(500).optional(),
      closesAt: z.coerce.date().optional(),
      organizerName: z.string().min(1).max(100).optional(),
    });

    const body = schema.parse(req.body);
    const userId = new Types.ObjectId(req.user!.id);
    const organizerName = body.organizerName?.trim() || req.user!.name;

    const result = await createRoundService({
      title: body.title,
      shortlist: body.shortlist,
      currency: body.currency,
      notes: body.notes,
      closesAt: body.closesAt,
      organizerName,
      userId,
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const getRoundsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).optional(),
      })
      .parse(req.query);

    const userId = new Types.ObjectId(req.user!.id);
    const rounds = await getRoundsService({
      userId,
      limit: query.limit,
    });

    res.json({ rounds });
  } catch (error) {
    next(error);
  }
};

export const getRoundController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const idOrSlug = z.string().parse(paramStr(req.params.idOrSlug));
    const roundData = await getRoundByIdOrSlugService(idOrSlug);
    res.json({ round: roundData });
  } catch (error) {
    next(error);
  }
};

export const updateRoundController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(120).optional(),
      notes: z.string().max(500).optional(),
      shortlist: z.array(z.string()).min(1).optional(),
      closesAt: z.coerce.date().nullable().optional(),
    });

    const body = schema.parse(req.body);
    const updated = await updateRoundService(req.round!._id, body);
    res.json({ round: updated });
  } catch (error) {
    next(error);
  }
};

export const deleteRoundController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await deleteRoundCascadeService(req.round!._id);
    res.json({ success: true, deleted: result });
  } catch (error) {
    next(error);
  }
};

export const joinRoundController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const schema = z.object({
      name: z.string().min(1).max(100),
    });

    const body = schema.parse(req.body);
    const userId = req.user ? new Types.ObjectId(req.user.id) : null;

    const result = await joinRoundService(req.round!._id, body.name, userId);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
};

export const getMyParticipantController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    res.json({
      participant: req.participant ?? null,
      isOrganizer: !!req.isOrganizer,
    });
  } catch (error) {
    next(error);
  }
};

export const addSelectionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const schema = z.object({
      storeId: z.string(),
      itemId: z.string(),
      quantity: z.number().int().min(1).max(99).default(1),
      note: z.string().max(300).optional(),
    });

    const body = schema.parse(req.body);
    const selection = await addSelectionService(
      req.round!._id,
      req.participant!._id,
      body,
    );

    res.status(201).json({ selection });
  } catch (error) {
    next(error);
  }
};

export const updateSelectionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectionId = new Types.ObjectId(paramStr(req.params.selectionId));
    const schema = z.object({
      quantity: z.number().int().min(0).max(99).optional(),
      note: z.string().max(300).optional(),
    });

    const body = schema.parse(req.body);
    const selection = await updateSelectionService(
      req.round!._id,
      selectionId,
      req.participant!._id,
      !!req.isOrganizer,
      body,
    );

    res.json({ selection });
  } catch (error) {
    next(error);
  }
};

export const removeSelectionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectionId = new Types.ObjectId(paramStr(req.params.selectionId));
    const result = await removeSelectionService(
      req.round!._id,
      selectionId,
      req.participant!._id,
      !!req.isOrganizer,
    );
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const overridePriceController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const selectionId = new Types.ObjectId(paramStr(req.params.selectionId));
    const schema = z.object({
      unitPriceCents: z.number().int().min(0),
    });

    const body = schema.parse(req.body);
    const newPrice = await overrideSelectionPriceInRoundService(
      req.round!._id,
      selectionId,
      req.participant!._id,
      body.unitPriceCents,
    );

    res.json({ success: true, unitPriceCents: newPrice });
  } catch (error) {
    next(error);
  }
};

export const addAdjustmentController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = new Types.ObjectId(paramStr(req.params.orderId));
    const schema = z.object({
      label: z.string().min(1).max(80),
      type: z.enum(["tip", "fee", "discount"]),
      amountCents: z.number().int().min(0),
      allocation: z.enum(["proportional", "equal"]).default("proportional"),
    });

    const body = schema.parse(req.body);
    const order = await addAdjustmentToOrderService(
      req.round!._id,
      orderId,
      req.participant!._id,
      body,
    );

    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
};

export const removeAdjustmentController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = new Types.ObjectId(paramStr(req.params.orderId));
    const adjustmentId = new Types.ObjectId(paramStr(req.params.adjustmentId));
    const order = await removeAdjustmentFromOrderService(
      req.round!._id,
      orderId,
      req.participant!._id,
      adjustmentId,
    );

    res.json({ order });
  } catch (error) {
    next(error);
  }
};

export const recordPaymentController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const orderId = new Types.ObjectId(paramStr(req.params.orderId));
    const schema = z.object({
      participantId: z.string(),
      amountCents: z.number().int().min(1),
      method: z.string().max(40).optional(),
      note: z.string().max(300).optional(),
    });

    const body = schema.parse(req.body);
    const order = await recordPaymentService(
      req.round!._id,
      orderId,
      req.participant!._id,
      {
        participantId: new Types.ObjectId(body.participantId),
        amountCents: body.amountCents,
        method: body.method,
        note: body.note,
      },
    );

    res.status(201).json({ order });
  } catch (error) {
    next(error);
  }
};

export const lockRoundController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const round = await lockRoundService(req.round!._id);
    res.json({ round });
  } catch (error) {
    next(error);
  }
};

export const settleRoundController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const round = await settleRoundFreezeService(
      req.round!._id,
      req.participant!._id,
    );
    res.json({ round });
  } catch (error) {
    next(error);
  }
};

export const getTimelineController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const timeline = await getRoundMoneyTimelineService(req.round!._id);
    res.json({ timeline });
  } catch (error) {
    next(error);
  }
};
