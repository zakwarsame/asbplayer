// Sniffs subtitle responses (WEBVTT / ASS / SRT) the page's player fetches, covering the opaque,
// proxied, sometimes referer-gated URLs the background webRequest capture can't match or re-fetch
// (animetsu, animex). Runs in the page (MAIN world) so it reads the body the player already received,
// then hands the text to the content script via window.postMessage. Injected only on anime sites.
export default defineUnlistedScript(() => {
    const SKIP_CONTENT_TYPE = /(video|audio|image)\/|dash\+xml|mpegurl/i;
    const MAX_BYTES = 2_000_000;
    const MAX_TRACKS = 30;
    const seen = new Set<string>();

    // Languages harvested from the site's "sources" JSON (animetsu subs[], animex tracks[]) so a
    // captured subtitle can be labelled with its real language instead of a generic "CC".
    const urlToLang = new Map<string, string>();
    let lastLangs: string[] = [];

    const classify = (text: string): string | undefined => {
        const head = text.trimStart().slice(0, 1000); // trimStart drops a leading UTF-8 BOM
        if (head.startsWith('WEBVTT')) return 'vtt';
        if (/\[Script Info\]/i.test(head)) return 'ass';
        if (/\d+\s*\r?\n\d{2}:\d{2}:\d{2},\d{3}\s*-->/.test(head)) return 'srt';
        return undefined;
    };

    // Walk a parsed sources JSON for subtitle descriptors (objects carrying a language field, usually
    // alongside a url). Bounded so a pathological payload can't hang the page.
    const harvestLangs = (text: string) => {
        const trimmed = text.trimStart();
        if (trimmed[0] !== '{' && trimmed[0] !== '[') return;
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
            const lang = value.lang ?? value.language ?? value.srclang;
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

    const langForSubtitle = (url: string): string | undefined => {
        const exact = urlToLang.get(url);
        if (exact) return exact;
        for (const [u, lang] of urlToLang) {
            if (u && (url.includes(u) || u.includes(url))) return lang;
        }
        // Proxied subtitle URLs (e.g. animex) don't match the JSON's url; when the sources JSON listed
        // exactly one track, it's unambiguously this one.
        return lastLangs.length === 1 ? lastLangs[0] : undefined;
    };

    const process = (url: string, text: string) => {
        try {
            if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;
            const extension = classify(text);
            if (!extension) {
                harvestLangs(text);
                return;
            }
            if (/\.(vtt|srt|ass)(\?|$)/i.test(url)) return; // direct files are handled by the webRequest path
            if (url.includes('jimaku.cc')) return; // the fork already surfaces Jimaku separately
            if (seen.has(url) || seen.size >= MAX_TRACKS) return;
            seen.add(url);
            window.postMessage(
                { source: 'asbplayer-anime-subtitle', url, text, extension, lang: langForSubtitle(url) },
                '*'
            );
        } catch {
            // never break the page
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
                // never break the page
            }
        });

        // @ts-ignore
        return originalXhrSend.apply(this, arguments);
    };
});
