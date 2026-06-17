import { SubtitleHtml, type SubtitleSyncReferenceOrigin } from '@project/common';
import { SubtitleReader } from '@project/common/subtitle-reader';
import { base64ToBlob } from '@project/common/base64';
import { isAnimeSite } from '@/services/anime-sites';
import { pgsParserWorkerFactory } from './pgs-parser-worker-factory';
import type { CapturedSubtitle } from './network-subtitle-capture';
import type Binding from './binding';

export const MIN_SUBTITLE_SYNC_CONFIDENCE = 0.3;

export interface ReferenceCue {
    originalStart: number;
    originalEnd: number;
}

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

const extensionFromUrl = (url: string): string => {
    const match = /\.(vtt|srt|ass)(?:\?|#|$)/i.exec(url);
    return match ? match[1].toLowerCase() : 'vtt';
};

export async function parseReferenceCues(base64: string, fileName: string): Promise<ReferenceCue[]> {
    const file = new File([base64ToBlob(base64, 'text/plain')], fileName);
    const nodes = await referenceReader().subtitles([file]);
    return nodes.map((n) => ({ originalStart: n.start, originalEnd: n.end }));
}

export async function gatherReferenceCandidates(context: Binding, primaryTrack: number): Promise<ReferenceCandidate[]> {
    const candidates: ReferenceCandidate[] = [];

    const subtitles = context.subtitleController.subtitles;
    const fileNames = context.subtitleController.subtitleFileNames ?? [];
    const otherTracks = [...new Set(subtitles.map((s) => s.track))]
        .filter((t) => t !== primaryTrack)
        .sort((a, b) => a - b);

    for (const track of otherTracks) {
        const cues = subtitles
            .filter((s) => s.track === track)
            .map((s) => ({ originalStart: s.originalStart, originalEnd: s.originalEnd }));

        if (cues.length > 0) {
            candidates.push({ id: `loaded-${track}`, label: fileNames[track] ?? `Track ${track + 1}`, origin: 'loaded', cues });
        }
    }

    const captureEnabled =
        (await context.settings.getSingle('streamingCaptureSiteSubtitles')) || isAnimeSite(location.href);

    if (captureEnabled) {
        try {
            const captured: CapturedSubtitle[] =
                (await browser.runtime.sendMessage({ command: 'get-network-subtitles' })) || [];
            const reader = referenceReader();

            for (let i = 0; i < captured.length; i++) {
                const c = captured[i];
                try {
                    const file = new File([base64ToBlob(c.base64, 'text/plain')], `reference.${extensionFromUrl(c.url)}`);
                    const nodes = await reader.subtitles([file]);
                    const cues = nodes.map((n) => ({ originalStart: n.start, originalEnd: n.end }));

                    if (cues.length > 0) {
                        candidates.push({
                            id: `captured-${i}`,
                            label: `[Site] ${c.label}`,
                            origin: 'captured',
                            language: c.language,
                            cues,
                        });
                    }
                } catch {
                    // Unparseable captured track — skip it.
                }
            }
        } catch {
            // Background unreachable — fall back to loaded references only.
        }
    }

    return candidates;
}
