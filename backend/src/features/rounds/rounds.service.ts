import { randomBytes } from "node:crypto";
import { Types, type HydratedDocument } from "mongoose";
import {
  Round, type RoundDocument, type RoundStatus, type RoundSettlementLine,
  type EmbeddedOrder, type EmbeddedAdjustment, type EmbeddedOrderItem,
  type EmbeddedParticipant, type ShortlistStoreSnapshot,
  type AdjustmentType, type AdjustmentAllocation,
} from "./rounds.model";
import { Store } from "../stores/stores.model";
import { OrderEvent } from "../order-events/order-events.model";
import { hashToken, generateToken } from "../participants/participants.service";
import { recordOrderEvent } from "../order-events/order-events.service";
import { settleOrder } from "../orders/orders.settlement";
import { BadRequestError, NotFoundError, ForbiddenError } from "../../shared/errors";

export const deriveRoundStatus = (orders: EmbeddedOrder[], closesAt?: Date | null): RoundStatus => {
  const active = orders.filter((o) => o.status !== "cancelled");
  if (!active.length) return closesAt && closesAt.getTime() < Date.now() ? "locked" : "open";
  if (active.some((o) => o.status === "open")) return "open";
  if (!active.every((o) => o.status === "ordered")) return "locked";
  return active.every((o) => o.paidCents >= o.totalCents) ? "settled" : "ordered";
};

export const recalculateOrderTotals = (order: EmbeddedOrder): EmbeddedOrder => {
  order.subtotalCents = order.items
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0);
  order.adjustmentsCents = order.adjustments.reduce(
    (sum, adj) => sum + (adj.type === "discount" ? -adj.amountCents : adj.amountCents), 0);
  order.totalCents = Math.max(0, order.subtotalCents + order.adjustmentsCents);
  return order;
};

const saveRoundOrders = async (round: HydratedDocument<RoundDocument>) => {
  round.status = deriveRoundStatus(round.orders, round.closesAt);
  round.markModified("orders");
  await round.save();
};

const saveOrderChanges = async (round: HydratedDocument<RoundDocument>, order: EmbeddedOrder) => {
  recalculateOrderTotals(order);
  await saveRoundOrders(round);
};

const findRound = async (roundId: Types.ObjectId) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");
  return round;
};

const findSelection = (round: HydratedDocument<RoundDocument>, selectionId: Types.ObjectId) => {
  for (const order of round.orders) {
    const item = order.items.find((i) => i._id.equals(selectionId));
    if (item) return { order, item };
  }
  throw new NotFoundError("Selection");
};

const findOrder = (round: HydratedDocument<RoundDocument>, orderId: Types.ObjectId): EmbeddedOrder => {
  const order = round.orders.find((o) => o._id.equals(orderId));
  if (!order) throw new NotFoundError("Order");
  return order;
};

const findRoundAndOrder = async (roundId: Types.ObjectId, orderId: Types.ObjectId) => {
  const round = await findRound(roundId);
  return { round, order: findOrder(round, orderId) };
};

const getAuthorizedSelection = async (roundId: Types.ObjectId, selectionId: Types.ObjectId, participantId: Types.ObjectId, isOrganizer: boolean) => {
  const round = await findRound(roundId);
  const { order, item } = findSelection(round, selectionId);
  if (!isOrganizer && !item.participantId.equals(participantId)) throw new ForbiddenError("You can only modify your own selections");
  return { round, order, item };
};

const toShortlistSnapshot = (store: any): ShortlistStoreSnapshot => ({
  _id: store._id.toString(),
  name: store.name,
  slug: store.slug ?? null,
  platform: store.platform,
  currency: store.currency,
  rating: store.rating?.value ?? null,
  itemCount: store.stats?.itemCount ?? 0,
});

const audit = (roundId: Types.ObjectId, orderId: Types.ObjectId | null, actorParticipantId: Types.ObjectId | null, actorRole: "participant" | "organizer", entity: "order" | "selection" | "round", entityId: string, action: any, extra: Record<string, any> = {}) =>
  recordOrderEvent({ roundId, orderId, actorParticipantId, actorRole, entity, entityId, action, ...extra });

