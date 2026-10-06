import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
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
import { hashToken, generateToken } from "../participants/participants.service";
import { recordOrderEvent } from "../order-events/order-events.service";
import { settleRound, SettlementOrderInput } from "../orders/orders.settlement";
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from "../../shared/errors";

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

export const deleteRoundCascadeService = async (roundId: Types.ObjectId) => {
  const { OrderEvent } = await import("../order-events/order-events.model");
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

export const countDanglingReferencesService = async (
  roundId: Types.ObjectId,
) => {
  const { OrderEvent } = await import("../order-events/order-events.model");
  const events = await OrderEvent.countDocuments({ roundId });
  return { orders: 0, selections: 0, participants: 0, events, total: events };
};

export interface CreateRoundInput {
  title: string;
  shortlist: string[];
  currency?: string;
  notes?: string;
  closesAt?: Date | null;
  organizerName: string;
  userId: Types.ObjectId;
}

export const createRoundService = async (input: CreateRoundInput) => {
  if (!input.shortlist || input.shortlist.length === 0) {
    throw new BadRequestError(
      "A round needs at least one restaurant in the shortlist",
    );
  }

  // Verify stores exist and create snapshot for shortlist
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

  const currency = input.currency || stores[0].currency || "EUR";
  const slug = randomBytes(4).toString("hex");

  // Create organizer participant with token
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
    slug,
    title: input.title.trim(),
    notes: input.notes?.trim() || undefined,
    currency,
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

  return {
    round,
    organizerToken,
    organizerParticipant,
  };
};

export const getRoundsService = async (filter: {
  userId: Types.ObjectId;
  limit?: number;
}) => {
  const limit = Math.min(filter.limit || 20, 50);

  // Directly find rounds where the user is organizer or in participants
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

  // EXACTLY 1 QUERY TO FETCH EVERYTHING!
  const round = await Round.findOne(query).lean();
  if (!round) {
    throw new NotFoundError("Round");
  }

  // Compute live settlement in memory if not already settled
  let computedSettlement: unknown = round.settlement;
  if (
    !computedSettlement &&
    round.orders.length > 0 &&
    round.participants.length > 0
  ) {
    const participantIds = round.participants.map(
      (p: EmbeddedParticipant) => p._id,
    );
    const inputs: SettlementOrderInput[] = round.orders.map(
      (order: EmbeddedOrder) => {
        const activeItems = order.items.filter(
          (i: EmbeddedOrderItem) => i.status === "active",
        );
        return {
          orderId: order._id,
          storeName: order.storeSnapshot.name,
          subtotalCents: order.subtotalCents,
          adjustments: order.adjustments,
          participantIds,
          selections: activeItems.map((i: EmbeddedOrderItem) => ({
            participantId: i.participantId,
            unitPriceCents: i.unitPriceCents,
            quantity: i.quantity,
          })),
        };
      },
    );

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

    const perParticipantLines = round.participants.map(
      (p: EmbeddedParticipant) => {
        const line = settled.perParticipant.get(p._id.toString()) || {
          itemsCents: 0,
          adjustmentsCents: 0,
          totalCents: 0,
        };
        const paidCents = paidByParticipant.get(p._id.toString()) ?? 0;
        return {
          participantId: p._id,
          participantName: p.name,
          itemsCents: line.itemsCents,
          adjustmentsCents: line.adjustmentsCents,
          totalCents: line.totalCents,
          paidCents,
          outstandingCents: Math.max(0, line.totalCents - paidCents),
        };
      },
    );

    computedSettlement = {
      isLive: true,
      currency: round.currency,
      totalCents: settled.totalCents,
      orders: settled.orders,
      perParticipant: perParticipantLines,
    };
  }

  // Flatten selections for backwards compatibility with UI components
  const selections = round.orders.flatMap((order: EmbeddedOrder) =>
    order.items.map((item: EmbeddedOrderItem) => ({
      ...item,
      orderId: order._id,
      roundId: round._id,
      storeId: order.storeId,
    })),
  );

  return {
    ...round,
    shortlistStores: round.shortlist, // Already snapshotted!
    participants: round.participants.map((p: EmbeddedParticipant) => ({
      ...p,
      isOrganizer: round.organizer.participantId.equals(p._id),
    })),
    orders: round.orders,
    selections,
    settlementView: computedSettlement,
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
  if (!round) {
    throw new NotFoundError("Round");
  }

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

export const recalculateOrderTotals = (order: EmbeddedOrder) => {
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

  // Find store and item
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

  if (!foundItem) {
    throw new NotFoundError("Menu item");
  }

  const unitPriceCents = Math.round((foundItem.price ?? 0) * 100);

  // Find or create embedded order
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

  // Find or create item line
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
  round.status = deriveRoundStatus(round.orders, round.closesAt);
  round.markModified("orders");
  await round.save();

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

  let targetOrder: EmbeddedOrder | null = null;
  let targetItem: EmbeddedOrderItem | null = null;

  for (const order of round.orders) {
    const it = order.items.find((i: EmbeddedOrderItem) =>
      i._id.equals(selectionId),
    );
    if (it) {
      targetOrder = order;
      targetItem = it;
      break;
    }
  }

  if (!targetOrder || !targetItem) throw new NotFoundError("Selection");

  if (!isOrganizer && !targetItem.participantId.equals(participantId)) {
    throw new ForbiddenError("You can only modify your own selections");
  }

  const previousQty = targetItem.quantity;
  if (data.quantity !== undefined) {
    if (data.quantity <= 0) {
      return removeSelectionService(
        roundId,
        selectionId,
        participantId,
        isOrganizer,
      );
    }
    targetItem.quantity = data.quantity;
  }
  if (data.note !== undefined) {
    targetItem.note = data.note.trim() || null;
  }

  recalculateOrderTotals(targetOrder);
  round.status = deriveRoundStatus(round.orders, round.closesAt);
  round.markModified("orders");
  await round.save();

  if (data.quantity !== undefined && data.quantity !== previousQty) {
    await recordOrderEvent({
      roundId,
      orderId: targetOrder._id,
      actorParticipantId: participantId,
      actorRole: isOrganizer ? "organizer" : "participant",
      entity: "selection",
      entityId: targetItem.itemId,
      action: "quantity_changed",
      before: previousQty,
      after: targetItem.quantity,
      deltaCents:
        (targetItem.quantity - previousQty) * targetItem.unitPriceCents,
    });
  }

  return targetItem;
};

export const removeSelectionService = async (
  roundId: Types.ObjectId,
  selectionId: Types.ObjectId,
  participantId: Types.ObjectId,
  isOrganizer: boolean,
) => {
  const round = await Round.findById(roundId);
  if (!round) throw new NotFoundError("Round");

  let targetOrder: EmbeddedOrder | null = null;
  let targetItem: EmbeddedOrderItem | null = null;

  for (const order of round.orders) {
    const it = order.items.find((i: EmbeddedOrderItem) =>
      i._id.equals(selectionId),
    );
    if (it) {
      targetOrder = order;
      targetItem = it;
      break;
    }
  }

  if (!targetOrder || !targetItem) throw new NotFoundError("Selection");

  if (!isOrganizer && !targetItem.participantId.equals(participantId)) {
    throw new ForbiddenError("You can only remove your own selections");
  }

  targetItem.status = "removed";
  recalculateOrderTotals(targetOrder);
  round.status = deriveRoundStatus(round.orders, round.closesAt);
  round.markModified("orders");
  await round.save();

  await recordOrderEvent({
    roundId,
    orderId: targetOrder._id,
    actorParticipantId: participantId,
    actorRole: isOrganizer ? "organizer" : "participant",
    entity: "selection",
    entityId: targetItem.itemId,
    action: "selection_removed",
    before: targetItem.quantity,
    after: 0,
    deltaCents: -(targetItem.quantity * targetItem.unitPriceCents),
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

  let targetOrder: EmbeddedOrder | null = null;
  let targetItem: EmbeddedOrderItem | null = null;

  for (const order of round.orders) {
    const it = order.items.find((i: EmbeddedOrderItem) =>
      i._id.equals(selectionId),
    );
    if (it) {
      targetOrder = order;
      targetItem = it;
      break;
    }
  }

  if (!targetOrder || !targetItem) throw new NotFoundError("Selection");

  const previousPrice = targetItem.unitPriceCents;
  const restoringMenuPrice = unitPriceCents === targetItem.menuUnitPriceCents;

  targetItem.unitPriceCents = unitPriceCents;
  targetItem.priceOverridden = !restoringMenuPrice;

  recalculateOrderTotals(targetOrder);
  round.status = deriveRoundStatus(round.orders, round.closesAt);
  round.markModified("orders");
  await round.save();

  await recordOrderEvent({
    roundId,
    orderId: targetOrder._id,
    actorParticipantId,
    actorRole: "organizer",
    entity: "selection",
    entityId: targetItem.itemId,
    action: restoringMenuPrice ? "price_restored" : "price_overridden",
    field: "unitPriceCents",
    before: previousPrice,
    after: unitPriceCents,
    deltaCents: (unitPriceCents - previousPrice) * targetItem.quantity,
  });

  return unitPriceCents;
};

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

  const order = round.orders.find((o: EmbeddedOrder) => o._id.equals(orderId));
  if (!order) throw new NotFoundError("Order");

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
  round.status = deriveRoundStatus(round.orders, round.closesAt);
  round.markModified("orders");
  await round.save();

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

  const order = round.orders.find((o: EmbeddedOrder) => o._id.equals(orderId));
  if (!order) throw new NotFoundError("Order");

  const removed = order.adjustments.find((a: EmbeddedAdjustment) =>
    a._id.equals(adjustmentId),
  );
  if (!removed) throw new NotFoundError("Adjustment");

  order.adjustments = order.adjustments.filter(
    (a: EmbeddedAdjustment) => !a._id.equals(adjustmentId),
  );
  recalculateOrderTotals(order);
  round.status = deriveRoundStatus(round.orders, round.closesAt);
  round.markModified("orders");
  await round.save();

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

  const order = round.orders.find((o: EmbeddedOrder) => o._id.equals(orderId));
  if (!order) throw new NotFoundError("Order");

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

  round.status = deriveRoundStatus(round.orders, round.closesAt);
  round.markModified("orders");
  await round.save();

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

  const participantIds = round.participants.map(
    (p: EmbeddedParticipant) => p._id,
  );
  const inputs: SettlementOrderInput[] = round.orders.map(
    (order: EmbeddedOrder) => {
      const activeItems = order.items.filter(
        (i: EmbeddedOrderItem) => i.status === "active",
      );
      return {
        orderId: order._id,
        storeName: order.storeSnapshot.name,
        subtotalCents: order.subtotalCents,
        adjustments: order.adjustments,
        participantIds,
        selections: activeItems.map((i: EmbeddedOrderItem) => ({
          participantId: i.participantId,
          unitPriceCents: i.unitPriceCents,
          quantity: i.quantity,
        })),
      };
    },
  );

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

  const perParticipant: RoundSettlementLine[] = round.participants.map(
    (p: EmbeddedParticipant) => {
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
    },
  );

  round.settlement = {
    frozenAt: new Date(),
    currency: round.currency,
    orderTotalCents: settled.totalCents,
    perParticipant,
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
