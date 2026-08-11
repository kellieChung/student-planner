import { testAnnouncements } from "@/lib/ai/testData";
import { analyzeAnnouncement } from "@/lib/ai/analyzeAnnouncement";

export default async function TestAI() {
    const results = [];

    for (const announcement of testAnnouncements) {
        const tasks = await analyzeAnnouncement(announcement);

        results.push({
            announcement,
            tasks,
        });
    }

    return (
        <main>
            <h1>AI Announcement Test</h1>

            {results.map(({ announcement, tasks }) => (
                <section
                    key={announcement.id}
                    style={{
                        marginBottom: "40px",
                        padding: "20px",
                        border: "1px solid #444",
                        borderRadius: "8px",
                    }}
                >
                    <h2>{announcement.title}</h2>

                    <p>
                        <strong>Course:</strong>{" "}
                        {announcement.course}
                    </p>

                    <p>
                        <strong>Announcement:</strong>{" "}
                        {announcement.message}
                    </p>

                    <h3>AI Tasks</h3>

                    <pre>
                        {JSON.stringify(tasks, null, 2)}
                    </pre>
                </section>
            ))}
        </main>
    );
}