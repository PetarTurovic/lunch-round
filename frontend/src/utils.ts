export const STORAGE_KEY = "lunchround-demo-v1";

export const initials = (name: string): string => name.trim().charAt(0).toUpperCase() || "?";

export const safeNumber = (value: number | string | null | undefined): number => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
};

export const euro = (value: number, currency = "EUR"): string => {
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: currency || "EUR"
    }).format(value);
  } catch {
    return `${currency || "€"} ${value.toFixed(2)}`;
  }
};

export const formatCurrency = euro;

export function formatDate(date: string | Date | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!date) return "Date unavailable";
  try {
    const d = typeof date === "string" ? new Date(date) : date;
    if (!Number.isFinite(d.getTime())) return "Invalid date";
    return new Intl.DateTimeFormat("en", options || { dateStyle: "medium", timeStyle: "short" }).format(d);
  } catch {
    return "Date unavailable";
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    } catch {
      return false;
    }
  }
}

export async function shareLink(data: { title: string; text?: string; url: string }): Promise<boolean> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share(data);
      return true;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return false;
    }
  }
  return copyToClipboard(data.url);
}

interface DemoItem {
  id: string;
  name: string;
  description: string;
  price: number;
}

interface DemoOrder {
  name: string;
  quantities: Record<string, number>;
}

interface DemoState {
  venue: string;
  lockAt: string;
  locked: boolean;
  fees: number;
  history: unknown[];
  items: DemoItem[];
  orders: DemoOrder[];
}

export function makeDefaultState(): DemoState {
  const lockAt = new Date(Date.now() + 42 * 60_000);
  const offset = lockAt.getTimezoneOffset() * 60_000;
  return {
    venue: "Pizzeria Napoli",
    lockAt: new Date(lockAt.getTime() - offset).toISOString().slice(0, 16),
    locked: false,
    fees: 3,
    history: [],
    items: [
      { id: "pizza", name: "Pizza Margherita", description: "Tomato, mozzarella, basil", price: 7.5 },
      { id: "salad", name: "Caesar salad", description: "Chicken, parmesan, croutons", price: 6 },
      { id: "pasta", name: "Pasta carbonara", description: "Guanciale, egg, pecorino", price: 8 }
    ],
    orders: [
      { name: "Ana", quantities: { pizza: 2, salad: 1, pasta: 0 } },
      { name: "Marko", quantities: { pizza: 1, salad: 0, pasta: 1 } },
      { name: "Ivana", quantities: { pizza: 2, salad: 2, pasta: 1 } },
      { name: "Petar", quantities: { pizza: 0, salad: 0, pasta: 1 } }
    ]
  };
}

export function readSavedState(): DemoState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return makeDefaultState();
    const parsed: unknown = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") throw new Error("Saved lunch data is incomplete.");
    const state = parsed as Partial<DemoState>;
    if (!Array.isArray(state.items) || !Array.isArray(state.orders)) {
      throw new Error("Saved lunch data is incomplete.");
    }
    return { ...state, history: Array.isArray(state.history) ? state.history : [] } as DemoState;
  } catch (error) {
    console.error("Could not load the saved LunchRound demo state.", error);
    return makeDefaultState();
  }
}

export function itemTotal(order: DemoOrder, items: DemoItem[]): number {
  return items.reduce((total, item) => total + safeNumber(order.quantities[item.id]) * safeNumber(item.price), 0);
}

export function orderQuantity(order: DemoOrder, items: DemoItem[]): number {
  return items.reduce((total, item) => total + safeNumber(order.quantities[item.id]), 0);
}

export function orderDescription(order: DemoOrder, items: DemoItem[]): string {
  const picks = items
    .filter((item) => safeNumber(order.quantities[item.id]) > 0)
    .map((item) => `${safeNumber(order.quantities[item.id])} ${item.name}`);
  return picks.length ? picks.join(", ") : "No dishes selected";
}

export function itemQuantities(items: DemoItem[], orders: DemoOrder[]): Map<string, number> {
  const totals = new Map<string, number>(items.map((item) => [item.id, 0]));
  orders.forEach((order) => items.forEach((item) => {
    totals.set(item.id, (totals.get(item.id) ?? 0) + safeNumber(order.quantities[item.id]));
  }));
  return totals;
}

export function allocateCents(amount: number, weights: Map<string, number>): Map<string, number> {
  const entries = [...weights.entries()];
  const weightTotal = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (weightTotal <= 0 || amount <= 0) return new Map(entries.map(([key]) => [key, 0]));
  const amountCents = Math.round(amount * 100);
  const portions = entries.map(([key, weight]) => {
    const exact = amountCents * weight / weightTotal;
    return { key, cents: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = amountCents - portions.reduce((sum, portion) => sum + portion.cents, 0);
  portions.sort((left, right) => right.remainder - left.remainder);
  for (let index = 0; index < portions.length && remaining > 0; index += 1, remaining -= 1) {
    portions[index].cents += 1;
  }
  return new Map(portions.map(({ key, cents }) => [key, cents / 100]));
}
