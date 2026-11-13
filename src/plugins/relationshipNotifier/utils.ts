import { createFileStorage, waitForHydration } from "@api/storage";
import { showToast } from "@api/ui/toasts";
import { findByProps, findByStoreName } from "@metro";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
    ChannelTypes,
    RelationshipNotifierSettings,
    RelationshipTypes,
    SimpleGroupChannel,
    SimpleGuild,
    UserSnapshot,
} from "./types";

export const UserStore = findByStoreName("UserStore");
export const GuildStore = findByStoreName("GuildStore");
export const GuildMemberStore = findByStoreName("GuildMemberStore");
export const GuildAvailabilityStore = findByStoreName("GuildAvailabilityStore");
export const ChannelStore = findByStoreName("ChannelStore");
export const RelationshipStore = findByStoreName("RelationshipStore");

const UserUtils = findByProps("getUser", "fetchCurrentUser");
const RestAPI = findByProps("get", "post", "put", "patch", "del");

interface RelationshipStorageState {
    settings: RelationshipNotifierSettings;
    snapshots: Record<string, UserSnapshot>;
    updateSetting: <K extends keyof RelationshipNotifierSettings>(key: K, value: RelationshipNotifierSettings[K]) => void;
    setSnapshot: (userId: string, snapshot: UserSnapshot) => void;
}

export const useRelationshipStore = create<RelationshipStorageState>()(
    persist(
        set => ({
            settings: {
                offlineRemovals: true,
                friends: true,
                friendRequestCancels: true,
                servers: true,
                groups: true,
            },
            snapshots: {},
            updateSetting: (key, value) =>
                set(state => ({
                    settings: { ...state.settings, [key]: value },
                })),
            setSnapshot: (userId, snapshot) =>
                set(state => ({
                    snapshots: { ...state.snapshots, [userId]: snapshot },
                })),
        }),
        {
            name: "relationship-notifier-storage",
            storage: createJSONStorage(() => createFileStorage("plugins/relationship-notifier.json")),
        }
    )
);

const guilds = new Map<string, SimpleGuild>();
const groups = new Map<string, SimpleGroupChannel>();
const friends = {
    friends: [] as string[],
    requests: [] as string[],
};

export function getSettings(): RelationshipNotifierSettings {
    return useRelationshipStore.getState().settings;
}

export function notify(text: string) {
    showToast(text);
}

export function formatUniqueUsername(user: any, fallbackId?: string): string {
    if (!user) return fallbackId ? `Usuario (${fallbackId})` : "Usuario desconocido";
    if (user.globalName && user.username) return `${user.globalName} (@${user.username})`;
    if (user.username) {
        return user.discriminator && user.discriminator !== "0"
            ? `${user.username}#${user.discriminator}`
            : `@${user.username}`;
    }
    return fallbackId ? `Usuario (${fallbackId})` : "Usuario desconocido";
}

export async function resolveUser(id: string): Promise<any | null> {
    const cached = UserStore?.getUser?.(id);
    if (cached) return cached;

    if (UserUtils?.getUser) {
        const fetched = await UserUtils.getUser(id).catch(() => null);
        if (fetched) return fetched;
    }

    if (RestAPI?.get) {
        const res = await RestAPI.get({ url: `/users/${id}` }).catch(() => null);
        if (res?.body) return res.body;
    }

    return null;
}

function persistCurrentUserSnapshot() {
    const me = UserStore?.getCurrentUser?.()?.id;
    if (!me) return;

    useRelationshipStore.getState().setSnapshot(me, {
        guilds: Object.fromEntries(guilds.entries()),
        groups: Object.fromEntries(groups.entries()),
        friends: [...friends.friends],
        requests: [...friends.requests],
    });
}

export function getGuild(id: string) {
    return guilds.get(id);
}

export function deleteGuild(id: string) {
    guilds.delete(id);
    syncGuilds();
}

