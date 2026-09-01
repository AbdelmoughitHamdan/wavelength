import { z } from "zod";
import { adminQuestionsSchema, AdminQuestion, generatedQuestionSchema, GeneratedQuestion } from "./validation";

const endpoint = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent";

function assertDistinct<T extends { prompt: string; options: string[] }>(questions: T[]) {
  const prompts = questions.map((question) => question.prompt.trim().toLocaleLowerCase());
  if (new Set(prompts).size !== prompts.length) throw new Error("Gemini returned duplicate questions.");
  for (const question of questions) {
    const options = question.options.map((option) => option.trim().toLocaleLowerCase());
    if (new Set(options).size !== options.length) throw new Error("Gemini returned duplicate options.");
  }
}

async function requestGemini<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini is not configured.");
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${endpoint}?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.9, responseMimeType: "application/json" }
        }),
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Gemini returned ${response.status}.`);
      const payload: unknown = await response.json();
      const text = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini returned no content.");
      const parsed = schema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error("Gemini returned invalid question JSON.");
      return parsed.data;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Question generation failed after retry: ${lastError instanceof Error ? lastError.message : "invalid response"}`);
}

const qualityRules = `Write subjective, personal questions that the subject can answer from their own preferences. Make every question entertaining and easy to answer, with four distinct options. Do not use factual trivia, objectively correct answers, ambiguity, duplicates, offensive content, sensitive or invasive topics, or requests for private information. Return structured JSON only, with no markdown or extra keys.`;

export async function generateQuestions(subject: string): Promise<GeneratedQuestion[]> {
  const prompt = `Create exactly three playful multiple-choice questions for a two-player game about what ${subject} would choose, prefer, or do. ${qualityRules} Return exactly this shape: {"questions":[{"prompt":"...","options":["...","...","...","..."]},...]}.`;
  const result = await requestGemini(prompt, generatedQuestionSchema);
  assertDistinct(result.questions);
  return result.questions;
}

export async function generateAdminQuestions(prompt: string, context?: string, preset?: string): Promise<AdminQuestion[]> {
  const contextLine = context ? `Use this private duo context only as inspiration; do not repeat or expose it: ${context}` : "";
  const presetLine = preset ? `Style preset: ${preset}.` : "";
  const request = `Create exactly three Wavelength question suggestions based on this admin brief: ${prompt}. ${presetLine} ${contextLine} ${qualityRules} For each question, choose the intended answer index (0 through 3) as your best subjective estimate and optionally add a short explanation (at most 280 characters). Return exactly this shape: {"questions":[{"prompt":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]}.`;
  const result = await requestGemini(request, adminQuestionsSchema);
  assertDistinct(result.questions);
  return result.questions;
}
