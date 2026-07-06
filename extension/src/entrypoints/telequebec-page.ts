import { uint8ArrayToBase64 } from '@project/common/base64';
import { fetchM3U8, mergedVttFromM3U8 } from '@/pages/m3u8-util';
import { inferTracks, interceptResourceUrls, resourceUrlsFromPerformanceTimeline } from '@/pages/util';

// Télé-Québec plays back via Brightcove with server-side ad insertion. Subtitle tracks are
// declared in the HLS master manifest as segmented WebVTT renditions whose cue timestamps are
// relative to each segment, so the segments are merged into a single retimed WebVTT document.
// The master URL is captured from the player's own requests; requests made before this script
// is injected are recovered from the performance timeline.
export default defineUnlistedScript(() => {
    const masterUrlRegex = /https:\/\/[^"'\s]*manifest\.prod\.boltdns\.net\/[^"'\s]*master\.m3u8/i;

    let masterUrl: string | undefined;

    const inspect = (url: string) => {
        if (masterUrlRegex.test(url)) {
            masterUrl = url;
        }
    };

    interceptResourceUrls(inspect);

    inferTracks({
        onRequest: async (addTrack, setBasename) => {
            setBasename(document.title);
            resourceUrlsFromPerformanceTimeline(inspect);

            if (masterUrl === undefined) {
                return;
            }

            try {
                const manifest = await fetchM3U8(masterUrl);
                const subtitleGroups = manifest.mediaGroups?.SUBTITLES ?? {};

                for (const group of Object.values(subtitleGroups)) {
                    if (typeof group !== 'object' || !group) {
                        continue;
                    }

                    for (const [label, track] of Object.entries(group)) {
                        if (typeof track?.uri !== 'string' || label.includes('--forced--')) {
                            continue;
                        }

                        const vtt = await mergedVttFromM3U8(new URL(track.uri, masterUrl).href);

                        if (!vtt.includes('-->')) {
                            continue;
                        }

                        addTrack({
                            label,
                            language: typeof track.language === 'string' ? track.language : '',
                            url: `data:text/plain;base64,${uint8ArrayToBase64(new TextEncoder().encode(vtt))}`,
                            extension: 'vtt',
                        });
                    }
                }
            } catch (e) {
                console.error('[asbplayer/telequebec] Failed to extract subtitle tracks', e);
            }
        },

        waitForBasename: false,
    });
});
