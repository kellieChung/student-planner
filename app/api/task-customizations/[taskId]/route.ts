import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDateKey } from "@/lib/utils";

type Params = {
    params: Promise<{
        taskId: string;
    }>;
};

const MAX_NOTES_LENGTH = 10_000;
const LABEL_TYPES = new Set(["HW", "R", "EXAM", "TODO"]);

export async function PATCH(request: Request, { params }: Params) {
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

        const { taskId } = await params;

        if (!taskId) {
            return NextResponse.json(
                { success: false, error: "'taskId' is required." },
                { status: 400 }
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

        const {
            startAt = null,
            course = null,
            nameOverride = null,
            typeOverride = null,
            dueAtOverride = null,
            notes = null,
            completed = false,
            completedAt = null,
            inProgress = false,
            deleted = false,
        } = body as {
            startAt?: unknown;
            course?: unknown;
            nameOverride?: unknown;
            typeOverride?: unknown;
            dueAtOverride?: unknown;
            notes?: unknown;
            completed?: unknown;
            completedAt?: unknown;
            inProgress?: unknown;
            deleted?: unknown;
        } | null ?? {};

        if (startAt !== null && !isDateKey(startAt)) {
            return NextResponse.json(
                { success: false, error: "'startAt' must be null or a 'YYYY-MM-DD' string." },
                { status: 400 }
            );
        }

        if (course !== null && typeof course !== "string") {
            return NextResponse.json(
                { success: false, error: "'course' must be null or a string." },
                { status: 400 }
            );
        }

        if (nameOverride !== null && typeof nameOverride !== "string") {
            return NextResponse.json(
                { success: false, error: "'nameOverride' must be null or a string." },
                { status: 400 }
            );
        }

        if (typeOverride !== null && (typeof typeOverride !== "string" || !LABEL_TYPES.has(typeOverride))) {
            return NextResponse.json(
                { success: false, error: "'typeOverride' must be null or one of 'HW', 'R', 'EXAM', 'TODO'." },
                { status: 400 }
            );
        }

        const dueAtOverrideDate = dueAtOverride === null
            ? null
            : typeof dueAtOverride === "string" && !Number.isNaN(new Date(dueAtOverride).getTime())
                ? new Date(dueAtOverride)
                : undefined;

        if (dueAtOverrideDate === undefined) {
            return NextResponse.json(
                { success: false, error: "'dueAtOverride' must be null or a valid ISO datetime string." },
                { status: 400 }
            );
        }

        if (notes !== null && typeof notes !== "string") {
            return NextResponse.json(
                { success: false, error: "'notes' must be null or a string." },
                { status: 400 }
            );
        }

        if (typeof completed !== "boolean") {
            return NextResponse.json(
                { success: false, error: "'completed' must be a boolean." },
                { status: 400 }
            );
        }

        if (typeof deleted !== "boolean") {
            return NextResponse.json(
                { success: false, error: "'deleted' must be a boolean." },
                { status: 400 }
            );
        }

        if (typeof inProgress !== "boolean") {
            return NextResponse.json(
                { success: false, error: "'inProgress' must be a boolean." },
                { status: 400 }
            );
        }

        // A calendar day, stored at UTC midnight like startAt so it reads
        // back as the same "YYYY-MM-DD". A full timestamp (only ever sent by
        // the legacy localStorage migration) keeps just its date part.
        const completedAtKey = typeof completedAt === "string" ? completedAt.slice(0, 10) : null;

        if (completedAt !== null && !isDateKey(completedAtKey)) {
            return NextResponse.json(
                { success: false, error: "'completedAt' must be null or a 'YYYY-MM-DD' date." },
                { status: 400 }
            );
        }

        const completedAtDate = completedAtKey ? new Date(`${completedAtKey}T00:00:00.000Z`) : null;

        if (typeof notes === "string" && notes.length > MAX_NOTES_LENGTH) {
            return NextResponse.json(
                { success: false, error: `'notes' must be at most ${MAX_NOTES_LENGTH} characters.` },
                { status: 400 }
            );
        }

        const startAtDate = startAt ? new Date(`${startAt}T00:00:00.000Z`) : null;

        const data = {
            startAt: startAtDate,
            course,
            nameOverride,
            typeOverride,
            dueAtOverride: dueAtOverrideDate,
            notes,
            completed,
            completedAt: completedAtDate,
            inProgress,
            deleted,
        };

        const customization = await prisma.taskCustomization.upsert({
            where: { userId_taskId: { userId: user.id, taskId } },
            update: data,
            create: { userId: user.id, taskId, ...data },
            select: {
                taskId: true,
                startAt: true,
                course: true,
                nameOverride: true,
                typeOverride: true,
                dueAtOverride: true,
                notes: true,
                completed: true,
                completedAt: true,
                inProgress: true,
                deleted: true,
            },
        });

        return NextResponse.json({
            success: true,
            customization: {
                taskId: customization.taskId,
                startAt: customization.startAt
                    ? customization.startAt.toISOString().slice(0, 10)
                    : null,
                course: customization.course,
                nameOverride: customization.nameOverride,
                typeOverride: customization.typeOverride,
                dueAtOverride: customization.dueAtOverride
                    ? customization.dueAtOverride.toISOString()
                    : null,
                notes: customization.notes,
                completed: customization.completed,
                // Date-only, matching startAt above — see the GET route's
                // matching comment for why (parseLocalDate/calculateGridSpan).
                completedAt: customization.completedAt
                    ? customization.completedAt.toISOString().slice(0, 10)
                    : null,
                inProgress: customization.inProgress,
                deleted: customization.deleted,
            },
        });
    } catch (error) {
        console.error("❌ Failed to save task customization:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}
