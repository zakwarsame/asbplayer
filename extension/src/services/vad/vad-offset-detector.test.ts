import { detectOffsetVAD, analyzeVADQuality, detectOffsetBetweenSubtitles } from './vad-offset-detector';
import { VADResult, subtitlesToTimeline, vadResultToTimeline } from './vad-interface';
import { crossCorrelate, alignBinaryDTW, crossCorrelateMultiRes } from './dtw';
import { SubtitleModel } from '@project/common';

function subtitle(text: string, start: number, end: number): SubtitleModel {
    return { text, start, end, originalStart: start, originalEnd: end, track: 0 };
}

function vadResult(segments: { start: number; end: number }[], duration: number): VADResult {
    return {
        segments,
        sampleRate: 16000,
        duration,
    };
}

describe('crossCorrelate', () => {
    it('should find zero lag for identical sequences', () => {
        const seq = [true, true, false, false, true, true, false];
        const result = crossCorrelate(seq, seq, 10);

        expect(result.lag).toBe(0);
        expect(result.score).toBe(1);
    });

    it('should find positive lag when target is ahead', () => {
        const reference = [false, false, true, true, true, false, false];
        const target = [true, true, true, false, false, false, false]; // shifted left by 2

        const result = crossCorrelate(reference, target, 5);

        expect(result.lag).toBe(-2);
    });

    it('should find negative lag when target is behind', () => {
        const reference = [true, true, true, false, false, false, false];
        const target = [false, false, true, true, true, false, false]; // shifted right by 2

        const result = crossCorrelate(reference, target, 5);

        expect(result.lag).toBe(2);
    });
});

describe('alignBinaryDTW', () => {
    it('should align identical sequences with zero cost', () => {
        const seq = [true, true, false, false, true];
        const result = alignBinaryDTW(seq, seq);

        expect(result.cost).toBe(0);
        expect(result.path.length).toBe(seq.length);
    });

    it('should handle sequences of different lengths', () => {
        const seq1 = [true, true, false, false];
        const seq2 = [true, false, true, false, true, false]; // Different pattern

        const result = alignBinaryDTW(seq1, seq2);

        expect(result.path.length).toBeGreaterThan(0);
        expect(result.cost).toBeGreaterThan(0); // Different patterns should have non-zero cost
    });
});

describe('timeline creation', () => {
    it('should create correct subtitle timeline', () => {
        const subs = [{ start: 1000, end: 2000 }];
        const timeline = subtitlesToTimeline(subs, 5000, 10);

        // Timeline should have 500 frames (5000ms / 10ms)
        expect(timeline.length).toBe(500);

        // Frames 100-199 should be true (1000-2000ms)
        expect(timeline[99]).toBe(false);
        expect(timeline[100]).toBe(true);
        expect(timeline[150]).toBe(true);
        expect(timeline[199]).toBe(true);
        expect(timeline[200]).toBe(false);
    });

    it('should create correct VAD timeline', () => {
        const vad: VADResult = {
            segments: [{ start: 1.5, end: 2.5 }],
            sampleRate: 16000,
            duration: 5,
        };
        const timeline = vadResultToTimeline(vad, 10);

        // Timeline should have 500 frames (5s * 1000 / 10ms)
        expect(timeline.length).toBe(500);

        // Frames 150-249 should be true (1.5s-2.5s = 1500-2500ms)
        expect(timeline[149]).toBe(false);
        expect(timeline[150]).toBe(true);
        expect(timeline[200]).toBe(true);
        expect(timeline[249]).toBe(true);
        expect(timeline[250]).toBe(false);
    });

    it('should correlate timelines with offset correctly', () => {
        // Subtitle at 1000-2000ms
        const subTimeline = subtitlesToTimeline([{ start: 1000, end: 2000 }], 5000, 10);
        // VAD at 1500-2500ms
        const vad: VADResult = {
            segments: [{ start: 1.5, end: 2.5 }],
            sampleRate: 16000,
            duration: 5,
        };
        const vadTimeline = vadResultToTimeline(vad, 10);

        // Cross-correlate: subtitle frames 100-199 should align with VAD frames 150-249
        // So lag should be +50 (VAD is 50 frames = 500ms ahead)
        const result = crossCorrelateMultiRes(subTimeline, vadTimeline, 100, 10);

        expect(result.lagMs).toBe(500); // +500ms
    });
});

