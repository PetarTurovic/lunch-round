import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { Round } from "../rounds/rounds.model";
import type { EmbeddedParticipant } from "../rounds/rounds.model";

const TOKEN_BYTES = 24;

export const hashToken = (token: string): string =>
  createHash("sha256").update(token).digest("hex");

export const generateToken = (): string =>
  randomBytes(TOKEN_BYTES).toString("hex");

export const joinRoundService = async (
  roundId: Types.ObjectId,
  name: string,
  userId?: Types.ObjectId | null,
): Promise<{ participant: EmbeddedParticipant; token: string }> => {
  const token = generateToken();
  const participant: EmbeddedParticipant = {
    _id: new Types.ObjectId(),
    name: name.trim(),
    userId: userId ?? null,
    tokenHash: hashToken(token),
    joinedAt: new Date(),
  };

  await Round.updateOne(
    { _id: roundId },
    { $push: { participants: participant } },
  );

  return { participant, token };
};

export const resolveParticipantService = async (
  roundId: Types.ObjectId,
  token: string,
): Promise<EmbeddedParticipant | null> => {
  if (!token) return null;
  const digest = hashToken(token);

  const round = await Round.findOne(
    { _id: roundId, "participants.tokenHash": digest },
    { "participants.$": 1 },
  ).lean();

  return round?.participants?.[0] ?? null;
};

export const claimParticipantService = async (
  roundId: Types.ObjectId,
  participantId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<EmbeddedParticipant | null> => {
  const round = await Round.findOneAndUpdate(
    {
      _id: roundId,
      "participants._id": participantId,
      "participants.userId": null,
    },
    {
      $set: {
        "participants.$.userId": userId,
        "participants.$.claimedAt": new Date(),
      },
    },
    { returnDocument: "after" },
  ).lean();

  return (
    round?.participants?.find((p: EmbeddedParticipant) =>
      p._id.equals(participantId),
    ) ?? null
  );
};
