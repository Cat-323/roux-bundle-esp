import { developer } from "@plugins/types";

const rawDevelopers: Record<string, developer> = {
    // Tus cuentas
    CatMain: { name: "Roux", id: 532237759851528192n },
    CatAlt: { name: "Mr cat", id: 793224680231665674n },

    // Desarrolladores base
    cocobo1: { name: "cocobo1", id: 767650984175992833n },
    j: { name: "j", id: 1356632712861192242n },
    kmmiio99o: { name: "kmmiio99o", id: 879393496627306587n },
    reyyan1: { name: "reyyan1", id: 797034673846747158n },
    John: { name: "John", id: 780819226839220265n },
    Bwlok: { name: "Bwlok", id: 501827585806827520n },
    SerStars: { name: "SerStars", id: 861631850681729045n },
    Livie: { name: "Livie", id: 755950362342457384n },
};

const rawContributors: Record<string, developer> = {
    // Tus testers
    Tester1: { name: "🐾Ari🐾", id: 1466486111588057381n },
    Tester2: { name: "𝕭𝖚𝖈𝖆𝖗𝖊𝖑𝖎 𝟜𝟟𝟛", id: 1187280817551069198n },

    // Colaboradores base
    Rosie: { name: "Rosie", id: 1356936317501571214n },
    rico040: { name: "rico040", id: 619474349845643275n },
    redstonekasi: { name: "redstonekasi", id: 265064055490871297n },
    byeoon: { name: "byeoon", id: 1167275288036655133n },
    fres: { name: "fres", id: 843448897737064448n },
    palmdevs: { name: "palmdevs", id: 629368283354628116n },
    Narwhal: { name: "Narwhal", id: 455429792871874581n },
    nexpid: { name: "nexpid", id: 853550207039832084n },
    Awesomegamergame: { name: "Awesomegamergame", id: 504401951623086081n },
    sapphire: { name: "sapphire", id: 757982547861962752n },
    wolfie: { name: "wolfie", id: 347096063569559553n },
    cloudburst: { name: "cloudburst", id: 892128204150685769n },
    TrainingDummy: { name: "Training Dummy", id: 601137505739472908n },
    Lioncat6: { name: "Lioncat6", id: 917903273514663957n },
    Zykrah: { name: "Zykrah", id: 543614592291700748n },
    siguma: { name: "シグマ siguma", id: 737597276339437578n },
    pylix: { name: "pylix", id: 492949202121261067n },
    MSMA: { name: "MSMA", id: 307215253811363843n },
    TheSun: { name: "The Sun", id: 406028027768733696n },
    PurpleEye: { name: "Purple_Ξye™", id: 646535537334812682n },
    maisy: { name: "maisy", id: 257109471589957632n },
    Cynosphere: { name: "Cynosphere", id: 150745989836308480n },
    Acquite: { name: "Acquite", id: 581573474296791211n },
    chrysoljq: { name: "chrysoljq", id: 791663810594603028n },
    Vendicated: { name: "Vendicated", id: 343383572805058560n },
    Bwlok: { name: "Bwlok", id: 501827585806827520n },
    Fiery: { name: "Fiery", id: 890228870559698955n },
    jdev082: { name: "jdev082", id: 1038089405161807872n },
    LampDelivery: { name: "LampDelivery", id: 650805815623680030n },
    Axolotl_cpp: { name: "Axolotl.cpp", id: 1106563129023930428n },
    Vaiskiainen: { name: "vaiskiainen.", id: 1465743112428064955n },
    theunrealzaka: { name: "theunrealzaka", id: 1268335382118924406n },
    tralwdwd: { name: "tralwdwdd", id: 1278723517436788897n },
    thororen: { name: "thororen", id: 848339671629299742n },
    benjii: { name: "Benjii", id: 463702169443368970n },
    baxter: { name: "baxter.zip", id: 554042298053427211n }
};

function createSafeProxy(targetMap: Record<string, developer>, secondaryMap: Record<string, developer>) {
    return new Proxy(targetMap, {
        get(target, prop) {
            if (typeof prop !== "string") {
                return (target as any)[prop];
            }

            // Ignorar llamadas internas de React y bundlers
            if (
                prop === "$$typeof" ||
                prop === "toJSON" ||
                prop === "then" ||
                prop === "default" ||
                prop === "__esModule" ||
                prop === "constructor"
            ) {
                return (target as any)[prop];
            }

            // 1. Clave exacta en la tabla principal
            if (prop in target) return target[prop];

            // 2. Búsqueda insensible a mayúsculas/minúsculas en la tabla principal
            const lower = prop.toLowerCase();
            const foundTarget = Object.keys(target).find(k => k.toLowerCase() === lower);
            if (foundTarget) return target[foundTarget];

            // 3. Búsqueda cruzada (si pidieron en Developers algo que está en Contributors o viceversa)
            if (prop in secondaryMap) return secondaryMap[prop];
            const foundSecondary = Object.keys(secondaryMap).find(k => k.toLowerCase() === lower);
            if (foundSecondary) return secondaryMap[foundSecondary];

            // 4. Fallback seguro: devuelve un objeto con el nombre pedido para que NUNCA sea undefined
            return {
                name: prop,
                id: 0n
            };
        }
    });
}

export const Developers: Record<string, developer> = createSafeProxy(rawDevelopers, rawContributors);
export const Contributors: Record<string, developer> = createSafeProxy(rawContributors, rawDevelopers);
