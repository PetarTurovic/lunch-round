import { useState, useMemo, type FormEvent, type ReactNode } from "react";
import { euro, initials, shareLink } from "../../utils";
import { generateQrSvg } from "../../qr";
import type { Participant, Round, Store, User } from "../../types";
import CopyRoundLink from "../CopyRoundLink/CopyRoundLink";

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <article className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</article>;
}

function SectionHeading({ eyebrow, title, accent, description }: { eyebrow: string; title: string; accent: string; description: string }) {
  return (
    <div className="mb-7">
      <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
        <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
        {eyebrow}
      </div>
      <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
        {title} <span className="text-lunch">{accent}</span>
      </h1>
      <p className="mb-0 text-xs leading-relaxed text-stone-500">{description}</p>
    </div>
  );
}

interface OrganizeLunchProps {
  round: Round | null;
  participant: Participant | null;
  isOrganizer: boolean;
  locked: boolean;
  countdown: string;
  hasDeadline: boolean;
  dateLabel: string;
  timeLabel: string;
  stores: Store[];
  storesLoading: boolean;
  storesError: string;
  storeSearch: string;
  onStoreSearch: (search: string) => void;
  selectedStoreIds: string[];
  onToggleStore: (id: string) => void;
  onSelectMultipleStores?: (ids: string[]) => void;
  user: User | null;
  onSignIn: () => void;
  onCreateRound: (details: { title: string; closesAt: string; feeCents?: number }) => Promise<void>;
  onUpdateRound?: (details: { title?: string; closesAt?: string | null; feeCents?: number; status?: "open" | "locked" }) => Promise<void>;
  onDeleteRound?: () => Promise<void>;
  onCopyLink: () => Promise<void>;
  onLockOrders: () => Promise<void>;
  onUnlockOrders?: () => Promise<void>;
  onNavigateOrder: () => void;
  onNavigateBill?: () => void;
  onNewRound: () => Promise<void>;
  onRefreshRound?: () => Promise<void>;
  loading: boolean;
}

