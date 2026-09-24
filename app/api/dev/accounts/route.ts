import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDevAccountEmail } from "@/lib/devAccounts";
import { getDetectionQuota, grantDetectionCredits } from "@/lib/aiRateLimit";

const MAX_GRANT = 1000;

async function requireDev() {
    const session = await auth();

    if (!session?.user?.email) {
        return { error: NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 }) };
    }

    if (!isDevAccountEmail(session.user.email)) {
        return { error: NextResponse.json({ success: false, error: "Not a dev account." }, { status: 403 }) };
    }

    return { email: session.user.email };
}

// Every account with its announcement-check quota, for the dev dashboard's
// credits panel. Dev-only: this lists other users' emails.
export async function GET() {
    try {
        const dev = await requireDev();

        if (dev.error) {
            return dev.error;
        }

        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true },
            orderBy: { email: "asc" },
        });

        const accounts = await Promise.all(
            users.map(async (user) => ({
                ...user,
                quota: await getDetectionQuota(user.id),
            }))
        );

        return NextResponse.json({ success: true, accounts, currentEmail: dev.email });
    } catch (error) {
        console.error("❌ Failed to list dev accounts:", error);

        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

// Grants bonus announcement checks to an account — added on top of the
// weekly allowance and spent only after it runs out.
export async function POST(request: Request) {
    try {
        const dev = await requireDev();

        if (dev.error) {
            return dev.error;
        }

        const body = await request.json().catch(() => null);
        const userId = body?.userId;
        const amount = body?.amount;

        if (typeof userId !== "string" || !Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) {
            return NextResponse.json(
                { success: false, error: `Provide a userId and a whole-number amount from 1 to ${MAX_GRANT}.` },
                { status: 400 }
            );
        }

        const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });

        if (!target) {
            return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
        }

        await grantDetectionCredits(target.id, amount, dev.email);

        return NextResponse.json({ success: true, quota: await getDetectionQuota(target.id) });
    } catch (error) {
        console.error("❌ Failed to grant detection credits:", error);

        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
