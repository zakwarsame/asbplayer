import { inferTracksFromInterceptedMpdViaResourceUrl } from '@/pages/mpd-util';

// Crave (Bell Media) streams Widevine DASH from stream.video.9c9media.com, with URLs authorized
// by an expiring `pnkh` query token so they are fetchable in-page without extra headers. Closed
// captions are fMP4 WebVTT ("wvtt") text tracks declared in the DASH manifest. The manifest URL
// is derived from any observed `…/dash/{drm}/{quality}/…` stream request because the player may
// fetch the manifest once, before this script is injected.
const dashResourceRegex = /^(https:\/\/[^/]*9c9media\.com\/[^?]*\/dash\/[^/]+\/[^/]+\/)[^?]*(\?.*)?$/i;

export default defineUnlistedScript(() => {
    inferTracksFromInterceptedMpdViaResourceUrl(
        (url) => {
            const match = url.match(dashResourceRegex);
            return match === null ? undefined : `${match[1]}manifest.mpd${match[2] ?? ''}`;
        },
        (playlist, language) => {
            const segmentUrls = playlist.segments.map((s) => s.resolvedUri);
            return segmentUrls.length === 0
                ? undefined
                : { label: language, language, url: segmentUrls, extension: 'm4s' };
        }
    );
});
