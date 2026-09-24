import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasAcceptedCurrentTerms } from "@/lib/legal";
import AccountForms from "@/app/settings/account/AccountForms";

export const metadata = {
    title: "Account settings",
};

export default async function AccountSettingsPage() {
    const session = await auth();

    if (!session?.user?.email) {
        redirect("/login");
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
        include: { accounts: { select: { provider: true } } },
    });

    if (!user) {
        redirect("/login");
    }

    if (!hasAcceptedCurrentTerms(user)) {
        redirect(`/accept-terms?next=${encodeURIComponent("/settings/account")}`);
    }

    return (
        <main className="min-h-screen flex justify-center p-4">
            <div className="my-8 w-full max-w-lg">
                <Link href="/" className="text-xs font-semibold underline" style={{ color: "var(--muted)" }}>
                    ← Back to planner
                </Link>

                <h1 className="mt-3 text-2xl font-bold text-[var(--heading)]">Account settings</h1>

                <AccountForms
                    name={user.name}
                    email={user.email}
                    hasPassword={user.passwordHash !== null}
                    hasGoogle={user.accounts.some((account) => account.provider === "google")}
                />
            </div>
        </main>
    );
}
