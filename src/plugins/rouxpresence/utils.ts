import { DEFAULT_APP_ID } from "./storage";

const PLACEHOLDER_ASSETS = new Set(["app_icon", "media_icon", "play_icon"]);

export interface RawActivityPayload {
    name?: string | null;
    state?: string | null;
    details?: string | null;
    type?: number | null;
    platform?: string | null;
    timestamps?: {
        start?: number | null;
        end?: number | null;
    } | null;
    assets?: {
        large_image?: string | null;
        large_text?: string | null;
        small_image?: string | null;
        small_text?: string | null;
    } | null;
    buttons?: Array<string | null> | null;
    metadata?: {
        button_urls?: Array<string | null> | null;
    } | null;
    application_id?: string | null;
    url?: string | null;
    flags?: number | null;
}

function isValid(val: unknown): boolean {
    if (val === false || val === 0) return true;
    if (val === null || val === undefined) return false;
    if (typeof val === "string") return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === "object") return Object.keys(val).length > 0;
    return true;
}

export function cloneAndFilter<T extends object>(obj: T): T {
    const filter = (key: PropertyKey, value: unknown) => {
        if (value === obj) return value;
        if (typeof key === "string" && key.startsWith("_")) return undefined;
        return isValid(value) ? value : undefined;
    };

    return JSON.parse(JSON.stringify(obj, filter));
}

function sanitizeAssetKey(key?: string | null): string | undefined {
    if (!key) return undefined;
    const trimmed = key.trim();
    if (!trimmed || PLACEHOLDER_ASSETS.has(trimmed)) return undefined;
    return trimmed;
}

export function buildDiscordActivity(raw: RawActivityPayload, showTimestamps: boolean): Record<string, any> | null {
    const name = raw.name?.trim();
    if (!name) return null;

    const activity: Record<string, any> = {
        name,
        application_id: raw.application_id?.trim() || DEFAULT_APP_ID,
        type: typeof raw.type === "number" ? raw.type : 0,
        flags: typeof raw.flags === "number" ? raw.flags : 0,
        details: raw.details,
        state: raw.state,
        platform: raw.platform,
        url: raw.url,
    };

    if (showTimestamps && raw.timestamps) {
        const ts: Record<string, number> = {};
        if (typeof raw.timestamps.start === "number" && raw.timestamps.start > 0) {
            ts.start = raw.timestamps.start;
        }
        if (typeof raw.timestamps.end === "number" && raw.timestamps.end > 0) {
            ts.end = raw.timestamps.end;
        }
        if (Object.keys(ts).length > 0) {
            activity.timestamps = ts;
        }
    }

    if (raw.assets) {
        const largeImage = sanitizeAssetKey(raw.assets.large_image);
        const smallImage = sanitizeAssetKey(raw.assets.small_image);
        const assets: Record<string, string> = {};

        if (largeImage) {
            assets.large_image = largeImage;
            if (raw.assets.large_text?.trim()) assets.large_text = raw.assets.large_text.trim();
        }
        if (smallImage) {
            assets.small_image = smallImage;
            if (raw.assets.small_text?.trim()) assets.small_text = raw.assets.small_text.trim();
        }

        if (Object.keys(assets).length > 0) {
            activity.assets = assets;
        }
    }

    if (Array.isArray(raw.buttons)) {
        const labels = raw.buttons.filter((b): b is string => typeof b === "string" && b.trim().length > 0);
        if (labels.length > 0) {
            activity.buttons = labels;
            const urls = raw.metadata?.button_urls?.filter((u): u is string => typeof u === "string" && u.trim().length > 0);
            if (urls && urls.length > 0) {
                activity.metadata = { button_urls: urls };
            }
        }
    }

    return cloneAndFilter(activity);
}