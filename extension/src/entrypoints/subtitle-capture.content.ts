import { bufferToBase64, uint8ArrayToBase64 } from '@project/common/base64';
import { isVideoSite } from '@/services/anime-sites';
import { SettingsProvider } from '@project/common/settings';
import { ExtensionSettingsStorage } from '@/services/extension-settings-storage';
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

        // Inject the page-context sniffer (captures subtitles served via opaque/proxied URLs) on video
        // sites; on other sites only when the user opts in via streamingCaptureSiteSubtitles.
        (async () => {
            const settings = new SettingsProvider(new ExtensionSettingsStorage());
            if (!isVideoSite(location.href) && !(await settings.getSingle('streamingCaptureSiteSubtitles'))) {
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
        })();
    },
});
