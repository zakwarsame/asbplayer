/**
 * Simple energy-based Voice Activity Detection.
 *
 * This is a basic VAD implementation that uses signal energy
 * to detect speech. It's not as accurate as WebRTC VAD or
 * neural network based approaches, but:
 * - Zero dependencies
 * - Very fast
 * - Good enough for testing and as fallback
 */

import { VADEngine, VADResult, VADOptions, VADSegment } from './vad-interface';

export class SimpleEnergyVAD implements VADEngine {
    private initialized = false;

    async initialize(): Promise<void> {
        this.initialized = true;
    }

    async process(audioData: Float32Array, sampleRate: number, options?: VADOptions): Promise<VADResult> {
        if (!this.initialized) {
            await this.initialize();
        }

        const frameSizeMs = options?.frameSizeMs ?? 20;
        const minSpeechDurationMs = options?.minSpeechDurationMs ?? 100;
        const minSilenceDurationMs = options?.minSilenceDurationMs ?? 100;

        // Calculate frame size in samples
        const frameSizeSamples = Math.floor((frameSizeMs / 1000) * sampleRate);
        const frameCount = Math.floor(audioData.length / frameSizeSamples);

        // Calculate energy for each frame
        const energies: number[] = [];
        for (let i = 0; i < frameCount; i++) {
            const start = i * frameSizeSamples;
            const end = start + frameSizeSamples;
            let energy = 0;

            for (let j = start; j < end && j < audioData.length; j++) {
                energy += audioData[j] * audioData[j];
            }

            energies.push(energy / frameSizeSamples);
        }

        // Calculate threshold using adaptive method
        // Sort energies and use a percentile as threshold
        const sortedEnergies = [...energies].sort((a, b) => a - b);
        const noiseFloor = sortedEnergies[Math.floor(sortedEnergies.length * 0.1)] || 0;
        const speechLevel = sortedEnergies[Math.floor(sortedEnergies.length * 0.9)] || 0;

        // Threshold is between noise floor and speech level
        const threshold = noiseFloor + (speechLevel - noiseFloor) * 0.3;

        // Detect speech frames
        const isSpeech: boolean[] = energies.map((e) => e > threshold);

        // Apply smoothing (remove short gaps and short speech segments)
        const minSpeechFrames = Math.ceil(minSpeechDurationMs / frameSizeMs);
        const minSilenceFrames = Math.ceil(minSilenceDurationMs / frameSizeMs);

        const smoothed = smoothVAD(isSpeech, minSpeechFrames, minSilenceFrames);

        // Convert to segments
        const segments = framesToSegments(smoothed, frameSizeMs / 1000);

        return {
            segments,
            sampleRate,
            duration: audioData.length / sampleRate,
        };
    }

    dispose(): void {
        this.initialized = false;
    }
}

/**
 * Smooth VAD output by removing short speech and silence segments.
 */
function smoothVAD(isSpeech: boolean[], minSpeechFrames: number, minSilenceFrames: number): boolean[] {
    const result = [...isSpeech];

    // Fill short silence gaps
    let silenceStart = -1;
    for (let i = 0; i < result.length; i++) {
        if (result[i]) {
            if (silenceStart >= 0 && i - silenceStart < minSilenceFrames) {
                // Fill the gap
                for (let j = silenceStart; j < i; j++) {
                    result[j] = true;
                }
            }
            silenceStart = -1;
        } else {
            if (silenceStart < 0) {
                silenceStart = i;
            }
        }
    }

    // Remove short speech segments
    let speechStart = -1;
    for (let i = 0; i < result.length; i++) {
        if (!result[i]) {
            if (speechStart >= 0 && i - speechStart < minSpeechFrames) {
                // Remove short segment
                for (let j = speechStart; j < i; j++) {
                    result[j] = false;
                }
            }
            speechStart = -1;
        } else {
            if (speechStart < 0) {
                speechStart = i;
            }
        }
    }

    // Handle trailing speech
    if (speechStart >= 0 && result.length - speechStart < minSpeechFrames) {
        for (let j = speechStart; j < result.length; j++) {
            result[j] = false;
        }
    }

    return result;
}

/**
 * Convert frame-level VAD to time segments.
 */
function framesToSegments(isSpeech: boolean[], frameDurationSec: number): VADSegment[] {
    const segments: VADSegment[] = [];
    let segmentStart = -1;

    for (let i = 0; i < isSpeech.length; i++) {
        if (isSpeech[i]) {
            if (segmentStart < 0) {
                segmentStart = i;
            }
        } else {
            if (segmentStart >= 0) {
                segments.push({
                    start: segmentStart * frameDurationSec,
                    end: i * frameDurationSec,
                });
                segmentStart = -1;
            }
        }
    }

    // Handle trailing segment
    if (segmentStart >= 0) {
        segments.push({
            start: segmentStart * frameDurationSec,
            end: isSpeech.length * frameDurationSec,
        });
    }

    return segments;
}

/**
 * Create a simple VAD instance.
 */
export function createSimpleVAD(): VADEngine {
    return new SimpleEnergyVAD();
}
