interface AnimeSite {
    titleQuery: string;
    epQuery: string;
    epPlayerRegEx: RegExp;
    syncData?: string | null;
    extractInfo: () => { title: string; episode: string; anilistId?: number | null };
}

export const animeSites = new Map<string, AnimeSite>([
    [
        'hianime.to',
        {
            titleQuery: 'h2.film-name > a',
            epQuery: '.ssl-item.ep-item.active',
            epPlayerRegEx: /https:\/\/hianime\.to\/watch\/.+\?ep=.+/,
            syncData: '#syncData',
            extractInfo: () => {
                const titleElement = document.querySelector('h2.film-name > a');
                const epElement = document.querySelector('.ssl-item.ep-item.active');
                return {
                    title: titleElement?.textContent?.trim() || '',
                    episode: epElement?.textContent?.trim() || '',
                };
            },
        },
    ],
    [
        'miruro.tv',
        {
            titleQuery: '.anime-title > a',
            epQuery: '', // we get episode from URL
            epPlayerRegEx: /https:\/\/www\.miruro\.tv\/watch\?id=.+ep=.+/,
            extractInfo: () => {
                const titleElement = document.querySelector('.anime-title > a');
                const urlParams = new URLSearchParams(window.location.search);
                const episodeString = urlParams.get('ep');
                const anilistId = urlParams.get('id');

                return {
                    title: titleElement?.textContent?.trim() || '',
                    episode: episodeString || '',
                    anilistId: anilistId ? parseInt(anilistId) : null,
                };
            },
        },
    ],

      [
        'app.strem.io',
        {
            titleQuery: '.fallback.ng-binding',
            epQuery: 'title',
            epPlayerRegEx: /https:\/\/app\.strem\.io\/.+/,
            extractInfo: () => {
                const titleElement = document.querySelector('.fallback.ng-binding');
                const title = titleElement?.textContent?.trim() || '';

                // extract episode from title tag which has format: "Stremio - [Anime Title] - [Episode Title] (SxE)"
                const titleTag = document.querySelector('title');
                const titleText = titleTag?.textContent || '';

                // extract the (SxE) pattern, where S is season and E is episode
                const episodeMatch = titleText.match(/(\d+)x(\d+)/);
                let episode = '';

                if (episodeMatch && episodeMatch[2]) {
                    // use the episode number (second group in the match)
                    episode = episodeMatch[2];
                }

                return {
                    title,
                    episode,
                };
            },
        },
    ],
]);

interface AnimeInfoResult {
    title: string;
    episode: number | '';
    error?: string;
    currentSite?: string;
    animeSites?: string[];
    anilistId?: number;
}

export function getAnimeTitleAndEpisode(url: string, maxRetries = 10, delay = 1000): Promise<AnimeInfoResult> {
    return new Promise((resolve) => {
        const attempt = (retryCount: number) => {
            const currentSite = new URL(url).hostname.replace(/^www\./, '');
            const siteSpecifics = animeSites.get(currentSite);

            if (!siteSpecifics) {
                resolve({
                    title: '',
                    episode: '',
                    error: 'Unsupported website.',
                    currentSite,
                    animeSites: Array.from(animeSites.keys()),
                });
                return;
            }

            if (siteSpecifics.extractInfo) {
                const info = siteSpecifics.extractInfo();
                if (info.title && info.episode) {
                    resolve({
                        title: info.title,
                        episode: parseInt(info.episode, 10),
                        ...(info.anilistId ? { anilistId: info.anilistId } : {}),
                    });
                    return;
                }
            } else {
                const titleElement = document.querySelector(siteSpecifics.titleQuery);
                const episodeElement = document.querySelector(siteSpecifics.epQuery ?? '');

                const title = titleElement ? titleElement.textContent?.trim() : '';
                const episodeString = episodeElement ? episodeElement.textContent?.trim() : '';
                const episode = episodeString ? parseInt(episodeString, 10) : NaN;

                if (title && !isNaN(episode)) {
                    resolve({ title, episode });
                    return;
                }
            }

            if (retryCount < maxRetries) {
                setTimeout(() => attempt(retryCount + 1), delay);
            } else {
                resolve({
                    title: '',
                    episode: '',
                    error: "Couldn't identify the correct Anime Title and Episode.",
                });
            }
        };

        attempt(0);
    });
}

export function isAnimeSite(url: string): boolean {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return animeSites.has(hostname);
}

export function getAnimeSiteInfo(url: string) {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return animeSites.get(hostname);
}
