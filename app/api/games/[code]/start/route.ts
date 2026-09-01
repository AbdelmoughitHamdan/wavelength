import { NextRequest, NextResponse } from "next/server";
import { startRound } from "../../../../../lib/game-service";
import { getAuthenticatedUser } from "../../../../../lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const result = await startRound(params.code, await getAuthenticatedUser(request));
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status: number }).status) : 500;
    if (status >= 500) console.error("start round failed", error);
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "Unable to start the round." }, { status });
  }
}
