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

async function getUserPlaylist(
    playlistId: string,
    userId: string
) {
    return prisma.musicPlaylist.findFirst({
        where: {
            id: playlistId,
            userId,
        },
    });
}

export async function POST(
    request: Request,
    { params }: Params
) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { playlistId } = await params;

    const playlist = await getUserPlaylist(
        playlistId,
        user.id
    );

    if (!playlist) {
        return NextResponse.json(
            { error: "Playlist not found." },
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
                    "Track title and YouTube URL are required.",
            },
            { status: 400 }
        );
    }

    const trackCount = await prisma.musicTrack.count({
        where: {
            playlistId,
        },
    });

    const track = await prisma.musicTrack.create({
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

export async function PATCH(
    request: Request,
    { params }: Params
) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { playlistId } = await params;

    const playlist = await getUserPlaylist(
        playlistId,
        user.id
    );

    if (!playlist) {
        return NextResponse.json(
            { error: "Playlist not found." },
            { status: 404 }
        );
    }

    const body = await request.json();

    const trackId =
        typeof body.trackId === "string"
            ? body.trackId
            : "";

    const title =
        typeof body.title === "string"
            ? body.title.trim()
            : "";

    if (!trackId || !title) {
        return NextResponse.json(
            { error: "Track ID and title are required." },
            { status: 400 }
        );
    }

    const track = await prisma.musicTrack.findFirst({
        where: {
            id: trackId,
            playlistId,
        },
    });

    if (!track) {
        return NextResponse.json(
            { error: "Track not found." },
            { status: 404 }
        );
    }

    const updatedTrack = await prisma.musicTrack.update({
        where: {
            id: trackId,
        },
        data: {
            title,
        },
    });

    return NextResponse.json(updatedTrack);
}

export async function DELETE(
    request: Request,
    { params }: Params
) {
    const user = await getAuthenticatedUser();

    if (!user) {
        return NextResponse.json(
            { error: "Unauthorized" },
            { status: 401 }
        );
    }

    const { playlistId } = await params;

    const playlist = await getUserPlaylist(
        playlistId,
        user.id
    );

    if (!playlist) {
        return NextResponse.json(
            { error: "Playlist not found." },
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
            { error: "Track ID is required." },
            { status: 400 }
        );
    }

    const track = await prisma.musicTrack.findFirst({
        where: {
            id: trackId,
            playlistId,
        },
    });

    if (!track) {
        return NextResponse.json(
            { error: "Track not found." },
            { status: 404 }
        );
    }

    await prisma.musicTrack.delete({
        where: {
            id: trackId,
        },
    });

    const remainingTracks =
        await prisma.musicTrack.findMany({
            where: {
                playlistId,
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