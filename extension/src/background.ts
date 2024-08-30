import TabRegistry, { Asbplayer } from './services/tab-registry';
import ImageCapturer from './services/image-capturer';
import VideoHeartbeatHandler from './handlers/video/video-heartbeat-handler';
import RecordMediaHandler from './handlers/video/record-media-handler';
import RerecordMediaHandler from './handlers/video/rerecord-media-handler';
import StartRecordingMediaHandler from './handlers/video/start-recording-media-handler';
import StopRecordingMediaHandler from './handlers/video/stop-recording-media-handler';
import ToggleSubtitlesHandler from './handlers/video/toggle-subtitles-handler';
import SyncHandler from './handlers/video/sync-handler';
import HttpPostHandler from './handlers/video/http-post-handler';
import VideoToAsbplayerCommandForwardingHandler from './handlers/video/video-to-asbplayer-command-forwarding-handler';
import AsbplayerToVideoCommandForwardingHandler from './handlers/asbplayer/asbplayer-to-video-command-forwarding-handler';
import AsbplayerV2ToVideoCommandForwardingHandler from './handlers/asbplayerv2/asbplayer-v2-to-video-command-forwarding-handler';
import AsbplayerHeartbeatHandler from './handlers/asbplayerv2/asbplayer-heartbeat-handler';
import RefreshSettingsHandler from './handlers/popup/refresh-settings-handler';
import { CommandHandler } from './handlers/command-handler';
import TakeScreenshotHandler from './handlers/video/take-screenshot-handler';
import AudioRecorderService from './services/audio-recorder-service';
import AudioBase64Handler from './handlers/offscreen-document/audio-base-64-handler';
import AckTabsHandler from './handlers/asbplayerv2/ack-tabs-handler';
import OpenExtensionShortcutsHandler from './handlers/asbplayerv2/open-extension-shortcuts-handler';
import ExtensionCommandsHandler from './handlers/asbplayerv2/extension-commands-handler';
import OpenAsbplayerSettingsHandler from './handlers/video/open-asbplayer-settings-handler';
import CaptureVisibleTabHandler from './handlers/foreground/capture-visible-tab-handler';
import CopyToClipboardHandler from './handlers/video/copy-to-clipboard-handler';
import SettingsUpdatedHandler from './handlers/asbplayerv2/settings-updated-handler';
import {
    Command,
    CopySubtitleMessage,
    ExtensionToAsbPlayerCommand,
    ExtensionToVideoCommand,
    Message,
    PostMineAction,
    TakeScreenshotMessage,
    ToggleRecordingMessage,
    ToggleVideoSelectMessage,
} from '@project/common';
import { SettingsProvider } from '@project/common/settings';
import { fetchSupportedLanguages, primeLocalization } from './services/localization-fetcher';
import VideoDisappearedHandler from './handlers/video/video-disappeared-handler';
import { ExtensionSettingsStorage } from './services/extension-settings-storage';
import LoadSubtitlesHandler from './handlers/asbplayerv2/load-subtitles-handler';
import ToggleSidePanelHandler from './handlers/video/toggle-side-panel-handler';
import CopySubtitleHandler from './handlers/asbplayerv2/copy-subtitle-handler';
import { RequestingActiveTabPermissionHandler } from './handlers/video/requesting-active-tab-permission';
import { CardPublisher } from './services/card-publisher';
import AckMessageHandler from './handlers/video/ack-message-handler';
import PublishCardHandler from './handlers/asbplayerv2/publish-card-handler';
import { bindWebSocketClient, unbindWebSocketClient } from './services/web-socket-client-binding';
import { isFirefoxBuild } from './services/build-flags';
import { CaptureStreamAudioRecorder, OffscreenAudioRecorder } from './services/audio-recorder-delegate';
import RequestModelHandler from './handlers/mobile-overlay/request-model-handler';
import CurrentTabHandler from './handlers/mobile-overlay/current-tab-handler';
import UpdateMobileOverlayModelHandler from './handlers/video/update-mobile-overlay-model-handler';
import { isMobile } from './services/device-detection';
import { enqueueUpdateAlert } from './services/update-alert';
import { animeSites, getAnimeSiteInfo, isAnimeSite } from './services/anime-sites';

