import { findAssetId } from "@api/assets";
import { getDebugInfo } from "@api/debug";
import { BundleUpdaterManager } from "@api/native/modules";
import UpdateModule from "@api/native/modules/update";
import { useLoaderConfig, useSettings } from "@api/settings";
import { openAlert } from "@api/ui/alerts";
import { RainIcon } from "@assets";
import { Strings } from "@i18n";
import { AlertActionButton, AlertActions, AlertModal, Button, Stack, TableRow, TableRowGroup } from "@metro/common/components";
import { supportedVersionsAndroid, supportedVersionsIOS } from "rain-build-info";
import { useEffect, useState } from "react";
import { Linking, Platform, ScrollView, View } from "react-native";

const ROUX_REPO = "Cat-323/roux-bundle-esp";
export const ROUX_REPO_URL = `https://github.com/${ROUX_REPO}`;
export const ROUX_RELEASES_URL = `${ROUX_REPO_URL}/releases/latest`;
export const ROUX_LATEST_RELEASE_API = `https://api.github.com/repos/${ROUX_REPO}/releases/latest`;
const ROUX_RELEASES_BASE = `${ROUX_REPO_URL}/releases/`;

const GITHUB_HEADERS = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
};

interface GitHubAsset {
    name: string;
    browser_download_url: string;
}

interface GitHubRelease {
    tag_name?: string;
    name?: string;
    assets?: GitHubAsset[];
}

let _setIsChecking: ((v: boolean) => void) | null = null;

function usesForeignCustomBundle(): boolean {
    const customLoadUrl = useLoaderConfig.getState().customLoadUrl;
    if (!customLoadUrl?.enabled) return false;

    const url = customLoadUrl.url;
    const isRouxRelease = typeof url === "string" && url.toLowerCase().startsWith(ROUX_RELEASES_BASE.toLowerCase());
    return !isRouxRelease;
}

function parseVersion(version: unknown): [number, number, number] | null {
    if (typeof version !== "string") return null;
    const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function extractCleanVersion(version: unknown): string | null {
    if (typeof version !== "string") return null;
    const match = version.match(/(\d+\.\d+\.\d+)/);
    return match ? match[1] : null;
}

function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
    const remote = parseVersion(remoteVersion);
    const current = parseVersion(currentVersion);
    if (!remote || !current) return false;

    for (let i = 0; i < 3; i++) {
        if (remote[i] !== current[i]) return remote[i] > current[i];
    }
    return false;
}

async function fetchLatestRemoteVersion(): Promise<string | null> {
    const response = await fetch(ROUX_LATEST_RELEASE_API, { headers: GITHUB_HEADERS });
    if (!response.ok) throw new Error(`GitHub API respondió ${response.status}`);

    const release: GitHubRelease = await response.json();

    const infoAsset = release.assets?.find(asset => asset.name === "info.json");
    if (infoAsset) {
        try {
            const info = await (await fetch(infoAsset.browser_download_url)).json();
            const cleanInfoVer = extractCleanVersion(info?.version);
            if (cleanInfoVer) return cleanInfoVer;
        } catch (e) {
            console.warn("No se pudo leer info.json del release:", e);
        }
    }

    for (const candidate of [release.name, release.tag_name]) {
        const clean = extractCleanVersion(candidate);
        if (clean) return clean;
    }

    return null;
}

export async function downloadUpdate() {
    if (!_setIsChecking) return;

    try {
        _setIsChecking(true);

        await UpdateModule.nativeBundleClear();
        await UpdateModule.nativeDownload();

        openAlert(
            "rain-update-restart-alert",
            <AlertModal
                title={Strings.RELOAD_DISCORD}
                content={Strings.UPDATE_RESTART_MESSAGE}
                actions={
                    <AlertActions>
                        <AlertActionButton
                            text={Strings.RESTART_NOW}
                            variant="primary"
                            onPress={() => {
                                BundleUpdaterManager.reload();
                            }}
                        />
                        <AlertActionButton text={Strings.RESTART_LATER} variant="secondary" />
                    </AlertActions>
                }
            />,
        );
    } catch (error) {
        console.error("Failed to download update bundle:", error);
    } finally {
        _setIsChecking(false);
    }
}

