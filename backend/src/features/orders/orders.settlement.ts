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

  const order = weights
    .map((_, i) => ({ i, frac: exactShares[i] - roundedShares[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; k < remainder; k++) {
    roundedShares[order[k].i]++;
  }

  return roundedShares;
};

export const settleOrder = (input: SettlementOrderInput): SettledOrder => {
  const { participantIds, selections, adjustments: orderAdjustments } = input;

  // 1. Sum item cents per participant in a single pass O(S)
  const itemMap = new Map<string, number>();
  for (const sel of selections) {
    const key = sel.participantId.toString();
    itemMap.set(key, (itemMap.get(key) ?? 0) + sel.unitPriceCents * sel.quantity);
  }

  const items = participantIds.map((id) => itemMap.get(id.toString()) ?? 0);
  const itemsCents = items.reduce((sum, amount) => sum + amount, 0);

  // 2. Allocate each adjustment
  const adjustments = participantIds.map(() => 0);
  for (const adj of orderAdjustments) {
    const weights = adj.allocation === "equal" ? participantIds.map(() => 1) : items;
    const sign = adjustmentSign(adj);
    const shares = allocate(adj.amountCents, weights);
    for (let i = 0; i < shares.length; i++) {
      adjustments[i] += sign * shares[i];
    }
  }

  // 3. Build per-participant summary
  let adjustmentsCents = 0;
  const perParticipant = participantIds.map((participantId, index) => {
    const itemAmt = items[index];
    const adjAmt = adjustments[index];
    adjustmentsCents += adjAmt;
    return {
      participantId,
      itemsCents: itemAmt,
      adjustmentsCents: adjAmt,
      totalCents: itemAmt + adjAmt,
    };
  });

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
  const perParticipant = new Map(
    participantIds.map((id) => [id.toString(), { itemsCents: 0, adjustmentsCents: 0, totalCents: 0 }]),
  );

  for (const order of settledOrders) {
    for (const line of order.perParticipant) {
      const summary = perParticipant.get(line.participantId.toString());
      if (summary) {
        summary.itemsCents += line.itemsCents;
        summary.adjustmentsCents += line.adjustmentsCents;
        summary.totalCents += line.totalCents;
      }
    }
  }

  return { currency, totalCents, orders: settledOrders, perParticipant };
};
