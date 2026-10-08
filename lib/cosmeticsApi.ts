import type { CosmeticItemView, CosmeticSlot } from "@/lib/cosmetics";

// Client calls for /api/cosmetics (Star Chart beta).

export type CosmeticsState = {
    items: CosmeticItemView[];
    owned: string[];
    loadout: Record<CosmeticSlot, string>;
};

type Failure = { ok: false; error: string };

const OFFLINE = "Couldn't reach the Nebula. Check your connection and try again.";

export async function getCosmetics(): Promise<CosmeticsState | null> {
    try {
        const response = await fetch("/api/cosmetics");
        if (!response.ok) return null;

        const data = await response.json();
        return { items: data.items, owned: data.owned, loadout: data.loadout };
    } catch {
        return null;
    }
}

async function post<T>(body: Record<string, unknown>, fallback: string): Promise<({ ok: true } & T) | Failure> {
    try {
        const response = await fetch("/api/cosmetics", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
            return { ok: false, error: typeof data.error === "string" ? data.error : fallback };
        }

        return { ok: true, ...(data as T) };
    } catch {
        return { ok: false, error: OFFLINE };
    }
}

export type BuyCosmeticResult =
    | { ok: true; key: string; alreadyOwned: boolean; starlight: number | null; lifetimeStarlight: number | null }
    | Failure;

export function buyCosmetic(key: string): Promise<BuyCosmeticResult> {
    return post({ action: "buy", key }, "Couldn't buy that.");
}

export type EquipCosmeticResult = { ok: true; slot: CosmeticSlot; key: string } | Failure;

export function equipCosmetic(key: string): Promise<EquipCosmeticResult> {
    return post({ action: "equip", key }, "Couldn't equip that.");
}

export type RenameShipResult =
    | { ok: true; shipName: string; starlight: number; lifetimeStarlight: number; charged: number }
    | Failure;

export function renameShip(name: string): Promise<RenameShipResult> {
    return post({ action: "ship-name", name }, "Couldn't rename your ship.");
}
