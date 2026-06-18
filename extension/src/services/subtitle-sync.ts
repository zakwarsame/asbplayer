import { SubtitleHtml, type SubtitleSyncReferenceOrigin } from '@project/common';
import { SubtitleReader } from '@project/common/subtitle-reader';
import { base64ToBlob } from '@project/common/base64';
import { extractExtension } from '@/pages/util';
import { pgsParserWorkerFactory } from './pgs-parser-worker-factory';
import { requestCapturedSubtitles, capturedSubtitleLabel } from './captured-subtitles';
import type Binding from './binding';

export const MIN_SUBTITLE_SYNC_CONFIDENCE = 0.3;

export interface ReferenceCue {
    originalStart: number;
    originalEnd: number;
}

const sameTimeline = (a: ReferenceCue[], b: ReferenceCue[]): boolean =>
    a.length === b.length &&
    a.every((cue, i) => cue.originalStart === b[i].originalStart && cue.originalEnd === b[i].originalEnd);

export interface ReferenceCandidate {
    id: string;
    label: string;
    origin: SubtitleSyncReferenceOrigin;
    language?: string;
    cues: ReferenceCue[];
}

const referenceReader = () =>
    new SubtitleReader({
        regexFilter: '',
        regexFilterTextReplacement: '',
        subtitleHtml: SubtitleHtml.remove,
        convertNetflixRuby: false,
        pgsParserWorkerFactory,
    });

export async function parseReferenceCues(base64: string, fileName: string): Promise<ReferenceCue[]> {
    const file = new File([base64ToBlob(base64, 'text/plain')], fileName);
    const nodes = await referenceReader().subtitles([file]);
    return nodes.map((n) => ({ originalStart: n.start, originalEnd: n.end }));
}

export async function gatherReferenceCandidates(context: Binding, primaryTrack: number): Promise<ReferenceCandidate[]> {
    const subtitles = context.subtitleController.subtitles;
    const fileNames = context.subtitleController.subtitleFileNames ?? [];
    const cuesForTrack = (track: number): ReferenceCue[] =>
        subtitles
            .filter((s) => s.track === track)
            .map((s) => ({ originalStart: s.originalStart, originalEnd: s.originalEnd }));

    const candidates: ReferenceCandidate[] = [];
    // A subtitle can't be a timing reference for itself, so never offer a track whose cues are
    // identical to one we already hold — most importantly the primary, which is re-served (and
    // re-captured) by the site when it was loaded from a captured CC.
    const knownTimelines: ReferenceCue[][] = [cuesForTrack(primaryTrack)];
    const addCandidate = (candidate: ReferenceCandidate) => {
        if (candidate.cues.length === 0 || knownTimelines.some((t) => sameTimeline(t, candidate.cues))) {
            return;
        }
        knownTimelines.push(candidate.cues);
        candidates.push(candidate);
    };

    const otherTracks = [...new Set(subtitles.map((s) => s.track))]
        .filter((t) => t !== primaryTrack)
        .sort((a, b) => a - b);

    for (const track of otherTracks) {
        addCandidate({
            id: `loaded-${track}`,
            label: fileNames[track] ?? `Track ${track + 1}`,
            origin: 'loaded',
            cues: cuesForTrack(track),
        });
    }

    const captured = await requestCapturedSubtitles();
    const reader = referenceReader();

    for (let i = 0; i < captured.length; i++) {
        const c = captured[i];
        try {
            const file = new File(
                [base64ToBlob(c.base64, 'text/plain')],
                `reference.${extractExtension(c.url, 'vtt')}`
            );
            const nodes = await reader.subtitles([file]);
            addCandidate({
                id: `captured-${i}`,
                label: capturedSubtitleLabel(c),
                origin: 'captured',
                language: c.language,
                cues: nodes.map((n) => ({ originalStart: n.start, originalEnd: n.end })),
            });
        } catch {
            // Unparseable captured track — skip it.
        }
    }

    return candidates;
}
