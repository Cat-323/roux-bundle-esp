import { developer } from "@plugins/types";

// Resuelve dinámicamente el nombre y nick desde el UserStore de Discord
function getDiscordName(id: bigint, fallback: string): string {
    try {
        const idStr = id.toString();

        // Buscar en las interfaces de Metro inyectadas por el cliente
        const metro = 
            (globalThis as any).revenge?.metro ?? 
            (globalThis as any).rain?.metro ?? 
            (globalThis as any).vendetta?.metro;

        const UserStore = 
            metro?.findByProps?.("getUser", "getCurrentUser") ?? 
            metro?.findByStoreName?.("UserStore");

        if (UserStore) {
            const user = UserStore.getUser(idStr);
            if (user) {
                return user.globalName || user.username || fallback;
            }
        }

        // Intento directo desde el bundle si los módulos comunes están mapeados
        try {
            // @ts-ignore
            const userStoreModule = require("@lib/metro/common")?.UserStore;
            const user = userStoreModule?.getUser?.(idStr);
            if (user) return user.globalName || user.username || fallback;
        } catch {}

        // Solicita el perfil a la API en segundo plano si Discord aún no lo tiene en memoria
        const UserActions = metro?.findByProps?.("fetchProfile", "getUser");
        UserActions?.getUser?.(idStr);
    } catch {}

    return fallback;
}

export const Developers = {
    eduardoPrincipal: {
        get name() {
            return getDiscordName(532237759851528192n, "Eduardo Gabriel");
        },
        id: 532237759851528192n,
    },
    eduardoSecundaria: {
        get name() {
            return getDiscordName(793224680231665674n, "Eduardo Gabriel (Secundaria)");
        },
        id: 793224680231665674n,
    }
} satisfies Record<string, developer>;

export const Testers = {
    tester1: {
        get name() {
            return getDiscordName(1466486111588057381n, "Tester 1");
        },
        id: 1466486111588057381n,
    },
    tester2: {
        get name() {
            return getDiscordName(1187280817551069198n, "Tester 2");
        },
        id: 1187280817551069198n,
    }
} satisfies Record<string, developer>;

// Se enlaza también a Contributors para que aparezcan de inmediato en la interfaz
// sin que la app falle si Developers.tsx aún busca la lista de 'Contributors'.
export const Contributors = Testers;
