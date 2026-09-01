import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "../../../lib/auth";
import { AuthCookie, createAuthRouteSupabaseClient } from "../../../lib/supabase/server";

export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const responseCookies: AuthCookie[] = [];
  const headers: Record<string, string> = {};
  const supabase = createAuthRouteSupabaseClient(request, (items, responseHeaders) => {
    responseCookies.push(...items);
    Object.assign(headers, responseHeaders);
  });
  const code = request.nextUrl.searchParams.get("code");
  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : { error: new Error("Missing confirmation code.") };
  const redirectUrl = error
    ? new URL(`/login?next=${encodeURIComponent(next)}&message=${encodeURIComponent("We could not confirm that link. Please log in.")}`, request.url)
    : new URL(next, request.url);
  const response = NextResponse.redirect(redirectUrl);
  responseCookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}
