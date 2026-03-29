import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/login");

  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isLoggedIn && isAuthPage) {
    const role = req.auth?.user?.role;
    const dest = role === "OWNER" ? "/report" : "/dashboard";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // Manager-only routes
  const managerOnlyPaths = ["/income", "/expenses", "/petty-cash", "/tenants", "/settings", "/arrears", "/recurring-expenses", "/import", "/insurance", "/assets", "/maintenance", "/airbnb"];
  if (isLoggedIn && managerOnlyPaths.some((p) => pathname.startsWith(p))) {
    const role = req.auth?.user?.role;
    if (role === "OWNER") {
      return NextResponse.redirect(new URL("/report", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*\\.js).*)",
  ],
};
