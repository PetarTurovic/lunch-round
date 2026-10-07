import type { Types } from "mongoose";

export interface SettlementSelection {
  participantId: Types.ObjectId;
  unitPriceCents: number;
  quantity: number;
}

export interface SettlementOrderInput {
  orderId: Types.ObjectId;
  storeName: string;
  subtotalCents: number;
  adjustments: Array<{ type: string; amountCents: number; allocation: string }>;
  participantIds: Types.ObjectId[];
  selections: SettlementSelection[];
}

export interface ParticipantLine {
  participantId: Types.ObjectId;
  itemsCents: number;
  adjustmentsCents: number;
  totalCents: number;
}

export interface SettledOrder {
  orderId: Types.ObjectId;
  storeName: string;
  itemsCents: number;
  adjustmentsCents: number;
  totalCents: number;
  perParticipant: ParticipantLine[];
}

export interface SettledRound {
  currency: string;
  totalCents: number;
  orders: SettledOrder[];
  perParticipant: Map<string, { itemsCents: number; adjustmentsCents: number; totalCents: number }>;
}

export const adjustmentSign = (adj: { type: string }): number =>
  adj.type === "discount" ? -1 : 1;

/**
 * Allocates an integer amount of cents across weights using the Largest Remainder Method.
 * Guarantees the allocated shares sum exactly to totalAmount with no lost cents.
 */
export const allocate = (totalAmount: number, weights: number[]): number[] => {
  const sumWeights = weights.reduce((sum, w) => sum + w, 0);
  if (totalAmount <= 0 || sumWeights <= 0) return weights.map(() => 0);

  const exactShares = weights.map((w) => (totalAmount * w) / sumWeights);
  const roundedShares = exactShares.map(Math.floor);
  let remainder = totalAmount - roundedShares.reduce((sum, s) => sum + s, 0);

  exactShares
    .map((exact, index) => ({ index, fraction: exact - Math.floor(exact) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)
    .forEach(({ index }) => {
      if (remainder-- > 0) roundedShares[index]++;
    });

  return roundedShares;
};

export const settleOrder = (input: SettlementOrderInput): SettledOrder => {
  const participantIds = input.participantIds;
  const items = participantIds.map((id) =>
    input.selections
      .filter((s) => s.participantId.toString() === id.toString())
      .reduce((sum, s) => sum + s.unitPriceCents * s.quantity, 0),
  );
  const itemsCents = items.reduce((sum, amount) => sum + amount, 0);

  const adjustments = participantIds.map(() => 0);
  for (const adjustment of input.adjustments) {
    const weights = adjustment.allocation === "equal" ? participantIds.map(() => 1) : items;
    const sign = adjustmentSign(adjustment);
    allocate(adjustment.amountCents, weights).forEach((share, index) => {
      adjustments[index] += sign * share;
    });
  }

  const perParticipant = participantIds.map((participantId, index) => ({
    participantId,
    itemsCents: items[index],
    adjustmentsCents: adjustments[index],
    totalCents: items[index] + adjustments[index],
  }));

  const adjustmentsCents = adjustments.reduce((sum, amount) => sum + amount, 0);
  return {
    orderId: input.orderId,
    storeName: input.storeName,
    itemsCents,
    adjustmentsCents,
    totalCents: itemsCents + adjustmentsCents,
    perParticipant,
  };
};

export const settleRound = (
  orders: SettlementOrderInput[],
  participantIds: Types.ObjectId[],
  currency: string,
): SettledRound => {
  const settledOrders = orders.map(settleOrder);
  const totalCents = settledOrders.reduce((sum, order) => sum + order.totalCents, 0);
  const perParticipant = new Map(participantIds.map((id) => [id.toString(), { itemsCents: 0, adjustmentsCents: 0, totalCents: 0 }]));

  for (const order of settledOrders) {
    for (const line of order.perParticipant) {
      const summary = perParticipant.get(line.participantId.toString())!;
      summary.itemsCents += line.itemsCents;
      summary.adjustmentsCents += line.adjustmentsCents;
      summary.totalCents += line.totalCents;
    }
  }

  return { currency, totalCents, orders: settledOrders, perParticipant };
};
