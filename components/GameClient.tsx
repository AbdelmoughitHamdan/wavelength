"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Option = { id: string; label: string; position: number };
type Question = { id: string; prompt: string; position: number; options: Option[] };
type Player = { id: string; name: string; role: "creator" | "joiner"; score: number };
type RevealItem = { question_id: string; matched: boolean; points: number };
type View = {
  code: string; phase: "waiting" | "predicting" | "answering" | "reveal"; currentRound: number;
  me: Player | null; players: Player[]; round?: { number: number; subject: string; predictor: string; questions: Question[] };
  reveal?: { predictions: Array<{ question_id: string; option_id: string }>; answers: Array<{ question_id: string; option_id: string }>; results: RevealItem[] };
};

const post = async (url: string, body?: unknown) => {
  const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong.");
  return data;
};

function Shell({ children, code }: { children: React.ReactNode; code?: string }) {
  return <main className="grain min-h-screen px-4 py-6 sm:px-8"><div className="mx-auto max-w-xl">
    <header className="mb-8 flex items-center justify-between"><a href="/" className="font-black tracking-tight text-ink">💭 How well do you know me?</a>{code && <span className="rounded-full bg-white px-3 py-1 text-xs font-bold tracking-[.18em] text-purple shadow-sm">{code}</span>}</header>
    {children}
  </div></main>;
}
function ErrorText({ error }: { error: string }) { return error ? <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p> : null; }
function Button({ children, disabled, onClick, type = "button" }: { children: React.ReactNode; disabled?: boolean; onClick?: () => void; type?: "button" | "submit" }) {
  return <button type={type} disabled={disabled} onClick={onClick} className="w-full rounded-2xl bg-ink px-5 py-4 font-extrabold text-white shadow-lg shadow-ink/15 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45">{children}</button>;
}
function NameForm({ mode, code, onDone }: { mode: "create" | "join"; code?: string; onDone: (code: string) => void }) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      const result = await post(mode === "create" ? "/api/games" : `/api/games/${code}/join`, { name });
      onDone(result.code || code!.toUpperCase());
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-4">
    <label className="block text-sm font-extrabold">Your name<input required minLength={2} maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sam" className="mt-2 w-full rounded-2xl border-2 border-black/5 bg-white px-4 py-4 outline-none ring-purple/20 focus:ring-4" /></label>
    <ErrorText error={error} /><Button type="submit" disabled={busy}>{busy ? "One sec…" : mode === "create" ? "Create a game ✨" : "Join game →"}</Button>
  </form>;
}
function Landing({ initialCode, onCode }: { initialCode?: string; onCode: (code: string) => void }) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState(initialCode ?? "");
  const [joining, setJoining] = useState(Boolean(initialCode));
  return <Shell><section className="mt-10 space-y-8">
    <div><div className="mb-5 inline-flex rotate-[-2deg] rounded-full bg-mint px-3 py-1 text-xs font-black uppercase tracking-widest">Two players. Big reveals.</div><h1 className="text-5xl font-black leading-[.95] tracking-[-.06em] sm:text-6xl">Do you know<br /><span className="text-purple">me-me?</span></h1><p className="mt-5 max-w-sm text-lg font-semibold leading-relaxed text-ink/65">Predict what your favorite person would pick. Then find out if you nailed it.</p></div>
    {!joining ? <div className="space-y-4"><NameForm mode="create" onDone={(code) => { onCode(code); router.push(`/game/${code}`); }} /><button onClick={() => setJoining(true)} className="w-full rounded-2xl border-2 border-ink/10 bg-white px-5 py-4 font-extrabold">I have a game code</button></div> :
      <div className="space-y-4 rounded-3xl bg-white p-5 shadow-card"><label className="block text-sm font-extrabold">Game code<input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} placeholder="ABC123" maxLength={6} className="mt-2 w-full rounded-2xl border-2 border-black/5 px-4 py-4 text-center text-2xl font-black tracking-[.3em] outline-none focus:ring-4 focus:ring-purple/20" /></label>{joinCode.length === 6 && <NameForm mode="join" code={joinCode} onDone={(code) => { onCode(code); router.push(`/game/${code}`); }} />}<button onClick={() => setJoining(false)} className="w-full text-sm font-bold text-ink/50">← Back</button></div>}
    <p className="text-center text-xs font-bold text-ink/35">No accounts. No chat. Just two people and one spicy question.</p>
  </section></Shell>;
}

