import bcrypt from "bcryptjs";
import { Types } from "mongoose";
import { User } from "./users.model";
import { BadRequestError, ConflictError, UnauthorizedError, NotFoundError } from "../../shared/errors";
import { signUserToken } from "./auth.middleware";
import { claimParticipantService, resolveParticipantService } from "../participants/participants.service";
import { Round } from "../rounds/rounds.model";

export interface AuthResponse {
  token: string;
  user: { id: string; email: string; name: string; createdAt: Date };
}

const formatAuthResponse = (u: any): AuthResponse => ({
  token: signUserToken({ _id: u._id, email: u.email, name: u.name }),
  user: { id: u._id.toString(), email: u.email, name: u.name, createdAt: u.createdAt },
});

export const registerUserService = async (name: string, email: string, password?: string): Promise<AuthResponse> => {
  const normalizedEmail = email.toLowerCase().trim();
  if (await User.findOne({ email: normalizedEmail }).lean()) throw new ConflictError("A user with this email already exists");
  if (password && password.length < 6) throw new BadRequestError("Password must be at least 6 characters long");
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const user = await User.create({ name: name.trim(), email: normalizedEmail, passwordHash });
  return formatAuthResponse(user);
};

export const loginUserService = async (email: string, password: string): Promise<AuthResponse> => {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  return formatAuthResponse(user);
};

export const getUserProfileService = async (userId: Types.ObjectId) => {
  const user = await User.findById(userId).select("-passwordHash").lean();
  if (!user) throw new NotFoundError("User");
  const [organizedRounds, joinedRounds] = await Promise.all([
    Round.countDocuments({ "organizer.userId": userId }),
    Round.countDocuments({ "participants.userId": userId }),
  ]);
  return {
    id: user._id.toString(), email: user.email, name: user.name, createdAt: user.createdAt,
    stats: { organizedRounds, joinedRounds },
  };
};

export const claimParticipantSessionService = async (userId: Types.ObjectId, roundId: Types.ObjectId, token: string) => {
  const p = await resolveParticipantService(roundId, token);
  if (!p) throw new NotFoundError("Participant session not found or invalid token");
  if (p.userId && !p.userId.equals(userId)) throw new ConflictError("This participant is already claimed by another user");
  const updated = await claimParticipantService(roundId, p.participantId, userId);
  await Round.updateOne({ _id: roundId, "organizer.participantId": p.participantId, "organizer.userId": null }, { $set: { "organizer.userId": userId } });
  return updated;
};