export function syncGuilds() {
    const me = UserStore?.getCurrentUser?.()?.id;
    if (!me) return;

    guilds.clear();
    const allGuilds = GuildStore?.getGuilds?.() ?? {};
    for (const [id, guild] of Object.entries<any>(allGuilds)) {
        if (!guild?.name) continue;
        const isMember = GuildMemberStore?.isMember ? GuildMemberStore.isMember(id, me) : true;
        if (isMember) {
            guilds.set(id, {
                id,
                name: guild.name,
                iconURL: guild.icon ? `https://cdn.discordapp.com/icons/${id}/${guild.icon}.png` : undefined,
            });
        }
    }

    persistCurrentUserSnapshot();
}

export function getGroup(id: string) {
    return groups.get(id);
}

export function deleteGroup(id: string) {
    groups.delete(id);
    syncGroups();
}

export function syncGroups() {
    groups.clear();
    const channels = ChannelStore?.getSortedPrivateChannels?.() ?? [];

    for (const ch of channels) {
        if (ch?.type === ChannelTypes.GROUP_DM && ch?.id) {
            const fallbackName =
                ch.rawRecipients?.map((r: any) => r.username).join(", ") ||
                ch.recipients?.map((id: string) => UserStore?.getUser?.(id)?.username ?? id).join(", ") ||
                `Grupo (${ch.id})`;

            groups.set(ch.id, {
                id: ch.id,
                name: ch.name || fallbackName,
                iconURL: ch.icon ? `https://cdn.discordapp.com/channel-icons/${ch.id}/${ch.icon}.png` : undefined,
            });
        }
    }

    persistCurrentUserSnapshot();
}

export function syncFriends() {
    friends.friends = [];
    friends.requests = [];

    const mutableRels = RelationshipStore?.getMutableRelationships?.();
    if (mutableRels && typeof mutableRels[Symbol.iterator] === "function") {
        for (const [id, type] of mutableRels) {
            if (type === RelationshipTypes.FRIEND) friends.friends.push(id);
            else if (type === RelationshipTypes.INCOMING_REQUEST) friends.requests.push(id);
        }
    } else {
        const relsObj = RelationshipStore?.getRelationships?.() ?? {};
        for (const [id, type] of Object.entries(relsObj)) {
            if (type === RelationshipTypes.FRIEND) friends.friends.push(id);
            else if (type === RelationshipTypes.INCOMING_REQUEST) friends.requests.push(id);
        }
    }

    persistCurrentUserSnapshot();
}

export async function syncAndRunChecks() {
    await waitForHydration(useRelationshipStore);

    const me = UserStore?.getCurrentUser?.()?.id;
    if (!me) return;

    const oldSnapshot = useRelationshipStore.getState().snapshots[me];

    syncGuilds();
    syncGroups();
    syncFriends();

    const cfg = getSettings();
    if (!cfg.offlineRemovals || !oldSnapshot) return;

    if (cfg.groups) {
        for (const [id, group] of Object.entries(oldSnapshot.groups)) {
            if (!groups.has(id)) {
                notify(`Ya no estás en el grupo ${group.name}.`);
            }
        }
    }

    if (cfg.servers) {
        for (const [id, guild] of Object.entries(oldSnapshot.guilds)) {
            if (!guilds.has(id) && !GuildAvailabilityStore?.isUnavailable?.(id)) {
                notify(`Ya no estás en el servidor ${guild.name}.`);
            }
        }
    }

    if (cfg.friends && oldSnapshot.friends.length > 0) {
        for (const id of oldSnapshot.friends) {
            if (friends.friends.includes(id)) continue;

            const user = await resolveUser(id);
            notify(`Ya no eres amigo de ${formatUniqueUsername(user, id)}.`);
        }
    }

    if (cfg.friendRequestCancels && oldSnapshot.requests.length > 0) {
        for (const id of oldSnapshot.requests) {
            const currentRelType = RelationshipStore?.getRelationshipType?.(id);
            if (
                friends.requests.includes(id) ||
                [RelationshipTypes.FRIEND, RelationshipTypes.BLOCKED, RelationshipTypes.OUTGOING_REQUEST].includes(currentRelType)
            ) {
                continue;
            }

            const user = await resolveUser(id);
            notify(`La solicitud de amistad de ${formatUniqueUsername(user, id)} fue cancelada.`);
        }
    }
}

export function clearMemoryCaches() {
    guilds.clear();
    groups.clear();
    friends.friends = [];
    friends.requests = [];
}
