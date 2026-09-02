import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

async function getAuthenticatedUser() {
    const session = await auth();

    if (!session?.user?.email) {
        return null;
    }

    return prisma.user.findUnique({
        where: {
            email: session.user.email,
        },
    });
}

export async function GET() {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const playlists = await prisma.musicPlaylist.findMany({
        where: {
            userId: user.id,
        },
        include: {
            tracks: {
                orderBy: {
                    position: "asc",
                },
            },
        },
        orderBy: {
            createdAt: "asc",
        },
    });

    return NextResponse.json(playlists);
}

export async function POST(request: Request) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const body = await request.json();

    const name =
        typeof body.name === "string"
            ? body.name.trim()
            : "";

    if (!name) {
        return NextResponse.json(
            { error: "Playlist name is required." },
            { status: 400 }
        );
    }

    const playlist = await prisma.musicPlaylist.create({
        data: {
            name,
            sourceUrl:
                typeof body.sourceUrl === "string"
                    ? body.sourceUrl.trim()
                    : null,
            userId: user.id,
        },
        include: {
            tracks: true,
        },
    });

    return NextResponse.json(playlist);
}