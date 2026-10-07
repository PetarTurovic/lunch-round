import React from "react";
import {
  allocateCents,
  euro,
  initials,
  itemQuantities,
  itemTotal,
  orderDescription,
  safeNumber
} from "../../utils";

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

function Card({ className = "", children }) {
  return <article className={`rounded-xl border border-stone-200 bg-white p-5 shadow-sm ${className}`}>{children}</article>;
}

function DishAvatar({ name, index }) {
  return (
    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-[10px] font-bold ${dishClasses[index % dishClasses.length]}`}>
      {initials(name)}
    </span>
  );
}

function FinalBill({ state, locked, onChangeItem, onChangeFees, onCopyBreakdown, onSaveBill }) {
  const quantities = itemQuantities(state.items, state.orders);
  const itemSum = state.items.reduce((total, item) => total + quantities.get(item.id) * safeNumber(item.price), 0);
  const total = itemSum + safeNumber(state.fees);
  const feeShares = allocateCents(
    safeNumber(state.fees),
    new Map(state.orders.map((order, index) => [index, itemTotal(order, state.items)]))
  );

  return (
    <section className="mx-auto max-w-6xl pt-9">
      <div className="mb-7 flex items-end justify-between gap-5 max-sm:flex-col max-sm:items-start">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500"><span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />THE FINAL COUNT</div>
          <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">Everyone’s <span className="text-lunch">sorted.</span></h1>
          <p className="mb-0 text-xs leading-relaxed text-stone-500">Check the receipt, update final prices, and see exactly what everyone owes.</p>
        </div>
        <span className={`inline-flex min-h-7 items-center gap-2 rounded-full border px-3 text-[9px] font-semibold ${locked ? "border-stone-200 bg-stone-100 text-stone-600" : "border-green-200 bg-green-50 text-green-800"}`}>
          <span className={`h-1.5 w-1.5 rounded-full ring-4 ${locked ? "bg-stone-500 ring-stone-200" : "bg-green-500 ring-green-100"}`} />
          {locked ? "Orders locked" : "Preview · Still open"}
        </span>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_270px]">
        <div className="grid gap-4">
          <Card>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-lunch-soft text-[9px] font-bold text-lunch">03</span><div><h2 className="mb-1 font-display text-sm font-bold">Items to order</h2><p className="mb-0 text-[10px] text-stone-500">Quantities are totaled from everyone’s order.</p></div></div>
              <span className="whitespace-nowrap rounded-md border border-stone-200 px-2 py-1.5 text-[8px] text-stone-600">▣ {state.venue || "Your lunch venue"} · {locked ? "Locked" : "Preview"}</span>
            </div>
            <div className="mt-4">
              {state.items.map((item, index) => (
                <div className="grid min-h-[60px] grid-cols-[32px_minmax(0,1fr)_36px_74px] items-center gap-2 border-b border-stone-100 sm:grid-cols-[36px_minmax(0,1fr)_50px_90px]" key={item.id}>
                  <DishAvatar name={item.name} index={index} />
                  <span className="min-w-0"><strong className="block truncate text-[9px] text-stone-800">{item.name}</strong><small className="mt-1 block truncate text-[8px] text-stone-500">{item.description}</small></span>
                  <span className="text-center text-[9px] text-stone-600"><strong className="text-stone-800">{quantities.get(item.id)}</strong> ×</span>
                  <input className="h-[30px] w-full rounded-md border border-stone-200 px-2 text-right text-[10px] outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100" aria-label={`Final price for ${item.name}`} type="number" min="0" step="0.01" value={safeNumber(item.price)} onChange={(event) => onChangeItem(item.id, { price: safeNumber(event.target.value) })} />
                </div>
              ))}
              {!state.items.length && <p className="py-3 text-[10px] text-stone-500">There are no menu items to tally.</p>}
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-stone-100 py-4"><div><strong className="block text-[9px] text-stone-700">Delivery and fees</strong><small className="mt-1 block text-[8px] text-stone-500">Split by each person’s share of the food total</small></div><label className="flex h-[30px] min-w-[90px] items-center gap-1 rounded-md border border-stone-200 px-2 text-[9px]"><span>€</span><input className="w-14 border-0 text-right text-[9px] outline-none" type="number" min="0" step="0.01" aria-label="Delivery and fees" value={safeNumber(state.fees)} onChange={(event) => onChangeFees(safeNumber(event.target.value))} /></label></div>
            <div className="flex justify-between py-4 text-[10px] font-semibold"><span>Receipt total</span><strong className="font-display text-base">{euro(total)}</strong></div>
            <div className="flex gap-2 rounded-lg bg-stone-50 p-3 text-[8px] leading-relaxed text-stone-600"><span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border border-stone-300">i</span> Adjust item prices to match the receipt. Fees are split proportionally and rounded to the cent.</div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start justify-between gap-3"><div><h2 className="mb-1 font-display text-sm font-bold">Who owes what</h2><p className="mb-0 text-[9px] text-stone-500">Share this breakdown with your team.</p></div><button className="inline-flex min-h-7 items-center rounded-lg border border-stone-200 bg-white px-3 text-[8px] font-semibold text-stone-600 hover:bg-stone-50" type="button" onClick={onCopyBreakdown}>Copy breakdown</button></div>
            <div className="mt-3">
              {state.orders.map((order, index) => (
                <div className="flex min-h-[54px] items-center gap-2.5 border-b border-stone-100 last:border-0" key={`${order.name}-${index}`}>
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[9px] font-bold ${avatarClasses[index % avatarClasses.length]}`}>{initials(order.name)}</span>
                  <span className="min-w-0 flex-1"><strong className="block text-[9px]">{order.name}</strong><small className="mt-1 block truncate text-[8px] text-stone-500">{orderDescription(order, state.items)}</small></span>
                  <strong className="whitespace-nowrap font-display text-[11px] font-bold">{euro(itemTotal(order, state.items) + (feeShares.get(index) || 0))}</strong>
                </div>
              ))}
              {!state.orders.length && <p className="py-3 text-[10px] text-stone-500">No team orders have been added yet.</p>}
            </div>
            <div className="flex justify-between gap-3 border-t border-stone-100 pt-3 text-[8px] text-stone-500"><span>Amounts include each person’s share of the fees.</span><strong className="whitespace-nowrap text-[9px] text-stone-700">{euro(total)} total</strong></div>
          </Card>
        </div>

        <aside className="grid gap-4">
          <Card className="border-green-100 bg-green-50 p-5 shadow-none">
            <span className="mb-4 grid h-8 w-8 place-items-center rounded-lg border border-green-200 bg-green-100 text-green-800" aria-hidden="true">✓</span>
            <span className="mb-2 block text-[8px] font-bold tracking-widest text-stone-500">ALL TALLIED UP</span>
            <h2 className="mb-2 font-display text-base font-bold">Lunch is on its way.</h2>
            <p className="mb-4 text-[9px] leading-relaxed text-stone-600">Everyone’s share is calculated from their order and the final receipt.</p>
            <div className="flex items-center justify-between border-y border-green-100 py-3 text-[9px] text-stone-600"><span>Team total</span><strong className="font-display text-lg text-lunch-dark">{euro(total)}</strong></div>
            <button className="mt-4 flex min-h-9 w-full items-center justify-center gap-2 rounded-lg bg-lunch-dark text-[10px] font-semibold text-white hover:bg-green-950" type="button" onClick={onCopyBreakdown}>Share the breakdown <span>↗</span></button>
            {locked && <button className="mt-2 flex min-h-9 w-full items-center justify-center rounded-lg border border-green-200 bg-white text-[10px] font-semibold text-green-900 hover:bg-green-100" type="button" onClick={onSaveBill}>Save bill to history</button>}
          </Card>
          <p className="flex items-center gap-2 px-1 text-[9px] text-stone-500"><span className="text-green-700">✳</span> Your ledger is saved in this browser only.</p>
        </aside>
      </div>
    </section>
  );
}

export default FinalBill;