function QuestionPicker({ view, answerMode, onSubmit }: { view: View; answerMode: boolean; onSubmit: (choices: Array<{ questionId: string; optionId: string }>) => Promise<void> }) {
  const questions = view.round?.questions ?? [];
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const complete = questions.length === 3 && questions.every((q) => selected[q.id]);
  async function submit() { if (!complete) return; setBusy(true); try { await onSubmit(questions.map((q) => ({ questionId: q.id, optionId: selected[q.id] }))); } finally { setBusy(false); } }
  return <section className="space-y-5"><div><p className="text-sm font-black uppercase tracking-widest text-coral">Round {view.currentRound}</p><h1 className="mt-1 text-3xl font-black">{answerMode ? "What would you pick?" : "What would they pick?"}</h1><p className="mt-2 font-semibold text-ink/55">{answerMode ? "Answer honestly. Your friend is waiting 👀" : "Go with your gut — there are no wrong answers."}</p></div>
    {questions.map((question, index) => <article key={question.id} className="rounded-3xl bg-white p-5 shadow-card"><div className="mb-4 flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mint text-sm font-black">{index + 1}</span><h2 className="font-extrabold leading-snug">{question.prompt}</h2></div><div className="grid gap-2">{question.options.map((option) => <button key={option.id} onClick={() => setSelected((old) => ({ ...old, [question.id]: option.id }))} className={`rounded-2xl border-2 px-4 py-3 text-left font-bold transition ${selected[question.id] === option.id ? "border-purple bg-purple/10 text-purple" : "border-black/5 bg-cream hover:border-purple/30"}`}><span className="mr-2 text-ink/30">{String.fromCharCode(65 + option.position)}</span>{option.label}</button>)}</div></article>)}
    <Button disabled={!complete || busy} onClick={submit}>{busy ? "Locking it in…" : answerMode ? "Reveal the results 🎉" : "Lock in predictions →"}</Button>
  </section>;
}

