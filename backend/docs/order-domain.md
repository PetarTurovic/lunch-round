# LunchRound — Order & Settlement Domain

How a lunch actually happens in the app, and how the data models it.

The catalogue side (stores, menus, harvests) is documented in
[database-design.md](./database-design.md). This covers the part the product is
actually *for*.

---

## 1. The flow

```
Organizer picks a shortlist of restaurants
        ↓
Creates a ROUND and shares its link
        ↓
Friends open the link, type a name, pick a restaurant
from the shortlist and choose items
        ↓
Organizer locks it, orders, then edits prices and
adds a tip because the restaurant charged differently
        ↓
Everyone sees what they owe; organizer records what
has been paid back
```

---

## 2. Collections

| Collection | Holds |
| --- | --- |
| `rounds` | The share link. Owns the shortlist and the lifecycle. |
| `participants` | Who took part. Anonymous by default. |
| `orders` | One restaurant's order inside a round. |
| `selections` | What one person ordered from one restaurant. |
| `users` | Optional accounts, for people who want their history. |

### Why five and not fewer

A round **can** contain several orders, because the organizer offers a
shortlist and different people may pick different restaurants. Collapsing
`rounds` and `orders` into one collection would mean either losing that
distinction or stuffing a nested array of orders inside every round — the same
mistake the catalogue just paid for.

### Why `users` is separate from `participants`

Nobody in a work lunch is going to create an account to order a sandwich.
A participant is a name and a round. `users` exists only for the person who
*does* want to see their history, and a participant carries a nullable
`userId`. Linking one to the other retroactively reveals their past rounds
without ever asking for a login up front.

### The organizer is an ordinary participant

`rounds.organizer` stores a `participantId`, not a special user. The organizer
orders food too and owes the restaurant the same as everyone else, so "what
does the group owe" and "what does the organizer owe" stay the same shape of
question.

---

## 3. Shapes

### `rounds`

```js
{
  _id: ObjectId,
  slug: 'x7k2mq9',            // the share token, 6-32 chars [A-Za-z0-9_-]
  title: 'Friday lunch',
  notes: 'meet in the lobby at 1',
  currency: 'EUR',
  organizer: { participantId: ObjectId, name: 'Organizer', userId: null },
  shortlist: ['glovo:9500', 'ubereats:cS0...'],   // at least one, enforced
  status: 'open',             // open -> locked -> ordered -> settled
  closesAt: ISODate(...),
  settlement: null,           // frozen totals, written when settled
}
```

### `participants`

```js
{
  _id: ObjectId,
  roundId: ObjectId,
  userId: null,               // set later if this person signs up
  name: 'Alex',
  joinedAt: ISODate(...),
}
```

### `orders`

```js
{
  _id: ObjectId,
  roundId: ObjectId,
  storeId: 'glovo:9500',
  storeSnapshot: { name: "McDonald's®", slug: 'mcdonalds-ali' },
  status: 'open',
  currency: 'EUR',

  subtotalCents: 12150,
  adjustmentsCents: 449,      // tip + delivery fee - discounts
  totalCents: 12599,
  paidCents: 4000,

  adjustments: [
    { label: 'Tip',      type: 'tip',      amountCents: 250, allocation: 'proportional' },
    { label: 'Delivery', type: 'fee',      amountCents: 199, allocation: 'equal' },
    { label: 'Coupon',   type: 'discount', amountCents: 100, allocation: 'proportional' },
  ],
  payments: [
    { participantId: ObjectId, amountCents: 4000, method: 'bizum', receivedAt: ISODate(...) },
  ],
}
```

`adjustments[].allocation` is the interesting bit. A **tip** is normally
`proportional` — it follows what each person ate. A **delivery fee** is normally
`equal` — everyone ate from the same delivery. The organizer picks per charge.

### `selections`

```js
{
  _id: ObjectId,
  orderId: ObjectId,
  participantId: ObjectId,
  roundId: ObjectId,          // denormalised: settlement needs it in one query

  storeId: 'glovo:9500',
  itemId: 'f8aa4313-...',     // into the store's embedded menu
  itemSnapshot: { name: 'McPollo®', imageUrl: '...' },

  quantity: 2,

  menuUnitPriceCents: 545,    // what the menu said
  unitPriceCents: 680,        // what is actually charged
  priceOverridden: true,      // the organizer edited it

  status: 'active',
}
```

This is where "he can edit the price of the item" lives. `unitPriceCents` is
the charge; `menuUnitPriceCents` is what the catalogue said; the flag says
which. Keeping both means the UI can show "edited from €5.45" and the
settlement never has to guess.

`itemSnapshot` matters more than it looks: without it, the next harvest would
silently rewrite what someone ordered last month and change what they owe.

---

## 4. The money rule

**Every amount in the order domain is an integer number of cents.** There is no
float money anywhere in these five collections.

Floating point cannot represent `0.10` exactly. Split a €23.45 bill three ways
and the naive result is `7.816666666666667` per person, which does not add up
to the total. On a settlement screen that is not a rounding curiosity — it is
the app telling three people they owe numbers that do not reconcile, which is
exactly the problem the organizer was trying to solve.

