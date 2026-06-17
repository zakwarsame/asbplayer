import { SubtitleSyncCandidate, SubtitleSyncUiBridgeSyncMessage, SubtitleSyncUiModel } from '@project/common';
import { SettingsProvider } from '@project/common/settings';
import Binding from '../services/binding';
import UiFrame, { uiFrameForHtml } from '../services/ui-frame';
import { fetchLocalization } from '../services/localization-fetcher';
import { detectOffsetBetweenSubtitles } from '../services/vad/vad-offset-detector';
import {
    gatherReferenceCandidates,
    parseReferenceCues,
    MIN_SUBTITLE_SYNC_CONFIDENCE,
    ReferenceCandidate,
    ReferenceCue,
} from '../services/subtitle-sync';

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

    private _primaryCues: ReferenceCue[] = [];
    private _candidatesById = new Map<string, ReferenceCandidate>();

    private _wasPaused?: boolean;
    private _fullscreenElement?: Element;
    private _activeElement?: Element;

    constructor(context: Binding, settings: SettingsProvider) {
        this._context = context;
        this._settings = settings;
        this._frame = uiFrameForHtml(html);
    }

    unbind() {
        this._frame.unbind();
    }

    async show() {
        const client = await this._client();
        const themeType = await this._settings.getSingle('themeType');
        const subtitles = this._context.subtitleController.subtitles;
        const fileNames = this._context.subtitleController.subtitleFileNames ?? [];

        if (!subtitles || subtitles.length === 0) {
            this._prepareShow();
            client.updateState({ open: true, isLoading: false, candidates: [], themeType });
            return;
        }

        const primaryTrack = subtitles.reduce((min, s) => Math.min(min, s.track), Infinity);
        this._primaryCues = subtitles
            .filter((s) => s.track === primaryTrack)
            .map((s) => ({ originalStart: s.originalStart, originalEnd: s.originalEnd }));

        const references = await gatherReferenceCandidates(this._context, primaryTrack);
        this._candidatesById = new Map(references.map((c) => [c.id, c]));

        const candidates: SubtitleSyncCandidate[] = references
            .map((c) => ({
                id: c.id,
                label: c.label,
                origin: c.origin,
                confidence: detectOffsetBetweenSubtitles(this._primaryCues, c.cues).confidence,
            }))
            .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));

        const best = candidates.find((c) => (c.confidence ?? 0) >= MIN_SUBTITLE_SYNC_CONFIDENCE);

        const model: SubtitleSyncUiModel = {
            open: true,
            isLoading: false,
            primaryLabel: fileNames[primaryTrack] ?? fileNames[0],
            candidates,
            selectedReferenceId: best ? best.id : 'audio',
            themeType,
        };

        this._prepareShow();
        client.updateState(model);
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

                if ('sync' === message.command) {
                    await this._sync(message as SubtitleSyncUiBridgeSyncMessage);
                }
            });
        }

        this._frame.show();
        return client;
    }

    private async _sync({ referenceId, uploaded }: SubtitleSyncUiBridgeSyncMessage) {
        if (referenceId === 'audio') {
            this._hideAndResume();
            this._context.triggerVadAlignment();
            return;
        }

        let cues: ReferenceCue[] | undefined;
        let label: string;

        if (uploaded) {
            cues = await parseReferenceCues(uploaded.base64, uploaded.name);
            label = uploaded.name;
        } else {
            const candidate = this._candidatesById.get(referenceId);
            cues = candidate?.cues;
            label = candidate?.label ?? referenceId;
        }

        this._hideAndResume();

        if (!cues || cues.length === 0 || this._primaryCues.length === 0) {
            this._context.subtitleController.notification('info.error', {
                message: 'Could not read reference subtitle',
            });
            return;
        }

        const { offset, confidence } = detectOffsetBetweenSubtitles(this._primaryCues, cues, { minConfidence: 0 });
        this._context.applySubtitleSyncOffset(offset, confidence, label);
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
