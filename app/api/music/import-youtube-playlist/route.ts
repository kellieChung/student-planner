import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type YouTubePlaylistResponse = {
    items?: Array<{
        snippet?: {
            title?: string;
        };
    }>;
};

type YouTubePlaylistItemsResponse = {
    nextPageToken?: string;

    items?: Array<{
        snippet?: {
            title?: string;

            resourceId?: {
                videoId?: string;
            };

            thumbnails?: {
                high?: {
                    url?: string;
                };

                medium?: {
                    url?: string;
                };

                default?: {
                    url?: string;
                };
            };
        };
    }>;
};

function extractPlaylistId(
    input: string
): string | null {
    try {
        const url = new URL(input.trim());

        const hostname =
            url.hostname.toLowerCase();

        const validHostnames = [
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "youtu.be",
            "www.youtube-nocookie.com",
        ];

        if (!validHostnames.includes(hostname)) {
            return null;
        }

        return url.searchParams.get("list");
    } catch {
        return null;
    }
}

async function fetchYouTube<T>(
    url: string,
    apiKey: string
): Promise<T> {
    const response = await fetch(url, {
        headers: {
            "X-Goog-Api-Key": apiKey,
        },
        cache: "no-store",
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            data?.error?.message ||
                `YouTube API returned ${response.status}`
        );
    }

    return data as T;
}

export async function POST(request: Request) {
    try {
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
                { error: "User not found." },
                { status: 404 }
            );
        }

        const apiKey =
            process.env.YOUTUBE_DATA_API_KEY;

        if (!apiKey) {
            return NextResponse.json(
                {
                    error:
                        "YouTube API key is not configured.",
                },
                { status: 500 }
            );
        }

        const body = await request.json();

        const playlistId =
            typeof body.playlistId === "string"
                ? body.playlistId
                : "";

        const youtubePlaylistUrl =
            typeof body.youtubePlaylistUrl === "string"
                ? body.youtubePlaylistUrl.trim()
                : "";

        if (!playlistId) {
            return NextResponse.json(
                {
                    error:
                        "Student Planner playlist ID is required.",
                },
                { status: 400 }
            );
        }

        if (!youtubePlaylistUrl) {
            return NextResponse.json(
                {
                    error:
                        "YouTube playlist URL is required.",
                },
                { status: 400 }
            );
        }

        // Make sure the playlist belongs to this user.
        const playlist =
            await prisma.musicPlaylist.findFirst({
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

        const youtubePlaylistId =
            extractPlaylistId(youtubePlaylistUrl);

        if (!youtubePlaylistId) {
            return NextResponse.json(
                {
                    error:
                        "Invalid YouTube playlist URL.",
                },
                { status: 400 }
            );
        }

        // Verify the YouTube playlist exists.
        const playlistData =
            await fetchYouTube<YouTubePlaylistResponse>(
                `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${encodeURIComponent(
                    youtubePlaylistId
                )}`,
                apiKey
            );

        if (!playlistData.items?.length) {
            return NextResponse.json(
                {
                    error:
                        "YouTube playlist not found or unavailable.",
                },
                { status: 404 }
            );
        }

        const tracks: Array<{
            title: string;
            sourceUrl: string;
            thumbnail: string | null;
        }> = [];

        let pageToken: string | undefined;

        // YouTube returns up to 50 playlist items per request.
        // Keep requesting pages until there are no more.
        do {
            const params = new URLSearchParams({
                part: "snippet",
                playlistId: youtubePlaylistId,
                maxResults: "50",
            });

            if (pageToken) {
                params.set(
                    "pageToken",
                    pageToken
                );
            }

            const data =
                await fetchYouTube<YouTubePlaylistItemsResponse>(
                    `https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`,
                    apiKey
                );

            for (const item of data.items ?? []) {
                const videoId =
                    item.snippet?.resourceId?.videoId;

                // Deleted/private videos don't have a usable video ID.
                if (!videoId) {
                    continue;
                }

                const title =
                    item.snippet?.title?.trim() ||
                    "Untitled Track";

                const thumbnail =
                    item.snippet?.thumbnails?.high?.url ??
                    item.snippet?.thumbnails?.medium?.url ??
                    item.snippet?.thumbnails?.default?.url ??
                    null;

                tracks.push({
                    title,

                    sourceUrl:
                        `https://www.youtube.com/watch?v=${videoId}`,

                    thumbnail,
                });
            }

            pageToken =
                data.nextPageToken;
        } while (pageToken);

        if (tracks.length === 0) {
            return NextResponse.json(
                {
                    error:
                        "No playable videos were found in this YouTube playlist.",
                },
                { status: 400 }
            );
        }

        // Find where the existing tracks end.
        const existingTrackCount =
            await prisma.musicTrack.count({
                where: {
                    playlistId,
                },
            });

        // Append imported tracks.
        await prisma.musicTrack.createMany({
            data: tracks.map((track, index) => ({
                title: track.title,
                sourceUrl: track.sourceUrl,
                thumbnail: track.thumbnail,
                position:
                    existingTrackCount + index,
                playlistId,
            })),
        });

        // Return the updated Student Planner playlist.
        const updatedPlaylist =
            await prisma.musicPlaylist.findUnique({
                where: {
                    id: playlistId,
                },
                include: {
                    tracks: {
                        orderBy: {
                            position: "asc",
                        },
                    },
                },
            });

        return NextResponse.json({
            playlist: updatedPlaylist,
            importedCount: tracks.length,
        });
    } catch (error) {
        console.error(
            "YouTube playlist import failed:",
            error
        );

        return NextResponse.json(
            {
                error:
                    error instanceof Error
                        ? error.message
                        : "Failed to import YouTube playlist.",
            },
            { status: 500 }
        );
    }
}