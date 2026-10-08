import { useState, useMemo, useEffect, useRef, type FormEvent, type ReactNode } from "react";
import { euro, initials, safeNumber } from "../../utils";
import type { OrderMenuItem, Participant, ParticipantOrder, Round, User } from "../../types";

const dishColorClasses = [
  "bg-amber-100 text-amber-900 border-amber-200",
  "bg-emerald-100 text-emerald-900 border-emerald-200",
  "bg-sky-100 text-sky-900 border-sky-200",
  "bg-purple-100 text-purple-900 border-purple-200",
  "bg-rose-100 text-rose-900 border-rose-200",
  "bg-indigo-100 text-indigo-900 border-indigo-200"
];

const teamAvatarClasses = [
  "bg-emerald-100 text-emerald-800",
  "bg-purple-100 text-purple-800",
  "bg-sky-100 text-sky-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800"
];

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <article className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </article>
  );
}

function DishThumbnail({ item, index }: { item: OrderMenuItem; index: number }) {
  if (item.imageUrl) {
    return (
      <img
        src={item.imageUrl}
        alt={item.name}
        className="h-12 w-12 shrink-0 rounded-lg object-cover border border-stone-200"
        loading="lazy"
      />
    );
  }

  const colorClass = dishColorClasses[index % dishColorClasses.length];
  return (
    <span
      className={`grid h-12 w-12 shrink-0 place-items-center rounded-lg border font-display text-xs font-bold ${colorClass}`}
      aria-hidden="true"
    >
      {initials(item.name)}
    </span>
  );
}

interface OrderLunchProps {
  round: Round | null;
  items: OrderMenuItem[];
  orders: ParticipantOrder[];
  currentOrder: ParticipantOrder;
  participant: Participant | null;
  isOrganizer: boolean;
  locked: boolean;
  hasDeadline: boolean;
  countdown?: string;
  timeLabel: string;
  hours: number;
  minutes: number;
  loading: boolean;
  user?: User | null;
  onSubmitOrder: (name: string, quantities: Record<string, number>) => Promise<void>;
  onClearOrder: () => Promise<void>;
  onNavigateBill: () => void;
  onNavigateOrganize?: () => void;
  onNewRound: () => Promise<void>;
  onRefresh?: () => Promise<void>;
}

type SortOption = "default" | "price-asc" | "price-desc" | "name-asc";
type SidebarTab = "your-order" | "team-orders";

