import { NextRequest, NextResponse } from "next/server";
import { joinGame } from "../../../../../lib/game-service";
import { getAuthenticatedUser } from "../../../../../lib/supabase/server";

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    return NextResponse.json(await joinGame(params.code, await getAuthenticatedUser(request)));
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status: number }).status) : 500;
    const message = status < 500 && error instanceof Error ? error.message : "Unable to join this game.";
    if (status >= 500) console.error("join game failed", error);
    return NextResponse.json({ error: message }, { status });
  }
}
