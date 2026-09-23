import NextAuth from "next-auth";
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
