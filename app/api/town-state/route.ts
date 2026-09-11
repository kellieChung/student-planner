import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const SELECT = {
    currency: true,
    libraryGrowth: true,
    workshopGrowth: true,
    trainingGroundsGrowth: true,
    watchtowerGrowth: true,
    townSquareGrowth: true,
    currentStreak: true,
    longestStreak: true,
    graceTokens: true,
    lastGoodDay: true,
    onboardingCompletedAt: true,
} as const;

export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found." },
                { status: 404 }
            );
        }

        const state = await prisma.townState.findUnique({
            where: { userId: user.id },
            select: SELECT,
        });

        return NextResponse.json({
            success: true,
            currency: state?.currency ?? 0,
            libraryGrowth: state?.libraryGrowth ?? 0,
            workshopGrowth: state?.workshopGrowth ?? 0,
            trainingGroundsGrowth: state?.trainingGroundsGrowth ?? 0,
            watchtowerGrowth: state?.watchtowerGrowth ?? 0,
            townSquareGrowth: state?.townSquareGrowth ?? 0,
            currentStreak: state?.currentStreak ?? 0,
            longestStreak: state?.longestStreak ?? 0,
            graceTokens: state?.graceTokens ?? 2,
            lastGoodDay: state?.lastGoodDay ?? null,
            onboardingCompletedAt: state?.onboardingCompletedAt?.toISOString() ?? null,
        });
    } catch (error) {
        console.error("❌ Failed to load town state:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

export async function PATCH(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                { success: false, error: "You must be logged in." },
                { status: 401 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { email: session.user.email },
        });

        if (!user) {
            return NextResponse.json(
                { success: false, error: "User not found." },
                { status: 404 }
            );
        }

        let body: unknown;

        try {
            body = await request.json();
        } catch {
            return NextResponse.json(
                { success: false, error: "Invalid JSON body." },
                { status: 400 }
            );
        }

        const input = body as Record<string, unknown>;

        const numericFields = [
            "currency",
            "libraryGrowth",
            "workshopGrowth",
            "trainingGroundsGrowth",
            "watchtowerGrowth",
            "townSquareGrowth",
            "currentStreak",
            "longestStreak",
            "graceTokens",
        ] as const;

        for (const field of numericFields) {
            if (!isFiniteNumber(input[field])) {
                return NextResponse.json(
                    { success: false, error: `'${field}' must be a number.` },
                    { status: 400 }
                );
            }
        }

        if (input.lastGoodDay !== null && typeof input.lastGoodDay !== "undefined" && typeof input.lastGoodDay !== "string") {
            return NextResponse.json(
                { success: false, error: "'lastGoodDay' must be a string or null." },
                { status: 400 }
            );
        }

        const data = {
            currency: input.currency as number,
            libraryGrowth: input.libraryGrowth as number,
            workshopGrowth: input.workshopGrowth as number,
            trainingGroundsGrowth: input.trainingGroundsGrowth as number,
            watchtowerGrowth: input.watchtowerGrowth as number,
            townSquareGrowth: input.townSquareGrowth as number,
            currentStreak: input.currentStreak as number,
            longestStreak: input.longestStreak as number,
            graceTokens: input.graceTokens as number,
            lastGoodDay: (input.lastGoodDay as string | null | undefined) ?? null,
            onboardingCompletedAt:
                typeof input.onboardingCompletedAt === "string"
                    ? new Date(input.onboardingCompletedAt)
                    : input.onboardingCompletedAt === null
                        ? null
                        : undefined,
        };

        const state = await prisma.townState.upsert({
            where: { userId: user.id },
            create: { userId: user.id, ...data },
            update: data,
            select: SELECT,
        });

        return NextResponse.json({
            success: true,
            ...state,
            onboardingCompletedAt: state.onboardingCompletedAt?.toISOString() ?? null,
        });
    } catch (error) {
        console.error("❌ Failed to save town state:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