function OrganizeLunch({
  round,
  participant,
  isOrganizer,
  locked,
  countdown,
  hasDeadline,
  dateLabel,
  timeLabel,
  stores,
  storesLoading,
  storesError,
  storeSearch,
  onStoreSearch,
  selectedStoreIds,
  onToggleStore,
  onSelectMultipleStores,
  user,
  onSignIn,
  onCreateRound,
  onUpdateRound,
  onDeleteRound,
  onCopyLink,
  onLockOrders,
  onUnlockOrders,
  onNavigateOrder,
  onNavigateBill,
  onNewRound,
  onRefreshRound,
  loading
}: OrganizeLunchProps) {
  const [title, setTitle] = useState("Team lunch");
  const [closesAt, setClosesAt] = useState("");
  const [feeInput, setFeeInput] = useState("");
  const [selectedCuisineFilter, setSelectedCuisineFilter] = useState<string>("all");
  const [showQrModal, setShowQrModal] = useState(false);
  const [isEditingRound, setIsEditingRound] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Edit Round state
  const [editTitle, setEditTitle] = useState("");
  const [editClosesAt, setEditClosesAt] = useState("");
  const [editFee, setEditFee] = useState("");

  const currency = round?.currency || "EUR";

  // Derive all unique cuisines from current stores
  const availableCuisines = useMemo(() => {
    const set = new Set<string>();
    for (const s of stores) {
      for (const c of s.taxonomy?.cuisineLabels || []) {
        if (c) set.add(c);
      }
    }
    return Array.from(set).sort();
  }, [stores]);

  // Filter stores by cuisine
  const filteredStores = useMemo(() => {
    if (selectedCuisineFilter === "all") return stores;
    return stores.filter((s) => (s.taxonomy?.cuisineLabels || []).includes(selectedCuisineFilter));
  }, [stores, selectedCuisineFilter]);

  // Selected store objects
  const selectedStoresList = useMemo(() => {
    return stores.filter((s) => selectedStoreIds.includes(s._id));
  }, [stores, selectedStoreIds]);

  // Quick preset deadline helpers
  function setPresetMinutes(mins: number) {
    const target = new Date(Date.now() + mins * 60_000);
    // Format to local YYYY-MM-DDTHH:mm
    const tzOffset = target.getTimezoneOffset() * 60_000;
    const localIso = new Date(target.getTime() - tzOffset).toISOString().slice(0, 16);
    setClosesAt(localIso);
  }

  function setPresetClock(hours: number, minutes: number) {
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (target.getTime() <= Date.now()) {
      target.setDate(target.getDate() + 1);
    }
    const tzOffset = target.getTimezoneOffset() * 60_000;
    const localIso = new Date(target.getTime() - tzOffset).toISOString().slice(0, 16);
    setClosesAt(localIso);
  }

  async function submitRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedFee = parseFloat(feeInput);
    const feeCents = Number.isFinite(parsedFee) && parsedFee >= 0 ? Math.round(parsedFee * 100) : 0;
    await onCreateRound({ title: title.trim(), closesAt, feeCents });
  }

  async function handleRefresh() {
    if (!onRefreshRound) return;
    setRefreshing(true);
    try {
      await onRefreshRound();
    } finally {
      setRefreshing(false);
    }
  }

  function startEditingRound() {
    if (!round) return;
    setEditTitle(round.title || "");
    const closes = round.closesAt ? new Date(round.closesAt) : null;
    if (closes && Number.isFinite(closes.getTime())) {
      const tzOffset = closes.getTimezoneOffset() * 60_000;
      setEditClosesAt(new Date(closes.getTime() - tzOffset).toISOString().slice(0, 16));
    } else {
      setEditClosesAt("");
    }
    setEditFee(((round.feeCents || 0) / 100).toFixed(2));
    setIsEditingRound(true);
  }

  async function handleSaveEditedRound(e: FormEvent) {
    e.preventDefault();
    if (!onUpdateRound) return;
    const parsedFee = parseFloat(editFee);
    const feeCents = Number.isFinite(parsedFee) && parsedFee >= 0 ? Math.round(parsedFee * 100) : undefined;
    await onUpdateRound({
      title: editTitle.trim(),
      closesAt: editClosesAt ? new Date(editClosesAt).toISOString() : null,
      feeCents
    });
    setIsEditingRound(false);
  }

  async function handleShareNative() {
    if (!round) return;
    const url = `${window.location.origin}/?round=${encodeURIComponent(round.slug)}`;
    await shareLink({
      title: round.title,
      text: `Join our team lunch round: ${round.title}`,
      url
    });
  }

  async function handleDelete() {
    if (!onDeleteRound) return;
    if (!window.confirm("Are you sure you want to cancel and delete this round? This will remove all orders.")) return;
    await onDeleteRound();
  }

  // Active round crew calculation
  const crewMembers = useMemo(() => {
    if (!round) return [];
    return (round.participants || []).map((person) => {
      const order = (round.orders || []).find((o) => String(o.participantId) === String(person._id || person.participantId));
      let itemCount = 0;
      let foodCents = 0;

      if (order && order.quantities) {
        for (const [itemId, qty] of Object.entries(order.quantities)) {
          if (qty > 0) {
            itemCount += qty;
            const item = (round.items || []).find((i) => i.id === itemId);
            if (item) foodCents += item.priceCents * qty;
          }
        }
      }

      return {
        ...person,
        itemCount,
        foodTotal: foodCents / 100,
        hasOrdered: itemCount > 0
      };
    });
  }, [round]);

  const orderedCount = crewMembers.filter((m) => m.hasOrdered).length;
  const roundLink = round ? `${window.location.origin}/?round=${encodeURIComponent(round.slug)}` : "";
  const qrSvg = useMemo(() => roundLink ? generateQrSvg(roundLink, { size: 220 }) : "", [roundLink]);

  // ==========================================
  // VIEW: ACTIVE ROUND
  // ==========================================
  if (round) {
    return (
      <section className="mx-auto max-w-6xl pt-9">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow="ACTIVE LUNCH ROUND"
            title={round.title}
            accent="."
            description="Manage your team session, share with colleagues, and lock orders when ready."
          />
          <div className="flex flex-wrap items-center gap-2">
            {onRefreshRound && (
              <button
                type="button"
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-50"
                disabled={refreshing}
                onClick={handleRefresh}
              >
                {refreshing ? "Refreshing…" : "↻ Refresh crew"}
              </button>
            )}
            {isOrganizer && (
              <button
                type="button"
                className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-50"
                onClick={startEditingRound}
              >
                ⚙ Edit settings
              </button>
            )}
          </div>
        </div>

        {/* Edit Round Settings Modal */}
        {isEditingRound && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
            <Card className="w-full max-w-md shadow-2xl">
              <h2 className="mb-1 font-display text-base font-bold text-ink">Edit Round Settings</h2>
              <p className="mb-4 text-xs text-stone-500">Update title, ordering window deadline, or delivery fee.</p>
              <form className="grid gap-3.5" onSubmit={handleSaveEditedRound}>
                <div className="grid gap-1">
                  <label className="text-[10px] font-bold text-stone-700" htmlFor="edit-round-title">Title</label>
                  <input
                    id="edit-round-title"
                    className="h-9 rounded-lg border border-stone-200 px-3 text-xs outline-none focus:border-green-400"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    required
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-[10px] font-bold text-stone-700" htmlFor="edit-round-closes">Orders close at</label>
                  <input
                    id="edit-round-closes"
                    type="datetime-local"
                    className="h-9 rounded-lg border border-stone-200 px-3 text-xs text-stone-600 outline-none focus:border-green-400"
                    value={editClosesAt}
                    onChange={(e) => setEditClosesAt(e.target.value)}
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-[10px] font-bold text-stone-700" htmlFor="edit-round-fee">Delivery / Service Fee ({currency})</label>
                  <input
                    id="edit-round-fee"
                    type="number"
                    step="0.01"
                    min="0"
                    className="h-9 rounded-lg border border-stone-200 px-3 text-xs outline-none focus:border-green-400"
                    value={editFee}
                    onChange={(e) => setEditFee(e.target.value)}
                  />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-stone-200 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-50"
                    onClick={() => setIsEditingRound(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-lunch px-4 py-1.5 text-xs font-semibold text-white hover:bg-lunch-dark"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </Card>
          </div>
        )}

        {/* QR Code Modal */}
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
            <Card className="w-full max-w-sm text-center shadow-2xl">
              <h2 className="mb-1 font-display text-base font-bold text-ink">Scan to Join Lunch</h2>
              <p className="mb-4 text-xs text-stone-500">Point your smartphone camera to open and join this round.</p>
              <div
                className="mx-auto mb-4 inline-block overflow-hidden rounded-xl border border-stone-200 p-3 bg-white"
                dangerouslySetInnerHTML={{ __html: qrSvg }}
              />
              <p className="mb-4 truncate text-[9px] text-stone-400 bg-stone-50 rounded p-1.5">{roundLink}</p>
              <button
                type="button"
                className="w-full rounded-lg bg-lunch py-2 text-xs font-semibold text-white hover:bg-lunch-dark"
                onClick={() => setShowQrModal(false)}
              >
                Done
              </button>
            </Card>
          </div>
        )}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="grid gap-4">
            {/* Shortlist Card */}
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="mb-1 block text-[8px] font-bold tracking-widest text-stone-400">
                    RESTAURANTS IN THIS ROUND
                  </span>
                  <h2 className="font-display text-base font-bold text-ink">
                    {(round.shortlist || []).length} {(round.shortlist || []).length === 1 ? "restaurant" : "restaurants"} selected
                  </h2>
                </div>
                <span
                  className={`rounded-full border px-3 py-1 text-[9px] font-semibold ${
                    locked
                      ? "border-stone-200 bg-stone-100 text-stone-600"
                      : "border-green-200 bg-green-50 text-green-800"
                  }`}
                >
                  {round.status}
                </span>
              </div>
              <div className="mt-4 grid gap-2">
                {(round.shortlist || []).map((store) => (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-100 px-3 py-2.5 bg-stone-50/50" key={store._id}>
                    <div>
                      <strong className="block text-xs text-stone-800">🍴 {store.name}</strong>
                    </div>
                    {store.rating != null && (
                      <span className="text-[10px] font-semibold text-amber-700">
                        ★ {Number(typeof store.rating === "object" ? store.rating.value : store.rating).toFixed(1)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            {/* Share & Invite Card */}
            <div className="grid gap-4">
              <CopyRoundLink link={roundLink} onCopy={onCopyLink} />
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="mb-0.5 font-display text-sm font-bold text-ink">More ways to share</h2>
                    <p className="mb-0 text-[10px] text-stone-500">Colleagues can join using their name without downloading anything.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-stone-700 hover:bg-stone-50"
                      type="button"
                      onClick={() => setShowQrModal(true)}
                    >
                      📱 QR Code
                    </button>
                    <button
                      className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-stone-700 hover:bg-stone-50"
                      type="button"
                      onClick={handleShareNative}
                    >
                      Share…
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          </div>

          {/* ASIDE: Crew & Closing Controls */}
          <aside className="grid gap-4">
            {/* Lunch Crew with Live Order Status */}
            <Card>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="mb-0.5 font-display text-sm font-bold text-ink">Your lunch crew</h2>
                  <p className="mb-0 text-[10px] text-stone-500">
                    {orderedCount} of {crewMembers.length} placed an order
                  </p>
                </div>
                <span className="text-xl text-green-700" aria-hidden="true">♧</span>
              </div>

              <div className="my-4 divide-y divide-stone-100 max-h-60 overflow-y-auto">
                {crewMembers.map((person, index) => (
                  <div className="flex items-center justify-between py-2 text-xs" key={person._id || person.participantId || index}>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-bold ${["bg-purple-100 text-purple-800", "bg-orange-100 text-orange-800", "bg-green-100 text-green-800", "bg-blue-100 text-blue-800"][index % 4]}`}>
                        {initials(person.name)}
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate font-semibold text-stone-800">
                          {person.name} {person.isOrganizer && <span className="font-normal text-stone-400">· organizer</span>}
                        </span>
                        <span className="text-[9px] text-stone-400">
                          {person.hasOrdered ? `${person.itemCount} items (${euro(person.foodTotal, currency)})` : "Browsing · 0 items"}
                        </span>
                      </div>
                    </div>
                    <div>
                      {person.hasOrdered ? (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[8px] font-bold text-green-800">
                          ✓ Order in
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[8px] font-medium text-amber-700 border border-amber-200">
                          Choosing
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {!crewMembers.length && (
                  <p className="py-4 text-center text-xs text-stone-400">
                    No participants have joined yet. Share the link above!
                  </p>
                )}
              </div>

              <div className="grid gap-2">
                <button
                  className="flex min-h-9 w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-3 text-[10px] font-semibold text-stone-700 hover:bg-stone-50"
                  type="button"
                  onClick={onNavigateOrder}
                >
                  <span>Open participant orders</span>
                  <span>→</span>
                </button>
                {onNavigateBill && (
                  <button
                    className="flex min-h-9 w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-3 text-[10px] font-semibold text-stone-700 hover:bg-stone-50"
                    type="button"
                    onClick={onNavigateBill}
                  >
                    <span>View final bill & summary</span>
                    <span>→</span>
                  </button>
                )}
              </div>
            </Card>

            {/* Orders Deadline & Lock Controls */}
            <Card className="border-green-100 bg-green-50 p-4 shadow-none">
              <span className="text-xl text-green-700" aria-hidden="true">◷</span>
              <div className="mb-1 mt-2 text-[8px] font-bold tracking-widest text-stone-500">ORDERS CLOSE</div>
              <div className="font-display text-2xl font-bold tracking-wide text-green-950">
                {locked ? "CLOSED" : hasDeadline ? countdown : "No deadline"}
              </div>
              <p className="mb-4 mt-1 text-[9px] text-stone-500">
                {hasDeadline ? `Closes ${dateLabel} at ${timeLabel}` : "There is no scheduled closing time."}
              </p>

              {isOrganizer && (
                <div className="grid gap-2">
                  {!locked ? (
                    <button
                      className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-lunch-dark text-[10px] font-semibold text-white hover:bg-green-950 disabled:opacity-50 shadow-sm"
                      type="button"
                      disabled={loading}
                      onClick={onLockOrders}
                    >
                      Lock orders now →
                    </button>
                  ) : (
                    <>
                      <div className="rounded-lg bg-stone-100 p-2 text-center text-[10px] font-semibold text-stone-700">
                        ✓ Orders are locked
                      </div>
                      {onUnlockOrders && round.status !== "settled" && (
                        <button
                          className="flex min-h-8 w-full items-center justify-center rounded-lg border border-stone-200 bg-white text-[9px] font-semibold text-stone-600 hover:bg-stone-50"
                          type="button"
                          disabled={loading}
                          onClick={onUnlockOrders}
                        >
                          Unlock orders
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}

              {!isOrganizer && participant && (
                <p className="mb-0 text-[9px] text-stone-500">
                  You joined as {participant.name}.
                </p>
              )}
            </Card>

            {/* Secondary actions */}
            {isOrganizer && (
              <div className="grid gap-2">
                <button
                  className="min-h-9 rounded-lg border border-stone-200 bg-white text-[10px] font-semibold text-stone-600 hover:bg-stone-50"
                  type="button"
                  disabled={loading}
                  onClick={onNewRound}
                >
                  Create another round
                </button>
                {onDeleteRound && (
                  <button
                    className="min-h-8 rounded-lg px-3 text-[9px] font-medium text-red-600 hover:bg-red-50"
                    type="button"
                    disabled={loading}
                    onClick={handleDelete}
                  >
                    Cancel & delete round
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>
    );
  }

  // ==========================================
  // VIEW: CREATE NEW ROUND
  // ==========================================
  return (
    <section className="mx-auto max-w-6xl pt-9">
      <SectionHeading
        eyebrow="YOUR LUNCH SESSION"
        title="Let’s get lunch"
        accent="going."
        description="Choose restaurants from the active catalogue, set an optional deadline and fee, and invite your team to pick."
      />
      <div className={`grid items-start gap-5 ${user ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_330px]"}`}>
        <div className="grid gap-4">
          <Card>
            <div className="mb-4 flex items-start gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-lunch-soft text-[9px] font-bold text-lunch">
                01
              </span>
              <div>
                <h2 className="mb-0.5 font-display text-sm font-bold text-ink">Create a lunch round</h2>
                <p className="mb-0 text-[10px] text-stone-500">Select restaurants and save round details to MongoDB.</p>
              </div>
            </div>

            <form className="grid gap-4" onSubmit={submitRound}>
              {/* Title Input */}
              <div className="grid gap-1.5">
                <label className="text-[10px] font-bold text-stone-700" htmlFor="round-title">
                  Lunch title
                </label>
                <input
                  className="h-9 rounded-lg border border-stone-200 bg-transparent px-3 text-xs outline-none focus:border-green-400"
                  id="round-title"
                  required
                  maxLength={120}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="e.g. Friday Team Lunch"
                />
              </div>

              {/* Deadline Input with Quick Presets */}
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-stone-700" htmlFor="round-closes">
                    Orders close at <span className="font-normal text-stone-400">(optional)</span>
                  </label>
                  {closesAt && (
                    <button
                      type="button"
                      className="text-[9px] text-stone-400 hover:text-stone-700"
                      onClick={() => setClosesAt("")}
                    >
                      Clear deadline
                    </button>
                  )}
                </div>
                <input
                  className="h-9 rounded-lg border border-stone-200 bg-transparent px-3 text-xs text-stone-600 outline-none focus:border-green-400"
                  id="round-closes"
                  type="datetime-local"
                  value={closesAt}
                  onChange={(event) => setClosesAt(event.target.value)}
                />

                {/* Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[9px] text-stone-400">Quick presets:</span>
                  <button
                    type="button"
                    className="rounded-md border border-stone-200 px-2 py-0.5 text-[9px] font-medium text-stone-600 hover:bg-stone-50"
                    onClick={() => setPresetMinutes(15)}
                  >
                    +15m
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-stone-200 px-2 py-0.5 text-[9px] font-medium text-stone-600 hover:bg-stone-50"
                    onClick={() => setPresetMinutes(30)}
                  >
                    +30m
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-stone-200 px-2 py-0.5 text-[9px] font-medium text-stone-600 hover:bg-stone-50"
                    onClick={() => setPresetMinutes(45)}
                  >
                    +45m
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-stone-200 px-2 py-0.5 text-[9px] font-medium text-stone-600 hover:bg-stone-50"
                    onClick={() => setPresetMinutes(60)}
                  >
                    +1h
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-stone-200 px-2 py-0.5 text-[9px] font-medium text-stone-600 hover:bg-stone-50"
                    onClick={() => setPresetClock(12, 30)}
                  >
                    12:30
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-stone-200 px-2 py-0.5 text-[9px] font-medium text-stone-600 hover:bg-stone-50"
                    onClick={() => setPresetClock(13, 0)}
                  >
                    13:00
                  </button>
                </div>
              </div>

              {/* Delivery / Service Fee Input */}
              <div className="grid gap-1.5">
                <label className="text-[10px] font-bold text-stone-700" htmlFor="round-fee">
                  Round delivery / service fee <span className="font-normal text-stone-400">(optional, split across team)</span>
                </label>
                <input
                  className="h-9 rounded-lg border border-stone-200 bg-transparent px-3 text-xs outline-none focus:border-green-400"
                  id="round-fee"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g. 2.50"
                  value={feeInput}
                  onChange={(event) => setFeeInput(event.target.value)}
                />
              </div>

              {/* Restaurant Catalogue & Search */}
              <div className="grid gap-2 pt-2 border-t border-stone-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="text-[10px] font-bold text-stone-700" htmlFor="store-search">
                      Choose restaurants
                    </label>
                    <p className="mb-0 text-[9px] text-stone-400">Search the active restaurant catalogue in MongoDB.</p>
                  </div>
                  {onSelectMultipleStores && filteredStores.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        className="text-[9px] font-semibold text-lunch hover:underline"
                        onClick={() => onSelectMultipleStores(filteredStores.map((s) => s._id))}
                      >
                        Select all visible
                      </button>
                      <span className="text-stone-300">·</span>
                      <button
                        type="button"
                        className="text-[9px] text-stone-500 hover:text-stone-800"
                        onClick={() => onSelectMultipleStores([])}
                      >
                        Clear selection
                      </button>
                    </div>
                  )}
                </div>

                <input
                  className="h-9 rounded-lg border border-stone-200 bg-transparent px-3 text-xs outline-none focus:border-green-400"
                  id="store-search"
                  value={storeSearch}
                  onChange={(event) => onStoreSearch(event.target.value)}
                  placeholder="Search restaurant names or cuisines…"
                />

                {/* Cuisine Filter Chips */}
                {availableCuisines.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      type="button"
                      className={`rounded-md px-2 py-0.5 text-[9px] font-semibold transition ${
                        selectedCuisineFilter === "all"
                          ? "bg-lunch text-white shadow-sm"
                          : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                      }`}
                      onClick={() => setSelectedCuisineFilter("all")}
                    >
                      All cuisines
                    </button>
                    {availableCuisines.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`rounded-md px-2 py-0.5 text-[9px] font-semibold transition ${
                          selectedCuisineFilter === c
                            ? "bg-lunch text-white shadow-sm"
                            : "bg-stone-50 text-stone-600 hover:bg-stone-100"
                        }`}
                        onClick={() => setSelectedCuisineFilter(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected Stores Tray */}
                {selectedStoresList.length > 0 && (
                  <div className="my-1 rounded-lg border border-green-200 bg-green-50/60 p-2.5">
                    <div className="flex items-center justify-between text-[9px] font-semibold text-green-900 mb-1.5">
                      <span>{selectedStoreIds.length} restaurant{selectedStoreIds.length === 1 ? "" : "s"} selected for this round</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStoresList.map((store) => (
                        <span
                          key={store._id}
                          className="inline-flex items-center gap-1 rounded-full bg-white border border-green-200 px-2 py-0.5 text-[9px] text-green-900"
                        >
                          🍴 {store.name}
                          <button
                            type="button"
                            className="text-stone-400 hover:text-red-600 ml-0.5 font-bold"
                            onClick={() => onToggleStore(store._id)}
                            title="Remove restaurant"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {storesLoading && <p className="mb-0 text-[10px] text-stone-500">Searching the database…</p>}
                {storesError && <p className="mb-0 text-[10px] text-red-700" role="alert">{storesError}</p>}
                {!storesLoading && !storesError && stores.length === 0 && (
                  <p className="mb-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[10px] leading-relaxed text-amber-900">
                    No active restaurants were returned by the database. Add restaurant catalogue data to MongoDB before creating a round.
                  </p>
                )}

                {/* Store Cards List */}
                <div className="grid gap-2 max-h-72 overflow-y-auto">
                  {filteredStores.map((store) => {
                    const selected = selectedStoreIds.includes(store._id);
                    return (
                      <button
                        className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                          selected ? "border-green-400 bg-green-50/70" : "border-stone-200 bg-white hover:bg-stone-50"
                        }`}
                        type="button"
                        key={store._id}
                        aria-pressed={selected}
                        onClick={() => onToggleStore(store._id)}
                      >
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${selected ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-500"}`}>
                          {selected ? "✓" : "＋"}
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong className="block truncate text-xs text-stone-800">{store.name}</strong>
                          <small className="mt-0.5 block truncate text-[9px] text-stone-500">
                            {[store.location?.cityLabel, ...(store.taxonomy?.cuisineLabels || []).slice(0, 2)].filter(Boolean).join(" · ")}
                          </small>
                        </span>
                        <div className="text-right">
                          {store.rating != null && (
                            <span className="block text-[9px] text-amber-700 font-semibold">
                              ★ {Number(typeof store.rating === "object" ? store.rating.value : store.rating).toFixed(1)}
                            </span>
                          )}
                          <span className="whitespace-nowrap text-[9px] text-stone-600">
                            {store.delivery?.fee?.amount == null ? "" : euro(store.delivery.fee.amount)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                className="mt-2 min-h-10 rounded-lg bg-lunch-dark px-4 text-xs font-semibold text-white shadow-sm hover:bg-green-950 disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                disabled={loading || !user || !selectedStoreIds.length}
              >
                {loading ? "Creating round…" : `Create round with ${selectedStoreIds.length} restaurant${selectedStoreIds.length === 1 ? "" : "s"}`}
              </button>
              {!user && (
                <p className="mb-0 text-center text-[9px] text-stone-400">
                  Sign in or create an organizer account to save this round to the database.
                </p>
              )}
            </form>
          </Card>
        </div>

        {!user && (
          <aside>
            <Card>
              <span className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-lunch-soft text-lunch">↗</span>
              <h2 className="mb-1 font-display text-sm font-bold text-ink">Organizer account</h2>
              <p className="mb-4 text-xs leading-relaxed text-stone-500">
                Sign in to create, edit, and manage lunch rounds attached to your account.
              </p>
              <button
                className="min-h-9 w-full rounded-lg border border-stone-200 bg-white text-xs font-semibold text-stone-700 hover:bg-stone-50"
                type="button"
                onClick={onSignIn}
              >
                Go to sign in
              </button>
            </Card>
          </aside>
        )}
      </div>
    </section>
  );
}

export default OrganizeLunch;
