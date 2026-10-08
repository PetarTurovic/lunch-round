import { useEffect, useMemo, useState } from "react";
import FinalBill from "./components/FinalBill/FinalBill";
import History from "./components/History/History";
import LogIn from "./components/LogIn/LogIn";
import OrderLunch from "./components/OrderLunch/OrderLunch";
import OrganizeLunch from "./components/OrganizeLunch/OrganizeLunch";
import Settings from "./components/Settings/Settings";
import { apiRequest, jsonBody } from "./backendClient";
import { euro, safeNumber, playChime } from "./utils";
import type {
  AuthDetails,
  HistoryRound,
  OrderMenuItem,
  Participant,
  ParticipantOrder,
  RoundItem,
  Round,
  RoundUpdateDetails,
  Session,
  Store,
  StoreSummary,
  Theme,
  User,
  UserProfile,
  View
} from "./types";

const SESSION_KEY = "lunchround-session-v1";
const navItems: { id: View; label: string; icon: string }[] = [
  { id: "setup", label: "Organize lunch", icon: "◫" },
  { id: "order", label: "Order lunch", icon: "⌑" },
  { id: "ledger", label: "Final bill", icon: "▤" },
  { id: "history", label: "History", icon: "◷" },
  { id: "settings", label: "Settings", icon: "⚙" }
];

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unexpected error occurred.";
}

function readSession(): Session {
  try {
    const saved = localStorage.getItem(SESSION_KEY);
    const session: Partial<Session> = saved ? JSON.parse(saved) as Partial<Session> : {};
    const params = new URLSearchParams(window.location.search);
    return {
      authToken: typeof session.authToken === "string" ? session.authToken : "",
      user: session.user && typeof session.user.name === "string" ? session.user : null,
      roundSlug: params.get("round") || session.roundSlug || "",
      participantToken: params.get("participantToken") || session.participantToken || ""
    };
  } catch (error) {
    console.error("Could not load the saved LunchRound session.", error);
    return { authToken: "", user: null, roundSlug: "", participantToken: "" };
  }
}

function readSavedTheme(): Theme {
  try {
    return localStorage.getItem("lunchround-theme") === "dark" ? "dark" : "light";
  } catch (error) {
    console.error("Could not load the saved theme preference.", error);
    return "light";
  }
}

function normalizeRound(source: Round): Round {
  const items = Array.isArray(source.items) ? source.items : [];
  const orders = Array.isArray(source.orders) ? source.orders : [];
  const participants = orders.map((order) => {
    const participantId = String(order.participantId || "");
    return {
      _id: participantId,
      participantId,
      name: order.name || "Participant",
      isOrganizer: participantId === String(source.organizer?.participantId || ""),
      userId: order.userId || undefined
    };
  });
  const selections = orders.flatMap((order) => Object.entries(order.quantities || {})
    .filter(([, quantity]) => quantity > 0)
    .flatMap(([itemId, quantity]) => {
      const item = items.find((entry) => entry.id === itemId);
      if (!item || !order.participantId) return [];
      return [{
        _id: `${order.participantId}:${item.id}`,
        participantId: String(order.participantId),
        storeId: item.storeId || item.storeName || "restaurant",
        itemId: item.id,
        quantity,
        status: "active",
        unitPriceCents: item.priceCents,
        itemSnapshot: { name: item.name, imageUrl: item.imageUrl }
      }];
    }));
  const storesById = new Map<string, StoreSummary>();
  for (const item of items) {
    if (item.storeId && item.storeName) {
      storesById.set(item.storeId, { _id: item.storeId, name: item.storeName });
    }
  }
  const foodTotals = orders.map((order) => Object.entries(order.quantities || {}).reduce((sum, [itemId, quantity]) => {
    const item = items.find((entry) => entry.id === itemId);
    return sum + (item?.priceCents || 0) * quantity;
  }, 0));
  const totalFoodCents = foodTotals.reduce((sum, value) => sum + value, 0);
  const feeCents = source.feeCents || 0;
  const totalCents = source.bill?.totalCents ?? totalFoodCents + feeCents;
  const billPeople = source.bill?.people || orders.map((order, index) => ({
    name: order.name || "Participant",
    amountCents: foodTotals[index] + (totalFoodCents ? Math.round(feeCents * foodTotals[index] / totalFoodCents) : 0)
  }));

  return {
    ...source,
    items,
    orders,
    currency: source.currency || "EUR",
    shortlist: source.shortlist?.length ? source.shortlist : Array.from(storesById.values()),
    participants: participants.length ? participants : source.participants || [],
    selections,
    settlementView: {
      isLive: source.status !== "settled",
      totalCents,
      orderTotalCents: totalCents,
      perParticipant: billPeople.map((person, index) => ({
        participantId: String(orders[index]?.participantId || ""),
        participantName: person.name,
        itemsCents: foodTotals[index] || 0,
        adjustmentsCents: person.amountCents - (foodTotals[index] || 0),
        totalCents: person.amountCents
      })),
      frozenAt: source.bill?.settledAt
    },
    settlement: {
      isLive: source.status !== "settled",
      totalCents,
      orderTotalCents: totalCents,
      frozenAt: source.bill?.settledAt
    }
  };
}

