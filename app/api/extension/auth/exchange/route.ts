import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

const EXTENSION_ORIGIN =
    "chrome-extension://knlfelipiolfnoicdagnagoecdjdijil";

function corsHeaders() {
    return {
        "Access-Control-Allow-Origin":
            EXTENSION_ORIGIN,
        "Access-Control-Allow-Methods":
            "POST, OPTIONS",
        "Access-Control-Allow-Headers":
            "Content-Type",
    };
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: corsHeaders(),
    });
}

export async function POST(request: Request) {

    try {

        const { state } =
            await request.json();

        if (!state) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing state",
                },
                {
                    status: 400,
                    headers: corsHeaders(),
                }
            );
        }

        const extensionSession =
            await prisma.extensionSession.findUnique({
                where: {
                    state,
                },
            });

        if (!extensionSession) {
            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Authentication not completed",
                },
                {
                    status: 404,
                    headers: corsHeaders(),
                }
            );
        }

        if (
            extensionSession.expiresAt <
            new Date()
        ) {

            await prisma.extensionSession.delete({
                where: {
                    id: extensionSession.id,
                },
            });

            return NextResponse.json(
                {
                    success: false,
                    error:
                        "Authentication expired",
                },
                {
                    status: 401,
                    headers: corsHeaders(),
                }
            );
        }

        return NextResponse.json(
            {
                success: true,
                token:
                    extensionSession.token,
            },
            {
                headers: corsHeaders(),
            }
        );

    } catch (error) {

        console.error(
            "Extension auth exchange failed:",
            error
        );

        return NextResponse.json(
            {
                success: false,
                error:
                    "Internal server error",
            },
            {
                status: 500,
                headers: corsHeaders(),
            }
        );
    }
}