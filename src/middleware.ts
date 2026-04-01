import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/login");
  const isSelectOrgPage = pathname.startsWith("/select-org");

  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isLoggedIn && isAuthPage) {
    const role = req.auth?.user?.role;
    const dest = role === "OWNER" ? "/report" : "/dashboard";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // Multi-org users who haven't selected an org yet: redirect to org picker
  // Skip this for the select-org page itself and API routes
  if (isLoggedIn && !isSelectOrgPage) {
    const user = req.auth?.user as any;
    const membershipCount = user?.membershipCount ?? 1;
    const orgId = user?.organizationId;
    const role = user?.role;
    const isSuperAdmin = role === "ADMIN" && (orgId === null || orgId === undefined);

    // Regular users (not super-admin) with multiple org memberships and no active org
    if (!isSuperAdmin && membershipCount > 1 && !orgId) {
      return NextResponse.redirect(new URL("/select-org", req.url));
    }
  }

  // Manager-only routes (OWNER is blocked)
  const managerOnlyPaths = ["/income", "/expenses", "/petty-cash", "/tenants", "/settings", "/arrears", "/recurring-expenses", "/import", "/insurance", "/assets", "/maintenance", "/airbnb", "/forecast", "/vendors"];
  if (isLoggedIn && managerOnlyPaths.some((p) => pathname.startsWith(p))) {
    const role = req.auth?.user?.role;
    if (role === "OWNER") {
      return NextResponse.redirect(new URL("/report", req.url));
    }
  }

  // Super-admin only routes
  if (isLoggedIn && pathname.startsWith("/admin")) {
    const role = req.auth?.user?.role;
    const orgId = (req.auth?.user as any)?.organizationId;
    const isSuperAdmin = role === "ADMIN" && (orgId === null || orgId === undefined);
    if (!isSuperAdmin) {
      return NextResponse.redirect(new URL("/dashboard", req.url));
    }
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*\\.js).*)",
  ],
};
