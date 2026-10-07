import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { Round, type RoundOrder } from "../rounds/rounds.model";

export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");
export const generateToken = (): string => randomBytes(24).toString("hex");

export const joinRoundService = async (
  roundId: Types.ObjectId,
  name: string,
  userId?: Types.ObjectId | null,
): Promise<{ participant: RoundOrder; token: string }> => {
  const token = generateToken();
  const participant: RoundOrder = {
    participantId: new Types.ObjectId(),
    name: name.trim(),
    userId: userId ?? null,
    tokenHash: hashToken(token),
    joinedAt: new Date(),
    quantities: {},
    updatedAt: new Date(),
  };
  await Round.updateOne({ _id: roundId }, { $push: { orders: participant } });
  return { participant, token };
};

export const resolveParticipantService = async (roundId: Types.ObjectId, token: string): Promise<RoundOrder | null> => {
  if (!token) return null;
  const round = await Round.findOne({ _id: roundId, "orders.tokenHash": hashToken(token) }, { "orders.$": 1 }).lean();
  return round?.orders?.[0] ?? null;
};

export const claimParticipantService = async (
  roundId: Types.ObjectId,
  participantId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<RoundOrder | null> => {
  const round = await Round.findOneAndUpdate(
    { _id: roundId, "orders.participantId": participantId, "orders.userId": null },
    { $set: { "orders.$.userId": userId } },
    { returnDocument: "after" },
  ).lean();
  return round?.orders?.find((o: RoundOrder) => o.participantId.equals(participantId)) ?? null;
};
