import Skeleton from "@/components/ui/Skeleton";

type Props = {
    label: string;
};

// loading.tsx body for the small centered-card auth screens
// (/accept-terms, /extension-callback) while their session check runs.
export default function AuthCardSkeleton({ label }: Props) {
    return (
        <main aria-busy="true" className="auth-page min-h-screen flex items-center justify-center p-4">
            <span className="sr-only">{label}</span>
            <div className="theme-surface flex w-full max-w-sm flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-8">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="mt-3 h-3.5 w-full" />
                <Skeleton className="mt-2 h-3.5 w-3/4" />
                <Skeleton className="mt-6 h-10 w-full rounded-lg" />
            </div>
        </main>
    );
}
