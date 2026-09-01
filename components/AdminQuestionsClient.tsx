"use client";

import { useMemo, useState } from "react";

type Preset = "Funny" | "Difficult" | "Best Friends" | "Couples" | "Random" | "Chaotic" | "Personal" | "Deep";
type AdminQuestion = { prompt: string; options: string[]; answerIndex: number; explanation?: string };

const presets: Preset[] = ["Funny", "Difficult", "Best Friends", "Couples", "Random", "Chaotic", "Personal", "Deep"];
const presetBriefs: Record<Preset, string> = {
  Funny: "Write funny questions about personality quirks and everyday habits.",
  Difficult: "Write slightly difficult questions where the subject's real preference is not immediately obvious.",
  "Best Friends": "Write warm, personal questions for best friends who know each other's routines and inside jokes.",
  Couples: "Write playful questions for a couple about preferences, habits, and how they spend time together.",
  Random: "Write an unexpected mix of entertaining personal questions.",
  Chaotic: "Write delightfully chaotic questions about how the subject reacts to weird everyday situations.",
  Personal: "Write personal but comfortable questions about the subject's preferences and routines.",
  Deep: "Write thoughtful questions about values and personality without becoming invasive or overly serious."
};

async function post(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request failed.");
  return data as { questions?: AdminQuestion[]; question?: AdminQuestion };
}

