import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hasAcceptedCurrentTerms, safeRedirectPath } from "@/lib/legal";
import AcceptTermsForm from "@/app/accept-terms/AcceptTermsForm";

export const metadata = {
    title: "Review our terms",
};

export default async function AcceptTermsPage({
    searchParams,
}: {
    searchParams: Promise<{
        next?: string;
    }>;
}) {
    const session = await auth();

    if (!session?.user?.email) {
        redirect("/login");
    }

    const user = await prisma.user.findUnique({ where: { email: session.user.email } });

    if (!user) {
        redirect("/login");
    }

    const next = safeRedirectPath((await searchParams).next);

    if (hasAcceptedCurrentTerms(user)) {
        redirect(next);
    }

    return (
        <main className="min-h-screen flex items-center justify-center p-4">
            <div className="theme-surface w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8 text-center">
                <h1 className="text-2xl font-bold text-[var(--heading)]">Before you continue</h1>
                <p className="mt-1 text-sm text-[var(--muted)]">
                    Please review and accept our Terms of Service and Privacy Policy to use Lodestar.
                </p>

                <AcceptTermsForm next={next} />
            </div>
        </main>
    );
}
