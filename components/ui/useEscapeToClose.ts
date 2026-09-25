"use client";

import { useEffect, useRef } from "react";

// Escape closes a hand-rolled modal. Skipped while a Radix popup (Select,
// DatePicker, Tooltip) is open: Radix closes that popup on the same keypress,
// and the modal behind it should stay.
export default function useEscapeToClose(active: boolean, onClose: () => void) {
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (!active) return;

        function onKeyDown(event: KeyboardEvent) {
            if (event.key !== "Escape" || event.defaultPrevented) return;
            if (document.querySelector("[data-radix-popper-content-wrapper], [role='alertdialog']")) return;

            onCloseRef.current();
        }

        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [active]);
}
