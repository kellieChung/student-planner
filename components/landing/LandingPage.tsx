import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import Reveal from "@/components/landing/Reveal";
import StarField from "@/components/brand/StarField";
import StarMap from "@/components/landing/StarMap";

const SIGN_UP_HREF = "/login?mode=signup";
const LOG_IN_HREF = "/login";

const STEPS: { title: string; body: string; illustration: ReactNode }[] = [
    {
        title: "Canvas syncs itself",
        body: "A small browser extension brings in your courses, assignments, discussions, and announcements while you're signed in to Canvas.",
        illustration: <SyncIllustration />,
    },
    {
        title: "AI reads the fine print",
        body: "Announcements get scanned for due dates and tasks that never made it into the Assignments tab.",
        illustration: <AnnouncementIllustration />,
    },
    {
        title: "You get the final say",
        body: "Anything it finds shows up in a quick rundown. Keep it, skip it, or decide later. Nothing lands on your plan without you.",
        illustration: <RundownIllustration />,
    },
    {
        title: "Your effort becomes Starlight",
        body: "Every finished task earns Starlight, more for bigger work. Spend it to chart stars in real constellations.",
        illustration: <SkyIllustration />,
    },
];

const ALSO_INSIDE = [
    "A weekly planner you can drag tasks around in",
    "Priority and time estimates for every assignment",
    "Recurring tasks for the things you do every week",
    "The Watch, a focus timer, and Comms, music while you work",
];

