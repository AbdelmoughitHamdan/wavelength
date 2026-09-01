import { NextRequest, NextResponse } from "next/server";
import { isAdminEmailAllowed } from "../../../../lib/admin-auth";
import { GEMINI_MODEL, generateGeminiText } from "../../../../lib/gemini";
import { createRequestSupabaseClient } from "../../../../lib/supabase/server";

const apiBase = "https://generativelanguage.googleapis.com/v1beta/models";
const modelId = GEMINI_MODEL;

function geminiError(body: unknown) {
  if (typeof body === "object" && body !== null && "error" in body) {
    const error = body.error;
    if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
      return error.message;
    }
  }
  return "Gemini returned an unreadable error response.";
}

function configuredKey() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return key;
}

async function requireAdminUser(request: NextRequest) {
  const { data, error } = await createRequestSupabaseClient(request).auth.getUser();
  if (error || !data.user || !isAdminEmailAllowed(data.user.email)) {
    return null;
  }
  return data.user;
}

export async function GET(request: NextRequest) {
  if (!(await requireAdminUser(request))) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }

  const key = configuredKey();
  if (!key) {
    return NextResponse.json({ status: null, succeeded: false, modelPresent: false, generateContentSupported: false, error: "Gemini is not configured." });
  }

  const response = await fetch(`${apiBase}?key=${encodeURIComponent(key)}`, { cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    return NextResponse.json({
      status: response.status,
      succeeded: false,
      modelPresent: false,
      generateContentSupported: false,
      error: geminiError(body)
    });
  }

  const models = typeof body === "object" && body !== null && "models" in body && Array.isArray(body.models)
    ? body.models
    : [];
  const model = models.find((item): item is { name?: unknown; supportedGenerationMethods?: unknown } =>
    typeof item === "object" && item !== null && "name" in item && item.name === `models/${modelId}`
  );
  const methods = model && Array.isArray(model.supportedGenerationMethods) ? model.supportedGenerationMethods : [];
  return NextResponse.json({
    status: response.status,
    succeeded: true,
    modelPresent: Boolean(model),
    generateContentSupported: methods.includes("generateContent")
  });
}

export async function POST(request: NextRequest) {
  if (!(await requireAdminUser(request))) {
    return NextResponse.json({ error: "Admin authentication required." }, { status: 401 });
  }

  try {
    await generateGeminiText("Say hello");
    return NextResponse.json({ status: 200, succeeded: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gemini request failed.";
    return NextResponse.json({ status: 502, succeeded: false, error: message });
  }
}
