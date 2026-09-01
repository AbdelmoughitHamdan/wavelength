import { NextRequest, NextResponse } from "next/server";
import { submitPredictions } from "../../../../../lib/game-service";
import { getPlayerToken } from "../../../../../lib/auth";
import { predictionsSchema } from "../../../../../lib/validation";

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const parsed = predictionsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose one answer for each question." }, { status: 400 });
    const result = await submitPredictions(params.code, getPlayerToken(request, params.code), parsed.data.predictions);
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status: number }).status) : 500;
    if (status >= 500) console.error("prediction failed", error);
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "Unable to save predictions." }, { status });
  }
}
