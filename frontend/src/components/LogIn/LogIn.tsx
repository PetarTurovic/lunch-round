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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onAuthenticate({ mode, name, email, password });
    setPassword("");
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
            <h1 className="mb-2 font-display text-2xl font-bold tracking-tight">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="mb-0 text-sm text-stone-500">{mode === "login" ? "Sign in to organize and manage your team lunches." : "Create an account to start organizing team lunches."}</p>
          </div>

          <div className="mb-5 grid grid-cols-2 rounded-lg bg-stone-50 p-1">
            {(["login", "register"] as const).map((option) => (
              <button
                className={`min-h-10 rounded-md text-xs font-semibold ${mode === option ? "bg-white text-lunch-dark shadow-sm" : "text-stone-500"}`}
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
              >
                {option === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800" role="alert">
              {error}
              <button className="ml-2 bg-transparent font-bold" type="button" onClick={onDismissError} aria-label="Dismiss error">×</button>
            </div>
          )}

          <form className="grid gap-4" onSubmit={submit}>
            {mode === "register" && (
              <div className="grid gap-1.5">
                <label className="text-xs font-semibold" htmlFor="login-name">Your name</label>
                <input className="h-11 rounded-lg border border-stone-200 bg-transparent px-3 text-sm outline-none focus:border-green-400" id="login-name" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} />
              </div>
            )}
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold" htmlFor="login-email">Email</label>
              <input className="h-11 rounded-lg border border-stone-200 bg-transparent px-3 text-sm outline-none focus:border-green-400" id="login-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold" htmlFor="login-password">Password</label>
              <input className="h-11 rounded-lg border border-stone-200 bg-transparent px-3 text-sm outline-none focus:border-green-400" id="login-password" type="password" autoComplete={mode === "register" ? "new-password" : "current-password"} minLength={mode === "register" ? 6 : 1} value={password} onChange={(event) => setPassword(event.target.value)} required />
            </div>
            <button className="mt-1 min-h-11 rounded-lg bg-lunch-dark px-4 text-sm font-semibold text-white hover:bg-green-950 disabled:opacity-50" type="submit" disabled={loading}>
              {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[10px] text-stone-400">
            <span className="h-px flex-1 bg-stone-200" />
            OR
            <span className="h-px flex-1 bg-stone-200" />
          </div>
          <button className="min-h-10 w-full rounded-lg border border-stone-200 bg-white text-xs font-semibold text-stone-600 hover:bg-stone-50" type="button" onClick={onContinueAsGuest}>
            Continue as a guest
          </button>
        </article>
      </section>
    </main>
  );
}

export default LogIn;
