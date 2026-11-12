import { findAssetId } from "@api/assets";
import { showToast } from "@api/ui/toasts";
import { Stack, TableRow, TableRowGroup, TableSwitchRow } from "@metro/common/components";
import { isPluginEnabled } from "@plugins";
import { ScrollView } from "react-native";

import { reconnectNow } from "./index";
import { useRouxPresenceSettings } from "./storage";

function formatDetectedActivity(name?: string, type?: number): string {
    if (!name) return "En línea — Esperando música o juegos activos";
    const prefix = type === 2 ? "Escuchando" : type === 3 ? "Viendo" : "Jugando";
    return `${prefix}: ${name}`;
}

export default function Settings() {
    const settings = useRouxPresenceSettings();
    const isConnected = !!settings._connected;
    const manualRpcActive = isPluginEnabled("richpresence");

    return (
        <ScrollView style={{ flex: 1 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                {manualRpcActive && (
                    <TableRowGroup title="Aviso">
                        <TableRow
                            label="RichPresence manual está activo"
                            subLabel="Desactívalo si notas estados duplicados en tu perfil"
                        />
                    </TableRowGroup>
                )}

                <TableRowGroup title="Puente RouxManager">
                    <TableSwitchRow
                        label="Sincronización en Vivo"
                        subLabel={
                            isConnected
                                ? "Conectado a RouxManager (127.0.0.1:9099)"
                                : "Bloqueado: Abre RouxManager y activa el puente local"
                        }
                        value={isConnected && settings.enabled}
                        disabled={!isConnected}
                        onValueChange={(v: boolean) => {
                            if (isConnected) settings.updateSettings({ enabled: v });
                        }}
                    />
                    <TableRow
                        label="Estado del Servidor Local"
                        subLabel={
                            isConnected
                                ? formatDetectedActivity(settings._lastActivityName, settings._lastActivityType)
                                : "Desconectado — Esperando servicio en puerto 9099"
                        }
                    />
                    {!isConnected && (
                        <TableRow
                            label="Reintentar conexión ahora"
                            subLabel="Busca el servidor WebSocket de RouxManager"
                            trailing={() => <TableRow.Arrow />}
                            onPress={() => {
                                reconnectNow();
                                showToast("Buscando RouxManager...", findAssetId("RefreshIcon"));
                            }}
                        />
                    )}
                </TableRowGroup>

                <TableRowGroup title="Filtros de Actividad">
                    <TableSwitchRow
                        label="Juegos y Aplicaciones"
                        subLabel="Muestra en tu perfil la app o juego que tienes abierto"
                        value={settings.syncGames}
                        disabled={!isConnected}
                        onValueChange={(v: boolean) => {
                            if (isConnected) settings.updateSettings({ syncGames: v });
                        }}
                    />
                    <TableSwitchRow
                        label="Música y Multimedia"
                        subLabel="Muestra canciones de YouTube Music, Spotify y reproductores"
                        value={settings.syncMedia}
                        disabled={!isConnected}
                        onValueChange={(v: boolean) => {
                            if (isConnected) settings.updateSettings({ syncMedia: v });
                        }}
                    />
                    <TableSwitchRow
                        label="Mostrar tiempo transcurrido"
                        subLabel="Incluye el contador de duración en la tarjeta de actividad"
                        value={settings.showTimestamps}
                        disabled={!isConnected}
                        onValueChange={(v: boolean) => {
                            if (isConnected) settings.updateSettings({ showTimestamps: v });
                        }}
                    />
                </TableRowGroup>
            </Stack>
        </ScrollView>
    );
}