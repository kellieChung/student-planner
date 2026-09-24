import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isDevAccountEmail } from "@/lib/devAccounts";

// Gate for every /dev page. Not-a-dev is a 404 rather than a redirect so the
// route doesn't advertise itself. (These pages used to be open to any
// logged-in user.)
export async function requireDevUser() {
    const session = await auth();

    if (!session?.user?.email) {
        redirect("/login");
    }

    if (!isDevAccountEmail(session.user.email)) {
        notFound();
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
    });

    if (!user) {
        redirect("/login");
    }

    return user;
}
