# LunchRound — Database Design (v2)

Status: **applied** to the local and Atlas databases.

This document is the record of a one-time rebuild. The migration script, its
staging machinery, the pre-migration backups and the `migrations` ledger have all
been removed — none of it can usefully run again, and the shapes described below
are what the database holds today.

Every "before" number below was measured against the live database before the
migration ran. Nothing here is estimated.

---

## 1. What was wrong with v1

### 1.1 The schema and the data disagreed — data was being thrown away

Mongoose runs in strict mode and drops any field not declared in the schema.
The v1 schemas did not match what was actually stored:

| Problem | Evidence |
| --- | --- |
| Option modifiers stored snake_case, schema declared camelCase | 7,340 items had `price_impact` / `selected_by_default` / `price_info`; **0** had the camelCase names the schema expected. Every one of those price deltas was silently dropped on read. |
| `firstSeenAt` / `lastSeenAt` never declared | Present on all **104,033** items, absent from `ItemSchema`. Stripped on every read. |
| `rating` declared `String`, actually stored as Number | **609** stores hold a numeric rating; the other 697 hold a string. |
| `city` declared `required`, actually `null` | **6** stores have `city: null`. |

The database had no validators of its own — the shape was enforced only by
TypeScript, and the data had already drifted past it. v2 pushes enforcement into
the database with `$jsonSchema` validators.

### 1.2 The domain model was wrong, not just untidy

- **Ratings used two incompatible scales.** Glovo stored `"93%"`, Uber Eats
  stored `3.4`. Sorting by rating across platforms was meaningless. 296 stores
  had `rating: null`.
- **`category` was a constant.** All 1,306 stores carried the literal string
  `"RESTAURANT"`. The real classification lived in a free-text `tag` field with
  107 distinct spellings.
- **`city` was free text with 188 spellings for ~158 cities.** `ALICANTE`,
  `ALicante`, `Alicante`, `Alicante, Spain` and `alicante` were all distinct
  keys, so filtering by city missed most stores.
- **`deliveryTime` was the constant `"30-40 min"`.** `deliveryFee` was the
  string `"0.99 EUR"` — a number and a currency mashed into one unqueryable
  value.
- **`change_logs` recorded that things changed but not what.** 1,364 of the
  item events had `fields: []` — an empty diff. 71% of the audit trail was
  unusable.
- **`harvest_runs` could not report success or failure.** `runId` was an ISO
  timestamp string, `startedAt` equalled `importedAt`, and there was no status,
  no duration and no counts. (The collection was rebuilt with those fields, then
  dropped anyway — see §2.5.)

### 1.3 Redundant data that would eventually drift

| Duplication | Scale |
| --- | --- |
| `lat` / `lon` mirroring `geo.coordinates` | 1,306 stores (consistent today, one bad write from breaking it) |
| `itemKey` identical to `itemUuid` | 46,259 items |
| `name` identical to `nameText` | 104,033 items — 100% |
| `description` identical to `descriptionText` | 98,680 items |
| `currency: "EUR"` on every item | 104,033 items — one distinct value, zero information, plus its own index |
| `sectionTitle` + `sections[]` duplicating the `menu_sections` collection | 104,033 items stored section *titles* rather than IDs |
| `itemCount` / `sectionCount` counters | wrong on **124 of 1,306** stores |

### 1.4 Broken referential integrity

| Problem | Count |
| --- | --- |
| Items pointing at stores that do not exist | **7,145** (6.9% of all items) |
| Sections pointing at stores that do not exist | **1,089** |
| Change events pointing at stores that do not exist | **242** |

### 1.5 Indexing

- `items` carried **11 indexes**, several with no possible use: `currency_1`
  (one distinct value), `itemKey_1` and `itemUuid_1` (both subsumed by
  `{ storeId, itemKey }`).
