import { euro, initials, safeNumber } from "../../utils";
import type { HistoryRound } from "../../types";

interface HistoryProps {
  rounds: HistoryRound[];
  loading: boolean;
  error: string;
  signedIn: boolean;
  onOpenRound: (slug: string) => void;
}

function History({ rounds, loading, error, signedIn, onOpenRound }: HistoryProps) {
  return (
    <section className="mx-auto max-w-6xl pt-9">
      <div className="mb-7">
        <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />YOUR WORKSPACE</div>
        <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">Lunch <span className="text-lunch">history.</span></h1>
        <p className="mb-0 text-xs leading-relaxed text-stone-500">Rounds and finalized bills saved by the backend.</p>
      </div>

      {error && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] text-amber-900" role="status">{error}</p>}
      {loading ? (
        <article className="rounded-xl border border-stone-200 bg-white p-8 text-center text-[10px] text-stone-500 shadow-sm">Loading your saved rounds…</article>
      ) : rounds.length ? (
        <div className="grid gap-3">
          {rounds.map((round) => {
            const totalCents = round.settlementView?.totalCents ?? round.settlementView?.orderTotalCents ?? round.settlement?.orderTotalCents ??
              (round.orders || []).reduce((sum, order) => sum + safeNumber(order.totalCents), 0);
            const participants = round.participants || [];
            const savedDate = round.settlement?.frozenAt || round.updatedAt || round.createdAt;
            return (
              <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" key={round._id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0"><h2 className="mb-1 truncate font-display text-sm font-bold">{round.title || "Team lunch"}</h2><p className="mb-0 text-[9px] text-stone-500">{savedDate ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(savedDate)) : "Date unavailable"} · {participants.length} participant{participants.length === 1 ? "" : "s"}</p></div>
                  <div className="flex items-center gap-3"><span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[8px] font-semibold capitalize text-stone-600">{round.status}</span><strong className="font-display text-base text-lunch-dark">{euro(totalCents / 100, round.currency)}</strong></div>
                </div>
                {!!participants.length && <div className="mt-4 flex flex-wrap gap-2">{participants.slice(0, 6).map((person) => <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-50 px-2 py-1 text-[8px] text-stone-600" key={person._id}><span className="grid h-4 w-4 place-items-center rounded-full bg-green-100 text-[7px] font-bold text-green-900">{initials(person.name || "?")}</span>{person.name}</span>)}</div>}
                <div className="mt-4 flex justify-end border-t border-stone-100 pt-3"><button className="min-h-8 rounded-lg border border-stone-200 bg-white px-3 text-[9px] font-semibold text-stone-700 hover:bg-stone-50" type="button" onClick={() => onOpenRound(round.slug || round._id)}>Open round →</button></div>
              </article>
            );
          })}
        </div>
      ) : (
        <article className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl bg-lunch-soft text-xl text-lunch" aria-hidden="true">▤</span>
          <h2 className="mb-2 font-display text-sm font-bold">{signedIn ? "No lunch rounds yet" : "Sign in to see your rounds"}</h2>
          <p className="mx-auto mb-0 max-w-sm text-[10px] leading-relaxed text-stone-500">{signedIn ? "Rounds you organize or join with your account will be listed here." : "Sign in from Organize lunch to see the rounds associated with your account."}</p>
        </article>
      )}
    </section>
  );
}

export default History;
