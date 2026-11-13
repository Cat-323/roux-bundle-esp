import { ChannelDelete, ChannelTypes, GuildDelete, RelationshipRemove, RelationshipTypes } from "./types";
import {
    deleteGroup,
    deleteGuild,
    formatUniqueUsername,
    getGroup,
    getGuild,
    getSettings,
    GuildAvailabilityStore,
    notify,
    resolveUser,
} from "./utils";

let manuallyRemovedFriend: string | undefined;
let manuallyRemovedGuild: string | undefined;
let manuallyRemovedGroup: string | undefined;

export const removeFriend = (id: string) => {
    manuallyRemovedFriend = id;
    setTimeout(() => {
        if (manuallyRemovedFriend === id) manuallyRemovedFriend = undefined;
    }, 5000);
};

export const removeGuild = (id: string) => {
    manuallyRemovedGuild = id;
    setTimeout(() => {
        if (manuallyRemovedGuild === id) manuallyRemovedGuild = undefined;
    }, 5000);
};

export const removeGroup = (id: string) => {
    manuallyRemovedGroup = id;
    setTimeout(() => {
        if (manuallyRemovedGroup === id) manuallyRemovedGroup = undefined;
    }, 5000);
};

export async function onRelationshipRemove({ relationship: { type, id } }: RelationshipRemove) {
    if (manuallyRemovedFriend === id) {
        manuallyRemovedFriend = undefined;
        return;
    }

    const cfg = getSettings();
    const user = await resolveUser(id);
    const label = formatUniqueUsername(user, id);

    switch (type) {
        case RelationshipTypes.FRIEND:
            if (cfg.friends) {
                notify(`${label} te eliminó de amigos.`);
            }
            break;
        case RelationshipTypes.INCOMING_REQUEST:
            if (cfg.friendRequestCancels) {
                notify(`Se canceló o rechazó la solicitud de amistad de ${label}.`);
            }
            break;
    }
}

export function onGuildDelete({ guild: { id, unavailable } }: GuildDelete) {
    if (!getSettings().servers) return;
    if (unavailable || GuildAvailabilityStore?.isUnavailable?.(id)) return;

    if (manuallyRemovedGuild === id) {
        deleteGuild(id);
        manuallyRemovedGuild = undefined;
        return;
    }

    const guild = getGuild(id);
    if (guild) {
        deleteGuild(id);
        notify(`Te expulsaron o se eliminó el servidor ${guild.name}.`);
    }
}

export function onChannelDelete({ channel: { id, type } }: ChannelDelete) {
    if (!getSettings().groups) return;
    if (type !== ChannelTypes.GROUP_DM) return;

    if (manuallyRemovedGroup === id) {
        deleteGroup(id);
        manuallyRemovedGroup = undefined;
        return;
    }

    const group = getGroup(id);
    if (group) {
        deleteGroup(id);
        notify(`Te sacaron o se cerró el grupo ${group.name}.`);
    }
}