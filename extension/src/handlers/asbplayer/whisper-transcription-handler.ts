import {
    Command,
    Message,
    AsbPlayerToVideoCommandV2,
    StartWhisperTranscriptionMessage,
    ExtensionToVideoCommand,
    SubtitleOffsetDetectedMessage,
    WhisperTranscriptionErrorMessage,
    RequestSubtitlesMessage,
    RequestSubtitlesResponse,
    OffsetToVideoMessage,
    ExtensionToOffscreenDocumentCommand,
    CaptureRawAudioMessage,
    RawAudioCapturedResponse,
} from '@project/common';
import { detectOffset } from '@project/common/whisper/offset-detector';
import WhisperTranscriptionService from '../../services/whisper-transcription-service';
import { ensureOffscreenAudioServiceDocument } from '../../services/offscreen-document';

// Duration of audio to sample for transcription (in seconds)
const SAMPLE_DURATION_SECONDS = 30;
// Target sample rate for Whisper (16kHz)
const WHISPER_SAMPLE_RATE = 16000;

export default class WhisperTranscriptionHandler {
    private readonly _transcriptionService: WhisperTranscriptionService;

    constructor(transcriptionService: WhisperTranscriptionService) {
        this._transcriptionService = transcriptionService;
    }

    get sender() {
        return 'asbplayerv2';
    }

    get command() {
        return 'start-whisper-transcription';
    }

    async handle(command: Command<Message>, sender: Browser.runtime.MessageSender) {
        const transcriptionCommand = command as AsbPlayerToVideoCommandV2<StartWhisperTranscriptionMessage>;
        const { tabId, src } = transcriptionCommand;
        const { language } = transcriptionCommand.message;

        try {
            // Step 1: Record audio sample via offscreen document
            const audioData = await this._captureAudioSample(tabId, SAMPLE_DURATION_SECONDS * 1000);

            // Step 2: Transcribe audio
            const transcription = await this._transcriptionService.transcribe(
                audioData.buffer,
                audioData.sampleRate,
                { tabId, src },
                { language }
            );

            // Step 3: Get current subtitles from the video
            const subtitles = await this._requestSubtitles(tabId, src);

            if (!subtitles || subtitles.length === 0) {
                throw new Error('No subtitles loaded');
            }

            // Step 4: Detect offset
            const offsetResult = detectOffset(subtitles, transcription);

            if (offsetResult.confidence < 0.3) {
                throw new Error(`Low confidence offset detection (${Math.round(offsetResult.confidence * 100)}%)`);
            }

            // Step 5: Apply the detected offset
            const offsetCommand: ExtensionToVideoCommand<OffsetToVideoMessage> = {
                sender: 'asbplayer-extension-to-video',
                message: {
                    command: 'offset',
                    value: offsetResult.offset,
                },
                src,
            };
            await browser.tabs.sendMessage(tabId, offsetCommand);

            // Step 6: Notify success
            const successCommand: ExtensionToVideoCommand<SubtitleOffsetDetectedMessage> = {
                sender: 'asbplayer-extension-to-video',
                message: {
                    command: 'subtitle-offset-detected',
                    offset: offsetResult.offset,
                    drift: offsetResult.drift,
                    confidence: offsetResult.confidence,
                },
                src,
            };
            browser.tabs.sendMessage(tabId, successCommand);
        } catch (error) {
            console.error('Whisper transcription failed:', error);
            const errorCommand: ExtensionToVideoCommand<WhisperTranscriptionErrorMessage> = {
                sender: 'asbplayer-extension-to-video',
                message: {
                    command: 'whisper-transcription-error',
                    error: error instanceof Error ? error.message : String(error),
                },
                src,
            };
            browser.tabs.sendMessage(tabId, errorCommand);
        }
    }

    private async _captureAudioSample(
        tabId: number,
        durationMs: number
    ): Promise<{ buffer: ArrayBuffer; sampleRate: number }> {
        // Ensure offscreen document is ready
        await ensureOffscreenAudioServiceDocument();

        // Get media stream ID for the tab
        const streamId = await new Promise<string>((resolve, reject) => {
            browser.tabCapture.getMediaStreamId(
                {
                    targetTabId: tabId,
                },
                (id: string) => {
                    if (browser.runtime.lastError) {
                        reject(new Error(browser.runtime.lastError.message));
                    } else {
                        resolve(id);
                    }
                }
            );
        });

        // Request raw audio capture from offscreen document
        const command: ExtensionToOffscreenDocumentCommand<CaptureRawAudioMessage> = {
            sender: 'asbplayer-extension-to-offscreen-document',
            message: {
                command: 'capture-raw-audio',
                streamId,
                durationMs,
                sampleRate: WHISPER_SAMPLE_RATE,
            },
        };

        const response = (await browser.runtime.sendMessage(command)) as RawAudioCapturedResponse;

        if (!response.success || !response.audioData) {
            throw new Error(response.error || 'Failed to capture audio');
        }

        return {
            buffer: response.audioData,
            sampleRate: response.sampleRate || WHISPER_SAMPLE_RATE,
        };
    }

    private async _requestSubtitles(tabId: number, src: string) {
        const message: ExtensionToVideoCommand<RequestSubtitlesMessage> = {
            sender: 'asbplayer-extension-to-video',
            message: {
                command: 'request-subtitles',
            },
            src,
        };
        const response = (await browser.tabs.sendMessage(tabId, message)) as RequestSubtitlesResponse | undefined;
        return response?.subtitles;
    }
}
