import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { safeNextPath } from "./lib/auth";
import { getSupabasePublishableKey, getSupabaseUrl } from "./lib/supabase/config";

const isAdminPath = (pathname: string) =>
  pathname === "/admin/questions" ||
  pathname.startsWith("/admin/questions/") ||
  (pathname.startsWith("/api/admin/") && pathname !== "/api/admin/gemini-test");

export async function middleware(request: NextRequest) {
  if (isAdminPath(request.nextUrl.pathname)) {
    if (!request.headers.get("authorization")) {
      return new NextResponse("Authentication required.", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Wavelength Admin", charset="UTF-8"' }
      });
    }
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (items, headers) => {
        items.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        items.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([name, value]) => response.headers.set(name, value));
      }
    }
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (request.nextUrl.pathname.startsWith("/game/") && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", safeNextPath(`${request.nextUrl.pathname}${request.nextUrl.search}`));
    const redirect = NextResponse.redirect(loginUrl);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
