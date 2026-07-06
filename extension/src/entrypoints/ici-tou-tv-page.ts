import { extractExtension, inferTracks } from '@/pages/util';

// ICI TOU.TV video is DRM-protected, but closed captions are a plain WebVTT sidecar file whose
// URL is returned by Radio-Canada's media meta API. The API needs the playing media's id and a
// client key. The player fetches those from a code path this script can't observe, so the id is
// resolved from the Next.js SSR payload instead: each show/episode is listed there with its route
// and idMedia, so the entry whose route matches the current path is the one being watched.
const CLIENT_KEY = '773aea60-0e80-41bb-9c7f-e6d7c3ad17fb'; // public toutv media key (also used by yt-dlp)

interface MediaItem {
    url?: string;
    idMedia?: string | number;
}

const collectItems = (value: any, items: MediaItem[]) => {
    if (Array.isArray(value)) {
        for (const entry of value) {
            collectItems(entry, items);
        }
    } else if (value !== null && typeof value === 'object') {
        if (value.idMedia !== undefined) {
            items.push(value);
        }

        for (const entry of Object.values(value)) {
            collectItems(entry, items);
        }
    }
};

const playingIdMedia = (): string | undefined => {
    const nextData = (window as any).__NEXT_DATA__;

    if (nextData === undefined) {
        return undefined;
    }

    const items: MediaItem[] = [];
    collectItems(nextData, items);

    const path = window.location.pathname.replace(/^\/+|\/+$/g, '');
    const routeMatch = items.find((item) => typeof item.url === 'string' && item.url.replace(/^\/+/, '') === path);
    // The call-to-action media is what autoplays on a show landing page (no episode in the path)
    const ctaMatch = ((nextData.props?.pageProps?.data?.header?.cta?.media as MediaItem) ?? {}).idMedia;
    const idMedia = routeMatch?.idMedia ?? ctaMatch ?? items[0]?.idMedia;

    return idMedia === undefined ? undefined : String(idMedia);
};

export default defineUnlistedScript(() => {
    inferTracks({
        onRequest: async (addTrack, setBasename) => {
            setBasename(document.title);

            const idMedia = playingIdMedia();

            if (idMedia === undefined) {
                return;
            }

            try {
                const response = await fetch(
                    `https://services.radio-canada.ca/media/meta/v1/index.ashx?appCode=toutv&idMedia=${idMedia}&client_key=${CLIENT_KEY}&output=json`
                );
                const metas: { name?: string; text?: string }[] = (await response.json())?.Metas ?? [];
                const metaText = (name: string) => metas.find((m) => m.name === name)?.text;
                const captionUrl = metaText('closedCaptionHTML5') ?? metaText('closedCaption');

                if (captionUrl !== undefined) {
                    const url = captionUrl.startsWith('//') ? `https:${captionUrl}` : captionUrl;
                    addTrack({
                        label: 'français',
                        language: 'fr',
                        url,
                        extension: extractExtension(url, 'vtt'),
                    });
                }
            } catch (e) {
                console.error('[asbplayer/toutv] Failed to fetch caption metadata', e);
            }
        },

        waitForBasename: false,
    });
});
