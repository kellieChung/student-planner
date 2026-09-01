import { Announcement } from "@/types/announcement";

type AnnouncementWithScore = Announcement & {
    relevanceScore: number;
    relevanceReason: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function selectRelevantAnnouncements(
    announcements: Announcement[]
): AnnouncementWithScore[] {
    const now = Date.now();

    return announcements
        .map((announcement) => {
            const postedTime = new Date(
                announcement.postedAt
            ).getTime();

            if (Number.isNaN(postedTime)) {
                return {
                    ...announcement,
                    relevanceScore: 0,
                    relevanceReason: "Invalid date",
                };
            }

            const ageInDays =
                (now - postedTime) / DAY_MS;

            let score = 0;
            const reasons: string[] = [];

            // ------------------------------------------
            // Recency
            // ------------------------------------------

            if (ageInDays <= 3) {
                score += 5;
                reasons.push("posted within 3 days");
            } else if (ageInDays <= 7) {
                score += 4;
                reasons.push("posted within a week");
            } else if (ageInDays <= 14) {
                score += 2;
                reasons.push("posted within two weeks");
            } else if (ageInDays <= 30) {
                score += 1;
                reasons.push("posted within a month");
            } else {
                score -= 3;
                reasons.push("older announcement");
            }

            // ------------------------------------------
            // Task-like language
            // ------------------------------------------

            const text = `
                ${announcement.title}
                ${announcement.message}
            `.toLowerCase();

            const taskIndicators = [
                "assignment",
                "homework",
                "submit",
                "complete",
                "due",
                "read",
                "watch",
                "write",
                "discussion",
                "quiz",
                "test",
                "exam",
                "project",
                "worksheet",
                "practice",
                "study",
                "respond",
                "post",
                "chapter",
                "lab",
                "prepare",
            ];

            const matchedIndicators =
                taskIndicators.filter((word) =>
                    text.includes(word)
                );

            if (matchedIndicators.length > 0) {
                score += Math.min(
                    matchedIndicators.length,
                    5
                );

                reasons.push(
                    "contains task-related language"
                );
            }

            // ------------------------------------------
            // Explicit due-date language
            // ------------------------------------------

            const dueIndicators = [
                "due ",
                "due:",
                "deadline",
                "by friday",
                "by monday",
                "by tuesday",
                "by wednesday",
                "by thursday",
                "by saturday",
                "by sunday",
                "tomorrow",
                "tonight",
                "this week",
                "next week",
            ];

            if (
                dueIndicators.some((indicator) =>
                    text.includes(indicator)
                )
            ) {
                score += 4;
                reasons.push("contains due-date language");
            }

            // ------------------------------------------
            // Obvious informational announcements
            // ------------------------------------------

            const informationalIndicators = [
                "welcome",
                "welcome to",
                "back to school",
                "just saying hi",
                "meet the teacher",
                "office hours",
                "course introduction",
            ];

            const looksInformational =
                informationalIndicators.some(
                    (indicator) =>
                        text.includes(indicator)
                );

            if (looksInformational) {
                score -= 3;
                reasons.push(
                    "appears primarily informational"
                );
            }

            return {
                ...announcement,
                relevanceScore: score,
                relevanceReason:
                    reasons.length > 0
                        ? reasons.join(", ")
                        : "no strong relevance signals",
            };
        })
        .filter(
            (announcement) =>
                announcement.relevanceScore >= 2
        )
        .sort(
            (a, b) =>
                b.relevanceScore -
                a.relevanceScore
        );
}