import React from "react";
import { euro, initials, itemTotal, orderQuantity, safeNumber } from "../../utils";

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

function SectionHeading({ eyebrow, title, accent, description }) {
  return (
    <div className="mb-7 flex items-end justify-between gap-5 max-sm:flex-col max-sm:items-start">
      <div>
        <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
          <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />{eyebrow}
        </div>
        <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
          {title} <span className="text-lunch">{accent}</span>
        </h1>
        <p className="mb-0 text-xs leading-relaxed text-stone-500">{description}</p>
      </div>
    </div>
  );
}

function StepNumber({ children }) {
  return <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-lunch-soft text-[9px] font-bold text-lunch">{children}</span>;
}

function Card({ className = "", children }) {
  return <article className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</article>;
}

function DishAvatar({ name, index, size = "h-9 w-9" }) {
  return (
    <span className={`grid ${size} shrink-0 place-items-center rounded-lg font-display text-[11px] font-bold ${dishClasses[index % dishClasses.length]}`}>
      {initials(name)}
    </span>
  );
}

function OrganizeLunch({
  state,
  locked,
  countdown,
  hasDeadline,
  dateLabel,
  timeLabel,
  onVenueChange,
  onLockTimeChange,
  onAddItem,
  onChangeItem,
  onRemoveItem,
  onCopyLink,
  onLockOrders,
  onNavigate
}) {
  const teamList = state.orders.filter((order) => order.name.trim());

  return (
    <section className="mx-auto max-w-6xl pt-9">
      <SectionHeading eyebrow="YOUR LUNCH SESSION" title="Let’s get lunch" accent="going." description="Set the menu, choose when orders close, and let the team take it from here." />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="grid min-w-0 gap-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3"><StepNumber>01</StepNumber><div><h2 className="mb-1 font-display text-sm font-bold">Your lunch plan</h2><p className="mb-0 text-[10px] text-stone-500">A few details to get everyone on the same page.</p></div></div>
              <span className="p-1 text-xl" aria-hidden="true">🍕</span>
            </div>
            <div className="mt-5 grid gap-2">
              <label className="text-[10px] font-bold text-stone-700" htmlFor="venue-name">Restaurant or venue</label>
              <div className="flex h-9 items-center gap-2 rounded-lg border border-stone-200 px-3 text-stone-400 focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-100">
                <span aria-hidden="true">⌖</span>
                <input className="w-full border-0 bg-transparent text-[11px] text-stone-800 outline-none" id="venue-name" type="text" maxLength="80" value={state.venue} placeholder="e.g. Pizzeria Napoli" onChange={(event) => onVenueChange(event.target.value)} />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_190px]">
              <div><label className="text-[10px] font-bold text-stone-700" htmlFor="lock-time">Orders lock at</label><p className="mb-0 mt-1 text-[9px] text-stone-400">Your team can edit their orders until then.</p></div>
              <input className="min-h-9 w-full rounded-lg border border-stone-200 px-2 text-[10px] text-stone-600 outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" id="lock-time" type="datetime-local" value={state.lockAt} onChange={(event) => onLockTimeChange(event.target.value)} />
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-start gap-3"><StepNumber>02</StepNumber><div><h2 className="mb-1 font-display text-sm font-bold">The menu</h2><p className="mb-0 text-[10px] text-stone-500">Add dishes and prices from the restaurant menu.</p></div></div>
              <button className="inline-flex items-center gap-1 bg-transparent text-[10px] font-semibold text-lunch hover:text-lunch-dark" type="button" onClick={onAddItem}><span className="text-lg">+</span> Add item</button>
            </div>
            <div>
              {state.items.map((item, index) => (
                <div className="grid min-h-16 grid-cols-[36px_minmax(0,1fr)_80px_24px] items-center gap-2 border-b border-stone-100 last:border-0 sm:grid-cols-[36px_minmax(0,1fr)_90px_24px] sm:gap-3" key={item.id}>
                  <DishAvatar name={item.name} index={index} />
                  <div className="min-w-0">
                    <input className="w-full border-0 bg-transparent text-[10px] font-bold text-stone-800 outline-none" aria-label="Dish name" maxLength="80" value={item.name} onChange={(event) => onChangeItem(item.id, { name: event.target.value })} />
                    <input className="mt-1 w-full border-0 bg-transparent text-[9px] text-stone-500 outline-none" aria-label="Dish description" maxLength="120" value={item.description} onChange={(event) => onChangeItem(item.id, { description: event.target.value })} />
                  </div>
                  <input className="h-8 w-full rounded-md border border-stone-200 px-2 text-right text-[10px] outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" aria-label="Estimated price" type="number" min="0" step="0.01" value={safeNumber(item.price)} onChange={(event) => onChangeItem(item.id, { price: safeNumber(event.target.value) })} />
                  <button className="grid h-6 w-6 place-items-center rounded text-stone-400 hover:bg-red-50 hover:text-red-600" type="button" aria-label={`Remove ${item.name}`} onClick={() => onRemoveItem(item.id)}>×</button>
                </div>
              ))}
              {!state.items.length && <p className="py-3 text-[10px] text-stone-500">No dishes yet. Add one to get started.</p>}
            </div>
            <div className="mt-3 flex items-center gap-2 text-[9px] text-stone-400"><span className="grid h-3.5 w-3.5 place-items-center rounded-full border border-stone-300 text-[9px]">i</span> Prices are estimates. You can confirm them against the receipt later.</div>
          </Card>

          <Card className="flex min-h-36 overflow-hidden bg-stone-50 p-0">
            <div className="relative grid basis-28 shrink-0 place-items-center bg-lunch-soft text-4xl text-lunch" aria-hidden="true"><span className="z-10 grid h-12 w-12 place-items-center rounded-2xl border border-green-100 bg-white text-2xl">↗</span></div>
            <div className="min-w-0 p-4">
              <span className="text-[9px] font-bold tracking-widest text-stone-500">ONE LINK FOR EVERYONE</span>
              <h2 className="mb-1 mt-2 font-display text-base font-bold">Share the lunch love.</h2>
              <p className="mb-3 text-[9px] text-stone-500">Anyone on your team can add their order. No account needed.</p>
              <div className="flex min-h-8 items-center gap-2 rounded-lg border border-stone-200 bg-white p-1 pl-2 text-[9px] text-stone-500">
                <span className="text-lunch" aria-hidden="true">↗</span><span className="min-w-0 flex-1 truncate">{window.location.origin}/?session=demo</span>
                <button className="min-h-6 rounded-md bg-lunch px-2 text-[9px] font-semibold text-white hover:bg-lunch-dark" type="button" onClick={onCopyLink}>Copy link</button>
              </div>
            </div>
          </Card>
        </div>

        <aside className="grid gap-4">
          <Card className="p-4">
            <div className="flex items-start justify-between"><div><h2 className="mb-1 font-display text-sm font-bold">Your lunch crew</h2><p className="mb-0 text-[10px] text-stone-500">{teamList.length} {teamList.length === 1 ? "person is" : "people are"} in</p></div><span className="text-xl text-green-700" aria-hidden="true">♧</span></div>
            <div className="my-5 grid gap-3">
              {teamList.map((order, index) => (
                <div className="flex items-center gap-2.5" key={`${order.name}-${index}`}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-bold ${avatarClasses[index % avatarClasses.length]}`}>{initials(order.name)}</span>
                  <span className="grid min-w-0 gap-1"><strong className="truncate text-[9px] font-semibold">{order.name}</strong><small className="text-[8px] text-stone-500">{orderQuantity(order, state.items)} items · {euro(itemTotal(order, state.items))}</small></span>
                  <span className="ml-auto text-[10px] text-green-700" aria-label="Order added">✓</span>
                </div>
              ))}
            </div>
            <button className="flex min-h-9 w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-3 text-[10px] font-semibold text-stone-600 hover:bg-stone-50" type="button" onClick={onNavigate}>View participant order <span>→</span></button>
          </Card>
          <Card className="border-green-100 bg-green-50 p-4 shadow-none">
            <span className="text-xl text-green-700" aria-hidden="true">◷</span>
            <div className="mb-1 mt-2 text-[8px] font-bold tracking-widest text-stone-500">TIME UNTIL ORDERS CLOSE</div>
            <div className="font-display text-2xl font-bold tracking-wide text-green-950">{locked ? "00:00:00" : hasDeadline ? countdown : "--:--:--"}</div>
            <p className="mb-4 mt-1 text-[9px] text-stone-500">{hasDeadline ? `Orders close ${dateLabel} at ${timeLabel}` : "Choose a lock time for your lunch"}</p>
            <button className="flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-lunch-dark text-[10px] font-semibold text-white hover:bg-green-950 disabled:cursor-not-allowed disabled:opacity-50" type="button" disabled={locked} onClick={onLockOrders}>{locked ? "Orders locked ✓" : <>Lock orders now <span>→</span></>}</button>
          </Card>
          <p className="flex items-center gap-2 px-1 text-[9px] text-stone-500"><span className="text-green-700">✳</span> Demo mode · Changes are saved in this browser only.</p>
        </aside>
      </div>
    </section>
  );
}

export default OrganizeLunch;
