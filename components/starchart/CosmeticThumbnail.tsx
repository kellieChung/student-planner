import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import StarField from "@/components/brand/StarField";
import { CONSTELLATIONS } from "@/lib/constellations";
import { cosmeticVariant, skyHasOwnPalette } from "@/lib/cosmetics";

const SAMPLE = CONSTELLATIONS.find((constellation) => constellation.id === "orion")!;
const SAMPLE_CHARTED = new Set(SAMPLE.stars.map((_, index) => index));

type Props = {
    // Full item keys, e.g. "sky.blueprint" / "lines.neon".
    sky: string;
    lines: string;
    className?: string;
};

// A miniature Star Chart in a given sky and line style. It is a real nested
// .sky.star-chart, so it uses the same CSS as the chart (the cosmetic rules
// only set inherited variables, so the chart's own look doesn't leak in).
// Drawn at 2x and scaled down: the sky art is sized in px for a full page
// (Blueprint grid, Synthwave horizon), so this keeps its proportions.
export default function CosmeticThumbnail({ sky, lines, className = "" }: Props) {
    return (
        <div className={`relative aspect-[16/10] overflow-hidden ${className}`} aria-hidden="true">
            <div
                className="sky star-chart absolute left-0 top-0 flex h-[200%] w-[200%] origin-top-left scale-50 items-center justify-center overflow-hidden bg-[var(--ls-night)]"
                data-sky={cosmeticVariant(sky)}
                data-lines={cosmeticVariant(lines)}
                data-sky-palette={skyHasOwnPalette(sky) ? "" : undefined}
            >
                <StarField count={40} seed={7} twinkle={false} sizeScale={1.6} />
                <ConstellationFigure constellation={SAMPLE} charted={SAMPLE_CHARTED} className="relative h-[88%] w-auto" />
            </div>
        </div>
    );
}