The `$jsonSchema` validators reject fractional cents at the database:

```js
totalCents: { bsonType: 'int', minimum: 0 }
```

`bsonType: 'int'` is doing real work there. It means a bad write cannot get in
even if it bypasses the TypeScript.

Prices are converted once, at the edge, from the catalogue's decimal `price`
(`5.45`) to cents (`545`). The catalogue keeps decimals because that is what
the platforms publish; the order domain keeps integers because that is what
gets added up.

---

## 5. The settlement algorithm

`src/features/orders/orders.settlement.ts`. It is a pure function over plain
objects, with no database access, so it can be tested directly.

For one order:

1. Each participant's `itemsCents` is the sum over their active selections of
   `unitPriceCents × quantity`.
2. Each adjustment is allocated across participants:
   - `proportional` — weighted by each participant's `itemsCents`
   - `equal` — weighted by 1
3. `discount` subtracts; `tip` and `fee` add.
4. **Leftover cents are distributed, never dropped.**

Step 4 is the part that matters. Flooring each share loses up to one cent per
participant, and those cents have to go somewhere or the round does not
reconcile. The allocation uses the largest-remainder method: floor
everything, then hand the shortfall out one cent at a time to the largest
fractional parts, ties broken by position so the result is stable.

Verified by `npx tsx scripts/verify-settlement.ts`, which covers the cases that
break naive division — a 100c tip over weights 1:2:3 (shares of 17/33/50),
a 199c fee split between two people, an equal fee where one participant
ordered nothing, a proportional fee with a zero subtotal (the divide-by-zero
case), and a discount driving the total below the subtotal.

---

## 6. Indexes

| Collection | Index | Serves |
| --- | --- | --- |
| `rounds` | `{ slug: 1 }` unique | opening the share link |
| | `{ 'organizer.userId': 1, createdAt: -1 }` | "my rounds" |
| | `{ status: 1, closesAt: 1 }` | what is still open |
| `participants` | `{ roundId: 1, joinedAt: 1 }` | the round roster |
| | `{ roundId: 1, userId: 1 }` unique **partial** | one participant per account per round |
| | `{ userId: 1, joinedAt: -1 }` | "rounds I have joined" |
| `orders` | `{ roundId: 1, createdAt: 1 }` | the round as a list |
| `selections` | `{ orderId: 1, participantId: 1, status: 1 }` | **the settlement query** |
| | `{ orderId: 1, participantId: 1, itemId: 1 }` unique | one line per item |
| `users` | `{ email: 1 }` unique | sign-in |

### That partial index is not a detail

`{ roundId, userId }` **cannot** be `sparse`. A sparse index only skips
documents where the field is *missing*, but anonymous participants store
`userId: null` explicitly — which is present, not missing. Under a sparse
unique index, the second anonymous participant in a round collides on the
unique key. This is not theoretical; it is exactly what happened the first
time the smoke test ran.

It has to be a partial index that only covers real user references:

```js
{ key: { roundId: 1, userId: 1 }, unique: true,
  partialFilterExpression: { userId: { $type: 'objectId' } } }
```

---

## 7. Settling and freezing

### `rounds.status` is derived, never authored

A round's status is computed from its orders by `deriveRoundStatus` and written
by `refreshRoundStatusService` — the only writer of the field. Nothing decides it
directly. A stored status that could be set independently of the orders it
summarises is representable, and once it drifts (`rounds: 'settled'` while an
`order` is still `open`) the organizer has no reliable view of what anyone is
doing.

The rules, in order:

| Condition | Result |
| --- | --- |
| no orders, or every order cancelled, deadline passed | `locked` |
| no orders, or every order cancelled, deadline not passed | `open` |
| any live order still `open` | `open` |
| live orders are a mix of `locked`/`ordered`/`settled` | `locked` |
| every live order `ordered`, not all fully paid | `ordered` |
| every live order fully paid | `settled` |

Cancelled orders are excluded before any of this: cancelling one order in an
otherwise-settled round must not drag the round back.

### Freezing

When the organizer marks a round `settled`, the computed per-participant lines
are written to `rounds.settlement`. After that the numbers are frozen, so a
late edit to a selection cannot retroactively change what someone already paid.
The settlement view then always has two sources: the live computation while
the round is open, and the frozen snapshot afterwards.

---

## 8. Deliberate trade-offs

- **No foreign keys.** MongoDB has none. `selections.roundId` is denormalised
  deliberately so the settlement view is one query instead of a join, and the
  round id can never disagree with its order's because it is written from it.
- **Denormalised totals on `orders`.** The organizer needs a running total
  while editing, and every edit rewrites one document rather than summing every
  selection per keystroke. `settleOrder` trusts its own arithmetic over the
  stored subtotal for this reason.
- **No `payments` collection.** Payments are small, always read with their
  order, and never queried across orders. Embedding them avoids a collection
  for what would be a four-field document.
- **`order_events` covers the money, not everything else.** It records the
  changes that alter what someone owes — price overrides, tips, adjustments,
  payments. Cosmetic edits (a typo in a title, a reordered shortlist) are not
  evented; `updatedAt` on the document is the record for those.