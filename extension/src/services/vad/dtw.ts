/**
 * Dynamic Time Warping implementation for sequence alignment.
 * Can be used to align binary (VAD) sequences or numeric (MFCC) sequences.
 */

export interface DTWResult {
    /** Total cost of the optimal alignment path */
    cost: number;
    /** The alignment path as array of [i, j] index pairs */
    path: [number, number][];
    /** Normalized cost (cost / path length) */
    normalizedCost: number;
}

export interface DTWOptions {
    /** Maximum warp window as fraction of sequence length (0-1). Default: 0.2 (20%) */
    windowFraction?: number;
    /** Maximum warp window in absolute samples. Overrides windowFraction if set. */
    windowSize?: number;
}

/**
 * Generic DTW alignment with customizable cost function.
 * Uses Sakoe-Chiba band constraint for efficiency.
 */
export function alignDTW<T>(
    seq1: T[],
    seq2: T[],
    costFn: (a: T, b: T) => number,
    options?: DTWOptions
): DTWResult {
    const n = seq1.length;
    const m = seq2.length;

    if (n === 0 || m === 0) {
        return { cost: Infinity, path: [], normalizedCost: Infinity };
    }

    // Calculate window size
    const windowFraction = options?.windowFraction ?? 0.2;
    const windowSize = options?.windowSize ?? Math.max(Math.ceil(Math.max(n, m) * windowFraction), 1);

    // Initialize cost matrix with Infinity
    // Using Float32Array for memory efficiency
    const costMatrix = new Float32Array((n + 1) * (m + 1)).fill(Infinity);
    const getIdx = (i: number, j: number) => i * (m + 1) + j;

    costMatrix[getIdx(0, 0)] = 0;

    // Fill the matrix with Sakoe-Chiba band constraint
    for (let i = 1; i <= n; i++) {
        const jStart = Math.max(1, Math.floor((i * m) / n) - windowSize);
        const jEnd = Math.min(m, Math.ceil((i * m) / n) + windowSize);

        for (let j = jStart; j <= jEnd; j++) {
            const cost = costFn(seq1[i - 1], seq2[j - 1]);

            const diagonal = costMatrix[getIdx(i - 1, j - 1)];
            const vertical = costMatrix[getIdx(i - 1, j)];
            const horizontal = costMatrix[getIdx(i, j - 1)];

            costMatrix[getIdx(i, j)] = cost + Math.min(diagonal, vertical, horizontal);
        }
    }

    const totalCost = costMatrix[getIdx(n, m)];

    if (!isFinite(totalCost)) {
        return { cost: Infinity, path: [], normalizedCost: Infinity };
    }

    // Backtrack to find optimal path
    const path: [number, number][] = [];
    let i = n;
    let j = m;

    while (i > 0 || j > 0) {
        path.push([i - 1, j - 1]);

        if (i === 0) {
            j--;
        } else if (j === 0) {
            i--;
        } else {
            const diagonal = costMatrix[getIdx(i - 1, j - 1)];
            const vertical = costMatrix[getIdx(i - 1, j)];
            const horizontal = costMatrix[getIdx(i, j - 1)];

            if (diagonal <= vertical && diagonal <= horizontal) {
                i--;
                j--;
            } else if (vertical <= horizontal) {
                i--;
            } else {
                j--;
            }
        }
    }

    path.reverse();

    return {
        cost: totalCost,
        path,
        normalizedCost: totalCost / path.length,
    };
}

/**
 * Binary DTW for VAD sequences (speech/silence).
 * Cost is 0 for match, 1 for mismatch.
 */
export function alignBinaryDTW(seq1: boolean[], seq2: boolean[], options?: DTWOptions): DTWResult {
    return alignDTW(seq1, seq2, (a, b) => (a === b ? 0 : 1), options);
}

/**
 * Cross-correlation for finding optimal lag between two binary sequences.
 * More efficient than DTW when only looking for constant offset.
 *
 * @param reference The reference sequence (e.g., from subtitles)
 * @param target The target sequence (e.g., from VAD)
 * @param maxLagSamples Maximum lag to search in either direction
 * @returns Object with best lag (positive = target is ahead) and correlation score
 */
export function crossCorrelate(
    reference: boolean[],
    target: boolean[],
    maxLagSamples: number
): { lag: number; score: number; confidence: number } {
    let bestLag = 0;
    let bestScore = -Infinity;

    const refLength = reference.length;
    const targetLength = target.length;

    for (let lag = -maxLagSamples; lag <= maxLagSamples; lag++) {
        let matches = 0;
        let mismatches = 0;
        let count = 0;

        for (let i = 0; i < refLength; i++) {
            const j = i + lag;
            if (j >= 0 && j < targetLength) {
                if (reference[i] === target[j]) {
                    matches++;
                } else {
                    mismatches++;
                }
                count++;
            }
        }

        if (count > 0) {
            // Score: matches - mismatches, normalized by overlap
            const score = (matches - mismatches) / count;
            // Break ties in favor of smaller absolute lag (prefer lag=0)
            if (score > bestScore || (score === bestScore && Math.abs(lag) < Math.abs(bestLag))) {
                bestScore = score;
                bestLag = lag;
            }
        }
    }

    // Confidence based on how much better the best score is than random (0)
    // and the absolute score value
    const confidence = Math.max(0, Math.min(1, (bestScore + 1) / 2));

    return { lag: bestLag, score: bestScore, confidence };
}

/**
 * Multi-resolution cross-correlation for efficiency.
 * First searches at coarse resolution, then refines.
 */
export function crossCorrelateMultiRes(
    reference: boolean[],
    target: boolean[],
    maxLagSamples: number,
    frameMs: number
): { lagMs: number; confidence: number } {
    // Coarse search at 4x resolution
    const coarseStep = 4;
    const coarseRef = downsample(reference, coarseStep);
    const coarseTarget = downsample(target, coarseStep);
    const coarseMaxLag = Math.ceil(maxLagSamples / coarseStep);

    const coarseResult = crossCorrelate(coarseRef, coarseTarget, coarseMaxLag);

    // Fine search around coarse result
    const fineCenter = coarseResult.lag * coarseStep;
    const fineRadius = coarseStep * 2;

    let bestLag = fineCenter;
    let bestScore = -Infinity;

    for (let lag = fineCenter - fineRadius; lag <= fineCenter + fineRadius; lag++) {
        let matches = 0;
        let count = 0;

        for (let i = 0; i < reference.length; i++) {
            const j = i + lag;
            if (j >= 0 && j < target.length) {
                if (reference[i] === target[j]) matches++;
                count++;
            }
        }

        if (count > 0) {
            const score = matches / count;
            if (score > bestScore) {
                bestScore = score;
                bestLag = lag;
            }
        }
    }

    return {
        lagMs: bestLag * frameMs,
        confidence: bestScore,
    };
}

function downsample(seq: boolean[], factor: number): boolean[] {
    const result: boolean[] = [];
    for (let i = 0; i < seq.length; i += factor) {
        // Majority vote for downsampled value
        let trueCount = 0;
        const end = Math.min(i + factor, seq.length);
        for (let j = i; j < end; j++) {
            if (seq[j]) trueCount++;
        }
        result.push(trueCount > (end - i) / 2);
    }
    return result;
}
