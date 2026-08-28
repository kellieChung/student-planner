import { getAllAssignments } from "@/lib/canvas";
import WeeklyPlannerView from "@/components/WeeklyPlannerView";
import { Assignment } from "@/types/assignment";
import SignInButton from "@/components/SignInButton";
import {auth} from "@/auth"
import UserMenu from "@/components/UserMenu";
import {redirect} from "next/navigation";
import AnalyzeAnnouncementsButton from "@/components/AnalyzeAnnouncementsButton";
import AIReviewPanel from "@/components/AIReviewPanel";


export default async function TestPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    const assignments: Assignment[] = (await getAllAssignments()).map((assignment) => ({
        ...assignment,
        due: assignment.due ?? "",
    }));

    const today = new Date();
    const dayOfWeek = today.getDay();
    const distanceToMonday = (dayOfWeek + 6) % 7; 
    const monday = new Date(today);
    monday.setDate(today.getDate() - distanceToMonday);

    return (
        <main className="min-h-screen p-8">
            <div className="app-header w-full px-4 mx-auto">
                <SignInButton />
                <UserMenu
                    name = {session?.user?.name}
                    email = {session?.user?.email}
                />
                <p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-[var(--muted)] opacity-70">
                    Your quest log
                </p>
                <h1 className="mb-2 text-4xl font-bold tracking-tight">ATLAS Planner</h1>
                <p className="mb-8 text-[var(--muted)]">Weekly calendar overview</p>

                <AnalyzeAnnouncementsButton />
                <WeeklyPlannerView assignments={assignments} weekStartDate={monday} />
                <AIReviewPanel />
            </div>
        </main>
    );
}
