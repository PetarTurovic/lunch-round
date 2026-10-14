# LunchRound — Round & Settlement Domain

How a lunch actually happens in the app, and how the data models it.

The catalogue side (stores, menus) is documented in
[database-design.md](./database-design.md). This covers the part the product is
actually *for*.

---

## 1. The flow

```
Organizer picks a shortlist of restaurants
        ↓
Creates a ROUND and shares its link
        ↓
Friends open the link, type a name, choose items
from the shortlist
        ↓
Organizer locks it, then settles it — the bill
is frozen
        ↓
Everyone sees what they owe, to the cent
```

---

## 2. The collection: one document per round

There is exactly **one** collection in this domain, `rounds`, and a round is a
single document. It owns:

| Field | Holds |
| --- | --- |
| `slug` | The share token in the link (8 hex chars, unique). |
| `organizer` | `{ participantId, name, userId }` — the organizer is an ordinary participant, not a special user. |
| `shortlist[]` | The restaurants on offer, as `{ _id, slug, name, platform, currency, rating, itemCount }` snapshots. |
| `items[]` | Every orderable item across the shortlist, `{ id, name, priceCents, storeId, storeName, section, imageUrl }`. Ids are `` `${storeId}:${itemId}` ``. |
| `participants[]` | The roster: `{ participantId, name, userId, isOrganizer }`. |
| `orders[]` | One row per person: `{ participantId, name, userId, tokenHash, quantities, joinedAt, updatedAt }`. |
| `feeCents` | The shared charge (delivery/tip) to allocate across the people. |
| `bill` | The frozen bill, written once at settlement. |
| `status` | `open | locked | ordered | settled`. |

A participant appears in both `participants[]` and `orders[]`. `participants`
is the roster (who is here); `orders` carries the basket and the token. Both
are keyed by the same `participantId`.

### Why one document and not five

An earlier design (still visible in the git history and in some prose) split
this across `rounds`, `participants`, `orders`, `selections` and `order_events`.
The shipped version embeds them instead, because:

- A lunch is small and bounded — a handful of people, dozens of items.
- Opening a share link is the hot path and it becomes **one** document read.
- The catalogue already showed what splitting a always-read-together unit
  costs: 8,476 dangling references and a join per view.

The honest cost: a round is capped by MongoDB's 16 MB document limit, and two
people editing at once hit the **same** document. §6 is how that is handled, and
it is the reason the write path is not a plain `save()`.

---

## 3. Money is integer cents

Every amount is an **integer number of cents**: `items[].priceCents`,
`feeCents`, `bill.totalCents`, `bill.people[].amountCents`.

Floating point cannot represent `0.10` exactly. Split a €23.45 bill three ways
and the naive result is `7.816666666666667` per person, which does not add up to
the total. On a settlement screen that is not a rounding curiosity — it is the
app telling three colleagues they owe numbers that do not reconcile, which is
exactly the problem the organizer was trying to solve.

Prices are converted once, at the edge, from the catalogue's decimal `price`
(`5.45`) to cents (`545`) when items are extracted from a store's menu. The
catalogue keeps decimals because that is what the platforms publish; the round
keeps integers because that is what gets added up.

**A round has exactly one currency.** It is taken from its shortlist and a
shortlist that mixes currencies is rejected at creation — one bill cannot add
pesos to euros.

---

## 4. The bill

`calculateRoundBill` in [../src/features/rounds/settlement.ts](../src/features/rounds/settlement.ts)
is a pure function over plain objects: no Mongoose, no database, so it can be
tested directly (see [../tests/settlement.test.ts](../tests/settlement.test.ts)).

For a round:

1. Each person's `foodCents` is the sum over their quantities of
   `priceCents × quantity`.
2. `feeCents` is allocated across participants **proportionally to what they
   ordered** — a delivery fee or tip follows the food.
3. `totalCents` is the sum of what the people owe, plus the allocated fee.

### Leftover cents are distributed, never dropped

Step 2 is the part that matters. `Math.round` on each share does not reconcile:
a 100¢ fee split three ways rounds to 33¢ each — 99¢ — while the total says
100¢. The allocation therefore uses the **largest-remainder method**: floor
every exact share, then hand the shortfall out one cent at a time to the largest
fractional parts, ties broken by position so the result is stable.

The same function covers the edge cases:

- **A fee where nobody ordered** (every weight zero) is spread evenly rather
  than dropped — the divide-by-zero case.
