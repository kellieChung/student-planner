import StarField from "@/components/brand/StarField";
import ConstellationFigure from "@/components/starchart/ConstellationFigure";
import { getConstellation, type Constellation } from "@/lib/constellations";

// A snapshot of a sky a few weeks in: the three starting constellations
// partly charted, with the next one still waiting to appear. Uses the real
// catalog so the homepage always matches the app.
const PREVIEW: { id: string; charted: number[]; offset: string }[] = [
    { id: "orion", charted: [0, 1, 2, 3, 4, 5], offset: "lg:translate-y-6" },
    { id: "ursa-major", charted: [0, 1, 2, 3, 4, 5, 6], offset: "lg:-translate-y-8" },
    { id: "cassiopeia", charted: [1, 2], offset: "lg:translate-y-10" },
];

export default function StarMap() {
    const tiles = PREVIEW.map((preview) => ({ ...preview, constellation: getConstellation(preview.id) as Constellation }));

    return (
        <figure className="relative overflow-hidden rounded-3xl border border-[var(--ls-line)] bg-[var(--ls-night)] px-4 py-10 sm:px-8 sm:py-14">
            <StarField count={120} seed={7} />

            <div className="relative grid grid-cols-2 gap-x-4 gap-y-10 lg:grid-cols-4">
                {tiles.map(({ id, constellation, charted, offset }) => {
                    const complete = charted.length === constellation.stars.length;

                    return (
                        <div
                            key={id}
                            tabIndex={0}
                            aria-label={`${constellation.name}: ${charted.length} of ${constellation.stars.length} stars charted`}
                            className={`ls-constellation group flex flex-col items-center rounded-2xl outline-none ${offset}`}
                        >
                            <ConstellationFigure
                                constellation={constellation}
                                charted={new Set(charted)}
                                className="w-full max-w-[200px]"
                            />
                            <p className="mt-2 font-[family-name:var(--font-spectral)] text-lg text-[var(--ls-ivory)]">
                                {constellation.name}
                            </p>
                            <p className="text-xs text-[var(--ls-muted)]">
                                {complete ? "Fully charted" : `${charted.length} of ${constellation.stars.length} stars charted`}
                            </p>
                        </div>
                    );
                })}

                <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--ls-line)] p-6 text-center lg:-translate-y-4">
                    <p className="font-[family-name:var(--font-spectral)] text-lg text-[var(--ls-muted)]">Uncharted sky</p>
                    <p className="mt-1 text-xs text-[var(--ls-muted)]">More constellations appear as your Starlight grows.</p>
                </div>
            </div>

            <figcaption className="sr-only">
                An illustration of a night sky. Orion has 6 of 8 stars charted, the Big Dipper is fully charted,
                Cassiopeia has 2 of 5, and a patch of uncharted sky waits for the next constellation.
            </figcaption>
        </figure>
    );
}
