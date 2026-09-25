import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = {
    params: Promise<{
        playlistId: string;
    }>;
};

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
    _request: Request,
    { params }: Params
) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { playlistId } = await params;

        const playlist = await prisma.musicPlaylist.findFirst({
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
                { error: "Playlist not found." },
                { status: 404 }
            );
        }

        return NextResponse.json(playlist);
    } catch (error) {
        console.error("GET /api/music/[playlistId] failed:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

export async function PATCH(
    request: Request,
    { params }: Params
) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { playlistId } = await params;

        const existingPlaylist =
            await prisma.musicPlaylist.findFirst({
                where: {
                    id: playlistId,
                    userId: user.id,
                },
            });

        if (!existingPlaylist) {
            return NextResponse.json(
                { error: "Playlist not found." },
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
                { error: "Playlist name is required." },
                { status: 400 }
            );
        }

        const playlist = await prisma.musicPlaylist.update({
            where: {
                id: playlistId,
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

        return NextResponse.json(playlist);
    } catch (error) {
        console.error("PATCH /api/music/[playlistId] failed:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}

export async function DELETE(
    _request: Request,
    { params }: Params
) {
    try {
        const user = await getAuthenticatedUser();

        if (!user) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const { playlistId } = await params;

        const playlist = await prisma.musicPlaylist.findFirst({
            where: {
                id: playlistId,
                userId: user.id,
            },
        });

        if (!playlist) {
            return NextResponse.json(
                { error: "Playlist not found." },
                { status: 404 }
            );
        }

        await prisma.musicPlaylist.delete({
            where: {
                id: playlistId,
            },
        });

        return NextResponse.json({
            success: true,
        });
    } catch (error) {
        console.error("DELETE /api/music/[playlistId] failed:", error);
        return NextResponse.json(
            { success: false, error: "Something went wrong." },
            { status: 500 }
        );
    }
}