if (!isFirefoxBuild) {
    chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' });
}

const settings = new SettingsProvider(new ExtensionSettingsStorage());

const startListener = async () => {
    primeLocalization(await settings.getSingle('language'));
};

const installListener = async (details: chrome.runtime.InstalledDetails) => {
    if (details.reason !== chrome.runtime.OnInstalledReason.INSTALL) {
        return;
    }

    const defaultUiLanguage = chrome.i18n.getUILanguage();
    const supportedLanguages = await fetchSupportedLanguages();

    if (supportedLanguages.includes(defaultUiLanguage)) {
        await settings.set({ language: defaultUiLanguage });
        primeLocalization(defaultUiLanguage);
    }

    if (isMobile) {
        // Set reasonable defaults for mobile
        await settings.set({
            streamingTakeScreenshot: false, // Kiwi Browser does not support captureVisibleTab
            subtitleSize: 18,
            subtitlePositionOffset: 25,
            subtitlesWidth: 100,
        });
    }

    chrome.tabs.create({ url: chrome.runtime.getURL('ftue-ui.html'), active: true });
};

const updateListener = async (details: chrome.runtime.InstalledDetails) => {
    if (details.reason !== chrome.runtime.OnInstalledReason.UPDATE) {
        return;
    }

    enqueueUpdateAlert();
};

chrome.runtime.onInstalled.addListener(installListener);
chrome.runtime.onInstalled.addListener(updateListener);
chrome.runtime.onStartup.addListener(startListener);

const tabRegistry = new TabRegistry(settings);
const audioRecorder = new AudioRecorderService(
    tabRegistry,
    isFirefoxBuild ? new CaptureStreamAudioRecorder() : new OffscreenAudioRecorder()
);
const imageCapturer = new ImageCapturer(settings);
const cardPublisher = new CardPublisher(settings);

const handlers: CommandHandler[] = [
    new VideoHeartbeatHandler(tabRegistry),
    new RecordMediaHandler(audioRecorder, imageCapturer, cardPublisher, settings),
    new RerecordMediaHandler(settings, audioRecorder, cardPublisher),
    new StartRecordingMediaHandler(audioRecorder, imageCapturer, cardPublisher, settings),
    new StopRecordingMediaHandler(audioRecorder, imageCapturer, cardPublisher, settings),
    new TakeScreenshotHandler(imageCapturer, cardPublisher),
    new ToggleSubtitlesHandler(settings, tabRegistry),
    new SyncHandler(tabRegistry),
    new HttpPostHandler(),
    new ToggleSidePanelHandler(tabRegistry),
    new OpenAsbplayerSettingsHandler(),
    new CopyToClipboardHandler(),
    new VideoDisappearedHandler(tabRegistry),
    new RequestingActiveTabPermissionHandler(),
    new CopySubtitleHandler(tabRegistry),
    new LoadSubtitlesHandler(tabRegistry),
    new PublishCardHandler(cardPublisher),
    new AckMessageHandler(tabRegistry),
    new AudioBase64Handler(audioRecorder),
    new UpdateMobileOverlayModelHandler(),
    new VideoToAsbplayerCommandForwardingHandler(tabRegistry),
    new AsbplayerToVideoCommandForwardingHandler(),
    new AsbplayerHeartbeatHandler(tabRegistry),
    new AckTabsHandler(tabRegistry),
    new SettingsUpdatedHandler(tabRegistry, settings),
    new OpenExtensionShortcutsHandler(),
    new ExtensionCommandsHandler(),
    new AsbplayerV2ToVideoCommandForwardingHandler(),
    new RefreshSettingsHandler(tabRegistry, settings),
    new CaptureVisibleTabHandler(),
    new RequestModelHandler(),
    new CurrentTabHandler(),
];

chrome.runtime.onMessage.addListener((request: Command<Message>, sender, sendResponse) => {
    for (const handler of handlers) {
        if (
            (typeof handler.sender === 'string' && handler.sender === request.sender) ||
            (typeof handler.sender === 'object' && handler.sender.includes(request.sender))
        ) {
            if (handler.command === null || handler.command === request.message.command) {
                if (handler.handle(request, sender, sendResponse) === true) {
                    return true;
                }

                break;
            }
        }
    }
});

