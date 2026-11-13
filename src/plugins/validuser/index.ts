import { after } from "@api/patcher";
import { findByProps, findByStoreName } from "@metro";
import { FluxDispatcher } from "@metro/common";
import { definePlugin } from "@plugins";

const UserStore = findByStoreName("UserStore");
const UserProfileStore = findByStoreName("UserProfileStore");
const RestAPI = findByProps("get", "post", "put", "patch", "del");
const Constants = findByProps("Endpoints", "UserFlags");

const badges: Record<string, { id: string; description: string; icon: string; link?: string }> = {
    active_developer: { id: "active_developer", description: "Active Developer", icon: "6bdc42827a38498929a4920da12695d9", link: "https://support-dev.discord.com/hc/en-us/articles/10113997751447" },
    bug_hunter_level_1: { id: "bug_hunter_level_1", description: "Discord Bug Hunter", icon: "2717692c7dca7289b35297368a940dd0", link: "https://support.discord.com/hc/en-us/articles/360046057772-Discord-Bugs" },
    bug_hunter_level_2: { id: "bug_hunter_level_2", description: "Discord Bug Hunter", icon: "848f79194d4be5ff5f81505cbd0ce1e6", link: "https://support.discord.com/hc/en-us/articles/360046057772-Discord-Bugs" },
    certified_moderator: { id: "certified_moderator", description: "Moderator Programs Alumni", icon: "fee1624003e2fee35cb398e125dc479b", link: "https://discord.com/safety" },
    discord_employee: { id: "staff", description: "Discord Staff", icon: "5e74e9b61934fc1f67c65515d1f7e60d", link: "https://discord.com/company" },
    get staff() { return this.discord_employee; },
    hypesquad: { id: "hypesquad", description: "HypeSquad Events", icon: "bf01d1073931f921909045f3a39fd264", link: "https://discord.com/hypesquad" },
    hypesquad_online_house_1: { id: "hypesquad_house_1", description: "HypeSquad Bravery", icon: "8a88d63823d8a71cd5e390baa45efa02", link: "https://discord.com/settings/hypesquad-online" },
    hypesquad_online_house_2: { id: "hypesquad_house_2", description: "HypeSquad Brilliance", icon: "011940fd013da3f7fb926e4a1cd2e618", link: "https://discord.com/settings/hypesquad-online" },
    hypesquad_online_house_3: { id: "hypesquad_house_3", description: "HypeSquad Balance", icon: "3aa41de486fa12454c3761e8e223442e", link: "https://discord.com/settings/hypesquad-online" },
    partner: { id: "partner", description: "Partnered Server Owner", icon: "3f9748e53446a137a052f3454e2de41e", link: "https://discord.com/partners" },
    premium: { id: "premium", description: "Subscriber", icon: "2ba85e8026a8614b640c2837bcdfe21b", link: "https://discord.com/settings/premium" },
    premium_early_supporter: { id: "early_supporter", description: "Early Supporter", icon: "7060786766c9c840eb3019e725d2b358", link: "https://discord.com/settings/premium" },
    verified_developer: { id: "verified_developer", description: "Early Verified Bot Developer", icon: "6df5892e0f35b051f8b61eace34f4967" },
};

const fetching = new Set<string>();
const attempted = new Set<string>();
const queue: Array<() => Promise<void>> = [];
let processingQueue = false;
let unpatches: (() => void)[] = [];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function processQueue() {
    if (processingQueue) return;
    processingQueue = true;

    while (queue.length > 0) {
        const task = queue.shift();
        if (task) {
            await task();
            await sleep(300);
        }
    }

    processingQueue = false;
}

async function getUser(id: string) {
    const cached = UserStore?.getUser?.(id);
    if (cached) return cached;
    if (fetching.has(id)) return;

    fetching.add(id);

    try {
        const url = Constants?.Endpoints?.USER ? Constants.Endpoints.USER(id) : `/users/${id}`;
        const response = await RestAPI.get({ url });
        const user = response?.body;
        if (!user) return;

        FluxDispatcher.dispatch({
            type: "USER_UPDATE",
            user,
        });

        FluxDispatcher.dispatch({
            type: "USER_PROFILE_FETCH_FAILURE",
            userId: id,
        });

        const userObj = UserStore?.getUser?.(id);
        const UserFlags = (Constants?.UserFlags ?? {}) as Record<string, number>;
        const fakeBadges = Object.entries(UserFlags)
            .filter(([_, flag]) => !isNaN(flag) && userObj?.hasFlag?.(flag))
            .map(([key]) => badges[key.toLowerCase()])
            .filter(Boolean);

        if (user.premium_type || (!user.bot && (user.banner || user.avatar?.startsWith?.("a_")))) {
            fakeBadges.push(badges.premium);
        }

        const profile = UserProfileStore?.getUserProfile?.(id);
        if (profile) {
            profile.accentColor = user.accent_color;
            profile.badges = fakeBadges;
            profile.banner = user.banner;
            profile.premiumType = user.premium_type;
        }

        return userObj;
    } catch (e: any) {
        if (e?.status === 429) {
            const retryAfter = (e?.body?.retry_after ?? 1) * 1000;
            await sleep(retryAfter);
            fetching.delete(id);
            enqueueUser(id);
            return;
        }
    } finally {
        fetching.delete(id);
    }
}

function enqueueUser(id: string) {
    if (!id || !/^\d{17,20}$/.test(id)) return;
    if (UserStore?.getUser?.(id) || fetching.has(id) || attempted.has(id)) return;

    attempted.add(id);
    queue.push(() => getUser(id).then(() => {}));
    processQueue();
}

function scanMessageMentions(msg: any) {
    if (!msg) return;
    const texts = [msg.content, msg.referenced_message?.content];
    for (const text of texts) {
        if (typeof text !== "string") continue;
        for (const match of text.matchAll(/<@!?(\d{17,20})>/g)) {
            if (match[1]) enqueueUser(match[1]);
        }
    }
}

function onMessageEvent(event: any) {
    scanMessageMentions(event?.message);
}

function onLoadMessages(event: any) {
    if (!Array.isArray(event?.messages)) return;
    for (const msg of event.messages) {
        scanMessageMentions(msg);
    }
}

export default definePlugin({
    name: "ValidUser",
    description: "Corrige las menciones de usuarios desconocidos que aparecen como '@unknown-user'",
    author: [{ name: "Ven" }, { name: "Dolfies" }],
    id: "validuser",
    version: "1.0.0",
    start() {
        if (UserStore?.getUser) {
            unpatches.push(
                after("getUser", UserStore, ([id], res) => {
                    if (!res && typeof id === "string" && /^\d{17,20}$/.test(id)) {
                        setTimeout(() => enqueueUser(id), 0);
                    }
                })
            );
        }

        FluxDispatcher.subscribe("MESSAGE_CREATE", onMessageEvent);
        FluxDispatcher.subscribe("MESSAGE_UPDATE", onMessageEvent);
        FluxDispatcher.subscribe("LOAD_MESSAGES_SUCCESS", onLoadMessages);
    },
    stop() {
        for (const unpatch of unpatches) {
            unpatch?.();
        }
        unpatches = [];

        FluxDispatcher.unsubscribe("MESSAGE_CREATE", onMessageEvent);
        FluxDispatcher.unsubscribe("MESSAGE_UPDATE", onMessageEvent);
        FluxDispatcher.unsubscribe("LOAD_MESSAGES_SUCCESS", onLoadMessages);

        fetching.clear();
        attempted.clear();
        queue.length = 0;
    },
});
