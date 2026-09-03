import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "./auth.config";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { autoAcceptPendingInvitations } from "@/lib/invitation-accept";

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
      authorize: async (credentials, request) => {
        if (!credentials?.email || !credentials?.password) return null;

        // Brute-force protection: cap attempts per IP and per account.
        // Returning null yields the same generic "invalid credentials" error,
        // so a limited attacker learns nothing about the account.
        const ip = getClientIp(request);
        const ipLimit = rateLimit(`login:ip:${ip}`, { max: 20, windowMs: 15 * 60 * 1000 });
        const emailLimit = rateLimit(
          `login:email:${(credentials.email as string).toLowerCase()}`,
          { max: 10, windowMs: 15 * 60 * 1000 }
        );
        if (!ipLimit.ok || !emailLimit.ok) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );

        if (!isValid) return null;

        // An invitee with no org yet is joined to the inviting org now, so
        // they land in it instead of on the create-organisation step.
        const joinedOrgId = await autoAcceptPendingInvitations(user);
        if (joinedOrgId) {
          const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
          if (refreshed) Object.assign(user, refreshed);
        }

        const [membershipCount, membership] = await Promise.all([
          prisma.userOrganizationMembership.count({ where: { userId: user.id } }),
          user.organizationId
            ? prisma.userOrganizationMembership.findUnique({
                where: {
                  userId_organizationId: {
                    userId: user.id,
                    organizationId: user.organizationId,
                  },
                },
                select: { role: true, isBillingOwner: true },
              })
            : null,
        ]);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgRole:        membership?.role ?? user.role,
          isBillingOwner: membership?.isBillingOwner ?? false,
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
          select: { id: true, email: true, role: true, organizationId: true },
        });
        if (dbUser && !dbUser.organizationId) {
          // Invited to an existing org? Join it — an invitee must never be
          // promoted into founding an org of their own.
          const joinedOrgId = await autoAcceptPendingInvitations(dbUser);
          if (!joinedOrgId && dbUser.role === "MANAGER") {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { role: "ADMIN" },
            });
          }
        }
      }
      return true;
    },

    async jwt({ token, user, account, trigger, session }) {
      // Org-switch / onboarding org creation: refresh token fields without full re-login
      if (trigger === "update" && session?.organizationId !== undefined) {
        token.organizationId = session.organizationId;
        if (session?.membershipCount !== undefined) token.membershipCount = session.membershipCount;

        // Re-fetch membership so orgRole + isBillingOwner always reflect the current org.
        // Callers only pass organizationId; the old JWT values are stale for the new org.
        if (session.organizationId) {
          const membership = await prisma.userOrganizationMembership.findUnique({
            where: {
              userId_organizationId: {
                userId: token.id as string,
                organizationId: session.organizationId as string,
              },
            },
            select: { role: true, isBillingOwner: true },
          });
          token.orgRole        = membership?.role ?? token.role;
          token.isBillingOwner = membership?.isBillingOwner ?? false;
        } else {
          // Super-admin (no org) — apply only explicitly-passed overrides
          if (session?.orgRole        !== undefined) token.orgRole        = session.orgRole;
          if (session?.isBillingOwner !== undefined) token.isBillingOwner = session.isBillingOwner;
        }
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
          const [membershipCount, membership] = await Promise.all([
            prisma.userOrganizationMembership.count({ where: { userId: user.id! } }),
            dbUser?.organizationId
              ? prisma.userOrganizationMembership.findUnique({
                  where: {
                    userId_organizationId: {
                      userId: user.id!,
                      organizationId: dbUser.organizationId,
                    },
                  },
                  select: { role: true, isBillingOwner: true },
                })
              : null,
          ]);
          token.role           = dbUser?.role ?? "ADMIN";
          token.orgRole        = membership?.role ?? dbUser?.role ?? "ADMIN";
          token.isBillingOwner = membership?.isBillingOwner ?? false;
          token.organizationId = dbUser?.organizationId ?? null;
          token.membershipCount = membershipCount;
        } else {
          // Credentials: all fields already on the user object from authorize()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          token.role           = (user as any).role;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          token.orgRole        = (user as any).orgRole ?? (user as any).role;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          token.isBillingOwner = (user as any).isBillingOwner ?? false;
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
