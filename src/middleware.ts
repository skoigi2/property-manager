import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// Pages an on-site CARETAKER may open (segment-aware prefix match).
const CARETAKER_PATHS = ["/expenses", "/maintenance", "/vendors", "/select-org", "/onboarding", "/invite", "/help/tutorials"];
const CARETAKER_HOME = "/maintenance";
const underPath = (pathname: string, base: string) => pathname === base || pathname.startsWith(base + "/");

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/login");
  const isSelectOrgPage = pathname.startsWith("/select-org");
  const isPortalPage = pathname.startsWith("/portal/");
  const isApprovePage = pathname.startsWith("/approve/");
  const isSignPage = pathname.startsWith("/sign/") || pathname.startsWith("/vendor/"); // tenant e-sign + vendor magic links

  // Public marketing + auth pages — no login required
  const isPublicPage =
    pathname === "/" ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/examples") ||
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
    pathname.startsWith("/tools") ||
    pathname.startsWith("/contact");

  if (!isLoggedIn && !isAuthPage && !isPortalPage && !isApprovePage && !isSignPage && !isPublicPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Page-level decisions key on the ACTIVE ORG's membership role (orgRole),
  // never the global User.role — the invitation flow only ever writes the
  // membership role. Super-admin has no membership; orgRole falls back to ADMIN.
  const orgRole = (req.auth?.user as { orgRole?: string } | undefined)?.orgRole ?? req.auth?.user?.role;

  if (isLoggedIn && (isAuthPage || pathname === "/")) {
    const dest = orgRole === "OWNER" ? "/report" : orgRole === "CARETAKER" ? CARETAKER_HOME : "/dashboard";
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

  // CARETAKER (on-site staff): an ALLOW-list of pages — everything else
  // redirects to their home. Keep this an allow-list; the OWNER block below
  // is a deny-list and must not be the template for new roles.
  if (isLoggedIn && orgRole === "CARETAKER" && !isPublicPage) {
    const superAdmin = req.auth?.user?.role === "ADMIN" && !(req.auth?.user as any)?.organizationId;
    if (!superAdmin && !CARETAKER_PATHS.some((p) => underPath(pathname, p))) {
      return NextResponse.redirect(new URL(CARETAKER_HOME, req.url));
    }
  }

  // Manager-only routes (OWNER is blocked)
  // "/calendar" is manager-only because every API behind it (GET /api/calendar,
  // /export, /calendar-feeds) is requireManager(), and its events deep-link to
  // manager-only pages. Leaving the page reachable by OWNER gave them a shell
  // that could never load. An owner-facing calendar needs owner-appropriate
  // destinations first — see docs note in CLAUDE.md.
  const managerOnlyPaths = ["/inbox", "/income", "/expenses", "/petty-cash", "/tenants", "/settings", "/arrears", "/recurring-expenses", "/import", "/insurance", "/assets", "/maintenance", "/airbnb", "/forecast", "/vendors", "/cases", "/automations", "/calendar"];
  if (isLoggedIn && managerOnlyPaths.some((p) => pathname.startsWith(p))) {
    if (orgRole === "OWNER") {
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
