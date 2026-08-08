import {TaskState} from "@/types/taskState";

const STORAGE_KEY = "task_states";

type TaskStateMap = Record<string, TaskState>;

export function getTaskStates(): TaskStateMap {
    const stored = localStorage.getItem(STORAGE_KEY);

    if (!stored) {
        return {};
    }

    return JSON.parse(stored);
}

export function saveTaskState(
    id: string,
    state: TaskState
) {
    const states = getTaskStates();
    
    states[id] = state;
    
    localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(states)
    );
}