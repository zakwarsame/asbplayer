import {
    SubtitleSyncSubtitleTrack,
    SubtitleSyncUiBridgeCloseMessage,
    SubtitleSyncUiBridgeSyncMessage,
    SubtitleSyncUiBridgeUseAudioMessage,
    SubtitleSyncUiModel,
} from '@project/common';
import { SettingsProvider } from '@project/common/settings';
import Binding from '../services/binding';
import UiFrame from '../services/ui-frame';
import { fetchLocalization } from '../services/localization-fetcher';

async function html(lang: string) {
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>asbplayer - Subtitle Sync</title>
                <style>
                    @import url(${browser.runtime.getURL('/fonts/fonts.css')});
                </style>
            </head>
            <body>
                <div id="root" style="width:100%;height:100vh;"></div>
                <script type="application/json" id="loc">${JSON.stringify(await fetchLocalization(lang))}</script>
                <script type="module" src="${browser.runtime.getURL('/subtitle-sync-ui.js')}"></script>
            </body>
            </html>`;
}

export default class SubtitleSyncController {
    private readonly _context: Binding;
    private readonly _frame: UiFrame;
    private readonly _settings: SettingsProvider;

    private _wasPaused?: boolean;
    private _fullscreenElement?: Element;
    private _activeElement?: Element;

    constructor(context: Binding, settings: SettingsProvider) {
        this._context = context;
        this._settings = settings;
        this._frame = new UiFrame(html);
    }

    unbind() {
        this._frame.unbind();
    }

    async show() {
        const client = await this._client();
        const themeType = await this._settings.getSingle('themeType');

        // Get currently loaded subtitles from the subtitle controller
        const loadedSubtitles = this._getLoadedSubtitles();

        const model: SubtitleSyncUiModel = {
            open: true,
            isLoading: false,
            loadedSubtitles,
            selectedPrimarySubtitleId: loadedSubtitles.length > 0 ? loadedSubtitles[0].id : '-',
            selectedReferenceSubtitleId: '-',
            themeType,
        };

        this._prepareShow();
        client.updateState(model);
    }

    private _getLoadedSubtitles(): SubtitleSyncSubtitleTrack[] {
        const subtitleFileNames = this._context.subtitleController.subtitleFileNames;
        return subtitleFileNames.map((name, index) => ({
            id: `loaded-${index}`,
            label: name,
            fileName: name,
        }));
    }

    private async _client() {
        this._frame.language = await this._settings.getSingle('language');
        const isNewClient = await this._frame.bind();
        const client = await this._frame.client();

        if (isNewClient) {
            client.onMessage(async (message) => {
                if ('close' === message.command) {
                    this._hideAndResume();
                    return;
                }

                if ('use-audio' === message.command) {
                    // Trigger VAD alignment via the existing handler
                    this._hideAndResume();
                    this._context.triggerVadAlignment();
                    return;
                }

                if ('sync' === message.command) {
                    const syncMessage = message as SubtitleSyncUiBridgeSyncMessage;
                    // TODO: Implement subtitle-to-subtitle sync
                    // For now, just close the dialog
                    console.log('[SubtitleSync] Sync requested:', syncMessage);
                    this._hideAndResume();
                    return;
                }
            });
        }

        this._frame.show();
        return client;
    }

    private _prepareShow() {
        this._wasPaused = this._wasPaused ?? this._context.video.paused;
        this._context.pause();

        if (document.fullscreenElement) {
            this._fullscreenElement = document.fullscreenElement;
            document.exitFullscreen();
        }

        if (document.activeElement) {
            this._activeElement = document.activeElement;
        }

        this._context.keyBindings.unbind();
        this._context.subtitleController.forceHideSubtitles = true;
        this._context.mobileVideoOverlayController.forceHide = true;
    }

    private _hideAndResume() {
        this._context.keyBindings.bind(this._context);
        this._context.subtitleController.forceHideSubtitles = false;
        this._context.mobileVideoOverlayController.forceHide = false;
        this._frame?.hide();

        if (this._fullscreenElement) {
            this._fullscreenElement.requestFullscreen();
            this._fullscreenElement = undefined;
        }

        if (this._activeElement) {
            if (typeof (this._activeElement as HTMLElement).focus === 'function') {
                (this._activeElement as HTMLElement).focus();
            }

            this._activeElement = undefined;
        } else {
            window.focus();
        }

        if (!this._wasPaused) {
            this._context.play();
        }

        this._wasPaused = undefined;
    }
}
