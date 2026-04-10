import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adapter: PrismaAdapter(prisma) as any,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) return null;

        const membershipCount = await prisma.userOrganizationMembership.count({
          where: { userId: user.id },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId: user.organizationId ?? null,
          membershipCount,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,  // includes the session callback

    async signIn({ user, account }) {
      if (account?.provider === "google") {
        // Detect brand-new self-signup: PrismaAdapter just created a User with
        // the schema default role (MANAGER) and no organisationId.
        // Promote them to ADMIN so they can create their own organisation.
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email! },
          select: { id: true, role: true, organizationId: true },
        });
        if (dbUser && dbUser.role === "MANAGER" && !dbUser.organizationId) {
          await prisma.user.update({
            where: { id: dbUser.id },
            data: { role: "ADMIN" },
          });
        }
      }
      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      // Org-switch: session.update({ organizationId }) — refresh token only
      if (trigger === "update" && session?.organizationId !== undefined) {
        token.organizationId = session.organizationId;
        return token;
      }

      // Initial sign-in: populate token from user object
      if (user) {
        token.id             = user.id!;
        // For new Google sign-ups the role was just updated to ADMIN above;
        // re-fetch from DB to get the current value.
        if (account?.provider === "google") {
          const dbUser = await prisma.user.findUnique({
            where: { id: user.id! },
            select: { role: true, organizationId: true },
          });
          token.role           = dbUser?.role ?? "ADMIN";
          token.organizationId = dbUser?.organizationId ?? null;
          token.membershipCount = await prisma.userOrganizationMembership.count({
            where: { userId: user.id! },
          });
        } else {
          // Credentials: all fields already on the user object from authorize()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          token.role           = (user as any).role;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          token.organizationId = (user as any).organizationId ?? null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          token.membershipCount = (user as any).membershipCount ?? 1;
        }
      }

      return token;
    },
  },
});
