import { NextRequest, NextResponse } from "next/server";
import { submitAnswers } from "../../../../../lib/game-service";
import { getPlayerToken } from "../../../../../lib/auth";
import { answersSchema } from "../../../../../lib/validation";

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const parsed = answersSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose one answer for each question." }, { status: 400 });
    const result = await submitAnswers(params.code, getPlayerToken(request, params.code), parsed.data.answers);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status: number }).status) : 500;
    if (status >= 500) console.error("answers failed", error);
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "Unable to save answers." }, { status });
  }
}
