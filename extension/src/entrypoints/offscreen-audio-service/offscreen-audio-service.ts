import {
    StartRecordingAudioWithTimeoutMessage,
    StopRecordingAudioMessage,
    AudioBase64Message,
    StartRecordingAudioMessage,
    OffscreenDocumentToExtensionCommand,
    StartRecordingResponse,
    StartRecordingErrorCode,
    StopRecordingErrorCode,
    StopRecordingResponse,
    EncodeMp3InServiceWorkerMessage,
    CaptureRawAudioMessage,
    RawAudioCapturedResponse,
    CaptureAndTranscribeMessage,
    CaptureAndTranscribeResponse,
} from '@project/common';
import AudioRecorder, { TimedRecordingInProgressError, NoRecordingInProgressError } from '@/services/audio-recorder';
import { Mp3Encoder } from '@project/common/audio-clip';
import { base64ToBlob, bufferToBase64 } from '@project/common/base64';
import { mp3WorkerFactory } from '@/services/mp3-worker-factory';
import { pipeline, env } from '@huggingface/transformers';

const audioRecorder = new AudioRecorder();

const _sendAudioBase64 = async (base64: string, requestId: string, encodeAsMp3: boolean) => {
    if (encodeAsMp3) {
        const blob = await (await fetch('data:audio/webm;base64,' + base64)).blob();
        const mp3Blob = await Mp3Encoder.encode(blob, mp3WorkerFactory);
        base64 = bufferToBase64(await mp3Blob.arrayBuffer());
    }

    const command: OffscreenDocumentToExtensionCommand<AudioBase64Message> = {
        sender: 'asbplayer-offscreen-document',
        message: {
            command: 'audio-base64',
            base64,
            requestId,
        },
    };

    browser.runtime.sendMessage(command);
};

const _stream: (streamId: string) => Promise<MediaStream> = async (streamId: string) => {
    return navigator.mediaDevices.getUserMedia({
        audio: {
            // @ts-ignore
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId,
            },
        },
    });
};

const _captureRawAudio = async (
    streamId: string,
    durationMs: number,
    targetSampleRate: number
): Promise<RawAudioCapturedResponse> => {
    const stream = await _stream(streamId);

    try {
        const audioContext = new AudioContext({ sampleRate: targetSampleRate });
        const source = audioContext.createMediaStreamSource(stream);

        // Use ScriptProcessorNode for raw audio capture
        // Note: ScriptProcessorNode is deprecated but still widely supported
        const bufferSize = 4096;
        const processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

        const audioChunks: Float32Array[] = [];
        const samplesNeeded = (durationMs / 1000) * audioContext.sampleRate;

        return new Promise((resolve) => {
            let samplesCollected = 0;

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                audioChunks.push(new Float32Array(inputData));
                samplesCollected += inputData.length;

                if (samplesCollected >= samplesNeeded) {
                    // Stop recording
                    processor.disconnect();
                    source.disconnect();
                    audioContext.close();
                    stream.getTracks().forEach((t) => t.stop());

                    // Concatenate all chunks
                    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
                    const result = new Float32Array(totalLength);
                    let offset = 0;
                    for (const chunk of audioChunks) {
                        result.set(chunk, offset);
                        offset += chunk.length;
                    }

                    resolve({
                        success: true,
                        audioData: result.buffer,
                        sampleRate: audioContext.sampleRate,
                    });
                }
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            // Timeout after duration + buffer
            setTimeout(() => {
                if (samplesCollected < samplesNeeded) {
                    processor.disconnect();
                    source.disconnect();
                    audioContext.close();
                    stream.getTracks().forEach((t) => t.stop());
                    resolve({
                        success: false,
                        error: 'Audio capture timeout',
                    });
                }
            }, durationMs + 5000);
        });
    } catch (error) {
        stream.getTracks().forEach((t) => t.stop());
        throw error;
    }
};