export function checkForUpdate() {
    const [hasUpdate, setHasUpdate] = useState(false);

    useEffect(() => {
        if (usesForeignCustomBundle()) return;

        let cancelled = false;

        fetchLatestRemoteVersion()
            .then(remoteVersion => {
                if (cancelled || !remoteVersion) return;
                setHasUpdate(isNewerVersion(remoteVersion, getDebugInfo().rain.version));
            })
            .catch(e => console.error("Failed to check for updates:", e));

        return () => {
            cancelled = true;
        };
    }, []);

    return hasUpdate;
}

export function versionCheck() {
    const version = Number(getDebugInfo().discord.build);

    let supportedVersions: number;
    if (Platform.OS === "android") { supportedVersions = supportedVersionsAndroid; }
    else { supportedVersions = supportedVersionsIOS; }

    if (usesForeignCustomBundle()) return;
    if (useSettings.getState().disableUpdateWarnings === true) return;

    if (supportedVersions > version) {
        openAlert(
            "incompatible-version-alert",
            <AlertModal
                title={Strings.INCOMPATIBLE_VERSION}
                content={Strings.INCOMPATIBLE_VERSION_DESC}
                actions={
                    <AlertActions>
                        {Platform.OS === "android" && <AlertActionButton
                            text={Strings.OPEN_MANAGER}
                            variant="primary"
                            onPress={() => {
                                Linking.openURL("raincord://");
                            }}
                        />}
                        {Platform.OS === "ios" && <AlertActionButton
                            text={Strings.IPA_DOWNLOAD}
                            variant="primary"
                            onPress={() => {
                                Linking.openURL(ROUX_RELEASES_URL);
                            }}
                        />}
                        <AlertActionButton text={Strings.CONTINUE_ANYWAYS} variant="destructive" />
                    </AlertActions>
                }
            />,
        );
    }

    if (supportedVersions < version) {
        openAlert(
            "incompatible-version-alert",
            <AlertModal
                title={Strings.INCOMPATIBLE_VERSION}
                content={Strings.INCOMPATIBLE_VERSION_DESC}
                actions={
                    <AlertActions>
                        <AlertActionButton
                            text={Strings.UPDATE}
                            variant="primary"
                            onPress={() => {
                                downloadUpdate();
                            }}
                        />
                        <AlertActionButton text={Strings.CONTINUE_ANYWAYS} variant="destructive" />
                    </AlertActions>
                }
            />,
        );
    }
}

export default function Updater() {
    const [isCheckingForUpdates, setIsCheckingForUpdates] = useState(false);
    _setIsChecking = setIsCheckingForUpdates;
    const debugInfo = getDebugInfo();

    return (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 }}>
            <Stack style={{ paddingVertical: 24, paddingHorizontal: 12 }} spacing={24}>
                <TableRowGroup title={Strings.INFO}>
                    <TableRow
                        label={Strings.RAIN}
                        icon={<TableRow.Icon source={{ uri: RainIcon }} />}
                        trailing={<TableRow.TrailingText text={debugInfo.rain.version} />}
                    />
                    <TableRow
                        arrow
                        label={Strings.GITHUB}
                        icon={<TableRow.Icon source={findAssetId("img_account_sync_github_white")!} />}
                        trailing={<TableRow.TrailingText text={ROUX_REPO} />}
                        onPress={() => Linking.openURL(ROUX_REPO_URL)}
                    />
                </TableRowGroup>
                {checkForUpdate() && <View style={{ flexShrink: 1 }}>
                    <Button
                        text={Strings.UPDATE}
                        icon={findAssetId("DownloadIcon")}
                        disabled={isCheckingForUpdates}
                        loading={isCheckingForUpdates}
                        onPress={() => {
                            downloadUpdate();
                        }}
                    />
                </View>}
            </Stack>
        </ScrollView>
    );
}
