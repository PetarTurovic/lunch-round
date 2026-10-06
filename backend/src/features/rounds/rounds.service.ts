import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import type { HydratedDocument } from "mongoose";
import { Round } from "./rounds.model";
import type {
  RoundDocument,
  RoundStatus,
  RoundSettlementLine,
  EmbeddedOrder,
  EmbeddedAdjustment,
  EmbeddedOrderItem,
  EmbeddedParticipant,
  ShortlistStoreSnapshot,
  AdjustmentType,
  AdjustmentAllocation,
} from "./rounds.model";
import { Store } from "../stores/stores.model";
import { OrderEvent } from "../order-events/order-events.model";
import { hashToken, generateToken } from "../participants/participants.service";
import { recordOrderEvent } from "../order-events/order-events.service";
import { settleRound, SettlementOrderInput } from "../orders/orders.settlement";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "../../shared/errors";

// --- Helpers ---

export const deriveRoundStatus = (
  orders: EmbeddedOrder[],
  closesAt?: Date | null,
): RoundStatus => {
  const live = orders.filter((order) => order.status !== "cancelled");
  if (live.length === 0) {
    return closesAt && closesAt.getTime() < Date.now() ? "locked" : "open";
  }
  if (live.some((order) => order.status === "open")) return "open";
  if (!live.every((order) => order.status === "ordered")) return "locked";
  return live.every((order) => order.paidCents >= order.totalCents)
    ? "settled"
    : "ordered";
};

export const recalculateOrderTotals = (order: EmbeddedOrder): EmbeddedOrder => {
  const activeItems = order.items.filter((i) => i.status === "active");
  const subtotalCents = activeItems.reduce(
    (sum, s) => sum + s.unitPriceCents * s.quantity,
    0,
  );
  const adjustmentsCents = order.adjustments.reduce((sum, a) => {
    return a.type === "discount" ? sum - a.amountCents : sum + a.amountCents;
  }, 0);

  order.subtotalCents = subtotalCents;
  order.adjustmentsCents = adjustmentsCents;
  order.totalCents = Math.max(0, subtotalCents + adjustmentsCents);
  return order;
};

const saveRoundOrders = async (
  round: HydratedDocument<RoundDocument>,
): Promise<void> => {
  round.status = deriveRoundStatus(round.orders, round.closesAt);
  round.markModified("orders");
  await round.save();
};

const findSelection = (
  round: HydratedDocument<RoundDocument>,
  selectionId: Types.ObjectId,
): { order: EmbeddedOrder; item: EmbeddedOrderItem } => {
  for (const order of round.orders) {
    const item = order.items.find((i: EmbeddedOrderItem) =>
      i._id.equals(selectionId),
    );
    if (item) return { order, item };
  }
  throw new NotFoundError("Selection");
};

const findOrder = (
  round: HydratedDocument<RoundDocument>,
  orderId: Types.ObjectId,
): EmbeddedOrder => {
  const order = round.orders.find((o: EmbeddedOrder) => o._id.equals(orderId));
  if (!order) throw new NotFoundError("Order");
  return order;
};

export const calculateRoundSettlement = (round: {
  currency: string;
  orders: EmbeddedOrder[];
  participants: EmbeddedParticipant[];
}) => {
  if (round.orders.length === 0 || round.participants.length === 0) {
    return null;
  }

  const participantIds = round.participants.map((p) => p._id);
  const inputs: SettlementOrderInput[] = round.orders.map((order) => ({
    orderId: order._id,
    storeName: order.storeSnapshot.name,
    subtotalCents: order.subtotalCents,
    adjustments: order.adjustments,
    participantIds,
    selections: order.items
      .filter((i) => i.status === "active")
      .map((i) => ({
        participantId: i.participantId,
        unitPriceCents: i.unitPriceCents,
        quantity: i.quantity,
      })),
  }));

  const settled = settleRound(inputs, participantIds, round.currency);

  const paidByParticipant = new Map<string, number>();
  for (const order of round.orders) {
    for (const pay of order.payments || []) {
      const key = pay.participantId.toString();
      paidByParticipant.set(
        key,
        (paidByParticipant.get(key) ?? 0) + pay.amountCents,
      );
    }
  }

  const perParticipant: RoundSettlementLine[] = round.participants.map((p) => {
    const line = settled.perParticipant.get(p._id.toString()) || {
      itemsCents: 0,
      adjustmentsCents: 0,
      totalCents: 0,
    };
    const paidCents = paidByParticipant.get(p._id.toString()) ?? 0;
    return {
      participantId: p._id,
      participantName: p.name,
      orderId: null,
      orderLabel: "Round Total",
      itemsCents: line.itemsCents,
      adjustmentsCents: line.adjustmentsCents,
      totalCents: line.totalCents,
      paidCents,
      outstandingCents: Math.max(0, line.totalCents - paidCents),
    };
  });

  return {
    totalCents: settled.totalCents,
    orders: settled.orders,
    perParticipant,
  };
};

