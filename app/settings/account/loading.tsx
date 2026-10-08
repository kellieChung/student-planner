import Skeleton from "@/components/ui/Skeleton";

export default function AccountSettingsLoading() {
    return (
        <main aria-busy="true" className="min-h-screen flex justify-center p-4">
            <span className="sr-only">Loading account settings…</span>
            <div className="my-8 w-full max-w-lg">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="mt-4 h-7 w-56" />
                <div className="mt-6 space-y-4">
                    {[0, 1, 2].map((card) => (
                        <div key={card} className="theme-surface rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-6">
                            <Skeleton className="h-5 w-32" />
                            <Skeleton className="mt-4 h-3 w-16" />
                            <Skeleton className="mt-2 h-10 w-full rounded-lg" />
                            <Skeleton className="mt-4 h-9 w-28 rounded-lg" />
                        </div>
                    ))}
                </div>
            </div>
        </main>
    );
}
