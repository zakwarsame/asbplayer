/**
 * Voice Activity Detection (VAD) based subtitle alignment.
 *
 * This module provides an alternative to Whisper-based alignment that is:
 * - Much faster (~10-15s vs 50-90s)
 * - Language agnostic (no transcription needed)
 * - Smaller bundle size (~200KB vs 150MB)
 */

export { VADEngine, VADResult, VADSegment, VADOptions, vadResultToTimeline, subtitlesToTimeline } from './vad-interface';
export { detectOffsetVAD, detectOffsetWithVAD, analyzeVADQuality } from './vad-offset-detector';
export type { VADOffsetOptions } from './vad-offset-detector';
export { SimpleEnergyVAD, createSimpleVAD } from './simple-vad';
export { alignDTW, alignBinaryDTW, crossCorrelate, crossCorrelateMultiRes } from './dtw';
export type { DTWResult, DTWOptions } from './dtw';
