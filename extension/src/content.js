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
]);

function getAnimeTitleAndEpisode(url, maxRetries = 5, delay = 1000) {
    return new Promise((resolve) => {
        const attempt = (retryCount) => {
            const currentSite = new URL(url).hostname;
            const siteSpecifics = animeSites.get(currentSite);

            if (!siteSpecifics) {
                resolve({ error: 'Unsupported website.', currentSite, animeSites: Array.from(animeSites.keys()) });
                return;
            }

            const titleElement = document.querySelector(siteSpecifics.titleQuery);
            const episodeElement = document.querySelector(siteSpecifics.epQuery);

            const title = titleElement ? titleElement.textContent?.trim() : '';
            const episodeString = episodeElement ? episodeElement.textContent?.trim() : '';
            const episode = episodeString ? parseInt(episodeString, 10) : NaN;

            if (title && !isNaN(episode)) {
                resolve({ title, episode });
            } else if (retryCount < maxRetries) {
                setTimeout(() => attempt(retryCount + 1), delay);
            } else {
                resolve({ error: "Couldn't identify the correct Anime Title and Episode." });
            }
        };

        attempt(0);
    });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getTitleAndEp') {
        getAnimeTitleAndEpisode(message.url)
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ error: error.message }));
        return true;
    }
});
