import { Types } from 'mongoose';
import { Round } from './rounds.model';
import type { RoundStatus } from './rounds.model';
import { Order } from '../orders/orders.model';
import { Selection } from '../selections/selections.model';
import { Participant } from '../participants/participants.model';
import { OrderEvent } from '../order-events/order-events.model';

export interface OrderStatusLike {
  status: string;
  paidCents: number;
  totalCents: number;
}

export const deriveRoundStatus = (
  orders: OrderStatusLike[],
  closesAt?: Date | null,
): RoundStatus => {
  const live = orders.filter((order) => order.status !== 'cancelled');
  if (live.length === 0) {
    return closesAt && closesAt.getTime() < Date.now() ? 'locked' : 'open';
  }

  if (live.some((order) => order.status === 'open')) return 'open';

  if (!live.every((order) => order.status === 'ordered')) return 'locked';
  return live.every((order) => order.paidCents >= order.totalCents) ? 'settled' : 'ordered';
};

export const refreshRoundStatusService = async (roundId: Types.ObjectId) => {
  const orders = await Order.find({ roundId }).select('status paidCents totalCents').lean();
  const round = await Round.findById(roundId).select('closesAt').lean();
  if (!round) return null;

  const status = deriveRoundStatus(orders, round.closesAt);
  await Round.updateOne({ _id: roundId }, { $set: { status } });
  return status;
};

export const deleteRoundCascadeService = async (
  roundId: Types.ObjectId,
): Promise<{ round: number; orders: number; selections: number; participants: number; events: number }> => {
  const [selections, ordersDeleted, participants, events, round] = await Promise.all([
    Selection.deleteMany({ roundId }),
    Order.deleteMany({ roundId }),
    Participant.deleteMany({ roundId }),
    OrderEvent.deleteMany({ roundId }),
    Round.deleteOne({ _id: roundId }),
  ]);

  return {
    round: round.deletedCount ?? 0,
    orders: ordersDeleted.deletedCount ?? 0,
    selections: selections.deletedCount ?? 0,
    participants: participants.deletedCount ?? 0,
    events: events.deletedCount ?? 0,
  };
};

export const countDanglingReferencesService = async (
  roundId: Types.ObjectId,
) => {
  const [orders, selections, participants, events] = await Promise.all([
    Order.countDocuments({ roundId }),
    Selection.countDocuments({ roundId }),
    Participant.countDocuments({ roundId }),
    OrderEvent.countDocuments({ roundId }),
  ]);
  return { orders, selections, participants, events, total: orders + selections + participants + events };
};