import { getAllAnnouncements } from "@/lib/canvas";

export default async function TestAnnouncementsPage() {
    const announcements = await getAllAnnouncements();

    return (
        <div className="p-8">
            <h1 className="text-2xl font-bold mb-6">
                Canvas Announcements
            </h1>

            <pre className="whitespace-pre-wrap">
                {JSON.stringify(announcements, null, 2)}
            </pre>
        </div>
    );
}