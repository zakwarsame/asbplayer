import { VideoData } from '@project/common';
import { trackFromDef } from './util';
import { fetchAnilistInfo } from '../services/anilist';
import { fetchSubtitles } from '../services/subtitle';

// Store subtitle data by URL to handle page navigation
const subtitleCache: { [key: string]: VideoData } = {};
let lastUrlDispatched: string | undefined;

document.addEventListener('DOMContentLoaded', () => {
    // Check for new episodes/pages and dispatch subtitle data
    setInterval(() => {
        const currentUrl = window.location.href;
        if (lastUrlDispatched !== currentUrl) {
            fetchAndDispatchSubtitles();
            lastUrlDispatched = currentUrl;
        }
    }, 1000);
});

async function fetchAndDispatchSubtitles() {
    const response: VideoData = { error: '', basename: '', subtitles: [] };

    try {
        // Request title & episode by sending a message (instead of direct call)
        const { title, episode } = await new Promise<{ title: string; episode: number }>((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'getTitleAndEp', url: window.location.href },
                (res: { error?: string; title?: string; episode?: number }) => {
                    if (res.error) {
                        reject(new Error(res.error));
                    } else if (typeof res.title === 'string' && typeof res.episode === 'number') {
                        resolve({ title: res.title, episode: res.episode });
                    } else {
                        reject(new Error('Invalid response from getTitleAndEp'));
                    }
                }
            );
        });

        if (!title || !episode) {
            throw new Error('Could not detect anime title or episode');
        }

        response.basename = title;

        const apiKey = await chrome.storage.sync.get('apiKey').then((result) => result.apiKey || '');

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
                    extension: 'srt',
                })
            );
        }

        // Cache the response
        subtitleCache[window.location.href] = response;
    } catch (error) {
        if (error instanceof Error) {
            response.error = error.message;
        } else {
            response.error = String(error);
        }
    }

    // Only dispatch if we have subtitles or an error
    if ((response.subtitles && response.subtitles.length > 0) || response.error) {
        document.dispatchEvent(
            new CustomEvent('asbplayer-synced-data', {
                detail: response,
            })
        );
    }
}

// Handle initial subtitle request
document.addEventListener(
    'asbplayer-get-synced-data',
    async () => {
        await fetchAndDispatchSubtitles();
    },
    false
);
