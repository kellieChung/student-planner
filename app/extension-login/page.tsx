import { signIn } from "@/auth";

export default async function ExtensionLoginPage({
    searchParams,
}: {
    searchParams: Promise<{
        state?: string;
    }>;
}) {
    const params = await searchParams;
    const state = params.state;

    return (
        <main className="min-h-screen flex items-center justify-center">
            <div>
                <h1>Student Planner</h1>

                <form
                    action={async () => {
                        "use server";

                        await signIn("google", {
                            redirectTo:
                                `/extension-callback?state=${encodeURIComponent(
                                    state ?? ""
                                )}`,
                        });
                    }}
                >
                    <button type="submit">
                        Sign in with Google
                    </button>
                </form>
            </div>
        </main>
    );
}