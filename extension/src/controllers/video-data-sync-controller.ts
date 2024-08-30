import {
    ConfirmedVideoDataSubtitleTrack,
    ExtensionSyncMessage,
    SerializedSubtitleFile,
    VideoData,
    VideoDataSubtitleTrack,
    VideoDataUiBridgeConfirmMessage,
    VideoDataUiBridgeOpenFileMessage,
    VideoDataUiState,
    VideoToExtensionCommand,
    Message,
    UpdateApiKeyMessage,
    UpdateEpisodeMessage,
    SearchSubtitlesMessage,
} from '@project/common';
import { AsbplayerSettings, SettingsProvider, SubtitleListPreference } from '@project/common/settings';
import { bufferToBase64 } from '../services/base64';
import Binding from '../services/binding';
import ImageElement from '../services/image-element';
import { currentPageDelegate } from '../services/pages';
import { Parser as m3U8Parser } from 'm3u8-parser';
import UiFrame from '../services/ui-frame';
import { fetchLocalization } from '../services/localization-fetcher';
import i18n from 'i18next';
import { fetchAnilistInfo } from '../services/anilist';
import { fetchSubtitles } from '../services/subtitle';
import { animeSites } from '../services/anime-sites';

async function html(lang: string) {
    return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>asbplayer - Video Data Sync</title>
                <style>
                    @import url(${chrome.runtime.getURL('./assets/fonts.css')});
                </style>
            </head>
            <body>
                <div id="root" style="width:100%;height:100vh;"></div>
                <script type="application/json" id="loc">${JSON.stringify(await fetchLocalization(lang))}</script>
                <script src="${chrome.runtime.getURL('./video-data-sync-ui.js')}"></script>
            </body>
            </html>`;
}

interface ShowOptions {
    userRequested: boolean;
    openedFromMiningCommand: boolean;
}

const fetchDataForLanguageOnDemand = (language: string): Promise<VideoData> => {
    return new Promise((resolve, reject) => {
        const listener = (event: Event) => {
            const data = (event as CustomEvent).detail as VideoData;
            resolve(data);
            document.removeEventListener('asbplayer-synced-language-data', listener, false);
        };
        document.addEventListener('asbplayer-synced-language-data', listener, false);
        document.dispatchEvent(new CustomEvent('asbplayer-get-synced-language-data', { detail: language }));
    });
};

export default class VideoDataSyncController {
    private readonly _context: Binding;
    private readonly _domain: string;
    private readonly _frame: UiFrame;
    private readonly _settings: SettingsProvider;

    private _videoSelectBound?: boolean;
    private _imageElement: ImageElement;
    private _doneListener?: () => void;
    private _autoSync?: boolean;
    private _lastLanguagesSynced: { [key: string]: string[] };
    private _emptySubtitle: VideoDataSubtitleTrack;
    private _boundFunction?: (event: Event) => void;
    private _syncedData?: VideoData;
    private _wasPaused?: boolean;
    private _fullscreenElement?: Element;
    private _activeElement?: Element;
    private _autoSyncing: boolean = false;
    private _waitingForSubtitles: boolean = false;
    private _apiKey: string = '';
    private _episode: number | '' = '';
    private _fetchedSubtitles: VideoDataSubtitleTrack[] = [];
    private _isAnimeSite: boolean = false;

    constructor(context: Binding, settings: SettingsProvider) {
        this._context = context;
        this._settings = settings;
        this._videoSelectBound = false;
        this._imageElement = new ImageElement(context.video);
        this._doneListener;
        this._autoSync = false;
        this._lastLanguagesSynced = {};
        this._emptySubtitle = {
            id: '-',
            language: '-',
            url: '-',
            label: i18n.t('extension.videoDataSync.emptySubtitleTrack'),
            extension: 'srt',
        };
        this._boundFunction;
        this._domain = new URL(window.location.href).host;
        this._frame = new UiFrame(html);
        this._loadApiKey();
        this._isAnimeSite = false;
        this.checkIfAnimeSite();
    }

    private get lastLanguageSynced(): string[] {
        return this._lastLanguagesSynced[this._domain] ?? [];
    }

    private set lastLanguageSynced(value: string[]) {
        this._lastLanguagesSynced[this._domain] = value;
    }

    bindVideoSelect(doneListener: () => void) {
        if (this._videoSelectBound) {
            throw new Error('Video select container already bound');
        }

        const image = this._imageElement.element();
        image.classList.remove('asbplayer-hide');
        image.classList.add('asbplayer-mouse-over-image');

        image.addEventListener('click', (e) => {
            e.preventDefault();
            this._doneListener = doneListener;
            this.show({ userRequested: true, openedFromMiningCommand: false });
        });

        this._videoSelectBound = true;
    }

    unbind() {
        if (this._boundFunction) {
            document.removeEventListener('asbplayer-synced-data', this._boundFunction, false);
        }

        this._boundFunction = undefined;
        this._syncedData = undefined;
        this.unbindVideoSelect();
    }

    unbindVideoSelect() {
        this._imageElement.remove();
        this._frame.unbind();
        this._wasPaused = undefined;
        this._videoSelectBound = false;
        this._doneListener = undefined;
    }

    updateSettings({ streamingAutoSync, streamingLastLanguagesSynced }: AsbplayerSettings) {
        this._autoSync = streamingAutoSync;
        this._lastLanguagesSynced = streamingLastLanguagesSynced;
    }

    requestSubtitles() {
        if (!this._context.subSyncAvailable || !currentPageDelegate()?.isVideoPage()) {
            return;
        }

        this._syncedData = undefined;

        if (!this._boundFunction) {
            let allowAutoSync = true;

            this._boundFunction = (event: Event) => {
                const data = (event as CustomEvent).detail as VideoData;
                const autoSync = allowAutoSync && data.subtitles !== undefined;
                this._waitingForSubtitles = data.subtitles === undefined;
                this._setSyncedData(data, autoSync);

                if (autoSync) {
                    // Only attempt auto-sync on first response with subtitles received
                    allowAutoSync = false;
                }
            };
            document.addEventListener('asbplayer-synced-data', this._boundFunction, false);
        }

        document.dispatchEvent(new CustomEvent('asbplayer-get-synced-data'));
        this._waitingForSubtitles = true;
    }

    async show({ userRequested, openedFromMiningCommand }: ShowOptions) {
        if (!userRequested && this._syncedData?.subtitles === undefined) {
            // Not user-requested and subtitles track detection is not finished
            return;
        }

        const subtitleTrackChoices = this._syncedData?.subtitles ?? [];
        const subs = this._matchLastSyncedWithAvailableTracks();
        const selectedSub: VideoDataSubtitleTrack[] = subs.autoSelectedTracks;

        if (subs.completeMatch && !userRequested && !this._syncedData?.error) {
            // Instead of showing, auto-sync
            if (!this._autoSyncing) {
                this._autoSyncing = true;
                try {
                    if ((await this._syncData(selectedSub)) && this._doneListener) {
                        this._doneListener();
                    }
                } finally {
                    this._autoSyncing = false;
                }
            }
        } else {
            // Either user-requested or we couldn't auto-sync subtitles with the preferred language
            const defaultCheckboxState: boolean = subs.completeMatch;
            const themeType = await this._context.settings.getSingle('themeType');
            const { title, episode } = await this.getAnimeTitleAndEpisode();

            let state: VideoDataUiState = this._syncedData
                ? {
                      open: true,
                      isLoading: this._syncedData.subtitles === undefined,
                      suggestedName: title ? title : this._syncedData.basename,
                      selectedSubtitle: ['-'],
                      subtitles: subtitleTrackChoices,
                      error: this._syncedData.error,
                      themeType: themeType,
                      openedFromMiningCommand,
                      defaultCheckboxState: defaultCheckboxState,
                      // todo: put these in one state object
                      apiKey: this._apiKey,
                      episode: episode ? episode : this._episode,
                      isAnimeSite: this._isAnimeSite,
                  }
                : {
                      open: true,
                      isLoading: this._context.subSyncAvailable && this._waitingForSubtitles,
                      suggestedName: title ? title : document.title,
                      selectedSubtitle: ['-'],
                      error: '',
                      showSubSelect: true,
                      subtitles: subtitleTrackChoices,
                      themeType: themeType,
                      openedFromMiningCommand,
                      defaultCheckboxState: defaultCheckboxState,
                      apiKey: this._apiKey,
                      episode: episode ? episode : this._episode,
                      isAnimeSite: this._isAnimeSite,
                  };
            state.selectedSubtitle = selectedSub.map((subtitle) => subtitle.id || '-');
            const client = await this._client();
            this._prepareShow();
            client.updateState(state);
        }
    }

    private _matchLastSyncedWithAvailableTracks() {
        const subtitleTrackChoices = this._syncedData?.subtitles ?? [];
        let tracks = {
            autoSelectedTracks: [this._emptySubtitle, this._emptySubtitle, this._emptySubtitle],
            completeMatch: false,
        };

        const emptyChoice = this.lastLanguageSynced.some((lang) => lang !== '-') === undefined;

        if (!subtitleTrackChoices.length && emptyChoice) {
            tracks.completeMatch = true;
        } else {
            let matches: number = 0;
            for (let i = 0; i < this.lastLanguageSynced.length; i++) {
                const language = this.lastLanguageSynced[i];
                for (let j = 0; j < subtitleTrackChoices.length; j++) {
                    if (language === '-') {
                        matches++;
                        break;
                    } else if (language === subtitleTrackChoices[j].language) {
                        tracks.autoSelectedTracks[i] = subtitleTrackChoices[j];
                        matches++;
                        break;
                    }
                }
            }
            if (matches === this.lastLanguageSynced.length) {
                tracks.completeMatch = true;
            }
        }

        return tracks;
    }

    private _defaultVideoName(basename: string | undefined, subtitleTrack: VideoDataSubtitleTrack) {
        if (subtitleTrack.url === '-') {
            return basename ?? '';
        }

        if (basename) {
            return `${basename} - ${subtitleTrack.label}`;
        }

        return subtitleTrack.label;
    }

    private _setSyncedData(data: VideoData, autoSync: boolean) {
        this._syncedData = data;

        if (autoSync && this._canAutoSync()) {
            this.show({ userRequested: false, openedFromMiningCommand: false });
        }
    }

    private _canAutoSync(): boolean {
        const page = currentPageDelegate();

        if (page === undefined) {
            return this._autoSync ?? false;
        }

        return this._autoSync === true && page.canAutoSync(this._context.video);
    }

    private async _client() {
        this._frame.language = await this._settings.getSingle('language');
        const isNewClient = await this._frame.bind();
        const client = await this._frame.client();

        if (isNewClient) {
            client.onMessage(async (message) => {
                let shallUpdate = true;

                if ('confirm' === message.command) {
                    const confirmMessage = message as VideoDataUiBridgeConfirmMessage;

                    if (confirmMessage.shouldRememberTrackChoices) {
                        this.lastLanguageSynced = confirmMessage.data.map((track) => track.language);
                        await this._context.settings
                            .set({ streamingLastLanguagesSynced: this._lastLanguagesSynced })
                            .catch(() => {});
                    }

                    const data = confirmMessage.data as ConfirmedVideoDataSubtitleTrack[];

                    shallUpdate = await this._syncDataArray(data);
                } else if ('openFile' === message.command) {
                    const openFileMessage = message as VideoDataUiBridgeOpenFileMessage;
                    const subtitles = openFileMessage.subtitles as SerializedSubtitleFile[];

                    try {
                        this._syncSubtitles(subtitles, false);
                        shallUpdate = true;
                    } catch (e) {
                        if (e instanceof Error) {
                            this._reportError(e.message);
                        }
                    }
                } else if ('updateApiKey' === message.command) {
                    const updateApiKeyMessage = message as UpdateApiKeyMessage;
                    this._apiKey = updateApiKeyMessage.apiKey;
                    await this.setStorage({ apiKey: this._apiKey });
                    shallUpdate = false;
                    client.updateState({ apiKey: this._apiKey, open: true });
                } else if ('updateEpisode' === message.command) {
                    const updateEpisodeMessage = message as UpdateEpisodeMessage;
                    this._episode = updateEpisodeMessage.episode;
                    shallUpdate = false;
                    client.updateState({ episode: this._episode, open: true });
                } else if ('search' === message.command) {
                    const searchSubtitlesMessage = message as SearchSubtitlesMessage;
                    await this._handleSearch(searchSubtitlesMessage);
                    shallUpdate = false;
                }

                if (shallUpdate) {
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
                    if (this._doneListener) this._doneListener();
                }
            });
        }

        this._frame.show();
        return client;
    }

    private async _prepareShow() {
        const client = await this._client();
        await this.checkIfAnimeSite();
        const { title, episode } = await this.getAnimeTitleAndEpisode();

        client.updateState({
            isAnimeSite: this._isAnimeSite,
            suggestedName: title,
            episode: episode,
            open: true,
        });

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

    private async _syncData(data: VideoDataSubtitleTrack[]) {
        try {
            let subtitles: SerializedSubtitleFile[] = [];

            for (let i = 0; i < data.length; i++) {
                const { extension, url, m3U8BaseUrl, language } = data[i];
                const subtitleFiles = await this._subtitlesForUrl(
                    this._defaultVideoName(this._syncedData?.basename, data[i]),
                    language,
                    extension,
                    url,
                    m3U8BaseUrl
                );
                if (subtitleFiles !== undefined) {
                    subtitles.push(...subtitleFiles);
                }
            }

            this._syncSubtitles(
                subtitles,
                data.some((track) => track.m3U8BaseUrl !== undefined)
            );
            return true;
        } catch (error) {
            if (typeof (error as Error).message !== 'undefined') {
                this._reportError(`Data Sync failed: ${(error as Error).message}`);
            }

            return false;
        }
    }

    private async _syncDataArray(data: ConfirmedVideoDataSubtitleTrack[]) {
        try {
            let subtitles: SerializedSubtitleFile[] = [];

            for (let i = 0; i < data.length; i++) {
                const { name, language, extension, url, m3U8BaseUrl } = data[i];
                const subtitleFiles = await this._subtitlesForUrl(name, language, extension, url, m3U8BaseUrl);
                if (subtitleFiles !== undefined) {
                    subtitles.push(...subtitleFiles);
                }
            }

            this._syncSubtitles(
                subtitles,
                data.some((track) => track.m3U8BaseUrl !== undefined)
            );
            return true;
        } catch (error) {
            if (typeof (error as Error).message !== 'undefined') {
                this._reportError(`Data Sync failed: ${(error as Error).message}`);
            }

            return false;
        }
    }

    private async _syncSubtitles(serializedFiles: SerializedSubtitleFile[], flatten: boolean) {
        if ((await this._settings.getSingle('streamingSubtitleListPreference')) === SubtitleListPreference.app) {
            const command: VideoToExtensionCommand<ExtensionSyncMessage> = {
                sender: 'asbplayer-video',
                message: {
                    command: 'sync',
                    subtitles: serializedFiles,
                    flatten: flatten,
                },
                src: this._context.video.src,
            };
            chrome.runtime.sendMessage(command);
        } else {
            const files: File[] = await Promise.all(
                serializedFiles.map(
                    async (f) => new File([await (await fetch('data:text/plain;base64,' + f.base64)).blob()], f.name)
                )
            );
            this._context.loadSubtitles(files, flatten);
        }
    }

    private async _subtitlesForUrl(
        name: string,
        language: string,
        extension: string,
        url: string,
        m3U8BaseUrl?: string
    ): Promise<SerializedSubtitleFile[] | undefined> {
        if (url === '-') {
            return [
                {
                    name: `${name}.${extension}`,
                    base64: '',
                },
            ];
        }

        if (url === 'lazy') {
            const data = await fetchDataForLanguageOnDemand(language);

            if (data.error) {
                this._reportError(data.error);
                return undefined;
            }

            const lazilyFetchedUrl = data.subtitles?.find((t) => t.language === language)?.url;

            if (lazilyFetchedUrl === undefined) {
                this._reportError('Failed to fetch subtitles for specified language');
                return undefined;
            }

            url = lazilyFetchedUrl;
        }

        const response = await fetch(url).catch((error) => {
            this._reportError(error.message);
        });

        if (!response) {
            return undefined;
        }

        if (extension === 'm3u8') {
            const m3U8Response = await fetch(url);
            const parser = new m3U8Parser();
            parser.push(await m3U8Response.text());
            parser.end();

            if (!parser.manifest.segments || parser.manifest.segments.length === 0) {
                return undefined;
            }

            const firstUri = parser.manifest.segments[0].uri;
            const partExtension = firstUri.substring(firstUri.lastIndexOf('.') + 1);
            const promises = parser.manifest.segments
                .filter((s: any) => !s.discontinuity && s.uri)
                .map((s: any) => fetch(`${m3U8BaseUrl}/${s.uri}`));
            const tracks = [];

            for (const p of promises) {
                const response = await p;

                if (!response.ok) {
                    throw new Error(
                        `Subtitle Retrieval failed with Status ${response.status}/${response.statusText}...`
                    );
                }

                tracks.push({
                    name: `${name}.${partExtension}`,
                    base64: bufferToBase64(await response.arrayBuffer()),
                });
            }

            return tracks;
        }

        if (!response.ok) {
            throw new Error(`Subtitle Retrieval failed with Status ${response.status}/${response.statusText}...`);
        }

        return [
            {
                name: `${name}.${extension}`,
                base64: response ? bufferToBase64(await response.arrayBuffer()) : '',
            },
        ];
    }

    private async _reportError(error: string) {
        const client = await this._client();
        const themeType = await this._context.settings.getSingle('themeType');

        this._prepareShow();

        return client.updateState({
            open: true,
            isLoading: false,
            showSubSelect: true,
            error,
            themeType: themeType,
        });
    }

    private async _loadApiKey() {
        this._apiKey = (await this.getStorage(['apiKey'])).apiKey || '';
    }

    private async _handleSearch(message: SearchSubtitlesMessage) {
        const client = await this._client();
        client.updateState({ isLoading: true, error: null, open: true });

        try {
            const { anilistId } = await fetchAnilistInfo(message.title);
            if (!anilistId) {
                throw new Error('Unable to find Anilist ID for the given title');
            }

            const subtitles = await fetchSubtitles(anilistId, message.episode || 0, message.apiKey);
            if (typeof subtitles === 'string') {
                throw new Error(subtitles);
            }

            this._apiKey = message.apiKey;
            await this.setStorage({ apiKey: this._apiKey });

            const fetchedSubtitles = subtitles
                .map((sub, index) => ({
                    id: `fetched-${index}`,
                    language: 'ja',
                    url: sub.url,
                    label: sub.name,
                    extension: 'srt',
                }))
                .filter((sub) => sub.url && sub.label);

            const { title } = await this.getAnimeTitleAndEpisode();

            // Update the subtitles state with the fetched subtitles
            this._syncedData = {
                ...this._syncedData,
                subtitles: [
                    { id: '-', language: '-', url: '-', label: 'No subtitle', extension: 'srt' },
                    ...fetchedSubtitles,
                ],
            } as VideoData;

            client.updateState({
                subtitles: this._syncedData.subtitles,
                isLoading: false,
                apiKey: this._apiKey,
                episode: message.episode,
                open: true,
                suggestedName: title,
            });
        } catch (error) {
            client.updateState({
                error: error instanceof Error ? error.message : 'An error occurred while fetching subtitles',
                isLoading: false,
                open: true,
            });
        }
    }

    private async checkIfAnimeSite(): Promise<void> {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ command: 'CHECK_IF_ANIME_SITE' }, (response) => {
                this._isAnimeSite = response.isAnimeSite;
                resolve();
            });
        });
    }
    private async getAnimeTitleAndEpisode(): Promise<{ title: string; episode: string }> {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ command: 'GET_ANIME_TITLE_AND_EPISODE' }, (response) => {
                if (response.error) {
                    resolve({ title: '', episode: '' });
                } else {
                    resolve({ title: response.title, episode: response.episode.toString() });
                }
            });
        });
    }

    private async getStorage(keys: string[]): Promise<any> {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ command: 'GET_STORAGE', keys }, (response) => {
                resolve(response);
            });
        });
    }

    private async setStorage(data: { [key: string]: any }): Promise<void> {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ command: 'SET_STORAGE', data }, () => {
                resolve();
            });
        });
    }
}
