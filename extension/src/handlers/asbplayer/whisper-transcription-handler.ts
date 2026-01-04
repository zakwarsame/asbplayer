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
    RequestVideoStateMessage,
    VideoStateResponse,
    OffsetToVideoMessage,
    ExtensionToOffscreenDocumentCommand,
    CaptureAndTranscribeMessage,
    CaptureAndTranscribeResponse,
} from '@project/common';
import { detectOffset } from '@project/common/whisper/offset-detector';
import { ensureOffscreenAudioServiceDocument } from '../../services/offscreen-document';

// Duration of audio to sample for transcription (in seconds)
const SAMPLE_DURATION_SECONDS = 30;
// Target sample rate for Whisper (16kHz)
const WHISPER_SAMPLE_RATE = 16000;

export default class WhisperTranscriptionHandler {
    constructor() {}

    get sender() {
        return 'asbplayerv2';
    }

    get command() {
        return 'start-whisper-transcription';
    }

    handle(command: Command<Message>, sender: Browser.runtime.MessageSender) {
        console.log('[Whisper] Handler invoked!', command);

        const transcriptionCommand = command as AsbPlayerToVideoCommandV2<StartWhisperTranscriptionMessage>;
        const { tabId, src } = transcriptionCommand;
        const { language } = transcriptionCommand.message;

        console.log('[Whisper] Starting auto-sync for tab', tabId, 'language:', language);

        // Run async work without blocking
        this._doTranscription(tabId, src, language).catch((error) => {
            console.error('[Whisper] Unhandled error:', error);
        });

        return false; // Don't keep message channel open
    }

    private async _doTranscription(tabId: number, src: string, language?: string) {
        try {
            // Step 1: Get current video position before capturing
            console.log('[Whisper] Step 1: Getting video state...');
            const videoState = await this._requestVideoState(tabId, src);
            const captureStartTimeMs = videoState.currentTime * 1000;
            console.log('[Whisper] Video at', videoState.currentTime.toFixed(2), 'seconds');

            // Step 2: Capture audio and transcribe via offscreen document
            console.log('[Whisper] Step 2: Capturing and transcribing', SAMPLE_DURATION_SECONDS, 'seconds of audio...');
            const transcription = await this._captureAndTranscribe(tabId, SAMPLE_DURATION_SECONDS * 1000, language);
            console.log('[Whisper] Transcription complete:', transcription.segments.length, 'segments');
            console.log('[Whisper] Transcription text:', transcription.segments.map((s) => s.text).join(' '));

            // Step 3: Get current subtitles from the video
            console.log('[Whisper] Step 3: Fetching subtitles from video...');
            const subtitles = await this._requestSubtitles(tabId, src);

            if (!subtitles || subtitles.length === 0) {
                throw new Error('No subtitles loaded');
            }
            console.log('[Whisper] Got', subtitles.length, 'subtitle entries');

            // Step 4: Detect offset (pass captureStartTimeMs to align timestamps)
            console.log('[Whisper] Step 4: Detecting offset...');
            const offsetResult = detectOffset(subtitles, transcription, { captureStartTimeMs });
            console.log(
                '[Whisper] Offset result:',
                offsetResult.offset,
                'ms, confidence:',
                Math.round(offsetResult.confidence * 100) + '%',
                'drift:',
                offsetResult.drift
            );

            if (offsetResult.confidence < 0.3) {
                throw new Error(`Low confidence offset detection (${Math.round(offsetResult.confidence * 100)}%)`);
            }

            // Step 5: Apply the detected offset
            console.log('[Whisper] Step 5: Applying offset', offsetResult.offset, 'ms');
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
            console.log('[Whisper] Auto-sync complete! Offset:', offsetResult.offset, 'ms');
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
            console.error('[Whisper] Auto-sync failed:', error);
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

    private async _captureAndTranscribe(
        tabId: number,
        durationMs: number,
        language?: string
    ): Promise<{ segments: { text: string; start: number; end: number }[] }> {
        console.log('[Whisper] Ensuring offscreen document...');
        await ensureOffscreenAudioServiceDocument();
        console.log('[Whisper] Offscreen document ready');

        // Get media stream ID for the tab
        console.log('[Whisper] Getting media stream ID for tab', tabId);
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
        console.log('[Whisper] Got stream ID:', streamId?.substring(0, 20) + '...');

        // Request capture and transcription from offscreen document
        console.log('[Whisper] Requesting capture and transcription from offscreen document...');
        const command: ExtensionToOffscreenDocumentCommand<CaptureAndTranscribeMessage> = {
            sender: 'asbplayer-extension-to-offscreen-document',
            message: {
                command: 'capture-and-transcribe',
                streamId,
                durationMs,
                sampleRate: WHISPER_SAMPLE_RATE,
                language,
            },
        };

        const response = (await browser.runtime.sendMessage(command)) as CaptureAndTranscribeResponse;
        console.log('[Whisper] Transcription response:', response?.success, response?.error);

        if (!response.success || !response.segments) {
            throw new Error(response.error || 'Transcription failed');
        }

        return { segments: response.segments };
    }

    private async _requestVideoState(tabId: number, src: string): Promise<VideoStateResponse> {
        const message: ExtensionToVideoCommand<RequestVideoStateMessage> = {
            sender: 'asbplayer-extension-to-video',
            message: {
                command: 'request-video-state',
            },
            src,
        };
        const response = (await browser.tabs.sendMessage(tabId, message)) as VideoStateResponse | undefined;
        if (!response) {
            throw new Error('Failed to get video state');
        }
        return response;
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
