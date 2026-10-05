import { createHash, randomBytes } from 'node:crypto';
import { Participant } from './participants.model';
import type { ParticipantDocument } from './participants.model';
import { Types } from 'mongoose';

const TOKEN_BYTES = 24;

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const generateToken = (): string => randomBytes(TOKEN_BYTES).toString('hex');

export const joinRoundService = async (
  roundId: Types.ObjectId,
  name: string,
  userId?: Types.ObjectId | null,
): Promise<{ participant: ParticipantDocument; token: string }> => {
  const token = generateToken();
  const participant = await Participant.create({
    roundId,
    name: name.trim(),
    userId: userId ?? null,
    tokenHash: hashToken(token),
  });
  return { participant, token };
};

export const resolveParticipantService = async (
  roundId: Types.ObjectId,
  token: string,
): Promise<ParticipantDocument | null> => {
  if (!token) return null;
  const digest = hashToken(token);

  const candidate = await Participant.findOne({ roundId, tokenHash: digest }).lean();
  return (candidate as ParticipantDocument) ?? null;
};

export const claimParticipantService = async (
  participantId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<ParticipantDocument | null> => {
  return Participant.findOneAndUpdate(
    { _id: participantId, userId: null },
    { $set: { userId, claimedAt: new Date() } },
    { new: true },
  ).lean() as Promise<ParticipantDocument | null>;
};

export const rotateTokenService = async (
  participantId: Types.ObjectId,
): Promise<string | null> => {
  const token = generateToken();
  const result = await Participant.updateOne(
    { _id: participantId },
    { $set: { tokenHash: hashToken(token) } },
  );
  return result.matchedCount > 0 ? token : null;
};