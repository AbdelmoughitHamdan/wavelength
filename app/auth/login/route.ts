import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "../../../lib/auth";
import { AuthCookie, createAuthRouteSupabaseClient } from "../../../lib/supabase/server";
import { authCredentialsSchema } from "../../../lib/validation";

function responseWithCookies(payload: object, status: number, cookies: AuthCookie[], headers: Record<string, string>) {
  const response = NextResponse.json(payload, { status });
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}

export async function POST(request: NextRequest) {
  const parsed = authCredentialsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email and a password of at least 8 characters." }, { status: 400 });

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const cookies: AuthCookie[] = [];
  const headers: Record<string, string> = {};
  const supabase = createAuthRouteSupabaseClient(request, (items, responseHeaders) => {
    cookies.push(...items);
    Object.assign(headers, responseHeaders);
  });
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return responseWithCookies({ error: "Email or password is incorrect." }, 401, cookies, headers);
  return responseWithCookies({ redirectTo: next }, 200, cookies, headers);
}
