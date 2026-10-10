import { cookies } from "next/headers";
import {
    AGE_GATE_COOKIE,
    AGE_GATE_LOCKOUT_SECONDS,
    isAtLeastMinimumAge,
    parseBirthMonthYear,
    UNDERAGE_MESSAGE,
} from "@/lib/legal";
import { getTodayString } from "@/lib/utils";

export type AgeGateFailure = { error: string; underage?: boolean };

// Shared by sign-up and /accept-terms. Returns null when the person may continue.
export async function checkAgeGate(formData: FormData): Promise<AgeGateFailure | null> {
    const cookieStore = await cookies();

    if (cookieStore.get(AGE_GATE_COOKIE)) {
        return { error: UNDERAGE_MESSAGE, underage: true };
    }

    const today = getTodayString();
    const birth = parseBirthMonthYear(formData.get("birthMonth"), formData.get("birthYear"), today);

    if (!birth) {
        return { error: "Enter your date of birth." };
    }

    if (!isAtLeastMinimumAge(birth, today)) {
        cookieStore.set(AGE_GATE_COOKIE, "1", {
            httpOnly: true,
            sameSite: "lax",
            secure: process.env.NODE_ENV === "production",
            path: "/",
            maxAge: AGE_GATE_LOCKOUT_SECONDS,
        });

        return { error: UNDERAGE_MESSAGE, underage: true };
    }

    return null;
}
