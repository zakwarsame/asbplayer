/**
 * VAD-based offset detection for subtitle synchronization.
 *
 * This approach (similar to alass) works by:
 * 1. Running VAD on captured audio to get speech/silence timeline
 * 2. Converting subtitle timings to expected speech/silence timeline
 * 3. Cross-correlating or using DTW to find optimal alignment
 *
 * Advantages:
 * - Language agnostic (no transcription needed)
 * - Fast (~1s vs 30-60s for Whisper)
 * - Small bundle (~100-200KB vs 150MB for Whisper)
 *
 * Limitations:
 * - Less accurate for content with unusual speech patterns
 * - Can be confused by background music/noise
 */

import { SubtitleModel } from '@project/common';
import { OffsetPoint, OffsetResult } from '../sync/offset-detector';
import { crossCorrelate, alignBinaryDTW } from './dtw';
import { VADEngine, VADResult, vadResultToTimeline, subtitlesToTimeline } from './vad-interface';

export interface VADOffsetOptions {
    /** Frame size for timeline conversion (ms). Default: 10 */
    frameSizeMs?: number;
    /** Maximum offset to search in seconds. Default: 300 (5 min) */
    maxOffsetSeconds?: number;
    /** Use DTW instead of cross-correlation. More accurate but slower. Default: false */
    useDTW?: boolean;
    /** Start time of the audio capture relative to video start (ms). Default: 0 */
    captureStartTimeMs?: number;
    /** Duration of the captured audio (ms). Required for partial captures. */
    captureDurationMs?: number;
    /** Minimum confidence threshold to return a result. Default: 0.3 */
    minConfidence?: number;
}

/**
 * Detect subtitle offset using VAD-based alignment.
 *
 * @param subtitles Array of subtitle models
 * @param vadResult VAD result from processing captured audio
 * @param options Detection options
 * @returns Offset result compatible with Whisper-based detector
 */
export function detectOffsetVAD(
    subtitles: SubtitleModel[],
    vadResult: VADResult,
    options?: VADOffsetOptions
): OffsetResult {
    const {
        frameSizeMs = 10,
        maxOffsetSeconds = 300,
        useDTW = false,
        captureStartTimeMs = 0,
        captureDurationMs,
        minConfidence = 0.3,
    } = options || {};

    if (subtitles.length === 0 || vadResult.segments.length === 0) {
        return { offset: 0, points: [], confidence: 0 };
    }

    // Calculate the time range covered by the captured audio
    const captureStartSec = captureStartTimeMs / 1000;
    const captureDurationSec = captureDurationMs ? captureDurationMs / 1000 : vadResult.duration;
    const captureEndSec = captureStartSec + captureDurationSec;

    // Convert VAD result to binary timeline
    const vadTimeline = vadResultToTimeline(vadResult, frameSizeMs);

    // Find subtitles that overlap with the capture window
    const relevantSubtitles = subtitles.filter((sub) => {
        const subStartSec = sub.originalStart / 1000;
        const subEndSec = sub.originalEnd / 1000;
        return subEndSec > captureStartSec && subStartSec < captureEndSec;
    });

    if (relevantSubtitles.length === 0) {
        return { offset: 0, points: [], confidence: 0 };
    }

    // Convert subtitles to binary timeline
    // Adjust subtitle times relative to capture start
    const adjustedSubtitles = relevantSubtitles.map((sub) => ({
        start: sub.originalStart - captureStartTimeMs,
        end: sub.originalEnd - captureStartTimeMs,
    }));

    const subtitleTimeline = subtitlesToTimeline(adjustedSubtitles, captureDurationSec * 1000, frameSizeMs);

    // Check signal density - need enough speech in both timelines for reliable correlation
    const vadSpeechCount = vadTimeline.filter((x) => x).length;
    const subSpeechCount = subtitleTimeline.filter((x) => x).length;
    const vadSpeechRatio = vadTimeline.length > 0 ? vadSpeechCount / vadTimeline.length : 0;
    const subSpeechRatio = subtitleTimeline.length > 0 ? subSpeechCount / subtitleTimeline.length : 0;

    console.log('[VAD] Timeline stats:', {
        vadFrames: vadTimeline.length,
        vadSpeechRatio: (vadSpeechRatio * 100).toFixed(1) + '%',
        subFrames: subtitleTimeline.length,
        subSpeechRatio: (subSpeechRatio * 100).toFixed(1) + '%',
    });

    // Need at least 10% speech in both timelines for reliable correlation
    if (vadSpeechRatio < 0.1 || subSpeechRatio < 0.1) {
        console.log('[VAD] Insufficient speech density, returning low confidence');
        return { offset: 0, points: [], confidence: 0 };
    }

    // Limit search range to capture duration - can't meaningfully search beyond
    const captureFrames = Math.ceil((captureDurationSec * 1000) / frameSizeMs);
    const maxLagSamples = captureFrames;

    let offsetMs: number;
    let confidence: number;

    if (useDTW) {
        // Use DTW for more accurate alignment (handles non-linear drift)
        const dtwResult = alignBinaryDTW(subtitleTimeline, vadTimeline, {
            windowFraction: 0.3,
        });

        // Extract offset from DTW path
        // The average difference between aligned indices gives the offset
        if (dtwResult.path.length > 0) {
            let totalDiff = 0;
            for (const [i, j] of dtwResult.path) {
                totalDiff += (j - i) * frameSizeMs;
            }
            offsetMs = totalDiff / dtwResult.path.length;
            confidence = 1 - dtwResult.normalizedCost;
        } else {
            offsetMs = 0;
            confidence = 0;
        }
    } else {
        // Use cross-correlation for constant offset detection (faster)
        const corrResult = crossCorrelate(subtitleTimeline, vadTimeline, maxLagSamples);

        offsetMs = corrResult.lag * frameSizeMs;
        confidence = corrResult.confidence;
    }

    // Adjust offset to account for capture start time
    // The offset is relative to the capture window, so we don't need additional adjustment
    // since we already adjusted the subtitle times

    if (confidence < minConfidence) {
        return { offset: 0, points: [], confidence };
    }

    // Create offset points for compatibility with existing system
    const points: OffsetPoint[] = [
        {
            position: 0.5, // Center of the capture
            offset: Math.round(offsetMs),
            confidence,
        },
    ];

    return {
        offset: Math.round(offsetMs),
        points,
        confidence,
    };
}

