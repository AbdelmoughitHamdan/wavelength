import { NextResponse } from "next/server";
import { createGame } from "../../../lib/game-service";
import { playerNameSchema } from "../../../lib/validation";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const parsed = playerNameSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "Enter a name (2–24 characters)." }, { status: 400 });
    const result = await createGame(parsed.data.name);
    const response = NextResponse.json({ code: result.code, token: result.token });
    response.cookies.set(`hwdym_${result.code}`, result.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 30, path: "/" });
    return response;
  } catch (error) {
    console.error("create game failed", error);
    return NextResponse.json({ error: "We couldn't create a game right now. Try again." }, { status: 500 });
  }
}
