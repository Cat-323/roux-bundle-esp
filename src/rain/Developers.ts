import { developer } from "@plugins/types";

export const Developers = {
    CatMain: {
        name: "Roux",
        id: 532237759851528192n,
    },
    CatAlt: {
        name: "Mr cat",
        id: 793224680231665674n,
    }
} satisfies Record<string, developer>;

export const Contributors = {
    Tester1: {
        name: "🐾Ari🐾",
        id: 1466486111588057381n,
    },
    Tester2: {
        name: "𝕭𝖚𝖈𝖆𝖗𝖊𝖑𝖎 𝟜𝟟𝟛",
        id: 1187280817551069198n,
    }
} satisfies Record<string, developer>;

// En lugar de devolver siempre a Roux/Ari, devolvemos un objeto neutro con el nombre de la clave
// para que no se duplique tu nombre en plugins ajenos
export const getDeveloper = (key: string): developer => {
    if (key in Developers) return Developers[key as keyof typeof Developers];
    return { name: key, id: 0n };
};
