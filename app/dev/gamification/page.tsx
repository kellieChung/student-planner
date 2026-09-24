import { redirect } from "next/navigation";

// Folded into the dev dashboard; kept so old links still land somewhere.
export default function GamificationDevPage() {
    redirect("/dev?tab=gamification");
}
