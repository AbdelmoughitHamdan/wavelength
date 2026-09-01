import { NextRequest, NextResponse } from "next/server";
import { getGameView } from "../../../../lib/game-service";
import { getAuthenticatedUser } from "../../../../lib/supabase/server";

export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const view = await getGameView(params.code, await getAuthenticatedUser(request));
    return NextResponse.json(view);
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status: number }).status) : 500;
    const message = status < 500 && error instanceof Error ? error.message : "Unable to load this game.";
    if (status >= 500) console.error("load game failed", error);
    return NextResponse.json({ error: message }, { status });
  }
}
