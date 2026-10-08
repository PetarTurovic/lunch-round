import { useState, useMemo, useEffect, type FormEvent, type ReactNode } from "react";
import { euro, initials, safeNumber } from "../../utils";
import type { OrderMenuItem, Participant, ParticipantOrder, Round, User } from "../../types";

const dishClasses = [
  "bg-orange-50 text-orange-800",
  "bg-green-50 text-green-800",
  "bg-purple-50 text-purple-800",
  "bg-blue-50 text-blue-800"
];

const teamAvatarClasses = [
  "bg-purple-100 text-purple-800",
  "bg-orange-100 text-orange-800",
  "bg-green-100 text-green-800",
  "bg-blue-100 text-blue-800"
];

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <article className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</article>;
}

function DishAvatar({ name, index }: { name: string; index: number }) {
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-[11px] font-bold ${dishClasses[index % dishClasses.length]}`}>
      {initials(name)}
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
  timeLabel: string;
  hours: number;
  minutes: number;
  loading: boolean;
  user?: User | null;
  onSubmitOrder: (name: string, quantities: Record<string, number>) => Promise<void>;
  onClearOrder: () => Promise<void>;
  onNavigateBill: () => void;
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
  timeLabel,
  hours,
  minutes,
  loading,
  user,
  onSubmitOrder,
  onClearOrder,
  onNavigateBill,
  onNewRound,
  onRefresh
}: OrderLunchProps) {
  // Staged local quantities for immediate, responsive clicks
  const [stagedQuantities, setStagedQuantities] = useState<Record<string, number>>(() => currentOrder.quantities || {});
  const [name, setName] = useState<string>(() => participant?.name || user?.name || "");
  const [isRenaming, setIsRenaming] = useState(false);

  // Search, filter, and sorting
  const [search, setSearch] = useState("");
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string>("all");
  const [selectedSectionFilter, setSelectedSectionFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("your-order");
  const [refreshing, setRefreshing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const currency = round?.currency || "EUR";

  // Synchronize staged quantities when the backend order updates
  useEffect(() => {
    setStagedQuantities(currentOrder.quantities || {});
  }, [currentOrder.quantities]);

  // Synchronize name
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

  // Staged items list
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

  // Check if participant has an already submitted order
  const hasSubmittedOrder = Boolean(
    participant &&
    Object.values(currentOrder.quantities || {}).some((qty) => safeNumber(qty) > 0)
  );

  // Check if staged quantities differ from backend submitted quantities
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
    return items.filter((item) => {
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
    }).sort((a, b) => {
      if (sortBy === "price-asc") return safeNumber(a.price) - safeNumber(b.price);
      if (sortBy === "price-desc") return safeNumber(b.price) - safeNumber(a.price);
      if (sortBy === "name-asc") return a.name.localeCompare(b.name);
      return 0;
    });
  }, [items, search, selectedStoreFilter, selectedSectionFilter, sortBy]);

  // Local stepper adjustments: FAST & NON-BLOCKING
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
      alert("Please enter your name to submit your order.");
      return;
    }

    await onSubmitOrder(orderName, stagedQuantities);
    setJustSubmitted(true);
    setIsRenaming(false);
    window.setTimeout(() => setJustSubmitted(false), 3000);
  }

  async function handleClear() {
    if (!window.confirm("Clear all items from your order?")) return;
    setStagedQuantities({});
    if (hasSubmittedOrder) {
      await onClearOrder();
    }
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
        itemCount: picks.reduce((sum, p) => sum + p.quantity, 0)
      };
    });
  }, [orders, items]);

  if (!round) {
    return (
      <section className="mx-auto max-w-2xl pt-9">
        <div className="mb-7">
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
            YOUR TEAM LUNCH
          </div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
            Order <span className="text-lunch">lunch.</span>
          </h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">
            Open a shared round link to see available restaurant dishes and place your order.
          </p>
        </div>
        <Card>
          <p className="mb-0 text-xs leading-relaxed text-stone-600">
            {window.location.search.includes("round=")
              ? "Loading the linked lunch round from the database…"
              : "No lunch round is selected. Open a link from your organizer or create a round from Organize lunch."}
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl pt-9">
      {/* Top Header */}
      <div className="mb-7 flex items-end justify-between gap-5 max-sm:flex-col max-sm:items-start">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
            TEAM ORDERING
          </div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
            {round.title} <span className="text-lunch">menu.</span>
          </h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">
            {locked
              ? `Ordering closed at ${timeLabel}. Orders are locked in read-only mode.`
              : "Select your dishes from the restaurants below. When ready, submit your order to the organizer."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-50"
              disabled={refreshing}
              onClick={handleRefresh}
            >
              {refreshing ? "Refreshing…" : "↻ Refresh menu"}
            </button>
          )}
          <span
            className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-3 text-[9px] font-semibold ${
              locked
                ? "border-stone-200 bg-stone-100 text-stone-600"
                : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ring-4 ${locked ? "bg-stone-500 ring-stone-200" : "bg-green-500 ring-green-100"}`} />
            {locked ? "Ordering closed" : "Open for orders"}
          </span>
        </div>
      </div>

      {/* Locked Warning Banner */}
      {locked && (
        <div className="mb-5 flex items-center justify-between rounded-xl border border-stone-200 bg-stone-100 p-4 text-xs text-stone-700">
          <div className="flex items-center gap-2">
            <span className="text-base">🔒</span>
            <span><strong>Orders are locked.</strong> The organizer is finalizing the bill. Menu selections are now read-only.</span>
          </div>
          <button
            type="button"
            className="rounded-lg bg-white border border-stone-300 px-3 py-1 text-[10px] font-semibold text-stone-700 hover:bg-stone-50"
            onClick={onNavigateBill}
          >
            View final bill →
          </button>
        </div>
      )}

      {/* Main Layout: Menu Dishes + Order Tray */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* LEFT COLUMN: Menu Cards */}
        <div className="grid gap-3">
          {/* Missing items alert */}
          {!items.length && (
            <Card className="border-amber-200 bg-amber-50">
              <h2 className="mb-1 font-display text-sm font-bold text-amber-950">This round has no menu items</h2>
              <p className="mb-0 text-xs leading-relaxed text-amber-900">
                The organizer created this round without menu items attached.
              </p>
              {isOrganizer && (
                <button
                  className="mt-3 min-h-9 rounded-lg bg-lunch-dark px-4 text-xs font-semibold text-white hover:bg-green-950"
                  type="button"
                  onClick={() => void onNewRound()}
                >
                  Start a new round with menus
                </button>
              )}
            </Card>
          )}

          {/* Search, Filter & Restaurant Tabs Bar */}
          {items.length > 0 && (
            <Card className="p-4">
              <div className="grid gap-3">
                {/* Live Search input */}
                <div className="relative">
                  <input
                    type="text"
                    className="h-9 w-full rounded-lg border border-stone-200 pl-8 pr-3 text-xs outline-none focus:border-green-400"
                    placeholder="Search dishes by name or description…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <span className="absolute left-2.5 top-2.5 text-stone-400 text-xs">🔍</span>
                  {search && (
                    <button
                      type="button"
                      className="absolute right-2.5 top-2 text-stone-400 hover:text-stone-700 text-xs"
                      onClick={() => setSearch("")}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Restaurant tabs */}
                {(round.shortlist || []).length > 1 && (
                  <div className="flex flex-wrap gap-1 border-t border-stone-100 pt-2.5">
                    <button
                      type="button"
                      className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
                        selectedStoreFilter === "all"
                          ? "bg-lunch text-white shadow-sm"
                          : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                      }`}
                      onClick={() => setSelectedStoreFilter("all")}
                    >
                      All restaurants ({items.length})
                    </button>
                    {(round.shortlist || []).map((store) => {
                      const count = items.filter((i) => i.storeId === store._id || i.storeName === store.name).length;
                      return (
                        <button
                          key={store._id}
                          type="button"
                          className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition ${
                            selectedStoreFilter === store._id || selectedStoreFilter === store.name
                              ? "bg-lunch text-white shadow-sm"
                              : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                          }`}
                          onClick={() => setSelectedStoreFilter(store._id)}
                        >
                          {store.name} ({count})
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Category & Sorting controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] text-stone-500">
                    <span>Category:</span>
                    <select
                      className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[10px] text-stone-700 outline-none"
                      value={selectedSectionFilter}
                      onChange={(e) => setSelectedSectionFilter(e.target.value)}
                    >
                      <option value="all">All categories</option>
                      {availableSections.map((sec) => (
                        <option key={sec} value={sec}>{sec}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] text-stone-500">
                    <span>Sort:</span>
                    <select
                      className="rounded border border-stone-200 bg-white px-2 py-0.5 text-[10px] text-stone-700 outline-none"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SortOption)}
                    >
                      <option value="default">Default order</option>
                      <option value="price-asc">Price: Low to High</option>
                      <option value="price-desc">Price: High to Low</option>
                      <option value="name-asc">Name: A to Z</option>
                    </select>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Menu Items List */}
          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="mb-0 font-display text-sm font-bold text-ink">
                Available Dishes ({filteredItems.length})
              </h2>
              {hasDeadline && (
                <span className="text-[10px] text-stone-500">
                  {locked ? "Locked" : `Closes in ${hours ? `${hours}h ` : ""}${minutes}m`}
                </span>
              )}
            </div>

            <div className="grid gap-2.5">
              {filteredItems.map((item, index) => {
                const quantity = safeNumber(stagedQuantities[item.id]);
                const isInTray = quantity > 0;

                return (
                  <div
                    className={`flex min-h-[72px] items-center gap-3 rounded-lg border p-3 transition ${
                      isInTray
                        ? "border-green-400 bg-green-50/50"
                        : locked
                        ? "border-stone-200 bg-stone-50"
                        : "border-stone-200 bg-white hover:border-stone-300"
                    }`}
                    key={item.id}
                  >
                    <DishAvatar name={item.name} index={index} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-xs text-stone-800">{item.name}</strong>
                        {isInTray && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[8px] font-bold text-green-800">
                            {quantity} in your tray
                          </span>
                        )}
                      </div>
                      <small className="block truncate text-[9px] text-stone-500 mt-0.5">
                        {[item.storeName, item.section, item.description].filter(Boolean).join(" · ")}
                      </small>
                    </div>

                    <span className="whitespace-nowrap font-display text-xs font-semibold text-stone-800">
                      {euro(item.price, item.currency || currency)}
                    </span>

                    {/* Stepper: ALWAYS responsive and snappy */}
                    <div className="flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
                      <button
                        className="grid h-7 w-7 place-items-center rounded-md bg-white text-base font-bold text-stone-700 shadow-sm hover:bg-stone-100 disabled:opacity-30 disabled:shadow-none"
                        type="button"
                        disabled={locked || quantity === 0}
                        aria-label={`Remove one ${item.name}`}
                        onClick={() => handleStep(item.id, quantity - 1)}
                      >
                        −
                      </button>
                      <strong className="min-w-4 text-center text-xs text-stone-800">{quantity}</strong>
                      <button
                        className="grid h-7 w-7 place-items-center rounded-md bg-white text-base font-bold text-stone-700 shadow-sm hover:bg-stone-100 disabled:opacity-30 disabled:shadow-none"
                        type="button"
                        disabled={locked}
                        aria-label={`Add one ${item.name}`}
                        onClick={() => handleStep(item.id, quantity + 1)}
                      >
                        ＋
                      </button>
                    </div>
                  </div>
                );
              })}

              {!filteredItems.length && items.length > 0 && (
                <p className="py-8 text-center text-xs text-stone-400">
                  No dishes match your search or filter.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Order Tray & Submission Panel */}
        <aside className="sticky top-6 grid gap-3">
          <Card>
            {/* Tabs for Sidebar */}
            <div className="flex border-b border-stone-100 pb-2 mb-3">
              <button
                type="button"
                className={`flex-1 pb-1 text-center text-xs font-semibold border-b-2 transition ${
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
                className={`flex-1 pb-1 text-center text-xs font-semibold border-b-2 transition ${
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
                {/* Order Status Feedback */}
                {justSubmitted && (
                  <div className="mb-3 rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs text-green-900 animate-fade-in">
                    <strong>✓ Order submitted successfully!</strong>
                    <p className="mb-0 text-[10px] text-green-700 mt-0.5">Your picks are saved with the team round.</p>
                  </div>
                )}

                {hasSubmittedOrder && !hasUnsavedChanges && !justSubmitted && (
                  <div className="mb-3 rounded-lg border border-green-200 bg-green-50/70 p-2.5 text-xs text-green-900">
                    <span className="font-semibold">✓ Order placed with organizer</span>
                    <p className="mb-0 text-[10px] text-green-700 mt-0.5">You can update your items anytime before orders close.</p>
                  </div>
                )}

                {hasUnsavedChanges && hasSubmittedOrder && (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
                    <span className="font-semibold">● You have unsaved changes</span>
                    <p className="mb-0 text-[10px] text-amber-700 mt-0.5">Click "Save Order Changes" below to update your picks.</p>
                  </div>
                )}

                {/* Identity / Ordering As Section */}
                <div className="mb-3 rounded-lg bg-stone-50 p-2.5 border border-stone-100">
                  {participant && !isRenaming ? (
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="block text-[8px] font-bold tracking-widest text-stone-400">ORDERING AS</span>
                        <strong className="text-stone-800">{participant.name}</strong>
                      </div>
                      {!locked && (
                        <button
                          type="button"
                          className="text-[9px] font-semibold text-stone-500 hover:text-stone-800"
                          onClick={() => {
                            setName(participant.name);
                            setIsRenaming(true);
                          }}
                        >
                          Change name
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="grid gap-1">
                      <label className="text-[9px] font-bold tracking-widest text-stone-400" htmlFor="tray-name">
                        YOUR NAME
                      </label>
                      <input
                        id="tray-name"
                        type="text"
                        className="h-8 rounded-lg border border-stone-200 bg-white px-2.5 text-xs outline-none focus:border-green-400"
                        placeholder="Enter your name (e.g. Alex Morgan)"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={100}
                      />
                      <span className="text-[8px] text-stone-400">Your name will appear next to your dishes on the bill.</span>
                    </div>
                  )}
                </div>

                {/* Staged Items List */}
                <div className="divide-y divide-stone-100 max-h-72 overflow-y-auto">
                  {stagedItems.map((item) => (
                    <div className="flex items-center justify-between gap-2 py-2.5 text-xs text-stone-700" key={item.id}>
                      <div className="min-w-0 flex-1">
                        <strong className="block truncate text-stone-800">{item.name}</strong>
                        <span className="text-[9px] text-stone-400">{euro(item.price, currency)} each</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          className="h-6 w-6 rounded bg-stone-100 text-xs font-bold hover:bg-stone-200 disabled:opacity-40"
                          disabled={locked}
                          onClick={() => handleStep(item.id, item.quantity - 1)}
                        >
                          −
                        </button>
                        <strong className="min-w-3 text-center text-xs">{item.quantity}</strong>
                        <button
                          type="button"
                          className="h-6 w-6 rounded bg-stone-100 text-xs font-bold hover:bg-stone-200 disabled:opacity-40"
                          disabled={locked}
                          onClick={() => handleStep(item.id, item.quantity + 1)}
                        >
                          +
                        </button>
                      </div>
                      <strong className="font-display text-xs text-stone-800 min-w-14 text-right">
                        {euro(item.quantity * safeNumber(item.price), currency)}
                      </strong>
                    </div>
                  ))}

                  {!stagedItems.length && (
                    <p className="py-6 text-center text-xs text-stone-400">
                      Your tray is empty. Tap ＋ on dishes from the menu to build your order.
                    </p>
                  )}
                </div>

                {/* Subtotals & Submit Button */}
                <div className="border-t border-stone-100 pt-3">
                  <div className="flex items-center justify-between text-xs text-stone-600 mb-1">
                    <span>Food Subtotal ({totalStagedCount} items)</span>
                    <strong>{euro(stagedFoodTotal, currency)}</strong>
                  </div>

                  {round.feeCents ? (
                    <div className="flex items-center justify-between text-[10px] text-stone-500 mb-1">
                      <span>Shared Delivery Fee (approx)</span>
                      <span>+{euro((round.feeCents / (orders.length || 1)) / 100, currency)}</span>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between border-t border-stone-100 pt-2 text-sm font-bold text-ink mb-3">
                    <span>Your Total</span>
                    <strong className="font-display text-lg text-lunch-dark">
                      {euro(stagedFoodTotal, currency)}
                    </strong>
                  </div>

                  {/* Primary Order Action Button */}
                  {!locked ? (
                    <button
                      type="button"
                      disabled={loading || totalStagedCount === 0 || (!participant && !name.trim())}
                      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-lunch-dark px-4 text-xs font-semibold text-white shadow-sm hover:bg-green-950 disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={handleSubmit}
                    >
                      {loading
                        ? "Submitting order…"
                        : hasSubmittedOrder
                        ? hasUnsavedChanges
                          ? `Save Order Changes (${totalStagedCount} items)`
                          : `✓ Order Placed (${totalStagedCount} items)`
                        : `Submit Order (${totalStagedCount} items · ${euro(stagedFoodTotal, currency)})`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="min-h-10 w-full rounded-lg bg-stone-200 text-xs font-semibold text-stone-500 cursor-not-allowed"
                      disabled
                    >
                      Orders locked
                    </button>
                  )}

                  {/* Secondary Actions */}
                  <div className="mt-2.5 flex items-center justify-between text-[10px]">
                    {stagedItems.length > 0 && !locked && (
                      <button
                        type="button"
                        className="text-stone-400 hover:text-red-600"
                        onClick={handleClear}
                      >
                        Clear my order
                      </button>
                    )}
                    <button
                      type="button"
                      className="ml-auto font-semibold text-stone-600 hover:text-ink"
                      onClick={onNavigateBill}
                    >
                      View group bill totals →
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: TEAM ORDERS VIEW */}
            {sidebarTab === "team-orders" && (
              <div className="divide-y divide-stone-100 max-h-80 overflow-y-auto">
                <div className="flex items-center justify-between pb-2 text-[10px] text-stone-500">
                  <span>{orders.length} team members joined</span>
                  {onRefresh && (
                    <button
                      type="button"
                      className="font-semibold text-lunch hover:underline"
                      onClick={handleRefresh}
                    >
                      ↻ Refresh
                    </button>
                  )}
                </div>

                {teamOrdersSummary.map((order, idx) => (
                  <div className="py-2.5" key={order.id || idx}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`grid h-5 w-5 place-items-center rounded-full text-[8px] font-bold ${teamAvatarClasses[idx % teamAvatarClasses.length]}`}>
                          {initials(order.name)}
                        </span>
                        <strong className="text-xs text-stone-800">{order.name}</strong>
                      </div>
                      <span className="text-[10px] font-semibold text-stone-600">
                        {euro(order.totalFood, currency)}
                      </span>
                    </div>
                    {order.picks.length > 0 ? (
                      <p className="mb-0 text-[9px] text-stone-500 pl-6 leading-relaxed">
                        {order.picks.map((p) => `${p.quantity}× ${p.item.name}`).join(", ")}
                      </p>
                    ) : (
                      <p className="mb-0 text-[9px] text-stone-400 pl-6 italic">No dishes selected yet</p>
                    )}
                  </div>
                ))}

                {!orders.length && (
                  <p className="py-6 text-center text-xs text-stone-400">
                    No participants have joined yet.
                  </p>
                )}
              </div>
            )}
          </Card>
        </aside>
      </div>
    </section>
  );
}

export default OrderLunch;
