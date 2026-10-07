import { useState, type FormEvent, type ReactNode } from "react";
import { euro } from "../../utils";
import type { Participant, Round, Store, User } from "../../types";

function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <article className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</article>;
}

function SectionHeading({ eyebrow, title, accent, description }: { eyebrow: string; title: string; accent: string; description: string }) {
  return (
    <div className="mb-7">
      <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />{eyebrow}</div>
      <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">{title} <span className="text-lunch">{accent}</span></h1>
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
  user: User | null;
  onSignIn: () => void;
  onCreateRound: (details: { title: string; closesAt: string }) => Promise<void>;
  onCopyLink: () => Promise<void>;
  onLockOrders: () => Promise<void>;
  onNavigateOrder: () => void;
  onNewRound: () => Promise<void>;
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
  user,
  onSignIn,
  onCreateRound,
  onCopyLink,
  onLockOrders,
  onNavigateOrder,
  onNewRound,
  loading
}: OrganizeLunchProps) {
  const [title, setTitle] = useState("Team lunch");
  const [closesAt, setClosesAt] = useState("");

  async function submitRound(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onCreateRound({ title: title.trim(), closesAt });
  }

  if (round) {
    const team = round.participants || [];
    return (
      <section className="mx-auto max-w-6xl pt-9">
        <SectionHeading eyebrow="YOUR LUNCH SESSION" title={round.title} accent="." description="This lunch round and its orders are being stored by your LunchRound backend." />
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="grid gap-4">
            <Card>
              <div className="flex items-start justify-between gap-3">
                <div><span className="mb-2 block text-[8px] font-bold tracking-widest text-stone-500">RESTAURANTS IN THIS ROUND</span><h2 className="mb-1 font-display text-sm font-bold">{(round.shortlist || []).length} selected</h2></div>
                <span className={`rounded-full border px-3 py-1 text-[9px] font-semibold ${locked ? "border-stone-200 bg-stone-100 text-stone-600" : "border-green-200 bg-green-50 text-green-800"}`}>{round.status}</span>
              </div>
              <div className="mt-4 grid gap-2">
                {(round.shortlist || []).map((store) => (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-stone-100 px-3 py-2.5" key={store._id}>
                    <div><strong className="block text-[10px]">{store.name}</strong></div>
                    {store.rating != null && <span className="text-[9px] text-amber-700">★ {Number(typeof store.rating === "object" ? store.rating.value : store.rating).toFixed(1)}</span>}
                  </div>
                ))}
              </div>
            </Card>
            <Card>
              <div className="flex items-center justify-between gap-3"><div><h2 className="mb-1 font-display text-sm font-bold">Share with your team</h2><p className="mb-0 text-[9px] text-stone-500">Anyone with the link can join using their name.</p></div><button className="min-h-8 rounded-lg bg-lunch px-3 text-[9px] font-semibold text-white hover:bg-lunch-dark" type="button" onClick={onCopyLink}>Copy round link</button></div>
              <p className="mb-0 mt-3 truncate rounded-md bg-stone-50 px-3 py-2 text-[9px] text-stone-500">{window.location.origin}/?round={round.slug}</p>
            </Card>
          </div>
          <aside className="grid gap-4">
            <Card>
              <div className="flex items-start justify-between"><div><h2 className="mb-1 font-display text-sm font-bold">Your lunch crew</h2><p className="mb-0 text-[10px] text-stone-500">{team.length} {team.length === 1 ? "person" : "people"} joined</p></div><span className="text-xl text-green-700" aria-hidden="true">♧</span></div>
              <div className="my-4 grid gap-3">
                {team.map((person, index) => (
                  <div className="flex items-center gap-2.5" key={person._id}>
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-[9px] font-bold ${["bg-purple-100 text-purple-800", "bg-orange-100 text-orange-800", "bg-green-100 text-green-800", "bg-blue-100 text-blue-800"][index % 4]}`}>{person.name?.trim().charAt(0).toUpperCase() || "?"}</span>
                    <span className="min-w-0 flex-1 truncate text-[9px] font-semibold">{person.name}{person.isOrganizer ? " · organizer" : ""}</span>
                  </div>
                ))}
              </div>
              <button className="flex min-h-9 w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-3 text-[10px] font-semibold text-stone-600 hover:bg-stone-50" type="button" onClick={onNavigateOrder}>Open participant orders <span>→</span></button>
            </Card>
            <Card className="border-green-100 bg-green-50 p-4 shadow-none">
              <span className="text-xl text-green-700" aria-hidden="true">◷</span>
              <div className="mb-1 mt-2 text-[8px] font-bold tracking-widest text-stone-500">ORDERS CLOSE</div>
              <div className="font-display text-2xl font-bold tracking-wide text-green-950">{locked ? "CLOSED" : hasDeadline ? countdown : "No deadline"}</div>
              <p className="mb-4 mt-1 text-[9px] text-stone-500">{hasDeadline ? `Closes ${dateLabel} at ${timeLabel}` : "There is no scheduled closing time."}</p>
              {isOrganizer && <button className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-lunch-dark text-[10px] font-semibold text-white hover:bg-green-950 disabled:opacity-50" type="button" disabled={locked || loading} onClick={onLockOrders}>{locked ? "Orders locked ✓" : "Lock orders now →"}</button>}
              {!isOrganizer && participant && <p className="mb-0 text-[9px] text-stone-500">You joined as {participant.name}.</p>}
            </Card>
            {isOrganizer && <button className="min-h-9 rounded-lg border border-stone-200 bg-white text-[10px] font-semibold text-stone-600 hover:bg-stone-50" type="button" disabled={loading} onClick={onNewRound}>Create another round</button>}
          </aside>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl pt-9">
      <SectionHeading eyebrow="YOUR LUNCH SESSION" title="Let’s get lunch" accent="going." description="Choose real restaurants from the database, create a round, and invite your team to order." />
      <div className={`grid items-start gap-5 ${user ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_330px]"}`}>
        <div className="grid gap-4">
          <Card>
            <div className="mb-4 flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-lunch-soft text-[9px] font-bold text-lunch">01</span><div><h2 className="mb-1 font-display text-sm font-bold">Create a lunch round</h2><p className="mb-0 text-[9px] text-stone-500">Round details are saved to MongoDB through the API.</p></div></div>
            <form className="grid gap-4" onSubmit={submitRound}>
              <div className="grid gap-2"><label className="text-[10px] font-bold text-stone-700" htmlFor="round-title">Lunch title</label><input className="h-9 rounded-lg border border-stone-200 bg-transparent px-3 text-[11px] outline-none focus:border-green-400" id="round-title" required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Friday team lunch" /></div>
              <div className="grid gap-2"><label className="text-[10px] font-bold text-stone-700" htmlFor="round-closes">Orders close at <span className="font-normal text-stone-400">(optional)</span></label><input className="h-9 rounded-lg border border-stone-200 bg-transparent px-3 text-[10px] text-stone-600 outline-none focus:border-green-400" id="round-closes" type="datetime-local" value={closesAt} onChange={(event) => setClosesAt(event.target.value)} /></div>
              <div className="grid gap-2">
                <div><label className="text-[10px] font-bold text-stone-700" htmlFor="store-search">Choose restaurants</label><p className="mb-0 mt-1 text-[9px] text-stone-400">Search the active restaurant catalogue.</p></div>
                <input className="h-9 rounded-lg border border-stone-200 bg-transparent px-3 text-[10px] outline-none focus:border-green-400" id="store-search" value={storeSearch} onChange={(event) => onStoreSearch(event.target.value)} placeholder="Search restaurant names or cuisines" />
                {storesLoading && <p className="mb-0 text-[9px] text-stone-500">Searching the database…</p>}
                {storesError && <p className="mb-0 text-[9px] text-red-700" role="alert">{storesError}</p>}
                {!storesLoading && !storesError && stores.length === 0 && (
                  <p className="mb-0 rounded-lg border border-amber-200 bg-amber-50 p-3 text-[9px] leading-relaxed text-amber-900">
                    No active restaurants were returned by the database. Add restaurant catalogue data to MongoDB before creating a round.
                  </p>
                )}
                <div className="grid gap-2">
                  {stores.map((store) => {
                    const selected = selectedStoreIds.includes(store._id);
                    return (
                      <button className={`flex min-h-14 items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${selected ? "border-green-400 bg-green-50" : "border-stone-200 bg-white hover:bg-stone-50"}`} type="button" key={store._id} aria-pressed={selected} onClick={() => onToggleStore(store._id)}>
                        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs ${selected ? "bg-green-100 text-green-800" : "bg-stone-100 text-stone-500"}`}>{selected ? "✓" : "＋"}</span>
                        <span className="min-w-0 flex-1"><strong className="block truncate text-[10px]">{store.name}</strong><small className="mt-1 block truncate text-[8px] text-stone-500">{[store.location?.cityLabel, ...(store.taxonomy?.cuisineLabels || []).slice(0, 2)].filter(Boolean).join(" · ") || store.platform}</small></span>
                        <span className="whitespace-nowrap text-[9px] font-semibold text-stone-600">{store.delivery?.fee?.amount == null ? "" : euro(store.delivery.fee.amount)}</span>
                      </button>
                    );
                  })}
                </div>
                <span className="text-[8px] text-stone-400">{selectedStoreIds.length} restaurant{selectedStoreIds.length === 1 ? "" : "s"} selected</span>
              </div>
              <button className="min-h-10 rounded-lg bg-lunch-dark px-4 text-[10px] font-semibold text-white hover:bg-green-950 disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={loading || !user || !selectedStoreIds.length}>
                {loading ? "Creating round…" : "Create round and save"}
              </button>
              {!user && <p className="mb-0 text-center text-[8px] text-stone-400">Sign in or create an account to organize a round.</p>}
            </form>
          </Card>
        </div>

        {!user && (
          <aside>
            <Card>
              <span className="mb-3 grid h-8 w-8 place-items-center rounded-lg bg-lunch-soft text-lunch">↗</span>
              <h2 className="mb-1 font-display text-sm font-bold">Organizer account</h2>
              <p className="mb-4 text-[9px] leading-relaxed text-stone-500">Sign in to create and manage lunch rounds attached to your account.</p>
              <button className="min-h-9 w-full rounded-lg border border-stone-200 bg-white text-[10px] font-semibold text-stone-700 hover:bg-stone-50" type="button" onClick={onSignIn}>Go to sign in</button>
            </Card>
          </aside>
        )}
      </div>
    </section>
  );
}

export default OrganizeLunch;