console.log('Background script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);
    if (message.type === 'DEBUG_LOG') {
        console.debug('[VideoDataSyncController]', ...message.args);
    }
});

function getAnimeTitleAndEpisode(
    tabId: number,
    url: string
): Promise<{ title: string; episode: number } | { error: string }> {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action: 'getTitleAndEp', url: url }, (response) => {
            if (chrome.runtime.lastError) {
                resolve({ error: chrome.runtime.lastError.message ?? 'Unknown error' });
            } else {
                resolve(response);
            }
        });
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === 'GET_ANIME_TITLE_AND_EPISODE' && sender.tab?.id) {
        getAnimeTitleAndEpisode(sender.tab.id, sender.tab.url ?? '')
            .then(sendResponse)
            .catch((error) => sendResponse({ error: error.message }));
        return true;
    }
    if (message.command === 'CHECK_IF_ANIME_SITE') {
        sendResponse({ isAnimeSite: isAnimeSite(sender.tab?.url ?? '') });
        return true;
    }

    if (message.command === 'GET_STORAGE') {
        chrome.storage.local.get(message.keys, (result) => {
            sendResponse(result);
        });
        return true;
    }

    if (message.command === 'SET_STORAGE') {
        chrome.storage.local.set(message.data, () => {
            sendResponse();
        });
        return true;
    }
});

const updateWebSocketClientState = () => {
    settings.getSingle('webSocketClientEnabled').then((webSocketClientEnabled) => {
        if (webSocketClientEnabled) {
            bindWebSocketClient(settings, tabRegistry);
        } else {
            unbindWebSocketClient();
        }
    });
};

updateWebSocketClientState();
tabRegistry.onAsbplayerInstance(updateWebSocketClientState);
tabRegistry.onSyncedElement(updateWebSocketClientState);

const defaultAction = (tab: chrome.tabs.Tab) => {
    if (isMobile) {
        if (tab.id !== undefined) {
            const extensionToVideoCommand: ExtensionToVideoCommand<ToggleVideoSelectMessage> = {
                sender: 'asbplayer-extension-to-video',
                message: {
                    command: 'toggle-video-select',
                },
            };
            chrome.tabs.sendMessage(tab.id, extensionToVideoCommand);
        }
    } else {
        chrome.action.openPopup();
    }
};

if (isFirefoxBuild) {
    let hasHostPermission = true;

    chrome.permissions.contains({ origins: ['<all_urls>'] }).then((result) => {
        hasHostPermission = result;

        if (hasHostPermission && !isMobile) {
            chrome.action.setPopup({
                popup: 'popup-ui.html',
            });
        }
    });

    chrome.action.onClicked.addListener(async (tab) => {
        if (hasHostPermission) {
            defaultAction(tab);
        } else {
            try {
                const obtainedHostPermission = await chrome.permissions.request({ origins: ['<all_urls>'] });

                if (obtainedHostPermission) {
                    hasHostPermission = true;
                    chrome.runtime.reload();
                }
            } catch (e) {
                console.error(e);
            }
        }
    });
} else {
    if (!isMobile) {
        chrome.action.setPopup({
            popup: 'popup-ui.html',
        });
    }

    chrome.action.onClicked.addListener(defaultAction);
}

if (isFirefoxBuild) {
    // Firefox requires the use of iframe.srcdoc in order to load UI into an about:blank iframe
    // (which is required for UI to be scannable by other extensions like Yomitan).
    // However, such an iframe inherits the content security directives of the parent document,
    // which may prevent loading of extension scripts into the iframe.
    // Because of this, we modify CSP headers below to explicitly allow access to extension-packaged resources.
    chrome.webRequest.onHeadersReceived.addListener(
        (details) => {
            const responseHeaders = details.responseHeaders;

            if (!responseHeaders) {
                return;
            }

            for (const header of responseHeaders) {
                if (header.name.toLowerCase() === 'content-security-policy') {
                    let cspValue = header.value;
                    cspValue += ` ; script-src moz-extension://${chrome.runtime.id}`;
                }
            }

            return { responseHeaders };
        },
        { urls: ['<all_urls>'] },
        ['blocking', 'responseHeaders']
    );
}