function menuItemsForRound(round: Round): OrderMenuItem[] {
  return round.items.map((item: RoundItem) => ({
    id: item.id,
    menuItemId: item.id,
    storeId: item.storeId || item.storeName || "restaurant",
    storeName: item.storeName || round.venue || "Restaurant",
    section: item.section || "",
    name: item.name,
    description: item.description || "",
    price: safeNumber(item.priceCents) / 100,
    currency: round.currency || "EUR",
    imageUrl: item.imageUrl || "",
    selections: round.selections.filter((selection) =>
      selection.itemId === item.id && selection.status === "active"
    )
  }));
}

function App() {
  const [session, setSession] = useState<Session>(readSession);
  const [showLogin, setShowLogin] = useState(() => !session.authToken);
  const [view, setView] = useState<View>("setup");
  const [round, setRound] = useState<Round | null>(null);
  const [participant, setParticipant] = useState<Participant | null>(null);
  const [isOrganizer, setIsOrganizer] = useState(false);
  const [roundLoading, setRoundLoading] = useState(false);
  const [roundError, setRoundError] = useState("");
  const [toast, setToast] = useState("");
  const [now, setNow] = useState(Date.now());
  const [theme, setTheme] = useState<Theme>(readSavedTheme);
  const [storeSearch, setStoreSearch] = useState("");
  const [stores, setStores] = useState<Store[]>([]);
  const [storesLoading, setStoresLoading] = useState(false);
  const [storesError, setStoresError] = useState("");
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([]);
  const [historyRounds, setHistoryRounds] = useState<HistoryRound[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasPlayedChime, setHasPlayedChime] = useState(false);

  // User profile and preferences
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  const [currency, setCurrency] = useState<string>(() => {
    try {
      return localStorage.getItem("lunchround-currency") || "EUR";
    } catch {
      return "EUR";
    }
  });

  const [defaultDuration, setDefaultDuration] = useState<number>(() => {
    try {
      const val = Number(localStorage.getItem("lunchround-duration"));
      return val > 0 ? val : 30;
    } catch {
      return 30;
    }
  });

  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem("lunchround-sound") !== "false";
    } catch {
      return true;
    }
  });

  // Persist session
  useEffect(() => {
    try {
      if (session.authToken || session.roundSlug || session.participantToken) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch (error) {
      console.error("Could not save the LunchRound session.", error);
      setToast("Your browser could not save this session.");
    }
  }, [session]);

  // Persist preferences
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("lunchround-theme", theme);
    } catch (error) {
      console.error("Could not save the selected theme.", error);
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("lunchround-currency", currency);
    } catch {}
  }, [currency]);

  useEffect(() => {
    try {
      localStorage.setItem("lunchround-duration", String(defaultDuration));
    } catch {}
  }, [defaultDuration]);

  useEffect(() => {
    try {
      localStorage.setItem("lunchround-sound", String(soundEnabled));
    } catch {}
  }, [soundEnabled]);

  // Live timer tick
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Toast timeout
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  // Load user profile & stats from backend
  useEffect(() => {
    if (!session.authToken) {
      setUserProfile(null);
      return;
    }
    let cancelled = false;
    async function loadUser() {
      try {
        const result = await apiRequest<{ user: UserProfile }>("/users/me", { token: session.authToken });
        if (!cancelled) setUserProfile(result.user);
      } catch {
        if (!cancelled && session.user) {
          setUserProfile({ name: session.user.name, email: session.user.email });
        }
      }
    }
    loadUser();
    return () => { cancelled = true; };
  }, [session.authToken]);

  // Load round data from backend
  useEffect(() => {
    const slug = session.roundSlug;
    if (!slug) {
      setRound(null);
      setParticipant(null);
      setIsOrganizer(false);
      setRoundLoading(false);
      setRoundError("");
      return undefined;
    }

    let cancelled = false;
    setRoundLoading(true);
    setRoundError("");

    async function loadRound() {
      try {
        const result = await apiRequest<{ round: Round }>(`/rounds/${encodeURIComponent(slug)}`);
        const nextRound = normalizeRound(result.round);
        let nextParticipant: Participant | null = null;
        let organizer = false;
        let invalidParticipantToken = false;

        if (session.participantToken || session.authToken) {
          try {
            const me = await apiRequest<{ participant: Participant | null; isOrganizer: boolean }>(
              `/rounds/${encodeURIComponent(slug)}/me`,
              { token: session.authToken, participantToken: session.participantToken }
            );
            nextParticipant = me.participant
              ? { ...me.participant, _id: String(me.participant.participantId || me.participant._id) }
              : null;
            organizer = Boolean(me.isOrganizer);
          } catch (error) {
            console.error("Could not verify the saved participant session.", error);
            invalidParticipantToken = true;
          }
        }

        if (cancelled) return;
        setRound(nextRound);
        setParticipant(nextParticipant);
        setIsOrganizer(organizer);
        if (invalidParticipantToken) {
          setSession((current) => current.participantToken === session.participantToken
            ? { ...current, participantToken: "" }
            : current);
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Could not load the lunch round from the backend.", error);
        setRoundError(errorMessage(error));
        setRound(null);
        setParticipant(null);
        setIsOrganizer(false);
      } finally {
        if (!cancelled) setRoundLoading(false);
      }
    }

    loadRound();
    return () => { cancelled = true; };
  }, [session.roundSlug, session.participantToken, session.authToken]);

  // Load store catalogue when creating a round
  useEffect(() => {
    if (session.roundSlug || view !== "setup") return undefined;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setStoresLoading(true);
      setStoresError("");
      try {
        const query = new URLSearchParams({ limit: "24", page: "1" });
        if (storeSearch.trim()) query.set("search", storeSearch.trim());
        const result = await apiRequest<{ stores: Store[] }>(`/stores?${query.toString()}`);
        if (!cancelled) setStores(result.stores || []);
      } catch (error) {
        if (!cancelled) {
          console.error("Could not search the restaurant catalogue.", error);
          setStoresError(errorMessage(error));
          setStores([]);
        }
      } finally {
        if (!cancelled) setStoresLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [session.roundSlug, storeSearch, view]);

  // Load history rounds from backend
  useEffect(() => {
    if (view !== "history") return undefined;
    if (!session.authToken) {
      setHistoryRounds([]);
      setHistoryError("");
      return undefined;
    }
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError("");

    async function loadHistory() {
      try {
        const { rounds } = await apiRequest<{ rounds: HistoryRound[] }>("/rounds?limit=50", { token: session.authToken });
        if (!cancelled) setHistoryRounds(rounds.map(normalizeRound));
      } catch (error) {
        if (!cancelled) {
          console.error("Could not load saved rounds from the backend.", error);
          setHistoryError(errorMessage(error));
          setHistoryRounds([]);
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
  }, [view, session.authToken]);

  // Menu items and order calculations
  const visibleItems = useMemo(() => round ? menuItemsForRound(round) : [], [round]);
  const activeSelections = useMemo(
    () => (round?.selections || []).filter((selection) => selection.status === "active"),
    [round]
  );
  const orders = useMemo<ParticipantOrder[]>(() => (round?.participants || []).map((person) => {
    const quantities: Record<string, number> = {};
    const selectionIds: Record<string, string> = {};
    for (const item of visibleItems) {
      const selection = item.selections.find((entry) => String(entry.participantId) === String(person._id));
      quantities[item.id] = selection?.quantity || 0;
      selectionIds[item.id] = selection?._id || "";
    }
    return { id: person._id, name: person.name, quantities, selectionIds };
  }), [round, visibleItems]);

  const currentOrder: ParticipantOrder = orders.find((order) => String(order.id) === String(participant?._id)) || {
    id: "",
    name: participant?.name || "",
    quantities: {},
    selectionIds: {}
  };

  const closesAt = round?.closesAt ? new Date(round.closesAt) : null;
  const hasDeadline = Boolean(closesAt && Number.isFinite(closesAt.getTime()));
  const deadlineElapsed = closesAt !== null && closesAt.getTime() <= now;
  const locked = Boolean(round && (round.status !== "open" || deadlineElapsed));
  const remaining = closesAt ? Math.max(0, closesAt.getTime() - now) : 0;
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const countdown = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const timeLabel = hasDeadline && closesAt
    ? new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(closesAt)
    : "not set";
  const dateLabel = closesAt && closesAt.toDateString() === new Date(now).toDateString()
    ? "today"
    : "at the selected time";

  // Audio chime when countdown reaches zero
  useEffect(() => {
    if (hasDeadline && closesAt && soundEnabled) {
      if (closesAt.getTime() <= now && !hasPlayedChime) {
        playChime();
        setHasPlayedChime(true);
      } else if (closesAt.getTime() > now) {
        setHasPlayedChime(false);
      }
    }
  }, [hasDeadline, closesAt, now, soundEnabled, hasPlayedChime]);

  const pageNames: Record<View, string> = {
    setup: "Organize lunch",
    order: "Order lunch",
    ledger: "Final bill",
    history: "History",
    settings: "Settings"
  };

  function notify(message: string): void {
    setToast(message);
  }

  function setRoundInUrl(slug: string) {
    const url = new URL(window.location.href);
    if (slug) url.searchParams.set("round", slug);
    else url.searchParams.delete("round");
    url.searchParams.delete("participantToken");
    window.history.replaceState({}, "", url);
  }

  function updateSession(changes: Partial<Session>) {
    setSession((current) => ({ ...current, ...changes }));
  }

  async function startNewRound(): Promise<void> {
    updateSession({ roundSlug: "", participantToken: "" });
    setRoundInUrl("");
    setRound(null);
    setParticipant(null);
    setIsOrganizer(false);
    setView("setup");
  }

  async function authenticate({ mode, name, email, password }: AuthDetails): Promise<void> {
    const path = mode === "register" ? "/auth/register" : "/auth/login";
    const body = mode === "register" ? { name, email, password } : { email, password };
    const result = await apiRequest<{ token: string; user: User }>(path, { method: "POST", body: jsonBody(body) });
    updateSession({ authToken: result.token, user: result.user });
    setShowLogin(false);
    setRoundError("");
    notify(mode === "register" ? "Account created." : "Signed in.");
  }

  async function createRound({ title, closesAt, feeCents }: { title: string; closesAt: string; feeCents?: number }): Promise<void> {
    if (!session.authToken) throw new Error("Sign in before creating a lunch round.");
    if (!selectedStoreIds.length) throw new Error("Choose at least one restaurant.");
    const selectedStores = await Promise.all(selectedStoreIds.map(async (storeId) => {
      const { store } = await apiRequest<{ store: Store }>(`/stores/${encodeURIComponent(storeId)}`);
      return store;
    }));
    const items = selectedStores.flatMap((store) => (store.menu?.sections || []).flatMap((section) =>
      (section.items || [])
        .filter((item) => item.available !== false && typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0)
        .map((item) => ({
          id: `${store._id}:${item._id}`,
          name: item.name,
          description: item.description || undefined,
          priceCents: Math.round(Number(item.price) * 100),
          storeId: store._id,
          storeName: store.name,
          section: section.title,
          imageUrl: item.imageUrl || undefined
        }))
    ));
    if (!items.length) throw new Error("The selected restaurants have no available menu items with prices.");
    const result = await apiRequest<{ round: Round; organizerToken: string }>("/rounds", {
      method: "POST",
      token: session.authToken,
      body: jsonBody({
        title,
        currency,
        feeCents: feeCents || 0,
        venue: selectedStores.length === 1 ? selectedStores[0].name : "Multiple restaurants",
        items,
        closesAt: closesAt ? new Date(closesAt).toISOString() : undefined,
        organizerName: session.user?.name
      })
    });
    const nextSlug = result.round.slug;
    setRound(normalizeRound(result.round));
    updateSession({ roundSlug: nextSlug, participantToken: result.organizerToken });
    setRoundInUrl(nextSlug);
    setSelectedStoreIds([]);
    setView("setup");
    notify("Lunch round created and saved to the database.");
  }

  async function updateRoundSettings(changes: RoundUpdateDetails): Promise<void> {
    if (!round) return;
    const result = await apiRequest<{ round: Round }>(`/rounds/${encodeURIComponent(round.slug)}`, {
      method: "PATCH",
      token: session.authToken,
      participantToken: session.participantToken,
      body: jsonBody(changes)
    });
    setRound(normalizeRound(result.round));
    notify("Round settings updated.");
  }

  async function deleteRound(targetSlug?: string): Promise<void> {
    const slug = targetSlug || round?.slug;
    if (!slug) return;
    await apiRequest(`/rounds/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      token: session.authToken,
      participantToken: session.participantToken
    });
    if (slug === round?.slug) {
      await startNewRound();
    } else {
      setHistoryRounds((prev) => prev.filter((r) => r.slug !== slug));
    }
    notify("Lunch round deleted.");
  }

  async function unlockRound(): Promise<void> {
    if (!round) return;
    await updateRoundSettings({ status: "open" });
    notify("Orders unlocked and reopened.");
  }

  async function joinRound(name: string): Promise<void> {
    if (!round) throw new Error("Load a lunch round before joining.");
    const result = await apiRequest<{ token: string; participant: Participant }>(`/rounds/${encodeURIComponent(round.slug)}/join`, {
      method: "POST",
      token: session.authToken,
      body: jsonBody({ name })
    });
    updateSession({ roundSlug: round.slug, participantToken: result.token });
    setRoundInUrl(round.slug);
    await refreshRound();
    notify(`Joined as ${result.participant.name}.`);
  }

  async function refreshRound(): Promise<void> {
    if (!session.roundSlug) return;
    const result = await apiRequest<{ round: Round }>(`/rounds/${encodeURIComponent(session.roundSlug)}`);
    const me = (session.participantToken || session.authToken)
      ? await apiRequest<{ participant: Participant | null; isOrganizer: boolean }>(`/rounds/${encodeURIComponent(session.roundSlug)}/me`, {
          token: session.authToken,
          participantToken: session.participantToken
        })
      : { participant: null, isOrganizer: false };
    setRound(normalizeRound(result.round));
    setParticipant(me.participant
      ? { ...me.participant, _id: String(me.participant.participantId || me.participant._id) }
      : null);
    setIsOrganizer(Boolean(me.isOrganizer));
  }

  async function changeQuantity(item: OrderMenuItem, nextQuantity: number): Promise<void> {
    if (!participant) throw new Error("Join this round before adding menu items.");
    if (locked) throw new Error("This lunch round is locked.");
    if (!round) throw new Error("Load a lunch round before adding menu items.");
    const currentQuantities = round.orders.find((order) =>
      String(order.participantId) === String(participant._id)
    )?.quantities || {};
    const quantities = { ...currentQuantities };
    if (nextQuantity > 0) quantities[item.id] = nextQuantity;
    else delete quantities[item.id];
    await apiRequest(`/rounds/${encodeURIComponent(round.slug)}/order`, {
      method: "POST",
      participantToken: session.participantToken,
      body: jsonBody({ quantities })
    });
    await refreshRound();
  }

  async function lockRound(): Promise<void> {
    if (!isOrganizer) throw new Error("Only the organizer can lock this round.");
    if (!round) throw new Error("Load a lunch round before locking orders.");
    await apiRequest(`/rounds/${encodeURIComponent(round.slug)}/lock`, {
      method: "POST",
      token: session.authToken,
      participantToken: session.participantToken
    });
    await refreshRound();
    notify("Orders locked in the database.");
  }

  async function settleRound(customFeeCents?: number): Promise<void> {
    if (!isOrganizer) throw new Error("Only the organizer can finalize this bill.");
    if (!round) throw new Error("Load a lunch round before finalizing the bill.");
    const body = typeof customFeeCents === "number" ? { feeCents: customFeeCents } : {};
    await apiRequest(`/rounds/${encodeURIComponent(round.slug)}/settle`, {
      method: "POST",
      token: session.authToken,
      participantToken: session.participantToken,
      body: jsonBody(body)
    });
    await refreshRound();
    notify("Final bill saved to the database.");
  }

  async function loadHistoryRound(roundSlug: string): Promise<void> {
    const hasExistingParticipantSession =
      String(roundSlug) === String(session.roundSlug) && Boolean(session.participantToken);
    updateSession({
      roundSlug,
      participantToken: hasExistingParticipantSession ? session.participantToken : ""
    });
    setRoundInUrl(roundSlug);
    setRound(null);
    setParticipant(null);
    setIsOrganizer(false);
    setView("ledger");
  }

  async function copyRoundLink(): Promise<void> {
    if (!round) throw new Error("Load a lunch round before copying its link.");
    const link = `${window.location.origin}/?round=${encodeURIComponent(round.slug)}`;
    try {
      await navigator.clipboard.writeText(link);
      notify("Round link copied. Team members can join with their name.");
    } catch (error) {
      console.error("Could not copy the round link.", error);
      notify("Clipboard access is unavailable. Copy the round link from the address bar.");
    }
  }

  async function updateUserProfileName(name: string): Promise<void> {
    if (!session.authToken) throw new Error("Not signed in");
    const result = await apiRequest<{ user: User }>("/users/me", {
      method: "PATCH",
      token: session.authToken,
      body: jsonBody({ name })
    });
    updateSession({ user: result.user });
    setUserProfile((prev) => prev ? { ...prev, name: result.user.name } : { name: result.user.name });
    notify("Profile name updated.");
  }

  function clearLocalCache(): void {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem("lunchround-currency");
      localStorage.removeItem("lunchround-duration");
      localStorage.removeItem("lunchround-sound");
    } catch {}
    setSession({ authToken: "", user: null, roundSlug: "", participantToken: "" });
    setRound(null);
    setParticipant(null);
    setIsOrganizer(false);
    setRoundInUrl("");
    setView("setup");
    notify("Session cache cleared.");
  }

  async function logout(): Promise<void> {
    updateSession({ authToken: "", user: null });
    setUserProfile(null);
    setShowLogin(true);
    notify("Signed out.");
  }

  const isBusy = busy || roundLoading;
  const finalSelectionRows = activeSelections.map((selection) => {
    const item = visibleItems.find((entry) => entry.id === selection.itemId);
    const person = round?.participants?.find((entry) => String(entry._id) === String(selection.participantId));
    return {
      id: selection._id,
      name: selection.itemSnapshot?.name || item?.name || "Menu item",
      storeName: item?.storeName || "Restaurant",
      personName: person?.name || "Participant",
      quantity: selection.quantity,
      unitPrice: safeNumber(selection.unitPriceCents) / 100,
      total: safeNumber(selection.unitPriceCents) * safeNumber(selection.quantity) / 100,
      overridden: Boolean(selection.priceOverridden)
    };
  });

  const settlement = round?.settlementView || null;
  const totalCents = settlement?.totalCents ?? settlement?.orderTotalCents ??
    (settlement?.perParticipant || []).reduce((sum, line) => sum + safeNumber(line.totalCents), 0);
  const total = settlement
    ? totalCents / 100
    : finalSelectionRows.reduce((sum, item) => sum + item.total, 0);

  const dateText = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(now));

  async function copyBreakdown(): Promise<void> {
    const roundCurrency = round?.currency || currency;
    const lines = (settlement?.perParticipant || []).map((person) =>
      `${person.participantName}: ${euro(safeNumber(person.totalCents) / 100, roundCurrency)}`
    );
    lines.push(`Total: ${euro(total, roundCurrency)}`);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      notify("Bill breakdown copied.");
    } catch (error) {
      console.error("Could not copy the bill breakdown.", error);
      throw new Error("Clipboard access is unavailable.");
    }
  }

  async function runAction(action: () => Promise<void>): Promise<void> {
    setBusy(true);
    setRoundError("");
    try {
      await action();
    } catch (error) {
      console.error("LunchRound backend action failed.", error);
      setRoundError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (showLogin && !session.authToken) {
    return (
      <LogIn
        loading={busy}
        error={roundError}
        onAuthenticate={(details) => runAction(() => authenticate(details))}
        onContinueAsGuest={() => setShowLogin(false)}
        onDismissError={() => setRoundError("")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <aside className="fixed inset-y-0 left-0 z-10 flex w-60 flex-col border-r border-stone-200 bg-white px-4 py-6 max-sm:inset-x-0 max-sm:inset-y-auto max-sm:bottom-0 max-sm:h-[60px] max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:justify-center max-sm:border-r-0 max-sm:border-t max-sm:px-2 max-sm:py-1">
        <a className="flex items-center gap-2 px-2 font-display text-xl font-extrabold tracking-tight text-ink no-underline max-sm:hidden" href="#" aria-label="LunchRound home" onClick={(event) => { event.preventDefault(); setView("setup"); }}>
          <span className="grid h-8 w-8 place-items-center rounded-xl rounded-bl-sm bg-lunch text-base text-white">L</span>
          <span>Lunch Round<span className="text-lunch-orange">.</span></span>
        </a>
        <div className="mb-3 mt-12 px-2 text-[9px] font-bold tracking-widest text-stone-400 max-sm:hidden">YOUR WORKSPACE</div>
        <nav className="grid gap-1 max-sm:flex max-sm:w-full max-sm:max-w-sm max-sm:justify-around" aria-label="Main navigation">
          {navItems.map((item) => (
            <button key={item.id} className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-xs transition hover:bg-stone-100 max-sm:min-h-11 max-sm:flex-col max-sm:gap-0 max-sm:px-1 max-sm:text-[8px] ${view === item.id ? "bg-lunch-soft font-bold text-lunch-dark" : "text-stone-500 hover:text-ink"}`} type="button" onClick={() => setView(item.id)}>
              <span className="grid w-5 place-items-center text-lg max-sm:text-base" aria-hidden="true">{item.icon}</span>{item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto max-sm:hidden">
          <div className="mt-4 flex items-center gap-2 border-t border-stone-100 pt-4">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-purple-100 text-xs font-bold text-purple-800">{session.user?.name?.charAt(0)?.toUpperCase() || "G"}</span>
            <span className="grid min-w-0 gap-0.5"><strong className="truncate text-[10px]">{session.user?.name || (participant?.name || "Guest")}</strong><small className="text-[9px] text-stone-400">{session.user ? "Lunch organizer" : participant ? "Round participant" : "Not signed in"}</small></span>
            {session.user ? (
              <button className="ml-auto border-0 bg-transparent text-[9px] text-stone-400 hover:text-ink" type="button" onClick={logout}>Sign out</button>
            ) : (
              <button className="ml-auto border-0 bg-transparent text-[9px] text-stone-400 hover:text-ink" type="button" onClick={() => { setRoundError(""); setShowLogin(true); }}>Sign in</button>
            )}
          </div>
        </div>
      </aside>

      <main className="ml-60 min-h-screen px-8 pb-14 max-sm:ml-0 max-sm:px-4 max-sm:pb-20">
        <header className="flex h-[72px] items-center justify-between border-b border-stone-200">
          <div className="flex items-center gap-3 text-[10px] text-stone-400"><span>Workspace</span><span>/</span><strong className="font-semibold text-stone-600">{pageNames[view]}</strong></div>
          <div className="flex items-center gap-3 text-[10px] text-stone-500"><span>{dateText}</span><span className="h-5 w-px bg-stone-200" /><span className="rounded-full border border-stone-200 px-2 py-1">{round ? "Connected to database" : "Backend connected"}</span></div>
        </header>

        {roundError && <div className="mt-5 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[11px] text-red-800" role="alert"><span>{roundError}</span><button className="ml-3 bg-transparent font-bold text-red-700" type="button" onClick={() => setRoundError("")} aria-label="Dismiss error">×</button></div>}

        {view === "setup" && (
          <OrganizeLunch
            round={round}
            participant={participant}
            isOrganizer={isOrganizer}
            locked={locked}
            countdown={countdown}
            hasDeadline={hasDeadline}
            dateLabel={dateLabel}
            timeLabel={timeLabel}
            stores={stores}
            storesLoading={storesLoading}
            storesError={storesError}
            storeSearch={storeSearch}
            onStoreSearch={setStoreSearch}
            selectedStoreIds={selectedStoreIds}
            onToggleStore={(id) => setSelectedStoreIds((current) => current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id])}
            onSelectMultipleStores={setSelectedStoreIds}
            user={session.user}
            onSignIn={() => { setRoundError(""); setShowLogin(true); }}
            onCreateRound={(details) => runAction(() => createRound(details))}
            onUpdateRound={(details) => runAction(() => updateRoundSettings(details))}
            onDeleteRound={() => runAction(() => deleteRound())}
            onCopyLink={() => runAction(copyRoundLink)}
            onLockOrders={() => runAction(lockRound)}
            onUnlockOrders={() => runAction(unlockRound)}
            onNavigateOrder={() => setView("order")}
            onNavigateBill={() => setView("ledger")}
            onNewRound={() => runAction(startNewRound)}
            onRefreshRound={() => runAction(refreshRound)}
            loading={isBusy}
          />
        )}

        {view === "order" && (
          <OrderLunch
            round={round}
            items={visibleItems}
            orders={orders}
            currentOrder={currentOrder}
            participant={participant}
            isOrganizer={isOrganizer}
            locked={locked}
            hasDeadline={hasDeadline}
            timeLabel={timeLabel}
            hours={hours}
            minutes={minutes}
            loading={isBusy}
            user={session.user}
            onJoin={(name) => runAction(() => joinRound(name))}
            onChangeQuantity={(item, quantity) => runAction(() => changeQuantity(item, quantity))}
            onNavigateBill={() => setView("ledger")}
            onNewRound={() => runAction(startNewRound)}
            onRefresh={() => runAction(refreshRound)}
          />
        )}

        {view === "ledger" && (
          <FinalBill
            round={round}
            selections={finalSelectionRows}
            settlement={settlement}
            total={total}
            locked={locked}
            isOrganizer={isOrganizer}
            loading={isBusy}
            onLock={() => runAction(lockRound)}
            onReopen={() => runAction(unlockRound)}
            onSettle={(customFeeCents) => runAction(() => settleRound(customFeeCents))}
            onCopyBreakdown={() => runAction(copyBreakdown)}
            onBackToOrders={() => setView("order")}
          />
        )}

        {view === "history" && (
          <History
            rounds={historyRounds}
            loading={historyLoading}
            error={historyError}
            signedIn={Boolean(session.authToken)}
            currency={currency}
            onOpenRound={(slug) => runAction(() => loadHistoryRound(slug))}
            onDeleteRound={(slug) => runAction(() => deleteRound(slug))}
            onSignIn={() => { setRoundError(""); setShowLogin(true); }}
            onNavigateOrganize={() => setView("setup")}
          />
        )}

        {view === "settings" && (
          <Settings
            user={userProfile}
            theme={theme}
            onThemeChange={setTheme}
            currency={currency}
            onCurrencyChange={setCurrency}
            defaultDuration={defaultDuration}
            onDefaultDurationChange={setDefaultDuration}
            soundEnabled={soundEnabled}
            onSoundEnabledChange={setSoundEnabled}
            onUpdateUserName={(name) => runAction(() => updateUserProfileName(name))}
            onSignOut={logout}
            onSignIn={() => { setRoundError(""); setShowLogin(true); }}
            onClearCache={clearLocalCache}
          />
        )}
      </main>
      <div className={`pointer-events-none fixed bottom-6 right-6 z-20 max-w-[calc(100vw-2rem)] rounded-lg bg-stone-800 px-4 py-3 text-[10px] text-white shadow-xl transition-all max-sm:bottom-[72px] max-sm:right-4 ${toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

export default App;
