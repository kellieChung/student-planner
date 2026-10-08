import PlannerGridSkeleton from "@/components/PlannerGridSkeleton";
import PolarisSkeleton from "@/components/PolarisSkeleton";
import Skeleton from "@/components/ui/Skeleton";

// Streamed by app/page.tsx while PlannerHome's server reads run. Mirrors
// LaptopFrame + WeeklyPlannerView's layout, and its grid area is the same
// PlannerGridSkeleton the client shows while its own fetches settle, so the
// two loading stages read as one.
export default function PlannerHomeSkeleton() {
    return (
        <main aria-busy="true" className="h-dvh w-full overflow-hidden">
            <span className="sr-only">Loading your planner…</span>
            <div className="relative h-full w-full overflow-hidden" style={{ background: "var(--app-background)" }}>
                <div className="absolute inset-0 overflow-y-auto">
                    <Skeleton className="absolute right-4 top-4 z-20 h-[30px] w-[104px] rounded-full" />
                    <div className="app-header mx-auto flex min-h-full w-full flex-col px-4">
                        <div className="theme-surface planner-shell w-full flex-1 bg-slate-950 text-white p-6 rounded-2xl border border-slate-800">
                            <h1 className="mb-4 pr-28 text-3xl">Ship&apos;s Log</h1>

                            <PolarisSkeleton />

                            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                <Skeleton className="h-[42px] w-44 rounded-lg" />
                                <Skeleton className="h-[38px] w-96 max-w-full rounded-lg" />
                            </div>

                            <div className="grid grid-cols-7 gap-2 border-b border-slate-800 pb-4 mb-4">
                                {Array.from({ length: 7 }).map((_, index) => (
                                    <div key={index} className="flex flex-col items-center gap-1.5">
                                        <Skeleton className="h-3 w-8" />
                                        <Skeleton className="mt-1 h-5 w-6" />
                                        <Skeleton className="h-5 w-5 rounded-full" />
                                    </div>
                                ))}
                            </div>

                            <div className="relative min-h-[400px]">
                                <div className="absolute inset-0 grid grid-cols-7 gap-2 pointer-events-none">
                                    {Array.from({ length: 7 }).map((_, index) => (
                                        <div key={index} className="border-r border-slate-800/80 h-full rounded-lg bg-slate-900/30" />
                                    ))}
                                </div>
                                <PlannerGridSkeleton />
                            </div>
                        </div>

                        <div
                            className="sticky bottom-0 z-30 -mx-4 flex items-center gap-3 border-t px-3 py-2 shadow-2xl"
                            style={{ borderColor: "var(--border)", background: "var(--panel-raised)" }}
                        >
                            <Skeleton className="h-7 w-28" />
                            <Skeleton className="h-7 w-40" />
                            <Skeleton className="ml-auto h-6 w-56 rounded-full" />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}
