import React from "react";

function Settings({ theme, onThemeChange }) {
  return (
    <section className="mx-auto max-w-6xl pt-9">
      <div className="mb-7">
        <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
          <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
          WORKSPACE
        </div>
        <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
          Your <span className="text-lunch">settings.</span>
        </h1>
        <p className="mb-0 text-xs leading-relaxed text-stone-500">
          Choose your preferred appearance.
        </p>
      </div>

      <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="mb-1 font-display text-sm font-bold">Appearance</h2>
            <p className="mb-0 text-[10px] text-stone-500">Choose the look that works best for you.</p>
          </div>
          <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-1" aria-label="Color theme">
            {["light", "dark"].map((option) => (
              <button
                className={`min-h-8 rounded-md px-3 text-[10px] font-semibold transition ${theme === option ? "bg-white text-lunch-dark shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                key={option}
                type="button"
                aria-pressed={theme === option}
                onClick={() => onThemeChange(option)}
              >
                {option === "light" ? "☀ Light" : "☾ Dark"}
              </button>
            ))}
          </div>
        </div>
      </article>
    </section>
  );
}

export default Settings;
