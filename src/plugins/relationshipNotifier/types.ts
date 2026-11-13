export const ChannelTypes = {
    GROUP_DM: 3,
} as const;

export const RelationshipTypes = {
    FRIEND: 1,
    BLOCKED: 2,
    INCOMING_REQUEST: 3,
    OUTGOING_REQUEST: 4,
} as const;

export interface ChannelDelete {
    type: "CHANNEL_DELETE";
    channel: {
        id: string;
        type: number;
        name?: string;
    };
}

export interface GuildDelete {
    type: "GUILD_DELETE";
    guild: {
        id: string;
        unavailable?: boolean;
    };
}

export interface RelationshipRemove {
    type: "RELATIONSHIP_REMOVE";
    relationship: {
        id: string;
        nickname?: string;
        type: number;
    };
}

export interface SimpleGroupChannel {
    id: string;
    name: string;
    iconURL?: string;
}

export interface SimpleGuild {
    id: string;
    name: string;
    iconURL?: string;
}

export interface RelationshipNotifierSettings {
    offlineRemovals: boolean;
    friends: boolean;
    friendRequestCancels: boolean;
    servers: boolean;
    groups: boolean;
}

export interface UserSnapshot {
    guilds: Record<string, SimpleGuild>;
    groups: Record<string, SimpleGroupChannel>;
    friends: string[];
    requests: string[];
}