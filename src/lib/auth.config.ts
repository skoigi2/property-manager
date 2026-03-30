import type { NextAuthConfig } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      organizationId: string | null;
      membershipCount: number;
    };
  }
  interface User {
    role: string;
    organizationId?: string | null;
    membershipCount?: number;
  }
}

export const authConfig: NextAuthConfig = {
  providers: [],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      // Initial sign-in: populate from user object
      if (user) {
        token.id = user.id;
        token.role = (user as { role: string }).role;
        token.organizationId = (user as { organizationId?: string | null }).organizationId ?? null;
        token.membershipCount = (user as { membershipCount?: number }).membershipCount ?? 1;
      }
      // Session update (org switch): refresh organizationId in token
      if (trigger === "update" && session?.organizationId !== undefined) {
        token.organizationId = session.organizationId;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.organizationId = (token.organizationId as string | null) ?? null;
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
