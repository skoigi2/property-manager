import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/login");
  const isSelectOrgPage = pathname.startsWith("/select-org");
  const isPortalPage = pathname.startsWith("/portal/");

  // Public marketing + auth pages — no login required
  const isPublicPage =
    pathname === "/" ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/api/auth/signup") ||
    pathname.startsWith("/api/auth/forgot-password") ||
    pathname.startsWith("/api/auth/reset-password") ||
    pathname.startsWith("/api/webhooks/paddle") ||
    pathname.startsWith("/api/invitations") ||  // public invite-accept flow
    pathname.startsWith("/invite/") ||           // invite accept page
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/refund") ||
    pathname.startsWith("/blog") ||
    pathname.startsWith("/contact");

  if (!isLoggedIn && !isAuthPage && !isPortalPage && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (isLoggedIn && (isAuthPage || pathname === "/")) {
    const role = req.auth?.user?.role;
    const dest = role === "OWNER" ? "/report" : "/dashboard";
    return NextResponse.redirect(new URL(dest, req.url));
  }

  // Multi-org users who haven't selected an org yet: redirect to org picker
  // Skip this for the select-org page itself and API routes
  const isOnboardingPage = pathname.startsWith("/onboarding");

  if (isLoggedIn && !isSelectOrgPage && !isOnboardingPage) {
    const user = req.auth?.user as any;
    const membershipCount = user?.membershipCount ?? 1;
    const orgId = user?.organizationId;
    const role = user?.role;
    const isSuperAdmin = role === "ADMIN" && (orgId === null || orgId === undefined);

    // New self-signup user (Google or future signup flow) — no org yet
    if (!isSuperAdmin && membershipCount === 0) {
      return NextResponse.redirect(new URL("/onboarding", req.url));
    }

    // Regular users (not super-admin) with multiple org memberships and no active org
    if (!isSuperAdmin && membershipCount > 1 && !orgId) {
      return NextResponse.redirect(new URL("/select-org", req.url));
    }
  }

  // Manager-only routes (OWNER is blocked)
  const managerOnlyPaths = ["/income", "/expenses", "/petty-cash", "/tenants", "/settings", "/arrears", "/recurring-expenses", "/import", "/insurance", "/assets", "/maintenance", "/airbnb", "/forecast", "/vendors", "/cases"];
  if (isLoggedIn && managerOnlyPaths.some((p) => pathname.startsWith(p))) {
    const role = req.auth?.user?.role;
    if (role === "OWNER") {
      return NextResponse.redirect(new URL("/report", req.url));
    }
  }

  // Billing page — only billing owner or super-admin
  if (isLoggedIn && pathname.startsWith("/billing")) {
    const user = req.auth?.user as any;
    const superAdmin = user?.role === "ADMIN" && !user?.organizationId;
    if (!superAdmin && !user?.isBillingOwner) {
      return NextResponse.redirect(new URL("/dashboard?error=billing-owner-only", req.url));
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
    "/((?!api|_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*\\.js|guide\\.html|guide-screenshots).*)",
  ],
};
