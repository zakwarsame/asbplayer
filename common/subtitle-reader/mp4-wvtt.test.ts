import { TextDecoder } from 'util';
import { mergeAbuttingCues, parseWvttSegment } from './mp4-wvtt';

// jsdom does not provide TextDecoder
(globalThis as any).TextDecoder ??= TextDecoder;

// Real DASH fMP4 WebVTT segment from a Crave (9c9media) text track: styp + sidx
// (timescale 90000) + moof (tfdt baseMediaDecodeTime 36792756, trun with 3 samples)
// + mdat with two vttc cues and one empty vtte sample. Cue payloads pad words with
// no-break spaces, which the parser normalizes to plain spaces.
const segmentBase64 =
    'AAAAGHN0eXBpc282AAAAAGlzbzZkYXNoAAAANHNpZHgBAAAAAAAAAQABX5AAAAAAAjFptAAAAAAAAAAAAAAAAQAAAU8ACQbn' +
    'kAAAAAAAAIhtb29mAAAAEG1maGQAAAAAAAAARAAAAHB0cmFmAAAAEHRmaGQAAgAAAAAAAQAAABR0ZmR0AQAAAAAAAAACMWm0' +
    'AAAARHRydW4BAA8BAAAAAwAAAJAAAgQkAAAAXgIAAAAAAAAAAAInVQAAAFkCAAAAAAAAAAAE224AAAAIAgAAAAAAAAAAAADH' +
    'bWRhdAAAAF52dHRjAAAAHXN0dGdsaW5lOjkwJSBhbGlnbjpjZW50ZXIAAAA5cGF5bFdBU8KgSVTCoE5JQ0XCoFRIRVJFP8Kg' +
    'wqDCoMKgwqDCoMKgwqDCoMKgwqDCoMKgwqAAAABZdnR0YwAAAB1zdHRnbGluZTo5MCUgYWxpZ246Y2VudGVyAAAANHBheWxE' +
    'T8KgWU9VwqBNSVNTwqBZT1VSwqBGQU1JTFk/wqDCoMKgwqDCoMKgwqDCoAAAAAh2dHRl';

const segmentBuffer = (): ArrayBuffer => {
    const bytes = Buffer.from(segmentBase64, 'base64');
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
};

it('parses cues with absolute timestamps from a wvtt segment', () => {
    const cues = parseWvttSegment(segmentBuffer());
    expect(cues).toEqual([
        {
            start: 408808,
            end: 410276,
            text: 'WAS IT NICE THERE?',
        },
        {
            start: 410276,
            end: 411844,
            text: 'DO YOU MISS YOUR FAMILY?',
        },
    ]);
});

it('returns no cues for a truncated segment', () => {
    const cues = parseWvttSegment(segmentBuffer().slice(0, 100));
    expect(cues).toEqual([]);
});

it('returns no cues for an empty buffer', () => {
    expect(parseWvttSegment(new ArrayBuffer(0))).toEqual([]);
});

it('merges a cue split across a segment boundary', () => {
    expect(
        mergeAbuttingCues([
            { start: 0, end: 6000, text: 'A LINE THAT\nSPANS A BOUNDARY' },
            { start: 6000, end: 9000, text: 'A LINE THAT\nSPANS A BOUNDARY' },
            { start: 9000, end: 12000, text: 'THE NEXT LINE' },
        ])
    ).toEqual([
        { start: 0, end: 9000, text: 'A LINE THAT\nSPANS A BOUNDARY' },
        { start: 9000, end: 12000, text: 'THE NEXT LINE' },
    ]);
});

it('does not merge abutting cues with different text', () => {
    const cues = [
        { start: 0, end: 6000, text: 'FIRST' },
        { start: 6000, end: 9000, text: 'SECOND' },
    ];
    expect(mergeAbuttingCues(cues)).toEqual(cues);
});

it('does not merge identical text separated by a gap', () => {
    const cues = [
        { start: 0, end: 6000, text: 'REPEATED' },
        { start: 7000, end: 9000, text: 'REPEATED' },
    ];
    expect(mergeAbuttingCues(cues)).toEqual(cues);
});
