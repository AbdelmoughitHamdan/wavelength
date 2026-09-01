import { NextRequest, NextResponse } from "next/server";
import { joinGame } from "../../../../../lib/game-service";
import { playerNameSchema } from "../../../../../lib/validation";

export async function POST(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const body: unknown = await request.json();
    const parsed = playerNameSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Enter a name (2–24 characters)." }, { status: 400 });
    const result = await joinGame(params.code, parsed.data.name);
    const response = NextResponse.json({ code: params.code.toUpperCase(), token: result.token });
    response.cookies.set(`hwdym_${params.code.toUpperCase()}`, result.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
    return response;
  } catch (error) {
    const status = error instanceof Error && "status" in error ? Number((error as Error & { status: number }).status) : 500;
    const message = status < 500 && error instanceof Error ? error.message : "Unable to join this game.";
    if (status >= 500) console.error("join game failed", error);
    return NextResponse.json({ error: message }, { status });
  }
}
