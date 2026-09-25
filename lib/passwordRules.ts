export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export type PasswordRule = {
    id: "length" | "uppercase" | "special";
    label: string;
    test: (password: string) => boolean;
};

// Kept free of Node imports (unlike lib/password.ts) so the sign-up form can
// run the same checks live that the server enforces.
export const PASSWORD_RULES: PasswordRule[] = [
    {
        id: "length",
        label: `At least ${MIN_PASSWORD_LENGTH} characters`,
        test: (password) => password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH,
    },
    { id: "uppercase", label: "One uppercase letter", test: (password) => /\p{Lu}/u.test(password) },
    { id: "special", label: "One special character, like ! or #", test: (password) => /[^\p{L}\p{N}\s]/u.test(password) },
];

export function passwordMeetsRules(password: string): boolean {
    return PASSWORD_RULES.every((rule) => rule.test(password));
}

export const PASSWORD_REQUIREMENTS_MESSAGE = `Password must be ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters and include an uppercase letter and a special character.`;