function questionText(questions: AdminQuestion[], includeAnswers: boolean) {
  const header = includeAnswers
    ? "WAVELENGTH — ADMIN ANSWER KEY"
    : "WAVELENGTH — ANSWER THESE ABOUT YOURSELF\n\nDon't discuss your answers with the other player yet. They'll answer these separately and we'll compare the results.";
  const body = questions.map((question, index) => {
    const options = question.options.map((option, optionIndex) => `   ${String.fromCharCode(65 + optionIndex)}. ${option}`).join("\n");
    const answer = includeAnswers ? `\n   Intended answer: ${String.fromCharCode(65 + question.answerIndex)}${question.explanation ? `\n   Note: ${question.explanation}` : ""}` : "";
    return `${index + 1}. ${question.prompt}\n${options}${answer}`;
  }).join("\n\n");
  return `${header}\n\n${body}`;
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export default function AdminQuestionsClient() {
  const [prompt, setPrompt] = useState("");
  const [context, setContext] = useState("");
  const [preset, setPreset] = useState<Preset>("Random");
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [diagnosticBusy, setDiagnosticBusy] = useState(false);
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const canSave = questions.length === 3 && questions.every((question) => question.options.length === 4 && question.prompt.trim());
  const status = useMemo(() => busy ? "Working…" : questions.length === 3 ? "Ready for review" : `${questions.length}/3 cards`, [busy, questions.length]);

  function updateQuestion(index: number, update: Partial<AdminQuestion>) {
    setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? { ...question, ...update } : question));
  }

  function updateOption(questionIndex: number, optionIndex: number, value: string) {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex) return question;
      return { ...question, options: question.options.map((option, index) => index === optionIndex ? value : option) };
    }));
  }

  async function generate() {
    setError(""); setNotice(""); setBusy(true);
    try {
      const result = await post("/api/admin/questions/generate", { prompt, context: context || undefined, preset });
      setQuestions(result.questions ?? []); setNotice("Three fresh suggestions are ready. Nothing was added to a live game.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Generation failed."); }
    finally { setBusy(false); }
  }

  async function regenerate(index: number) {
    if (questions.length !== 3) return;
    setError(""); setNotice(""); setBusyIndex(index);
    try {
      const result = await post("/api/admin/questions/regenerate", { prompt, context: context || undefined, preset, questionIndex: index, currentQuestions: questions });
      if (result.question) setQuestions((current) => current.map((question, questionIndex) => questionIndex === index ? result.question! : question));
      setNotice(`Card ${index + 1} regenerated.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Regeneration failed."); }
    finally { setBusyIndex(null); }
  }

  function remove(index: number) {
    setQuestions((current) => current.filter((_, questionIndex) => questionIndex !== index));
    setNotice("Card deleted. Generate again to restore a complete three-card set.");
  }

  function save() {
    if (!canSave) return;
    localStorage.setItem("wavelength-approved-questions", JSON.stringify({ savedAt: new Date().toISOString(), questions }));
    setNotice("Approved suggestion set saved on this device only.");
  }

  async function copy(includeAnswers: boolean) {
    if (!questions.length) return;
    try { await copyText(questionText(questions, includeAnswers)); setNotice(includeAnswers ? "Copied with answer notes." : "Copied duo-safe text — no answers or explanations included."); }
    catch { setError("Clipboard access was blocked. Select the text manually or allow clipboard access."); }
  }

  async function runGeminiDiagnostic() {
    setError("");
    setNotice("");
    setDiagnosticBusy(true);
    try {
      const response = await fetch("/api/admin/gemini-test", {
        method: "POST",
        credentials: "same-origin"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.succeeded) {
        throw new Error(data.error || `Diagnostic failed with status ${data.status ?? response.status}.`);
      }
      setNotice(`Gemini POST succeeded with HTTP ${data.status}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gemini diagnostic failed.");
    } finally {
      setDiagnosticBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#111827] px-4 py-6 text-slate-100 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-slate-700 pb-6">
          <div>
            <a href="/" className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Wavelength / internal tools</a>
            <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">Question generator</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Draft, tune, and approve subjective prompts. Suggestions stay out of live games until a developer adds them deliberately.</p>
          </div>
          <div className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-xs text-slate-300" aria-live="polite"><span className="mr-2 inline-block h-2 w-2 rounded-full bg-emerald-400" />{status}</div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(280px,0.72fr)_minmax(0,1.28fr)]">
          <section className="h-fit rounded-xl border border-slate-700 bg-slate-800/80 p-5 shadow-2xl shadow-black/20">
            <h2 className="text-lg font-bold text-white">Brief the model</h2>
            <label className="mt-5 block text-sm font-semibold text-slate-300">What should these questions explore?
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={1000} rows={6} placeholder="e.g. How my best friend handles a chaotic road trip" className="mt-2 w-full resize-y rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" />
              <span className="mt-1 block text-right font-mono text-xs text-slate-500">{prompt.length}/1000</span>
            </label>
            <label className="mt-4 block text-sm font-semibold text-slate-300">Optional duo context <span className="font-normal text-slate-500">(never stored)</span>
              <textarea value={context} onChange={(event) => setContext(event.target.value)} maxLength={500} rows={3} placeholder="Shared references, hobbies, inside jokes…" className="mt-2 w-full resize-y rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" />
            </label>
            <fieldset className="mt-5">
              <legend className="text-sm font-semibold text-slate-300">Preset</legend>
              <div className="mt-2 flex flex-wrap gap-2">{presets.map((item) => <button key={item} type="button" onClick={() => { setPreset(item); setPrompt(presetBriefs[item]); }} className={`rounded-md border px-3 py-2 text-xs font-bold transition ${preset === item ? "border-cyan-300 bg-cyan-300 text-slate-950" : "border-slate-600 bg-slate-900 text-slate-300 hover:border-cyan-400 hover:text-cyan-200"}`}>{item}</button>)}</div>
            </fieldset>
            <button type="button" onClick={() => void generate()} disabled={busy || prompt.trim().length < 3} className="mt-6 w-full rounded-lg bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-40">{busy ? "Generating…" : "Generate 3 questions →"}</button>
            <p className="mt-3 text-xs leading-5 text-slate-500">Gemini output is validated server-side and retried when it misses the shape or quality rules.</p>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold text-white">Review queue</h2><p className="text-xs text-slate-500">Edit every field before approval. Answer notes stay admin-only.</p></div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={diagnosticBusy} onClick={() => void runGeminiDiagnostic()} className="rounded-md border border-violet-500 px-3 py-2 text-xs font-black text-violet-200 hover:bg-violet-400/10 disabled:opacity-40">{diagnosticBusy ? "Testing..." : "Run Gemini POST test"}</button>
                <button type="button" disabled={!questions.length} onClick={() => void copy(true)} className="rounded-md border border-slate-600 px-3 py-2 text-xs font-bold text-slate-300 hover:border-cyan-400 hover:text-white disabled:opacity-40">Copy</button>
                <button type="button" disabled={!questions.length} onClick={() => void copy(false)} className="rounded-md border border-cyan-700 px-3 py-2 text-xs font-bold text-cyan-200 hover:bg-cyan-400/10 disabled:opacity-40">Copy for Duo</button>
                <button type="button" disabled={!canSave} onClick={save} className="rounded-md bg-emerald-400 px-3 py-2 text-xs font-black text-slate-950 hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-40">Save approved set</button>
              </div>
            </div>
            {error && <p role="alert" className="mb-4 rounded-lg border border-rose-400/40 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{error}</p>}
            {notice && <p role="status" className="mb-4 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-sm text-cyan-100">{notice}</p>}
            {!questions.length && <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center"><p className="text-3xl">⌁</p><p className="mt-3 font-bold text-slate-300">Your review queue is empty</p><p className="mt-1 text-sm text-slate-500">Write a brief and generate a complete set of three.</p></div>}
            <div className="space-y-4">{questions.map((question, index) => <article key={`question-${index}`} className="rounded-xl border border-slate-700 bg-slate-800/80 p-5 shadow-xl shadow-black/10">
              <div className="mb-4 flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Card {String(index + 1).padStart(2, "0")}</span><div className="flex gap-2"><button type="button" onClick={() => void regenerate(index)} disabled={busyIndex !== null || questions.length !== 3} className="rounded-md border border-slate-600 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:border-cyan-400 hover:text-white disabled:opacity-40">{busyIndex === index ? "…" : "Regenerate"}</button><button type="button" onClick={() => remove(index)} className="rounded-md border border-rose-900/70 px-2.5 py-1.5 text-xs font-bold text-rose-300 hover:bg-rose-400/10">Delete</button></div></div>
              <label className="block text-sm font-semibold text-slate-300">Question<textarea value={question.prompt} onChange={(event) => updateQuestion(index, { prompt: event.target.value })} maxLength={240} rows={2} className="mt-2 w-full resize-y rounded-lg border border-slate-600 bg-slate-950 p-3 text-sm text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" /></label>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{question.options.map((option, optionIndex) => <label key={optionIndex} className="text-xs font-bold text-slate-400"><span className="mb-1 block font-mono text-cyan-300">{String.fromCharCode(65 + optionIndex)}</span><input value={option} onChange={(event) => updateOption(index, optionIndex, event.target.value)} maxLength={100} className="w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-normal text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" /></label>)}</div>
              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]"><label className="text-xs font-bold text-slate-400">Intended answer<select value={question.answerIndex} onChange={(event) => updateQuestion(index, { answerIndex: Number(event.target.value) })} className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-normal text-white outline-none focus:border-cyan-400"><option value={0}>A — {question.options[0]}</option><option value={1}>B — {question.options[1]}</option><option value={2}>C — {question.options[2]}</option><option value={3}>D — {question.options[3]}</option></select></label><label className="text-xs font-bold text-slate-400">Optional explanation<input value={question.explanation ?? ""} onChange={(event) => updateQuestion(index, { explanation: event.target.value })} maxLength={280} placeholder="Why this is the likely answer…" className="mt-1.5 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm font-normal text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" /></label></div>
            </article>)}</div>
            {questions.length > 0 && <section className="mt-6 rounded-xl border border-amber-400/30 bg-amber-400/5 p-5">
              <h2 className="text-lg font-bold text-amber-200">Admin answer view</h2>
              <p className="mt-1 text-xs text-slate-500">Private answer key for review. This section is never included in Copy for Duo.</p>
              <div className="mt-4 space-y-4">{questions.map((question, index) => <article key={`answer-${index}`} className="border-t border-amber-400/15 pt-4 first:border-t-0 first:pt-0">
               <p className="text-sm font-bold text-slate-200">{index + 1}. {question.prompt}</p>
               <p className="mt-2 text-sm text-amber-200">Suggested answer: {String.fromCharCode(65 + question.answerIndex)} — {question.options[question.answerIndex]}</p>
               {question.explanation && <p className="mt-1 text-xs text-slate-400">{question.explanation}</p>}
              </article>)}</div>
            </section>}
          </section>
        </div>
      </div>
    </main>
  );
}
