import Skeleton from "@/components/ui/Skeleton";
import { CARD_GAP_PX, CARD_HEIGHT_PX } from "@/lib/utils";

// Cards per weekday column: an uneven week so it reads as "tasks are coming",
// not as an empty grid.
const CARDS_PER_DAY = [1, 2, 1, 3, 2, 1, 0];

// Stands in for the weekly grid's card layer until the planner's first load
// settles. Shared by the server fallback (PlannerHomeSkeleton) and
// WeeklyPlannerView so the hand-off between them doesn't shift.
export default function PlannerGridSkeleton() {
    return (
        <div aria-busy="true" className="relative z-10 grid grid-cols-7 gap-2 px-1 py-2">
            <span className="sr-only">Loading your tasks…</span>
            {CARDS_PER_DAY.map((count, day) => (
                <div key={day} className="flex flex-col" style={{ gap: CARD_GAP_PX }}>
                    {Array.from({ length: count }).map((_, index) => (
                        <Skeleton
                            key={index}
                            className="w-full"
                            style={{ height: CARD_HEIGHT_PX.active }}
                        />
                    ))}
                </div>
            ))}
        </div>
    );
}
