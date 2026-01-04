import {
    ExtensionToVideoCommand,
    WhisperTranscriptionProgressMessage,
    WhisperTranscriptionCompleteMessage,
    WhisperTranscriptionErrorMessage,
} from '@project/common';
import { WhisperWorkerRequest, WhisperWorkerResponse, WhisperTranscriptionResult } from '@project/common/whisper/whisper-types';
import { whisperWorkerFactory } from './whisper-worker-factory';

interface TranscriptionRequester {
    tabId: number;
    src: string;
}

export default class WhisperTranscriptionService {
    private worker: Worker | null = null;
    private currentRequester: TranscriptionRequester | null = null;
    private isTranscribing: boolean = false;

    async transcribe(
        audioData: ArrayBuffer,
        sampleRate: number,
        requester: TranscriptionRequester,
        options?: {
            language?: string;
            modelId?: string;
        }
    ): Promise<WhisperTranscriptionResult> {
        if (this.isTranscribing) {
            throw new Error('Transcription already in progress');
        }

        this.isTranscribing = true;
        this.currentRequester = requester;

        try {
            if (!this.worker) {
                this.worker = await whisperWorkerFactory();
            }

            return await this._runTranscription(audioData, sampleRate, options);
        } finally {
            this.isTranscribing = false;
            this.currentRequester = null;
        }
    }

    private _runTranscription(
        audioData: ArrayBuffer,
        sampleRate: number,
        options?: {
            language?: string;
            modelId?: string;
        }
    ): Promise<WhisperTranscriptionResult> {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Worker not initialized'));
                return;
            }

            this.worker.onmessage = (e: MessageEvent<WhisperWorkerResponse>) => {
                const { command, result, error, progress, stage } = e.data;

                switch (command) {
                    case 'progress':
                        this._notifyProgress(progress!, stage!);
                        break;
                    case 'model-loaded':
                        this._notifyProgress(0.05, 'loading-model');
                        break;
                    case 'transcription-complete':
                        this._notifyComplete(result!);
                        resolve(result!);
                        break;
                    case 'transcription-error':
                        this._notifyError(error!);
                        reject(new Error(error));
                        break;
                }
            };

            this.worker.onerror = (e) => {
                const errorMessage = `Worker error: ${e.message}`;
                this._notifyError(errorMessage);
                reject(new Error(errorMessage));
            };

            const request: WhisperWorkerRequest = {
                command: 'transcribe',
                audioData,
                sampleRate,
                language: options?.language,
                modelId: options?.modelId,
            };

            this.worker.postMessage(request, [audioData]);
        });
    }

    private _notifyProgress(progress: number, stage: 'loading-model' | 'transcribing' | 'complete') {
        if (!this.currentRequester) return;

        const command: ExtensionToVideoCommand<WhisperTranscriptionProgressMessage> = {
            sender: 'asbplayer-extension-to-video',
            message: {
                command: 'whisper-transcription-progress',
                progress,
                stage,
            },
            src: this.currentRequester.src,
        };
        browser.tabs.sendMessage(this.currentRequester.tabId, command);
    }

    private _notifyComplete(result: WhisperTranscriptionResult) {
        if (!this.currentRequester) return;

        const command: ExtensionToVideoCommand<WhisperTranscriptionCompleteMessage> = {
            sender: 'asbplayer-extension-to-video',
            message: {
                command: 'whisper-transcription-complete',
                segments: result.segments,
                language: result.language,
                duration: result.duration,
            },
            src: this.currentRequester.src,
        };
        browser.tabs.sendMessage(this.currentRequester.tabId, command);
    }

    private _notifyError(error: string) {
        if (!this.currentRequester) return;

        const command: ExtensionToVideoCommand<WhisperTranscriptionErrorMessage> = {
            sender: 'asbplayer-extension-to-video',
            message: {
                command: 'whisper-transcription-error',
                error,
            },
            src: this.currentRequester.src,
        };
        browser.tabs.sendMessage(this.currentRequester.tabId, command);
    }

    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.isTranscribing = false;
        this.currentRequester = null;
    }

    get transcribing(): boolean {
        return this.isTranscribing;
    }
}
