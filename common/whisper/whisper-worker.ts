import { pipeline, env } from '@huggingface/transformers';
import { WhisperWorkerRequest, WhisperWorkerResponse, WhisperTranscriptionResult } from './whisper-types';

// Configure transformers.js for browser environment
env.allowLocalModels = false;
env.useBrowserCache = true;

// Configure ONNX WASM paths to use bundled files (required for Chrome extension CSP)
// Chrome extensions cannot fetch WASM files from CDN at runtime
if (env?.backends?.onnx?.wasm) {
    // Use chrome.runtime.getURL since worker runs in extension context
    const onnxPath =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
            ? chrome.runtime.getURL('/onnx/')
            : '/onnx/';
    env.backends.onnx.wasm.wasmPaths = onnxPath;
}

// Use 'any' for the pipeline to avoid complex union type issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
let currentModelId: string | null = null;

// Default to whisper-small for Japanese support (multilingual)
const DEFAULT_MODEL = 'onnx-community/whisper-small';

async function loadModel(modelId: string = DEFAULT_MODEL): Promise<void> {
    if (transcriber && currentModelId === modelId) {
        return;
    }

    // Report loading progress
    postMessage({
        command: 'progress',
        progress: 0,
        stage: 'loading-model',
    } as WhisperWorkerResponse);

    transcriber = await pipeline('automatic-speech-recognition', modelId, {
        dtype: 'q8', // Use quantized model for smaller size
        device: 'webgpu', // Use WebGPU for acceleration
    });

    currentModelId = modelId;

    postMessage({
        command: 'model-loaded',
    } as WhisperWorkerResponse);
}

async function transcribeAudio(
    audioData: ArrayBuffer,
    sampleRate: number,
    language?: string,
    modelId?: string
): Promise<WhisperTranscriptionResult> {
    await loadModel(modelId);

    // Convert ArrayBuffer to Float32Array
    const audioArray = new Float32Array(audioData);

    postMessage({
        command: 'progress',
        progress: 0.1,
        stage: 'transcribing',
    } as WhisperWorkerResponse);

    const result = await transcriber(audioArray, {
        language: language || 'ja',
        task: 'transcribe',
        return_timestamps: 'word',
        chunk_length_s: 30,
        stride_length_s: 5,
    });

    // Handle result format - can be a single object or array
    const output = Array.isArray(result) ? result[0] : result;
    const chunks = output.chunks || [];

    return {
        segments: chunks.map((chunk: { text: string; timestamp: [number, number] }) => ({
            text: chunk.text?.trim() || '',
            start: chunk.timestamp?.[0] || 0,
            end: chunk.timestamp?.[1] || 0,
        })),
        language: language,
        duration: chunks.length > 0 ? chunks[chunks.length - 1]?.timestamp?.[1] || 0 : 0,
    };
}

export function onMessage() {
    onmessage = async (e: MessageEvent<WhisperWorkerRequest>) => {
        const { command, audioData, sampleRate, language, modelId } = e.data;

        try {
            switch (command) {
                case 'load-model':
                    await loadModel(modelId);
                    break;

                case 'transcribe':
                case 'transcribe-segment':
                    if (!audioData || !sampleRate) {
                        throw new Error('Missing audioData or sampleRate');
                    }

                    const result = await transcribeAudio(audioData, sampleRate, language, modelId);

                    postMessage({
                        command: 'transcription-complete',
                        result,
                    } as WhisperWorkerResponse);
                    break;

                default:
                    throw new Error(`Unknown command: ${command}`);
            }
        } catch (error) {
            postMessage({
                command: 'transcription-error',
                error: error instanceof Error ? error.message : String(error),
            } as WhisperWorkerResponse);
        }
    };
}

onMessage();
