/**
 * Interface for Voice Activity Detection implementations.
 * Allows swapping between different VAD backends (WebRTC VAD, Silero, etc.)
 */

export interface VADSegment {
    /** Start time in seconds */
    start: number;
    /** End time in seconds */
    end: number;
    /** Confidence score (0-1), if available */
    confidence?: number;
}

export interface VADResult {
    /** Detected speech segments */
    segments: VADSegment[];
    /** Sample rate of the processed audio */
    sampleRate: number;
    /** Total duration of the audio in seconds */
    duration: number;
}

export interface VADOptions {
    /** VAD aggressiveness/mode (0-3, higher = more aggressive, fewer false positives) */
    mode?: number;
    /** Frame size in milliseconds (typically 10, 20, or 30) */
    frameSizeMs?: number;
    /** Minimum speech segment duration in ms to keep */
    minSpeechDurationMs?: number;
    /** Minimum silence duration in ms to split segments */
    minSilenceDurationMs?: number;
}

/**
 * Abstract VAD interface that can be implemented by different backends.
 */
export interface VADEngine {
    /**
     * Initialize the VAD engine.
     * Should be called before process().
     */
    initialize(): Promise<void>;

    /**
     * Process audio and return speech segments.
     * @param audioData Raw audio samples (Float32Array, mono, typically 16kHz)
     * @param sampleRate Sample rate of the audio
     * @param options VAD options
     */
    process(audioData: Float32Array, sampleRate: number, options?: VADOptions): Promise<VADResult>;

    /**
     * Clean up resources.
     */
    dispose(): void;
}

/**
 * Convert VAD segments to a binary timeline.
 * @param result VAD result
 * @param frameSizeMs Resolution of the binary timeline in milliseconds
 * @returns Binary array where true = speech, false = silence
 */
export function vadResultToTimeline(result: VADResult, frameSizeMs: number = 10): boolean[] {
    const frameCount = Math.ceil((result.duration * 1000) / frameSizeMs);
    const timeline = new Array<boolean>(frameCount).fill(false);

    for (const segment of result.segments) {
        const startFrame = Math.floor((segment.start * 1000) / frameSizeMs);
        const endFrame = Math.ceil((segment.end * 1000) / frameSizeMs);

        for (let i = startFrame; i < endFrame && i < frameCount; i++) {
            timeline[i] = true;
        }
    }

    return timeline;
}

/**
 * Convert subtitle timings to a binary timeline.
 * @param subtitles Array of subtitle objects with start/end in milliseconds
 * @param durationMs Total duration in milliseconds
 * @param frameSizeMs Resolution of the binary timeline in milliseconds
 * @returns Binary array where true = subtitle active, false = no subtitle
 */
export function subtitlesToTimeline(
    subtitles: Array<{ start: number; end: number }>,
    durationMs: number,
    frameSizeMs: number = 10
): boolean[] {
    const frameCount = Math.ceil(durationMs / frameSizeMs);
    const timeline = new Array<boolean>(frameCount).fill(false);

    for (const sub of subtitles) {
        const startFrame = Math.floor(sub.start / frameSizeMs);
        const endFrame = Math.ceil(sub.end / frameSizeMs);

        for (let i = startFrame; i < endFrame && i < frameCount; i++) {
            timeline[i] = true;
        }
    }

    return timeline;
}
