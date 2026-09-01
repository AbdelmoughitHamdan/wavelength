import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthorizationHeaderValid } from "../../../../../lib/admin-auth";
import { generateAdminQuestions } from "../../../../../lib/gemini";
import { adminRegenerationRequestSchema } from "../../../../../lib/validation";

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
  const parsed = adminRegenerationRequestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "This question cannot be regenerated from the supplied data." }, { status: 400 });
  try {
    const avoid = parsed.data.currentQuestions
      .filter((_, index) => index !== parsed.data.questionIndex)
      .map((question) => question.prompt)
      .join(" | ");
    const questions = await generateAdminQuestions(
      `${parsed.data.prompt}. Create a replacement for question ${parsed.data.questionIndex + 1}; avoid these existing prompts: ${avoid}`,
      parsed.data.context,
      parsed.data.preset
    );
    return NextResponse.json({ question: questions[0] });
  } catch (error) {
    console.error("admin question regeneration failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Question regeneration failed. Try again." }, { status: 502 });
  }
}
