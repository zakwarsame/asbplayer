import { currentPageDelegate } from '@/services/pages';
import { getAnimeTitleAndEpisode } from '@/services/anime-sites';
import type { ContentScriptContext } from '#imports';

const excludeGlobs = ['*://killergerbah.github.io/asbplayer*', '*://app.asbplayer.dev/*'];

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
        currentPageDelegate().then((pageDelegate) => pageDelegate?.loadScripts());

        browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'getTitleAndEp') {
                getAnimeTitleAndEpisode(message.url)
                    .then((result) => sendResponse(result))
                    .catch((error) => sendResponse({ error: error.message }));
                return true;
            }
        });
    },
});
