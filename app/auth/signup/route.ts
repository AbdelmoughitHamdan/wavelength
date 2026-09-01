import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "../../../lib/auth";
import { AuthCookie, createAuthRouteSupabaseClient } from "../../../lib/supabase/server";
import { signUpSchema } from "../../../lib/validation";

function responseWithCookies(payload: object, status: number, cookies: AuthCookie[], headers: Record<string, string>) {
  const response = NextResponse.json(payload, { status });
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}

export async function POST(request: NextRequest) {
  const parsed = signUpSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter a display name, valid email, and password of at least 8 characters." }, { status: 400 });
  }

  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const cookies: AuthCookie[] = [];
  const headers: Record<string, string> = {};
  const supabase = createAuthRouteSupabaseClient(request, (items, responseHeaders) => {
    cookies.push(...items);
    Object.assign(headers, responseHeaders);
  });
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  const emailRedirectTo = appUrl ? `${appUrl}/auth/callback?next=${encodeURIComponent(next)}` : undefined;
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo
    }
  });
  if (error) return responseWithCookies({ error: error.message }, 400, cookies, headers);
  if (!data.session) {
    return responseWithCookies({
      redirectTo: `/login?next=${encodeURIComponent(next)}&message=${encodeURIComponent("Check your email to confirm your account, then log in.")}`
    }, 200, cookies, headers);
  }
  return responseWithCookies({ redirectTo: next }, 200, cookies, headers);
}