- The documented `?search=` filter had **no text index** behind it.
- `change_logs` (3,843 docs) and `harvest_runs` (21 docs) had **no indexes at
  all** beyond `_id`.

---

## 2. The v2 design

### 2.1 Collections

| Collection | Status | Purpose |
| --- | --- | --- |
| `stores` | rebuilt | Store header **with the full menu embedded** |
| `platforms` | **new** | Per-platform metadata: display name, rating scale, currency |
| ~~`harvest_runs`~~ | **dropped** | Rebuilt with status/timing/counters, then dropped — see §2.6 |
| ~~`migrations`~~ | **dropped** | Migration ledger; removed with the migration itself |
| ~~`items`~~ | **dropped** | Now embedded in `stores.menu` |
| ~~`menu_sections`~~ | **dropped** | Now embedded in `stores.menu` |
| ~~`change_logs`~~ | **dropped** | See §2.5 — replaced, then dropped |
| ~~`change_events`~~ | **dropped** | Rebuilt from `change_logs`, then removed (see §2.5) |

### 2.2 Why the menu is embedded

The menu is always read as a unit — a store page needs its sections and their
items together. Splitting them across `items` + `menu_sections` bought nothing
and cost referential integrity (8,476 dangling documents). Embedding makes the
store document the single source of truth.

**This was verified as feasible before committing to it.** The largest store,
`glovo:162055` with 222 items, embeds to **0.78 MB** — about 20× under
MongoDB's 16 MB document limit, and no store exceeds 1 MB.

The trade-off is honest: global item queries (`?minPrice=`, `?isSoldOut=`)
become `menu.sections.items` multikey scans with an `$unwind` instead of a
plain `items` collection scan. At this data size that is comfortably fast, and
it is the cost of having one source of truth.

### 2.3 `stores` — target shape

```js
{
  _id: 'glovo:9500',                  // stable, unchanged
  slug: 'mcdonalds-ali',              // unique
  name: "McDonald's®",
  platform: 'glovo',                  // -> platforms._id
  externalId: '9500',                 // was platformStoreId
  url: 'https://...',
  currency: 'EUR',                    // single source for the whole menu

  taxonomy: {
    kind: 'restaurant',               // was the constant 'RESTAURANT'
    cuisines: ['american'],           // normalised from tag
    cuisineLabels: ['American'],      // display form
  },

  location: {
    country: 'ES',
    city: 'alicante',                 // normalised: 188 spellings -> 158
    cityLabel: 'Alicante',            // display form
    coordinates: { type: 'Point', coordinates: [-0.4901846, 38.353738] },
  },

  rating: {
    value: 3.87,                      // ALWAYS 0-5, normalised
    scale: 'percent',                 // source scale, kept for provenance
    votes: 1000,                      // parsed from '(1k+)' / '(101)'
    raw: '96%',                       // original text preserved
  },

  delivery: {
    fee: { amount: 0.99, currency: 'EUR' },   // was '0.99 EUR'
    eta: { min: 30, max: 40 },               // was '30-40 min'
    minOrder: { amount: null, currency: 'EUR' },
  },

  status: 'active',                   // 'active' | 'inactive'

  menu: {
    sections: [
      {
        key: 'sandwiches',            // stable slug, safe to join on
        title: 'Sandwiches',
        position: 0,
        items: [
          {
            _id: '<platform item key>',       // unique within the store
            externalId: '<uuid>',
            name: 'McPollo®',
            searchName: 'mcpollo',      // replaces the 100%-identical nameText
            description: '...',
            price: 5.45,
            imageUrl: 'https://...',
            available: true,             // replaces isSoldOut (reads positively)
            alsoInSections: [],          // membership beyond its primary section
            contentHash: '72c09e1b...',
            revision: 1,
            optionGroups: [
              {
                key: '...',
                name: '...',
                minSelect: 0, maxSelect: 3, multiple: false, required: false,
                options: [
                  { key: '...', name: 'extra Bacon',
                    priceDelta: 0.6,        // was price_impact — FIXED
                    selectedByDefault: false }, // was selected_by_default — FIXED
                ],
              },
            ],
            firstSeenAt: ISODate(...),
            lastSeenAt: ISODate(...),
          },
        ],
      },
    ],
  },

  stats: { itemCount: 173, sectionCount: 11 },   // recomputed from the menu
  provenance: { firstSeenAt, lastSeenAt },
  createdAt, updatedAt,
}
```

