import { randomBytes } from "node:crypto";
import { Types, type HydratedDocument } from "mongoose";
import {
  Round,
  type RoundDocument,
  type RoundItem,
  type RoundOrder,
  type RoundSettlement,
} from "./rounds.model";
import { hashToken, generateToken } from "../participants/participants.service";
import { BadRequestError, NotFoundError } from "../../shared/errors";

const resolveRound = async (
  roundOrId: HydratedDocument<RoundDocument> | Types.ObjectId,
): Promise<HydratedDocument<RoundDocument>> => {
  if (typeof (roundOrId as any).save === "function") return roundOrId as HydratedDocument<RoundDocument>;
  const round = await Round.findById(roundOrId);
  if (!round) throw new NotFoundError("Round");
  return round;
};

export const calculateRoundSettlement = (round: RoundDocument): RoundSettlement => {
  const people = round.orders.map((order) => {
    const quantitiesObj =
      order.quantities instanceof Map
        ? Object.fromEntries(order.quantities.entries())
        : (order.quantities || {});

    const foodCents = round.items.reduce((sum, item) => {
      const qty = Number(quantitiesObj[item.id] || 0);
      return sum + qty * Number(item.priceCents || 0);
    }, 0);

    return {
      name: order.name,
      foodCents,
      feeCents: 0,
      totalCents: foodCents,
    };
  });

  const totalFoodCents = people.reduce((sum, p) => sum + p.foodCents, 0);
  const totalCents = totalFoodCents + Number(round.feeCents || 0);

  if (totalFoodCents > 0 && round.feeCents > 0) {
    let remainingFee = round.feeCents;
    people.forEach((p) => {
      p.feeCents = Math.floor((round.feeCents * p.foodCents) / totalFoodCents);
      p.totalCents = p.foodCents + p.feeCents;
      remainingFee -= p.feeCents;
    });

    for (let i = 0; remainingFee > 0; i = (i + 1) % people.length) {
      if (people[i].foodCents > 0) {
        people[i].feeCents++;
        people[i].totalCents++;
        remainingFee--;
      }
    }
  }

  return { settledAt: new Date(), totalCents, people };
};

export const createRoundService = async (input: {
  title: string;
  venue?: string;
  organizerName: string;
  userId: Types.ObjectId;
  closesAt?: Date | null;
  items?: RoundItem[];
  feeCents?: number;
}) => {
  if (!input.title?.trim()) throw new BadRequestError("Round title is required");

  const organizerToken = generateToken();
  const organizerParticipantId = new Types.ObjectId();
  const organizerOrder: RoundOrder = {
    participantId: organizerParticipantId,
    name: input.organizerName.trim(),
    userId: input.userId,
    tokenHash: hashToken(organizerToken),
    joinedAt: new Date(),
    quantities: {},
    updatedAt: new Date(),
  };

  const round = await Round.create({
    slug: randomBytes(4).toString("hex"),
    title: input.title.trim(),
    venue: input.venue?.trim() || "Lunch Venue",
    organizer: {
      participantId: organizerParticipantId,
      name: input.organizerName.trim(),
      userId: input.userId,
    },
    items: input.items || [],
    orders: [organizerOrder],
    feeCents: input.feeCents || 0,
    status: "open",
    closesAt: input.closesAt ?? null,
  });

  return { round, organizerToken, organizerParticipant: organizerOrder };
};

export const getRoundsService = async (filter: { userId: Types.ObjectId; limit?: number }) =>
  Round.find({
    $or: [{ "organizer.userId": filter.userId }, { "orders.userId": filter.userId }],
  })
    .sort({ createdAt: -1 })
    .limit(Math.min(filter.limit || 20, 50))
    .lean();

export const getRoundByIdOrSlugService = async (idOrSlug: string) => {
  const query = Types.ObjectId.isValid(idOrSlug)
    ? { $or: [{ _id: new Types.ObjectId(idOrSlug) }, { slug: idOrSlug }] }
    : { slug: idOrSlug };
  const round = await Round.findOne(query).lean();
  if (!round) throw new NotFoundError("Round");

  const settlement = round.settlement || calculateRoundSettlement(round as any);
  return {
    ...round,
    settlementView: settlement,
  };
};

export const updateRoundService = async (
  roundOrId: HydratedDocument<RoundDocument> | Types.ObjectId,
  data: {
    title?: string;
    venue?: string;
    feeCents?: number;
    closesAt?: Date | null;
  },
) => {
  const round = await resolveRound(roundOrId);
  if (round.status === "settled") throw new BadRequestError("Cannot modify a settled round");
  if (data.title !== undefined) round.title = data.title.trim();
  if (data.venue !== undefined) round.venue = data.venue.trim();
  if (data.feeCents !== undefined) round.feeCents = data.feeCents;
  if (data.closesAt !== undefined) round.closesAt = data.closesAt;
  await round.save();
  return round;
};

export const updateRoundItemsService = async (
  roundOrId: HydratedDocument<RoundDocument> | Types.ObjectId,
  items: RoundItem[],
) => {
  const round = await resolveRound(roundOrId);
  if (round.status === "settled") throw new BadRequestError("Cannot modify items in a settled round");
  round.items = items;
  await round.save();
  return round.items;
};

export const saveParticipantOrderService = async (
  roundOrId: HydratedDocument<RoundDocument> | Types.ObjectId,
  participantId: Types.ObjectId,
  quantities: Record<string, number>,
) => {
  const round = await resolveRound(roundOrId);
  if (round.status !== "open") throw new BadRequestError(`Cannot modify order: round is ${round.status}`);

  const orderIndex = round.orders.findIndex((o) => o.participantId.equals(participantId));
  if (orderIndex === -1) throw new NotFoundError("Participant order");

  round.orders[orderIndex].quantities = quantities;
  round.orders[orderIndex].updatedAt = new Date();
  round.markModified("orders");
  await round.save();
  return round.orders[orderIndex];
};

export const lockRoundService = async (roundOrId: HydratedDocument<RoundDocument> | Types.ObjectId) => {
  const round = await resolveRound(roundOrId);
  round.status = "locked";
  await round.save();
  return round;
};

export const settleRoundService = async (roundOrId: HydratedDocument<RoundDocument> | Types.ObjectId) => {
  const round = await resolveRound(roundOrId);
  if (!round.orders.length) throw new BadRequestError("Cannot settle an empty round");
  round.settlement = calculateRoundSettlement(round as any);
  round.status = "settled";
  await round.save();
  return round;
};

export const deleteRoundService = async (roundId: Types.ObjectId) => {
  const result = await Round.deleteOne({ _id: roundId });
  return { round: result.deletedCount ?? 0 };
};
