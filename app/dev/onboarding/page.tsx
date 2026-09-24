import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import PlannerHome from "@/components/PlannerHome";

export const metadata = {
    title: "Dev · Onboarding tour",
};

// Unlinked dev route (same precedent as the other /dev pages): the real
// planner with the onboarding tour opened immediately, replayable, and never
// writing the first-run flag — for fine-tuning the tour against real data.
export default async function OnboardingDevPage() {
    const session = await auth();

    if (!session?.user?.email) {
        redirect("/login");
    }

    const user = await prisma.user.findUnique({
        where: { email: session.user.email },
    });

    if (!user) {
        redirect("/login");
    }

    return <PlannerHome user={user} tourMode="preview" />;
}
