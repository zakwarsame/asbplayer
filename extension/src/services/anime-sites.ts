export const animeSites = new Map([
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
            epQuery: null, // we get episode from URL
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
        'animesuge.to',
        {
            titleQuery: 'h1.title',
            epQuery: 'div.range a.active',
            epPlayerRegEx: /https:\/\/animesuge\.to\/anime\/.+\/ep-.+/,
        },
    ],
]);

export function isAnimeSite(url: string): boolean {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return animeSites.has(hostname);
}

export function getAnimeSiteInfo(url: string) {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return animeSites.get(hostname);
}
