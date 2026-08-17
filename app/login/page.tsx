import {signIn, auth} from "@/auth";
import {redirect} from "next/navigation";


export default async function LoginPage() {
    const session = await auth();

    if (session?.user) {
        redirect("/");
    }
    return (
        <main className = "min-h-screen flex items-center justify-center">
            <div>
                <h1>Student Planner</h1>

                <form
                    action = {async () => {
                        "use server";
                        await signIn("google")
                    }}
                >
                    <button type = "submit">
                        Sign in with Google
                    </button>
                </form>
            </div>
        </main>
    )
}