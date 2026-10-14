import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateCents, calculateRoundBill, toCents } from "../src/features/rounds/settlement";

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

test("allocateCents distributes the shortfall to the largest remainder", () => {
  // 100c over weights 1:2:3 -> exact 16.67 / 33.33 / 50; floors lose one cent.
  assert.deepEqual(allocateCents(100, [1, 2, 3]), [17, 33, 50]);
});

test("allocateCents always sums to the amount", () => {
  assert.equal(sum(allocateCents(199, [1, 1])), 199);
  assert.equal(sum(allocateCents(199, [1, 2])), 199);
  assert.equal(sum(allocateCents(100, [1, 1, 1])), 100);
  assert.equal(sum(allocateCents(7, [1, 1, 1, 1, 1])), 7);
});

test("allocateCents spreads evenly when every weight is zero", () => {
  // A fee on a round where nobody has ordered: the divide-by-zero case.
  const shares = allocateCents(100, [0, 0, 0]);
  assert.equal(sum(shares), 100);
  assert.ok(Math.max(...shares) - Math.min(...shares) <= 1);
  assert.deepEqual(allocateCents(0, [0, 0]), [0, 0]);
  assert.deepEqual(allocateCents(50, []), []);
});

test("calculateRoundBill reconciles the per-person amounts with the total", () => {
  const round = {
    items: [
      { id: "a", priceCents: 1000 },
      { id: "b", priceCents: 1000 },
      { id: "c", priceCents: 1000 },
    ],
    orders: [
      { name: "A", quantities: { a: 1 } },
      { name: "B", quantities: { b: 1 } },
      { name: "C", quantities: { c: 1 } },
    ],
    feeCents: 100,
  };

  const bill = calculateRoundBill(round);
  assert.equal(bill.totalCents, 3100);
  assert.equal(sum(bill.people.map((p) => p.amountCents)), bill.totalCents);
  assert.deepEqual(
    bill.people.map((p) => p.amountCents),
    [1034, 1033, 1033],
  );
});

test("calculateRoundBill reconciles a 199c fee between two people", () => {
  const bill = calculateRoundBill({
    items: [
      { id: "a", priceCents: 1000 },
      { id: "b", priceCents: 1000 },
    ],
    orders: [
      { name: "A", quantities: { a: 1 } },
      { name: "B", quantities: { b: 1 } },
    ],
    feeCents: 199,
  });

  assert.equal(sum(bill.people.map((p) => p.amountCents)), bill.totalCents);
  assert.equal(bill.totalCents, 2199);
});

test("calculateRoundBill puts the whole fee on whoever ordered when only one did", () => {
  const bill = calculateRoundBill({
    items: [{ id: "a", priceCents: 500 }],
    orders: [
      { name: "A", quantities: { a: 1 } },
      { name: "B", quantities: {} },
    ],
    feeCents: 199,
  });

  assert.equal(bill.totalCents, 699);
  assert.equal(sum(bill.people.map((p) => p.amountCents)), 699);
  assert.equal(bill.people.find((p) => p.name === "B")?.amountCents, 0);
});

test("calculateRoundBill charges no fee when nobody is in the round", () => {
  const bill = calculateRoundBill({ items: [], orders: [], feeCents: 250 });
  assert.equal(bill.totalCents, 0);
  assert.equal(bill.people.length, 0);
});

test("calculateRoundBill stays reconciled across random baskets", () => {
  for (let run = 0; run < 500; run++) {
    const items = Array.from({ length: 1 + Math.floor(Math.random() * 6) }, (_, i) => ({
      id: `i${i}`,
      priceCents: Math.floor(Math.random() * 2000),
    }));
    const orders = Array.from({ length: Math.floor(Math.random() * 6) }, (_, i) => ({
      name: `P${i}`,
      quantities: Object.fromEntries(
        items.map((item) => [item.id, Math.floor(Math.random() * 4)]),
      ),
    }));

    const bill = calculateRoundBill({ items, orders, feeCents: Math.floor(Math.random() * 900) });
    assert.equal(
      sum(bill.people.map((p) => p.amountCents)),
      bill.totalCents,
      `run ${run} did not reconcile`,
    );
  }
});

test("toCents coerces bad input to a non-negative integer", () => {
  assert.equal(toCents(5.4), 5);
  assert.equal(toCents(-3), 0);
  assert.equal(toCents(undefined), 0);
  assert.equal(toCents("12"), 12);
});
