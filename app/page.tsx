import {auth} from "@/auth"
import {redirect} from "next/navigation";
import {prisma} from "@/lib/prisma";
import { hasAcceptedCurrentTerms } from "@/lib/legal";
import LandingPage from "@/components/landing/LandingPage";
import PlannerHome from "@/components/PlannerHome";


export default async function TestPage() {
    const session = await auth();

    if (!session?.user?.email) {
        return <LandingPage />;
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
    });

    // A JWT can outlive a deleted account; treat that visitor as logged out.
    if (!user) {
        return <LandingPage />;
    }

    if (!hasAcceptedCurrentTerms(user)) {
        redirect("/accept-terms");
    }

    return <PlannerHome user={user} />;
}
