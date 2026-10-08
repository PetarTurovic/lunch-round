import { useState, useMemo, type ReactNode } from "react";
import { euro, initials, safeNumber, copyToClipboard } from "../../utils";
import type { FinalSelection, Round, Settlement } from "../../types";

const avatarClasses = [
  "bg-purple-100 text-purple-800",
  "bg-orange-100 text-orange-800",
  "bg-green-100 text-green-800",
  "bg-blue-100 text-blue-800"
];

const dishClasses = [
  "bg-orange-50 text-orange-800",
  "bg-green-50 text-green-800",
  "bg-purple-50 text-purple-800"
];

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <article className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</article>;
}

interface FinalBillProps {
  round: Round | null;
  selections: FinalSelection[];
  settlement: Settlement | null;
  total: number;
  locked: boolean;
  isOrganizer: boolean;
  loading: boolean;
  onLock: () => void;
  onReopen?: () => void;
  onSettle: (feeCents?: number) => void;
  onCopyBreakdown: () => void;
  onBackToOrders: () => void;
}

type BillTab = "by-dish" | "by-person" | "by-restaurant";

function FinalBill({
  round,
  selections,
  settlement,
  total,
  locked,
  isOrganizer,
  loading,
  onLock,
  onReopen,
  onSettle,
  onCopyBreakdown,
  onBackToOrders
}: FinalBillProps) {
  const [activeTab, setActiveTab] = useState<BillTab>("by-dish");
  const [kitchenCopied, setKitchenCopied] = useState(false);
  const [remindersCopied, setRemindersCopied] = useState(false);

  // Editable fee state for the organizer
  const initialFeeCents = round?.feeCents || 0;
  const [customFeeEuros, setCustomFeeEuros] = useState<string>((initialFeeCents / 100).toFixed(2));
  const [isEditingFee, setIsEditingFee] = useState(false);

  // Paid tracking stored in localStorage per round slug
  const paidStorageKey = round ? `lunchround-paid-${round.slug}` : "";
  const [paidParticipants, setPaidParticipants] = useState<Record<string, boolean>>(() => {
    if (!paidStorageKey) return {};
    try {
      const saved = localStorage.getItem(paidStorageKey);
      return saved ? JSON.parse(saved) as Record<string, boolean> : {};
    } catch {
      return {};
    }
  });

  const participants = settlement?.perParticipant || [];
  const settled = round?.status === "settled";
  const currency = round?.currency || "EUR";

  // Toggle paid status for a participant
  function togglePaid(participantKey: string) {
    setPaidParticipants((prev) => {
      const next = { ...prev, [participantKey]: !prev[participantKey] };
      try {
        if (paidStorageKey) localStorage.setItem(paidStorageKey, JSON.stringify(next));
      } catch (err) {
        console.error("Could not persist paid status", err);
      }
      return next;
    });
  }

  // Group selections by dish (Kitchen / Consolidated Order view)
  const consolidatedDishes = useMemo(() => {
    const map = new Map<string, {
      name: string;
      storeName: string;
      unitPrice: number;
      totalQuantity: number;
      totalPrice: number;
      orderedBy: { personName: string; quantity: number }[];
    }>();

    for (const sel of selections) {
      const key = `${sel.storeName}:::${sel.name}`;
      const existing = map.get(key);
      if (existing) {
        existing.totalQuantity += sel.quantity;
        existing.totalPrice += sel.total;
        const personEntry = existing.orderedBy.find((p) => p.personName === sel.personName);
        if (personEntry) {
          personEntry.quantity += sel.quantity;
        } else {
          existing.orderedBy.push({ personName: sel.personName, quantity: sel.quantity });
        }
      } else {
        map.set(key, {
          name: sel.name,
          storeName: sel.storeName,
          unitPrice: sel.unitPrice,
          totalQuantity: sel.quantity,
          totalPrice: sel.total,
          orderedBy: [{ personName: sel.personName, quantity: sel.quantity }]
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [selections]);

  // Group selections by restaurant
  const groupedByRestaurant = useMemo(() => {
    const map = new Map<string, FinalSelection[]>();
    for (const sel of selections) {
      const list = map.get(sel.storeName) || [];
      list.push(sel);
      map.set(sel.storeName, list);
    }
    return Array.from(map.entries()).map(([storeName, items]) => ({
      storeName,
      items,
      subtotal: items.reduce((sum, item) => sum + item.total, 0),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0)
    }));
  }, [selections]);

  // Copy consolidated kitchen order
  async function handleCopyKitchenOrder() {
    if (!round) return;
    const lines = [
      `ORDER SUMMARY: ${round.title}`,
      `Total dishes: ${consolidatedDishes.reduce((sum, d) => sum + d.totalQuantity, 0)}`,
      ""
    ];

    for (const dish of consolidatedDishes) {
      const owners = dish.orderedBy.map((p) => `${p.personName} (${p.quantity})`).join(", ");
      lines.push(`${dish.totalQuantity} × ${dish.name} [${dish.storeName}] — ${euro(dish.totalPrice, currency)} (${owners})`);
    }

    lines.push("");
    lines.push(`Food total: ${euro(consolidatedDishes.reduce((sum, d) => sum + d.totalPrice, 0), currency)}`);
    if (round.feeCents) {
      lines.push(`Delivery/Fee: ${euro(round.feeCents / 100, currency)}`);
    }
    lines.push(`Final total: ${euro(total, currency)}`);

    await copyToClipboard(lines.join("\n"));
    setKitchenCopied(true);
    window.setTimeout(() => setKitchenCopied(false), 2500);
  }

  // Copy reminder for unpaid participants
  async function handleCopyReminders() {
    if (!round) return;
    const unpaid = participants.filter((p) => !paidParticipants[p.participantId || p.participantName]);
    if (!unpaid.length) return;

    const lines = [
      `Lunch Payment Reminder (${round.title}):`,
      ...unpaid.map((p) => `- ${p.participantName}: ${euro(safeNumber(p.totalCents) / 100, currency)}`),
      "",
      `Please settle your balance with the organizer. Thank you!`
    ];

    await copyToClipboard(lines.join("\n"));
    setRemindersCopied(true);
    window.setTimeout(() => setRemindersCopied(false), 2500);
  }

  // Finalize settlement with custom fee if provided
  function handleFinalize() {
    const feeNumber = parseFloat(customFeeEuros);
    const feeCents = Number.isFinite(feeNumber) && feeNumber >= 0 ? Math.round(feeNumber * 100) : undefined;
    onSettle(feeCents);
  }

  // Paid progress metrics
  const paidCount = participants.filter((p) => paidParticipants[p.participantId || p.participantName]).length;
  const paidAmountCents = participants.reduce((sum, p) =>
    paidParticipants[p.participantId || p.participantName] ? sum + safeNumber(p.totalCents) : sum, 0);

  return (
    <section className="mx-auto max-w-6xl pt-9">
      <div className="mb-7 flex items-end justify-between gap-5 max-sm:flex-col max-sm:items-start">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
            THE FINAL BILL & SETTLEMENT
          </div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
            Everyone’s <span className="text-lunch">sorted.</span>
          </h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">
            {round ? "Review kitchen order consolidation, per-person balances, and track payments." : "Open or create a lunch round to see its final bill."}
          </p>
        </div>
        {round && (
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-3 text-[9px] font-semibold ${
                settled
                  ? "border-green-300 bg-green-50 text-green-900"
                  : locked
                  ? "border-stone-200 bg-stone-100 text-stone-600"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ring-4 ${settled ? "bg-green-600 ring-green-100" : locked ? "bg-stone-500 ring-stone-200" : "bg-amber-500 ring-amber-100"}`} />
              {settled ? "Bill finalized" : locked ? "Orders locked" : "Preview · Still open"}
            </span>
            <button
              type="button"
              className="rounded-lg border border-stone-200 bg-white px-3 py-1 text-[10px] font-semibold text-stone-600 hover:bg-stone-50"
              onClick={() => window.print()}
            >
              🖶 Print receipt
            </button>
          </div>
        )}
      </div>

      {!round ? (
        <Card className="p-8 text-center">
          <h2 className="mb-2 font-display text-sm font-bold text-ink">No lunch round selected</h2>
          <p className="mb-0 text-[10px] text-stone-500">
            Create a round or open a shared round link before reviewing a bill.
          </p>
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_310px]">
          <div className="grid gap-4">
            {/* View Mode Tabs */}
            <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-1" role="tablist">
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition ${
                  activeTab === "by-dish" ? "bg-white text-lunch-dark shadow-sm" : "text-stone-500 hover:text-stone-800"
                }`}
                onClick={() => setActiveTab("by-dish")}
              >
                🍴 By Dish (Kitchen order)
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition ${
                  activeTab === "by-person" ? "bg-white text-lunch-dark shadow-sm" : "text-stone-500 hover:text-stone-800"
                }`}
                onClick={() => setActiveTab("by-person")}
              >
                👥 By Person (Who owes what)
              </button>
              <button
                type="button"
                className={`flex-1 rounded-md py-1.5 text-center text-xs font-semibold transition ${
                  activeTab === "by-restaurant" ? "bg-white text-lunch-dark shadow-sm" : "text-stone-500 hover:text-stone-800"
                }`}
                onClick={() => setActiveTab("by-restaurant")}
              >
                🏬 By Restaurant
              </button>
            </div>

            {/* TAB 1: BY DISH (KITCHEN / ORDER PLACEMENT VIEW) */}
            {activeTab === "by-dish" && (
              <Card>
                <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3">
                  <div>
                    <h2 className="mb-0.5 font-display text-sm font-bold text-ink">Consolidated Kitchen Order</h2>
                    <p className="mb-0 text-[9px] text-stone-500">
                      Combined quantities across all team members to place with the restaurant.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg bg-lunch px-3 py-1.5 text-[9px] font-semibold text-white shadow-sm hover:bg-lunch-dark"
                    onClick={handleCopyKitchenOrder}
                  >
                    {kitchenCopied ? "✓ Order copied!" : "Copy kitchen list"}
                  </button>
                </div>

                <div className="divide-y divide-stone-100">
                  {consolidatedDishes.map((dish, index) => (
                    <div className="flex items-center justify-between gap-3 py-3" key={`${dish.storeName}-${dish.name}`}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[10px] font-bold ${dishClasses[index % dishClasses.length]}`}>
                          {dish.totalQuantity}×
                        </span>
                        <div className="min-w-0">
                          <strong className="block truncate text-xs text-stone-800">{dish.name}</strong>
                          <span className="block truncate text-[9px] text-stone-500">
                            {dish.storeName} · Ordered by: {dish.orderedBy.map((p) => `${p.personName} (${p.quantity})`).join(", ")}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <strong className="block font-display text-xs font-bold text-stone-800">
                          {euro(dish.totalPrice, currency)}
                        </strong>
                        <span className="text-[8px] text-stone-400">
                          {euro(dish.unitPrice, currency)} each
                        </span>
                      </div>
                    </div>
                  ))}

                  {!consolidatedDishes.length && (
                    <p className="py-6 text-center text-xs text-stone-400">
                      No dishes have been ordered in this round yet.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3 text-xs font-semibold">
                  <span>Food subtotal ({consolidatedDishes.reduce((sum, d) => sum + d.totalQuantity, 0)} items)</span>
                  <strong className="font-display text-sm">
                    {euro(consolidatedDishes.reduce((sum, d) => sum + d.totalPrice, 0), currency)}
                  </strong>
                </div>
              </Card>
            )}

            {/* TAB 2: BY PERSON (WHO OWES WHAT & PAYMENT TRACKING) */}
            {activeTab === "by-person" && (
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 pb-3">
                  <div>
                    <h2 className="mb-0.5 font-display text-sm font-bold text-ink">Who Owes What</h2>
                    <p className="mb-0 text-[9px] text-stone-500">
                      Individual shares calculated with fair fee allocation. Mark people as paid as they settle.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-stone-200 px-2.5 py-1 text-[9px] font-semibold text-stone-600 hover:bg-stone-50"
                      onClick={onCopyBreakdown}
                    >
                      Copy breakdown
                    </button>
                    {participants.length > 0 && (
                      <button
                        type="button"
                        className="rounded-lg border border-stone-200 px-2.5 py-1 text-[9px] font-semibold text-stone-600 hover:bg-stone-50"
                        onClick={handleCopyReminders}
                      >
                        {remindersCopied ? "✓ Reminders copied" : "Ping unpaid"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Payment Progress Bar */}
                {participants.length > 0 && (
                  <div className="my-3 rounded-lg bg-stone-50 p-2.5 border border-stone-100">
                    <div className="flex items-center justify-between text-[9px] text-stone-600 mb-1">
                      <span className="font-semibold">
                        Payment status: {paidCount} of {participants.length} paid
                      </span>
                      <strong className="font-display text-lunch-dark">
                        {euro(paidAmountCents / 100, currency)} / {euro(total, currency)}
                      </strong>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                      <div
                        className="h-full bg-lunch transition-all duration-300"
                        style={{ width: `${participants.length > 0 ? (paidCount / participants.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="divide-y divide-stone-100">
                  {participants.map((person, index) => {
                    const participantKey = person.participantId || person.participantName;
                    const isPaid = Boolean(paidParticipants[participantKey]);

                    return (
                      <div
                        className={`flex items-center justify-between gap-3 py-3 transition ${
                          isPaid ? "opacity-75" : ""
                        }`}
                        key={participantKey || index}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span
                            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                              avatarClasses[index % avatarClasses.length]
                            }`}
                          >
                            {initials(person.participantName || "Participant")}
                          </span>
                          <div className="min-w-0">
                            <strong className="block truncate text-xs text-stone-800">
                              {person.participantName || "Participant"}
                              {isPaid && <span className="ml-2 text-[9px] font-normal text-green-700">✓ Paid</span>}
                            </strong>
                            <small className="block truncate text-[9px] text-stone-500">
                              {euro(person.itemsCents / 100, currency)} items
                              {person.adjustmentsCents ? ` + ${euro(person.adjustmentsCents / 100, currency)} fee share` : ""}
                            </small>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <strong className="font-display text-sm font-bold text-stone-800">
                            {euro(person.totalCents / 100, currency)}
                          </strong>
                          <label
                            className="flex cursor-pointer items-center gap-1 rounded-md border border-stone-200 px-2 py-1 text-[9px] font-medium text-stone-600 hover:bg-stone-50"
                            title="Mark as paid by participant"
                          >
                            <input
                              type="checkbox"
                              checked={isPaid}
                              onChange={() => togglePaid(participantKey)}
                              className="accent-lunch"
                            />
                            <span>Paid</span>
                          </label>
                        </div>
                      </div>
                    );
                  })}

                  {!participants.length && (
                    <p className="py-6 text-center text-xs text-stone-400">
                      Per-person totals will appear once participants join and place orders.
                    </p>
                  )}
                </div>
              </Card>
            )}

            {/* TAB 3: BY RESTAURANT */}
            {activeTab === "by-restaurant" && (
              <div className="grid gap-4">
                {groupedByRestaurant.map((group) => (
                  <Card key={group.storeName}>
                    <div className="flex items-center justify-between border-b border-stone-100 pb-2 mb-3">
                      <h3 className="font-display text-sm font-bold text-ink">🍴 {group.storeName}</h3>
                      <span className="text-[10px] font-semibold text-lunch-dark">
                        {euro(group.subtotal, currency)} ({group.itemCount} items)
                      </span>
                    </div>
                    <div className="divide-y divide-stone-100">
                      {group.items.map((item) => (
                        <div className="flex items-center justify-between py-2 text-xs" key={item.id}>
                          <div>
                            <span className="font-medium text-stone-800">{item.name}</span>
                            <span className="ml-2 text-[9px] text-stone-400">({item.personName})</span>
                          </div>
                          <div className="text-right">
                            <span className="text-stone-500 text-[10px]">{item.quantity} × </span>
                            <strong className="font-semibold text-stone-800">{euro(item.total, currency)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}

                {!groupedByRestaurant.length && (
                  <Card>
                    <p className="py-6 text-center text-xs text-stone-400">
                      No restaurant orders found in this round.
                    </p>
                  </Card>
                )}
              </div>
            )}
          </div>

          {/* SIDEBAR: ROUND TOTAL & LIFECYCLE CONTROLS */}
          <aside className="grid gap-4">
            <Card className="border-green-100 bg-green-50 p-5 shadow-none">
              <span className="mb-3 grid h-8 w-8 place-items-center rounded-lg border border-green-200 bg-green-100 text-green-800" aria-hidden="true">
                ✓
              </span>
              <span className="mb-1 block text-[8px] font-bold tracking-widest text-stone-500">ROUND SUMMARY</span>
              <h2 className="mb-2 font-display text-base font-bold text-ink">
                {settled ? "Bill finalized." : locked ? "Orders are locked." : "Taking orders."}
              </h2>
              <p className="mb-4 text-[9px] leading-relaxed text-stone-600">
                {settled
                  ? "This final settlement is recorded in MongoDB and saved to round history."
                  : "Review items and finalize the bill when everyone has finished ordering."}
              </p>

              {/* Editable Delivery/Round Fee (for Organizer) */}
              <div className="mb-3 rounded-lg bg-white p-3 border border-stone-200">
                <div className="flex items-center justify-between text-[10px] text-stone-700 mb-1">
                  <span className="font-semibold">Delivery / Service Fee:</span>
                  {!isEditingFee && isOrganizer && !settled && (
                    <button
                      type="button"
                      className="text-[9px] text-lunch font-semibold hover:underline"
                      onClick={() => setIsEditingFee(true)}
                    >
                      Edit fee
                    </button>
                  )}
                </div>

                {isEditingFee && isOrganizer && !settled ? (
                  <div className="flex items-center gap-1.5 mt-1">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className="h-7 w-24 rounded border border-stone-200 px-2 text-xs outline-none focus:border-green-500"
                      value={customFeeEuros}
                      onChange={(e) => setCustomFeeEuros(e.target.value)}
                    />
                    <button
                      type="button"
                      className="h-7 rounded bg-lunch px-2.5 text-[9px] font-semibold text-white hover:bg-lunch-dark"
                      onClick={() => setIsEditingFee(false)}
                    >
                      Apply
                    </button>
                  </div>
                ) : (
                  <strong className="font-display text-sm text-stone-800">
                    {euro(parseFloat(customFeeEuros) || 0, currency)}
                  </strong>
                )}
              </div>

              <div className="flex items-center justify-between border-y border-green-200 py-3 text-[10px] text-stone-700">
                <span>Final Round Total</span>
                <strong className="font-display text-xl text-lunch-dark">
                  {euro(total, currency)}
                </strong>
              </div>

              <div className="mt-4 grid gap-2">
                <button
                  className="flex min-h-9 w-full items-center justify-center rounded-lg border border-stone-200 bg-white text-[10px] font-semibold text-stone-700 hover:bg-stone-50"
                  type="button"
                  onClick={onBackToOrders}
                >
                  ← Back to orders
                </button>

                {isOrganizer && !locked && !settled && (
                  <button
                    className="flex min-h-9 w-full items-center justify-center rounded-lg bg-lunch-dark text-[10px] font-semibold text-white hover:bg-green-950 disabled:opacity-50"
                    type="button"
                    disabled={loading}
                    onClick={onLock}
                  >
                    Lock orders
                  </button>
                )}

                {isOrganizer && locked && !settled && (
                  <>
                    <button
                      className="flex min-h-9 w-full items-center justify-center rounded-lg bg-lunch-dark text-[10px] font-semibold text-white hover:bg-green-950 disabled:opacity-50 shadow-sm"
                      type="button"
                      disabled={loading}
                      onClick={handleFinalize}
                    >
                      {loading ? "Finalizing…" : "Finalize & settle bill"}
                    </button>
                    {onReopen && (
                      <button
                        className="flex min-h-8 w-full items-center justify-center rounded-lg border border-stone-200 bg-white text-[9px] font-semibold text-stone-600 hover:bg-stone-50"
                        type="button"
                        disabled={loading}
                        onClick={onReopen}
                      >
                        Re-open orders
                      </button>
                    )}
                  </>
                )}

                {!isOrganizer && !settled && (
                  <p className="mb-0 mt-2 text-center text-[8px] leading-relaxed text-stone-500">
                    Only the organizer can lock orders or finalize the bill.
                  </p>
                )}
              </div>
            </Card>
          </aside>
        </div>
      )}
    </section>
  );
}

export default FinalBill;
