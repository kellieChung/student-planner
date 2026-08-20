import { randomBytes } from "crypto";
import { NextResponse } from "next/server";

const EXTENSION_ORIGIN =
    "chrome-extension://knlfelipiolfnoicdagnagoecdjdijil";

export async function GET() {
    const state = randomBytes(32).toString("hex");

    return NextResponse.json(
        {
            success: true,
            state,
        },
        {
            headers: {
                "Access-Control-Allow-Origin":
                    EXTENSION_ORIGIN,
            },
        }
    );
}

export async function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin":
                EXTENSION_ORIGIN,

            "Access-Control-Allow-Methods":
                "GET, OPTIONS",

            "Access-Control-Allow-Headers":
                "Content-Type",
        },
    });
}