export default function LandingPage() {
    return (
        <div className="landing">
            <header className="relative overflow-hidden bg-[var(--ls-navy)]">
                <StarField count={90} seed={2026} />

                <nav className="relative mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
                    <Wordmark />
                    <Link href={LOG_IN_HREF} className="ls-link-quiet text-sm font-semibold">
                        Log in
                    </Link>
                </nav>

                <div className="relative mx-auto max-w-3xl px-4 pb-24 pt-16 text-center sm:px-8 sm:pb-32 sm:pt-24">
                    <Reveal>
                        <h1 className="ls-serif text-4xl leading-[1.1] text-[var(--ls-ivory)] sm:text-6xl">
                            Every finished task
                            <br />
                            is a <em className="text-[var(--ls-gold)]">new star.</em>
                        </h1>
                    </Reveal>
                    <Reveal delay={120}>
                        <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-[var(--ls-muted)] sm:text-lg">
                            The student planner that turns your workload into a night sky, and catches the assignments
                            hidden in Canvas announcements before they catch you.
                        </p>
                    </Reveal>
                    <Reveal delay={240}>
                        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Link href={SIGN_UP_HREF} className="ls-button-gold w-full sm:w-auto">
                                Get started
                            </Link>
                            <Link href={LOG_IN_HREF} className="ls-link-quiet text-sm font-semibold">
                                I already have an account
                            </Link>
                        </div>
                    </Reveal>
                </div>
            </header>

            <main>
                <section className="bg-[var(--ls-cream)] text-[var(--ls-ink)]">
                    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1fr_1.1fr] lg:items-center">
                        <Reveal>
                            <p className="ls-eyebrow text-[var(--ls-ink-muted)]">The real problem</p>
                            <h2 className="ls-serif mt-3 text-3xl leading-tight sm:text-4xl">
                                Not every assignment lives in the Assignments tab.
                            </h2>
                        </Reveal>
                        <Reveal delay={120}>
                            <div className="space-y-4 text-base leading-relaxed text-[var(--ls-ink-muted)]">
                                <p>
                                    Sometimes the real due date is in the third paragraph of an announcement. Sometimes
                                    it&apos;s a line on a module page, or a quick reminder posted on a Sunday night.
                                </p>
                                <p>
                                    You check the Assignments tab, it looks clear, and a week later you find out it
                                    wasn&apos;t. That isn&apos;t carelessness. It&apos;s a lot to catch by hand across
                                    five or six classes.
                                </p>
                                <p className="font-semibold text-[var(--ls-ink)]">
                                    You shouldn&apos;t have to catch everything yourself.
                                </p>
                            </div>
                        </Reveal>
                    </div>
                </section>

                <section className="bg-[var(--ls-navy)] text-[var(--ls-ivory)]">
                    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8 sm:py-28">
                        <Reveal>
                            <p className="ls-eyebrow text-[var(--ls-gold)]">How it works</p>
                            <h2 className="ls-serif mt-3 max-w-xl text-3xl leading-tight sm:text-4xl">
                                Four quiet steps between Canvas and a clear week.
                            </h2>
                        </Reveal>

                        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                            {STEPS.map((step, index) => (
                                <li key={step.title}>
                                    <Reveal delay={index * 100} className="h-full">
                                        <div className="flex h-full flex-col rounded-2xl bg-[var(--ls-navy-raised)] p-5">
                                            <div className="flex h-32 items-center justify-center rounded-xl bg-[var(--ls-night)]">
                                                {step.illustration}
                                            </div>
                                            <p className="ls-serif mt-5 text-sm text-[var(--ls-gold)]">
                                                Step {index + 1}
                                            </p>
                                            <h3 className="mt-1 text-lg font-semibold">{step.title}</h3>
                                            <p className="mt-2 text-sm leading-relaxed text-[var(--ls-muted)]">
                                                {step.body}
                                            </p>
                                        </div>
                                    </Reveal>
                                </li>
                            ))}
                        </ol>

                        <Reveal>
                            <div className="mt-14 border-t border-[var(--ls-line)] pt-8">
                                <p className="ls-eyebrow text-[var(--ls-muted)]">Also inside</p>
                                <ul className="mt-4 grid gap-3 text-sm text-[var(--ls-ivory)] sm:grid-cols-2">
                                    {ALSO_INSIDE.map((item) => (
                                        <li key={item} className="flex items-start gap-3">
                                            <SparkIcon />
                                            <span>{item}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        </Reveal>
                    </div>
                </section>

                <section className="bg-[var(--ls-night)] text-[var(--ls-ivory)]">
                    <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8 sm:py-28">
                        <Reveal className="mx-auto max-w-2xl text-center">
                            <p className="ls-eyebrow text-[var(--ls-gold)]">Your star map</p>
                            <h2 className="ls-serif mt-3 text-3xl leading-tight sm:text-5xl">
                                A sky that grows with you.
                            </h2>
                            <p className="mt-5 text-base leading-relaxed text-[var(--ls-muted)]">
                                Finished work turns into Starlight, and Starlight charts real stars. Start with Orion,
                                the Big Dipper, and Cassiopeia. New constellations appear as your semester goes on, so a
                                long week turns into something you can actually see.
                            </p>
                        </Reveal>

                        <Reveal className="mt-14" delay={120}>
                            <StarMap />
                        </Reveal>
                        <p className="mt-4 text-center text-xs text-[var(--ls-muted)]">
                            Hover over or tab to a constellation to see it glow.
                        </p>
                    </div>
                </section>

                <section className="bg-[var(--ls-cream)] text-[var(--ls-ink)]">
                    <Reveal className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-8 sm:py-24">
                        <CompassIcon />
                        <p className="ls-serif mt-6 text-2xl leading-snug sm:text-3xl">
                            Built by a student who was tired of missing assignments buried in Canvas announcements.
                        </p>
                        <p className="mt-5 text-base leading-relaxed text-[var(--ls-ink-muted)]">
                            Lodestar is an independent project, shaped by what actually goes wrong in a real semester.
                            It isn&apos;t affiliated with Canvas, Instructure, or any school.
                        </p>
                    </Reveal>
                </section>

                <section className="relative overflow-hidden bg-[var(--ls-navy)] text-center text-[var(--ls-ivory)]">
                    <StarField count={50} seed={31} />
                    <Reveal className="relative mx-auto max-w-2xl px-4 py-20 sm:px-8 sm:py-28">
                        <h2 className="ls-serif text-3xl leading-tight sm:text-5xl">Let the planner do the catching.</h2>
                        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                            <Link href={SIGN_UP_HREF} className="ls-button-gold w-full sm:w-auto">
                                Get started
                            </Link>
                            <Link href={LOG_IN_HREF} className="ls-link-quiet text-sm font-semibold">
                                Log in
                            </Link>
                        </div>
                    </Reveal>
                </section>
            </main>

            <footer className="border-t border-[var(--ls-line)] bg-[var(--ls-night)] text-[var(--ls-muted)]">
                <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <Wordmark small />
                    <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
                        <Link href={LOG_IN_HREF} className="ls-link-quiet">Log in</Link>
                        <Link href={SIGN_UP_HREF} className="ls-link-quiet">Sign up</Link>
                        <Link href="/terms" className="ls-link-quiet">Terms</Link>
                        <Link href="/privacy" className="ls-link-quiet">Privacy</Link>
                        <Link href="/credits" className="ls-link-quiet">Credits</Link>
                    </nav>
                </div>
                <p className="mx-auto max-w-6xl px-4 pb-10 text-xs sm:px-8">
                    © 2026 Kellie Chung. Canvas is a trademark of Instructure, Inc. Lodestar is not
                    affiliated with or endorsed by Instructure.
                </p>
            </footer>
        </div>
    );
}

function Wordmark({ small = false }: { small?: boolean }) {
    const size = small ? 28 : 36;

    return (
        <Link href="/" className="flex items-center gap-3">
            <span className="block overflow-hidden rounded-lg" style={{ width: size, height: size }}>
                <Image
                    src="/brand/lodestar-mark-temp.png"
                    alt=""
                    width={size}
                    height={size}
                    priority={!small}
                />
            </span>
            <span className={`ls-serif text-[var(--ls-ivory)] ${small ? "text-lg" : "text-2xl"}`}>Lodestar</span>
        </Link>
    );
}

function SparkIcon() {
    return (
        <svg viewBox="0 0 16 16" aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0">
            <path d="M8 1.5 9.4 6.6 14.5 8 9.4 9.4 8 14.5 6.6 9.4 1.5 8 6.6 6.6Z" fill="var(--ls-gold)" />
        </svg>
    );
}

function CompassIcon() {
    return (
        <svg viewBox="0 0 48 48" aria-hidden="true" className="mx-auto h-10 w-10">
            <circle cx="24" cy="24" r="17" fill="none" stroke="var(--ls-ink)" strokeWidth="1.5" />
            <path d="M24 4 27 21 44 24 27 27 24 44 21 27 4 24 21 21Z" fill="var(--ls-gold-deep)" />
        </svg>
    );
}

function SyncIllustration() {
    return (
        <div aria-hidden="true" className="w-[82%] space-y-2 text-[11px]">
            {["BIO 201", "MATH 151", "HIST 110"].map((course, index) => (
                <div
                    key={course}
                    className="ls-sync-row flex items-center justify-between rounded-md bg-[var(--ls-navy-raised)] px-2.5 py-1.5"
                    style={{ animationDelay: `${index * 0.4}s` }}
                >
                    <span className="text-[var(--ls-ivory)]">{course}</span>
                    <svg viewBox="0 0 12 12" className="h-3 w-3">
                        <path d="M2 6.5 5 9 10 3" fill="none" stroke="var(--ls-gold)" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                </div>
            ))}
        </div>
    );
}

function AnnouncementIllustration() {
    return (
        <div aria-hidden="true" className="w-[84%] rounded-md bg-[var(--ls-navy-raised)] p-2.5 text-[11px] leading-snug text-[var(--ls-muted)]">
            <p className="font-semibold text-[var(--ls-ivory)]">Week 6 update</p>
            <p className="mt-1">
                Great work on the quiz. Also, the <span className="ls-highlight">lab write-up is due Friday</span> at
                11:59pm.
            </p>
        </div>
    );
}

function RundownIllustration() {
    return (
        <div aria-hidden="true" className="w-[84%] rounded-md bg-[var(--ls-navy-raised)] p-2.5 text-[11px]">
            <p className="font-semibold text-[var(--ls-ivory)]">Lab write-up</p>
            <p className="text-[var(--ls-muted)]">BIO 201 · due Friday</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                <span className="rounded border border-[var(--ls-line)] py-0.5 text-[var(--ls-muted)]">No</span>
                <span className="rounded border border-[var(--ls-line)] py-0.5 text-[var(--ls-muted)]">Maybe</span>
                <span className="rounded bg-[var(--ls-gold)] py-0.5 font-semibold text-[var(--ls-navy)]">Yes</span>
            </div>
        </div>
    );
}

function SkyIllustration() {
    const points: [number, number][] = [[20, 70], [48, 44], [80, 58], [108, 30], [136, 50]];

    return (
        <svg aria-hidden="true" viewBox="0 0 156 100" className="h-24 w-[84%]">
            <polyline points={points.map(([x, y]) => `${x},${y}`).join(" ")} className="ls-edge-lit" fill="none" />
            {points.map(([x, y], index) => (
                <circle
                    key={index}
                    cx={x}
                    cy={y}
                    r={index < 4 ? 3.4 : 2.2}
                    className={index < 4 ? "ls-star-lit ls-twinkle" : "ls-map-unlit"}
                    style={{ animationDelay: `${index * 0.8}s`, animationDuration: "5s" }}
                />
            ))}
        </svg>
    );
}
