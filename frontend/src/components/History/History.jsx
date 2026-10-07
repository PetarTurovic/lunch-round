import React from "react";

import { euro } from "../../utils";

function History({ history }) {
  return (
    <section className="mx-auto max-w-6xl pt-9">
      <div className="mb-7">
        <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
          <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
          FINAL BILL
        </div>
        <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
          Lunch <span className="text-lunch">history.</span>
        </h1>
        <p className="mb-0 text-xs leading-relaxed text-stone-500">
          Review previously saved lunch bills.
        </p>
      </div>

      {history.length ? (
        <div className="grid gap-3">
          {history.map((bill) => (
            <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm" key={bill.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="mb-1 font-display text-sm font-bold">{bill.venue || "Team lunch"}</h2><p className="mb-0 text-[9px] text-stone-500">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(bill.savedAt))}</p></div>
                <strong className="font-display text-base text-lunch-dark">{euro(bill.total)}</strong>
              </div>
              <div className="mt-4 grid gap-2 border-t border-stone-100 pt-3">
                {bill.people.map((person, index) => (
                  <div className="flex justify-between gap-3 text-[9px] text-stone-600" key={`${person.name}-${index}`}><span>{person.name}</span><strong>{euro(person.amount)}</strong></div>
                ))}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <article className="rounded-xl border border-stone-200 bg-white p-8 text-center shadow-sm">
          <span className="mx-auto mb-4 grid h-11 w-11 place-items-center rounded-xl bg-lunch-soft text-xl text-lunch" aria-hidden="true">▤</span>
          <h2 className="mb-2 font-display text-sm font-bold">No lunch history yet</h2>
          <p className="mx-auto mb-0 max-w-sm text-[10px] leading-relaxed text-stone-500">Lock orders, review the final bill, and save it to see the bill here.</p>
        </article>
      )}
    </section>
  );
}

export default History;
