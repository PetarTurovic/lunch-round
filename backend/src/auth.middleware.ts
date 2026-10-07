import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Types, type HydratedDocument } from "mongoose";
import config from "./config";
import { UnauthorizedError, ForbiddenError, NotFoundError } from "./errors";
import { User } from "./features/users/users.model";
import { Round, hashToken, type RoundDocument, type RoundOrder } from "./features/rounds/rounds.model";

export interface AuthUserPayload { id: string; email: string; name: string }

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
      round?: HydratedDocument<RoundDocument>;
      participant?: RoundOrder;
      isOrganizer?: boolean;
    }
  }
}

export const signUserToken = (user: { _id: Types.ObjectId; email: string; name: string }) =>
  jwt.sign({ id: user._id.toString(), email: user.email, name: user.name }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) throw new UnauthorizedError("Authentication token required");
  try {
    const payload = jwt.verify(auth.split(" ")[1], config.jwtSecret) as AuthUserPayload;
    const user = await User.findById(payload.id).lean();
    if (!user) throw new UnauthorizedError("User no longer exists");
    req.user = { id: user._id.toString(), email: user.email, name: user.name };
    next();
  } catch (err: any) {
    next(err instanceof UnauthorizedError ? err : new UnauthorizedError("Invalid or expired token"));
  }
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    try {
      const payload = jwt.verify(auth.split(" ")[1], config.jwtSecret) as AuthUserPayload;
      const user = await User.findById(payload.id).lean();
      if (user) req.user = { id: user._id.toString(), email: user.email, name: user.name };
    } catch {}
  }
  next();
};

export const resolveRound = (options?: { requireOrganizer?: boolean; requireParticipant?: boolean }) => {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (!req.user && req.headers.authorization?.startsWith("Bearer ")) {
        try {
          const payload = jwt.verify(req.headers.authorization.split(" ")[1], config.jwtSecret) as AuthUserPayload;
          const user = await User.findById(payload.id).lean();
          if (user) req.user = { id: user._id.toString(), email: user.email, name: user.name };
        } catch {}
      }

      const id = String(req.params.idOrSlug || req.params.roundId || "");
      const round = await Round.findOne(Types.ObjectId.isValid(id) ? { $or: [{ _id: id }, { slug: id }] } : { slug: id });
      if (!round) throw new NotFoundError("Round");
      req.round = round;

      const token = String(req.headers["x-participant-token"] || req.query.participantToken || "");
      const participant = (token ? round.orders.find((p: RoundOrder) => p.tokenHash === hashToken(token)) : null)
        || (req.user ? round.orders.find((p: RoundOrder) => p.userId?.toString() === req.user!.id) : null);

      const isOrganizer = participant
        ? round.organizer.participantId.equals(participant.participantId)
        : Boolean(req.user && round.organizer.userId?.toString() === req.user.id);

      req.participant = participant || undefined;
      req.isOrganizer = isOrganizer;

      if (options?.requireOrganizer && !isOrganizer) {
        throw new ForbiddenError("Only the round organizer can perform this action");
      }
      if (options?.requireParticipant && !participant) {
        throw new UnauthorizedError("Participant session required");
      }

      next();
    } catch (err) {
      next(err);
    }
  };
};
