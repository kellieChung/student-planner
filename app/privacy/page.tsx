import LegalPage from "@/components/LegalPage";
import { MINIMUM_AGE } from "@/lib/legal";

export const metadata = {
    title: "Privacy Policy",
};

// TEMPLATE: replace [CONTACT EMAIL] and have this reviewed
// before relying on it — it is not legal advice. Keep the "What we collect"
// and "Who we share it with" sections in sync with the actual data flows.
export default function PrivacyPage() {
    return (
        <LegalPage title="Privacy Policy">
            <section>
                <p>
                    This Privacy Policy explains what information Lodestar (the &quot;Service&quot;), operated
                    by Kellie Chung, collects, how it&apos;s used, and the choices you have.
                </p>
            </section>

            <section>
                <h2>What we collect</h2>
                <ul>
                    <li>
                        <strong>Account information:</strong> your email address and (optionally) your name. If you
                        sign up with a password, we store only a salted, one-way hash of it — never the password
                        itself. If you sign in with Google, we receive your name, email address, and profile picture
                        from Google.
                    </li>
                    <li>
                        <strong>Canvas data:</strong> if you use the companion browser extension, the course names,
                        assignments (titles, descriptions, due dates), discussions, and announcements from your Canvas
                        account. We do not store your Canvas password or Canvas session cookies.
                    </li>
                    <li>
                        <strong>Content you create:</strong> custom and recurring tasks, task edits, planner settings,
                        music playlists, and game progress (XP, town and map layout).
                    </li>
                    <li>
                        <strong>Usage records inside the app:</strong> such as when you complete, reschedule, or
                        delete tasks, used to power features like procrastination tracking and task suggestions.
                    </li>
                    <li>
                        <strong>Consent records:</strong> when you accepted these policies and confirmed you are{" "}
                        {MINIMUM_AGE} or older.
                    </li>
                </ul>
            </section>

            <section>
                <h2>How we use it</h2>
                <p>
                    Only to provide the Service to you: syncing and displaying your coursework, estimating task
                    priority and time, suggesting tasks, running the game features, and keeping your account secure.
                    We don&apos;t sell your personal information, and we don&apos;t use it for advertising.
                </p>
            </section>

            <section>
                <h2>Who we share it with</h2>
                <p>We use these service providers, who process data on our behalf:</p>
                <ul>
                    <li><strong>Vercel</strong> — hosts the app.</li>
                    <li><strong>Our database provider</strong> — stores your account and planner data.</li>
                    <li><strong>Google</strong> — if you choose &quot;Continue with Google&quot; to sign in.</li>
                    <li>
                        <strong>Anthropic</strong> — the text of Canvas announcements is sent to Anthropic&apos;s
                        Claude API to extract suggested tasks.
                    </li>
                    <li>
                        <strong>AI model server (Ollama)</strong> — assignment titles and descriptions are processed by
                        an Ollama language-model server we run to estimate importance, difficulty, and time.
                    </li>
                    <li>
                        <strong>YouTube</strong> — the music player embeds YouTube, which may set its own cookies and
                        collect data under Google&apos;s privacy policy when you use it.
                    </li>
                </ul>
                <p>We may also disclose information if required by law.</p>
            </section>

            <section>
                <h2>Cookies</h2>
                <p>
                    We use a strictly necessary session cookie to keep you signed in. We don&apos;t use analytics or
                    advertising cookies. Embedded YouTube players may set third-party cookies.
                </p>
            </section>

            <section>
                <h2>Student records</h2>
                <p>
                    Lodestar is a personal tool you choose to use; it is not provided by or affiliated with
                    your school or Instructure. You control the Canvas data you bring into it and can remove it at
                    any time by deleting courses in the app or deleting your account.
                </p>
            </section>

            <section>
                <h2>Retention and deletion</h2>
                <p>
                    We keep your data for as long as your account exists. You can permanently delete your account
                    and all associated data at any time from Account settings in the app (from the account menu in the app (&quot;Deletequot;Delete
                    Account&quot;). Deletion is immediate and can&apos;t be undone.
                </p>
            </section>

            <section>
                <h2>Your rights</h2>
                <p>
                    Depending on where you live (for example, under the GDPR or California&apos;s CCPA/CPRA), you may
                    have the right to access, correct, export, or delete your personal information, and to object to
                    or restrict certain processing. You can delete your data yourself in the app; for any other
                    request, contact [CONTACT EMAIL]. We won&apos;t discriminate against you for exercising these
                    rights.
                </p>
            </section>

            <section>
                <h2>Children</h2>
                <p>
                    The Service is not intended for children under {MINIMUM_AGE}, and we don&apos;t knowingly collect
                    personal information from them. If you believe a child under {MINIMUM_AGE} has created an
                    account, contact [CONTACT EMAIL] and we will delete it.
                </p>
            </section>

            <section>
                <h2>Security</h2>
                <p>
                    We use reasonable measures to protect your information, including encrypted connections (HTTPS)
                    and hashed passwords. No system is perfectly secure, so we can&apos;t guarantee absolute security.
                </p>
            </section>

            <section>
                <h2>Changes</h2>
                <p>
                    If we make material changes to this policy, we&apos;ll update the effective date above and ask you
                    to review and accept it the next time you sign in.
                </p>
            </section>

            <section>
                <h2>Contact</h2>
                <p>Questions or requests? Contact Kellie Chung at [CONTACT EMAIL].</p>
            </section>
        </LegalPage>
    );
}
