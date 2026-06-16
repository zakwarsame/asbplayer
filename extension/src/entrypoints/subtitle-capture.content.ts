import { bufferToBase64 } from '@project/common/base64';

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
    },
});
