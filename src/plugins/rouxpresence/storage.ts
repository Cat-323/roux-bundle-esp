import { createPluginStore } from "@api/storage";

export interface RouxPresenceSettings {
    enabled: boolean;
    syncGames: boolean;
    syncMedia: boolean;
    showTimestamps: boolean;
    _connected?: boolean;
    _lastActivityName?: string;
    _lastActivityType?: number;
}

export const DEFAULT_APP_ID = "1083738096238628954";

export const {
    useStore: useRouxPresenceSettings,
    settings: rouxPresenceSettings,
} = createPluginStore<RouxPresenceSettings>("rouxpresence", {
    enabled: true,
    syncGames: true,
    syncMedia: true,
    showTimestamps: true,
    _connected: false,
    _lastActivityName: "",
    _lastActivityType: -1,
});