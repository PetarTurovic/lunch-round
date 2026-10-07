import { useState, type FormEvent, type ReactNode } from "react";
import { euro, initials, safeNumber } from "../../utils";
import type { OrderMenuItem, Participant, ParticipantOrder, Round } from "../../types";

const dishClasses = [
  "bg-orange-50 text-orange-800",
  "bg-green-50 text-green-800",
  "bg-purple-50 text-purple-800"
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
  locked: boolean;
  hasDeadline: boolean;
  timeLabel: string;
  hours: number;
  minutes: number;
  loading: boolean;
  onJoin: (name: string) => Promise<void>;
  onChangeQuantity: (item: OrderMenuItem, quantity: number) => Promise<void>;
  onNavigateBill: () => void;
}

function OrderLunch({
  round,
  items,
  orders,
  currentOrder,
  participant,
  locked,
  hasDeadline,
  timeLabel,
  hours,
  minutes,
  loading,
  onJoin,
  onChangeQuantity,
  onNavigateBill
}: OrderLunchProps) {
  const [name, setName] = useState("");
  const selectedItems = items.filter((item) => safeNumber(currentOrder.quantities[item.id]) > 0);
  const orderTotal = selectedItems.reduce((sum, item) =>
    sum + safeNumber(currentOrder.quantities[item.id]) * safeNumber(item.price), 0);

  if (!round) {
    return (
      <section className="mx-auto max-w-2xl pt-9">
        <div className="mb-7">
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />YOUR TEAM LUNCH</div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">Join a lunch <span className="text-lunch">round.</span></h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">Open a shared round link to see its menu and place your order.</p>
        </div>
        <Card>
          <p className="mb-0 text-[10px] leading-relaxed text-stone-600">
            {window.location.search.includes("round=")
              ? "Loading the linked lunch round…"
              : "No round is selected. Ask the organizer for the round link, then open it here."}
          </p>
        </Card>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl pt-9">
      <div className="mb-7 flex items-end justify-between gap-5 max-sm:flex-col max-sm:items-start">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />YOUR TEAM LUNCH</div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">{round.title} <span className="text-lunch">menu.</span></h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">{locked ? `Ordering closed at ${timeLabel}. Orders are read-only.` : "Add your picks below. Your order is saved to the shared round."}</p>
        </div>
        <span className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-3 text-[9px] font-semibold ${locked ? "border-stone-200 bg-stone-100 text-stone-600" : "border-green-200 bg-green-50 text-green-800"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ring-4 ${locked ? "bg-stone-500 ring-stone-200" : "bg-green-500 ring-green-100"}`} />
          {locked ? "Ordering closed" : "Open for orders"}
        </span>
      </div>

      {!participant ? (
        <Card className="mb-4 max-w-xl">
          <h2 className="mb-1 font-display text-sm font-bold">Join this round</h2>
          <p className="mb-4 text-[9px] text-stone-500">Choose a name your organizer and teammates will recognize.</p>
          <form className="flex flex-wrap gap-2" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void onJoin(name.trim()); }}>
            <label className="sr-only" htmlFor="participant-name">Your name</label>
            <input className="h-9 min-w-0 flex-1 rounded-lg border border-stone-200 bg-transparent px-3 text-[10px] outline-none focus:border-green-400" id="participant-name" autoComplete="name" maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
            <button className="min-h-9 rounded-lg bg-lunch-dark px-4 text-[10px] font-semibold text-white hover:bg-green-950 disabled:opacity-50" type="submit" disabled={loading || locked}>{loading ? "Joining…" : "Join round"}</button>
          </form>
        </Card>
      ) : (
        <Card className="mb-4 flex items-center gap-3 px-4 py-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-purple-100 text-xs font-bold text-purple-800">{initials(participant.name)}</span>
          <div className="min-w-0 flex-1"><span className="mb-1 block text-[8px] font-bold tracking-widest text-stone-500">ORDERING AS</span><strong className="block truncate text-[11px]">{participant.name}</strong></div>
          <span className="text-[9px] text-stone-500">{orders.length} team member{orders.length === 1 ? "" : "s"}</span>
        </Card>
      )}

      <div className="grid items-start gap-5">
        <div className="grid gap-3">
          {!items.length && (
            <Card className="border-amber-200 bg-amber-50">
              <h2 className="mb-1 font-display text-sm font-bold text-amber-950">This round has no saved menu</h2>
              <p className="mb-0 text-[10px] leading-relaxed text-amber-900">
                It was created before restaurant menus were added to rounds. Ask the organizer to create a new round so the selected restaurants and dishes are included.
              </p>
            </Card>
          )}
          <Card className="flex items-center gap-3 p-4 max-sm:flex-wrap">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-green-50 text-2xl" aria-hidden="true">♧</div>
            <div className="min-w-0"><span className="mb-1 block text-[8px] font-bold tracking-widest text-stone-500">RESTAURANTS IN THIS ROUND</span><h2 className="mb-1 font-display text-sm font-bold">{round.shortlist?.length || 0} selected</h2><p className="mb-0 text-[9px] text-stone-500">Choose dishes from any restaurant below.</p></div>
            <div className="ml-auto rounded-lg bg-green-50 px-3 py-2 text-green-800 max-sm:ml-14 max-sm:w-full"><strong className="block text-[9px]">{locked ? `Closed at ${timeLabel}` : hasDeadline ? `Locks in ${hours ? `${hours} hr ${minutes} min` : `${minutes} min`}` : "No closing time set"}</strong><small className="text-[8px] text-stone-500">{locked ? "Orders are read-only" : "Your changes are shared with the team"}</small></div>
          </Card>

          <Card>
            <div className="mb-3"><h2 className="mb-1 font-display text-sm font-bold">The menu</h2><p className="mb-0 text-[9px] text-stone-500">{items.length} available dishes across the selected restaurants.</p></div>
            <div className="grid gap-2">
              {items.map((item, index) => {
                const quantity = safeNumber(currentOrder.quantities[item.id]);
                return (
                  <div className={`flex min-h-[68px] items-center gap-2 rounded-lg border border-stone-200 p-2.5 sm:gap-3 ${locked ? "bg-stone-50" : "bg-white"}`} key={item.id}>
                    <DishAvatar name={item.name} index={index} />
                    <div className="min-w-0 flex-1"><strong className="mb-1 block text-[10px] text-stone-800">{item.name}</strong><small className="block truncate text-[9px] text-stone-500">{[item.storeName, item.section, item.description].filter(Boolean).join(" · ")}</small></div>
                    <span className="whitespace-nowrap text-[10px] font-semibold text-stone-700">{euro(item.price, item.currency)}</span>
                    <div className="flex items-center gap-1 rounded-lg border border-stone-200 p-1" aria-label={`${item.name} quantity`}>
                      <button className="grid h-6 w-6 place-items-center rounded-md bg-green-50 text-base text-green-800 hover:bg-green-100 disabled:bg-stone-50 disabled:text-stone-300" type="button" disabled={locked || loading || !participant || quantity === 0} aria-label={`Remove one ${item.name}`} onClick={() => onChangeQuantity(item, quantity - 1)}>−</button>
                      <strong className="min-w-3 text-center text-[10px]">{quantity}</strong>
                      <button className="grid h-6 w-6 place-items-center rounded-md bg-green-50 text-base text-green-800 hover:bg-green-100 disabled:bg-stone-50 disabled:text-stone-300" type="button" disabled={locked || loading || !participant} aria-label={`Add one ${item.name}`} onClick={() => onChangeQuantity(item, quantity + 1)}>+</button>
                    </div>
                  </div>
                );
              })}
              {!items.length && <p className="mb-0 py-3 text-[10px] text-stone-500">No available menu items were found for this round.</p>}
            </div>
          </Card>
        </div>

        <aside className="grid max-w-2xl gap-3">
          <Card>
            <div className="flex items-center justify-between border-b border-stone-100 pb-3"><h2 className="mb-0 font-display text-sm font-bold">Your order</h2><span className="text-lg text-green-800" aria-hidden="true">▱</span></div>
            <div className="grid gap-3 py-4">
              {selectedItems.map((item) => (
                <div className="flex justify-between gap-3 text-[9px] text-stone-600" key={item.id}><span>{safeNumber(currentOrder.quantities[item.id])} × {item.name}</span><strong className="whitespace-nowrap text-stone-800">{euro(safeNumber(currentOrder.quantities[item.id]) * safeNumber(item.price), item.currency)}</strong></div>
              ))}
              {!selectedItems.length && <p className="mb-0 py-2 text-center text-[9px] leading-relaxed text-stone-400">Your order is empty. Pick something from the menu.</p>}
            </div>
            <div className="flex items-center justify-between border-t border-stone-100 py-3 text-[10px] text-stone-600"><span>Estimated total</span><strong className="font-display text-lg text-lunch-dark">{euro(orderTotal, round.currency)}</strong></div>
            <p className="mb-0 text-[8px] text-stone-400">Your changes are saved as you add or remove dishes.</p>
            <button className="mt-4 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white text-[10px] font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50" type="button" disabled={!participant || !selectedItems.length} onClick={onNavigateBill}>View final bill <span aria-hidden="true">→</span></button>
          </Card>
          <p className="flex gap-2 px-1 text-[9px] leading-relaxed text-stone-500"><span className="text-green-800" aria-hidden="true">♧</span> Your organizer and team can see updates to this order.</p>
        </aside>
      </div>
    </section>
  );
}

export default OrderLunch;
