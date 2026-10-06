import type { Types } from "mongoose";

export interface SettlementSelection { participantId: Types.ObjectId; unitPriceCents: number; quantity: number; }
export interface SettlementOrderInput {
  orderId: Types.ObjectId; storeName: string; subtotalCents: number;
  adjustments: Array<{ type: string; amountCents: number; allocation: string }>;
  participantIds: Types.ObjectId[]; selections: SettlementSelection[];
}
export interface ParticipantLine { participantId: Types.ObjectId; itemsCents: number; adjustmentsCents: number; totalCents: number; }
export interface SettledOrder {
  orderId: Types.ObjectId; storeName: string; itemsCents: number; adjustmentsCents: number; totalCents: number;
  perParticipant: ParticipantLine[];
}
export interface SettledRound {
  currency: string; totalCents: number; orders: SettledOrder[];
  perParticipant: Map<string, { itemsCents: number; adjustmentsCents: number; totalCents: number }>;
}

export const adjustmentSign = (adj: { type: string }): number => (adj.type === "discount" ? -1 : 1);

const allocate = (amount: number, weights: number[]): number[] => {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!amount || sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (amount * w) / sum);
  const res = exact.map(Math.floor);
  let rem = amount - res.reduce((a, b) => a + b, 0);
  exact.map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
    .forEach(({ i }) => { if (rem-- > 0) res[i]++; });
  return res;
};

export const settleOrder = (input: SettlementOrderInput): SettledOrder => {
  const ids = input.participantIds;
  const items = ids.map((id) => input.selections.filter((s) => s.participantId.toString() === id.toString()).reduce((sum, s) => sum + s.unitPriceCents * s.quantity, 0));
  const itemsCents = items.reduce((a, b) => a + b, 0);
  const adjustments = ids.map(() => 0);
  for (const adj of input.adjustments) {
    const weights = adj.allocation === "equal" ? ids.map(() => 1) : items;
    allocate(adj.amountCents, weights).forEach((share, i) => { adjustments[i] += adjustmentSign(adj) * share; });
  }
  const perParticipant = ids.map((participantId, i) => ({
    participantId, itemsCents: items[i], adjustmentsCents: adjustments[i], totalCents: items[i] + adjustments[i],
  }));
  const adjustmentsCents = adjustments.reduce((a, b) => a + b, 0);
  return { orderId: input.orderId, storeName: input.storeName, itemsCents, adjustmentsCents, totalCents: itemsCents + adjustmentsCents, perParticipant };
};

export const settleRound = (orders: SettlementOrderInput[], participantIds: Types.ObjectId[], currency: string): SettledRound => {
  const settledOrders = orders.map(settleOrder);
  const totalCents = settledOrders.reduce((sum, o) => sum + o.totalCents, 0);
  const perParticipant = new Map<string, { itemsCents: number; adjustmentsCents: number; totalCents: number }>();
  for (const id of participantIds) perParticipant.set(id.toString(), { itemsCents: 0, adjustmentsCents: 0, totalCents: 0 });
  for (const o of settledOrders) {
    for (const p of o.perParticipant) {
      const cur = perParticipant.get(p.participantId.toString())!;
      cur.itemsCents += p.itemsCents; cur.adjustmentsCents += p.adjustmentsCents; cur.totalCents += p.totalCents;
    }
  }
  return { currency, totalCents, orders: settledOrders, perParticipant };
};
