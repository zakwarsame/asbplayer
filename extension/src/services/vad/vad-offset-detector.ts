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
import { OffsetPoint, OffsetResult } from '../whisper/offset-detector';
import { crossCorrelate, crossCorrelateMultiRes, alignBinaryDTW } from './dtw';
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

    // Calculate maximum lag in samples - limit to timeline length for efficiency
    const requestedMaxLag = Math.ceil((maxOffsetSeconds * 1000) / frameSizeMs);
    const maxLagSamples = Math.min(requestedMaxLag, Math.max(subtitleTimeline.length, vadTimeline.length));

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
