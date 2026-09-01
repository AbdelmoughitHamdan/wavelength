import { NextRequest, NextResponse } from "next/server";
import { createGame, listGames } from "../../../lib/game-service";
import { getAuthenticatedUser } from "../../../lib/supabase/server";

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json({ games: await listGames(await getAuthenticatedUser(request)) });
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status: number }).status) : 500;
    if (status >= 500) console.error("list games failed", error);
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "Unable to load your games." }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await createGame(await getAuthenticatedUser(request)));
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status: number }).status) : 500;
    if (status >= 500) console.error("create game failed", error);
    return NextResponse.json({ error: status < 500 && error instanceof Error ? error.message : "We couldn't create a game right now. Try again." }, { status });
  }
}
