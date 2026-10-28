import { getServerSession, type NextAuthOptions, type Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

import type { Db, UserRole } from "@bandcoin/db";
import type { WalletType } from "@bandcoin/wallet/shared";

import { authorizeCredentials, type AuthenticatedUser } from "./authorize-credentials";
import { sharedSessionCookie } from "./session-cookie";
import { recordSignIn } from "./sign-in-log";

declare module "next-auth/jwt" {
  interface JWT {
    walletAddress?: string;
    walletType?: WalletType;
    role?: UserRole;
    emailVerified?: boolean;
    /** When `role` was last read from the database (ms) */
    roleCheckedAt?: number;
  }
}

/** A role change (artist approved, admin removed) reaches open sessions within this long. */
const ROLE_REFRESH_MS = 5 * 60_000;

/**
 * NextAuth options for one app. Every app shares the same JWT session (and,
 * in production, one cookie across *.bandcoin.io), and every sign-in attempt
 * is written to the activity log with the app's name.
 */
export function createAuthOptions(input: { app: "app" | "artist" | "ar" | "studio"; db: Db }): NextAuthOptions {
  const { app, db } = input;
  return {
    session: { strategy: "jwt" },
    cookies: sharedSessionCookie,
    pages: { signIn: "/", error: "/" },
    providers: [
      CredentialsProvider({
        type: "credentials",
        credentials: {},
        async authorize(credentials, req) {
          const headers = new Headers(req.headers as Record<string, string> | undefined);
          const sent = credentials as Record<string, string | undefined> | undefined;
          const facts = { app, walletType: sent?.walletType, publicKey: sent?.pubkey, headers };
          try {
            const user = await authorizeCredentials(db, credentials);
            await recordSignIn(db, { ...facts, result: { user } });
            return user;
          } catch (error) {
            await recordSignIn(db, { ...facts, result: { error } });
            throw error;
          }
        },
      }),
    ],
    callbacks: {
      async jwt({ token, user }) {
        const signedIn = user as AuthenticatedUser | undefined;
        if (signedIn) {
          return {
            ...token,
            sub: signedIn.id,
            walletAddress: signedIn.walletAddress,
            walletType: signedIn.walletType,
            role: signedIn.role,
            emailVerified: signedIn.emailVerified,
            roleCheckedAt: Date.now(),
          };
        }
        if (token.sub && Date.now() - (token.roleCheckedAt ?? 0) > ROLE_REFRESH_MS) {
          const row = await db.user.findUnique({ where: { id: token.sub }, select: { role: true } });
          if (!row) return { ...token, sub: undefined };
          return { ...token, role: row.role, roleCheckedAt: Date.now() };
        }
        return token;
      },
      session: ({ session, token }) => ({
        ...session,
        user: {
          ...session.user,
          id: token.sub!,
          walletAddress: token.walletAddress!,
          walletType: token.walletType!,
          role: token.role ?? "FAN",
          emailVerified: token.emailVerified ?? false,
        },
      }),
    },
  };
}

/** The signed-in session in a route handler or server component. */
export const getServerAuthSession = (options: NextAuthOptions) => getServerSession(options);

/** The API's view of a session: null unless it carries a complete user. */
export function sessionUserOf(session: Session | null) {
  const user = session?.user;
  if (!user?.id || !user.walletAddress || !user.walletType) return null;
  return {
    user: {
      id: user.id,
      role: user.role,
      walletAddress: user.walletAddress,
      walletType: user.walletType,
      email: user.email ?? null,
    },
  };
}
