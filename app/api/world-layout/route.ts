import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isValidWorldLayoutData } from "@/lib/worldLayout";

export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
        }

        const user = await prisma.user.findUnique({ where: { email: session.user.email } });

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
        }

        const row = await prisma.worldLayout.findUnique({ where: { userId: user.id } });

        return NextResponse.json({ success: true, layout: row?.data ?? null });
    } catch (error) {
        console.error("❌ Failed to load world layout:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json({ success: false, error: "You must be logged in." }, { status: 401 });
        }

        const user = await prisma.user.findUnique({ where: { email: session.user.email } });

        if (!user) {
            return NextResponse.json({ success: false, error: "User not found." }, { status: 404 });
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
        }

        const layout = (body as { layout?: unknown } | null)?.layout;

        if (!isValidWorldLayoutData(layout)) {
            return NextResponse.json({ success: false, error: "'layout' failed validation." }, { status: 400 });
        }

        await prisma.worldLayout.upsert({
            where: { userId: user.id },
            create: { userId: user.id, data: layout },
            update: { data: layout },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("❌ Failed to save world layout:", error);
        return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
    }
}