export const calculateRoundSettlement = (round: { currency: string; orders: EmbeddedOrder[]; participants: EmbeddedParticipant[] }) => {
  if (!round.orders.length || !round.participants.length) return null;
  const participantIds = round.participants.map((p) => p._id);
  const orders = round.orders.map((o) =>
    settleOrder({
      orderId: o._id,
      storeName: o.storeSnapshot.name,
      subtotalCents: o.subtotalCents,
      adjustments: o.adjustments,
      participantIds,
      selections: o.items.filter((i) => i.status === "active"),
    }),
  );

  const totalCents = orders.reduce((sum, o) => sum + o.totalCents, 0);

  // Aggregate participant item & adjustment totals directly
  const totalsByParticipant = new Map<string, { items: number; adjustments: number; paid: number }>();
  for (const p of round.participants) {
    totalsByParticipant.set(p._id.toString(), { items: 0, adjustments: 0, paid: 0 });
  }

  for (const o of orders) {
    for (const line of o.perParticipant) {
      const summary = totalsByParticipant.get(line.participantId.toString());
      if (summary) {
        summary.items += line.itemsCents;
        summary.adjustments += line.adjustmentsCents;
      }
    }
  }

  for (const o of round.orders) {
    for (const pay of o.payments || []) {
      const summary = totalsByParticipant.get(pay.participantId.toString());
      if (summary) {
        summary.paid += pay.amountCents;
      }
    }
  }

  const perParticipant: RoundSettlementLine[] = round.participants.map((p) => {
    const summary = totalsByParticipant.get(p._id.toString()) || { items: 0, adjustments: 0, paid: 0 };
    const total = summary.items + summary.adjustments;
    return {
      participantId: p._id,
      participantName: p.name,
      orderId: null,
      orderLabel: "Round Total",
      itemsCents: summary.items,
      adjustmentsCents: summary.adjustments,
      totalCents: total,
      paidCents: summary.paid,
      outstandingCents: Math.max(0, total - summary.paid),
    };
  });

  return { totalCents, orders, perParticipant };
};

export const deleteRoundCascadeService = async (roundId: Types.ObjectId) => {
  const [events, round] = await Promise.all([OrderEvent.deleteMany({ roundId }), Round.deleteOne({ _id: roundId })]);
  return { round: round.deletedCount ?? 0, orders: 0, selections: 0, participants: 0, events: events.deletedCount ?? 0 };
};

export const createRoundService = async (input: { title: string; notes?: string; shortlist: string[]; organizerName: string; userId: Types.ObjectId; currency?: string; closesAt?: Date }) => {
  if (!input.title?.trim()) throw new BadRequestError("Round title is required");
  if (!input.organizerName?.trim()) throw new BadRequestError("Organizer name is required");
  if (!input.shortlist?.length) throw new BadRequestError("A round needs at least one restaurant in the shortlist");

  const stores = await Store.find({ _id: { $in: input.shortlist } }).select("_id name slug platform currency rating stats").lean();
  if (!stores.length) throw new BadRequestError("None of the shortlisted stores could be found");

  const organizerToken = generateToken();
  const organizerParticipantId = new Types.ObjectId();
  const organizerParticipant: EmbeddedParticipant = {
    _id: organizerParticipantId, name: input.organizerName.trim(), userId: input.userId,
    tokenHash: hashToken(organizerToken), joinedAt: new Date(),
  };

  const round = await Round.create({
    slug: randomBytes(4).toString("hex"),
    title: input.title.trim(), notes: input.notes?.trim() || undefined,
    currency: input.currency || stores[0].currency || "EUR",
    organizer: { participantId: organizerParticipantId, name: input.organizerName.trim(), userId: input.userId },
    shortlist: stores.map(toShortlistSnapshot),
    participants: [organizerParticipant], orders: [], status: "open", closesAt: input.closesAt ?? null,
  });

  return { round, organizerToken, organizerParticipant };
};

export const getRoundsService = async (filter: { userId: Types.ObjectId; limit?: number }) =>
  Round.find({ $or: [{ "organizer.userId": filter.userId }, { "participants.userId": filter.userId }] })
    .sort({ createdAt: -1 })
    .limit(Math.min(filter.limit || 20, 50))
    .lean();

export const getRoundByIdOrSlugService = async (idOrSlug: string) => {
  const query = Types.ObjectId.isValid(idOrSlug) ? { $or: [{ _id: new Types.ObjectId(idOrSlug) }, { slug: idOrSlug }] } : { slug: idOrSlug };
  const round = await Round.findOne(query).lean();
  if (!round) throw new NotFoundError("Round");

  const settlement = round.settlement || calculateRoundSettlement(round);
  return {
    ...round,
    shortlistStores: round.shortlist,
    participants: round.participants.map((p: EmbeddedParticipant) => ({ ...p, isOrganizer: round.organizer.participantId.equals(p._id) })),
    selections: round.orders.flatMap((o: EmbeddedOrder) =>
      o.items.map((item: EmbeddedOrderItem) => ({ ...item, orderId: o._id, roundId: round._id, storeId: o.storeId })),
    ),
    settlementView: settlement ? { isLive: !round.settlement, currency: round.currency, ...settlement } : null,
  };
};