// --- Round Lifecycle Services ---

export const deleteRoundCascadeService = async (roundId: Types.ObjectId) => {
  const [events, round] = await Promise.all([
    OrderEvent.deleteMany({ roundId }),
    Round.deleteOne({ _id: roundId }),
  ]);

  return {
    round: round.deletedCount ?? 0,
    orders: 0,
    selections: 0,
    participants: 0,
    events: events.deletedCount ?? 0,
  };
};

export const createRoundService = async (input: {
  title: string;
  notes?: string;
  shortlist: string[];
  organizerName: string;
  userId: Types.ObjectId;
  currency?: string;
  closesAt?: Date;
}) => {
  if (!input.title?.trim()) {
    throw new BadRequestError("Round title is required");
  }
  if (!input.organizerName?.trim()) {
    throw new BadRequestError("Organizer name is required");
  }
  if (!input.shortlist || input.shortlist.length === 0) {
    throw new BadRequestError(
      "A round needs at least one restaurant in the shortlist",
    );
  }

  const stores = await Store.find({ _id: { $in: input.shortlist } })
    .select("_id name slug platform currency rating stats")
    .lean();

  if (stores.length === 0) {
    throw new BadRequestError("None of the shortlisted stores could be found");
  }

  const shortlistSnapshots: ShortlistStoreSnapshot[] = stores.map((s) => ({
    _id: s._id as string,
    name: s.name,
    slug: s.slug ?? null,
    platform: s.platform,
    currency: s.currency,
    rating: s.rating?.value ?? null,
    itemCount: s.stats?.itemCount ?? 0,
  }));

  const organizerToken = generateToken();
  const organizerParticipantId = new Types.ObjectId();
  const organizerParticipant = {
    _id: organizerParticipantId,
    name: input.organizerName.trim(),
    userId: input.userId,
    tokenHash: hashToken(organizerToken),
    joinedAt: new Date(),
  };

  const round = await Round.create({
    slug: randomBytes(4).toString("hex"),
    title: input.title.trim(),
    notes: input.notes?.trim() || undefined,
    currency: input.currency || stores[0].currency || "EUR",
    organizer: {
      participantId: organizerParticipantId,
      name: input.organizerName.trim(),
      userId: input.userId,
    },
    shortlist: shortlistSnapshots,
    participants: [organizerParticipant],
    orders: [],
    status: "open",
    closesAt: input.closesAt ?? null,
  });

  return { round, organizerToken, organizerParticipant };
};

