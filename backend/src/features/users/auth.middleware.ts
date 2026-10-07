import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import config from "../../config";
import { UnauthorizedError, ForbiddenError, NotFoundError } from "../../shared/errors";
import { User } from "./users.model";
import { Round, type RoundDocument, type EmbeddedParticipant } from "../rounds/rounds.model";
import { hashToken } from "../participants/participants.service";

export interface AuthUserPayload { id: string; email: string; name: string }
export interface AuthenticatedParticipant extends EmbeddedParticipant { isOrganizer: boolean }

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
      round?: RoundDocument;
      participant?: AuthenticatedParticipant;
      isOrganizer?: boolean;
    }
  }
}

export const signUserToken = (user: { _id: Types.ObjectId; email: string; name: string }) =>
  jwt.sign({ id: user._id.toString(), email: user.email, name: user.name }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });

export const verifyUserToken = (token: string): AuthUserPayload =>
  jwt.verify(token, config.jwtSecret) as AuthUserPayload;

export const requireAuth = async (req: Request, _res: Response, next: NextFunction) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) throw new UnauthorizedError("Authentication token required");
  try {
    const payload = verifyUserToken(auth.split(" ")[1]);
    const user = await User.findById(payload.id).lean();
    if (!user) throw new UnauthorizedError("User no longer exists");
    req.user = { id: user._id.toString(), email: user.email, name: user.name };
    next();
  } catch (err: any) {
    if (err instanceof UnauthorizedError) throw err;
    throw new UnauthorizedError("Invalid or expired token");
  }
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const payload = verifyUserToken(auth.split(" ")[1]);
      const user = await User.findById(payload.id).lean();
      if (user) req.user = { id: user._id.toString(), email: user.email, name: user.name };
    }
  } catch {}
  next();
};

export const getRoundFromRequest = async (req: Request): Promise<RoundDocument> => {
  if (req.round) return req.round;
  const raw = req.params.idOrSlug || req.params.roundId;
  if (!raw) throw new NotFoundError("Round identifier");
  const idOrSlug = Array.isArray(raw) ? raw[0] : raw;
  const query = Types.ObjectId.isValid(idOrSlug) ? { $or: [{ _id: new Types.ObjectId(idOrSlug) }, { slug: idOrSlug }] } : { slug: idOrSlug };
  const round = await Round.findOne(query);
  if (!round) throw new NotFoundError("Round");
  req.round = round;
  return round;
};

export const getParticipantFromRequest = async (req: Request) => {
  if (req.participant !== undefined) return { participant: req.participant, isOrganizer: Boolean(req.isOrganizer) };
  const round = await getRoundFromRequest(req);
  const rawToken = (req.headers["x-participant-token"] as string) || (req.query.participantToken as string) || "";

  let participant: EmbeddedParticipant | null = null;
  if (rawToken) {
    participant = round.participants.find((p) => p.tokenHash === hashToken(rawToken)) ?? null;
  }
  if (!participant && req.user) {
    participant = round.participants.find((p) => p.userId && p.userId.toString() === req.user!.id) ?? null;
  }

  const isOrganizer = participant
    ? round.organizer.participantId.equals(participant._id)
    : Boolean(req.user && round.organizer.userId?.toString() === req.user.id);

  const authParticipant: AuthenticatedParticipant | null = participant
    ? Object.assign(participant, { isOrganizer })
    : null;
  req.participant = authParticipant ?? undefined;
  req.isOrganizer = isOrganizer;
  return { participant: authParticipant, isOrganizer };
};

export const resolveRoundMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  await getRoundFromRequest(req);
  next();
};

export const resolveParticipantMiddleware = async (req: Request, _res: Response, next: NextFunction) => {
  await getParticipantFromRequest(req);
  next();
};

export const requireParticipant = async (req: Request, _res: Response, next: NextFunction) => {
  const { participant } = await getParticipantFromRequest(req);
  if (!participant) throw new UnauthorizedError("Participant session required to perform this action");
  next();
};

export const requireOrganizer = async (req: Request, _res: Response, next: NextFunction) => {
  const { isOrganizer } = await getParticipantFromRequest(req);
  if (!isOrganizer) throw new ForbiddenError("Only the round organizer can perform this action");
  next();
};