export const updateRoundService = async (roundId: Types.ObjectId, data: { title?: string; notes?: string; shortlist?: string[]; closesAt?: Date | null }) => {
  const round = await findRound(roundId);
  if (round.status === "settled") throw new BadRequestError("Cannot modify a settled round");
  if (data.title !== undefined) round.title = data.title.trim();
  if (data.notes !== undefined) round.notes = data.notes.trim() || undefined;
  if (data.closesAt !== undefined) round.closesAt = data.closesAt;
  if (data.shortlist !== undefined) {
    if (!data.shortlist.length) throw new BadRequestError("Shortlist cannot be empty");
    const stores = await Store.find({ _id: { $in: data.shortlist } }).select("_id name slug platform currency rating stats").lean();
    round.shortlist = stores.map(toShortlistSnapshot);
  }
  await round.save();
  return round;
};

const getOrCreateOrder = (round: HydratedDocument<RoundDocument>, storeId: string, store: any): EmbeddedOrder => {
  let order = round.orders.find((o) => o.storeId === storeId);
  if (!order) {
    round.orders.push({
      _id: new Types.ObjectId(), storeId, storeSnapshot: { name: store.name, slug: store.slug },
      status: "open", currency: round.currency, subtotalCents: 0, adjustmentsCents: 0, totalCents: 0,
      paidCents: 0, adjustments: [], payments: [], items: [], createdAt: new Date(),
    });
    order = round.orders[round.orders.length - 1];
  }
  return order;
};

export const addSelectionService = async (roundId: Types.ObjectId, participantId: Types.ObjectId, data: { storeId: string; itemId: string; quantity: number; note?: string }) => {
  const round = await findRound(roundId);
  if (round.status === "locked" || round.status === "settled") throw new BadRequestError(`Cannot add items: round is ${round.status}`);
  if (!round.shortlist.some((s: ShortlistStoreSnapshot) => s._id === data.storeId)) throw new BadRequestError("Selected restaurant is not in the round shortlist");

  const store = await Store.findById(data.storeId).lean();
  if (!store) throw new NotFoundError("Store");

  let foundItem: any = null;
  let foundSectionKey: string | null = null;
  for (const s of store.menu?.sections || []) {
    const it = s.items?.find((i: any) => i._id === data.itemId);
    if (it) { foundItem = it; foundSectionKey = s.key; break; }
  }
  if (!foundItem) throw new NotFoundError("Menu item");
  const unitPriceCents = Math.round((foundItem.price ?? 0) * 100);

  const order = getOrCreateOrder(round, data.storeId, store);
  if (order.status !== "open") throw new BadRequestError(`Cannot add items: order is ${order.status}`);

  let item = order.items.find((i: EmbeddedOrderItem) => i.participantId.equals(participantId) && i.itemId === data.itemId);
  if (item) {
    item.quantity = item.status === "removed" ? data.quantity : item.quantity + data.quantity;
    item.status = "active";
    if (data.note) item.note = data.note;
  } else {
    order.items.push({
      _id: new Types.ObjectId(), participantId, itemId: data.itemId, sectionKey: foundSectionKey,
      itemSnapshot: { name: foundItem.name, imageUrl: foundItem.imageUrl ?? null },
      quantity: data.quantity, menuUnitPriceCents: unitPriceCents, unitPriceCents,
      priceOverridden: false, note: data.note || null, status: "active", createdAt: new Date(),
    });
    item = order.items[order.items.length - 1];
  }

  await saveOrderChanges(round, order);
  await audit(roundId, order._id, participantId, "participant", "selection", data.itemId, "selection_added", {
    after: { quantity: item.quantity, unitPriceCents: item.unitPriceCents },
    deltaCents: item.unitPriceCents * data.quantity,
  });
  return item;
};

export const updateSelectionService = async (roundId: Types.ObjectId, selectionId: Types.ObjectId, participantId: Types.ObjectId, isOrganizer: boolean, data: { quantity?: number; note?: string }) => {
  const { round, order, item } = await getAuthorizedSelection(roundId, selectionId, participantId, isOrganizer);
  const prevQty = item.quantity;
  if (data.quantity !== undefined) {
    if (data.quantity <= 0) return removeSelectionService(roundId, selectionId, participantId, isOrganizer);
    item.quantity = data.quantity;
  }
  if (data.note !== undefined) item.note = data.note.trim() || null;

  await saveOrderChanges(round, order);
  if (data.quantity !== undefined && data.quantity !== prevQty) {
    await audit(roundId, order._id, participantId, isOrganizer ? "organizer" : "participant", "selection", item.itemId, "quantity_changed", {
      before: prevQty, after: item.quantity, deltaCents: (item.quantity - prevQty) * item.unitPriceCents,
    });
  }
  return item;
};

