import { useState, type FormEvent } from "react";
import { playChime } from "../../utils";
import type { Theme, UserProfile } from "../../types";

interface SettingsProps {
  user: UserProfile | null;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  currency: string;
  onCurrencyChange: (currency: string) => void;
  defaultDuration: number;
  onDefaultDurationChange: (mins: number) => void;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  onUpdateUserName?: (name: string) => Promise<void>;
  onSignOut?: () => void;
  onSignIn?: () => void;
  onClearCache?: () => void;
}

const currencies = [
  { code: "EUR", symbol: "€", label: "Euro (EUR)" },
  { code: "USD", symbol: "$", label: "US Dollar (USD)" },
  { code: "GBP", symbol: "£", label: "British Pound (GBP)" },
  { code: "CHF", symbol: "Fr", label: "Swiss Franc (CHF)" }
];

const durationPresets = [15, 30, 45, 60];

function Settings({
  user,
  theme,
  onThemeChange,
  currency,
  onCurrencyChange,
  defaultDuration,
  onDefaultDurationChange,
  soundEnabled,
  onSoundEnabledChange,
  onUpdateUserName,
  onSignOut,
  onSignIn,
  onClearCache
}: SettingsProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user?.name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState(false);

  async function handleSaveName(event: FormEvent) {
    event.preventDefault();
    if (!nameInput.trim() || !onUpdateUserName) return;
    setSavingName(true);
    try {
      await onUpdateUserName(nameInput.trim());
      setIsEditingName(false);
      setNameSuccess(true);
      window.setTimeout(() => setNameSuccess(false), 2500);
    } finally {
      setSavingName(false);
    }
  }

  function handleTestChime() {
    playChime();
  }

  return (
    <section className="mx-auto max-w-4xl pt-9">
      <div className="mb-7">
        <div className="mb-3 flex items-center gap-2 text-[9px] font-bold tracking-widest text-stone-500">
          <span className="h-1.5 w-1.5 rounded-full bg-lunch-orange" />
          WORKSPACE SETTINGS
        </div>
        <h1 className="mb-2 font-display text-3xl font-bold tracking-tight max-sm:text-2xl">
          Your <span className="text-lunch">preferences.</span>
        </h1>
        <p className="mb-0 text-xs leading-relaxed text-stone-500">
          Customize your workspace experience, default currency, alerts, and account profile.
        </p>
      </div>

      <div className="grid gap-5">
        {/* Account / Profile Card */}
        <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-stone-100 pb-4">
            <div className="flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-purple-100 font-display text-base font-bold text-purple-800">
                {user?.name?.charAt(0)?.toUpperCase() || "G"}
              </span>
              <div>
                <h2 className="mb-0.5 font-display text-base font-bold text-ink">
                  {user ? user.name : "Guest Session"}
                </h2>
                <p className="mb-0 text-[10px] text-stone-500">
                  {user?.email ? user.email : "Not signed into an organizer account"}
                </p>
              </div>
            </div>
            <div>
              {user ? (
                <button
                  className="rounded-lg border border-stone-200 px-3 py-1.5 text-[10px] font-semibold text-stone-600 hover:bg-stone-50"
                  type="button"
                  onClick={onSignOut}
                >
                  Sign out
                </button>
              ) : (
                <button
                  className="rounded-lg bg-lunch px-3 py-1.5 text-[10px] font-semibold text-white hover:bg-lunch-dark"
                  type="button"
                  onClick={onSignIn}
                >
                  Sign in
                </button>
              )}
            </div>
          </div>

          {user && (
            <div className="pt-4">
              {!isEditingName ? (
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-stone-600">
                    <span className="font-semibold text-stone-800">Display name:</span> {user.name}
                    {nameSuccess && <span className="ml-2 text-green-700">✓ Updated</span>}
                  </div>
                  <button
                    type="button"
                    className="text-[10px] font-semibold text-lunch hover:underline"
                    onClick={() => {
                      setNameInput(user.name);
                      setIsEditingName(true);
                    }}
                  >
                    Edit name
                  </button>
                </div>
              ) : (
                <form className="flex flex-wrap items-center gap-2" onSubmit={handleSaveName}>
                  <input
                    type="text"
                    className="h-8 rounded-lg border border-stone-200 px-2.5 text-[11px] outline-none focus:border-green-400"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    maxLength={100}
                    required
                  />
                  <button
                    type="submit"
                    className="h-8 rounded-lg bg-lunch px-3 text-[10px] font-semibold text-white hover:bg-lunch-dark disabled:opacity-50"
                    disabled={savingName || !nameInput.trim()}
                  >
                    {savingName ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="h-8 rounded-lg border border-stone-200 px-2.5 text-[10px] text-stone-600 hover:bg-stone-50"
                    onClick={() => setIsEditingName(false)}
                  >
                    Cancel
                  </button>
                </form>
              )}

              {user.stats && (
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-stone-50 p-3 sm:grid-cols-2">
                  <div className="text-center sm:text-left">
                    <span className="block text-[8px] font-bold tracking-widest text-stone-400">ORGANIZED ROUNDS</span>
                    <strong className="font-display text-base font-bold text-stone-800">{user.stats.organizedRounds}</strong>
                  </div>
                  <div className="text-center sm:text-left">
                    <span className="block text-[8px] font-bold tracking-widest text-stone-400">JOINED ROUNDS</span>
                    <strong className="font-display text-base font-bold text-stone-800">{user.stats.joinedRounds}</strong>
                  </div>
                </div>
              )}
            </div>
          )}
        </article>

        {/* Appearance & Workspace Preferences */}
        <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-display text-sm font-bold text-ink">Preferences</h2>
          <div className="grid gap-5">
            {/* Theme */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
              <div>
                <h3 className="mb-0.5 text-xs font-semibold text-stone-800">Theme appearance</h3>
                <p className="mb-0 text-[10px] text-stone-500">Choose light or dark workspace interface.</p>
              </div>
              <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-1" aria-label="Color theme">
                {(["light", "dark"] as const).map((option) => (
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

            {/* Currency */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
              <div>
                <h3 className="mb-0.5 text-xs font-semibold text-stone-800">Default currency</h3>
                <p className="mb-0 text-[10px] text-stone-500">Currency used for new rounds and estimates.</p>
              </div>
              <div className="flex flex-wrap gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
                {currencies.map((curr) => (
                  <button
                    key={curr.code}
                    className={`min-h-8 rounded-md px-2.5 text-[10px] font-semibold transition ${currency === curr.code ? "bg-white text-lunch-dark shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                    type="button"
                    aria-pressed={currency === curr.code}
                    onClick={() => onCurrencyChange(curr.code)}
                  >
                    {curr.symbol} {curr.code}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Closing Duration */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
              <div>
                <h3 className="mb-0.5 text-xs font-semibold text-stone-800">Default ordering window</h3>
                <p className="mb-0 text-[10px] text-stone-500">Quick preset duration for new rounds.</p>
              </div>
              <div className="flex gap-1 rounded-lg border border-stone-200 bg-stone-50 p-1">
                {durationPresets.map((mins) => (
                  <button
                    key={mins}
                    className={`min-h-8 rounded-md px-3 text-[10px] font-semibold transition ${defaultDuration === mins ? "bg-white text-lunch-dark shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                    type="button"
                    aria-pressed={defaultDuration === mins}
                    onClick={() => onDefaultDurationChange(mins)}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Alert */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="mb-0.5 text-xs font-semibold text-stone-800">Deadline audio chime</h3>
                <p className="mb-0 text-[10px] text-stone-500">Play a subtle audio tone when the ordering countdown expires.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-md border border-stone-200 px-2 py-1 text-[9px] text-stone-600 hover:bg-stone-50"
                  onClick={handleTestChime}
                  title="Play sample chime"
                >
                  ♪ Test sound
                </button>
                <button
                  type="button"
                  role="switch"
                  aria-checked={soundEnabled}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${soundEnabled ? "bg-lunch" : "bg-stone-200"}`}
                  onClick={() => onSoundEnabledChange(!soundEnabled)}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${soundEnabled ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>
            </div>
          </div>
        </article>

        {/* System & Data Management */}
        <article className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 font-display text-sm font-bold text-ink">System & Session Data</h2>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="mb-0.5 text-xs font-semibold text-stone-800">Clear local session data</h3>
              <p className="mb-0 text-[10px] text-stone-500">Resets local storage cache if experiencing synchronization issues.</p>
            </div>
            {onClearCache && (
              <button
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[10px] font-semibold text-red-700 hover:bg-red-100"
                type="button"
                onClick={onClearCache}
              >
                Reset session cache
              </button>
            )}
          </div>
          <div className="mt-4 flex items-center gap-2 text-[9px] text-stone-400">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Backend API: connected · MongoDB database active
          </div>
        </article>
      </div>
    </section>
  );
}

export default Settings;
