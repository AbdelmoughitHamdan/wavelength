"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type AuthFormProps = {
  mode: "login" | "signup";
  nextPath: string;
  message?: string;
};

export default function AuthForm({ mode, nextPath, message }: AuthFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const isSignUp = mode === "signup";
  const nextQuery = encodeURIComponent(nextPath);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const response = await fetch(`/auth/${mode}?next=${nextQuery}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(isSignUp ? { displayName, email, password } : { email, password })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
      router.replace(data.redirectTo || "/");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grain min-h-screen px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-md">
        <header className="mb-12 flex items-center justify-between">
          <Link href="/" className="font-black tracking-tight text-ink">💭 How well do you know me?</Link>
          <Link href={isSignUp ? `/login?next=${nextQuery}` : `/signup?next=${nextQuery}`} className="text-sm font-extrabold text-purple">
            {isSignUp ? "Log in" : "Sign up"}
          </Link>
        </header>
        <section className="rounded-3xl bg-white p-6 shadow-card sm:p-8">
          <h1 className="text-3xl font-black">{isSignUp ? "Make it official" : "Welcome back"}</h1>
          <p className="mt-2 font-semibold leading-relaxed text-ink/60">
            {isSignUp ? "Use an account so your games and scores are always yours." : "Pick up your games exactly where you left them."}
          </p>
          {message && <p role="status" className="mt-5 rounded-2xl bg-mint/40 px-4 py-3 text-sm font-bold text-ink">{message}</p>}
          <form onSubmit={submit} className="mt-6 space-y-4">
            {isSignUp && (
              <label className="block text-sm font-extrabold">
                Display name
                <input required minLength={2} maxLength={24} autoComplete="nickname" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="e.g. Sam" className="mt-2 w-full rounded-2xl border-2 border-black/5 bg-cream px-4 py-3 outline-none focus:ring-4 focus:ring-purple/20" />
              </label>
            )}
            <label className="block text-sm font-extrabold">
              Email
              <input required type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="mt-2 w-full rounded-2xl border-2 border-black/5 bg-cream px-4 py-3 outline-none focus:ring-4 focus:ring-purple/20" />
            </label>
            <label className="block text-sm font-extrabold">
              Password
              <input required type="password" minLength={8} maxLength={72} autoComplete={isSignUp ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" className="mt-2 w-full rounded-2xl border-2 border-black/5 bg-cream px-4 py-3 outline-none focus:ring-4 focus:ring-purple/20" />
            </label>
            {error && <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-2xl bg-ink px-5 py-4 font-extrabold text-white shadow-lg shadow-ink/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45">
              {busy ? "One sec…" : isSignUp ? "Create account" : "Log in"}
            </button>
          </form>
          <p className="mt-6 text-center text-sm font-semibold text-ink/55">
            {isSignUp ? "Already have an account?" : "New here?"}{" "}
            <Link href={isSignUp ? `/login?next=${nextQuery}` : `/signup?next=${nextQuery}`} className="font-extrabold text-purple">
              {isSignUp ? "Log in" : "Sign up"}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
