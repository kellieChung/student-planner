"use client";

import * as AlertDialog from "@radix-ui/react-alert-dialog";

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
};

// Replaces window.confirm(): same yes/no question, but themed, focus-trapped,
// and Escape/Cancel both mean "no".
export default function ConfirmDialog({
    open,
    onOpenChange,
    title,
    description,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    onConfirm,
}: Props) {
    return (
        <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
            <AlertDialog.Portal>
                <AlertDialog.Overlay className="lodestar-dialog-overlay" />
                <AlertDialog.Content className="lodestar-dialog">
                    <AlertDialog.Title className="lodestar-dialog-title">{title}</AlertDialog.Title>
                    {description && (
                        <AlertDialog.Description className="lodestar-dialog-description">{description}</AlertDialog.Description>
                    )}
                    <div className="lodestar-dialog-actions">
                        <AlertDialog.Cancel className="lodestar-dialog-cancel">{cancelLabel}</AlertDialog.Cancel>
                        <AlertDialog.Action className="lodestar-dialog-confirm" onClick={onConfirm}>
                            {confirmLabel}
                        </AlertDialog.Action>
                    </div>
                </AlertDialog.Content>
            </AlertDialog.Portal>
        </AlertDialog.Root>
    );
}
