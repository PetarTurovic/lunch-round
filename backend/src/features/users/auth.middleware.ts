import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Types } from "mongoose";
import config from "../../config";
import {
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
} from "../../shared/errors";
import { User } from "./users.model";
import { Round } from "../rounds/rounds.model";
import type {
  RoundDocument,
  EmbeddedParticipant,
} from "../rounds/rounds.model";
import { hashToken } from "../participants/participants.service";

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
}

export interface AuthenticatedParticipant extends EmbeddedParticipant {
  isOrganizer: boolean;
}

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

export const signUserToken = (user: {
  _id: Types.ObjectId;
  email: string;
  name: string;
}): string => {
  return jwt.sign(
    { id: user._id.toString(), email: user.email, name: user.name },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"] },
  );
};

export const verifyUserToken = (token: string): AuthUserPayload => {
  return jwt.verify(token, config.jwtSecret) as AuthUserPayload;
};

export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedError("Authentication token required");
    }

    const token = authHeader.split(" ")[1];
    let payload: AuthUserPayload;
    try {
      payload = verifyUserToken(token);
    } catch {
      throw new UnauthorizedError("Invalid or expired token");
    }

    const user = await User.findById(payload.id).lean();
    if (!user) {
      throw new UnauthorizedError("User no longer exists");
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
    };
    next();
  } catch (error) {
    next(error);
  }
};

export const optionalAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.split(" ")[1];
      try {
        const payload = verifyUserToken(token);
        const user = await User.findById(payload.id).lean();
        if (user) {
          req.user = {
            id: user._id.toString(),
            email: user.email,
            name: user.name,
          };
        }
      } catch {
        // Ignore invalid token in optional auth
      }
    }
    next();
  } catch (error) {
    next(error);
  }
};

export const resolveRoundMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const rawIdOrSlug = req.params.idOrSlug || req.params.roundId;
    if (!rawIdOrSlug) {
      throw new NotFoundError("Round identifier");
    }

    const idOrSlug = String(
      Array.isArray(rawIdOrSlug) ? rawIdOrSlug[0] : rawIdOrSlug,
    );

    const query = Types.ObjectId.isValid(idOrSlug)
      ? { $or: [{ _id: new Types.ObjectId(idOrSlug) }, { slug: idOrSlug }] }
      : { slug: idOrSlug };

    const round = await Round.findOne(query);
    if (!round) {
      throw new NotFoundError("Round");
    }

    req.round = round;
    next();
  } catch (error) {
    next(error);
  }
};

export const resolveParticipantMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.round) {
      await new Promise<void>((resolve, reject) => {
        resolveRoundMiddleware(req, _res, (err) =>
          err ? reject(err) : resolve(),
        );
      });
    }

    const round = req.round!;
    const rawToken =
      (req.headers["x-participant-token"] as string) ||
      (req.query.participantToken as string) ||
      "";

    let participant: EmbeddedParticipant | null = null;

    if (rawToken) {
      const digest = hashToken(rawToken);
      participant =
        round.participants.find((p) => p.tokenHash === digest) ?? null;
    }

    // Also check if logged in user is linked to an account participant in this round
    if (!participant && req.user) {
      participant =
        round.participants.find(
          (p) => p.userId && p.userId.toString() === req.user!.id,
        ) ?? null;
    }

    const isOrganizer = participant
      ? round.organizer.participantId.equals(participant._id)
      : req.user && round.organizer.userId
        ? round.organizer.userId.toString() === req.user.id
        : false;

    if (participant) {
      req.participant = Object.assign(participant, { isOrganizer });
    }
    req.isOrganizer = isOrganizer;

    next();
  } catch (error) {
    next(error);
  }
};

export const requireParticipant = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await new Promise<void>((resolve, reject) => {
      resolveParticipantMiddleware(req, res, (err) =>
        err ? reject(err) : resolve(),
      );
    });

    if (!req.participant) {
      throw new UnauthorizedError(
        "Participant session required to perform this action",
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

export const requireOrganizer = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    await new Promise<void>((resolve, reject) => {
      resolveParticipantMiddleware(req, res, (err) =>
        err ? reject(err) : resolve(),
      );
    });

    if (!req.isOrganizer) {
      throw new ForbiddenError(
        "Only the round organizer can perform this action",
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};
