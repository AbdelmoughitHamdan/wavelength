import { NextRequest, NextResponse } from "next/server";

const isAdminPath = (pathname: string) => pathname === "/admin/questions" || pathname.startsWith("/admin/questions/") || pathname.startsWith("/api/admin/");

export function middleware(request: NextRequest) {
  if (!isAdminPath(request.nextUrl.pathname)) return NextResponse.next();
  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Wavelength Admin", charset="UTF-8"' }
    });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/questions/:path*", "/api/admin/:path*"]
};
