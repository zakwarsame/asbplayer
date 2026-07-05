export interface WvttCue {
    start: number;
    end: number;
    text: string;
}

interface Box {
    type: string;
    headerStart: number;
    payloadStart: number;
    end: number;
}

interface Sample {
    duration: number;
    size: number;
}

interface Fragment {
    baseMediaDecodeTime: number;
    samples: Sample[];
    dataStart?: number;
}

function* boxes(view: DataView, start: number, end: number): Generator<Box> {
    let offset = start;

    while (offset + 8 <= end) {
        let size = view.getUint32(offset);
        const type = String.fromCharCode(
            view.getUint8(offset + 4),
            view.getUint8(offset + 5),
            view.getUint8(offset + 6),
            view.getUint8(offset + 7)
        );
        let payloadStart = offset + 8;

        if (size === 1) {
            if (offset + 16 > end) {
                return;
            }

            size = Number(view.getBigUint64(offset + 8));
            payloadStart = offset + 16;
        } else if (size === 0) {
            size = end - offset;
        }

        if (size < payloadStart - offset || offset + size > end) {
            return;
        }

        yield { type, headerStart: offset, payloadStart, end: offset + size };
        offset += size;
    }
}

const findBox = (view: DataView, start: number, end: number, type: string): Box | undefined => {
    for (const box of boxes(view, start, end)) {
        if (box.type === type) {
            return box;
        }
    }

    return undefined;
};

const parseMoof = (view: DataView, moof: Box): Fragment | undefined => {
    const traf = findBox(view, moof.payloadStart, moof.end, 'traf');

    if (traf === undefined) {
        return undefined;
    }

    let defaultSampleDuration = 0;
    let defaultSampleSize = 0;
    let baseMediaDecodeTime = 0;
    let samples: Sample[] | undefined;
    let dataStart: number | undefined;

    for (const box of boxes(view, traf.payloadStart, traf.end)) {
        if (box.type === 'tfhd') {
            const flags = view.getUint32(box.payloadStart) & 0xffffff;
            let offset = box.payloadStart + 8; // version/flags + track_ID

            if (flags & 0x1) {
                offset += 8; // base_data_offset
            }

            if (flags & 0x2) {
                offset += 4; // sample_description_index
            }

            if (flags & 0x8) {
                defaultSampleDuration = view.getUint32(offset);
                offset += 4;
            }

            if (flags & 0x10) {
                defaultSampleSize = view.getUint32(offset);
            }
        } else if (box.type === 'tfdt') {
            const version = view.getUint8(box.payloadStart);
            baseMediaDecodeTime =
                version === 1 ? Number(view.getBigUint64(box.payloadStart + 4)) : view.getUint32(box.payloadStart + 4);
        } else if (box.type === 'trun') {
            const flags = view.getUint32(box.payloadStart) & 0xffffff;
            const sampleCount = view.getUint32(box.payloadStart + 4);
            let offset = box.payloadStart + 8;

            if (flags & 0x1) {
                // data_offset is relative to the start of the moof box (default-base-is-moof)
                dataStart = moof.headerStart + view.getInt32(offset);
                offset += 4;
            }

            if (flags & 0x4) {
                offset += 4; // first_sample_flags
            }

            samples = [];

            for (let i = 0; i < sampleCount; ++i) {
                let duration = defaultSampleDuration;
                let size = defaultSampleSize;

                if (flags & 0x100) {
                    duration = view.getUint32(offset);
                    offset += 4;
                }

                if (flags & 0x200) {
                    size = view.getUint32(offset);
                    offset += 4;
                }

                if (flags & 0x400) {
                    offset += 4; // sample_flags
                }

                if (flags & 0x800) {
                    offset += 4; // sample_composition_time_offset, signed when version > 0
                }

                samples.push({ duration, size });
            }
        }
    }

    if (samples === undefined) {
        return undefined;
    }

    return { baseMediaDecodeTime, samples, dataStart };
};

// A cue that spans a segment boundary is emitted once per segment, each clipped to that segment's
// time window. When segments are concatenated before parsing, those pieces arrive adjacent with
// identical text and exactly abutting times (both derived from the same absolute media time), so
// stitch them back into a single cue.
export const mergeAbuttingCues = (cues: WvttCue[]): WvttCue[] => {
    const merged: WvttCue[] = [];

    for (const cue of cues) {
        const previous = merged[merged.length - 1];

        if (previous !== undefined && previous.text === cue.text && previous.end === cue.start) {
            previous.end = cue.end;
        } else {
            merged.push(cue);
        }
    }

    return merged;
};

const nbspRegex = /\u00a0/g;

// Parses WebVTT cues out of a DASH fMP4 text media segment (ISO 14496-30 "wvtt").
// The sidx box provides the timescale, each moof's tfdt/trun provide absolute sample
// times/sizes, and each mdat sample holds vttc boxes whose payl box is the cue text
// (vtte marks an empty sample).
export const parseWvttSegment = (buffer: ArrayBuffer): WvttCue[] => {
    const view = new DataView(buffer);
    const decoder = new TextDecoder();
    const cues: WvttCue[] = [];
    let timescale: number | undefined;
    let fragment: Fragment | undefined;

    for (const box of boxes(view, 0, buffer.byteLength)) {
        if (box.type === 'sidx') {
            timescale = view.getUint32(box.payloadStart + 8);
        } else if (box.type === 'moof') {
            fragment = parseMoof(view, box);
        } else if (box.type === 'mdat' && fragment !== undefined && timescale !== undefined) {
            let sampleStart = fragment.dataStart ?? box.payloadStart;
            let elapsed = fragment.baseMediaDecodeTime;

            for (const sample of fragment.samples) {
                for (const cueBox of boxes(view, sampleStart, sampleStart + sample.size)) {
                    if (cueBox.type !== 'vttc') {
                        continue;
                    }

                    const payl = findBox(view, cueBox.payloadStart, cueBox.end, 'payl');

                    if (payl === undefined) {
                        continue;
                    }

                    // Cue text may pad lines with no-break spaces for positioning
                    const text = decoder
                        .decode(new Uint8Array(buffer, payl.payloadStart, payl.end - payl.payloadStart))
                        .replace(nbspRegex, ' ')
                        .split('\n')
                        .map((line) => line.trim())
                        .filter((line) => line !== '')
                        .join('\n');

                    if (text !== '') {
                        cues.push({
                            start: Math.floor((elapsed / timescale) * 1000),
                            end: Math.floor(((elapsed + sample.duration) / timescale) * 1000),
                            text,
                        });
                    }
                }

                sampleStart += sample.size;
                elapsed += sample.duration;
            }

            fragment = undefined;
        }
    }

    return mergeAbuttingCues(cues);
};
