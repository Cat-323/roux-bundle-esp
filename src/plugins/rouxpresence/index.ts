import { logger } from "@lib/utils/logger";
import { findByProps } from "@metro";
import { FluxDispatcher } from "@metro/common";
import { definePlugin } from "@plugins";
import { AppState, type AppStateStatus, type NativeEventSubscription } from "react-native";

import Settings from "./Settings";
import { useRouxPresenceSettings } from "./storage";
import { buildDiscordActivity, type RawActivityPayload } from "./utils";

const WS_URL = "ws://127.0.0.1:9099";
const SOCKET_ID = "RouxPresence@RouxCord";
const RECONNECT_DELAY_MS = 4000;

const assetManager = findByProps("getAssetIds", "fetchAssetIds");

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeStore: (() => void) | null = null;
let appStateSub: NativeEventSubscription | null = null;
let isRunning = false;
let lastRawPayload: string | null = null;

function clearDiscordActivity() {
    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: null,
        pid: 1608,
        socketId: SOCKET_ID,
    });
}

async function resolveAndDispatch(activity: Record<string, any>) {
    if (activity.assets && assetManager) {
        try {
            const args = [activity.application_id, [activity.assets.large_image, activity.assets.small_image]];
            let assetIds = assetManager.getAssetIds?.(...args) ?? [];
            if (!assetIds.length) {
                assetIds = (await assetManager.fetchAssetIds?.(...args)) ?? [];
            }
            if (assetIds[0]) activity.assets.large_image = assetIds[0];
            if (assetIds[1]) activity.assets.small_image = assetIds[1];
        } catch (e) {
            logger.error("[RouxPresence] Error resolviendo assets:", e);
        }
    }

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity,
        pid: 1608,
        socketId: SOCKET_ID,
    });
}

function syncCurrentPayload() {
    const state = useRouxPresenceSettings.getState();

    if (!lastRawPayload) {
        clearDiscordActivity();
        return;
    }

    try {
        const parsed = JSON.parse(lastRawPayload) as RawActivityPayload;
        const name = parsed?.name?.trim() || "";
        const type = typeof parsed?.type === "number" ? parsed.type : 0;

        if (state._lastActivityName !== name || state._lastActivityType !== type) {
            state.updateSettings({
                _lastActivityName: name,
                _lastActivityType: name ? type : -1,
            });
        }

        if (!name || !state.enabled) {
            clearDiscordActivity();
            return;
        }

        if (type === 2 && !state.syncMedia) {
            clearDiscordActivity();
            return;
        }

        if (type === 0 && !state.syncGames) {
            clearDiscordActivity();
            return;
        }

        const activity = buildDiscordActivity(parsed, state.showTimestamps);
        if (!activity) {
            clearDiscordActivity();
            return;
        }

        resolveAndDispatch(activity).catch(e => logger.error("[RouxPresence] Error al enviar presencia:", e));
    } catch (e) {
        logger.error("[RouxPresence] Payload JSON inválido:", e);
        clearDiscordActivity();
    }
}

function cleanupSocket() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        try {
            socket.close();
        } catch {}
        socket = null;
    }
}

function scheduleReconnect() {
    if (!isRunning || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectSocket();
    }, RECONNECT_DELAY_MS);
}

function connectSocket() {
    if (!isRunning) return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    cleanupSocket();

    try {
        const ws = new WebSocket(WS_URL);
        socket = ws;

        ws.onopen = () => {
            if (!isRunning || socket !== ws) return;
            logger.log("[RouxPresence] Conectado a RouxManager");
            useRouxPresenceSettings.getState().updateSettings({ _connected: true });
        };

        ws.onmessage = event => {
            if (!isRunning || socket !== ws) return;
            if (typeof event.data === "string") {
                lastRawPayload = event.data;
                syncCurrentPayload();
            }
        };

        ws.onclose = () => {
            if (socket !== ws) return;
            socket = null;
            lastRawPayload = null;
            useRouxPresenceSettings.getState().updateSettings({
                _connected: false,
                _lastActivityName: "",
                _lastActivityType: -1,
            });
            clearDiscordActivity();
            scheduleReconnect();
        };

        ws.onerror = () => {
            if (socket === ws) {
                try {
                    ws.close();
                } catch {}
            }
        };
    } catch {
        useRouxPresenceSettings.getState().updateSettings({ _connected: false });
        scheduleReconnect();
    }
}

export function reconnectNow() {
    if (!isRunning) return;
    cleanupSocket();
    connectSocket();
}

export default definePlugin({
    name: "RouxPresence",
    description: "Sincroniza tus juegos y música en tiempo real con RouxManager.",
    author: [{ name: "Eduardo Gabriel", id: "0" }],
    id: "rouxpresence",
    version: "1.0.0",
    start() {
        isRunning = true;
        lastRawPayload = null;

        useRouxPresenceSettings.getState().updateSettings({
            _connected: false,
            _lastActivityName: "",
            _lastActivityType: -1,
        });

        let prevPrefs = {
            enabled: useRouxPresenceSettings.getState().enabled,
            syncGames: useRouxPresenceSettings.getState().syncGames,
            syncMedia: useRouxPresenceSettings.getState().syncMedia,
            showTimestamps: useRouxPresenceSettings.getState().showTimestamps,
        };

        unsubscribeStore = useRouxPresenceSettings.subscribe(state => {
            const changed =
                state.enabled !== prevPrefs.enabled ||
                state.syncGames !== prevPrefs.syncGames ||
                state.syncMedia !== prevPrefs.syncMedia ||
                state.showTimestamps !== prevPrefs.showTimestamps;

            if (changed) {
                prevPrefs = {
                    enabled: state.enabled,
                    syncGames: state.syncGames,
                    syncMedia: state.syncMedia,
                    showTimestamps: state.showTimestamps,
                };
                syncCurrentPayload();
            }
        });

        appStateSub = AppState.addEventListener("change", (nextState: AppStateStatus) => {
            if (nextState === "active" && isRunning) {
                connectSocket();
            }
        });

        connectSocket();
    },
    stop() {
        isRunning = false;
        lastRawPayload = null;

        unsubscribeStore?.();
        unsubscribeStore = null;

        appStateSub?.remove();
        appStateSub = null;

        cleanupSocket();

        useRouxPresenceSettings.getState().updateSettings({
            _connected: false,
            _lastActivityName: "",
            _lastActivityType: -1,
        });
        clearDiscordActivity();
    },
    settings: Settings,
});