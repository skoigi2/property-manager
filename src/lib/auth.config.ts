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
  }
}

export const authConfig: NextAuthConfig = {
  providers: [],
  callbacks: {
    session({ session, token }) {
      if (session.user) {
        session.user.id              = token.id as string;
        session.user.role            = token.role as string;
        session.user.orgRole         = (token.orgRole as string) ?? (token.role as string);
        session.user.isBillingOwner  = (token.isBillingOwner as boolean) ?? false;
        session.user.organizationId  = (token.organizationId as string | null) ?? null;
        session.user.membershipCount = (token.membershipCount as number) ?? 1;
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
