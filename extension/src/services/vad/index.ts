/**
 * Voice Activity Detection (VAD) based subtitle alignment.
 *
 * This module provides an alternative to Whisper-based alignment that is:
 * - Much faster (~10-15s vs 50-90s)
 * - Language agnostic (no transcription needed)
 * - Smaller bundle size (~200KB vs 150MB)
 */

export type { VADEngine, VADResult, VADSegment, VADOptions } from './vad-interface';
export { vadResultToTimeline, subtitlesToTimeline } from './vad-interface';
export {
    detectOffsetVAD,
    detectOffsetWithVAD,
    analyzeVADQuality,
    detectOffsetBetweenSubtitles,
} from './vad-offset-detector';
export type { VADOffsetOptions, SubtitleSyncOffsetOptions, OffsetResult, OffsetPoint } from './vad-offset-detector';
export { SimpleEnergyVAD, createSimpleVAD } from './simple-vad';
export { alignDTW, alignBinaryDTW, crossCorrelate, crossCorrelateMultiRes } from './dtw';
export type { DTWResult, DTWOptions } from './dtw';