export interface SubtitleSyncOffsetOptions {
    /** Coarse frame size for timeline conversion (ms). Default: 100 */
    coarseFrameMs?: number;
    /** Maximum offset to search in seconds. Default: 120 */
    maxOffsetSec?: number;
    /** Minimum confidence threshold to return a non-zero offset. Default: 0.3 */
    minConfidence?: number;
}

/**
 * Detect the constant offset (ms) to apply to a primary subtitle track so its cue timing aligns
 * to a reference track. Language-agnostic: compares timing only. Runs coarse (~100ms frames) so a
 * full episode scores in milliseconds.
 */
export function detectOffsetBetweenSubtitles(
    primary: { originalStart: number; originalEnd: number }[],
    reference: { originalStart: number; originalEnd: number }[],
    options?: SubtitleSyncOffsetOptions
): OffsetResult {
    const { coarseFrameMs = 100, maxOffsetSec = 120, minConfidence = 0.3 } = options || {};

    if (primary.length === 0 || reference.length === 0) {
        return { offset: 0, points: [], confidence: 0 };
    }

    const maxEnd = (subs: { originalEnd: number }[]) => subs.reduce((m, c) => Math.max(m, c.originalEnd), 0);
    const span = Math.max(maxEnd(primary), maxEnd(reference));

    if (!isFinite(span) || span <= 0) {
        return { offset: 0, points: [], confidence: 0 };
    }

    const toCues = (subs: { originalStart: number; originalEnd: number }[]) =>
        subs.map((c) => ({ start: c.originalStart, end: c.originalEnd }));

    const primaryTimeline = subtitlesToTimeline(toCues(primary), span, coarseFrameMs);
    const referenceTimeline = subtitlesToTimeline(toCues(reference), span, coarseFrameMs);

    // Too-sparse tracks (signs/songs) can't be correlated reliably.
    const density = (t: boolean[]) => (t.length > 0 ? t.filter((x) => x).length / t.length : 0);
    if (density(primaryTimeline) < 0.1 || density(referenceTimeline) < 0.1) {
        return { offset: 0, points: [], confidence: 0 };
    }

    const frameCount = primaryTimeline.length;
    const maxLag = Math.min(Math.ceil((maxOffsetSec * 1000) / coarseFrameMs), frameCount - 1);
    const primaryActiveTotal = primaryTimeline.filter((x) => x).length;
    const referenceActiveTotal = referenceTimeline.filter((x) => x).length;
    // Without this, a coincidental 1-frame overlap at an extreme lag scores a perfect Jaccard of 1.
    const minActiveOverlap = Math.max(3, Math.floor(0.2 * Math.min(primaryActiveTotal, referenceActiveTotal)));

    let bestLag = 0;
    let bestScore = 0;

    // Positive lag => reference is ahead of the primary, so the primary shifts forward to match.
    for (let lag = -maxLag; lag <= maxLag; lag++) {
        const iStart = Math.max(0, -lag);
        const iEnd = Math.min(frameCount, frameCount - lag);
        let both = 0;
        let primaryActive = 0;
        let referenceActive = 0;

        for (let i = iStart; i < iEnd; i++) {
            const p = primaryTimeline[i];
            const r = referenceTimeline[i + lag];
            if (p) primaryActive++;
            if (r) referenceActive++;
            if (p && r) both++;
        }

        if (both < minActiveOverlap) {
            continue;
        }

        const union = primaryActive + referenceActive - both;
        const score = union > 0 ? both / union : 0;
        if (score > bestScore || (score === bestScore && Math.abs(lag) < Math.abs(bestLag))) {
            bestScore = score;
            bestLag = lag;
        }
    }

    const confidence = bestScore;
    if (confidence < minConfidence) {
        return { offset: 0, points: [], confidence };
    }

    const offset = bestLag * coarseFrameMs;
    return {
        offset,
        points: [{ position: 0.5, offset, confidence }],
        confidence,
    };
}

