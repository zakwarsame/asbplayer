import {
    Command,
    Message,
    AsbPlayerToVideoCommandV2,
    ExtensionToVideoCommand,
    SubtitleOffsetDetectedMessage,
    RequestSubtitlesMessage,
    RequestSubtitlesResponse,
    RequestVideoStateMessage,
    VideoStateResponse,
    OffsetToVideoMessage,
    ExtensionToOffscreenDocumentCommand,
    CaptureRawAudioMessage,
    RawAudioCapturedResponse,
    RequestActiveTabPermissionMessage,
    StartVadAlignmentMessage,
    VadAlignmentErrorMessage,
} from '@project/common';
import { detectOffsetWithVAD, createSimpleVAD } from '../../services/vad';
import { ensureOffscreenAudioServiceDocument } from '../../services/offscreen-document';

const SAMPLE_DURATION_SECONDS = 30;
const VAD_SAMPLE_RATE = 16000;

export default class VadAlignmentHandler {
    get sender() {
        return 'asbplayerv2';
    }

    get command() {
        return 'start-vad-alignment';
    }

    handle(command: Command<Message>, _sender: Browser.runtime.MessageSender) {
        const alignmentCommand = command as AsbPlayerToVideoCommandV2<StartVadAlignmentMessage>;
        const { tabId, src } = alignmentCommand;

        console.log('[VAD] Starting auto-sync for tab', tabId);
        this._doAlignment(tabId, src).catch((e) => console.error('[VAD] Error:', e));
        return false;
    }

    private async _doAlignment(tabId: number, src: string) {
        try {
            console.log('[VAD] Getting video state...');
            const videoState = await this._requestVideoState(tabId, src);
            const captureStartTimeMs = videoState.currentTime * 1000;
            console.log('[VAD] Video at', videoState.currentTime.toFixed(2), 's');

            console.log('[VAD] Capturing audio...');
            const audioBase64 = await this._captureAudio(tabId, SAMPLE_DURATION_SECONDS * 1000);
            console.log('[VAD] Captured', audioBase64.length, 'chars (base64)');

            // Convert base64 to Float32Array
            const audioData = this._base64ToFloat32Array(audioBase64);
            console.log('[VAD] Decoded', audioData.length, 'samples');

            console.log('[VAD] Fetching subtitles...');
            const subtitles = await this._requestSubtitles(tabId, src);
            if (!subtitles?.length) throw new Error('No subtitles loaded');
            console.log('[VAD] Got', subtitles.length, 'subtitles');

            console.log('[VAD] Running VAD alignment...');
            const vadEngine = createSimpleVAD();
            const offsetResult = await detectOffsetWithVAD(subtitles, audioData, VAD_SAMPLE_RATE, vadEngine, {
                captureStartTimeMs,
                captureDurationMs: SAMPLE_DURATION_SECONDS * 1000,
            });
            console.log('[VAD] Offset:', offsetResult.offset, 'ms, confidence:', Math.round(offsetResult.confidence * 100) + '%');

            if (offsetResult.confidence < 0.3) {
                throw new Error(`Low confidence (${Math.round(offsetResult.confidence * 100)}%)`);
            }

            console.log('[VAD] Applying offset...');
            await browser.tabs.sendMessage(tabId, {
                sender: 'asbplayer-extension-to-video',
                message: { command: 'offset', value: offsetResult.offset } as OffsetToVideoMessage,
                src,
            } as ExtensionToVideoCommand<OffsetToVideoMessage>);

            console.log('[VAD] Complete! Offset:', offsetResult.offset, 'ms');
            browser.tabs.sendMessage(tabId, {
                sender: 'asbplayer-extension-to-video',
                message: {
                    command: 'subtitle-offset-detected',
                    offset: offsetResult.offset,
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
            console.error('[VAD] Failed:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Check if this is an activeTab permission error
            const isActiveTabError =
                errorMessage.includes('Extension has not been invoked') || errorMessage.includes('activeTab permission');

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
                        command: 'vad-alignment-error',
                        error: errorMessage,
                    } as VadAlignmentErrorMessage,
                    src,
                } as ExtensionToVideoCommand<VadAlignmentErrorMessage>);
            }

            // Also notify sidepanel to stop spinner
            browser.runtime.sendMessage({
                sender: 'asbplayer-extension-to-sidepanel',
                message: {
                    command: 'vad-alignment-error',
                    error: errorMessage,
                },
            });
        }
    }

    private _base64ToFloat32Array(base64: string): Float32Array {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return new Float32Array(bytes.buffer);
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
                sampleRate: VAD_SAMPLE_RATE,
            },
        };

        const response = (await browser.runtime.sendMessage(command)) as RawAudioCapturedResponse;
        if (!response?.success || !response?.audioBase64) {
            throw new Error(response?.error || 'Audio capture failed');
        }
        return response.audioBase64;
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
