import { Types } from "mongoose";
import {
  Round,
  type RoundDocument,
  type RoundParticipant,
  type RoundOrder,
} from "./rounds.model";

/**
 * Data access for rounds.
 *
 * Every mutation here is a targeted, atomic update. Writing the whole document
 * back with `round.save()` is a read-modify-write: whoever saves last wins, so
 * a friend joining from the shared link while the organizer edits the shortlist
 * would silently drop one of the two changes. `$push`/`$set` with a positional
 * filter touches only the fields that actually changed.
 */

export const pushParticipant = async (
  roundId: Types.ObjectId,
  order: RoundOrder,
  participant: RoundParticipant,
): Promise<RoundDocument | null> =>
  Round.findOneAndUpdate(
    { _id: roundId },
    { $push: { orders: order, participants: participant } },
    { new: true },
  ).lean();

export const saveParticipantOrder = async (
  roundId: Types.ObjectId,
  participantId: Types.ObjectId,
  quantities: Record<string, number>,
  name?: string,
): Promise<RoundDocument | null> => {
  const set: Record<string, unknown> = {
    "orders.$[order].quantities": quantities,
    "orders.$[order].updatedAt": new Date(),
  };
  const arrayFilters: Record<string, unknown>[] = [{ "order.participantId": participantId }];

  if (name) {
    set["orders.$[order].name"] = name;
    set["participants.$[participant].name"] = name;
    arrayFilters.push({ "participant.participantId": participantId });
  }

  // The status filter makes "only while open" part of the write itself, so a
  // lock landing mid-request cannot be overwritten.
  return Round.findOneAndUpdate(
    { _id: roundId, status: "open" },
    { $set: set },
    { new: true, arrayFilters },
  ).lean();
};

export const setRoundFields = async (
  roundId: Types.ObjectId,
  fields: Record<string, unknown>,
  filter: Record<string, unknown> = {},
): Promise<RoundDocument | null> =>
  Round.findOneAndUpdate({ _id: roundId, ...filter }, { $set: fields }, { new: true }).lean();

export const setRoundStatus = async (
  roundId: Types.ObjectId,
  status: RoundDocument["status"],
): Promise<RoundDocument | null> =>
  Round.findOneAndUpdate(
    { _id: roundId, status: { $ne: "settled" } },
    { $set: { status } },
    { new: true },
  ).lean();

export const freezeSettlement = async (
  roundId: Types.ObjectId,
  fields: Record<string, unknown>,
): Promise<RoundDocument | null> =>
  Round.findOneAndUpdate({ _id: roundId }, { $set: fields }, { new: true }).lean();