function Reveal({ view, onNext }: { view: View; onNext: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const questions = view.round?.questions ?? [];
  const prediction = new Map((view.reveal?.predictions ?? []).map((x) => [x.question_id, x.option_id]));
  const answer = new Map((view.reveal?.answers ?? []).map((x) => [x.question_id, x.option_id]));
  const results = new Map((view.reveal?.results ?? []).map((x) => [x.question_id, x]));
  const subject = view.players.find((p) => p.id === view.round?.subject);
  const predictor = view.players.find((p) => p.id === view.round?.predictor);
  async function next() { setBusy(true); try { await onNext(); } finally { setBusy(false); } }
  return <section className="space-y-5"><div><p className="text-sm font-black uppercase tracking-widest text-coral">The reveal</p><h1 className="mt-1 text-4xl font-black">How well did you know {subject?.name}?</h1><p className="mt-2 font-semibold text-ink/55">{predictor?.name} earned {Array.from(results.values()).reduce((sum, r) => sum + r.points, 0)} / 3 points</p></div>
    {questions.map((q, index) => { const result = results.get(q.id); const predictedLabel = q.options.find((o) => o.id === prediction.get(q.id))?.label; const answerLabel = q.options.find((o) => o.id === answer.get(q.id))?.label; return <article key={q.id} className={`rounded-3xl border-2 bg-white p-5 shadow-card ${result?.matched ? "border-mint" : "border-coral/30"}`}><div className="flex items-start justify-between gap-3"><h2 className="font-extrabold">{index + 1}. {q.prompt}</h2><span className="shrink-0 text-2xl">{result?.matched ? "💚" : "💥"}</span></div><p className="mt-4 text-sm font-bold text-ink/60">They guessed: <b className="text-ink">{predictedLabel ?? "—"}</b></p><p className="mt-1 text-sm font-bold text-ink/60">Actually: <b className="text-purple">{answerLabel ?? "—"}</b></p><p className="mt-3 text-sm font-black">{result?.matched ? "+1 point — mind meld!" : "No match this time"}</p></article>; })}
    <div className="grid grid-cols-2 gap-3">{view.players.map((player) => <div key={player.id} className="rounded-2xl bg-white p-4 text-center shadow-sm"><p className="text-sm font-bold text-ink/55">{player.name}</p><p className="mt-1 text-3xl font-black text-purple">{player.score}</p></div>)}</div>
    <Button disabled={busy} onClick={next}>{busy ? "Starting…" : "Play another round →"}</Button>
  </section>;
}

function GameRoom({ code }: { code: string }) {
  const router = useRouter();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { const response = await fetch(`/api/games/${code}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Unable to load game."); setView(data); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Unable to load game."); } finally { setLoading(false); }
  }, [code]);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 2200); return () => window.clearInterval(timer); }, [load]);
  const action = async (url: string, body?: unknown) => { try { await post(`/api/games/${code}/${url}`, body); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed."); await load(); } };
  if (loading && !view) return <Shell code={code}><div className="rounded-3xl bg-white p-8 text-center font-bold shadow-card">Loading your game…</div></Shell>;
  if (error && !view) return <Shell code={code}><ErrorText error={error} /><button onClick={() => router.push("/")} className="mt-4 font-bold underline">Back home</button></Shell>;
  if (!view) return null;
  if (!view.me) return <Shell code={code}><div className="rounded-3xl bg-white p-6 shadow-card"><p className="mb-5 text-center text-2xl font-black">You’ve been invited! 🎟️</p><NameForm mode="join" code={code} onDone={() => void load()} /></div></Shell>;
  const other = view.players.find((p) => p.id !== view.me?.id);
  const isSubject = view.round?.subject === view.me.id;
  return <Shell code={code}><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-ink/40">You are</p><p className="font-black">{view.me.name}</p></div><div className="text-right"><p className="text-xs font-black uppercase tracking-widest text-ink/40">Score</p><p className="font-black text-purple">{view.me.score}</p></div></div><ErrorText error={error} />
    {view.phase === "waiting" && <section className="space-y-5 rounded-3xl bg-white p-6 text-center shadow-card"><div className="text-5xl">🛋️</div><h1 className="text-3xl font-black">{other ? "Your game is ready!" : "Waiting for your person…"}</h1><p className="font-semibold text-ink/55">{other ? `${other.name} is here. Share code ${code} if they need it.` : "Share the game code with one friend. Only two players can join."}</p><div className="rounded-2xl bg-cream p-4 text-center text-3xl font-black tracking-[.25em] text-purple">{code}</div>{view.me.role === "creator" && <Button disabled={!other} onClick={() => void action("start")}>{other ? "Start round 1 ✨" : "Waiting for player…"}</Button>}</section>}
    {view.phase === "predicting" && (isSubject ? <WaitingCard title={`${other?.name ?? "Your friend"} is thinking…`} body="Once they lock in their guesses, you’ll answer the same questions." /> : <QuestionPicker view={view} answerMode={false} onSubmit={(choices) => action("predict", { predictions: choices })} />)}
    {view.phase === "answering" && (isSubject ? <QuestionPicker view={view} answerMode onSubmit={(choices) => action("answer", { answers: choices })} /> : <WaitingCard title={`${other?.name ?? "Your friend"} is answering…`} body="No peeking! Your reveal is almost ready." />)}
    {view.phase === "reveal" && <Reveal view={view} onNext={() => action("next")} />}
  </Shell>;
}
function WaitingCard({ title, body }: { title: string; body: string }) { return <section className="rounded-3xl bg-white p-8 text-center shadow-card"><div className="mb-4 animate-pulse text-5xl">⏳</div><h1 className="text-2xl font-black">{title}</h1><p className="mt-3 font-semibold text-ink/55">{body}</p></section>; }

export default function GameClient({ initialCode }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode?.toUpperCase());
  const router = useRouter();
  useEffect(() => { if (code && typeof window !== "undefined" && window.location.pathname !== `/game/${code}`) router.replace(`/game/${code}`); }, [code, router]);
  return code ? <GameRoom code={code} /> : <Landing onCode={setCode} />;
}
