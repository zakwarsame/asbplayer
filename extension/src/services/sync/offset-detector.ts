import { SubtitleModel } from '@project/common';

interface WhisperWord {
    word: string;
    start: number;
    end: number;
}

interface WhisperSegment {
    text: string;
    start: number;
    end: number;
    words?: WhisperWord[];
}

export interface WhisperTranscriptionResult {
    segments: WhisperSegment[];
    language?: string;
    duration?: number;
}

export interface OffsetPoint {
    position: number;
    offset: number;
    confidence: number;
}

export interface OffsetResult {
    offset: number;
    drift?: number;
    points: OffsetPoint[];
    confidence: number;
}

export interface OffsetDetectionOptions {
    sampleCount?: number;
    matchThreshold?: number;
    searchWindowSeconds?: number;
    captureStartTimeMs?: number;
    captureDurationMs?: number;
}

export function detectOffset(
    subtitles: SubtitleModel[],
    transcription: WhisperTranscriptionResult,
    options?: OffsetDetectionOptions
): OffsetResult {
    const { sampleCount = 3, matchThreshold = 0.7, searchWindowSeconds = 30, captureStartTimeMs = 0 } = options || {};

    if (subtitles.length === 0 || transcription.segments.length === 0) {
        return { offset: 0, points: [], confidence: 0 };
    }

    const captureStartTimeSec = captureStartTimeMs / 1000;
    const whisperWords = flattenTranscription(transcription, captureStartTimeSec);

    if (whisperWords.length === 0) {
        return { offset: 0, points: [], confidence: 0 };
    }

    const points: OffsetPoint[] = [];

    if (captureStartTimeMs > 0) {
        // Partial capture: search all subtitles against transcription
        const matches: { idx: number; result: MatchResult }[] = [];

        for (let i = 0; i < subtitles.length; i++) {
            const subtitle = subtitles[i];
            if (subtitle.text.length < 8) continue;

            const matchResult = findBestMatch(subtitle, whisperWords, matchThreshold, Infinity);
            if (matchResult) {
                matches.push({ idx: i, result: matchResult });
            }
        }

        if (matches.length === 0) {
            return { offset: 0, points: [], confidence: 0 };
        }

        // Cluster matches by similar offsets
        matches.sort((a, b) => a.result.offset - b.result.offset);

        const CLUSTER_TOLERANCE = 5000;
        let bestClusterStart = 0;
        let bestClusterSize = 0;

        for (let i = 0; i < matches.length; i++) {
            let clusterSize = 1;
            for (let j = i + 1; j < matches.length; j++) {
                if (Math.abs(matches[j].result.offset - matches[i].result.offset) <= CLUSTER_TOLERANCE) {
                    clusterSize++;
                } else {
                    break;
                }
            }
            if (clusterSize > bestClusterSize) {
                bestClusterSize = clusterSize;
                bestClusterStart = i;
            }
        }

        const clusterMatches = matches.slice(bestClusterStart, bestClusterStart + bestClusterSize);
        clusterMatches.sort((a, b) => b.result.confidence - a.result.confidence);
        const bestMatches = clusterMatches.slice(0, sampleCount);

        for (const match of bestMatches) {
            points.push({
                position: match.idx / Math.max(subtitles.length - 1, 1),
                offset: match.result.offset,
                confidence: match.result.confidence,
            });
        }
    } else {
        // Full transcription: sample subtitles evenly
        const sampleIndices = getSampleIndices(subtitles.length, sampleCount);

        for (const idx of sampleIndices) {
            const subtitle = subtitles[idx];
            const matchResult = findBestMatch(subtitle, whisperWords, matchThreshold, searchWindowSeconds);

            if (matchResult) {
                points.push({
                    position: idx / Math.max(subtitles.length - 1, 1),
                    offset: matchResult.offset,
                    confidence: matchResult.confidence,
                });
            }
        }
    }

    if (points.length === 0) {
        return { offset: 0, points: [], confidence: 0 };
    }

    const offsets = points.map((p) => p.offset);
    const primaryOffset = median(offsets);

    let drift: number | undefined;
    if (points.length >= 2) {
        const calculatedDrift = calculateDrift(points);
        if (Math.abs(calculatedDrift) > 10) {
            drift = calculatedDrift;
        }
    }

    const confidence = points.reduce((sum, p) => sum + p.confidence, 0) / points.length;

    return {
        offset: Math.round(primaryOffset),
        drift,
        points,
        confidence,
    };
}

export function interpolateOffset(originalStartMs: number, totalDurationMs: number, result: OffsetResult): number {
    if (!result.drift || result.points.length < 2) {
        return result.offset;
    }

    const position = totalDurationMs > 0 ? originalStartMs / totalDurationMs : 0;
    const { points } = result;
    const sortedPoints = [...points].sort((a, b) => a.position - b.position);

    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const p1 = sortedPoints[i];
        const p2 = sortedPoints[i + 1];

        if (position >= p1.position && position <= p2.position) {
            const t = (position - p1.position) / (p2.position - p1.position);
            return Math.round(p1.offset + t * (p2.offset - p1.offset));
        }
    }

    if (position < sortedPoints[0].position) {
        return Math.round(sortedPoints[0].offset);
    }
    return Math.round(sortedPoints[sortedPoints.length - 1].offset);
}

