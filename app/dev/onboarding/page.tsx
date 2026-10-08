import { requireDevUser } from "@/app/dev/requireDevUser";
import { Suspense } from "react";
import PlannerHome from "@/components/PlannerHome";
import PlannerHomeSkeleton from "@/components/PlannerHomeSkeleton";

export const metadata = {
    title: "Dev · Onboarding tour",
};

// Launched from the dev dashboard (/dev): the real planner with the
// onboarding tour opened immediately, replayable, and never writing the
// first-run flag — for fine-tuning the tour against real data.
export default async function OnboardingDevPage() {
    const user = await requireDevUser();

    return (
        <Suspense fallback={<PlannerHomeSkeleton />}>
            <PlannerHome user={user} tourMode="preview" />
        </Suspense>
    );
}
