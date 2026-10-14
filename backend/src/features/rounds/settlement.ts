/**
 * Settlement maths for a round. Pure functions over plain shapes: no database
 * access, no Mongoose, so the money rules can be tested directly.
 *
 * The invariant every function here preserves: the per-person amounts sum to
 * the bill total, to the cent. Flooring each share silently drops up to one
 * cent per participant, which is the exact failure this module exists to
 * prevent (see docs/order-domain.md §4-§5).
 */

export interface SettlementItem {
  id: string;
  priceCents?: number | null;
}

export interface SettlementOrder {
  name: string;
  quantities?: Record<string, number> | null;
}

export interface SettlementInput {
  items?: SettlementItem[] | null;
  orders?: SettlementOrder[] | null;
  feeCents?: number | null;
}

export interface BillPerson {
  name: string;
  amountCents: number;
}

export interface RoundBill {
  settledAt: Date;
  totalCents: number;
  people: BillPerson[];
}

/** Coerce anything to a non-negative integer number of cents. */
export const toCents = (value: unknown): number => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/**
 * Split `amountCents` across `weights` using the largest-remainder method:
 * floor every exact share, then hand the shortfall out one cent at a time to
 * the largest fractional parts, ties broken by position so the result is
 * stable. The returned shares always sum to `amountCents` exactly.
 *
 * When every weight is zero (a fee on a round nobody has ordered in yet) the
 * amount is spread evenly rather than dropped, which is the divide-by-zero
 * case the old `Math.round` implementation got wrong.
 */
export const allocateCents = (amountCents: number, weights: number[]): number[] => {
  const count = weights.length;
  if (count === 0) return [];

  const amount = toCents(amountCents);
  const shares = new Array<number>(count).fill(0);
  if (amount === 0) return shares;

  const safeWeights = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0));
  const totalWeight = safeWeights.reduce((sum, w) => sum + w, 0);

  const remainders: { index: number; fraction: number }[] = [];
  let allocated = 0;
  for (let i = 0; i < count; i++) {
    const exact = totalWeight > 0 ? (amount * safeWeights[i]) / totalWeight : 0;
    const floor = Math.floor(exact);
    shares[i] = floor;
    allocated += floor;
    remainders.push({ index: i, fraction: exact - floor });
  }

  let leftover = amount - allocated;
  remainders.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let k = 0; k < remainders.length && leftover > 0; k++) {
    shares[remainders[k].index] += 1;
    leftover -= 1;
  }

  // Safety net for the zero-weight case, where more cents remain than there
  // are fractional parts to award.
  for (let i = 0; leftover > 0; i = (i + 1) % count) {
    shares[i] += 1;
    leftover -= 1;
  }

  return shares;
};

/**
 * Builds the frozen bill for a round. `totalCents` is defined as the sum of
 * what the people owe, not an independently computed number, so the two can
 * never disagree.
 */
export const calculateRoundBill = (round: SettlementInput): RoundBill => {
  const priceMap = new Map((round.items ?? []).map((item) => [item.id, toCents(item.priceCents)]));
  const orders = round.orders ?? [];

  const peopleFood = orders.map((order) => {
    const quantities = order.quantities ?? {};
    const foodCents = Object.entries(quantities).reduce(
      (sum, [itemId, qty]) => sum + toCents(qty) * (priceMap.get(itemId) ?? 0),
      0,
    );
    return { name: order.name, foodCents };
  });

  const totalFoodCents = peopleFood.reduce((sum, person) => sum + person.foodCents, 0);
  const feeShares = allocateCents(toCents(round.feeCents), peopleFood.map((p) => p.foodCents));
  const allocatedFeeCents = feeShares.reduce((sum, share) => sum + share, 0);

  const people: BillPerson[] = peopleFood.map((person, index) => ({
    name: person.name,
    amountCents: person.foodCents + (feeShares[index] ?? 0),
  }));

  return {
    settledAt: new Date(),
    totalCents: totalFoodCents + allocatedFeeCents,
    people,
  };
};
