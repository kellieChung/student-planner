import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { analyzeAnnouncement } from "@/lib/ai/analyzeAnnouncement";
import { Announcement } from "@/types/announcement";

export async function POST() {
    try {
        const session = await auth();

        if (!session?.user?.email) {
            return NextResponse.json(
                {
                    success: false,
                    error: "You must be logged in.",
                },
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
                {
                    success: false,
                    error: "User not found.",
                },
                { status: 404 }
            );
        }

        const courses = await prisma.canvasCourse.findMany({
            where: {
                userId: user.id,
            },
            include: {
                announcements: true,
            },
        });

        const announcements: Announcement[] = courses.flatMap(
            (course) =>
                course.announcements.map((announcement) => ({
                    id: announcement.id,
                    title: announcement.title,
                    message: announcement.message ?? "",
                    course: course.name,
                    postedAt:
                        announcement.postedAt?.toISOString() ?? "",
                }))
        );

        const results = [];

        for (const announcement of announcements) {
            try {
                const proposedTasks =
                    await analyzeAnnouncement(announcement);

                results.push({
                    announcement: {
                        id: announcement.id,
                        title: announcement.title,
                        course: announcement.course,
                    },
                    tasks: proposedTasks,
                });
            } catch (error) {
                console.error(
                    `❌ Failed to analyze announcement ${announcement.id}:`,
                    error
                );

                results.push({
                    announcement: {
                        id: announcement.id,
                        title: announcement.title,
                        course: announcement.course,
                    },
                    tasks: [],
                    error: "Failed to analyze announcement.",
                });
            }
        }

        return NextResponse.json({
            success: true,
            announcementCount: announcements.length,
            results,
        });
    } catch (error) {
        console.error(
            "❌ Announcement analysis failed:",
            error
        );

        return NextResponse.json(
            {
                success: false,
                error: "Failed to analyze announcements.",
            },
            { status: 500 }
        );
    }
}