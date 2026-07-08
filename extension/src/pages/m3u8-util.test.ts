import { mergedVttFromM3U8 } from './m3u8-util';

const playlistUrl = 'https://cdn.example.com/subs/media.m3u8?token=abc';

// Modeled on a real Brightcove SSAI subtitle playlist: absolute and relative segment URIs,
// pre-roll and mid-roll ad slots delimited by discontinuities, and cue timestamps that are
// relative to the start of the segment's discontinuity run - NOT to the segment itself, so
// a mid-run segment (4.vtt below) carries cue times greater than its own duration.
const playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-TARGETDURATION:30',
    '#EXTINF:15.015,',
    'https://cdn.example.com/subs/0.vtt',
    '#EXT-X-DISCONTINUITY',
    '#EXTINF:15.015,',
    'https://cdn.example.com/subs/1.vtt',
    '#EXT-X-DISCONTINUITY',
    '#EXTINF:15.015,',
    'https://cdn.example.com/subs/2.vtt',
    '#EXT-X-DISCONTINUITY',
    '#EXTINF:15.015,',
    'https://cdn.example.com/subs/3.vtt',
    '#EXTINF:15.015,',
    '4.vtt',
    '#EXT-X-DISCONTINUITY',
    '#EXTINF:30.000,',
    'https://cdn.example.com/subs/5.vtt',
    '#EXT-X-DISCONTINUITY',
    '#EXTINF:15.015,',
    'https://cdn.example.com/subs/6.vtt',
    '#EXT-X-ENDLIST',
].join('\n');

const emptySegment = 'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n';

const responses: { [url: string]: string } = {
    [playlistUrl]: playlist,
    // Three pre-roll ad slots, then a content run of two segments, a mid-roll slot, and the
    // content run that resumes after it
    'https://cdn.example.com/subs/0.vtt': emptySegment,
    'https://cdn.example.com/subs/1.vtt': emptySegment,
    'https://cdn.example.com/subs/2.vtt': emptySegment,
    'https://cdn.example.com/subs/3.vtt':
        'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n1\n00:01.068 --> 00:02.236 align:center line:10%\n♪♪ Une chanson ♪\n',
    'https://cdn.example.com/subs/4.vtt':
        'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n00:16.000 --> 00:17.500\nBONJOUR\n',
    'https://cdn.example.com/subs/5.vtt': emptySegment,
    'https://cdn.example.com/subs/6.vtt':
        'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n00:00.500 --> 00:01.000\nAPRÈS LA PAUSE\n',
};

beforeEach(() => {
    (globalThis as any).fetch = jest.fn(async (url: string) => {
        const body = responses[url];

        if (body === undefined) {
            throw new Error(`Unexpected URL: ${url}`);
        }

        return { text: async () => body };
    });
});

it('shifts cue timestamps by the playlist offset of each discontinuity run', async () => {
    const vtt = await mergedVttFromM3U8(playlistUrl);
    expect(vtt).toEqual(
        'WEBVTT\n\n' +
            // Content run starts at 45.045 (after three 15.015s ad slots)
            '1\n00:00:46.113 --> 00:00:47.281 align:center line:10%\n♪♪ Une chanson ♪\n\n' +
            // Mid-run segment: run-relative 16.000, not 16.000 into the segment
            '00:01:01.045 --> 00:01:02.545\nBONJOUR\n\n' +
            // Run resuming after the 30s mid-roll starts at 105.075
            '00:01:45.575 --> 00:01:46.075\nAPRÈS LA PAUSE\n'
    );
});

it('resolves relative segment URIs against the playlist URL', async () => {
    await mergedVttFromM3U8(playlistUrl);
    expect((globalThis as any).fetch).toHaveBeenCalledWith('https://cdn.example.com/subs/4.vtt', {
        cache: 'no-store',
    });
});
