import { currentPageDelegate } from './services/pages';
import { getAnimeTitleAndEpisode } from './services/anime-sites';

currentPageDelegate()?.loadScripts();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getTitleAndEp') {
        getAnimeTitleAndEpisode(message.url)
            .then((result) => sendResponse(result))
            .catch((error) => sendResponse({ error: error.message }));
        return true;
    }
});
