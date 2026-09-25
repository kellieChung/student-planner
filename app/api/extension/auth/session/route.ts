import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashExtensionToken, readBearerToken } from "@/lib/extensionAuth";

// Called by the extension's Sign out: revokes the token it holds.
export async function DELETE(request: Request) {
    try {
        const token = readBearerToken(request);

        if (!token) {
            return NextResponse.json({ success: false, error: "Missing token." }, { status: 401 });
        }

        await prisma.extensionSession.deleteMany({
            where: { token: hashExtensionToken(token) },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Failed to revoke extension session:", error);

        return NextResponse.json({ success: false, error: "Failed to sign out." }, { status: 500 });
    }
}
