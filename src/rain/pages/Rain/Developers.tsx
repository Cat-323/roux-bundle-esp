import { findAssetId } from "@api/assets";
import { resolveSemanticColor, semanticColors } from "@api/ui/components/color";
import { Strings } from "@i18n";
import { lazyDestructure } from "@lib/utils/lazy";
import { findByName, findByProps } from "@metro";
import { FluxUtils } from "@metro/common";
import { Card, Stack, TableRow, TableRowGroup, Text } from "@metro/common/components";
import { UserStore } from "@metro/common/stores";
import { developer } from "@plugins/types";
import { Contributors, Developers } from "@rain/Developers";
import { useMemo } from "react";
import { Image, ScrollView, View } from "react-native";

const showUserProfileActionSheet = findByName("showUserProfileActionSheet");
const { getUser: maybeFetchUser } = lazyDestructure(() => findByProps("getUser", "fetchProfile"));

type Credit = {
    name: string;
    role: string;
    dev?: developer;
};

// Se vinculan tus cuentas principales y las de los testers
const developers: Credit[] = [
    { name: "Roux", role: "Desarrollador Principal", dev: (Developers as any)?.CatMain },
    { name: "Mr cat", role: "Desarrollador", dev: (Developers as any)?.CatAlt }
].filter(d => Boolean(d.dev));

const testers: Credit[] = [
    { name: "🐾Ari🐾", role: "Tester", dev: (Contributors as any)?.Tester1 },
    { name: "𝕭𝖚𝖈𝖆𝖗𝖊𝖑𝖎 𝟜𝟟𝟛", role: "Tester", dev: (Contributors as any)?.Tester2 }
].filter(d => Boolean(d.dev));

const getUserId = (dev?: developer): string | null => {
    if (!dev?.id) return null;
    return String(dev.id).replace(/n$/, "");
};

export default function DevelopersPage() {
    const handleProfilePress = (dev?: developer) => {
        const id = getUserId(dev);
        if (id) {
            try {
                showUserProfileActionSheet({ userId: id });
            } catch (e) {
                console.error("Error al abrir perfil:", e);
            }
        }
    };

    const allCredits = useMemo(() => [...developers, ...testers], []);

    // Consulta y resolución dinámica de perfiles desde la caché de Discord
    const userMap: Record<string, any> = FluxUtils.useStateFromStoresArray([UserStore], () => {
        const mapped: Record<string, any> = {};
        for (const item of allCredits) {
            const id = getUserId(item.dev);
            if (id) {
                try {
                    maybeFetchUser?.(id);
                } catch {}
                mapped[id] = UserStore.getUser(id);
            }
        }
        return [mapped];
    })[0] || {};

    const getDiscordAvatar = (user: any): string | undefined => {
        if (!user?.avatar) return undefined;
        return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`;
    };

    const getDisplayName = (item: Credit, user: any): string => {
        return user?.globalName || user?.username || item.name;
    };

    return (
        <ScrollView style={{ flex: 1 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                {/* Cuadro de Desarrolladores */}
                <TableRowGroup title="Desarrolladores">
                    {developers.map(devItem => {
                        const id = getUserId(devItem.dev);
                        const discordUser = id ? userMap[id] : null;
                        const avatarUrl = getDiscordAvatar(discordUser);
                        const displayName = getDisplayName(devItem, discordUser);

                        return (
                            <TableRow
                                key={id || devItem.name}
                                label={displayName}
                                subLabel={devItem.role}
                                icon={
                                    avatarUrl ? (
                                        <Image
                                            source={{ uri: avatarUrl }}
                                            style={{
                                                width: 48,
                                                height: 48,
                                                borderRadius: 24,
                                            }}
                                        />
                                    ) : undefined
                                }
                                onPress={() => handleProfilePress(devItem.dev)}
                                arrow
                            />
                        );
                    })}
                </TableRowGroup>

                {/* Cuadro de Testers */}
                {testers.length > 0 && (
                    <TableRowGroup title="Testers">
                        {testers.map(testerItem => {
                            const id = getUserId(testerItem.dev);
                            const discordUser = id ? userMap[id] : null;
                            const avatarUrl = getDiscordAvatar(discordUser);
                            const displayName = getDisplayName(testerItem, discordUser);

                            return (
                                <TableRow
                                    key={id || testerItem.name}
                                    label={displayName}
                                    subLabel={testerItem.role}
                                    icon={
                                        avatarUrl ? (
                                            <Image
                                                source={{ uri: avatarUrl }}
                                                style={{
                                                    width: 48,
                                                    height: 48,
                                                    borderRadius: 24,
                                                }}
                                            />
                                        ) : undefined
                                    }
                                    onPress={() => handleProfilePress(testerItem.dev)}
                                    arrow
                                />
                            );
                        })}
                    </TableRowGroup>
                )}
            </Stack>
        </ScrollView>
    );
}