### 2.4 What each old field became

| v1 | v2 | Reason |
| --- | --- | --- |
| `category: 'RESTAURANT'` | `taxonomy.kind` | Constant carried no information |
| `tag: 'American'` | `taxonomy.cuisines` + `cuisineLabels` | Free text normalised, display kept |
| `city: 'ALicante'` | `location.city` + `location.cityLabel` | One filter key, one display value |
| `lat` + `lon` + `geo` | `location.coordinates` | Single GeoJSON point |
| `rating: '96%'` | `rating.value` (0-5) + `scale` + `raw` | Comparable across platforms, nothing lost |
| `ratingVotes: '(1k+)'` | `rating.votes: 1000` | Parsed to a number |
| `deliveryInfo.deliveryFee: '0.99 EUR'` | `delivery.fee.amount` + `currency` | Queryable money |
| `deliveryInfo.deliveryTime: '30-40 min'` | `delivery.eta.min` / `.max` | Structured range |
| `isActive: true` | `status: 'active'` | Enum, room for `suspended` |
| `itemCount` (wrong on 124 stores) | `stats.itemCount` | Recomputed during migration |
| `currency` on every item | `currency` on the store | 1 value, not 104,033 |
| `itemKey` + `itemUuid` | `items[]._id` + `items[].externalId` | No longer duplicated |
| `name` + `nameText` | `items[].name` + `searchName` | `searchName` is genuinely folded/diacritic-stripped |
| `sectionTitle` / `sections[]` | parent section + `alsoInSections` | Items live inside their section |
| `storeId` on items | implicit — the parent store | Cannot drift |
| `isSoldOut` | `available` | Reads positively |
| `itemHash` | `contentHash` | Clearer name |
| `optionGroups.options.price_impact` | `optionGroups.options.priceDelta` | camelCase, matches the schema |

### 2.5 `change_events` — built, then dropped

Worth recording because the reasoning is the point, not the outcome.

v1's `change_logs` recorded *that* something changed but never *what*. Its
`fields` array held bare names, and 1,364 of its item events carried an empty
array — so 71% of the item-level history said "something happened" and nothing
more. `runId` was a string matching no document, and the collection had no
indexes at all. It was rebuilt into `change_events` with structured diffs, a
real ObjectId reference to `harvest_runs`, and two indexes.

Then it was deleted, after measuring what was actually in it:

- **0 of 3,601 events held a real before/after value.** Every diff entry was
  `before: null, after: null`. The rebuild could not invent values the harvester
  never captured, so the collection could still not answer "what changed to".
- **Nothing read it.** No service, controller or route referenced it.
- **Nothing depended on it.** The order domain never referenced it.

A collection that resembles an audit trail but cannot produce one is worse than
no collection — it invites false confidence when someone goes looking for why a
price moved. `order_events` was built to do the job properly, recording real
`before`/`after` cents for every change that alters what someone owes.

### 2.6 `harvest_runs` was dropped too

It was first rebuilt into something usable — a status, real start/finish times, a
duration and per-run counters — then dropped a second time. The 21 documents
recorded when each menu was scraped and nothing else. `stores.provenance.lastRunId`
was the only link to them, and that field existed purely to point at them, so
nothing else in the database read it either.

Dropping it meant unsetting `provenance.lastRunId` on all 1,306 stores in the
same operation, so no store is left holding a reference to a collection that no
longer exists. `change_events` had carried a `runId` pointing into `harvest_runs`
too; the migration no longer writes it, for the same reason.

