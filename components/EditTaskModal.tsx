"use client";

import Tooltip from "@/components/ui/Tooltip";
import React, {useState, useEffect} from "react";
import {Assignment} from "@/types/assignment";
import {Course} from "@/types/course";
import {RecurringTask} from "@/types/recurringTask";
import StartDateField from "./StartDateField";
import DatePicker from "./DatePicker";
import Select from "@/components/ui/Select";
import DueTimeField from "./DueTimeField";
import CourseSelect from "./CourseSelect";
import RecurrenceField, {DEFAULT_RECURRENCE_VALUE, RecurrenceFieldValue} from "./RecurrenceField";
import {resolveDueTime, formatTimeInputValue, formatEstimatedMinutes} from "@/lib/utils";
import {classifyLabelType, courseAbbreviationDefault, formatTaskLabel, LabelType} from "@/lib/taskLabel";
import {TaskStatus} from "@/lib/taskStatus";
import {describeRecurrenceRule} from "@/lib/recurrence";

export type RecurrenceScope = "this" | "following";

type EditTaskModalProps = {
    task: Assignment | null;
    isOpen: boolean;
    startDate: string;
    notes: string;
    status: TaskStatus;
    courses: Course[];
    estimatedMinutes?: number;
    // The series this task belongs to, if task.recurrenceId is set — used
    // only to render the read-only "Repeats every ..." summary.
    recurringTaskRule?: RecurringTask | null;
    onCourseCreated: (course: Course) => void;
    onClose: () => void;
    onSaveTask: (updatedTask: Assignment, startDate: string, notes: string, status: TaskStatus, scope?: RecurrenceScope) => void;
    onDeleteTask: (id: string, scope?: RecurrenceScope) => void;
    onConvertToRecurring: (task: Assignment, recurrence: RecurrenceFieldValue, startDate: string, notes: string, status: TaskStatus) => void;
    onManageSeries: (recurrenceId: string) => void;
};

