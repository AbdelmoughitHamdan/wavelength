import { NextRequest, NextResponse } from "next/server";
import { AuthCookie, createAuthRouteSupabaseClient } from "../../../lib/supabase/server";

export async function POST(request: NextRequest) {
  const cookies: AuthCookie[] = [];
  const headers: Record<string, string> = {};
  const supabase = createAuthRouteSupabaseClient(request, (items, responseHeaders) => {
    cookies.push(...items);
    Object.assign(headers, responseHeaders);
  });
  await supabase.auth.signOut();
  const response = NextResponse.json({ redirectTo: "/" });
  cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
  return response;
}
