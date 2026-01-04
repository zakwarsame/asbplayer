/**
 * Type definitions for browser-based Whisper transcription
 */

/** Word-level transcription result from Whisper */
export interface WhisperWord {
    /** The transcribed word */
    word: string;
    /** Start time in seconds */
    start: number;
    /** End time in seconds */
    end: number;
    /** Confidence probability (0-1) */
    probability?: number;
}

/** Segment-level transcription result from Whisper */
export interface WhisperSegment {
    /** Full text of the segment */
    text: string;
    /** Start time in seconds */
    start: number;
    /** End time in seconds */
    end: number;
    /** Word-level timestamps if available */
    words?: WhisperWord[];
}

/** Complete transcription result from Whisper */
export interface WhisperTranscriptionResult {
    /** Transcribed segments */
    segments: WhisperSegment[];
    /** Detected or specified language */
    language?: string;
    /** Total audio duration in seconds */
    duration?: number;
}

/** A point used for offset/drift detection */
export interface OffsetPoint {
    /** Position in content (0-1, e.g., start=0, middle=0.5, end=1) */
    position: number;
    /** Detected offset in milliseconds */
    offset: number;
    /** Confidence of this match (0-1) */
    confidence: number;
}

/** Result of offset detection between subtitles and transcription */
export interface OffsetResult {
    /** Primary offset in milliseconds (positive = subtitle ahead of audio) */
    offset: number;
    /** Rate of drift in ms per second of content (if variable drift detected) */
    drift?: number;
    /** Sample points used for detection */
    points: OffsetPoint[];
    /** Overall confidence of the detection (0-1) */
    confidence: number;
}

/** Request message sent to Whisper worker */
export interface WhisperWorkerRequest {
    command: 'transcribe' | 'transcribe-segment' | 'load-model';
    /** Audio data as ArrayBuffer (PCM Float32) */
    audioData?: ArrayBuffer;
    /** Sample rate of the audio */
    sampleRate?: number;
    /** Model to use (e.g., 'Xenova/whisper-small') */
    modelId?: string;
    /** Language code (e.g., 'ja', 'en', or undefined for auto-detect) */
    language?: string;
    /** For segment transcription: start time in seconds */
    segmentStart?: number;
    /** For segment transcription: end time in seconds */
    segmentEnd?: number;
}

/** Response message from Whisper worker */
export interface WhisperWorkerResponse {
    command: 'transcription-complete' | 'transcription-error' | 'progress' | 'model-loaded';
    /** Transcription result (on success) */
    result?: WhisperTranscriptionResult;
    /** Error message (on failure) */
    error?: string;
    /** Progress value (0-1) */
    progress?: number;
    /** Progress stage description */
    stage?: 'loading-model' | 'transcribing' | 'complete';
}
