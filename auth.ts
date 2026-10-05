import NextAuth, { type Session } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import {PrismaAdapter} from "@auth/prisma-adapter";
import {prisma} from"@/lib/prisma";
import {normalizeEmail, verifyPassword} from "@/lib/password";

export const { handlers, signIn, signOut, auth } = NextAuth({
    adapter: PrismaAdapter(prisma),

    // Credentials sign-in can't use database sessions in Auth.js, so both
    // providers share JWT sessions. Users are still persisted via the adapter.
    session: { strategy: "jwt" },

    pages: {
        signIn: "/login",
    },

    callbacks: {
        // Auth.js puts the database user id in token.sub at sign-in; exposing
        // it lets id-only routes skip a billed user lookup per request.
        session({ session, token }) {
            if (token.sub) session.user.id = token.sub;
            return session;
        },
    },

    providers: [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        }),
        Credentials({
            credentials: {
                email: {},
                password: {},
            },
            authorize: async (credentials) => {
                if (typeof credentials?.email !== "string" || typeof credentials?.password !== "string") {
                    return null;
                }

                const user = await prisma.user.findUnique({
                    where: { email: normalizeEmail(credentials.email) },
                });

                if (!user?.passwordHash || !(await verifyPassword(credentials.password, user.passwordHash))) {
                    return null;
                }

                return { id: user.id, email: user.email, name: user.name, image: user.image };
            },
        }),
    ],
});

// The signed-in user's id, without a database read. Routes that need user
// fields (terms acceptance, email, password) must still load the row.
export function sessionUserRef(session: Session | null): { id: string } | null {
    return session?.user?.id ? { id: session.user.id } : null;
}
