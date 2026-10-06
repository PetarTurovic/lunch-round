import type { Types } from "mongoose";
import type { OrderAdjustment } from "./orders.model";

export interface SettlementSelection {
  participantId: Types.ObjectId;
  unitPriceCents: number;
  quantity: number;
}

export interface SettlementOrderInput {
  orderId: Types.ObjectId;
  storeName: string;
  subtotalCents: number;
  adjustments: OrderAdjustment[];
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
  perParticipant: Map<
    string,
    { itemsCents: number; adjustmentsCents: number; totalCents: number }
  >;
}

export const adjustmentSign = (adjustment: OrderAdjustment): number =>
  adjustment.type === "discount" ? -1 : 1;

const allocate = (amountCents: number, weights: number[]): number[] => {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (amountCents === 0 || total <= 0) return weights.map(() => 0);

  const exact = weights.map((weight) => (amountCents * weight) / total);
  const floored = exact.map((value) => Math.floor(value));
  let leftover = amountCents - floored.reduce((sum, value) => sum + value, 0);

  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  const result = [...floored];
  let cursor = 0;
  while (leftover > 0 && order.length > 0) {
    result[order[cursor % order.length].index] += 1;
    leftover -= 1;
    cursor += 1;
  }
  return result;
};

export const settleOrder = (input: SettlementOrderInput): SettledOrder => {
  const ids = input.participantIds;

  const itemsByParticipant = new Map<string, number>();
  for (const id of ids) itemsByParticipant.set(id.toString(), 0);
  for (const selection of input.selections) {
    const key = selection.participantId.toString();
    const line = selection.unitPriceCents * selection.quantity;
    itemsByParticipant.set(key, (itemsByParticipant.get(key) ?? 0) + line);
  }

  const items = ids.map((id) => itemsByParticipant.get(id.toString()) ?? 0);
  const itemTotal = items.reduce((sum, value) => sum + value, 0);

  const adjustmentTotals = ids.map(() => 0);
  for (const adjustment of input.adjustments) {
    const weights =
      adjustment.allocation === "equal" ? ids.map(() => 1) : items;
    const parts = allocate(
      adjustmentSign(adjustment) * adjustment.amountCents,
      weights,
    );
    for (let i = 0; i < ids.length; i += 1) adjustmentTotals[i] += parts[i];
  }

  const perParticipant: ParticipantLine[] = ids.map((id, index) => ({
    participantId: id,
    itemsCents: items[index],
    adjustmentsCents: adjustmentTotals[index],
    totalCents: items[index] + adjustmentTotals[index],
  }));

  const adjustmentsCents = adjustmentTotals.reduce(
    (sum, value) => sum + value,
    0,
  );

  return {
    orderId: input.orderId,
    storeName: input.storeName,
    itemsCents: itemTotal,
    adjustmentsCents,
    totalCents: itemTotal + adjustmentsCents,
    perParticipant,
  };
};

export const settleRound = (
  orders: SettlementOrderInput[],
  participantIds: Types.ObjectId[],
  currency: string,
): SettledRound => {
  const settledOrders = orders.map(settleOrder);
  const totalCents = settledOrders.reduce(
    (sum, order) => sum + order.totalCents,
    0,
  );

  const perParticipant = new Map<
    string,
    { itemsCents: number; adjustmentsCents: number; totalCents: number }
  >();
  for (const id of participantIds) {
    perParticipant.set(id.toString(), {
      itemsCents: 0,
      adjustmentsCents: 0,
      totalCents: 0,
    });
  }
  for (const order of settledOrders) {
    for (const line of order.perParticipant) {
      const key = line.participantId.toString();
      const entry = perParticipant.get(key) ?? {
        itemsCents: 0,
        adjustmentsCents: 0,
        totalCents: 0,
      };
      entry.itemsCents += line.itemsCents;
      entry.adjustmentsCents += line.adjustmentsCents;
      entry.totalCents += line.totalCents;
      perParticipant.set(key, entry);
    }
  }

  return { currency, totalCents, orders: settledOrders, perParticipant };
};
