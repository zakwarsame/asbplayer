import { VideoData } from '@project/common';
import { trackFromDef } from '@/pages/util';
import { fetchAnilistInfo } from '@/services/anilist';
import { fetchSubtitles } from '@/services/subtitle';

export default defineUnlistedScript(() => {
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
            // Request title & episode through custom event
            const { title, episode } = await new Promise<{ title: string; episode: number }>((resolve, reject) => {
                const handleResponse = (event: Event) => {
                    const data = (event as CustomEvent).detail;
                    document.removeEventListener('asbplayer-anime-info-response', handleResponse);

                    if (data.error) {
                        reject(new Error(data.error));
                    } else if (typeof data.title === 'string' && typeof data.episode === 'number') {
                        resolve({ title: data.title, episode: data.episode });
                    } else {
                        reject(new Error('Invalid response from anime info request'));
                    }
                };

                document.addEventListener('asbplayer-anime-info-response', handleResponse);
                document.dispatchEvent(
                    new CustomEvent('asbplayer-get-anime-info', {
                        detail: { url: window.location.href },
                    })
                );

                // Timeout after 5 seconds
                setTimeout(() => {
                    document.removeEventListener('asbplayer-anime-info-response', handleResponse);
                    reject(new Error('Timeout waiting for anime info'));
                }, 5000);
            });

            if (!title || !episode) {
                throw new Error('Could not detect anime title or episode');
            }

            response.basename = title;

            // Get API key through custom event
            const apiKey = await new Promise<string>((resolve) => {
                const handleApiKey = (event: Event) => {
                    const data = (event as CustomEvent).detail;
                    document.removeEventListener('asbplayer-api-key-response', handleApiKey);
                    resolve(data.apiKey || '');
                };

                document.addEventListener('asbplayer-api-key-response', handleApiKey);
                document.dispatchEvent(new CustomEvent('asbplayer-get-api-key'));

                // Timeout with empty string
                setTimeout(() => {
                    document.removeEventListener('asbplayer-api-key-response', handleApiKey);
                    resolve('');
                }, 1000);
            });

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
});
