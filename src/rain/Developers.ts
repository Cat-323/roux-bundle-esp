import { developer } from "@plugins/types";

const devs = {
    CatMain: {
        name: "Roux",
        id: 532237759851528192n,
    },
    CatAlt: {
        name: "Mr cat",
        id: 793224680231665674n,
    }
} satisfies Record<string, developer>;

const contribs = {
    Tester1: {
        name: "🐾Ari🐾",
        id: 1466486111588057381n,
    },
    Tester2: {
        name: "𝕭𝖚𝖈𝖆𝖗𝖊𝖑𝖎 𝟜𝟟𝟛",
        id: 1187280817551069198n,
    }
} satisfies Record<string, developer>;

// Proxy de seguridad: si Developers.tsx busca una clave vieja (ej. "cocobo1"), 
// devuelve tu cuenta principal en lugar de undefined para evitar el crash.
export const Developers: Record<string, developer> = new Proxy(devs as any, {
    get(target, prop: string) {
        if (prop in target) return target[prop];
        return target.CatMain;
    }
});

export const Contributors: Record<string, developer> = new Proxy(contribs as any, {
    get(target, prop: string) {
        if (prop in target) return target[prop];
        return target.Tester1;
    }
});