// Whisper transcription - runs directly in offscreen document
// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

// Configure ONNX WASM paths to use bundled files
if (env?.backends?.onnx?.wasm) {
    env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('/onnx/');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let transcriber: any = null;
const DEFAULT_MODEL = 'onnx-community/whisper-small';

const _loadModel = async () => {
    if (transcriber) return;

    console.log('[Offscreen] Loading Whisper model...');
    transcriber = await pipeline('automatic-speech-recognition', DEFAULT_MODEL, {
        dtype: 'q8',
        device: 'wasm', // WebGPU not available in offscreen documents
    });
    console.log('[Offscreen] Model loaded');
};

const _captureAndTranscribe = async (
    streamId: string,
    durationMs: number,
    sampleRate: number,
    language?: string
): Promise<CaptureAndTranscribeResponse> => {
    console.log('[Offscreen] Starting capture and transcribe...');

    // Step 1: Capture raw audio
    const audioResult = await _captureRawAudio(streamId, durationMs, sampleRate);
    if (!audioResult.success || !audioResult.audioData) {
        return { success: false, error: audioResult.error || 'Audio capture failed' };
    }
    console.log('[Offscreen] Audio captured:', audioResult.audioData.byteLength, 'bytes');

    try {
        // Step 2: Load model if needed
        await _loadModel();

        // Step 3: Run transcription
        console.log('[Offscreen] Running transcription...');
        const audioArray = new Float32Array(audioResult.audioData);

        const result = await transcriber(audioArray, {
            language: language || 'ja',
            task: 'transcribe',
            return_timestamps: true, // Segment-level timestamps (word-level requires output_attentions)
            chunk_length_s: 30,
            stride_length_s: 5,
        });

        const output = Array.isArray(result) ? result[0] : result;
        const chunks = output.chunks || [];

        console.log('[Offscreen] Transcription complete:', chunks.length, 'chunks');

        return {
            success: true,
            segments: chunks.map((chunk: { text: string; timestamp: [number, number] }) => ({
                text: chunk.text?.trim() || '',
                start: chunk.timestamp?.[0] || 0,
                end: chunk.timestamp?.[1] || 0,
            })),
            language: language,
            duration: chunks.length > 0 ? chunks[chunks.length - 1]?.timestamp?.[1] || 0 : 0,
        };
    } catch (error) {
        console.error('[Offscreen] Transcription error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
};

let currentRequestId: string | undefined;

const errorResponseForError = (e: any) => {
    let errorCode: StartRecordingErrorCode;

    if (e instanceof DOMException && e.name === 'AbortError') {
        errorCode = StartRecordingErrorCode.noActiveTabPermission;
    } else {
        errorCode = StartRecordingErrorCode.other;
    }

    return {
        started: false,
        error: { code: errorCode, message: e.message },
    };
};

window.onload = async () => {
    const listener = (request: any, sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (request.sender === 'asbplayer-extension-to-offscreen-document') {
            switch (request.message.command) {
                case 'start-recording-audio-with-timeout':
                    const startRecordingAudioWithTimeoutMessage =
                        request.message as StartRecordingAudioWithTimeoutMessage;
                    _stream(startRecordingAudioWithTimeoutMessage.streamId)
                        .then((stream) => {
                            return audioRecorder.stopSafely().then(() =>
                                audioRecorder.startWithTimeout(
                                    stream,
                                    startRecordingAudioWithTimeoutMessage.timeout,
                                    () => {
                                        const successResponse: StartRecordingResponse = { started: true };
                                        sendResponse(successResponse);
                                    }
                                )
                            );
                        })
                        .then((audioBase64) =>
                            _sendAudioBase64(
                                audioBase64,
                                startRecordingAudioWithTimeoutMessage.requestId,
                                startRecordingAudioWithTimeoutMessage.encodeAsMp3
                            )
                        )
                        .catch((e) => {
                            console.error(e);
                            sendResponse(errorResponseForError(e));
                        });
                    return true;
                case 'start-recording-audio':
                    const startRecordingAudioMessage = request.message as StartRecordingAudioMessage;
                    currentRequestId = startRecordingAudioMessage.requestId;
                    _stream(startRecordingAudioMessage.streamId)
                        .then((stream) => audioRecorder.stopSafely().then(() => audioRecorder.start(stream)))
                        .then(() => sendResponse({ started: true }))
                        .catch((e) => {
                            console.error(e);
                            sendResponse(errorResponseForError(e));
                        });
                    return true;
                case 'stop-recording-audio':
                    const stopRecordingAudioMessage = request.message as StopRecordingAudioMessage;
                    audioRecorder
                        .stop()
                        .then((audioBase64) => {
                            const successResponse: StopRecordingResponse = {
                                stopped: true,
                            };

                            sendResponse(successResponse);
                            _sendAudioBase64(audioBase64, currentRequestId!, stopRecordingAudioMessage.encodeAsMp3);
                        })
                        .catch((e) => {
                            let errorCode: StopRecordingErrorCode;

                            if (e instanceof TimedRecordingInProgressError) {
                                errorCode = StopRecordingErrorCode.timedAudioRecordingInProgress;
                            } else if (e instanceof NoRecordingInProgressError) {
                                // Just no-op if nothing is recording--this can happen in bulk export.
                                errorCode = StopRecordingErrorCode.other;
                            } else {
                                console.error(e);
                                errorCode = StopRecordingErrorCode.other;
                            }

                            const errorResponse: StopRecordingResponse = {
                                stopped: false,
                                error: {
                                    code: errorCode,
                                    message: e.message,
                                },
                            };

                            sendResponse(errorResponse);
                        });
                    return true;
                case 'encode-mp3':
                    const encodeMp3Message = request.message as EncodeMp3InServiceWorkerMessage;
                    const { base64, extension } = encodeMp3Message;

                    Mp3Encoder.encode(base64ToBlob(base64, `audio/${extension}`), mp3WorkerFactory)
                        .then((blob) => blob.arrayBuffer())
                        .then((buffer) => sendResponse(bufferToBase64(buffer)))
                        .catch(console.error);
                    return true;
                case 'capture-raw-audio':
                    const captureRawAudioMessage = request.message as CaptureRawAudioMessage;
                    _captureRawAudio(
                        captureRawAudioMessage.streamId,
                        captureRawAudioMessage.durationMs,
                        captureRawAudioMessage.sampleRate
                    )
                        .then((result) => sendResponse(result))
                        .catch((e) => {
                            console.error('Raw audio capture failed:', e);
                            const errorResponse: RawAudioCapturedResponse = {
                                success: false,
                                error: e instanceof Error ? e.message : String(e),
                            };
                            sendResponse(errorResponse);
                        });
                    return true;
                case 'capture-and-transcribe':
                    const captureAndTranscribeMessage = request.message as CaptureAndTranscribeMessage;
                    _captureAndTranscribe(
                        captureAndTranscribeMessage.streamId,
                        captureAndTranscribeMessage.durationMs,
                        captureAndTranscribeMessage.sampleRate,
                        captureAndTranscribeMessage.language
                    )
                        .then((result) => {
                            console.log('[Offscreen] Transcription result:', result.success, result.segments?.length);
                            sendResponse(result);
                        })
                        .catch((e) => {
                            console.error('[Offscreen] Capture and transcribe failed:', e);
                            const errorResponse: CaptureAndTranscribeResponse = {
                                success: false,
                                error: e instanceof Error ? e.message : String(e),
                            };
                            sendResponse(errorResponse);
                        });
                    return true;
            }
        }
    };
    browser.runtime.onMessage.addListener(listener);

    window.addEventListener('beforeunload', (event) => {
        browser.runtime.onMessage.removeListener(listener);
    });
};
