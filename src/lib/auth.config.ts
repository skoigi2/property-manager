import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;           // global User.role — used only for super-admin detection
      orgRole: string;        // active org's membership role (same as role for super-admin)
      isPlatformAdmin: boolean; // User.isPlatformAdmin — the only thing that makes a super-admin
      isBillingOwner: boolean;
      organizationId: string | null;
      membershipCount: number;
    };
  }
  interface User {
    role: string;
    orgRole?: string;
    isBillingOwner?: boolean;
    organizationId?: string | null;
    membershipCount?: number;
    isPlatformAdmin?: boolean;
  }
}

/**
 * A token with no organisation only keeps the ADMIN role when the user is a
 * platform admin. Every place that recognises the super-admin by
 * "ADMIN + no organisation" therefore sees a plain MANAGER (who reaches
 * nothing) for anyone else: a Google sign-up before it has created its
 * organisation, a founder removed from their only organisation, or an old
 * token from before the flag existed. Runs on every token read (middleware
 * and server).
 */
export function withPlatformScope<T extends Record<string, unknown>>(token: T): T {
  if (token.isPlatformAdmin === true || token.organizationId) return token;
  const demoted: Record<string, unknown> = { ...token };
  if (demoted.role === "ADMIN") demoted.role = "MANAGER";
  if (demoted.orgRole === "ADMIN") demoted.orgRole = "MANAGER";
  return demoted as T;
}

export const authConfig: NextAuthConfig = {
  providers: [],
  callbacks: {
    jwt({ token }) {
      return withPlatformScope(token);
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id              = token.id as string;
        session.user.role            = token.role as string;
        session.user.orgRole         = (token.orgRole as string) ?? (token.role as string);
        session.user.isBillingOwner  = (token.isBillingOwner as boolean) ?? false;
        session.user.organizationId  = (token.organizationId as string | null) ?? null;
        session.user.membershipCount = (token.membershipCount as number) ?? 1;
        session.user.isPlatformAdmin = token.isPlatformAdmin === true;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
};
