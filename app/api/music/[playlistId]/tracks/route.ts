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

export async function POST(
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

    const title =
        typeof body.title === "string"
            ? body.title.trim()
            : "";

    const sourceUrl =
        typeof body.sourceUrl === "string"
            ? body.sourceUrl.trim()
            : "";

    if (!title || !sourceUrl) {
        return NextResponse.json(
            {
                error:
                    "Title and sourceUrl are required",
            },
            { status: 400 }
        );
    }

    const trackCount =
        await prisma.musicTrack.count({
            where: {
                playlistId,
            },
        });

    const track =
        await prisma.musicTrack.create({
            data: {
                title,
                sourceUrl,
                thumbnail:
                    typeof body.thumbnail === "string"
                        ? body.thumbnail
                        : null,
                position: trackCount,
                playlistId,
            },
        });

    return NextResponse.json(track);
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

    const body = await request.json();

    const trackId =
        typeof body.trackId === "string"
            ? body.trackId
            : "";

    if (!trackId) {
        return NextResponse.json(
            { error: "trackId is required" },
            { status: 400 }
        );
    }

    const track =
        await prisma.musicTrack.findFirst({
            where: {
                id: trackId,
                playlistId: playlist.id,
            },
        });

    if (!track) {
        return NextResponse.json(
            { error: "Track not found" },
            { status: 404 }
        );
    }

    await prisma.musicTrack.delete({
        where: {
            id: track.id,
        },
    });

    const remainingTracks =
        await prisma.musicTrack.findMany({
            where: {
                playlistId: playlist.id,
            },
            orderBy: {
                position: "asc",
            },
        });

    await prisma.$transaction(
        remainingTracks.map((track, index) =>
            prisma.musicTrack.update({
                where: {
                    id: track.id,
                },
                data: {
                    position: index,
                },
            })
        )
    );

    return NextResponse.json({
        success: true,
    });
}