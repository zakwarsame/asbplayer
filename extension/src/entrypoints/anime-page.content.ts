import { VideoData } from '@project/common';
import { trackFromDef } from '@/pages/util';
import { fetchAnilistInfo } from '@/services/anilist';
import { fetchSubtitles } from '@/services/subtitle';
import { animeSiteInitConfig, getAnimeTitleAndEpisode, isAnimeSite } from '@/services/anime-sites';
import type { ContentScriptContext } from '#imports';

const excludeGlobs = ['*://killergerbah.github.io/asbplayer*', '*://app.asbplayer.dev/*', '*cloudflare.com*'];

if (import.meta.env.DEV) {
    excludeGlobs.push('*://localhost:3000/*');
}

export default defineContentScript({
    // Set manifest options
    matches: ['<all_urls>'],
    excludeGlobs,
    allFrames: true,
    runAt: 'document_start',

    main(ctx: ContentScriptContext) {
        let lastUrlDispatched: string | undefined;
        const { isReferredFromAnimeSite, referrerHostname } = animeSiteInitConfig(
            window.location.hostname,
            document.referrer
        );
        const isCurrentSiteAnimeSite = isAnimeSite(window.location.href);

        if (!isCurrentSiteAnimeSite && !isReferredFromAnimeSite) {
            return;
        }

        // used to accurately get info in the modal
        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'getTitleAndEp') {
                getAnimeTitleAndEpisode(message.url)
                    .then((result) => sendResponse(result))
                    .catch((error) => sendResponse({ error: error.message }));
                return true;
            }
        });

        document.addEventListener('DOMContentLoaded', async () => {
            if (!isCurrentSiteAnimeSite) return;
            await setFetchInProgress(true);
            await fetchAndStoreSubs();
            // Check for new episodes/pages and dispatch subtitle data
            setInterval(async () => {
                const currentUrl = window.location.href;
                if (lastUrlDispatched !== currentUrl) {
                    await setFetchInProgress(true);
                    await fetchAndStoreSubs();
                    await retrieveAndDispatch(true);
                    lastUrlDispatched = currentUrl;
                }
            }, 1000);
        });

        async function retrieveAndDispatch(reAttempt: boolean = false) {
            const response: VideoData = { error: '', basename: '', subtitles: [] };

            // If a fetch is in progress from the host page, wait for it to complete
            await waitForFetchCompletion();

            const { currentSubtitleData } = await browser.storage.local.get('currentSubtitleData');
            const storedData = currentSubtitleData?.data;

            const expired = currentSubtitleData?.timestamp
                ? Date.now() - currentSubtitleData.timestamp > 3 * 60 * 1000
                : false;

            const sameUrl = currentSubtitleData?.url === window.location.href;
            if (expired && !sameUrl) {
                return;
            }

            // Check if we have valid stored data
            const hasValidStoredData = storedData && storedData.subtitles && storedData.subtitles.length > 0;

            if (hasValidStoredData) {
                Object.assign(response, storedData, {
                    moreInfo: {
                        isReferredFromAnimeSite,
                        isCurrentSiteAnimeSite,
                        referrerHostname,
                        referrer: document.referrer,
                        url: window.location.href,
                    },
                });

                if (reAttempt) {
                    Object.assign(response, { reAttempt: true });
                }

                document.dispatchEvent(
                    new CustomEvent('asbplayer-synced-data', {
                        detail: response,
                    })
                );
                return;
            }
        }

        async function fetchAndStoreSubs() {
            const response: VideoData = { error: '', basename: '', subtitles: [] };

            try {
                // Request title & episode through custom event
                const { title, episode } = await new Promise<{ title: string; episode: number | '' }>(
                    async (resolve, reject) => {
                        try {
                            const result = await getAnimeTitleAndEpisode(window.location.href);
                            resolve({ title: result.title, episode: result.episode });
                        } catch (error) {
                            reject(error);
                        }
                    }
                );

                if (!title || !episode) {
                    throw new Error('Could not detect anime title or episode');
                }

                response.basename = title;

                const result = await browser.storage.local.get('apiKey');
                const apiKey = result?.apiKey || '';

                // Get Anilist ID
                const { anilistId } = await fetchAnilistInfo(title);
                if (!anilistId) {
                    throw new Error('Unable to find Anilist ID for the given title');
                }

                // Fetch available subtitles
                const subtitles = await fetchSubtitles(anilistId, episode, apiKey);
                if (typeof subtitles === 'string') {
                    throw new Error(subtitles);
                }

                // Only add subtitles if we actually got some results
                if (subtitles.length > 0) {
                    response.subtitles = subtitles.map((sub) =>
                        trackFromDef({
                            label: sub.name,
                            language: 'ja',
                            url: sub.url,
                            extension: sub.url.split('.').pop() || 'srt',
                        })
                    );
                }
            } catch (error) {
                if (error instanceof Error) {
                    response.error = error.message;
                } else {
                    response.error = String(error);
                }
            } finally {
                // Store subtitle data and clear fetch-in-progress status in one operation
                if ((response.subtitles && response.subtitles.length > 0) || response.error) {
                    await storeDataAndClearFetch(response);
                } else {
                    await setFetchInProgress(false);
                }
            }
        }

        async function storeDataAndClearFetch(response: VideoData) {
            const now = Date.now();

            try {
                await browser.storage.local.set({
                    currentSubtitleData: {
                        url: window.location.href,
                        data: response,
                        timestamp: now,
                    },
                    currentSubtitleFetchStatus: {
                        url: window.location.href,
                        inProgress: false,
                        lastCompletedAt: now,
                    },
                });
            } catch (error) {
                chrome.runtime.sendMessage({
                    command: 'asbplayer-log',
                    message: '[ASBPlayer anime-page] Error storing data',
                    data: { error },
                });
            }
        }

        async function setFetchInProgress(inProgress: boolean) {
            try {
                const now = Date.now();
                const status = inProgress
                    ? { url: window.location.href, inProgress: true, startedAt: now }
                    : { url: window.location.href, inProgress: false, lastCompletedAt: now };
                await browser.storage.local.set({ currentSubtitleFetchStatus: status });
            } catch (error) {
                chrome.runtime.sendMessage({
                    command: 'asbplayer-log',
                    message: '[ASBPlayer anime-page] Error updating fetch status',
                    data: { error },
                });
            }
        }

        async function waitForFetchCompletion(maxWaitMs: number = 20000): Promise<boolean> {
            const start = Date.now();
            while (Date.now() - start < maxWaitMs) {
                const { currentSubtitleFetchStatus } = await browser.storage.local.get('currentSubtitleFetchStatus');
                const inProgress = currentSubtitleFetchStatus?.inProgress === true;
                if (!inProgress) {
                    return true;
                }
                await new Promise((r) => setTimeout(r, 250));
            }

            return false;
        }

        // Handle initial subtitle request
        document.addEventListener(
            'asbplayer-get-synced-data',
            async () => {
                await retrieveAndDispatch();
            },
            false
        );
    },
});
