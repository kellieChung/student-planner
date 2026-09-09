type SpinnerProps = {
    className?: string;
};

// Indeterminate loading indicator for waits of unknown duration (most
// async actions in this app) — uses currentColor so it inherits whatever
// text color the surrounding button/panel already has.
export default function Spinner({ className = "h-4 w-4" }: SpinnerProps) {
    return (
        <svg
            className={`animate-spin ${className}`}
            viewBox="0 0 24 24"
            fill="none"
            role="status"
            aria-label="Loading"
        >
            <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
            />
            <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
        </svg>
    );
}