function OrderLunch({
  round,
  items,
  orders,
  currentOrder,
  participant,
  isOrganizer,
  locked,
  hasDeadline,
  countdown,
  timeLabel,
  loading,
  user,
  onSubmitOrder,
  onClearOrder,
  onNavigateBill,
  onNavigateOrganize,
  onRefresh
}: OrderLunchProps) {
  // Staged local quantities for instantaneous, snappy feedback
  const [stagedQuantities, setStagedQuantities] = useState<Record<string, number>>(() => currentOrder.quantities || {});
  const [name, setName] = useState<string>(() => participant?.name || user?.name || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  // Search, filter, and sorting
  const [search, setSearch] = useState("");
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>("all");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("your-order");
  const [refreshing, setRefreshing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const currency = round?.currency || "EUR";

  // Sync staged quantities whenever backend order changes
  useEffect(() => {
    setStagedQuantities(currentOrder.quantities || {});
  }, [currentOrder.quantities]);

  // Sync participant / user name
  useEffect(() => {
    if (participant?.name) {
      setName(participant.name);
    } else if (user?.name && !name) {
      setName(user.name);
    }
  }, [participant?.name, user?.name]);

  // Available sections across all items
  const availableSections = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.section) set.add(item.section);
    }
    return Array.from(set).sort();
  }, [items]);

  // Staged items list (only items with qty > 0)
  const stagedItems = useMemo(() => {
    return items
      .filter((item) => safeNumber(stagedQuantities[item.id]) > 0)
      .map((item) => ({
        ...item,
        quantity: safeNumber(stagedQuantities[item.id])
      }));
  }, [items, stagedQuantities]);

  const totalStagedCount = useMemo(() => {
    return stagedItems.reduce((sum, item) => sum + item.quantity, 0);
  }, [stagedItems]);

  const stagedFoodTotal = useMemo(() => {
    return stagedItems.reduce((sum, item) => sum + item.quantity * safeNumber(item.price), 0);
  }, [stagedItems]);

  // Check if participant has an already submitted order in the database
  const hasSubmittedOrder = Boolean(
    participant &&
    Object.values(currentOrder.quantities || {}).some((qty) => safeNumber(qty) > 0)
  );

  // Check if staged quantities differ from the backend saved order
  const hasUnsavedChanges = useMemo(() => {
    const saved = currentOrder.quantities || {};
    const allIds = new Set([...Object.keys(stagedQuantities), ...Object.keys(saved)]);
    for (const id of allIds) {
      if (safeNumber(stagedQuantities[id]) !== safeNumber(saved[id])) {
        return true;
      }
    }
    return false;
  }, [stagedQuantities, currentOrder.quantities]);

  // Filter and sort items
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((item) => {
        if (selectedStoreFilter !== "all" && item.storeId !== selectedStoreFilter && item.storeName !== selectedStoreFilter) {
          return false;
        }
        if (selectedSectionFilter !== "all" && item.section !== selectedSectionFilter) {
          return false;
        }
        if (!q) return true;
        return (
          item.name.toLowerCase().includes(q) ||
          (item.description || "").toLowerCase().includes(q) ||
          (item.storeName || "").toLowerCase().includes(q) ||
          (item.section || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === "price-asc") return safeNumber(a.price) - safeNumber(b.price);
        if (sortBy === "price-desc") return safeNumber(b.price) - safeNumber(a.price);
        if (sortBy === "name-asc") return a.name.localeCompare(b.name);
        return 0;
      });
  }, [items, search, selectedStoreFilter, selectedSectionFilter, sortBy]);

  // Group filtered items by section for clean restaurant menu presentation
  const groupedSections = useMemo(() => {
    const map = new Map<string, OrderMenuItem[]>();
    for (const item of filteredItems) {
      const sectionName = item.section?.trim() || "Main Menu";
      if (!map.has(sectionName)) {
        map.set(sectionName, []);
      }
      map.get(sectionName)!.push(item);
    }
    return Array.from(map.entries());
  }, [filteredItems]);

  // Local stepper adjustments: instant and reactive
  function handleStep(itemId: string, nextQty: number) {
    if (locked) return;
    setStagedQuantities((prev) => {
      const next = { ...prev };
      if (nextQty > 0) {
        next[itemId] = nextQty;
      } else {
        delete next[itemId];
      }
      return next;
    });
  }

  async function handleRefresh() {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSubmit(e?: FormEvent) {
    if (e) e.preventDefault();
    if (locked) return;

    const orderName = (name || participant?.name || user?.name || "").trim();
    if (!orderName) {
      setIsEditingName(true);
      window.setTimeout(() => nameInputRef.current?.focus(), 50);
      return;
    }

    await onSubmitOrder(orderName, stagedQuantities);
    setJustSubmitted(true);
    setIsEditingName(false);
    window.setTimeout(() => setJustSubmitted(false), 3500);
  }

  async function handleClearOrder() {
    if (!window.confirm("Remove all items and clear your order?")) return;
    setStagedQuantities({});
    if (hasSubmittedOrder) {
      await onClearOrder();
    }
  }

  function scrollToTray() {
    trayRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Calculate team orders summary
  const teamOrdersSummary = useMemo(() => {
    return orders.map((order) => {
      const picks: { item: OrderMenuItem; quantity: number }[] = [];
      let totalCents = 0;

      for (const item of items) {
        const qty = safeNumber(order.quantities[item.id]);
        if (qty > 0) {
          picks.push({ item, quantity: qty });
          totalCents += Math.round(safeNumber(item.price) * 100) * qty;
        }
      }

      return {
        id: order.id,
        name: order.name,
        picks,
        totalFood: totalCents / 100,
        itemCount: picks.reduce((sum, p) => sum + p.quantity, 0),
        isCurrent: Boolean(participant?._id && String(participant._id) === String(order.id))
      };
    });
  }, [orders, items, participant?._id]);

  const totalTeamItems = useMemo(() => {
    return teamOrdersSummary.reduce((sum, o) => sum + o.itemCount, 0);
  }, [teamOrdersSummary]);

  const totalTeamSpend = useMemo(() => {
    return teamOrdersSummary.reduce((sum, o) => sum + o.totalFood, 0);
  }, [teamOrdersSummary]);

  // Display name resolution
  const effectiveDisplayName = (name || participant?.name || user?.name || "").trim();

  // EMPTY ROUND STATE: No round loaded
  if (!round) {
    return (
      <section className="mx-auto max-w-2xl pt-9">
        <div className="mb-7">
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
            TEAM LUNCH ORDERING
          </div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
            Order <span className="text-lunch">lunch.</span>
          </h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">
            Join your team's lunch round to browse restaurant dishes, make your selection, and split the bill.
          </p>
        </div>

        <Card className="text-center py-10">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-2xl text-amber-700 border border-amber-200">
            🍽️
          </div>
          <h2 className="mb-1 font-display text-base font-bold text-stone-800">
            No Lunch Round Selected
          </h2>
          <p className="mx-auto mb-6 max-w-md text-xs leading-relaxed text-stone-500">
            To place an order, open the shared link provided by your lunch organizer, or create a new team round.
          </p>
          {onNavigateOrganize && (
            <button
              type="button"
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-lunch px-5 text-xs font-semibold text-white shadow-sm hover:bg-lunch-dark transition"
              onClick={onNavigateOrganize}
            >
              Organize a new lunch round →
            </button>
          )}
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl pt-9 pb-16">
      {/* 1. TOP HEADER & LIVE STATUS */}
      <div className="mb-6 flex items-end justify-between gap-5 max-sm:flex-col max-sm:items-start">
        <div>
          <div className="mb-2.5 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
            TEAM ORDERING
          </div>
          <h1 className="mb-1.5 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
            {round.title} <span className="text-lunch">menu.</span>
          </h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">
            {locked
              ? `Ordering closed at ${timeLabel}. Menus and selections are in read-only mode.`
              : "Choose your dishes from the restaurant menu below and submit your picks to the organizer."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-50 transition"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? "Refreshing…" : "↻ Refresh menu"}
            </button>
          )}

          {/* Status pill with deadline info */}
          <span
            className={`inline-flex min-h-8 items-center gap-2 rounded-full border px-3.5 text-[10px] font-semibold ${
              locked
                ? "border-stone-300 bg-stone-100 text-stone-700"
                : "border-green-300 bg-green-50 text-green-800"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ring-4 ${
                locked ? "bg-stone-500 ring-stone-200" : "bg-green-500 ring-green-100 animate-pulse"
              }`}
            />
            {locked ? (
              <span>Ordering closed</span>
            ) : hasDeadline && countdown ? (
              <span>Closes in {countdown}</span>
            ) : (
              <span>Open for orders</span>
            )}
          </span>
        </div>
      </div>

      {/* 2. IDENTITY BANNER: Clear "Ordering As" Logic */}
      <div className="mb-6 rounded-xl border border-stone-200 bg-stone-50/80 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-lunch text-xs font-bold text-white shadow-sm">
            {initials(effectiveDisplayName || "G")}
          </span>

          {isEditingName ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) setIsEditingName(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={nameInputRef}
                type="text"
                className="h-8 rounded-lg border border-stone-300 bg-white px-2.5 text-xs text-stone-800 outline-none focus:border-green-500"
                placeholder="Enter your full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                required
              />
              <button
                type="submit"
                className="h-8 rounded-lg bg-lunch px-3 text-[11px] font-semibold text-white hover:bg-lunch-dark"
              >
                Save
              </button>
              <button
                type="button"
                className="h-8 px-2 text-[11px] text-stone-500 hover:text-stone-800"
                onClick={() => {
                  setName(participant?.name || user?.name || "");
                  setIsEditingName(false);
                }}
              >
                Cancel
              </button>
            </form>
          ) : (
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Ordering as</span>
                <strong className="text-stone-900 font-semibold">
                  {effectiveDisplayName || "Guest (Click to set name)"}
                </strong>
                {participant?.isOrganizer || isOrganizer ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-800">
                    Organizer
                  </span>
                ) : null}
              </div>
              <span className="text-[10px] text-stone-500">
                {effectiveDisplayName
                  ? "Your dishes will be listed under this name on the team bill."
                  : "Please enter your name so the organizer knows who placed this order."}
              </span>
            </div>
          )}
        </div>

        {!isEditingName && !locked && (
          <button
            type="button"
            className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-stone-700 hover:bg-stone-50 transition"
            onClick={() => {
              setIsEditingName(true);
              window.setTimeout(() => nameInputRef.current?.focus(), 50);
            }}
          >
            {effectiveDisplayName ? "✎ Change name" : "Set your name"}
          </button>
        )}
      </div>

      {/* 3. LOCKED READ-ONLY NOTICE */}
      {locked && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-stone-200 bg-stone-100 p-4 text-xs text-stone-700">
          <div className="flex items-center gap-2.5">
            <span className="text-lg">🔒</span>
            <span>
              <strong>Orders are locked.</strong> The organizer is calculating final shares. Selections are now read-only.
            </span>
          </div>
          <button
            type="button"
            className="rounded-lg bg-white border border-stone-300 px-3.5 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 shadow-sm transition"
            onClick={onNavigateBill}
          >
            View final bill & shares →
          </button>
        </div>
      )}

      {/* 4. MAIN LAYOUT: MENU (LEFT) + ORDER TRAY (RIGHT) */}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* LEFT COLUMN: Search, Filters & Grouped Dishes */}
        <div className="grid gap-4">
          {/* Empty items in round */}
          {!items.length && (
            <Card className="border-amber-200 bg-amber-50 text-center py-8">
              <h2 className="mb-1 font-display text-sm font-bold text-amber-950">
                This round has no menu items
              </h2>
              <p className="mb-4 text-xs text-amber-900 max-w-md mx-auto">
                The organizer created this round without menu items attached.
              </p>
              {isOrganizer && onNavigateOrganize && (
                <button
                  type="button"
                  className="rounded-lg bg-lunch px-4 py-2 text-xs font-semibold text-white hover:bg-lunch-dark transition"
                  onClick={onNavigateOrganize}
                >
                  Manage restaurants & dishes in Organize lunch →
                </button>
              )}
            </Card>
          )}

          {/* Search, Restaurant & Category Filter Bar */}
          {items.length > 0 && (
            <Card className="p-4">
              <div className="grid gap-3">
                {/* Search bar */}
                <div className="relative">
                  <input
                    type="text"
                    className="h-10 w-full rounded-lg border border-stone-200 pl-9 pr-8 text-xs outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500 transition"
                    placeholder="Search dishes by name or ingredients…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span className="absolute left-3 top-3 text-xs text-stone-400">🔍</span>
                  {search && (
                    <button
                      type="button"
                      className="absolute right-3 top-2.5 text-xs text-stone-400 hover:text-stone-700"
                      onClick={() => setSearch("")}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Multi-Restaurant Tabs (if multiple stores) */}
                {(round.shortlist || []).length > 1 && (
                  <div className="border-t border-stone-100 pt-2.5">
                    <span className="mb-1.5 block text-[9px] font-bold uppercase tracking-wider text-stone-400">
                      Restaurants
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                          selectedStoreFilter === "all"
                            ? "bg-lunch text-white shadow-sm"
                            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                        }`}
                        onClick={() => setSelectedStoreFilter("all")}
                      >
                        All restaurants ({items.length})
                      </button>
                      {(round.shortlist || []).map((store) => {
                        const count = items.filter((i) => i.storeId === store._id || i.storeName === store.name).length;
                        const isSelected = selectedStoreFilter === store._id || selectedStoreFilter === store.name;
                        return (
                          <button
                            key={store._id}
                            type="button"
                            className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition ${
                              isSelected
                                ? "bg-lunch text-white shadow-sm"
                                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                            }`}
                            onClick={() => setSelectedStoreFilter(store._id)}
                          >
                            {store.name} ({count})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Category Pills & Sorting Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-100 pt-2.5">
                  {/* Category Pills */}
                  {availableSections.length > 1 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${
                          selectedSectionFilter === "all"
                            ? "bg-stone-800 text-white"
                            : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                        }`}
                        onClick={() => setSelectedSectionFilter("all")}
                      >
                        All Categories
                      </button>
                      {availableSections.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          className={`rounded-md px-2.5 py-1 text-[10px] font-medium transition ${
                            selectedSectionFilter === sec
                              ? "bg-stone-800 text-white"
                              : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                          }`}
                          onClick={() => setSelectedSectionFilter(sec)}
                        >
                          {sec}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Sort options */}
                  <div className="ml-auto flex items-center gap-1.5 text-[10px] text-stone-500">
                    <span>Sort by:</span>
                    <select
                      className="rounded-md border border-stone-200 bg-white px-2 py-1 text-[10px] text-stone-700 outline-none"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                    >
                      <option value="default">Default</option>
                      <option value="price-asc">Price: Low to High</option>
                      <option value="price-desc">Price: High to Low</option>
                      <option value="name-asc">Name: A to Z</option>
                    </select>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Grouped Dishes by Category */}
          {groupedSections.map(([sectionTitle, sectionItems]) => (
            <Card key={sectionTitle} className="p-5">
              <div className="mb-3 flex items-center justify-between border-b border-stone-100 pb-2">
                <h2 className="font-display text-sm font-bold text-stone-900">
                  {sectionTitle}
                </h2>
                <span className="text-[10px] font-medium text-stone-400">
                  {sectionItems.length} {sectionItems.length === 1 ? "dish" : "dishes"}
                </span>
              </div>

              <div className="grid gap-2.5">
                {sectionItems.map((item, idx) => {
                  const quantity = safeNumber(stagedQuantities[item.id]);
                  const inCart = quantity > 0;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3.5 rounded-xl border p-3 transition ${
                        inCart
                          ? "border-emerald-400 bg-emerald-50/40 ring-1 ring-emerald-300 shadow-sm"
                          : locked
                          ? "border-stone-200 bg-stone-50"
                          : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-xs"
                      }`}
                    >
                      {/* Dish Thumbnail / Avatar */}
                      <DishThumbnail item={item} index={idx} />

                      {/* Dish Details */}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <strong className="text-xs font-semibold text-stone-900">
                            {item.name}
                          </strong>
                          {inCart && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-800">
                              {quantity} in your tray
                            </span>
                          )}
                        </div>

                        {item.description ? (
                          <p className="mb-0 line-clamp-2 text-[10px] text-stone-500 mt-0.5 leading-relaxed">
                            {item.description}
                          </p>
                        ) : null}

                        {(round.shortlist || []).length > 1 && item.storeName && (
                          <span className="inline-block mt-1 text-[9px] font-medium text-stone-400">
                            From {item.storeName}
                          </span>
                        )}
                      </div>

                      {/* Price */}
                      <span className="whitespace-nowrap font-display text-xs font-bold text-stone-900">
                        {euro(item.price, item.currency || currency)}
                      </span>

                      {/* Action: "+ Add" button when 0, active stepper when > 0 */}
                      <div className="shrink-0">
                        {quantity === 0 ? (
                          <button
                            type="button"
                            disabled={locked}
                            className="inline-flex min-h-8 min-w-[72px] items-center justify-center rounded-lg border border-lunch/30 bg-lunch-soft px-3 text-xs font-semibold text-lunch-dark shadow-xs hover:bg-lunch hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition"
                            onClick={() => handleStep(item.id, 1)}
                            aria-label={`Add ${item.name} to order`}
                          >
                            + Add
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-white p-0.5 shadow-xs">
                            <button
                              type="button"
                              disabled={locked}
                              className="grid h-7 w-7 place-items-center rounded-md bg-stone-100 text-sm font-bold text-stone-700 hover:bg-stone-200 disabled:opacity-30"
                              onClick={() => handleStep(item.id, quantity - 1)}
                              aria-label={`Remove one ${item.name}`}
                            >
                              −
                            </button>
                            <span className="min-w-5 text-center font-display text-xs font-bold text-emerald-950">
                              {quantity}
                            </span>
                            <button
                              type="button"
                              disabled={locked}
                              className="grid h-7 w-7 place-items-center rounded-md bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-30"
                              onClick={() => handleStep(item.id, quantity + 1)}
                              aria-label={`Add another ${item.name}`}
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ))}

          {!filteredItems.length && items.length > 0 && (
            <Card className="py-12 text-center text-stone-400">
              <span className="text-2xl block mb-2">🔍</span>
              <p className="text-xs mb-0">No dishes match your search or filter.</p>
              <button
                type="button"
                className="mt-3 text-[11px] font-semibold text-lunch hover:underline"
                onClick={() => {
                  setSearch("");
                  setSelectedStoreFilter("all");
                  setSelectedSectionFilter("all");
                }}
              >
                Reset all filters
              </button>
            </Card>
          )}
        </div>

        {/* RIGHT COLUMN: Sidebar (Your Order Tray & Team Orders) */}
        <aside ref={trayRef} className="sticky top-6 grid gap-4">
          <Card className="p-5">
            {/* Sidebar Tabs */}
            <div className="flex border-b border-stone-200 pb-2 mb-4">
              <button
                type="button"
                className={`flex-1 pb-1.5 text-center text-xs font-bold border-b-2 transition ${
                  sidebarTab === "your-order"
                    ? "border-lunch text-lunch"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                }`}
                onClick={() => setSidebarTab("your-order")}
              >
                Your Order ({totalStagedCount})
              </button>
              <button
                type="button"
                className={`flex-1 pb-1.5 text-center text-xs font-bold border-b-2 transition ${
                  sidebarTab === "team-orders"
                    ? "border-lunch text-lunch"
                    : "border-transparent text-stone-400 hover:text-stone-700"
                }`}
                onClick={() => setSidebarTab("team-orders")}
              >
                Team Orders ({orders.length})
              </button>
            </div>

            {/* TAB 1: YOUR ORDER TRAY */}
            {sidebarTab === "your-order" && (
              <div>
                {/* 1. Status & Feedback Notifications */}
                {justSubmitted && (
                  <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-950">
                    <strong className="block font-bold">✓ Order submitted successfully!</strong>
                    <span className="text-[10px] text-emerald-800">
                      Your dishes are registered on the team round.
                    </span>
                  </div>
                )}

                {hasSubmittedOrder && !hasUnsavedChanges && !justSubmitted && (
                  <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 text-xs text-emerald-900">
                    <div className="flex items-center gap-1.5 font-bold">
                      <span>✓</span>
                      <span>Order placed with organizer</span>
                    </div>
                    <span className="text-[10px] text-emerald-700 block mt-0.5">
                      You can adjust your dishes anytime before orders lock.
                    </span>
                  </div>
                )}

                {hasUnsavedChanges && hasSubmittedOrder && (
                  <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900">
                      <span>●</span>
                      <span>You have unsaved changes</span>
                    </div>
                    <span className="text-[10px] text-amber-800 block mt-0.5">
                      Click "Save Order Changes" below to sync with the organizer.
                    </span>
                  </div>
                )}

                {/* 2. Tray Items List */}
                <div className="divide-y divide-stone-100 max-h-80 overflow-y-auto mb-4">
                  {stagedItems.map((item) => (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-stone-900 font-medium">
                          {item.name}
                        </strong>
                        <span className="text-[10px] text-stone-400">
                          {euro(item.price, currency)} each
                        </span>
                      </div>

                      {/* Stepper in Tray */}
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={locked}
                          className="h-6 w-6 rounded bg-stone-100 text-xs font-bold text-stone-700 hover:bg-stone-200 disabled:opacity-30"
                          onClick={() => handleStep(item.id, item.quantity - 1)}
                          aria-label={`Decrease ${item.name}`}
                        >
                          −
                        </button>
                        <span className="min-w-4 text-center font-bold text-xs">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          disabled={locked}
                          className="h-6 w-6 rounded bg-stone-100 text-xs font-bold text-stone-700 hover:bg-stone-200 disabled:opacity-30"
                          onClick={() => handleStep(item.id, item.quantity + 1)}
                          aria-label={`Increase ${item.name}`}
                        >
                          +
                        </button>
                      </div>

                      {/* Item Total */}
                      <strong className="min-w-14 text-right font-display text-xs text-stone-900">
                        {euro(item.quantity * safeNumber(item.price), currency)}
                      </strong>
                    </div>
                  ))}

                  {!stagedItems.length && (
                    <div className="py-8 text-center text-stone-400">
                      <span className="text-xl block mb-1">🛒</span>
                      <p className="text-xs mb-0">Your tray is empty.</p>
                      <span className="text-[10px] text-stone-400">
                        Tap "+ Add" on dishes from the menu to build your order.
                      </span>
                    </div>
                  )}
                </div>

                {/* 3. Subtotals & Bill Summary */}
                <div className="border-t border-stone-200 pt-3 mb-4">
                  <div className="flex items-center justify-between text-xs text-stone-600 mb-1">
                    <span>Food Subtotal ({totalStagedCount} items)</span>
                    <strong className="text-stone-900">{euro(stagedFoodTotal, currency)}</strong>
                  </div>

                  {round.feeCents ? (
                    <div className="flex items-center justify-between text-[10px] text-stone-500 mb-1">
                      <span>Shared Delivery Fee (approx)</span>
                      <span>+{euro((round.feeCents / (orders.length || 1)) / 100, currency)}</span>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between border-t border-stone-100 pt-2 text-sm font-bold text-stone-900">
                    <span>Your Order Total</span>
                    <strong className="font-display text-lg text-lunch-dark">
                      {euro(stagedFoodTotal, currency)}
                    </strong>
                  </div>
                </div>

                {/* 4. PRIMARY ACTION BUTTON: Crystal-Clear Order Logic */}
                <div>
                  {locked ? (
                    <button
                      type="button"
                      disabled
                      className="min-h-11 w-full rounded-xl bg-stone-200 text-xs font-bold text-stone-500 cursor-not-allowed"
                    >
                      🔒 Orders Closed (Read-only)
                    </button>
                  ) : totalStagedCount === 0 && hasSubmittedOrder ? (
                    // User cleared all dishes from their existing order -> prompt cancellation
                    <button
                      type="button"
                      disabled={loading}
                      className="min-h-11 w-full rounded-xl bg-rose-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-rose-700 transition"
                      onClick={handleClearOrder}
                    >
                      {loading ? "Updating…" : "Cancel & Remove Order with Organizer"}
                    </button>
                  ) : totalStagedCount === 0 ? (
                    // Empty tray, no order submitted yet
                    <button
                      type="button"
                      disabled
                      className="min-h-11 w-full rounded-xl bg-stone-100 text-xs font-semibold text-stone-400 cursor-not-allowed border border-stone-200"
                    >
                      Select dishes to order
                    </button>
                  ) : hasSubmittedOrder && !hasUnsavedChanges ? (
                    // Submitted order, zero pending changes -> confirmed status card
                    <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-emerald-950">
                        <span>✓</span>
                        <span>Order Confirmed ({totalStagedCount} items)</span>
                      </div>
                      <p className="mb-0 text-[10px] text-emerald-800 mt-0.5">
                        Saved with organizer. Adjust dishes above anytime.
                      </p>
                    </div>
                  ) : (
                    // Ready to submit (first time OR updating changes)
                    <button
                      type="button"
                      disabled={loading}
                      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-lunch px-4 text-xs font-bold text-white shadow-sm hover:bg-lunch-dark transition active:scale-[0.99]"
                      onClick={handleSubmit}
                    >
                      {loading
                        ? "Submitting order…"
                        : hasSubmittedOrder
                        ? `Save Order Changes (${totalStagedCount} items · ${euro(stagedFoodTotal, currency)})`
                        : `Submit Order (${totalStagedCount} items · ${euro(stagedFoodTotal, currency)}) →`}
                    </button>
                  )}
                </div>

                {/* 5. Secondary Actions */}
                <div className="mt-3 flex items-center justify-between text-[11px]">
                  {stagedItems.length > 0 && !locked && (
                    <button
                      type="button"
                      className="text-stone-400 hover:text-rose-600 transition"
                      onClick={handleClearOrder}
                    >
                      Clear tray
                    </button>
                  )}
                  <button
                    type="button"
                    className="ml-auto font-semibold text-stone-600 hover:text-stone-900 transition"
                    onClick={onNavigateBill}
                  >
                    View group bill totals →
                  </button>
                </div>
              </div>
            )}

            {/* TAB 2: TEAM ORDERS VIEW */}
            {sidebarTab === "team-orders" && (
              <div>
                {/* Team summary header */}
                <div className="flex items-center justify-between pb-3 border-b border-stone-100 text-[11px] text-stone-500">
                  <span>
                    <strong>{orders.length}</strong> participants · <strong>{totalTeamItems}</strong> dishes
                  </span>
                  <span className="font-display font-bold text-stone-800">
                    {euro(totalTeamSpend, currency)}
                  </span>
                </div>

                <div className="divide-y divide-stone-100 max-h-80 overflow-y-auto">
                  {teamOrdersSummary.map((order, idx) => (
                    <div key={order.id || idx} className="py-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`grid h-6 w-6 place-items-center rounded-full text-[9px] font-bold ${
                              teamAvatarClasses[idx % teamAvatarClasses.length]
                            }`}
                          >
                            {initials(order.name)}
                          </span>
                          <strong className="text-xs text-stone-900">
                            {order.name}
                          </strong>
                          {order.isCurrent && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] font-bold text-emerald-800">
                              You
                            </span>
                          )}
                        </div>
                        <span className="font-display text-xs font-semibold text-stone-900">
                          {euro(order.totalFood, currency)}
                        </span>
                      </div>

                      {order.picks.length > 0 ? (
                        <p className="mb-0 text-[10px] text-stone-500 pl-8 leading-relaxed">
                          {order.picks.map((p) => `${p.quantity}× ${p.item.name}`).join(", ")}
                        </p>
                      ) : (
                        <p className="mb-0 text-[10px] text-stone-400 pl-8 italic">
                          Still choosing dishes…
                        </p>
                      )}
                    </div>
                  ))}

                  {!orders.length && (
                    <p className="py-8 text-center text-xs text-stone-400">
                      No participants have joined this round yet.
                    </p>
                  )}
                </div>

                {/* Organizer quick note */}
                {(participant?.isOrganizer || isOrganizer) && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-[11px] text-amber-900">
                    <strong>👑 You are organizing this round</strong>
                    <p className="mb-2 mt-0.5 text-[10px] text-amber-800">
                      When everyone has finished ordering, proceed to Final Bill to calculate shares.
                    </p>
                    <button
                      type="button"
                      className="w-full rounded-lg bg-lunch-dark py-1.5 text-[11px] font-semibold text-white hover:bg-green-950 transition"
                      onClick={onNavigateBill}
                    >
                      Go to Final Bill →
                    </button>
                  </div>
                )}
              </div>
            )}
          </Card>
        </aside>
      </div>

      {/* 5. STICKY MOBILE TRAY BAR (Visible on screens < lg) */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t border-stone-200 bg-white p-3 shadow-lg lg:hidden max-sm:bottom-[60px]">
        <div className="flex items-center justify-between gap-3 max-w-xl mx-auto">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-sm">🛒</span>
              <strong className="text-xs text-stone-900">
                {totalStagedCount} {totalStagedCount === 1 ? "dish" : "dishes"}
              </strong>
            </div>
            <strong className="font-display text-sm text-lunch-dark">
              {euro(stagedFoodTotal, currency)}
            </strong>
          </div>

          <button
            type="button"
            className="rounded-xl bg-lunch px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-lunch-dark transition"
            onClick={scrollToTray}
          >
            {hasSubmittedOrder && !hasUnsavedChanges
              ? "View Order (Confirmed ✓)"
              : hasUnsavedChanges
              ? "Review & Save Changes →"
              : "Review & Submit →"}
          </button>
        </div>
      </div>
    </section>
  );
}

export default OrderLunch;
