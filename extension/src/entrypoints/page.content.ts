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

        // Listen for custom events from page scripts
        document.addEventListener('asbplayer-get-anime-info', async (event) => {
            const customEvent = event as CustomEvent;
            const { url } = customEvent.detail;

            try {
                const result = await getAnimeTitleAndEpisode(url);
                document.dispatchEvent(
                    new CustomEvent('asbplayer-anime-info-response', {
                        detail: result,
                    })
                );
            } catch (error) {
                document.dispatchEvent(
                    new CustomEvent('asbplayer-anime-info-response', {
                        detail: { error: error instanceof Error ? error.message : String(error) },
                    })
                );
            }
        });

        document.addEventListener('asbplayer-get-api-key', async () => {
            try {
                const result = await browser.storage.local.get('apiKey');
                document.dispatchEvent(
                    new CustomEvent('asbplayer-api-key-response', {
                        detail: { apiKey: result.apiKey || '' },
                    })
                );
            } catch (error) {
                document.dispatchEvent(
                    new CustomEvent('asbplayer-api-key-response', {
                        detail: { apiKey: '' },
                    })
                );
            }
        });
    },
});
