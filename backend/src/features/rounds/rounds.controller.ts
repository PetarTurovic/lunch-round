import type { Request, Response } from "express";
import { z } from "zod";
import { Types } from "mongoose";
import * as roundSvc from "./rounds.service";
import { joinRoundService } from "../participants/participants.service";

export const createRoundController = async (req: Request, res: Response) => {
  const body = z
    .object({
      title: z.string().min(1).max(120),
      venue: z.string().max(120).optional(),
      organizerName: z.string().min(1).max(100).optional(),
      closesAt: z.coerce.date().optional(),
      feeCents: z.number().int().min(0).optional(),
      items: z
        .array(
          z.object({
            id: z.string(),
            name: z.string().min(1),
            description: z.string().optional(),
            priceCents: z.number().int().min(0),
          }),
        )
        .optional(),
    })
    .parse(req.body);

  const result = await roundSvc.createRoundService({
    ...body,
    organizerName: body.organizerName?.trim() || req.user!.name,
    userId: new Types.ObjectId(req.user!.id),
  });
  res.status(201).json(result);
};

export const getRoundsController = async (req: Request, res: Response) => {
  const { limit } = z
    .object({ limit: z.coerce.number().int().min(1).max(50).optional() })
    .parse(req.query);
  res.json({
    rounds: await roundSvc.getRoundsService({ userId: new Types.ObjectId(req.user!.id), limit }),
  });
};

export const getRoundController = async (req: Request, res: Response) => {
  const id = String(Array.isArray(req.params.idOrSlug) ? req.params.idOrSlug[0] : req.params.idOrSlug);
  res.json({ round: await roundSvc.getRoundByIdOrSlugService(id) });
};

export const updateRoundController = async (req: Request, res: Response) => {
  const body = z
    .object({
      title: z.string().min(1).max(120).optional(),
      venue: z.string().max(120).optional(),
      feeCents: z.number().int().min(0).optional(),
      closesAt: z.coerce.date().nullable().optional(),
    })
    .parse(req.body);
  res.json({ round: await roundSvc.updateRoundService(req.round!, body) });
};

export const deleteRoundController = async (req: Request, res: Response) => {
  res.json({ result: await roundSvc.deleteRoundService(req.round!._id) });
};

export const joinRoundController = async (req: Request, res: Response) => {
  const { name } = z.object({ name: z.string().min(1).max(100) }).parse(req.body);
  const result = await joinRoundService(req.round!._id, name, req.user ? new Types.ObjectId(req.user.id) : null);
  res.status(201).json(result);
};

export const updateRoundItemsController = async (req: Request, res: Response) => {
  const { items } = z
    .object({
      items: z.array(
        z.object({
          id: z.string(),
          name: z.string().min(1),
          description: z.string().optional(),
          priceCents: z.number().int().min(0),
        }),
      ),
    })
    .parse(req.body);

  const updatedItems = await roundSvc.updateRoundItemsService(req.round!, items);
  res.json({ items: updatedItems });
};

export const saveOrderController = async (req: Request, res: Response) => {
  const { quantities } = z
    .object({
      quantities: z.record(z.string(), z.number().int().min(0)),
    })
    .parse(req.body);

  const order = await roundSvc.saveParticipantOrderService(
    req.round!,
    req.participant!.participantId,
    quantities,
  );
  res.json({ order });
};

export const getMyParticipantController = async (req: Request, res: Response) => {
  res.json({ participant: req.participant ?? null, isOrganizer: Boolean(req.isOrganizer) });
};

export const lockRoundController = async (req: Request, res: Response) => {
  res.json({ round: await roundSvc.lockRoundService(req.round!) });
};

export const settleRoundController = async (req: Request, res: Response) => {
  res.json({ round: await roundSvc.settleRoundService(req.round!) });
};
