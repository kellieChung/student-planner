import LegalPage from "@/components/LegalPage";
import { MINIMUM_AGE } from "@/lib/legal";

export const metadata = {
    title: "Terms of Service",
};

// TEMPLATE: replace [CONTACT EMAIL] and have
// this reviewed before relying on it — it is not legal advice.
export default function TermsPage() {
    return (
        <LegalPage title="Terms of Service">
            <section>
                <p>
                    These Terms of Service (&quot;Terms&quot;) govern your use of Lodestar (the
                    &quot;Service&quot;), operated by Kellie Chung (&quot;we&quot;, &quot;us&quot;). By creating an
                    account or using the Service, you agree to these Terms and to our Privacy Policy. If you don&apos;t
                    agree, don&apos;t use the Service.
                </p>
            </section>

            <section>
                <h2>1. Eligibility</h2>
                <p>
                    You must be at least {MINIMUM_AGE} years old to use the Service. If you are under 18 (or the age
                    of majority where you live), you may use the Service only with the permission of a parent or
                    legal guardian who agrees to these Terms on your behalf. If we learn that someone under{" "}
                    {MINIMUM_AGE} has created an account, we will delete it.
                </p>
            </section>

            <section>
                <h2>2. Your account</h2>
                <p>
                    You&apos;re responsible for keeping your login credentials secure and for all activity under your
                    account. Provide accurate information and tell us at [CONTACT EMAIL] if you believe your account
                    has been accessed without permission. You can delete your account at any time from the account
                    menu inside the app.
                </p>
            </section>

            <section>
                <h2>3. Canvas integration</h2>
                <p>
                    If you install our companion browser extension, it uses your existing, signed-in Canvas session
                    to read your courses, assignments, discussions, and announcements and copy them into your
                    planner. You authorize the Service to do this on your behalf. You are responsible for making sure
                    this use is allowed by your school&apos;s policies. Lodestar is not affiliated with,
                    endorsed by, or operated by Instructure (the maker of Canvas) or your school.
                </p>
            </section>

            <section>
                <h2>4. Acceptable use</h2>
                <p>You agree not to:</p>
                <ul>
                    <li>use the Service for anything unlawful or to violate your school&apos;s academic integrity rules;</li>
                    <li>access or try to access another person&apos;s account or data;</li>
                    <li>interfere with, overload, probe, or reverse-engineer the Service or its security;</li>
                    <li>use automated means to create accounts or scrape the Service.</li>
                </ul>
            </section>

            <section>
                <h2>5. Your content</h2>
                <p>
                    You keep ownership of the tasks, notes, playlists, and other content you add. You give us a
                    limited license to store and process that content only as needed to run the Service for you.
                </p>
            </section>

            <section>
                <h2>6. AI-generated estimates</h2>
                <p>
                    The Service uses AI models to estimate things like an assignment&apos;s importance, difficulty,
                    time required, and to suggest tasks from announcements. These estimates can be wrong. Always
                    check official due dates and requirements in Canvas and with your instructors — you are
                    responsible for your own coursework and deadlines.
                </p>
            </section>

            <section>
                <h2>7. Third-party services</h2>
                <p>
                    The Service relies on third-party services such as Google sign-in, Canvas, and YouTube (for the
                    music player). Your use of those services is governed by their own terms, and we aren&apos;t
                    responsible for them.
                </p>
            </section>

            <section>
                <h2>8. Disclaimer and limitation of liability</h2>
                <p>
                    The Service is provided &quot;as is&quot; and &quot;as available&quot;, without warranties of any
                    kind, express or implied, including fitness for a particular purpose and non-infringement. We
                    don&apos;t guarantee that the Service will be uninterrupted, error-free, or that data synced from
                    Canvas will be complete or current. To the fullest extent permitted by law, we are not liable for
                    any indirect, incidental, special, or consequential damages, or for missed deadlines, lost
                    grades, or lost data arising from your use of the Service.
                </p>
            </section>

            <section>
                <h2>9. Termination</h2>
                <p>
                    You can stop using the Service and delete your account at any time. We may suspend or end your
                    access if you violate these Terms or if we discontinue the Service.
                </p>
            </section>

            <section>
                <h2>10. Changes</h2>
                <p>
                    We may update these Terms. If we make material changes, we&apos;ll ask you to review and accept
                    the updated Terms the next time you sign in.
                </p>
            </section>

            <section>
                <h2>11. Governing law</h2>
                <p>These Terms are governed by the laws of the State of Nevada, United States, except where local law requires otherwise.</p>
            </section>

            <section>
                <h2>12. Contact</h2>
                <p>Questions about these Terms? Contact Kellie Chung at [CONTACT EMAIL].</p>
            </section>
        </LegalPage>
    );
}
