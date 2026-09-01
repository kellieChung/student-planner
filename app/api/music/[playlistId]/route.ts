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

export async function GET(
    request: Request,
    context: {
        params: Promise<{
            playlistId: string;
        }>;
    }
) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { playlistId } = await context.params;

    const playlist =
        await prisma.musicPlaylist.findFirst({
            where: {
                id: playlistId,
                userId: user.id,
            },
            include: {
                tracks: {
                    orderBy: {
                        position: "asc",
                    },
                },
            },
        });

    if (!playlist) {
        return NextResponse.json(
            { error: "Playlist not found" },
            { status: 404 }
        );
    }

    return NextResponse.json(playlist);
}

export async function PATCH(
    request: Request,
    context: {
        params: Promise<{
            playlistId: string;
        }>;
    }
) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { playlistId } = await context.params;

    const playlist =
        await prisma.musicPlaylist.findFirst({
            where: {
                id: playlistId,
                userId: user.id,
            },
        });

    if (!playlist) {
        return NextResponse.json(
            { error: "Playlist not found" },
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

    const updatedPlaylist =
        await prisma.musicPlaylist.update({
            where: {
                id: playlist.id,
            },
            data: {
                name,
            },
            include: {
                tracks: {
                    orderBy: {
                        position: "asc",
                    },
                },
            },
        });

    return NextResponse.json(updatedPlaylist);
}

export async function DELETE(
    request: Request,
    context: {
        params: Promise<{
            playlistId: string;
        }>;
    }
) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { playlistId } = await context.params;

    const playlist =
        await prisma.musicPlaylist.findFirst({
            where: {
                id: playlistId,
                userId: user.id,
            },
        });

    if (!playlist) {
        return NextResponse.json(
            { error: "Playlist not found" },
            { status: 404 }
        );
    }

    await prisma.musicPlaylist.delete({
        where: {
            id: playlist.id,
        },
    });

    return NextResponse.json({
        success: true,
    });
}