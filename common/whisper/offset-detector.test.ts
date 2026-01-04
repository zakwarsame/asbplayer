import { detectOffset, interpolateOffset } from './offset-detector';
import { WhisperTranscriptionResult } from './whisper-types';
import { SubtitleModel } from '../src/model';

function subtitle(text: string, start: number, end: number): SubtitleModel {
    return { text, start, end, originalStart: start, originalEnd: end, track: 0 };
}

function transcription(segments: { text: string; start: number; end: number }[]): WhisperTranscriptionResult {
    return {
        segments: segments.map((s) => ({
            text: s.text,
            start: s.start,
            end: s.end,
            words: s.text.split(/\s+/).map((word, i, arr) => {
                const duration = (s.end - s.start) / arr.length;
                return {
                    word,
                    start: s.start + i * duration,
                    end: s.start + (i + 1) * duration,
                };
            }),
        })),
        duration: segments.length > 0 ? segments[segments.length - 1].end : 0,
    };
}

describe('detectOffset', () => {
    it('returns zero offset for empty subtitles', () => {
        const result = detectOffset([], transcription([{ text: 'hello world', start: 0, end: 2 }]));
        expect(result.offset).toBe(0);
        expect(result.confidence).toBe(0);
    });

    it('returns zero offset for empty transcription', () => {
        const result = detectOffset([subtitle('hello world', 0, 2000)], transcription([]));
        expect(result.offset).toBe(0);
        expect(result.confidence).toBe(0);
    });

    it('detects positive offset when subtitles are ahead of audio', () => {
        // Subtitle says "hello world" at 5000ms
        // Whisper detected "hello world" at 3 seconds (audio)
        // Offset = 5000 - 3000 = +2000ms (subtitle is 2s ahead)
        const subs = [subtitle('hello world', 5000, 7000)];
        const trans = transcription([{ text: 'hello world', start: 3, end: 5 }]);

        const result = detectOffset(subs, trans);
        expect(result.offset).toBe(2000);
        expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('detects negative offset when subtitles are behind audio', () => {
        // Subtitle says "hello world" at 1000ms
        // Whisper detected "hello world" at 3 seconds (audio)
        // Offset = 1000 - 3000 = -2000ms (subtitle is 2s behind)
        const subs = [subtitle('hello world', 1000, 3000)];
        const trans = transcription([{ text: 'hello world', start: 3, end: 5 }]);

        const result = detectOffset(subs, trans);
        expect(result.offset).toBe(-2000);
        expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('detects zero offset when subtitles are aligned', () => {
        const subs = [subtitle('hello world', 3000, 5000)];
        const trans = transcription([{ text: 'hello world', start: 3, end: 5 }]);

        const result = detectOffset(subs, trans);
        expect(result.offset).toBe(0);
        expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('handles case-insensitive matching', () => {
        const subs = [subtitle('Hello World', 5000, 7000)];
        const trans = transcription([{ text: 'hello world', start: 3, end: 5 }]);

        const result = detectOffset(subs, trans);
        expect(result.offset).toBe(2000);
    });

    it('ignores punctuation in matching', () => {
        const subs = [subtitle("Hello, world!", 5000, 7000)];
        const trans = transcription([{ text: 'hello world', start: 3, end: 5 }]);

        const result = detectOffset(subs, trans);
        expect(result.offset).toBe(2000);
    });

    it('handles multiple sample points for consistent offset', () => {
        const subs = [
            subtitle('first line', 2000, 4000),
            subtitle('second line', 12000, 14000),
            subtitle('third line', 22000, 24000),
        ];
        const trans = transcription([
            { text: 'first line', start: 0, end: 2 },
            { text: 'second line', start: 10, end: 12 },
            { text: 'third line', start: 20, end: 22 },
        ]);

        const result = detectOffset(subs, trans);
        expect(result.offset).toBe(2000); // Consistent 2s offset
        expect(result.points.length).toBeGreaterThanOrEqual(2);
        expect(result.drift).toBeUndefined(); // No significant drift
    });

    it('detects variable drift when offset changes over time', () => {
        // Offset increases: 2s at start, 4s at middle, 6s at end
        const subs = [
            subtitle('first line', 2000, 4000), // +2s offset
            subtitle('second line', 14000, 16000), // +4s offset
            subtitle('third line', 26000, 28000), // +6s offset
        ];
        const trans = transcription([
            { text: 'first line', start: 0, end: 2 },
            { text: 'second line', start: 10, end: 12 },
            { text: 'third line', start: 20, end: 22 },
        ]);

        const result = detectOffset(subs, trans);
        expect(result.points.length).toBe(3);
        expect(result.drift).toBeDefined();
        expect(result.drift).toBeGreaterThan(0); // Positive drift (increasing offset)
    });

    it('returns low confidence when no matches found', () => {
        const subs = [subtitle('completely different text', 5000, 7000)];
        const trans = transcription([{ text: 'hello world', start: 3, end: 5 }]);

        const result = detectOffset(subs, trans);
        expect(result.confidence).toBe(0);
        expect(result.points.length).toBe(0);
    });
});

describe('detectOffset with Japanese text', () => {
    it('handles Japanese character-by-character matching', () => {
        // Japanese subtitle at 5000ms
        const subs = [subtitle('こんにちは', 5000, 7000)];
        // Whisper output at 3s
        const trans: WhisperTranscriptionResult = {
            segments: [
                {
                    text: 'こんにちは',
                    start: 3,
                    end: 5,
                    words: [
                        { word: 'こ', start: 3.0, end: 3.4 },
                        { word: 'ん', start: 3.4, end: 3.8 },
                        { word: 'に', start: 3.8, end: 4.2 },
                        { word: 'ち', start: 4.2, end: 4.6 },
                        { word: 'は', start: 4.6, end: 5.0 },
                    ],
                },
            ],
            duration: 5,
        };

        const result = detectOffset(subs, trans);
        expect(result.offset).toBe(2000);
        expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('handles mixed Japanese and punctuation', () => {
        const subs = [subtitle('「こんにちは！」', 5000, 7000)];
        const trans: WhisperTranscriptionResult = {
            segments: [
                {
                    text: 'こんにちは',
                    start: 3,
                    end: 5,
                    words: [
                        { word: 'こ', start: 3.0, end: 3.4 },
                        { word: 'ん', start: 3.4, end: 3.8 },
                        { word: 'に', start: 3.8, end: 4.2 },
                        { word: 'ち', start: 4.2, end: 4.6 },
                        { word: 'は', start: 4.6, end: 5.0 },
                    ],
                },
            ],
            duration: 5,
        };

        const result = detectOffset(subs, trans);
        expect(result.offset).toBe(2000);
    });
});

describe('interpolateOffset', () => {
    it('returns constant offset when no drift', () => {
        const result = {
            offset: 2000,
            points: [{ position: 0, offset: 2000, confidence: 0.9 }],
            confidence: 0.9,
        };

        expect(interpolateOffset(0, 60000, result)).toBe(2000);
        expect(interpolateOffset(30000, 60000, result)).toBe(2000);
        expect(interpolateOffset(60000, 60000, result)).toBe(2000);
    });

    it('interpolates between sample points with drift', () => {
        const result = {
            offset: 3000, // Median
            drift: 2000, // 2s drift over full content
            points: [
                { position: 0, offset: 2000, confidence: 0.9 },
                { position: 1, offset: 4000, confidence: 0.9 },
            ],
            confidence: 0.9,
        };

        // At position 0 (start), offset should be 2000
        expect(interpolateOffset(0, 60000, result)).toBe(2000);

        // At position 0.5 (middle), offset should be 3000
        expect(interpolateOffset(30000, 60000, result)).toBe(3000);

        // At position 1 (end), offset should be 4000
        expect(interpolateOffset(60000, 60000, result)).toBe(4000);
    });

    it('interpolates with three sample points', () => {
        const result = {
            offset: 3000,
            drift: 2000,
            points: [
                { position: 0, offset: 2000, confidence: 0.9 },
                { position: 0.5, offset: 3000, confidence: 0.9 },
                { position: 1, offset: 4000, confidence: 0.9 },
            ],
            confidence: 0.9,
        };

        expect(interpolateOffset(0, 60000, result)).toBe(2000);
        expect(interpolateOffset(15000, 60000, result)).toBe(2500); // 0.25 position
        expect(interpolateOffset(30000, 60000, result)).toBe(3000);
        expect(interpolateOffset(45000, 60000, result)).toBe(3500); // 0.75 position
        expect(interpolateOffset(60000, 60000, result)).toBe(4000);
    });
});
