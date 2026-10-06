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

const authRes = (user: any): AuthResponse => ({
  token: signUserToken({ _id: user._id, email: user.email, name: user.name }),
  user: { id: user._id.toString(), email: user.email, name: user.name, createdAt: user.createdAt },
});

export const registerUserService = async (name: string, email: string, password?: string): Promise<AuthResponse> => {
  const normalizedEmail = email.toLowerCase().trim();
  if (await User.findOne({ email: normalizedEmail }).lean()) throw new ConflictError("A user with this email already exists");
  if (password && password.length < 6) throw new BadRequestError("Password must be at least 6 characters long");
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  return authRes(await User.create({ name: name.trim(), email: normalizedEmail, passwordHash }));
};

export const loginUserService = async (email: string, password: string): Promise<AuthResponse> => {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new UnauthorizedError("Invalid email or password");
  }
  return authRes(user);
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

export const claimParticipantSessionService = async (userId: Types.ObjectId, roundId: Types.ObjectId, participantToken: string) => {
  const participant = await resolveParticipantService(roundId, participantToken);
  if (!participant) throw new NotFoundError("Participant session not found or invalid token");
  if (participant.userId && !participant.userId.equals(userId)) throw new ConflictError("This participant is already claimed by another user");
  const updated = await claimParticipantService(roundId, participant._id, userId);
  await Round.updateOne({ _id: roundId, "organizer.participantId": participant._id, "organizer.userId": null }, { $set: { "organizer.userId": userId } });
  return updated;
};