/**
 * High-level function that runs full VAD + offset detection pipeline.
 *
 * @param subtitles Subtitle models
 * @param audioData Raw audio samples (Float32Array, mono)
 * @param sampleRate Audio sample rate
 * @param vadEngine VAD engine to use
 * @param options Detection options
 */
export async function detectOffsetWithVAD(
    subtitles: SubtitleModel[],
    audioData: Float32Array,
    sampleRate: number,
    vadEngine: VADEngine,
    options?: VADOffsetOptions
): Promise<OffsetResult> {
    // Initialize VAD if needed
    await vadEngine.initialize();

    // Run VAD
    const vadResult = await vadEngine.process(audioData, sampleRate, {
        mode: 2, // Medium aggressiveness
        frameSizeMs: options?.frameSizeMs ?? 10,
    });

    // Debug: Log what VAD detected
    const speechDuration = vadResult.segments.reduce((sum, s) => sum + (s.end - s.start), 0);
    console.log(
        '[VAD] Detected',
        vadResult.segments.length,
        'segments,',
        speechDuration.toFixed(2) + 's speech in',
        vadResult.duration.toFixed(2) + 's capture'
    );

    // Detect offset
    return detectOffsetVAD(subtitles, vadResult, options);
}

/**
 * Analyze VAD result quality to determine if it's reliable.
 * Returns a quality score and potential issues.
 */
export function analyzeVADQuality(vadResult: VADResult): {
    quality: number;
    issues: string[];
} {
    const issues: string[] = [];

    // Check if there's enough speech
    const totalSpeechDuration = vadResult.segments.reduce((sum, seg) => sum + (seg.end - seg.start), 0);

    const speechRatio = totalSpeechDuration / vadResult.duration;

    if (speechRatio < 0.1) {
        issues.push('Very little speech detected (<10%)');
    } else if (speechRatio > 0.9) {
        issues.push('Almost all audio detected as speech (>90%), possible noise');
    }

    // Check segment count
    if (vadResult.segments.length < 3) {
        issues.push('Too few speech segments detected');
    }

    // Check for very short segments (might be noise)
    const shortSegments = vadResult.segments.filter((seg) => seg.end - seg.start < 0.2).length;
    if (shortSegments > vadResult.segments.length * 0.5) {
        issues.push('Many very short segments, possible noise interference');
    }

    // Calculate quality score
    let quality = 1.0;
    quality -= issues.length * 0.2;
    quality = Math.max(0, Math.min(1, quality));

    return { quality, issues };
}
