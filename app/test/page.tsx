import { prisma } from "@/lib/prisma";

export default async function TestDatabase() {
    const user = await prisma.user.create({
        data: {
            email: "test2@example.com",
            name: "Test Student",
        },
    });

    return (
        <main>
            <h1>Database Test</h1>

            <pre>
                {JSON.stringify(user, null, 2)}
            </pre>
        </main>
    );
}