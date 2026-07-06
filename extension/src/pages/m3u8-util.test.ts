import { mergedVttFromM3U8 } from './m3u8-util';

const playlistUrl = 'https://cdn.example.com/subs/media.m3u8?token=abc';

// Modeled on a real Brightcove SSAI subtitle playlist: absolute and relative segment URIs,
// discontinuities at ad boundaries, empty ad-slot segments, and cue timestamps relative to
// each segment rather than to the track.
const playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-TARGETDURATION:30',
    '#EXTINF:15.015,',
    'https://cdn.example.com/subs/0.vtt',
    '#EXT-X-DISCONTINUITY',
    '#EXTINF:15.015,',
    '1.vtt',
    '#EXT-X-DISCONTINUITY',
    '#EXTINF:15.015,',
    'https://cdn.example.com/subs/2.vtt',
    '#EXTINF:15.082,',
    'https://cdn.example.com/subs/3.vtt',
    '#EXT-X-ENDLIST',
].join('\n');

const emptySegment = 'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n';

const responses: { [url: string]: string } = {
    [playlistUrl]: playlist,
    'https://cdn.example.com/subs/0.vtt': emptySegment,
    'https://cdn.example.com/subs/1.vtt':
        'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n00:00:01.000 --> 00:00:02.500\nBONJOUR\n',
    'https://cdn.example.com/subs/2.vtt': emptySegment,
    'https://cdn.example.com/subs/3.vtt':
        'WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:0\n\n1\n00:01.068 --> 00:02.236 align:center line:10%\n♪♪ Une chanson ♪\n',
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

it('merges segments into one vtt with cue timestamps shifted to the playlist timeline', async () => {
    const vtt = await mergedVttFromM3U8(playlistUrl);
    expect(vtt).toEqual(
        'WEBVTT\n\n' +
            '00:00:16.015 --> 00:00:17.515\nBONJOUR\n\n' +
            '1\n00:00:46.113 --> 00:00:47.281 align:center line:10%\n♪♪ Une chanson ♪\n'
    );
});

it('resolves relative segment URIs against the playlist URL', async () => {
    await mergedVttFromM3U8(playlistUrl);
    expect((globalThis as any).fetch).toHaveBeenCalledWith('https://cdn.example.com/subs/1.vtt', {
        cache: 'no-store',
    });
});
