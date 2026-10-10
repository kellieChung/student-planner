import { useId } from "react";

// Three task bars form the L; the star is carved into them with a real gap
// (a mask), so the mark works on any background. Same geometry as
// public/brand/lodestar-mark.svg.
export const STAR_PATH =
    "M39.08 29.17 Q44.58 32.90 49.18 37.64 Q50.65 39.22 52.77 38.81 Q59.28 37.68 65.92 37.89 Q65.92 37.89 65.92 37.89 Q64.07 44.27 60.98 50.11 Q59.94 52.00 60.98 53.89 Q64.07 59.73 65.92 66.11 Q65.92 66.11 65.92 66.11 Q59.28 66.32 52.77 65.19 Q50.65 64.78 49.18 66.36 Q44.58 71.10 39.08 74.83 Q39.08 74.83 39.08 74.83 Q36.83 68.59 35.90 62.04 Q35.63 59.90 33.67 58.98 Q27.74 56.07 22.50 52.00 Q22.50 52.00 22.50 52.00 Q27.74 47.93 33.67 45.02 Q35.63 44.10 35.90 41.96 Q36.83 35.41 39.08 29.17 Q39.08 29.17 39.08 29.17 Z";

type Props = {
    size?: number;
    bars?: string;
    star?: string;
    className?: string;
    title?: string;
};

export default function LodestarMark({ size = 32, bars = "#F7F3EC", star = "#E9C46A", className, title }: Props) {
    const cut = useId();

    return (
        <svg
            viewBox="8 9 84 82"
            width={size}
            height={(size * 82) / 84}
            className={className}
            role={title ? "img" : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
        >
            <defs>
                <mask id={cut} maskUnits="userSpaceOnUse" x={-100} y={-100} width={300} height={300}>
                    <rect x={-100} y={-100} width={300} height={300} fill="#fff" />
                    <path d={STAR_PATH} fill="#000" stroke="#000" strokeWidth={5} strokeLinejoin="round" />
                </mask>
            </defs>
            <g fill={bars} mask={`url(#${cut})`}>
                <rect x={10} y={11} width={36} height={24} rx={2.4} />
                <rect x={10} y={38} width={36} height={24} rx={2.4} />
                <rect x={10} y={65} width={80} height={24} rx={2.4} />
            </g>
            <path d={STAR_PATH} fill={star} stroke={star} strokeWidth={0.6} strokeLinejoin="round" />
        </svg>
    );
}
