interface AnimeSite {
    titleQuery: string;
    epQuery: string;
    epPlayerRegEx: RegExp;
    syncData?: string | null;
    extractInfo: () => { title: string; episode: string; anilistId?: number | null };
}

const BRANDS = {
    HIANIME: 'hianime',
    MIRURO: 'miruro',
    STREM: 'strem',
    ANIMEKAI: 'animekai',
} as const;
type BrandKey = (typeof BRANDS)[keyof typeof BRANDS];

const BRAND_HOST_TESTS: Record<BrandKey, (hostname: string) => boolean> = {
    [BRANDS.HIANIME]: (hostname) => /(^|\.)hianime[a-z]?\./.test(hostname),
    [BRANDS.MIRURO]: (hostname) => /(^|\.)miruro\./.test(hostname),
    [BRANDS.STREM]: (hostname) => /^app\.strem\./.test(hostname),
    [BRANDS.ANIMEKAI]: (hostname) => /(^|\.)(animekai|anikai)\./.test(hostname),
};

// Site keys are brand-based to allow any TLD (e.g., hianime.to, hianime.se)
export const animeSites = new Map<string, AnimeSite>([
    [
        BRANDS.HIANIME,
        {
            titleQuery: 'h2.film-name > a',
            epQuery: '.ssl-item.ep-item.active',
            epPlayerRegEx: /https:\/\/hianime[a-z]?\.[^/]+\/watch\/.+\?ep=.+/,
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
        BRANDS.MIRURO,
        {
            titleQuery: '.anime-title > a',
            epQuery: '', // we get episode from URL
            epPlayerRegEx: /https:\/\/(?:www\.)?miruro\.[^/]+\/watch(?:\/\d+\/[^/]+\/episode-\d+|\?id=.+ep=.+)/,
            extractInfo: () => {
                const titleElement = document.querySelector('.anime-title > a');

                // Try path-based URL format first: /watch/104578/attack-on-titan-season-3-part-2/episode-1
                const pathMatch = window.location.href.match(/watch\/(\d+)\/([^/]+)\/episode-(\d+)/);
                if (pathMatch) {
                    const [, anilistId, title, episode] = pathMatch;
                    return {
                        title: title,
                        episode: episode,
                        anilistId: parseInt(anilistId),
                    };
                }

                // Fall back to URL params format: /watch?id=...&ep=...
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
        BRANDS.STREM,
        {
            titleQuery: '.fallback.ng-binding',
            epQuery: 'title',
            epPlayerRegEx: /https:\/\/app\.strem\.[^/]+\/.+/,
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
    [
        BRANDS.ANIMEKAI,
        {
            titleQuery: '', // Not used since we extract from URL
            epQuery: '', // Not used since we extract from URL
            epPlayerRegEx: /https:\/\/animekai\.[^/]+\/watch\/[^#]+#ep=\d+/,
            extractInfo: () => {
                const url = window.location.href;
                const match = url.match(/\/watch\/([^#]+)#ep=(\d+)/);
                if (!match) return { title: '', episode: '' };

                const [, titleSlug, episode] = match;
                // Remove the last segment which is the site ID (always 4 characters)
                const titleParts = titleSlug.split('-');
                const title = titleParts
                    .slice(0, -1) // Remove the last part (site ID)
                    .join(' ')
                    .trim();

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

export function getAnimeTitleAndEpisode(url: string, maxRetries = 5, delay = 1000): Promise<AnimeInfoResult> {
    return new Promise((resolve, reject) => {
        const attempt = (retryCount: number) => {
            const currentHost = normalizeHostname(new URL(url).hostname);
            const siteKey = detectSiteKey(currentHost);
            const siteSpecifics = siteKey ? animeSites.get(siteKey) : undefined;

            if (!siteSpecifics) {
                reject({
                    title: '',
                    episode: '',
                    error: 'Unsupported website.',
                    currentSite: currentHost,
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
                reject({
                    title: '',
                    episode: '',
                    error: "Couldn't identify the correct Anime Title and Episode.",
                });
            }
        };

        attempt(0);
    });
}

function normalizeHostname(hostname: string): string {
    return hostname.replace(/^www\./, '');
}

function detectSiteKey(hostname: string): string | undefined {
    for (const brand of Object.values(BRANDS)) {
        const tester = BRAND_HOST_TESTS[brand as BrandKey];
        if (tester && tester(hostname)) return brand;
    }
    return undefined;
}

export function isAnimeSite(url: string): boolean {
    const hostname = normalizeHostname(new URL(url).hostname);
    return Boolean(detectSiteKey(hostname));
}

export function getAnimeSiteInfo(url: string) {
    const hostname = normalizeHostname(new URL(url).hostname);
    const siteKey = detectSiteKey(hostname);
    return siteKey ? animeSites.get(siteKey) : undefined;
}

export function animeSiteInitConfig(
    hostname: string,
    referrer: string | undefined
): {
    isReferredFromAnimeSite: boolean;
    referrerHostname: string | undefined;
} {
    const isCloudflare = hostname.includes('cloudflare.com');
    const referrerHostname = referrer ? normalizeHostname(new URL(referrer).host) : undefined;

    const normalizedReferrerHostname = referrerHostname;
    const isReferredFromAnimeSite =
        normalizedReferrerHostname && Boolean(detectSiteKey(normalizedReferrerHostname)) && !isCloudflare;

    return {
        isReferredFromAnimeSite: Boolean(isReferredFromAnimeSite),
        referrerHostname,
    };
}
