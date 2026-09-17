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
    kingdomStage: true,
    onboardingCompletedAt: true,
} as const;

const KINGDOM_STAGES = ["village", "town", "city", "kingdom"] as const;

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
            kingdomStage: state?.kingdomStage ?? "village",
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

        // Every field is optional on a PATCH here, not just onboardingCompletedAt
        // — a key that's simply absent from the body means "leave this field
        // alone," matching the client helpers below (saveTownGrowth omits
        // onboardingCompletedAt, a dedicated onboarding-only save omits every
        // growth/currency field) so two independent writers can never clobber
        // each other's fields with a stale value from a full-row send.
        const numericFields = [
            "currency",
            "libraryGrowth",
            "workshopGrowth",
            "trainingGroundsGrowth",
            "watchtowerGrowth",
            "townSquareGrowth",
        ] as const;

        const data: {
            currency?: number;
            libraryGrowth?: number;
            workshopGrowth?: number;
            trainingGroundsGrowth?: number;
            watchtowerGrowth?: number;
            townSquareGrowth?: number;
            kingdomStage?: string;
            onboardingCompletedAt?: Date | null;
        } = {};

        for (const field of numericFields) {
            if (field in input) {
                if (!isFiniteNumber(input[field])) {
                    return NextResponse.json(
                        { success: false, error: `'${field}' must be a number.` },
                        { status: 400 }
                    );
                }
                data[field] = input[field] as number;
            }
        }

        if ("kingdomStage" in input) {
            if (!KINGDOM_STAGES.includes(input.kingdomStage as typeof KINGDOM_STAGES[number])) {
                return NextResponse.json(
                    { success: false, error: "'kingdomStage' must be one of village/town/city/kingdom." },
                    { status: 400 }
                );
            }
            data.kingdomStage = input.kingdomStage as string;
        }

        if ("onboardingCompletedAt" in input) {
            if (typeof input.onboardingCompletedAt === "string") {
                data.onboardingCompletedAt = new Date(input.onboardingCompletedAt);
            } else if (input.onboardingCompletedAt === null) {
                data.onboardingCompletedAt = null;
            } else {
                return NextResponse.json(
                    { success: false, error: "'onboardingCompletedAt' must be a string or null." },
                    { status: 400 }
                );
            }
        }

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
