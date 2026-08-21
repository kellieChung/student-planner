import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const EXTENSION_ORIGIN =
    "chrome-extension://knlfelipiolfnoicdagnagoecdjdijil";

export function middleware(request: NextRequest) {
    const origin = request.headers.get("origin");

    const isExtensionApi =
        request.nextUrl.pathname.startsWith(
            "/api/extension"
        ) ||
        request.nextUrl.pathname.startsWith(
            "/api/canvas"
        );

    if (
        origin !== EXTENSION_ORIGIN ||
        !isExtensionApi
    ) {
        return NextResponse.next();
    }

    if (request.method === "OPTIONS") {
        return new NextResponse(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin":
                    EXTENSION_ORIGIN,
                "Access-Control-Allow-Methods":
                    "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers":
                    "Content-Type, Authorization",
            },
        });
    }

    const response = NextResponse.next();

    response.headers.set(
        "Access-Control-Allow-Origin",
        EXTENSION_ORIGIN
    );

    response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, OPTIONS"
    );

    response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization"
    );

    return response;
}

export const config = {
    matcher: "/api/:path*",
};