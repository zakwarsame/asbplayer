import { SettingsProvider } from '@project/common/settings';
import { isAnimeSite } from '@/services/anime-sites';

export interface CapturedSubtitle {
    url: string;
    label: string;
    language: string;
    base64: string;
}

const subtitleUrlRegex = /\.(vtt|srt|ass)(\?|$)/i;
const filenameLanguageRegex = /^([a-z]{2,3})(?:[_-]?\d+)?\.(?:vtt|srt|ass)$/i;
const imageCueRegex = /\.(jpe?g|png|webp|gif)(\?|#|$)/i;

const langCodeToName: Record<string, string> = {
    en: 'English',
    eng: 'English',
    ja: 'Japanese',
    jpn: 'Japanese',
    de: 'German',
    ger: 'German',
    es: 'Spanish',
    spa: 'Spanish',
    fr: 'French',
    fre: 'French',
    it: 'Italian',
    ita: 'Italian',
    pt: 'Portuguese',
    por: 'Portuguese',
    ru: 'Russian',
    rus: 'Russian',
    zh: 'Chinese',
    ko: 'Korean',
};

function labelFromUrl(url: string): string {
    const filename = new URL(url).pathname.split('/').pop() ?? '';
    const match = filename.match(filenameLanguageRegex);
    return match ? (langCodeToName[match[1].toLowerCase()] ?? match[1]) : 'CC';
}

// Some sites serve scrubbing-thumbnail sprites as .vtt files whose cues are image URLs rather than
// text. Those aren't subtitles, so detect and skip them.
function isImageCueTrack(base64: string): boolean {
    let text: string;
    try {
        text = atob(base64);
    } catch {
        return false;
    }
    return text.split('\n').filter((line) => imageCueRegex.test(line.trim())).length >= 2;
}

// Captures subtitle files a site serves over the network so they can be offered in the subtitle
// picker. Always on for anime sites; elsewhere gated behind the streamingCaptureSiteSubtitles setting.
export default class NetworkSubtitleCapture {
    private readonly _settings: SettingsProvider;
    private readonly _tracksByTab = new Map<number, CapturedSubtitle[]>();
    private readonly _requested = new Set<string>(); // "tabId:url" keys already captured or in-flight
    private _enabled = false;

    constructor(settings: SettingsProvider) {
        this._settings = settings;
        this._refreshEnabled();

        browser.runtime.onMessage.addListener((request: any) => {
            if (request?.message?.command === 'settings-updated') {
                this._refreshEnabled();
            }
        });

        browser.tabs.onRemoved.addListener((tabId) => this._clearTab(tabId));

        // Clear on navigation (including in-page episode changes via pushState) so a previous
        // episode's subtitles don't linger in the picker.
        browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (changeInfo.url) {
                this._clearTab(tabId);
            }
        });

        if (browser.webRequest?.onCompleted) {
            browser.webRequest.onCompleted.addListener((details) => this._onCompleted(details), {
                urls: ['<all_urls>'],
            });
        }
    }

    getTracks(tabId: number): CapturedSubtitle[] {
        return this._tracksByTab.get(tabId) ?? [];
    }

    private _clearTab(tabId: number) {
        this._tracksByTab.delete(tabId);
        for (const key of this._requested) {
            if (key.startsWith(tabId + ':')) {
                this._requested.delete(key);
            }
        }
    }

    private async _refreshEnabled() {
        this._enabled = await this._settings.getSingle('streamingCaptureSiteSubtitles');
    }

    private async _isAnimeTab(tabId: number): Promise<boolean> {
        try {
            const { url } = await browser.tabs.get(tabId);
            return url ? isAnimeSite(url) : false;
        } catch {
            return false;
        }
    }

    private async _onCompleted(details: Browser.webRequest.OnCompletedDetails) {
        if (!subtitleUrlRegex.test(details.url) || /thumbnail/i.test(details.url)) return;
        if (details.tabId < 1) return; // not tied to a tab

        const key = details.tabId + ':' + details.url;
        if (this._requested.has(key)) return;
        // Anime sites always capture; other sites only when the setting is on.
        if (!this._enabled && !(await this._isAnimeTab(details.tabId))) return;
        this._requested.add(key); // mark before fetching — our own fetch re-triggers this listener

        // Fetched in-frame by the content script; a background service-worker fetch is 403'd.
        let result: { success?: boolean; base64?: string; size?: number } | undefined;
        try {
            result = await browser.tabs.sendMessage(
                details.tabId,
                { command: 'fetch-network-subtitle', url: details.url },
                { frameId: details.frameId }
            );
        } catch {
            return;
        }

        if (!result?.success || (result.size ?? 0) < 50 || isImageCueTrack(result.base64!)) {
            return;
        }

        const tracks = this._tracksByTab.get(details.tabId) ?? [];
        if (tracks.some((t) => t.url === details.url)) return;
        tracks.push({ url: details.url, label: labelFromUrl(details.url), language: 'und', base64: result.base64! });
        this._tracksByTab.set(details.tabId, tracks);
    }
}
