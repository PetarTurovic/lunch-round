import { useMemo, useState } from "react";
import { euro, formatDate, initials, safeNumber, copyToClipboard } from "../../utils";
import type { HistoryRound } from "../../types";

interface HistoryProps {
  rounds: HistoryRound[];
  loading: boolean;
  error: string;
  signedIn: boolean;
  currency?: string;
  onOpenRound: (slug: string) => void;
  onDeleteRound?: (slug: string) => Promise<void>;
  onSignIn?: () => void;
  onNavigateOrganize?: () => void;
}

type StatusFilter = "all" | "settled" | "locked" | "open";
type SortOption = "newest" | "oldest" | "highest" | "participants";

function History({
  rounds,
  loading,
  error,
  signedIn,
  currency = "EUR",
  onOpenRound,
  onDeleteRound,
  onSignIn,
  onNavigateOrganize
}: HistoryProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("newest");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);

  // Statistics calculation across all loaded rounds
  const stats = useMemo(() => {
    const totalCount = rounds.length;
    let totalSpentCents = 0;
    let settledCount = 0;

    for (const r of rounds) {
      const cents = r.settlementView?.totalCents ?? r.settlementView?.orderTotalCents ?? r.settlement?.orderTotalCents ??
        (r.orders || []).reduce((sum, order) => sum + safeNumber(order.totalCents), 0);
      totalSpentCents += cents;
      if (r.status === "settled") settledCount++;
    }

    const avgCents = totalCount > 0 ? Math.round(totalSpentCents / totalCount) : 0;
    return {
      totalCount,
      settledCount,
      totalSpent: totalSpentCents / 100,
      avgRound: avgCents / 100
    };
  }, [rounds]);

  // Filter and sort rounds
  const filteredRounds = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rounds.filter((round) => {
      if (statusFilter !== "all" && round.status !== statusFilter) return false;
      if (!query) return true;

      const titleMatch = (round.title || "").toLowerCase().includes(query);
      const venueMatch = (round.venue || "").toLowerCase().includes(query);
      const participantMatch = (round.participants || []).some((p) =>
        (p.name || "").toLowerCase().includes(query)
      );
      const storeMatch = (round.shortlist || []).some((s) =>
        (s.name || "").toLowerCase().includes(query)
      );

      return titleMatch || venueMatch || participantMatch || storeMatch;
    }).sort((a, b) => {
      const dateA = new Date(a.createdAt || 0).getTime();
      const dateB = new Date(b.createdAt || 0).getTime();
      const totalA = a.settlementView?.totalCents ?? 0;
      const totalB = b.settlementView?.totalCents ?? 0;

      if (sortOption === "newest") return dateB - dateA;
      if (sortOption === "oldest") return dateA - dateB;
      if (sortOption === "highest") return totalB - totalA;
      if (sortOption === "participants") return (b.participants?.length || 0) - (a.participants?.length || 0);
      return 0;
    });
  }, [rounds, search, statusFilter, sortOption]);

  async function handleCopyLink(roundSlug: string) {
    const link = `${window.location.origin}/?round=${encodeURIComponent(roundSlug)}`;
    await copyToClipboard(link);
    setCopiedSlug(roundSlug);
    window.setTimeout(() => setCopiedSlug(null), 2000);
  }

  async function handleDelete(roundSlug: string) {
    if (!onDeleteRound) return;
    if (!window.confirm("Are you sure you want to delete this lunch round? This cannot be undone.")) return;
    setDeletingSlug(roundSlug);
    try {
      await onDeleteRound(roundSlug);
    } finally {
      setDeletingSlug(null);
    }
  }

  return (
    <section className="mx-auto max-w-6xl pt-9">
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
            <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
            ROUND ARCHIVE
          </div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
            Lunch <span className="text-lunch">history.</span>
          </h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">
            All team rounds, finalized bills, and participant rosters saved by the backend.
          </p>
        </div>
        {signedIn && onNavigateOrganize && (
          <button
            type="button"
            className="rounded-lg bg-lunch px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-lunch-dark"
            onClick={onNavigateOrganize}
          >
            ＋ Organize new lunch
          </button>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] text-amber-900" role="status">
          {error}
        </p>
      )}

      {/* Analytics Summary Cards (shown when user is signed in and has rounds) */}
      {signedIn && rounds.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <span className="block text-[8px] font-bold tracking-widest text-stone-400">TOTAL ROUNDS</span>
            <strong className="mt-1 block font-display text-2xl font-bold text-ink">{stats.totalCount}</strong>
            <span className="text-[9px] text-stone-500">{stats.settledCount} settled</span>
          </article>
          <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <span className="block text-[8px] font-bold tracking-widest text-stone-400">TOTAL SPENT</span>
            <strong className="mt-1 block font-display text-2xl font-bold text-lunch-dark">{euro(stats.totalSpent, currency)}</strong>
            <span className="text-[9px] text-stone-500">across all lunches</span>
          </article>
          <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <span className="block text-[8px] font-bold tracking-widest text-stone-400">AVERAGE ROUND</span>
            <strong className="mt-1 block font-display text-2xl font-bold text-ink">{euro(stats.avgRound, currency)}</strong>
            <span className="text-[9px] text-stone-500">per lunch session</span>
          </article>
          <article className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
            <span className="block text-[8px] font-bold tracking-widest text-stone-400">TEAM CREW</span>
            <strong className="mt-1 block font-display text-2xl font-bold text-ink">
              {new Set(rounds.flatMap((r) => (r.participants || []).map((p) => p.name))).size}
            </strong>
            <span className="text-[9px] text-stone-500">unique participants</span>
          </article>
        </div>
      )}

      {/* Search, Filter & Sort Controls */}
      {signedIn && rounds.length > 0 && (
        <article className="mb-5 rounded-xl border border-stone-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-[220px] flex-1 items-center gap-2">
              <input
                type="text"
                className="h-8 w-full rounded-lg border border-stone-200 px-3 text-[11px] outline-none focus:border-green-400"
                placeholder="Search round title, restaurant, or participant name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="rounded px-2 text-xs text-stone-400 hover:text-stone-700"
                  onClick={() => setSearch("")}
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status filter chips */}
              <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                {(["all", "settled", "locked", "open"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    className={`rounded-md px-2.5 py-1 text-[9px] font-semibold capitalize transition ${statusFilter === filter ? "bg-white text-lunch-dark shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                    onClick={() => setStatusFilter(filter)}
                  >
                    {filter}
                  </button>
                ))}
              </div>

              {/* Sort option */}
              <select
                className="h-8 rounded-lg border border-stone-200 bg-white px-2 text-[10px] text-stone-700 outline-none focus:border-green-400"
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                aria-label="Sort past rounds"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="highest">Highest total</option>
                <option value="participants">Most participants</option>
              </select>
            </div>
          </div>
        </article>
      )}

      {loading ? (
        <article className="rounded-xl border border-stone-200 bg-white p-8 text-center text-[11px] text-stone-500 shadow-sm">
          <div className="mx-auto mb-2 h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-lunch" />
          Loading your saved rounds from the database…
        </article>
      ) : !signedIn ? (
        <article className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-xl bg-lunch-soft text-xl text-lunch" aria-hidden="true">
            ▤
          </span>
          <h2 className="mb-2 font-display text-base font-bold text-ink">Sign in to view your round history</h2>
          <p className="mx-auto mb-5 max-w-md text-xs leading-relaxed text-stone-500">
            When you sign in, all lunch rounds you organize or participate in are saved to your account in MongoDB and listed here.
          </p>
          {onSignIn && (
            <button
              className="rounded-lg bg-lunch px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-lunch-dark"
              type="button"
              onClick={onSignIn}
            >
              Sign in or create account
            </button>
          )}
        </article>
      ) : filteredRounds.length > 0 ? (
        <div className="grid gap-3.5">
          {filteredRounds.map((round) => {
            const totalCents = round.settlementView?.totalCents ?? round.settlementView?.orderTotalCents ?? round.settlement?.orderTotalCents ??
              (round.orders || []).reduce((sum, order) => sum + safeNumber(order.totalCents), 0);
            const participants = round.participants || [];
            const savedDate = round.settlement?.frozenAt || round.updatedAt || round.createdAt;
            const shortlist = round.shortlist || [];

            const isSettled = round.status === "settled";
            const isLocked = round.status === "locked";

            return (
              <article
                className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-stone-300"
                key={round._id || round.slug}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-display text-base font-bold text-ink">
                        {round.title || "Team lunch"}
                      </h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[8px] font-semibold capitalize ${
                          isSettled
                            ? "bg-stone-100 text-stone-600 border border-stone-200"
                            : isLocked
                            ? "bg-amber-50 text-amber-800 border border-amber-200"
                            : "bg-green-50 text-green-800 border border-green-200"
                        }`}
                      >
                        {round.status}
                      </span>
                    </div>
                    <p className="mb-0 mt-1 text-[10px] text-stone-500">
                      {formatDate(savedDate)} · {participants.length} {participants.length === 1 ? "participant" : "participants"}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="block text-[8px] font-bold tracking-widest text-stone-400">TOTAL</span>
                    <strong className="font-display text-lg font-bold text-lunch-dark">
                      {euro(totalCents / 100, round.currency || currency)}
                    </strong>
                  </div>
                </div>

                {/* Shortlist restaurant badges */}
                {shortlist.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {shortlist.map((store) => (
                      <span
                        key={store._id}
                        className="rounded-md bg-stone-50 px-2 py-0.5 text-[8px] font-medium text-stone-600 border border-stone-100"
                      >
                        🍴 {store.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Participant badges */}
                {participants.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {participants.slice(0, 8).map((person) => (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-stone-50 px-2 py-0.5 text-[8px] text-stone-600 border border-stone-100"
                        key={person._id || person.participantId || person.name}
                      >
                        <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-green-100 text-[7px] font-bold text-green-900">
                          {initials(person.name || "?")}
                        </span>
                        {person.name}
                      </span>
                    ))}
                    {participants.length > 8 && (
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[8px] text-stone-500">
                        +{participants.length - 8} more
                      </span>
                    )}
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-stone-200 px-2.5 py-1 text-[9px] font-semibold text-stone-600 hover:bg-stone-50"
                      onClick={() => handleCopyLink(round.slug)}
                    >
                      {copiedSlug === round.slug ? "✓ Link copied" : "Copy link"}
                    </button>
                    {onDeleteRound && (
                      <button
                        type="button"
                        className="rounded-lg px-2.5 py-1 text-[9px] font-semibold text-red-600 hover:bg-red-50"
                        disabled={deletingSlug === round.slug}
                        onClick={() => handleDelete(round.slug)}
                      >
                        {deletingSlug === round.slug ? "Deleting…" : "Delete"}
                      </button>
                    )}
                  </div>

                  <button
                    className="rounded-lg bg-lunch px-3.5 py-1 text-[10px] font-semibold text-white hover:bg-lunch-dark shadow-sm"
                    type="button"
                    onClick={() => onOpenRound(round.slug || round._id)}
                  >
                    Open round & final bill →
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <article className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl bg-lunch-soft text-xl text-lunch" aria-hidden="true">
            ▤
          </span>
          <h2 className="mb-2 font-display text-sm font-bold text-ink">No matching lunch rounds</h2>
          <p className="mx-auto mb-4 max-w-sm text-[10px] leading-relaxed text-stone-500">
            {search || statusFilter !== "all"
              ? "Try adjusting your search query or status filter."
              : "You haven’t organized or joined any lunch rounds yet."}
          </p>
          {(search || statusFilter !== "all") && (
            <button
              className="rounded-lg border border-stone-200 px-3 py-1.5 text-[10px] font-semibold text-stone-700 hover:bg-stone-50"
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
              }}
            >
              Reset filters
            </button>
          )}
        </article>
      )}
    </section>
  );
}

export default History;
