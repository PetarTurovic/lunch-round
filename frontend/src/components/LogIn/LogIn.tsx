import { useState, type FormEvent } from "react";
import type { AuthDetails } from "../../types";

interface LogInProps {
  loading: boolean;
  error: string;
  onAuthenticate: (details: AuthDetails) => Promise<void>;
  onContinueAsGuest: () => void;
  onDismissError: () => void;
}

function LogIn({ loading, error, onAuthenticate, onContinueAsGuest, onDismissError }: LogInProps) {
  const [mode, setMode] = useState<AuthDetails["mode"]>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const isEmailValid = email.trim().length === 0 || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const isPasswordValid = mode === "login" ? password.length > 0 : password.length >= 6;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isEmailValid) return;
    if (mode === "register" && password.length < 6) return;
    await onAuthenticate({ mode, name: name.trim(), email: email.trim(), password });
    setPassword("");
  }

  function handleModeChange(newMode: AuthDetails["mode"]) {
    setMode(newMode);
    onDismissError();
  }

  function handleInputChange<T>(setter: (val: T) => void, val: T) {
    setter(val);
    if (error) onDismissError();
  }

  return (
    <main className="grid min-h-screen place-items-center bg-canvas px-4 py-10 font-sans text-ink">
      <section className="w-full max-w-md">
        <a className="mb-8 flex items-center justify-center gap-2 font-display text-2xl font-extrabold tracking-tight text-ink no-underline" href="#" aria-label="LunchRound home">
          <span className="grid h-10 w-10 place-items-center rounded-xl rounded-bl-sm bg-lunch text-lg text-white">L</span>
          <span>Lunch Round<span className="text-lunch-orange">.</span></span>
        </a>
        <article className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="mb-2 font-display text-2xl font-bold tracking-tight">
              {mode === "login" ? "Welcome back" : "Create your account"}
            </h1>
            <p className="mb-0 text-xs leading-relaxed text-stone-500">
              {mode === "login"
                ? "Sign in to organize lunch rounds, select restaurants, and manage team bills."
                : "Create an account to start organizing team lunches with real menus."}
            </p>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-lg bg-stone-50 p-1" role="tablist" aria-label="Authentication mode">
            {(["login", "register"] as const).map((option) => (
              <button
                className={`min-h-10 rounded-md text-xs font-semibold transition ${mode === option ? "bg-white text-lunch-dark shadow-sm" : "text-stone-500 hover:text-stone-800"}`}
                key={option}
                type="button"
                role="tab"
                aria-selected={mode === option}
                onClick={() => handleModeChange(option)}
              >
                {option === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
              <span>{error}</span>
              <button className="ml-2 bg-transparent text-sm font-bold text-red-700 hover:text-red-900" type="button" onClick={onDismissError} aria-label="Dismiss error">×</button>
            </div>
          )}

          <form className="grid gap-4" onSubmit={submit}>
            {mode === "register" && (
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold text-stone-700" htmlFor="login-name">Your full name</label>
                <input
                  className="h-11 rounded-lg border border-stone-200 bg-transparent px-3 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-400"
                  id="login-name"
                  autoComplete="name"
                  placeholder="e.g. Alex Morgan"
                  value={name}
                  onChange={(event) => handleInputChange(setName, event.target.value)}
                  required
                  maxLength={100}
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-stone-700" htmlFor="login-email">Work or personal email</label>
              <input
                className={`h-11 rounded-lg border bg-transparent px-3 text-sm outline-none focus:ring-1 ${!isEmailValid && email ? "border-red-400 focus:ring-red-300" : "border-stone-200 focus:border-green-500 focus:ring-green-400"}`}
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={email}
                onChange={(event) => handleInputChange(setEmail, event.target.value)}
                required
              />
              {!isEmailValid && email && (
                <span className="text-[10px] text-red-600">Please enter a valid email address.</span>
              )}
            </div>

            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-700" htmlFor="login-password">Password</label>
                {mode === "register" && (
                  <span className={`text-[10px] ${password.length >= 6 ? "text-green-700" : "text-stone-400"}`}>
                    {password.length >= 6 ? "✓ Minimum 6 chars" : "At least 6 characters"}
                  </span>
                )}
              </div>
              <div className="relative flex items-center">
                <input
                  className="h-11 w-full rounded-lg border border-stone-200 bg-transparent pl-3 pr-10 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-400"
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  minLength={mode === "register" ? 6 : 1}
                  placeholder="••••••••"
                  value={password}
                  onChange={(event) => handleInputChange(setPassword, event.target.value)}
                  required
                />
                <button
                  type="button"
                  className="absolute right-2.5 text-stone-400 hover:text-stone-700 text-xs px-1 py-1"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              className="mt-2 min-h-11 rounded-lg bg-lunch-dark px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-950 disabled:cursor-not-allowed disabled:opacity-50"
              type="submit"
              disabled={loading || !isPasswordValid || (!isEmailValid && Boolean(email))}
            >
              {loading ? "Please wait…" : mode === "login" ? "Sign in to workspace" : "Create account & get started"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[10px] text-stone-400">
            <span className="h-px flex-1 bg-stone-200" />
            OR CONTINUE WITHOUT SIGNING IN
            <span className="h-px flex-1 bg-stone-200" />
          </div>

          <button
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white px-4 text-xs font-semibold text-stone-700 hover:bg-stone-50"
            type="button"
            onClick={onContinueAsGuest}
          >
            <span>Continue as a guest</span>
            <span className="text-stone-400 text-[10px]">(join shared links)</span>
          </button>
          <p className="mt-2 text-center text-[10px] text-stone-400 leading-normal">
            Guests can join lunch rounds and place orders without an organizer account.
          </p>
        </article>
      </section>
    </main>
  );
}

export default LogIn;
