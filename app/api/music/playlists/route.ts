import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
    const session = await auth();

    if (!session?.user?.email) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const user = await prisma.user.findUnique({
        where: {
            email: session.user.email,
        },
    });

    if (!user) {
        return NextResponse.json(
            { error: "User not found" },
            { status: 404 }
        );
    }

    const playlists =
        await prisma.musicPlaylist.findMany({
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

export async function POST(
    request: Request
) {
    const session = await auth();

    if (!session?.user?.email) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const user = await prisma.user.findUnique({
        where: {
            email: session.user.email,
        },
    });

    if (!user) {
        return NextResponse.json(
            { error: "User not found" },
            { status: 404 }
        );
    }

    const body = await request.json();

    const name =
        typeof body.name === "string"
            ? body.name.trim()
            : "";

    if (!name) {
        return NextResponse.json(
            { error: "Playlist name is required" },
            { status: 400 }
        );
    }

    const playlist =
        await prisma.musicPlaylist.create({
            data: {
                name,
                sourceUrl:
                    typeof body.sourceUrl === "string"
                        ? body.sourceUrl
                        : null,
                userId: user.id,
            },
            include: {
                tracks: true,
            },
        });

    return NextResponse.json(playlist);
}