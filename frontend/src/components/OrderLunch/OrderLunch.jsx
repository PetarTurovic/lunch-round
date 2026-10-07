import React from "react";
import { euro, initials, itemTotal, safeNumber } from "../../utils";

const dishClasses = [
  "bg-orange-50 text-orange-800",
  "bg-green-50 text-green-800",
  "bg-purple-50 text-purple-800"
];

function Card({ className = "", children }) {
  return <article className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</article>;
}

function DishAvatar({ name, index }) {
  return (
    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg font-display text-[11px] font-bold ${dishClasses[index % dishClasses.length]}`}>
      {initials(name)}
    </span>
  );
}

function OrderLunch({
  state,
  participantName,
  setParticipantName,
  currentOrder,
  locked,
  hasDeadline,
  timeLabel,
  hours,
  minutes,
  savedMessage,
  onChangeQuantity,
  onSaveOrder
}) {
  const selectedItems = state.items.filter((item) => safeNumber(currentOrder.quantities[item.id]) > 0);

  return (
    <section className="mx-auto max-w-6xl pt-9">
      <div className="mb-7 flex items-end justify-between gap-5 max-sm:flex-col max-sm:items-start">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />YOUR TEAM LUNCH</div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">What sounds <span className="text-lunch">good?</span></h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">{locked ? `Ordering closed at ${timeLabel}. Your order is read-only.` : "Add your picks below. You can change your mind until orders close."}</p>
        </div>
        <span className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-3 text-[9px] font-semibold ${locked ? "border-stone-200 bg-stone-100 text-stone-600" : "border-green-200 bg-green-50 text-green-800"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ring-4 ${locked ? "bg-stone-500 ring-stone-200" : "bg-green-500 ring-green-100"}`} />
          {locked ? "Ordering closed" : "Open for orders"}
        </span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-3">
          <Card className="flex items-center gap-3 p-4 max-sm:flex-wrap">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-orange-50 text-2xl" aria-hidden="true">🍕</div>
            <div className="min-w-0"><span className="mb-1 block text-[8px] font-bold tracking-widest text-stone-500">TODAY’S PICK</span><h2 className="mb-1 font-display text-sm font-bold">{state.venue || "Your lunch venue"}</h2><p className="mb-0 text-[9px] text-stone-500">Italian · Pizza · Pasta <span className="ml-2 text-amber-700">★ 4.8</span></p></div>
            <div className="ml-auto flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-green-800 max-sm:ml-14 max-sm:w-full"><span aria-hidden="true">◷</span><span className="grid gap-1"><strong className="text-[9px]">{locked ? `Closed at ${timeLabel}` : hasDeadline ? `Locks in ${hours ? `${hours} hr ${minutes} min` : `${minutes} min`}` : "Lock time not set"}</strong><small className="text-[8px] text-stone-500">{locked ? "Your order can't be changed now" : "Get your order in soon"}</small></span></div>
          </Card>

          <Card className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-purple-100 text-xs font-bold text-purple-800">{initials(participantName)}</span>
            <div className="flex-1"><label className="mb-1 block text-[9px] font-bold" htmlFor="participant-name">Ordering as</label><input className="h-7 w-full max-w-xs rounded border border-transparent bg-transparent px-2 text-[11px] font-semibold outline-none focus:border-green-300" id="participant-name" maxLength="40" value={participantName} disabled={locked} onChange={(event) => setParticipantName(event.target.value)} /></div>
            <span className="text-stone-400" aria-hidden="true">✎</span>
          </Card>

          <Card>
            <div className="mb-3 flex items-center justify-between"><div><h2 className="mb-1 font-display text-sm font-bold">The menu</h2><p className="mb-0 text-[9px] text-stone-500">Tap + to add a dish to your order.</p></div><span className="text-[9px] text-stone-400">{state.items.length} dishes</span></div>
            <div className="grid gap-2">
              {state.items.map((item, index) => {
                const quantity = safeNumber(currentOrder.quantities[item.id]);
                return (
                  <div className={`flex min-h-[68px] items-center gap-2 rounded-lg border border-stone-200 p-2.5 sm:gap-3 ${locked ? "bg-stone-50" : "bg-white"}`} key={item.id}>
                    <DishAvatar name={item.name} index={index} />
                    <div className="min-w-0 flex-1"><strong className="mb-1 block text-[10px] text-stone-800">{item.name}</strong><small className="block truncate text-[9px] text-stone-500">{item.description}</small></div>
                    <span className="self-start whitespace-nowrap pt-1 text-[10px] font-semibold text-stone-700">{euro(safeNumber(item.price))}</span>
                    <div className="flex items-center gap-1 rounded-lg border border-stone-200 p-1" aria-label={`${item.name} quantity`}>
                      <button className="grid h-6 w-6 place-items-center rounded-md bg-green-50 text-base text-green-800 hover:bg-green-100 disabled:bg-stone-50 disabled:text-stone-300" type="button" disabled={locked || quantity === 0} aria-label={`Remove one ${item.name}`} onClick={() => onChangeQuantity(item.id, -1)}>−</button>
                      <strong className="min-w-3 text-center text-[10px]">{quantity}</strong>
                      <button className="grid h-6 w-6 place-items-center rounded-md bg-green-50 text-base text-green-800 hover:bg-green-100 disabled:bg-stone-50 disabled:text-stone-300" type="button" disabled={locked} aria-label={`Add one ${item.name}`} onClick={() => onChangeQuantity(item.id, 1)}>+</button>
                    </div>
                  </div>
                );
              })}
              {!state.items.length && <p className="text-[10px] text-stone-500">The organizer has not added any dishes yet.</p>}
            </div>
          </Card>
        </div>

        <aside className="grid gap-3">
          <Card>
            <div className="flex items-center justify-between border-b border-stone-100 pb-3"><h2 className="mb-0 font-display text-sm font-bold">Your order</h2><span className="text-lg text-green-800" aria-hidden="true">▱</span></div>
            <div className="grid gap-3 py-4">
              {selectedItems.map((item) => (
                <div className="flex justify-between gap-3 text-[9px] text-stone-600" key={item.id}><span>{safeNumber(currentOrder.quantities[item.id])} × {item.name}</span><strong className="whitespace-nowrap text-stone-800">{euro(safeNumber(currentOrder.quantities[item.id]) * safeNumber(item.price))}</strong></div>
              ))}
              {!selectedItems.length && <p className="mb-0 py-2 text-center text-[9px] leading-relaxed text-stone-400">Your order is looking a little empty.<br />Pick something delicious!</p>}
            </div>
            <div className="flex items-center justify-between border-t border-stone-100 py-3 text-[10px] text-stone-600"><span>Estimated total</span><strong className="font-display text-lg text-lunch-dark">{euro(itemTotal(currentOrder, state.items))}</strong></div>
            <p className="mb-0 text-[8px] text-stone-400">Final prices are confirmed by the organizer.</p>
            <button className="mt-4 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-lunch-dark text-[10px] font-semibold text-white hover:bg-green-950 disabled:opacity-50" type="button" disabled={locked} onClick={onSaveOrder}>Save my order <span aria-hidden="true">→</span></button>
            <span className="mt-2 block min-h-3 text-center text-[8px] text-green-800" aria-live="polite">{savedMessage}</span>
          </Card>
          <p className="flex gap-2 px-1 text-[9px] leading-relaxed text-stone-500"><span className="text-green-800" aria-hidden="true">♧</span> Ordering for the team? Your organizer will see your picks.</p>
        </aside>
      </div>
    </section>
  );
}

export default OrderLunch;
