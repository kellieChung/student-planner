import Link from "next/link";

type Props = {
    prefix: string;
};

export default function LegalLinks({ prefix }: Props) {
    return (
        <p className="mt-3 text-xs text-[var(--muted)]">
            {prefix}{" "}
            <Link href="/terms" className="underline" style={{ color: "var(--accent)" }}>
                Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline" style={{ color: "var(--accent)" }}>
                Privacy Policy
            </Link>
            .
        </p>
    );
}