export default function EditTaskModal({
    task,
    isOpen,
    startDate,
    notes: initialNotes,
    status: initialStatus,
    courses,
    estimatedMinutes,
    recurringTaskRule,
    onCourseCreated,
    onClose,
    onSaveTask,
    onDeleteTask,
    onConvertToRecurring,
    onManageSeries,
}: EditTaskModalProps) {
    const [name, setName] = useState("");
    const [course, setCourse] = useState("");
    const [due, setDue] = useState("");
    const [dueTime, setDueTime] = useState("");
    const [start, setStart] = useState("");
    const [notes, setNotes] = useState("");
    const [status, setStatus] = useState<TaskStatus>("not_started");
    const [typeOverride, setTypeOverride] = useState("");
    const [editingClassification, setEditingClassification] = useState(false);
    const [recurrence, setRecurrence] = useState<RecurrenceFieldValue>(DEFAULT_RECURRENCE_VALUE);
    // Set while asking "this occurrence" vs "this and following" for an
    // edit/delete that would otherwise touch every future occurrence of a
    // series. Holds enough to finish the action once the user picks.
    const [pendingAction, setPendingAction] = useState<
        | null
        | { kind: "save"; updatedTask: Assignment }
        | { kind: "delete" }
    >(null);

    useEffect(() => {
        if (task) {
            setName(task.name || "");
            setCourse(task.course || "");
            setDue(task.due || "");
            setDueTime(formatTimeInputValue(task.dueAt));
            setStart(startDate || "");
            setNotes(initialNotes || "");
            setStatus(initialStatus);
            setTypeOverride(task.typeOverride ?? "");
            setEditingClassification(false);
            setRecurrence(DEFAULT_RECURRENCE_VALUE);
            setPendingAction(null);
        }
    }, [task, startDate, initialNotes, initialStatus]);

    if (!isOpen ||!task) return null;

    const startAfterDue = Boolean(start && due && start > due);
    const recurrenceInvalid = recurrence.enabled && recurrence.frequency === "weekly" && recurrence.weekdays.length === 0;
    const isCustomTask = task.id.startsWith("custom-");
    const isRecurringOccurrence = Boolean(task.recurrenceId);
    // A due-DATE shift or a series-level field change (name/course/type) on
    // a single occurrence needs a this-vs-following choice; notes, status,
    // start date, and due-time edits always stay per-occurrence only.
    const seriesFieldsChanged = name !== task.name || course !== task.course || (typeOverride || null) !== (task.typeOverride ?? null);
    const dueDateChanged = due !== (task.due || "");
    const needsScopeChoice = isRecurringOccurrence && seriesFieldsChanged && !dueDateChanged;

    const autoTypeCode = classifyLabelType({
        name,
        course,
        isCustomCourse: courses.find((c) => c.name === course)?.isCustom,
    });
    const effectiveTypeCode = (typeOverride || autoTypeCode) as LabelType;
    const courseAbbreviation =
        courses.find((c) => c.name === course)?.abbreviation || courseAbbreviationDefault(course || "General");
    const cardLabel = formatTaskLabel({
        courseAbbreviation,
        typeCode: effectiveTypeCode,
        dueDateKey: due,
        name,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if(!name) return;
        if (startAfterDue) return;

        if (recurrence.enabled && !isRecurringOccurrence) {
            if (recurrenceInvalid) return;

            onConvertToRecurring({
                ...task,
                name,
                course,
                due,
                typeOverride: (typeOverride || null) as Assignment["typeOverride"],
                ...resolveDueTime(due, dueTime),
            }, recurrence, start, notes, status);

            onClose();
            return;
        }

        const updatedTask: Assignment = {
            ...task,
            name,
            course,
            due,
            typeOverride: (typeOverride || null) as Assignment["typeOverride"],
            ...resolveDueTime(due, dueTime),
        };

        if (needsScopeChoice) {
            setPendingAction({ kind: "save", updatedTask });
            return;
        }

        onSaveTask(updatedTask, start, notes, status, "this");
        onClose();
    };

    const chooseScope = (scope: RecurrenceScope) => {
        if (!pendingAction) return;

        if (pendingAction.kind === "save") {
            onSaveTask(pendingAction.updatedTask, start, notes, status, scope);
        } else {
            onDeleteTask(task.id, scope);
        }

        setPendingAction(null);
        onClose();
    };

    if (pendingAction) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm p-4">
                <div className="theme-surface planner-shell bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl text-white space-y-4">
                    <h2 className="text-lg font-bold text-slate-100">
                        {pendingAction.kind === "delete" ? "Delete recurring task" : "Edit recurring task"}
                    </h2>
                    <p className="text-sm text-slate-400">
                        This task repeats. Apply this {pendingAction.kind === "delete" ? "deletion" : "change"} to:
                    </p>
                    <div className="flex flex-col gap-2">
                        <button
                            type="button"
                            onClick={() => chooseScope("this")}
                            className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700"
                        >
                            This occurrence only
                        </button>
                        <button
                            type="button"
                            onClick={() => chooseScope("following")}
                            className="w-full text-left px-3 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700"
                        >
                            This and all following occurrences
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={() => setPendingAction(null)}
                        className="w-full px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-sm p-4">
            <div className="theme-surface planner-shell bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl text-white">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300">
                        {course || "General"}
                        </span>
                        <h2 className="text-lg font-bold text-slate-100 mt-2 leading-snug">
                        Edit Task Details
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 hover:text-white text-lg px-2"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit = {handleSubmit} className = "flex flex-col gap-4">
                    <div>
                        <label className = "block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                            Full Task Name
                        </label>
                        <textarea
                            rows = {3}
                            required
                            value = {name}
                            onChange = {(e) => setName(e.target.value)}
                            className = "w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
                        />
                        <p className="mt-1.5 text-xs text-slate-500 font-mono">{cardLabel}</p>
                    </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
              Course &amp; Type
            </label>
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 p-2.5">
              {editingClassification ? (
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <CourseSelect
                    courses={courses}
                    value={course}
                    onChange={setCourse}
                    onCourseCreated={onCourseCreated}
                  />
                  <div>
                    <Select
                      ariaLabel="Task type"
                      value={typeOverride}
                      onChange={setTypeOverride}
                      options={[
                        { value: "", label: `Auto (${autoTypeCode})` },
                        { value: "HW", label: "HW" },
                        { value: "R", label: "R (Reading)" },
                        { value: "EXAM", label: "EXAM" },
                        { value: "TODO", label: "TODO" },
                      ]}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-indigo-500"
                    />
                  </div>
                </div>
              ) : (
                <p className="flex-1 text-sm text-slate-300">
                  <span className="font-semibold">{course || "General"}</span>
                  <span className="text-slate-500"> · </span>
                  {effectiveTypeCode}
                </p>
              )}
              <Tooltip label={editingClassification ? "Done editing course/type" : "Change course or type"}>
                <button
                  type="button"
                  onClick={() => setEditingClassification((editing) => !editing)}
                  className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  {editingClassification ? "Done" : "✎ Edit"}
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Due Date
              </label>
              <DatePicker
                value={due}
                onChange={setDue}
                ariaLabel="Due date"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-indigo-500 color-scheme-dark"
              />
            </div>

            <DueTimeField value={dueTime} onChange={setDueTime} />

            <StartDateField value={start} onChange={setStart} />

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
                Status
              </label>
              <Select
                ariaLabel="Status"
                value={status}
                onChange={(next) => setStatus(next as TaskStatus)}
                options={[
                  { value: "not_started", label: "Not Started" },
                  { value: "in_progress", label: "In Progress" },
                  { value: "completed", label: "Done" },
                ]}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:border-indigo-500"
              />
            </div>
          </div>

          {isRecurringOccurrence && recurringTaskRule && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800/60 p-2.5 text-sm">
              <span className="text-slate-300">🔁 {describeRecurrenceRule(recurringTaskRule)}</span>
              <button
                type="button"
                onClick={() => onManageSeries(task.recurrenceId as string)}
                className="shrink-0 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Manage series
              </button>
            </div>
          )}

          {isCustomTask && !isRecurringOccurrence && (
            <RecurrenceField value={recurrence} onChange={setRecurrence} anchorDue={due} />
          )}

          {typeof estimatedMinutes === "number" && (
            <p className="text-xs text-slate-400">
              <span className="font-semibold text-slate-300">Estimated time:</span>{" "}
              {formatEstimatedMinutes(estimatedMinutes)}
            </p>
          )}

          {startAfterDue && (
            <p className="text-xs font-medium text-rose-400">
              Start date can&apos;t be after the due date.
            </p>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 uppercase tracking-wider">
              Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this task..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
            />
          </div>

          <div className="flex justify-between items-center mt-4 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={() => {
                if (isRecurringOccurrence) {
                  setPendingAction({ kind: "delete" });
                  return;
                }
                onDeleteTask(task.id);
                onClose();
              }}
              className="px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-all"
            >
              Delete Task
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={startAfterDue || recurrenceInvalid}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md shadow-indigo-950 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
