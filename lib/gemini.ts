import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { adminQuestionsSchema, AdminQuestion, generatedQuestionSchema, GeneratedQuestion } from "./validation";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";

const generatedQuestionResponseFormat = {
  type: "text",
  mime_type: "application/json",
  schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            options: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: { type: "string" }
            }
          },
          required: ["prompt", "options"],
          additionalProperties: false
        }
      }
    },
    required: ["questions"],
    additionalProperties: false
  }
} as const;

const adminQuestionResponseFormat = {
  type: "text",
  mime_type: "application/json",
  schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            prompt: { type: "string" },
            options: {
              type: "array",
              minItems: 4,
              maxItems: 4,
              items: { type: "string" }
            },
            answerIndex: { type: "integer", minimum: 0, maximum: 3 },
            explanation: { type: "string" }
          },
          required: ["prompt", "options", "answerIndex"],
          additionalProperties: false
        }
      }
    },
    required: ["questions"],
    additionalProperties: false
  }
} as const;

function geminiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("Gemini is not configured.");
  return new GoogleGenAI({ apiKey: key });
}

async function createGeminiInteraction(prompt: string, responseFormat: any = generatedQuestionResponseFormat) {
  const client = geminiClient();
  return client.interactions.create({
    model: GEMINI_MODEL,
    input: prompt,
    response_format: responseFormat,
    store: false
  });
}

async function geminiText(prompt: string) {
  const interaction = await createGeminiInteraction(prompt, { type: "text", mime_type: "text/plain" });
  const text = interaction.output_text?.trim();
  if (!text) throw new Error("Gemini returned no content.");
  return text;
}

function assertDistinct<T extends { prompt: string; options: string[] }>(questions: T[]) {
  const prompts = questions.map((question) => question.prompt.trim().toLocaleLowerCase());
  if (new Set(prompts).size !== prompts.length) throw new Error("Gemini returned duplicate questions.");
  for (const question of questions) {
    const options = question.options.map((option) => option.trim().toLocaleLowerCase());
    if (new Set(options).size !== options.length) throw new Error("Gemini returned duplicate options.");
  }
}

async function requestGemini<T>(
  prompt: string,
  schema: z.ZodType<T>,
  responseFormat: any = generatedQuestionResponseFormat
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const interaction = await createGeminiInteraction(prompt, responseFormat);
      const text = interaction.output_text?.trim();
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
  const result = await requestGemini(request, adminQuestionsSchema, adminQuestionResponseFormat);
  assertDistinct(result.questions);
  return result.questions;
}

export async function generateGeminiText(prompt: string) {
  return geminiText(prompt);
}
