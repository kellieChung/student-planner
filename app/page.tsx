import {auth} from "@/auth"
import {redirect} from "next/navigation";
import { Suspense } from "react";
import {prisma} from "@/lib/prisma";
import { hasAcceptedCurrentTerms } from "@/lib/legal";
import LandingPage from "@/components/landing/LandingPage";
import PlannerHome from "@/components/PlannerHome";
import PlannerHomeSkeleton from "@/components/PlannerHomeSkeleton";
import { countQueries } from "@/lib/queryCount";


export default countQueries("page /", async function TestPage() {
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

    // Auth, the account check and the terms redirect stay above the
    // boundary (logged-out visitors never see a planner skeleton); the
    // planner's own reads stream in behind it.
    return (
        <Suspense fallback={<PlannerHomeSkeleton />}>
            <PlannerHome user={user} />
        </Suspense>
    );
});
