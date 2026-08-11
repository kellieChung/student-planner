import { Announcement } from "@/types/announcement";

export const testAnnouncements: Announcement[] = [
    // ============================================================
    // 1. SIMPLE / OBVIOUS
    // ============================================================

    {
        id: "test-01",
        course: "English",
        title: "Reading for Wednesday",
        message:
            "For Wednesday's class, please read chapters 2 and 3 of The Adventures of Huckleberry Finn.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-02",
        course: "AP Physics",
        title: "Homework",
        message:
            "Complete problems 1-10 on page 247. This is due Friday.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-03",
        course: "AP Calculus",
        title: "Quiz Tomorrow",
        message:
            "Reminder: we have a quiz on derivatives tomorrow.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 2. EXPLICIT CALENDAR DATES
    // ============================================================

    {
        id: "test-04",
        course: "History",
        title: "Essay Due",
        message:
            "Your Civil War essay is due 9/15. Please submit it through Canvas.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-05",
        course: "Biology",
        title: "Lab Report",
        message:
            "The lab report must be submitted by September 18.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-06",
        course: "Computer Science",
        title: "Final Project",
        message:
            "The final project is due Wednesday, September 2.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-07",
        course: "Economics",
        title: "Problem Set",
        message:
            "Problem set 4 is due 09/25.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-08",
        course: "Chemistry",
        title: "Homework",
        message:
            "Finish questions 12-28 by September 3, 2026.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 3. RELATIVE DATES
    // ============================================================

    {
        id: "test-09",
        course: "English",
        title: "Reading",
        message:
            "Please finish reading chapters 4-6 by tomorrow.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-10",
        course: "Physics",
        title: "Lab Prep",
        message:
            "Before next Monday's class, read the lab procedure and answer questions 1-5.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-11",
        course: "Math",
        title: "Homework",
        message:
            "Complete the assigned practice problems by next Friday.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-12",
        course: "History",
        title: "Discussion Prep",
        message:
            "For class tomorrow, review the lecture notes from last week.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 4. IMPLIED WORK
    // ============================================================

    {
        id: "test-13",
        course: "English",
        title: "Wednesday Discussion",
        message:
            "We will discuss chapters 3-5 of Huck Finn in class Wednesday. Please come prepared to discuss the major themes and characters.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-14",
        course: "History",
        title: "Preparation",
        message:
            "On Friday we will have a seminar on the causes of the Civil War. Make sure you are familiar with the assigned primary sources before coming to class.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-15",
        course: "Biology",
        title: "Before Lab",
        message:
            "Before tomorrow's lab, make sure you understand the procedure and have reviewed the safety information.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 5. MULTIPLE TASKS IN ONE ANNOUNCEMENT
    // ============================================================

    {
        id: "test-16",
        course: "English",
        title: "Wednesday Homework",
        message:
            "For Wednesday, read chapters 7-9 of Huck Finn and answer questions 1-5 on the worksheet. Bring your completed worksheet to class.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-17",
        course: "AP Physics",
        title: "Lab",
        message:
            "Before Friday's lab, read pages 210-220 and complete the pre-lab questions. The lab report will be due Monday.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-18",
        course: "Spanish",
        title: "Homework",
        message:
            "By Thursday, finish the vocabulary exercise on page 84, write five sentences using the new vocabulary, and study for the vocabulary quiz.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 6. MESSY / NATURAL TEACHER LANGUAGE
    // ============================================================

    {
        id: "test-19",
        course: "English",
        title: "A quick reminder",
        message:
            "Just a quick reminder that we are picking up where we left off on Wednesday, so make sure you've gotten through Ch. 2 and 3 before then!",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-20",
        course: "Physics",
        title: "For next class",
        message:
            "For our next class, I'd like everyone to take a look at section 4.2 and try the example problems. You don't need to turn anything in.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-21",
        course: "History",
        title: "Heads up",
        message:
            "Heads up! We'll be talking about Reconstruction on Thursday. Please make sure you've finished the reading from pages 310-325 beforehand.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-22",
        course: "Chemistry",
        title: "Important",
        message:
            "Don't forget about the stoichiometry packet. I need those completed before class on Friday.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 7. NO TASKS
    // ============================================================

    {
        id: "test-23",
        course: "English",
        title: "No Homework",
        message:
            "There is no homework tonight. Enjoy your evening!",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-24",
        course: "Physics",
        title: "Class Update",
        message:
            "We will be moving to room 204 on Wednesday because the lab is being used by another class.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-25",
        course: "History",
        title: "Reminder",
        message:
            "Remember that we have our unit test next week.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 8. AMBIGUOUS
    // ============================================================

    {
        id: "test-26",
        course: "English",
        title: "For Monday",
        message:
            "For Monday, be ready to talk about the ending of the novel.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-27",
        course: "Biology",
        title: "Exam Review",
        message:
            "Our exam is Friday. You should probably review chapters 8-10.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-28",
        course: "Math",
        title: "Practice",
        message:
            "If you're having trouble with today's material, try working through the extra problems at the end of the section before next class.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 9. MULTIPLE DATES
    // ============================================================

    {
        id: "test-29",
        course: "AP Physics",
        title: "Lab Report",
        message:
            "Read the lab instructions before Wednesday. The lab itself is Thursday, and your lab report is due Monday, August 17.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-30",
        course: "English",
        title: "Essay",
        message:
            "Your outline is due Friday. The final essay will be due September 1.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 10. POTENTIAL HALLUCINATION TRAPS
    // ============================================================

    {
        id: "test-31",
        course: "History",
        title: "Upcoming Discussion",
        message:
            "On Wednesday we'll discuss the Progressive Era. I'll provide the readings in class.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-32",
        course: "Computer Science",
        title: "Project Update",
        message:
            "The project is coming along well! Remember that presentations will happen next Friday.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-33",
        course: "Chemistry",
        title: "Class Notes",
        message:
            "Today we covered acids and bases. The slides have been uploaded for anyone who wants to review them.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 11. REALLY MESSY
    // ============================================================

    {
        id: "test-34",
        course: "English",
        title: "!!!",
        message:
            "Ch 10-12 for Wed!! Don't forget :)",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-35",
        course: "Physics",
        title: "reminder",
        message:
            "pg 182 #4-17 + prelab by tmrw",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-36",
        course: "Math",
        title: "HW",
        message:
            "HW 6 due 8/14. Quiz 8/15.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 12. WORK THAT ISN'T CALLED "HOMEWORK"
    // ============================================================

    {
        id: "test-37",
        course: "English",
        title: "Discussion Prep",
        message:
            "Before Thursday, annotate the poem and write two questions you'd like to bring to the discussion.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-38",
        course: "Computer Science",
        title: "Code Review",
        message:
            "Please push your current code to GitHub before Monday so I can review it before class.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    {
        id: "test-39",
        course: "Art",
        title: "Portfolio",
        message:
            "Choose your three strongest pieces and have them ready for portfolio review next Tuesday.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },

    // ============================================================
    // 13. MULTIPLE COURSES / CONTEXT SHOULD STAY SEPARATE
    // ============================================================

    {
        id: "test-40",
        course: "English",
        title: "Reading",
        message:
            "Read chapters 10-12 by Friday. The history reading is also due Friday, but that's for Mr. Chen's class.",
        postedAt: "2026-08-10T12:00:00.000Z",
    },
];