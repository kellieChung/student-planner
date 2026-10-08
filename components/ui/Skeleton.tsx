import type { CSSProperties } from "react";

type Props = {
    className?: string;
    style?: CSSProperties;
};

// A shimmering placeholder block (app/globals.css's .skeleton). Purely
// decorative: the container it sits in carries aria-busy and the
// screen-reader "Loading" text.
export default function Skeleton({ className = "", style }: Props) {
    const rounding = /\brounded/.test(className) ? "" : "rounded-md";

    return <div aria-hidden="true" className={`skeleton ${rounding} ${className}`} style={style} />;
}