---

## 3. Index plan

Indexes are created for the queries the API actually serves, and nothing else.

**`stores`**

| Index | Serves |
| --- | --- |
| `{ slug: 1 }` unique | `GET /stores/:idOrSlug` |
| `{ platform: 1, externalId: 1 }` unique | Harvest upsert, platform lookup |
| `{ 'location.coordinates': '2dsphere' }` | `?lat=&lon=&radius=` |
| `{ status: 1, platform: 1, 'location.city': 1 }` | The main browse query |
| `{ 'location.country': 1, 'location.city': 1 }` | City browsing |
| `{ 'taxonomy.cuisines': 1 }` | `?cuisine=` |
| `{ 'rating.value': -1 }` | `?minRating=` (rated stores only) |
| `{ name: 'text', 'taxonomy.cuisineLabels': 'text' }` | `?search=` — the missing text index |
| `{ 'menu.sections.items.price': 1 }` | `?minPrice=` (multikey over the embedded menu) |
| `{ 'menu.sections.key': 1 }` | section lookup |

### Geo search uses `$geoNear`

Every non-geo list goes through `Store.paginate`. A geo search cannot, and the
reason is worth recording because both the obvious alternatives look workable.

`paginate()` issues a `find()`. `$geoWithin` would fit that — it works in
`find()` *and* `countDocuments()` — but it only filters, it does not order. The
result is that a geo list comes back sorted by the requested key, which for a
"restaurants near me" query means alphabetical: measured on a 5 km radius in
Alicante, 648 stores, and the genuinely nearest one (Rosemary, 58 m) lands on
**page 8 of 216**. The filter is correct; the answer just isn't ordered usefully.

`$near` is worse than useless. It only means anything when the query is *also*
sorted by distance, and a `find()` cannot be: sorting by `location.coordinates`
sorts the raw coordinate array rather than distance from the query point.

| | first three results |
| --- | --- |
| `$geoNear` (correct) | Rosemary 58 m, OAKBERRY 103 m, Oakberry Açaí 109 m |
| `find` + `$near` + `sort(geo)` | Burger King, Che'retas, WOKMAN — **and Che'retas twice** |

That form was not merely unsorted: it returned a duplicate row inside a single
page of five, and the same store appeared on both page 1 and page 2.
`countDocuments` rejects `$near` outright for the same reason — it has no way to
express the required sort.

`$geoNear` is the aggregation-stage form: it filters by distance, orders by
distance, and can be skipped, limited and counted. So a geo search runs two
aggregations (the page, and a `$count`) and hand-rolls its own `$skip`/`$limit`
and `totalPages`. That is the price of nearest-first ordering, and it is worth
paying: the alternative makes the endpoint return 648 stores in an order nobody
asked for.

`$text` cannot be combined with a geo operator in one query, so a geo search that
also passes `?search=` warns and drops the text clause rather than returning wrong
rows.



Dropped from the old design: `currency_1`, `itemKey_1`, `itemUuid_1`,
`price_1`, `isSoldOut_1`, `sectionTitle_1` — either zero-selectivity or
subsumed by a compound index.

---

## 4. Trade-offs accepted

- **Global item filtering is now a multikey scan.** `?minPrice=5` across all
  stores unwinds `menu.sections.items`. Slower than a dedicated `items`
  collection, and that is the deliberate price of one source of truth.
- **Whole-store rewrite on menu change.** Updating one item rewrites the store
  document. Correct for a harvested catalogue where a full menu arrives at
  once; wrong for a high-write OLTP workload.
- **`alsoInSections` is a within-document reference.** Section keys must stay
  unique per store. Atomicity makes this safe, unlike the v1 cross-collection
  version that had 8,476 orphans.
- **No TTL on `order_events`.** The money trail grows unbounded. Retention is a
  policy decision, so it is left open rather than silently deleting audit
  history.