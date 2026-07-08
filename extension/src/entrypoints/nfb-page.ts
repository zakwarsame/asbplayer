import { VideoDataSubtitleTrackDef } from '@project/common';
import { subtitleTrackSegmentsFromM3U8 } from '@/pages/m3u8-util';
import { inferTracks } from '@/pages/util';

// NFB.ca / ONF.ca expose a signed HLS master URL via page globals (window.PLAYER_OPTIONS on film
// pages, window.IFRAME_OPTIONS in embed frames); its SUBTITLES rendition is segmented WebVTT.
const masterUrls = (): string[] => {
    const urls = new Set<string>();

    const iframeSource = (window as any).IFRAME_OPTIONS?.source;
    if (typeof iframeSource === 'string') {
        urls.add(iframeSource);
    }

    for (const option of Object.values((window as any).PLAYER_OPTIONS ?? {})) {
        const source = (option as any)?.source;
        if (typeof source === 'string') {
            urls.add(source);
        }
    }

    return [...urls];
};

export default defineUnlistedScript(() => {
    inferTracks({
        onRequest: async (addTrack, setBasename) => {
            setBasename(document.title);

            for (const url of masterUrls()) {
                try {
                    const tracks: VideoDataSubtitleTrackDef[] = await subtitleTrackSegmentsFromM3U8(url);
                    for (const track of tracks) {
                        addTrack(track);
                    }
                } catch (e) {
                    console.error('[asbplayer/nfb] Failed to extract subtitle tracks', e);
                }
            }
        },

        waitForBasename: false,
    });
});
