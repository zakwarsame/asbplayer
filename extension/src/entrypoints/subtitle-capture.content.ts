import { bufferToBase64, uint8ArrayToBase64 } from '@project/common/base64';
import { isAnimeSite } from '@/services/anime-sites';
import type { PublicPath } from 'wxt/browser';

export default defineContentScript({
    matches: ['<all_urls>'],
    allFrames: true,
    runAt: 'document_start',

    main() {
        browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
            if (message?.command !== 'fetch-network-subtitle') {
                return;
            }

            // Fetch uncredentialed: the CDN serves subtitles with wildcard CORS (ACAO *), which the
            // browser refuses to pair with credentials. Running here, in the page frame, also avoids
            // the 403 a background service-worker fetch gets.
            fetch(message.url)
                .then(async (r) => {
                    if (!r.ok) {
                        sendResponse({ success: false, status: r.status });
                        return;
                    }
                    const buffer = await r.arrayBuffer();
                    sendResponse({ success: true, base64: bufferToBase64(buffer), size: buffer.byteLength });
                })
                .catch((e) => sendResponse({ success: false, error: String(e) }));
            return true;
        });

        // Anime sites serve subtitles through opaque/proxied/referer-gated URLs the background capture
        // can't match or re-fetch. Inject a page-context sniffer that reads the subtitle body the
        // player already received and relay it to the background capture service.
        if (!isAnimeSite(location.href)) {
            return;
        }

        const script = document.createElement('script');
        script.src = browser.runtime.getURL('/anime-subtitle-sniffer.js' as PublicPath);
        script.onload = () => script.remove();
        (document.head || document.documentElement).appendChild(script);

        window.addEventListener('message', (event) => {
            if (event.source !== window || event.data?.source !== 'asbplayer-anime-subtitle') {
                return;
            }
            const { url, text, extension, lang } = event.data;
            if (typeof text !== 'string' || !text) {
                return;
            }
            browser.runtime.sendMessage({
                command: 'captured-subtitle',
                url,
                extension,
                lang,
                base64: uint8ArrayToBase64(new TextEncoder().encode(text)),
            });
        });
    },
});
