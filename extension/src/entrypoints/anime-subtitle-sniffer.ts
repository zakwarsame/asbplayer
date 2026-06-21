// Forwards subtitle responses the player fetches (incl. the opaque/proxied/referer-gated URLs the
// webRequest capture can't match) to the content script. Runs in the page so it reads the body the
// player already received. Injected on video sites (and elsewhere when the capture setting is on).
export default defineUnlistedScript(() => {
    // Content-types that can't be a subtitle or a sources JSON; skip reading their bodies entirely so
    // busy sites (YouTube/Netflix) don't pay for every response. Subtitle bodies (text/plain, text/vtt,
    // octet-stream, or no content-type) and JSON still pass.
    const SKIP_CONTENT_TYPE =
        /(video|audio|image|font)\/|dash\+xml|mpegurl|html|css|javascript|ecmascript|wasm|protobuf/i;
    const MAX_BYTES = 2_000_000;
    const MAX_TRACKS = 30;
    const seen = new Set<string>();

    // Track languages from the site's sources JSON, used to label captured subtitles instead of "CC".
    const urlToLang = new Map<string, string>();
    let lastLangs: string[] = [];

    // Keys a sources JSON uses for a track's language. The pre-check and the walk both derive from
    // this one list so they can't drift out of sync.
    const LANG_KEYS = ['lang', 'language', 'srclang'];
    const langKeyRegex = new RegExp(`"(${LANG_KEYS.join('|')})"`);

    const classify = (text: string): string | undefined => {
        const head = text.trimStart().slice(0, 1000); // trimStart drops a leading BOM
        if (head.startsWith('WEBVTT')) return 'vtt';
        if (/\[Script Info\]/i.test(head)) return 'ass';
        if (/\d+\s*\r?\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(head)) return 'srt';
        return undefined;
    };

    const harvestLangs = (text: string) => {
        const trimmed = text.trimStart();
        if (trimmed[0] !== '{' && trimmed[0] !== '[') return;
        if (!langKeyRegex.test(trimmed)) return; // cheap pre-check: avoid JSON.parse on JSON that can't list tracks
        let json: unknown;
        try {
            json = JSON.parse(trimmed);
        } catch {
            return;
        }
        const langs: string[] = [];
        let nodes = 0;
        const walk = (value: any, depth: number) => {
            if (nodes++ > 5000 || depth > 6 || value === null || typeof value !== 'object') return;
            let lang: unknown;
            for (const key of LANG_KEYS) {
                if (value[key] != null) {
                    lang = value[key];
                    break;
                }
            }
            if (typeof lang === 'string' && lang) {
                const url = value.url ?? value.src ?? value.file ?? value.uri;
                if (typeof url === 'string' && url) urlToLang.set(url, lang);
                langs.push(lang);
            }
            for (const child of Object.values(value)) walk(child, depth + 1);
        };
        walk(json, 0);
        if (langs.length) lastLangs = langs;
    };

    // Proxied URLs (animex) won't match the JSON's url; fall back to the sole listed track.
    const langForSubtitle = (url: string): string | undefined =>
        urlToLang.get(url) ?? (lastLangs.length === 1 ? lastLangs[0] : undefined);

    const process = (url: string, text: string) => {
        try {
            if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;
            const extension = classify(text);
            if (!extension) {
                harvestLangs(text);
                return;
            }
            if (/\.(vtt|srt|ass)(\?|$)/i.test(url)) return; // direct files: handled by the webRequest path
            if (url.includes('jimaku.cc')) return; // already surfaced as its own track
            if (seen.has(url) || seen.size >= MAX_TRACKS) return;
            seen.add(url);
            window.postMessage(
                { source: 'asbplayer-anime-subtitle', url, text, extension, lang: langForSubtitle(url) },
                '*'
            );
        } catch {
            // ignore
        }
    };

    const sniffable = (contentType: string | null, contentLength: string | null) => {
        if (contentType && SKIP_CONTENT_TYPE.test(contentType)) return false;
        if (contentLength && Number(contentLength) > MAX_BYTES) return false;
        return true;
    };

    const originalFetch = window.fetch;
    window.fetch = (...args: Parameters<typeof window.fetch>) => {
        const promise = originalFetch(...args);
        promise
            .then((res) => {
                if (!res.ok || !sniffable(res.headers.get('content-type'), res.headers.get('content-length'))) {
                    return;
                }
                res.clone()
                    .text()
                    .then((text) => process(res.url, text))
                    .catch(() => {});
            })
            .catch(() => {});
        return promise;
    };

    const originalXhrSend = window.XMLHttpRequest.prototype.send;
    window.XMLHttpRequest.prototype.send = function () {
        this.addEventListener('load', function (this: XMLHttpRequest) {
            try {
                if (!sniffable(this.getResponseHeader('content-type'), this.getResponseHeader('content-length'))) {
                    return;
                }
                if (this.responseType === '' || this.responseType === 'text') {
                    process(this.responseURL, this.responseText);
                } else if (this.responseType === 'arraybuffer' && this.response instanceof ArrayBuffer) {
                    process(this.responseURL, new TextDecoder().decode(this.response));
                }
            } catch {
                // ignore
            }
        });

        // @ts-ignore
        return originalXhrSend.apply(this, arguments);
    };
});
