import { requireDevUser } from "@/app/dev/requireDevUser";
import PlannerHome from "@/components/PlannerHome";

export const metadata = {
    title: "Dev · Onboarding tour",
};

// Launched from the dev dashboard (/dev): the real planner with the
// onboarding tour opened immediately, replayable, and never writing the
// first-run flag — for fine-tuning the tour against real data.
export default async function OnboardingDevPage() {
    const user = await requireDevUser();

    return <PlannerHome user={user} tourMode="preview" />;
}
