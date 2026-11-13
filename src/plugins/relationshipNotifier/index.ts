import { before } from "@api/patcher";
import { findByProps } from "@metro";
import { FluxDispatcher } from "@metro/common";
import { definePlugin } from "@plugins";

import {
    onChannelDelete,
    onGuildDelete,
    onRelationshipRemove,
    removeFriend,
    removeGroup,
    removeGuild,
} from "./functions";
import { clearMemoryCaches, syncAndRunChecks, syncFriends, syncGroups, syncGuilds } from "./utils";

let unpatches: (() => void)[] = [];
let startTimer: ReturnType<typeof setTimeout> | undefined;

function handleRelationshipRemoveEvent(e: any) {
    onRelationshipRemove(e);
    syncFriends();
}

export default definePlugin({
    name: "RelationshipNotifier",
    description: "Te avisa cuando un amigo te elimina, te sacan de un grupo o te expulsan de un servidor.",
    author: [{ name: "nick" }, { name: "Ven" }],
    id: "relationshipnotifier",
    version: "1.0.0",
    start() {
        const RelationshipActions = findByProps("removeRelationship");
        if (RelationshipActions?.removeRelationship) {
            unpatches.push(
                before("removeRelationship", RelationshipActions, ([userId]) => {
                    if (userId) removeFriend(userId);
                })
            );
        }

        const GuildActions = findByProps("leaveGuild");
        if (GuildActions?.leaveGuild) {
            unpatches.push(
                before("leaveGuild", GuildActions, ([guildId]) => {
                    if (guildId) removeGuild(guildId);
                })
            );
        }

        const ChannelActions = findByProps("closePrivateChannel");
        if (ChannelActions?.closePrivateChannel) {
            unpatches.push(
                before("closePrivateChannel", ChannelActions, ([channelId]) => {
                    if (channelId) removeGroup(channelId);
                })
            );
        }

        FluxDispatcher.subscribe("GUILD_CREATE", syncGuilds);
        FluxDispatcher.subscribe("GUILD_DELETE", onGuildDelete);
        FluxDispatcher.subscribe("CHANNEL_CREATE", syncGroups);
        FluxDispatcher.subscribe("CHANNEL_DELETE", onChannelDelete);
        FluxDispatcher.subscribe("RELATIONSHIP_ADD", syncFriends);
        FluxDispatcher.subscribe("RELATIONSHIP_UPDATE", syncFriends);
        FluxDispatcher.subscribe("RELATIONSHIP_REMOVE", handleRelationshipRemoveEvent);
        FluxDispatcher.subscribe("CONNECTION_OPEN", syncAndRunChecks);

        startTimer = setTimeout(() => {
            syncAndRunChecks();
        }, 5000);
    },
    stop() {
        if (startTimer) {
            clearTimeout(startTimer);
            startTimer = undefined;
        }

        for (const unpatch of unpatches) {
            unpatch?.();
        }
        unpatches = [];

        FluxDispatcher.unsubscribe("GUILD_CREATE", syncGuilds);
        FluxDispatcher.unsubscribe("GUILD_DELETE", onGuildDelete);
        FluxDispatcher.unsubscribe("CHANNEL_CREATE", syncGroups);
        FluxDispatcher.unsubscribe("CHANNEL_DELETE", onChannelDelete);
        FluxDispatcher.unsubscribe("RELATIONSHIP_ADD", syncFriends);
        FluxDispatcher.unsubscribe("RELATIONSHIP_UPDATE", syncFriends);
        FluxDispatcher.unsubscribe("RELATIONSHIP_REMOVE", handleRelationshipRemoveEvent);
        FluxDispatcher.unsubscribe("CONNECTION_OPEN", syncAndRunChecks);

        clearMemoryCaches();
    },
});