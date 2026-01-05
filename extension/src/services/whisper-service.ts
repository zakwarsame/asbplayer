import { pipeline, env } from '@huggingface/transformers';
import type { TranscriptionSegment } from '@project/common';
import { base64ToBuffer } from '@project/common/base64';

// Configure transformers.js for browser
env.allowLocalModels = false;
env.useBrowserCache = true;

// Use bundled ONNX WASM files (CDN blocked by extension CSP)
if (env?.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('/onnx/');
}

const MODEL_ID = 'onnx-community/whisper-small';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let loadPromise: Promise<void> | null = null;
let loadedWithWebGpu: boolean | null = null;

export async function loadWhisperModel(useWebGpu: boolean = false): Promise<void> {
    // If already loaded with a different device setting, reset
    if (transcriber && loadedWithWebGpu !== useWebGpu) {
        transcriber = null;
        loadPromise = null;
    }

    if (transcriber) return;
    if (loadPromise) return loadPromise;

    const device = useWebGpu ? 'webgpu' : 'wasm';
    console.log(`[Whisper] Loading model with ${device}...`);

    loadPromise = (async () => {
        transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
            dtype: 'q8',
            device,
        });
        loadedWithWebGpu = useWebGpu;
        console.log(`[Whisper] Model loaded with ${device}`);
    })();
    return loadPromise;
}

export async function transcribeAudio(
    audioBase64: string,
    language?: string,
    useWebGpu: boolean = false
): Promise<{ segments: TranscriptionSegment[] }> {
    await loadWhisperModel(useWebGpu);

    // Decode base64 to Float32Array
    const bytes = base64ToBuffer(audioBase64);
    const audioArray = new Float32Array(bytes.buffer);

    console.log('[Whisper] Transcribing', audioArray.length, 'samples...');

    const result = await transcriber(audioArray, {
        language: language || 'ja',
        task: 'transcribe',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
    });

    const output = Array.isArray(result) ? result[0] : result;
    const chunks = output.chunks || [];

    console.log('[Whisper] Transcription complete:', chunks.length, 'segments');

    return {
        segments: chunks.map((chunk: { text: string; timestamp: [number, number] }) => ({
            text: chunk.text?.trim() || '',
            start: chunk.timestamp?.[0] || 0,
            end: chunk.timestamp?.[1] || 0,
        })),
    };
}
