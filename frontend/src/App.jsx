import React, { useEffect, useMemo, useState } from "react";
import FinalBill from "./components/FinalBill/FinalBill.jsx";
import History from "./components/History/History.jsx";
import OrderLunch from "./components/OrderLunch/OrderLunch.jsx";
import OrganizeLunch from "./components/OrganizeLunch/OrganizeLunch.jsx";
import Settings from "./components/Settings/Settings.jsx";
import { allocateCents, itemTotal, readSavedState } from "./utils";

const navItems = [
  { id: "setup", label: "Organize lunch", icon: "◫" },
  { id: "order", label: "Order lunch", icon: "⌑" },
  { id: "ledger", label: "Final bill", icon: "▤" },
  { id: "history", label: "History", icon: "◷" },
  { id: "settings", label: "Settings", icon: "⚙" }
];

function readSavedTheme() {
  try {
    return localStorage.getItem("lunchround-theme") === "dark" ? "dark" : "light";
  } catch (error) {
    console.error("Could not load the saved theme preference.", error);
    return "light";
  }
}

function App() {
  const [state, setState] = useState(readSavedState);
  const [view, setView] = useState("setup");
  const [participantName, setParticipantName] = useState("Ana");
  const [toast, setToast] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const [theme, setTheme] = useState(readSavedTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem("lunchround-theme", theme);
    } catch (error) {
      console.error("Could not save the selected theme.", error);
      setToast("Your theme preference could not be saved.");
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem("lunchround-demo-v1", JSON.stringify(state));
    } catch (error) {
      console.error("Could not save the LunchRound demo state.", error);
      setToast("Your browser could not save this change.");
    }
  }, [state]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const deadline = new Date(state.lockAt);
  const hasDeadline = Number.isFinite(deadline.getTime());
  const locked = state.locked || (hasDeadline && deadline.getTime() <= now);
  const remaining = hasDeadline ? Math.max(0, deadline.getTime() - now) : 0;
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const timeLabel = hasDeadline ? new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(deadline) : "not set";
  const dateLabel = hasDeadline && deadline.toDateString() === new Date(now).toDateString() ? "today" : "at the selected time";
  const countdown = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const names = { setup: "Organize lunch", order: "Order lunch", ledger: "Final bill", history: "History", settings: "Settings" };
  const currentOrder = useMemo(() => {
    const name = participantName.trim() || "Guest";
    return state.orders.find((order) => order.name.toLowerCase() === name.toLowerCase()) || { name, quantities: {} };
  }, [participantName, state.orders]);

  function notify(message) {
    setToast(message);
  }

  function updateState(updater) {
    setState((current) => typeof updater === "function" ? updater(current) : updater);
  }

  function findOrCreateOrder(name, orders, items) {
    const normalizedName = name.trim() || "Guest";
    const existing = orders.find((order) => order.name.toLowerCase() === normalizedName.toLowerCase());
    if (existing) return { order: existing, orders };
    const order = { name: normalizedName, quantities: Object.fromEntries(items.map((item) => [item.id, 0])) };
    return { order, orders: [...orders, order] };
  }

  function changeQuantity(itemId, delta) {
    if (locked) return;
    updateState((current) => {
      const { order, orders } = findOrCreateOrder(participantName, current.orders, current.items);
      const updatedOrder = {
        ...order,
        quantities: {
          ...order.quantities,
          [itemId]: Math.max(0, Number(order.quantities[itemId] || 0) + delta)
        }
      };
      return { ...current, orders: orders.map((entry) => entry === order ? updatedOrder : entry) };
    });
  }

  function changeItem(itemId, changes) {
    updateState((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, ...changes } : item)
    }));
  }

  async function copyText(text, successMessage) {
    try {
      await navigator.clipboard.writeText(text);
      notify(successMessage);
    } catch (error) {
      console.error("Could not copy text to the clipboard.", error);
      notify("Clipboard access is unavailable. Please copy the text manually.");
    }
  }

  function getBreakdown() {
    const feeShares = allocateCents(
      Number(state.fees || 0),
      new Map(state.orders.map((order, index) => [index, itemTotal(order, state.items)]))
    );
    const foodTotal = state.items.reduce((sum, item) => sum + state.orders.reduce((subtotal, order) => subtotal + Number(order.quantities[item.id] || 0) * Number(item.price || 0), 0), 0);
    return [
      `Lunch at ${state.venue}`,
      ...state.orders.map((order, index) => `${order.name}: €${(itemTotal(order, state.items) + (feeShares.get(index) || 0)).toFixed(2)}`),
      `Total: €${(foodTotal + Number(state.fees || 0)).toFixed(2)}`
    ].join("\n");
  }

  function saveBillToHistory() {
    const feeShares = allocateCents(
      Number(state.fees || 0),
      new Map(state.orders.map((order, index) => [index, itemTotal(order, state.items)]))
    );
    const foodTotal = state.orders.reduce((sum, order) => sum + itemTotal(order, state.items), 0);
    const people = state.orders.map((order, index) => ({
      name: order.name,
      amount: itemTotal(order, state.items) + (feeShares.get(index) || 0)
    }));
    const bill = {
      id: `bill-${Date.now()}`,
      venue: state.venue,
      savedAt: new Date().toISOString(),
      total: foodTotal + Number(state.fees || 0),
      people
    };
    updateState((current) => ({ ...current, history: [bill, ...(current.history || [])] }));
    notify("Final bill saved to history.");
    setView("history");
  }

  function saveOrder() {
    updateState((current) => {
      const { order, orders } = findOrCreateOrder(participantName, current.orders, current.items);
      const updated = { ...order, name: participantName.trim() || "Guest" };
      return { ...current, orders: orders.map((entry) => entry === order ? updated : entry) };
    });
    setSavedMessage(`Saved for ${participantName.trim() || "Guest"} ✓`);
    notify(`Order saved for ${participantName.trim() || "Guest"}.`);
  }

  function removeItem(itemId) {
    updateState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== itemId),
      orders: current.orders.map((order) => {
        const quantities = { ...order.quantities };
        delete quantities[itemId];
        return { ...order, quantities };
      })
    }));
  }

  return (
    <div className="min-h-screen bg-canvas font-sans text-ink">
      <aside className="fixed inset-y-0 left-0 z-10 flex w-60 flex-col border-r border-stone-200 bg-white px-4 py-6 max-sm:inset-x-0 max-sm:inset-y-auto max-sm:bottom-0 max-sm:h-[60px] max-sm:w-full max-sm:flex-row max-sm:items-center max-sm:justify-center max-sm:border-r-0 max-sm:border-t max-sm:px-2 max-sm:py-1">
        <a className="flex items-center gap-2 px-2 font-display text-xl font-extrabold tracking-tight text-ink no-underline max-sm:hidden" href="#" aria-label="LunchRound home">
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
            <span className="grid h-8 w-8 place-items-center rounded-full bg-purple-100 text-xs font-bold text-purple-800">P</span>
            <span className="grid gap-0.5"><strong className="text-[10px]">Petar T.</strong><small className="text-[9px] text-stone-400">Lunch organizer</small></span>
            <span className="ml-auto text-stone-400">···</span>
          </div>
        </div>
      </aside>

      <main className="ml-60 min-h-screen px-8 pb-14 max-sm:ml-0 max-sm:px-4 max-sm:pb-20">
        <header className="flex h-[72px] items-center justify-between border-b border-stone-200">
          <div className="flex items-center gap-3 text-[10px] text-stone-400"><span>Workspace</span><span>/</span><strong className="font-semibold text-stone-600">{names[view]}</strong></div>
          <div className="flex items-center gap-3 text-[10px] text-stone-500">
            <span>{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(now))}</span>
            <span className="h-5 w-px bg-stone-200" />
            <button className="grid h-6 w-6 place-items-center rounded-full border border-stone-300 bg-transparent text-stone-600 hover:bg-stone-100" type="button" aria-label="About this demo" title="This frontend demo saves changes only in this browser.">?</button>
          </div>
        </header>

        {view === "setup" && (
          <OrganizeLunch
            state={state}
            locked={locked}
            countdown={countdown}
            hasDeadline={hasDeadline}
            dateLabel={dateLabel}
            timeLabel={timeLabel}
            onVenueChange={(venue) => updateState((current) => ({ ...current, venue }))}
            onLockTimeChange={(lockAt) => updateState((current) => ({ ...current, lockAt }))}
            onAddItem={() => updateState((current) => ({
              ...current,
              items: [...current.items, { id: `item-${Date.now()}`, name: "New dish", description: "Add a short description", price: 0 }]
            }))}
            onChangeItem={changeItem}
            onRemoveItem={removeItem}
            onCopyLink={() => copyText(`${window.location.origin}/?session=demo`, "Lunch link copied.")}
            onLockOrders={() => {
              updateState((current) => ({ ...current, locked: true }));
              notify("Orders are locked. The team can no longer make changes.");
            }}
            onNavigate={() => setView("order")}
          />
        )}

        {view === "order" && (
          <OrderLunch
            state={state}
            participantName={participantName}
            setParticipantName={setParticipantName}
            currentOrder={currentOrder}
            locked={locked}
            hasDeadline={hasDeadline}
            timeLabel={timeLabel}
            hours={hours}
            minutes={minutes}
            savedMessage={savedMessage}
            onChangeQuantity={changeQuantity}
            onSaveOrder={saveOrder}
          />
        )}

        {view === "ledger" && (
          <FinalBill
            state={state}
            locked={locked}
            onChangeItem={changeItem}
            onChangeFees={(fees) => updateState((current) => ({ ...current, fees }))}
            onCopyBreakdown={() => copyText(getBreakdown(), "Breakdown copied.")}
            onSaveBill={saveBillToHistory}
          />
        )}

        {view === "history" && <History history={state.history || []} />}
        {view === "settings" && <Settings theme={theme} onThemeChange={setTheme} />}
      </main>
      <div className={`pointer-events-none fixed bottom-6 right-6 z-20 max-w-[calc(100vw-2rem)] rounded-lg bg-stone-800 px-4 py-3 text-[10px] text-white shadow-xl transition-all max-sm:bottom-[72px] max-sm:right-4 ${toast ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"}`} role="status" aria-live="polite">{toast}</div>
    </div>
  );
}

export default App;
