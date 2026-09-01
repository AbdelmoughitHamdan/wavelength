import { NextRequest, NextResponse } from "next/server";
import { nextRound } from "../../../../../lib/game-service";
import { getAuthenticatedUser } from "../../../../../lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    return NextResponse.json(await nextRound(params.code, await getAuthenticatedUser(request)));
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status: number }).status) : 500;
    if (status >= 500) console.error("next round failed", error);
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "Unable to continue." }, { status });
  }
}