- **A fee where only one person ordered** puts the whole fee on that person;
  everyone else owes exactly 0.
- **A round with no participants** allocates no fee at all.

`totalCents` is *defined* as the sum of `people[].amountCents`, so the total and
the line items cannot disagree. The test suite asserts that invariant, including
across 500 randomised baskets.

---

## 5. Status

`status` moves `open → locked → settled` through the organizer's actions:

| Action | Effect |
| --- | --- |
| `POST /rounds/:id/join` | Only while `open`. |
| `POST /rounds/:id/order` | Only while `open`; the write itself is filtered on `open`, so a lock landing mid-request cannot be overwritten. |
| `PUT /rounds/:id/items`, `PATCH /rounds/:id` | Rejected once `settled`. |
| `POST /rounds/:id/lock` | Sets `locked`. |
| `POST /rounds/:id/settle` | Computes the bill, writes `bill`, `settlement` and `status: settled`. |

Settlement is a **freeze**: the computed per-person lines are written to the
document so a later edit cannot retroactively change what someone already paid.

---

## 6. Concurrent writes

A round is one mutable document, and the app's most common concurrent event is
several friends joining from the same shared link at once. A read-modify-write
(`round.save()`) would make that last-writer-wins: one participant silently
disappears, or the organizer's edit is lost.

So every mutation goes through
[../src/features/rounds/rounds.service.ts](../src/features/rounds/rounds.service.ts)
and is a targeted atomic update:

- **Joining** is `$push` — two simultaneous joins both land.
- **Saving a basket** is `$set` with `arrayFilters` on the one order row, and
  the query is filtered on `status: 'open'`.
- **Editing items / round fields** is `$set` of just the changed fields.
- **Locking and settling** are `$set` of status/bill.

The write for a participant's basket updates the `orders` row and the matching
`participants` row in the same operation via two array filters, so the roster
name and the basket name cannot drift apart.

---

## 7. Participants and tokens

A name alone proves nothing — anyone with a share link could claim to be Sam and
edit his basket. So joining issues a random 24-byte token, returned once, stored
only as a SHA-256 digest. Properties that are actually enforced:

- The digest is looked up by digest, never the raw token (which is never stored).
- `orders.tokenHash` carries a **unique** index — a duplicate digest is a bug,
  and an index makes it unrepresentable.
- The token is sent in the `X-Participant-Token` **header**. It is never read
  from the query string, where it would leak into access logs, proxies and
  browser history.
- A name must be unique within a round (case-insensitively). Two "Alex" rows
  make "what does Alex owe" unanswerable, so `join` rejects the second.

`POST /auth/claim` links a participant token to a signed-in account. One account
may hold only one seat in a round.

---

## 8. Indexes

| Index | Serves |
| --- | --- |
| `{ slug: 1 }` unique | opening the share link |
| `{ 'organizer.userId': 1, createdAt: -1 }` | "my rounds" |
| `{ 'orders.userId': 1, createdAt: -1 }` | "rounds I joined" |
| `{ 'orders.tokenHash': 1 }` unique | participant session lookup |
| `{ status: 1, closesAt: 1 }` | what is still open |

> **One-time note for an existing database.** Declaring an index in the schema
does not change an index that already exists under the same name: Mongoose sees
`orders.tokenHash_1`, finds a name match, and skips it — so an earlier
non-unique index keeps the field non-unique even after the schema says
`unique: true`. Applying the change to an existing database needs the old index
dropped once, after which startup recreates it correctly:
>
> ```js
> await db.collection('rounds').dropIndex('orders.tokenHash_1')
> ```
>
> Verified: with the stale index dropped, `orders.tokenHash_1` comes back
> `unique: true`, and there were no duplicate digests to block it.

---

## 9. Deliberate trade-offs

- **One currency per round.** A shortlist spanning two currencies is rejected
  rather than converted; there is no FX rate to convert at.
- **No per-item price override.** The organizer edits `items[].priceCents` for
  the whole round, not one person's line, and there is no `menuUnitPriceCents`
  trail recording that an edit happened. Adding that needs an audit record —
  see the note in [database-design.md](./database-design.md) §2.5 about why the
  old `change_events` was removed rather than kept as a plausible-looking
  audit trail that recorded nothing.
- **`feeCents` is a single proportional charge.** There is no typed adjustment
  list (tip vs delivery fee vs coupon) and no `equal`-allocation option.
- **The document is bounded.** Embedding caps a round at 16 MB and makes the
  whole round one write target; §6 is what keeps that safe.
