import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorizationHeaderValid } from "../../../../lib/admin-auth";

const apiBase = "https://generativelanguage.googleapis.com/v1beta/models";
const modelId = "gemini-2.5-flash-lite";

function unauthorized() {
  return NextResponse.json({ error: "Admin authentication required." }, {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Wavelength Admin", charset="UTF-8"' }
  });
}

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

export async function GET(request: NextRequest) {
  if (!isAdminAuthorizationHeaderValid(request.headers.get("authorization"))) return unauthorized();
  const key = configuredKey();
  if (!key) return NextResponse.json({ status: null, succeeded: false, modelPresent: false, generateContentSupported: false, error: "Gemini is not configured." });

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
  if (!isAdminAuthorizationHeaderValid(request.headers.get("authorization"))) return unauthorized();
  const key = configuredKey();
  if (!key) return NextResponse.json({ status: null, succeeded: false, error: "Gemini is not configured." });

  const response = await fetch(`${apiBase}/${modelId}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Say hello" }] }] }),
    cache: "no-store"
  });
  if (response.ok) return NextResponse.json({ status: response.status, succeeded: true });

  const body: unknown = await response.json().catch(() => null);
  return NextResponse.json({ status: response.status, succeeded: false, error: geminiError(body) });
}