export const getRoundsService = async (filter: {
  userId: Types.ObjectId;
  limit?: number;
}) => {
  const limit = Math.min(filter.limit || 20, 50);
  return Round.find({
    $or: [
      { "organizer.userId": filter.userId },
      { "participants.userId": filter.userId },
    ],
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

export const getRoundByIdOrSlugService = async (idOrSlug: string) => {
  const query = Types.ObjectId.isValid(idOrSlug)
    ? { $or: [{ _id: new Types.ObjectId(idOrSlug) }, { slug: idOrSlug }] }
    : { slug: idOrSlug };

  const round = await Round.findOne(query).lean();
  if (!round) throw new NotFoundError("Round");

  const settlement = round.settlement || calculateRoundSettlement(round);

  return {
    ...round,
    shortlistStores: round.shortlist,
    participants: round.participants.map((p: EmbeddedParticipant) => ({
      ...p,
      isOrganizer: round.organizer.participantId.equals(p._id),
    })),
    selections: round.orders.flatMap((o: EmbeddedOrder) =>
      o.items.map((i: EmbeddedOrderItem) => ({
        ...i,
        orderId: o._id,
        roundId: round._id,
        storeId: o.storeId,
      })),
    ),
    settlementView: settlement
      ? {
          isLive: !round.settlement,
          currency: round.currency,
          ...settlement,
        }
      : null,
  };
};

export const updateRoundService = async (
  roundId: Types.ObjectId,
  data: {
    title?: string;
    notes?: string;
    shortlist?: string[];
    closesAt?: Date | null;
  },
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");
  if (round.status === "settled") {
    throw new BadRequestError("Cannot modify a settled round");
  }

  if (data.title !== undefined) round.title = data.title.trim();
  if (data.notes !== undefined) round.notes = data.notes.trim() || undefined;
  if (data.closesAt !== undefined) round.closesAt = data.closesAt;

  if (data.shortlist !== undefined) {
    if (data.shortlist.length === 0) {
      throw new BadRequestError("Shortlist cannot be empty");
    }
    const stores = await Store.find({ _id: { $in: data.shortlist } })
      .select("_id name slug platform currency rating stats")
      .lean();

    round.shortlist = stores.map((s) => ({
      _id: s._id as string,
      name: s.name,
      slug: s.slug ?? null,
      platform: s.platform,
      currency: s.currency,
      rating: s.rating?.value ?? null,
      itemCount: s.stats?.itemCount ?? 0,
    }));
  }

  await round.save();
  return round;
};

// --- Selection Operations ---

export const addSelectionService = async (
  roundId: Types.ObjectId,
  participantId: Types.ObjectId,
  data: {
    storeId: string;
    itemId: string;
    quantity: number;
    note?: string;
  },
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");
  if (round.status === "locked" || round.status === "settled") {
    throw new BadRequestError(`Cannot add items: round is ${round.status}`);
  }

  const isShortlisted = round.shortlist.some(
    (s: ShortlistStoreSnapshot) => s._id === data.storeId,
  );
  if (!isShortlisted) {
    throw new BadRequestError(
      "Selected restaurant is not in the round shortlist",
    );
  }

  const store = await Store.findById(data.storeId).lean();
  if (!store) throw new NotFoundError("Store");

  let foundItem: {
    _id: string;
    name: string;
    price: number | null;
    imageUrl?: string | null;
  } | null = null;
  let foundSectionKey: string | null = null;

  for (const section of store.menu.sections || []) {
    const item = section.items?.find((i) => i._id === data.itemId);
    if (item) {
      foundItem = item;
      foundSectionKey = section.key;
      break;
    }
  }

  if (!foundItem) throw new NotFoundError("Menu item");
  const unitPriceCents = Math.round((foundItem.price ?? 0) * 100);

  let order = round.orders.find(
    (o: EmbeddedOrder) => o.storeId === data.storeId,
  );
  if (!order) {
    round.orders.push({
      _id: new Types.ObjectId(),
      storeId: data.storeId,
      storeSnapshot: { name: store.name, slug: store.slug },
      status: "open",
      currency: round.currency,
      subtotalCents: 0,
      adjustmentsCents: 0,
      totalCents: 0,
      paidCents: 0,
      adjustments: [],
      payments: [],
      items: [],
      createdAt: new Date(),
    });
    order = round.orders[round.orders.length - 1];
  }

  if (order.status !== "open") {
    throw new BadRequestError(`Cannot add items: order is ${order.status}`);
  }

  let item = order.items.find(
    (i: EmbeddedOrderItem) =>
      i.participantId.equals(participantId) && i.itemId === data.itemId,
  );

  if (item) {
    if (item.status === "removed") {
      item.status = "active";
      item.quantity = data.quantity;
      item.note = data.note || null;
    } else {
      item.quantity += data.quantity;
      if (data.note) item.note = data.note;
    }
  } else {
    item = {
      _id: new Types.ObjectId(),
      participantId,
      itemId: data.itemId,
      sectionKey: foundSectionKey,
      itemSnapshot: {
        name: foundItem.name,
        imageUrl: foundItem.imageUrl ?? null,
      },
      quantity: data.quantity,
      menuUnitPriceCents: unitPriceCents,
      unitPriceCents,
      priceOverridden: false,
      note: data.note || null,
      status: "active",
      createdAt: new Date(),
    };
    order.items.push(item);
  }

  recalculateOrderTotals(order);
  await saveRoundOrders(round);

  await recordOrderEvent({
    roundId,
    orderId: order._id,
    actorParticipantId: participantId,
    actorRole: "participant",
    entity: "selection",
    entityId: data.itemId,
    action: "selection_added",
    after: { quantity: item.quantity, unitPriceCents: item.unitPriceCents },
    deltaCents: item.unitPriceCents * data.quantity,
  });

  return item;
};

export const updateSelectionService = async (
  roundId: Types.ObjectId,
  selectionId: Types.ObjectId,
  participantId: Types.ObjectId,
  isOrganizer: boolean,
  data: { quantity?: number; note?: string },
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");

  const { order, item } = findSelection(round, selectionId);

  if (!isOrganizer && !item.participantId.equals(participantId)) {
    throw new ForbiddenError("You can only modify your own selections");
  }

  const previousQty = item.quantity;
  if (data.quantity !== undefined) {
    if (data.quantity <= 0) {
      return removeSelectionService(
        roundId,
        selectionId,
        participantId,
        isOrganizer,
      );
    }
    item.quantity = data.quantity;
  }
  if (data.note !== undefined) {
    item.note = data.note.trim() || null;
  }

  recalculateOrderTotals(order);
  await saveRoundOrders(round);

  if (data.quantity !== undefined && data.quantity !== previousQty) {
    await recordOrderEvent({
      roundId,
      orderId: order._id,
      actorParticipantId: participantId,
      actorRole: isOrganizer ? "organizer" : "participant",
      entity: "selection",
      entityId: item.itemId,
      action: "quantity_changed",
      before: previousQty,
      after: item.quantity,
      deltaCents: (item.quantity - previousQty) * item.unitPriceCents,
    });
  }

  return item;
};

export const removeSelectionService = async (
  roundId: Types.ObjectId,
  selectionId: Types.ObjectId,
  participantId: Types.ObjectId,
  isOrganizer: boolean,
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");

  const { order, item } = findSelection(round, selectionId);

  if (!isOrganizer && !item.participantId.equals(participantId)) {
    throw new ForbiddenError("You can only remove your own selections");
  }

  item.status = "removed";
  recalculateOrderTotals(order);
  await saveRoundOrders(round);

  await recordOrderEvent({
    roundId,
    orderId: order._id,
    actorParticipantId: participantId,
    actorRole: isOrganizer ? "organizer" : "participant",
    entity: "selection",
    entityId: item.itemId,
    action: "selection_removed",
    before: item.quantity,
    after: 0,
    deltaCents: -(item.quantity * item.unitPriceCents),
  });

  return { success: true };
};

export const overrideSelectionPriceInRoundService = async (
  roundId: Types.ObjectId,
  selectionId: Types.ObjectId,
  actorParticipantId: Types.ObjectId,
  unitPriceCents: number,
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");

  const { order, item } = findSelection(round, selectionId);
  const previousPrice = item.unitPriceCents;
  const restoringMenuPrice = unitPriceCents === item.menuUnitPriceCents;

  item.unitPriceCents = unitPriceCents;
  item.priceOverridden = !restoringMenuPrice;

  recalculateOrderTotals(order);
  await saveRoundOrders(round);

  await recordOrderEvent({
    roundId,
    orderId: order._id,
    actorParticipantId,
    actorRole: "organizer",
    entity: "selection",
    entityId: item.itemId,
    action: restoringMenuPrice ? "price_restored" : "price_overridden",
    field: "unitPriceCents",
    before: previousPrice,
    after: unitPriceCents,
    deltaCents: (unitPriceCents - previousPrice) * item.quantity,
  });

  return unitPriceCents;
};

// --- Order Adjustments & Payments ---

export const addAdjustmentToOrderService = async (
  roundId: Types.ObjectId,
  orderId: Types.ObjectId,
  actorParticipantId: Types.ObjectId,
  adjustment: {
    label: string;
    type: AdjustmentType;
    amountCents: number;
    allocation: AdjustmentAllocation;
  },
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");

  const order = findOrder(round, orderId);
  const adjId = new Types.ObjectId();
  const newAdj: EmbeddedAdjustment = {
    _id: adjId,
    label: adjustment.label.trim(),
    type: adjustment.type,
    amountCents: adjustment.amountCents,
    allocation: adjustment.allocation,
  };

  order.adjustments.push(newAdj);
  recalculateOrderTotals(order);
  await saveRoundOrders(round);

  const delta =
    adjustment.type === "discount"
      ? -adjustment.amountCents
      : adjustment.amountCents;

  await recordOrderEvent({
    roundId,
    orderId: order._id,
    actorParticipantId,
    actorRole: "organizer",
    entity: "order",
    entityId: adjId.toString(),
    action: "adjustment_added",
    after: newAdj,
    deltaCents: delta,
  });

  return order;
};

export const removeAdjustmentFromOrderService = async (
  roundId: Types.ObjectId,
  orderId: Types.ObjectId,
  actorParticipantId: Types.ObjectId,
  adjustmentId: Types.ObjectId,
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");

  const order = findOrder(round, orderId);
  const removed = order.adjustments.find((a) => a._id.equals(adjustmentId));
  if (!removed) throw new NotFoundError("Adjustment");

  order.adjustments = order.adjustments.filter(
    (a) => !a._id.equals(adjustmentId),
  );
  recalculateOrderTotals(order);
  await saveRoundOrders(round);

  const delta =
    removed.type === "discount" ? removed.amountCents : -removed.amountCents;

  await recordOrderEvent({
    roundId,
    orderId: order._id,
    actorParticipantId,
    actorRole: "organizer",
    entity: "order",
    entityId: adjustmentId.toString(),
    action: "adjustment_removed",
    before: removed,
    deltaCents: delta,
  });

  return order;
};

export const recordPaymentService = async (
  roundId: Types.ObjectId,
  orderId: Types.ObjectId,
  actorParticipantId: Types.ObjectId,
  payment: {
    participantId: Types.ObjectId;
    amountCents: number;
    method?: string;
    note?: string;
  },
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");

  const order = findOrder(round, orderId);
  const payId = new Types.ObjectId();
  const paymentEntry = {
    _id: payId,
    participantId: payment.participantId,
    amountCents: payment.amountCents,
    method: payment.method || null,
    note: payment.note || null,
    receivedAt: new Date(),
  };

  order.payments.push(paymentEntry);
  order.paidCents += payment.amountCents;

  await saveRoundOrders(round);

  await recordOrderEvent({
    roundId,
    orderId: order._id,
    actorParticipantId,
    actorRole: "organizer",
    entity: "order",
    entityId: payId.toString(),
    action: "payment_recorded",
    after: paymentEntry,
  });

  return order;
};

export const lockRoundService = async (roundId: Types.ObjectId) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");

  for (const order of round.orders) {
    if (order.status === "open") {
      order.status = "locked";
      order.lockedAt = new Date();
    }
  }

  round.status = "locked";
  round.markModified("orders");
  await round.save();
  return round;
};

export const settleRoundFreezeService = async (
  roundId: Types.ObjectId,
  actorParticipantId: Types.ObjectId,
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");

  if (round.participants.length === 0) {
    throw new BadRequestError("Cannot settle a round with no participants");
  }

  const calculated = calculateRoundSettlement(round);
  if (!calculated) {
    throw new BadRequestError("Cannot settle an empty round");
  }

  round.settlement = {
    frozenAt: new Date(),
    currency: round.currency,
    orderTotalCents: calculated.totalCents,
    perParticipant: calculated.perParticipant,
  };
  round.status = "settled";
  await round.save();

  await recordOrderEvent({
    roundId,
    actorParticipantId,
    actorRole: "organizer",
    entity: "round",
    entityId: round._id.toString(),
    action: "round_settled",
    after: round.settlement,
  });

  return round;
};