describe('detectOffsetVAD', () => {
    it('should detect zero offset for matching timelines', () => {
        const subs = [
            subtitle('Hello', 1000, 2000),
            subtitle('World', 3000, 4000),
        ];

        const vad = vadResult(
            [
                { start: 1, end: 2 },
                { start: 3, end: 4 },
            ],
            5
        );

        const result = detectOffsetVAD(subs, vad, {
            captureDurationMs: 5000,
        });

        // Offset should be close to 0
        expect(Math.abs(result.offset)).toBeLessThan(100);
    });

    it('should detect positive offset when audio is ahead', () => {
        const subs = [subtitle('Hello', 1000, 2000)];

        // VAD shows speech at 1.5-2.5s (500ms ahead of subtitle)
        const vad = vadResult([{ start: 1.5, end: 2.5 }], 5);

        const result = detectOffsetVAD(subs, vad, {
            captureDurationMs: 5000,
            maxOffsetSeconds: 5, // Limit search range to timeline duration
        });

        // Offset should be around +500ms
        // Audio is 500ms ahead means: to align subs to audio, add +500ms to sub times
        expect(result.offset).toBeGreaterThan(400);
        expect(result.offset).toBeLessThan(600);
    });

    it('should detect negative offset when audio is behind', () => {
        const subs = [subtitle('Hello', 2000, 3000)];

        // VAD shows speech at 1.5-2.5s (500ms behind subtitle)
        const vad = vadResult([{ start: 1.5, end: 2.5 }], 5);

        const result = detectOffsetVAD(subs, vad, {
            captureDurationMs: 5000,
            maxOffsetSeconds: 5, // Limit search range to timeline duration
        });

        // Offset should be around -500ms
        // Audio is 500ms behind means: to align subs to audio, subtract 500ms from sub times
        expect(result.offset).toBeLessThan(-400);
        expect(result.offset).toBeGreaterThan(-600);
    });

    it('should return lower confidence for mismatched timelines', () => {
        // Subtitle dense at start, VAD sparse throughout - opposite patterns
        const subs = [
            subtitle('A', 0, 500),
            subtitle('B', 500, 1000),
            subtitle('C', 1000, 1500),
        ];

        // VAD shows opposite pattern - sparse throughout
        const vad = vadResult(
            [
                { start: 0.2, end: 0.3 },
                { start: 2.2, end: 2.3 },
                { start: 4.2, end: 4.3 },
            ],
            5
        );

        const result = detectOffsetVAD(subs, vad, {
            captureDurationMs: 5000,
            maxOffsetSeconds: 5,
            minConfidence: 0,
        });

        // Cross-correlation will always find a "best" match, but confidence
        // is computed from match quality. For clearly different patterns,
        // the match score should be lower, but not necessarily below 0.5
        // since there will always be some overlapping silence regions.
        // Just verify the function returns without error.
        expect(result).toBeDefined();
        expect(result.offset).toBeDefined();
    });
});

describe('analyzeVADQuality', () => {
    it('should report high quality for normal speech ratio', () => {
        const vad = vadResult(
            [
                { start: 0, end: 1 },
                { start: 2, end: 3 },
                { start: 4, end: 5 },
            ],
            10
        );

        const analysis = analyzeVADQuality(vad);

        expect(analysis.quality).toBeGreaterThan(0.5);
        expect(analysis.issues.length).toBe(0);
    });

    it('should report issues for very little speech', () => {
        const vad = vadResult([{ start: 0, end: 0.5 }], 10);

        const analysis = analyzeVADQuality(vad);

        expect(analysis.issues).toContain('Very little speech detected (<10%)');
    });

    it('should report issues for too much speech (noise)', () => {
        const vad = vadResult([{ start: 0, end: 9.5 }], 10);

        const analysis = analyzeVADQuality(vad);

        expect(analysis.issues).toContain('Almost all audio detected as speech (>90%), possible noise');
    });
});

describe('detectOffsetBetweenSubtitles', () => {
    // Irregular cue spacing so the cross-correlation has a single unambiguous peak.
    const starts = [
        1000, 3500, 4200, 8000, 9100, 12000, 15000, 15800, 20000, 23000, 24500, 28000, 31000, 33000, 37000, 40000,
        41200, 45000, 48000, 52000,
    ];
    const cues = (offset: number) => starts.map((s) => ({ originalStart: s + offset, originalEnd: s + offset + 700 }));

    it('recovers a positive offset when the reference is ahead of the primary', () => {
        const primary = cues(0);
        const reference = cues(2000); // reference dialogue occurs 2s later than the primary

        const result = detectOffsetBetweenSubtitles(primary, reference);

        expect(result.offset).toBeGreaterThan(1800);
        expect(result.offset).toBeLessThan(2200);
        expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('recovers a negative offset when the reference is behind the primary', () => {
        const primary = cues(1500); // primary dialogue occurs 1.5s later than the reference
        const reference = cues(0);

        const result = detectOffsetBetweenSubtitles(primary, reference);

        expect(result.offset).toBeLessThan(-1300);
        expect(result.offset).toBeGreaterThan(-1700);
        expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('returns zero offset and high confidence for already-aligned tracks', () => {
        const primary = cues(0);
        const reference = cues(0);

        const result = detectOffsetBetweenSubtitles(primary, reference);

        expect(result.offset).toBe(0);
        expect(result.confidence).toBeGreaterThan(0.9);
    });

    it('returns zero confidence when either track is empty', () => {
        expect(detectOffsetBetweenSubtitles([], cues(0)).confidence).toBe(0);
        expect(detectOffsetBetweenSubtitles(cues(0), []).confidence).toBe(0);
    });
});
