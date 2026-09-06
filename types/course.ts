export type Course = {
    id: string;
    name: string;
    hidden: boolean;
    // A user-added category (e.g. "Personal") rather than one Canvas
    // synced — deleting one is permanent, unlike a Canvas-synced course.
    isCustom: boolean;
};