function flattenTranscription(
    transcription: WhisperTranscriptionResult,
    captureStartTimeSec: number = 0
): WhisperWord[] {
    const words: WhisperWord[] = [];

    for (const segment of transcription.segments) {
        if (segment.words && segment.words.length > 0) {
            for (const word of segment.words) {
                words.push({
                    word: word.word,
                    start: word.start + captureStartTimeSec,
                    end: word.end + captureStartTimeSec,
                });
            }
        } else {
            const segmentWords = tokenizeText(segment.text);
            if (segmentWords.length > 0) {
                const duration = segment.end - segment.start;
                const wordDuration = duration / segmentWords.length;

                for (let i = 0; i < segmentWords.length; i++) {
                    words.push({
                        word: segmentWords[i],
                        start: captureStartTimeSec + segment.start + i * wordDuration,
                        end: captureStartTimeSec + segment.start + (i + 1) * wordDuration,
                    });
                }
            }
        }
    }

    return words;
}

function getSampleIndices(length: number, count: number): number[] {
    if (length <= count) {
        return Array.from({ length }, (_, i) => i);
    }

    if (count === 1) {
        return [Math.floor(length / 2)];
    }

    if (count === 2) {
        return [0, length - 1];
    }

    const indices: number[] = [0];
    for (let i = 1; i < count - 1; i++) {
        indices.push(Math.floor((i * (length - 1)) / (count - 1)));
    }
    indices.push(length - 1);

    return indices;
}

interface MatchResult {
    offset: number;
    confidence: number;
}

function findBestMatch(
    subtitle: SubtitleModel,
    whisperWords: WhisperWord[],
    threshold: number,
    searchWindowSeconds: number
): MatchResult | null {
    const subtitleWords = tokenizeText(subtitle.text);

    if (subtitleWords.length === 0) {
        return null;
    }

    const subtitleStartSec = subtitle.originalStart / 1000;
    const searchStart = Math.max(0, subtitleStartSec - searchWindowSeconds);
    const searchEnd = subtitleStartSec + searchWindowSeconds;

    const windowWords = whisperWords.filter((w) => w.start >= searchStart && w.start <= searchEnd);

    if (windowWords.length < subtitleWords.length) {
        return null;
    }

    let bestMatch: MatchResult = { offset: 0, confidence: 0 };

    for (let i = 0; i <= windowWords.length - subtitleWords.length; i++) {
        const candidateWords = windowWords.slice(i, i + subtitleWords.length);
        const similarity = calculateSimilarity(
            subtitleWords,
            candidateWords.map((w) => normalizeText(w.word))
        );

        if (similarity > bestMatch.confidence && similarity >= threshold) {
            const whisperStartMs = candidateWords[0].start * 1000;
            bestMatch = {
                offset: whisperStartMs - subtitle.originalStart,
                confidence: similarity,
            };
        }
    }

    return bestMatch.confidence >= threshold ? bestMatch : null;
}

function tokenizeText(text: string): string[] {
    const normalized = normalizeText(text);

    if (normalized.length === 0) {
        return [];
    }

    const hasCJK = /[\u3000-\u9fff\uac00-\ud7af]/.test(normalized);

    if (hasCJK) {
        return normalized.replace(/\s+/g, '').split('');
    }

    return normalized.split(/\s+/).filter((w) => w.length > 0);
}

function normalizeText(text: string): string {
    return text
        .toLowerCase()
        .replace(/<[^>]*>/g, '')
        .replace(/\{[^}]*\}/g, '')
        .replace(/\\[nN]/g, ' ')
        .replace(/[^\p{L}\p{N}\s]/gu, '')
        .trim();
}

function calculateSimilarity(a: string[], b: string[]): number {
    if (a.length === 0 || b.length === 0) {
        return 0;
    }

    if (a.length !== b.length) {
        return calculateSequenceSimilarity(a, b);
    }

    let matches = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i] === b[i]) {
            matches++;
        }
    }

    return matches / a.length;
}

function calculateSequenceSimilarity(a: string[], b: string[]): number {
    const m = a.length;
    const n = b.length;

    if (m === 0 || n === 0) {
        return 0;
    }

    const dp: number[][] = Array(m + 1)
        .fill(null)
        .map(() => Array(n + 1).fill(0));

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1] + 1;
            } else {
                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
            }
        }
    }

    const lcsLength = dp[m][n];
    return (2 * lcsLength) / (m + n);
}

function median(values: number[]): number {
    if (values.length === 0) {
        return 0;
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function calculateDrift(points: OffsetPoint[]): number {
    const n = points.length;

    if (n < 2) {
        return 0;
    }

    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (const point of points) {
        sumX += point.position;
        sumY += point.offset;
        sumXY += point.position * point.offset;
        sumXX += point.position * point.position;
    }

    const denominator = n * sumXX - sumX * sumX;

    if (Math.abs(denominator) < 1e-10) {
        return 0;
    }

    return (n * sumXY - sumX * sumY) / denominator;
}