export const removeSelectionService = async (roundId: Types.ObjectId, selectionId: Types.ObjectId, participantId: Types.ObjectId, isOrganizer: boolean) => {
  const { round, order, item } = await getAuthorizedSelection(roundId, selectionId, participantId, isOrganizer);
  item.status = "removed";
  await saveOrderChanges(round, order);
  await audit(roundId, order._id, participantId, isOrganizer ? "organizer" : "participant", "selection", item.itemId, "selection_removed", {
    before: item.quantity, after: 0, deltaCents: -(item.quantity * item.unitPriceCents),
  });
  return { success: true };
};

export const overrideSelectionPriceInRoundService = async (roundId: Types.ObjectId, selectionId: Types.ObjectId, actorParticipantId: Types.ObjectId, unitPriceCents: number) => {
  const round = await findRound(roundId);
  const { order, item } = findSelection(round, selectionId);
  const prevPrice = item.unitPriceCents;
  const restoring = unitPriceCents === item.menuUnitPriceCents;

  item.unitPriceCents = unitPriceCents;
  item.priceOverridden = !restoring;
  await saveOrderChanges(round, order);

  await audit(roundId, order._id, actorParticipantId, "organizer", "selection", item.itemId, restoring ? "price_restored" : "price_overridden", {
    field: "unitPriceCents", before: prevPrice, after: unitPriceCents, deltaCents: (unitPriceCents - prevPrice) * item.quantity,
  });
  return unitPriceCents;
};

export const addAdjustmentToOrderService = async (roundId: Types.ObjectId, orderId: Types.ObjectId, actorParticipantId: Types.ObjectId, adj: { label: string; type: AdjustmentType; amountCents: number; allocation: AdjustmentAllocation }) => {
  const { round, order } = await findRoundAndOrder(roundId, orderId);
  const newAdj: EmbeddedAdjustment = { _id: new Types.ObjectId(), label: adj.label.trim(), type: adj.type, amountCents: adj.amountCents, allocation: adj.allocation };
  order.adjustments.push(newAdj);
  await saveOrderChanges(round, order);
  await audit(roundId, order._id, actorParticipantId, "organizer", "order", newAdj._id.toString(), "adjustment_added", {
    after: newAdj, deltaCents: adj.type === "discount" ? -adj.amountCents : adj.amountCents,
  });
  return order;
};

export const removeAdjustmentFromOrderService = async (roundId: Types.ObjectId, orderId: Types.ObjectId, actorParticipantId: Types.ObjectId, adjustmentId: Types.ObjectId) => {
  const { round, order } = await findRoundAndOrder(roundId, orderId);
  const removed = order.adjustments.find((a) => a._id.equals(adjustmentId));
  if (!removed) throw new NotFoundError("Adjustment");
  order.adjustments = order.adjustments.filter((a) => !a._id.equals(adjustmentId));
  await saveOrderChanges(round, order);
  await audit(roundId, order._id, actorParticipantId, "organizer", "order", adjustmentId.toString(), "adjustment_removed", {
    before: removed, deltaCents: removed.type === "discount" ? removed.amountCents : -removed.amountCents,
  });
  return order;
};

export const recordPaymentService = async (roundId: Types.ObjectId, orderId: Types.ObjectId, actorParticipantId: Types.ObjectId, pay: { participantId: Types.ObjectId; amountCents: number; method?: string; note?: string }) => {
  const { round, order } = await findRoundAndOrder(roundId, orderId);
  const paymentEntry = { _id: new Types.ObjectId(), participantId: pay.participantId, amountCents: pay.amountCents, method: pay.method || null, note: pay.note || null, receivedAt: new Date() };
  order.payments.push(paymentEntry);
  order.paidCents += pay.amountCents;
  await saveRoundOrders(round);
  await audit(roundId, order._id, actorParticipantId, "organizer", "order", paymentEntry._id.toString(), "payment_recorded", { after: paymentEntry });
  return order;
};


export const lockRoundService = async (roundId: Types.ObjectId) => {
  const round = await findRound(roundId);
  for (const o of round.orders) {
    if (o.status === "open") { o.status = "locked"; o.lockedAt = new Date(); }
  }
  round.status = "locked";
  round.markModified("orders");
  await round.save();
  return round;
};

export const settleRoundFreezeService = async (roundId: Types.ObjectId, actorParticipantId: Types.ObjectId) => {
  const round = await findRound(roundId);
  if (!round.participants.length) throw new BadRequestError("Cannot settle a round with no participants");
  const calculated = calculateRoundSettlement(round);
  if (!calculated) throw new BadRequestError("Cannot settle an empty round");
  round.settlement = { frozenAt: new Date(), currency: round.currency, orderTotalCents: calculated.totalCents, perParticipant: calculated.perParticipant };
  round.status = "settled";
  await round.save();
  await audit(roundId, null, actorParticipantId, "organizer", "round", round._id.toString(), "round_settled", { after: round.settlement });
  return round;
};
