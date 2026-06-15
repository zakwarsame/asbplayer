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
    CaptureRawAudioMessage,
    RawAudioCapturedResponse,
    TranscribeAudioResponse,
    TranscribeAudioMessage,
    RequestActiveTabPermissionMessage,
} from '@project/common';
import { SettingsProvider } from '@project/common/settings';
import { detectOffset } from '../../services/whisper/offset-detector';
import { ensureOffscreenAudioServiceDocument } from '../../services/offscreen-document';
import { ExtensionSettingsStorage } from '../../services/extension-settings-storage';

const SAMPLE_DURATION_SECONDS = 30;
const WHISPER_SAMPLE_RATE = 16000;

export default class WhisperTranscriptionHandler {
    get sender() {
        return 'asbplayerv2';
    }

    get command() {
        return 'start-whisper-transcription';
    }

    handle(command: Command<Message>, _sender: Browser.runtime.MessageSender) {
        const transcriptionCommand = command as AsbPlayerToVideoCommandV2<StartWhisperTranscriptionMessage>;
        const { tabId, src } = transcriptionCommand;
        const { language } = transcriptionCommand.message;

        console.log('[Whisper] Starting auto-sync for tab', tabId);
        this._doTranscription(tabId, src, language).catch((e) => console.error('[Whisper] Error:', e));
        return false;
    }

    private async _doTranscription(tabId: number, src: string, language?: string) {
        try {
            const settings = new SettingsProvider(new ExtensionSettingsStorage());
            const useWebGpu = await settings.getSingle('streamingUseWebGpuForWhisper');

            console.log('[Whisper] Getting video state...');
            const videoState = await this._requestVideoState(tabId, src);
            const captureStartTimeMs = videoState.currentTime * 1000;
            console.log('[Whisper] Video at', videoState.currentTime.toFixed(2), 's');

            console.log('[Whisper] Capturing audio...');
            const audioBase64 = await this._captureAudio(tabId, SAMPLE_DURATION_SECONDS * 1000);
            console.log('[Whisper] Captured', audioBase64.length, 'chars (base64)');

            console.log('[Whisper] Transcribing (WebGPU:', useWebGpu, ')...');
            const transcription = await this._transcribeViaSidepanel(audioBase64, language, useWebGpu);
            console.log('[Whisper] Got', transcription.segments.length, 'segments');
            console.log('[Whisper] Text:', transcription.segments.map((s) => s.text).join(' '));

            console.log('[Whisper] Fetching subtitles...');
            const subtitles = await this._requestSubtitles(tabId, src);
            if (!subtitles?.length) throw new Error('No subtitles loaded');
            console.log('[Whisper] Got', subtitles.length, 'subtitles');

            console.log('[Whisper] Detecting offset...');
            const offsetResult = detectOffset(subtitles, transcription, { captureStartTimeMs });
            console.log(
                '[Whisper] Offset:',
                offsetResult.offset,
                'ms, confidence:',
                Math.round(offsetResult.confidence * 100) + '%'
            );

            if (offsetResult.confidence < 0.3) {
                throw new Error(`Low confidence (${Math.round(offsetResult.confidence * 100)}%)`);
            }

            console.log('[Whisper] Applying offset...');
            await browser.tabs.sendMessage(tabId, {
                sender: 'asbplayer-extension-to-video',
                message: { command: 'offset', value: offsetResult.offset } as OffsetToVideoMessage,
                src,
            } as ExtensionToVideoCommand<OffsetToVideoMessage>);

            console.log('[Whisper] Complete! Offset:', offsetResult.offset, 'ms');
            browser.tabs.sendMessage(tabId, {
                sender: 'asbplayer-extension-to-video',
                message: {
                    command: 'subtitle-offset-detected',
                    offset: offsetResult.offset,
                    drift: offsetResult.drift,
                    confidence: offsetResult.confidence,
                } as SubtitleOffsetDetectedMessage,
                src,
            } as ExtensionToVideoCommand<SubtitleOffsetDetectedMessage>);

            // Notify sidepanel to stop spinner
            browser.runtime.sendMessage({
                sender: 'asbplayer-extension-to-sidepanel',
                message: {
                    command: 'subtitle-offset-detected',
                    offset: offsetResult.offset,
                },
            });
        } catch (error) {
            console.error('[Whisper] Failed:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Check if this is an activeTab permission error
            const isActiveTabError =
                errorMessage.includes('Extension has not been invoked') ||
                errorMessage.includes('activeTab permission');

            if (isActiveTabError) {
                // Show the "Enable audio recording" notification on video overlay
                browser.tabs.sendMessage(tabId, {
                    sender: 'asbplayer-extension-to-video',
                    message: {
                        command: 'request-active-tab-permission',
                    } as RequestActiveTabPermissionMessage,
                    src,
                } as ExtensionToVideoCommand<RequestActiveTabPermissionMessage>);
            } else {
                // Generic error - notify video tab
                browser.tabs.sendMessage(tabId, {
                    sender: 'asbplayer-extension-to-video',
                    message: {
                        command: 'whisper-transcription-error',
                        error: errorMessage,
                    } as WhisperTranscriptionErrorMessage,
                    src,
                } as ExtensionToVideoCommand<WhisperTranscriptionErrorMessage>);
            }

            // Also notify sidepanel to stop spinner
            browser.runtime.sendMessage({
                sender: 'asbplayer-extension-to-sidepanel',
                message: {
                    command: 'whisper-transcription-error',
                    error: errorMessage,
                },
            });
        }
    }

    private async _captureAudio(tabId: number, durationMs: number): Promise<string> {
        await ensureOffscreenAudioServiceDocument();

        const streamId = await new Promise<string>((resolve, reject) => {
            browser.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id: string) => {
                if (browser.runtime.lastError) reject(new Error(browser.runtime.lastError.message));
                else resolve(id);
            });
        });

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
        if (!response?.success || !response?.audioBase64) {
            throw new Error(response?.error || 'Audio capture failed');
        }
        return response.audioBase64;
    }

    private async _transcribeViaSidepanel(
        audioBase64: string,
        language?: string,
        useWebGpu?: boolean
    ): Promise<{ segments: { text: string; start: number; end: number }[] }> {
        const command = {
            sender: 'asbplayer-extension-to-sidepanel',
            message: {
                command: 'transcribe-audio',
                audioBase64,
                sampleRate: WHISPER_SAMPLE_RATE,
                language,
                useWebGpu,
            } as TranscribeAudioMessage,
        };

        const response = (await browser.runtime.sendMessage(command)) as TranscribeAudioResponse;
        if (!response.success || !response.segments) {
            throw new Error(response.error || 'Transcription failed');
        }
        return { segments: response.segments };
    }

    private async _requestVideoState(tabId: number, src: string): Promise<VideoStateResponse> {
        const response = (await browser.tabs.sendMessage(tabId, {
            sender: 'asbplayer-extension-to-video',
            message: { command: 'request-video-state' } as RequestVideoStateMessage,
            src,
        } as ExtensionToVideoCommand<RequestVideoStateMessage>)) as VideoStateResponse | undefined;
        if (!response) throw new Error('Failed to get video state');
        return response;
    }

    private async _requestSubtitles(tabId: number, src: string) {
        const response = (await browser.tabs.sendMessage(tabId, {
            sender: 'asbplayer-extension-to-video',
            message: { command: 'request-subtitles' } as RequestSubtitlesMessage,
            src,
        } as ExtensionToVideoCommand<RequestSubtitlesMessage>)) as RequestSubtitlesResponse | undefined;
        return response?.subtitles;
    }
}
