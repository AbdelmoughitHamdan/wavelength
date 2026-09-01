import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorizationHeaderValid } from "../../../../../lib/admin-auth";
import { generateAdminQuestions } from "../../../../../lib/gemini";
import { adminGenerationRequestSchema } from "../../../../../lib/validation";

export async function POST(request: NextRequest) {
  if (!isAdminAuthorizationHeaderValid(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Admin authentication required." }, {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Wavelength Admin", charset="UTF-8"' }
    });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const parsed = adminGenerationRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Provide a brief between 3 and 1000 characters." }, { status: 400 });
  try {
    const questions = await generateAdminQuestions(parsed.data.prompt, parsed.data.context, parsed.data.preset);
    return NextResponse.json({ questions });
  } catch (error) {
    console.error("admin question generation failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Question generation failed. Try again." }, { status: 502 });
  }
}
