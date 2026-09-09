export type Course = {
    id: string;
    name: string;
    hidden: boolean;
    // A user-added category (e.g. "Personal") rather than one Canvas
    // synced — deleting one is permanent, unlike a Canvas-synced course.
    isCustom: boolean;
    // User-editable short code shown on planner cards (e.g. "MA"). Null
    // means "use the auto-derived default"
    // (lib/taskLabel.ts's courseAbbreviationDefault).
    abbreviation: string | null;
    // User-editable hex color (e.g. "#3b82f6") for the course badge shown
    // on planner cards. Null means "use the auto-derived default"
    // (components/AssignmentCard.tsx's courseColorFor hash).
    color: string | null;
};
