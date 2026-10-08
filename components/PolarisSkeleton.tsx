import Skeleton from "@/components/ui/Skeleton";

// Holds Polaris's place while the planner's first load settles, so the
// grid below doesn't jump down when the real card arrives.
export default function PolarisSkeleton() {
    return (
        <div aria-hidden="true" className="mb-5 rounded-xl border border-[var(--border)] p-4">
            <Skeleton className="h-3 w-48" />
            <Skeleton className="mt-3 h-5 w-2/3" />
            <Skeleton className="mt-2 h-3.5 w-1/3" />
            <Skeleton className="mt-3 h-3.5 w-1/2" />
        </div>
    );
}
