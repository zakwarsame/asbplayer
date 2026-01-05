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
} from '@project/common';
import AudioRecorder, { TimedRecordingInProgressError, NoRecordingInProgressError } from '@/services/audio-recorder';
import { Mp3Encoder } from '@project/common/audio-clip';
import { base64ToBlob, bufferToBase64 } from '@project/common/base64';
import { mp3WorkerFactory } from '@/services/mp3-worker-factory';

// Encode Float32Array as base64 for message passing
const float32ToBase64 = (data: Float32Array): string => {
    return bufferToBase64(data.buffer);
};

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

const _stream = async (streamId: string): Promise<MediaStream> => {
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
                    processor.disconnect();
                    source.disconnect();
                    audioContext.close();
                    stream.getTracks().forEach((t) => t.stop());

                    const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
                    const result = new Float32Array(totalLength);
                    let offset = 0;
                    for (const chunk of audioChunks) {
                        result.set(chunk, offset);
                        offset += chunk.length;
                    }

                    resolve({
                        success: true,
                        audioBase64: float32ToBase64(result),
                        sampleRate: audioContext.sampleRate,
                    });
                }
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            setTimeout(() => {
                if (samplesCollected < samplesNeeded) {
                    processor.disconnect();
                    source.disconnect();
                    audioContext.close();
                    stream.getTracks().forEach((t) => t.stop());
                    resolve({ success: false, error: 'Audio capture timeout' });
                }
            }, durationMs + 5000);
        });
    } catch (error) {
        stream.getTracks().forEach((t) => t.stop());
        throw error;
    }
};

let currentRequestId: string | undefined;

const errorResponseForError = (e: any) => {
    const errorCode =
        e instanceof DOMException && e.name === 'AbortError'
            ? StartRecordingErrorCode.noActiveTabPermission
            : StartRecordingErrorCode.other;
    return { started: false, error: { code: errorCode, message: e.message } };
};

window.onload = async () => {
    const listener = (request: any, _sender: Browser.runtime.MessageSender, sendResponse: (response?: any) => void) => {
        if (request.sender !== 'asbplayer-extension-to-offscreen-document') return;

        switch (request.message.command) {
            case 'start-recording-audio-with-timeout': {
                const msg = request.message as StartRecordingAudioWithTimeoutMessage;
                _stream(msg.streamId)
                    .then((stream) =>
                        audioRecorder.stopSafely().then(() =>
                            audioRecorder.startWithTimeout(stream, msg.timeout, () => {
                                sendResponse({ started: true } as StartRecordingResponse);
                            })
                        )
                    )
                    .then((audioBase64) => _sendAudioBase64(audioBase64, msg.requestId, msg.encodeAsMp3))
                    .catch((e) => {
                        console.error(e);
                        sendResponse(errorResponseForError(e));
                    });
                return true;
            }
            case 'start-recording-audio': {
                const msg = request.message as StartRecordingAudioMessage;
                currentRequestId = msg.requestId;
                _stream(msg.streamId)
                    .then((stream) => audioRecorder.stopSafely().then(() => audioRecorder.start(stream)))
                    .then(() => sendResponse({ started: true }))
                    .catch((e) => {
                        console.error(e);
                        sendResponse(errorResponseForError(e));
                    });
                return true;
            }
            case 'stop-recording-audio': {
                const msg = request.message as StopRecordingAudioMessage;
                audioRecorder
                    .stop()
                    .then((audioBase64) => {
                        sendResponse({ stopped: true } as StopRecordingResponse);
                        _sendAudioBase64(audioBase64, currentRequestId!, msg.encodeAsMp3);
                    })
                    .catch((e) => {
                        const errorCode =
                            e instanceof TimedRecordingInProgressError
                                ? StopRecordingErrorCode.timedAudioRecordingInProgress
                                : StopRecordingErrorCode.other;
                        if (!(e instanceof NoRecordingInProgressError)) console.error(e);
                        sendResponse({ stopped: false, error: { code: errorCode, message: e.message } } as StopRecordingResponse);
                    });
                return true;
            }
            case 'encode-mp3': {
                const msg = request.message as EncodeMp3InServiceWorkerMessage;
                Mp3Encoder.encode(base64ToBlob(msg.base64, `audio/${msg.extension}`), mp3WorkerFactory)
                    .then((blob) => blob.arrayBuffer())
                    .then((buffer) => sendResponse(bufferToBase64(buffer)))
                    .catch(console.error);
                return true;
            }
            case 'capture-raw-audio': {
                const msg = request.message as CaptureRawAudioMessage;
                _captureRawAudio(msg.streamId, msg.durationMs, msg.sampleRate)
                    .then((result) => sendResponse(result))
                    .catch((e) => {
                        console.error('Raw audio capture failed:', e);
                        sendResponse({ success: false, error: e instanceof Error ? e.message : String(e) } as RawAudioCapturedResponse);
                    });
                return true;
            }
        }
    };

    browser.runtime.onMessage.addListener(listener);
    window.addEventListener('beforeunload', () => browser.runtime.onMessage.removeListener(listener));
};
