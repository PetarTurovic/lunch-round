import type { ReactNode } from "react";
import { euro, initials, safeNumber } from "../../utils";
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
  onSettle: () => void;
  onPriceChange: (id: string, price: number) => void;
  onCopyBreakdown: () => void;
  onBackToOrders: () => void;
}

function FinalBill({
  round,
  selections,
  settlement,
  total,
  locked,
  isOrganizer,
  loading,
  onLock,
  onSettle,
  onPriceChange,
  onCopyBreakdown,
  onBackToOrders
}: FinalBillProps) {
  const participants = settlement?.perParticipant || [];
  const canEditPrices = isOrganizer && round?.status !== "settled";
  const settled = round?.status === "settled";

  return (
    <section className="mx-auto max-w-6xl pt-9">
      <div className="mb-7 flex items-end justify-between gap-5 max-sm:flex-col max-sm:items-start">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />THE FINAL COUNT</div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">Everyone’s <span className="text-lunch">sorted.</span></h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">{round ? "Review shared selections and the current per-person totals." : "Open or create a lunch round to see its final bill."}</p>
        </div>
        {round && <span className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-3 text-[9px] font-semibold ${locked ? "border-stone-200 bg-stone-100 text-stone-600" : "border-green-200 bg-green-50 text-green-800"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ring-4 ${locked ? "bg-stone-500 ring-stone-200" : "bg-green-500 ring-green-100"}`} />
          {settled ? "Bill finalized" : locked ? "Orders locked" : "Preview · Still open"}
        </span>}
      </div>

      {!round ? (
        <Card className="p-8 text-center">
          <h2 className="mb-2 font-display text-sm font-bold">No lunch round selected</h2>
          <p className="mb-0 text-[10px] text-stone-500">Create a round or open a shared round link before reviewing a bill.</p>
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
          <div className="grid gap-4">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-lunch-soft text-[9px] font-bold text-lunch">03</span><div><h2 className="mb-1 font-display text-sm font-bold">Items in this round</h2><p className="mb-0 text-[10px] text-stone-500">Each active selection is listed with its owner and restaurant.</p></div></div>
                <span className="whitespace-nowrap rounded-md border border-stone-200 px-2 py-1.5 text-[8px] text-stone-600">{round.title}</span>
              </div>
              <div className="mt-4">
                {selections.map((selection, index) => (
                  <div className="grid min-h-[60px] grid-cols-[32px_minmax(0,1fr)_38px_82px] items-center gap-2 border-b border-stone-100 sm:grid-cols-[36px_minmax(0,1fr)_50px_100px]" key={selection.id}>
                    <span className={`grid h-8 w-8 place-items-center rounded-lg font-display text-[10px] font-bold ${dishClasses[index % dishClasses.length]}`}>{initials(selection.name)}</span>
                    <span className="min-w-0"><strong className="block truncate text-[9px] text-stone-800">{selection.name}</strong><small className="mt-1 block truncate text-[8px] text-stone-500">{selection.personName} · {selection.storeName}{selection.overridden ? " · adjusted" : ""}</small></span>
                    <span className="text-center text-[9px] text-stone-600"><strong className="text-stone-800">{selection.quantity}</strong> ×</span>
                    {canEditPrices ? (
                      <label className="flex h-[30px] items-center gap-1 rounded-md border border-stone-200 px-2 text-[9px]"><span>{round.currency || "EUR"}</span><input className="w-14 border-0 text-right text-[9px] outline-none" aria-label={`Final unit price for ${selection.name}`} type="number" min="0" step="0.01" key={`${selection.id}-${selection.unitPrice}`} defaultValue={safeNumber(selection.unitPrice)} disabled={loading} onBlur={(event) => { const price = safeNumber(event.target.value); if (price !== selection.unitPrice) onPriceChange(selection.id, price); }} /></label>
                    ) : <strong className="text-right text-[9px]">{euro(selection.unitPrice, round.currency)}</strong>}
                  </div>
                ))}
                {!selections.length && <p className="py-3 text-[10px] text-stone-500">There are no active menu selections yet.</p>}
              </div>
              <div className="flex justify-between py-4 text-[10px] font-semibold"><span>Round total</span><strong className="font-display text-base">{euro(total, round.currency)}</strong></div>
              <div className="flex gap-2 rounded-lg bg-stone-50 p-3 text-[8px] leading-relaxed text-stone-600"><span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border border-stone-300">i</span> Totals use the backend’s cent-based settlement calculation, including restaurant adjustments and rounding.</div>
            </Card>

            <Card className="p-5">
              <div className="flex items-start justify-between gap-3"><div><h2 className="mb-1 font-display text-sm font-bold">Who owes what</h2><p className="mb-0 text-[9px] text-stone-500">Per-person amounts come from the shared round settlement.</p></div><button className="inline-flex min-h-7 items-center rounded-lg border border-stone-200 bg-white px-3 text-[8px] font-semibold text-stone-600 hover:bg-stone-50 disabled:opacity-50" type="button" disabled={!participants.length} onClick={onCopyBreakdown}>Copy breakdown</button></div>
              <div className="mt-3">
                {participants.map((person, index) => (
                  <div className="flex min-h-[54px] items-center gap-2.5 border-b border-stone-100 last:border-0" key={person.participantId || person.participantName || index}>
                    <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-bold ${avatarClasses[index % avatarClasses.length]}`}>{initials(person.participantName || "Participant")}</span>
                    <span className="min-w-0 flex-1"><strong className="block text-[9px]">{person.participantName || "Participant"}</strong><small className="mt-1 block truncate text-[8px] text-stone-500">{euro(person.itemsCents / 100, round.currency)} items · {euro(person.adjustmentsCents / 100, round.currency)} adjustments</small></span>
                    <strong className="whitespace-nowrap font-display text-[11px] font-bold">{euro(person.totalCents / 100, round.currency)}</strong>
                  </div>
                ))}
                {!participants.length && <p className="py-3 text-[10px] text-stone-500">Per-person totals will appear after someone joins the round.</p>}
              </div>
              <div className="flex justify-between gap-3 border-t border-stone-100 pt-3 text-[8px] text-stone-500"><span>{settlement?.isLive ? "Live estimate" : settled ? "Finalized bill" : "Current estimate"}</span><strong className="whitespace-nowrap text-[9px] text-stone-700">{euro(total, round.currency)} total</strong></div>
            </Card>
          </div>

          <aside className="grid gap-4">
            <Card className="border-green-100 bg-green-50 p-5 shadow-none">
              <span className="mb-4 grid h-8 w-8 place-items-center rounded-lg border border-green-200 bg-green-100 text-green-800" aria-hidden="true">✓</span>
              <span className="mb-2 block text-[8px] font-bold tracking-widest text-stone-500">ROUND TOTAL</span>
              <h2 className="mb-2 font-display text-base font-bold">{settled ? "Bill finalized." : locked ? "Orders are locked." : "Still taking orders."}</h2>
              <p className="mb-4 text-[9px] leading-relaxed text-stone-600">{settled ? "The final bill is saved with this round in the database." : "This total is calculated from current selections and adjustments."}</p>
              <div className="flex items-center justify-between border-y border-green-100 py-3 text-[9px] text-stone-600"><span>Team total</span><strong className="font-display text-lg text-lunch-dark">{euro(total, round.currency)}</strong></div>
              <button className="mt-4 flex min-h-9 w-full items-center justify-center rounded-lg border border-green-200 bg-white text-[10px] font-semibold text-green-900 hover:bg-green-100 disabled:opacity-50" type="button" onClick={onBackToOrders}>Back to orders</button>
              {isOrganizer && !locked && <button className="mt-2 flex min-h-9 w-full items-center justify-center rounded-lg bg-lunch-dark text-[10px] font-semibold text-white hover:bg-green-950 disabled:opacity-50" type="button" disabled={loading} onClick={onLock}>Lock orders</button>}
              {isOrganizer && locked && !settled && <button className="mt-2 flex min-h-9 w-full items-center justify-center rounded-lg bg-lunch-dark text-[10px] font-semibold text-white hover:bg-green-950 disabled:opacity-50" type="button" disabled={loading} onClick={onSettle}>{loading ? "Finalizing…" : "Finalize bill"}</button>}
              {!isOrganizer && !settled && <p className="mb-0 mt-3 text-[8px] leading-relaxed text-stone-500">Only the organizer can adjust prices, lock orders, or finalize the bill.</p>}
            </Card>
          </aside>
        </div>
      )}
    </section>
  );
}

export default FinalBill;
