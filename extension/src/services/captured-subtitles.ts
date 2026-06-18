import type { CapturedSubtitle } from './network-subtitle-capture';

// Captured network CC tracks for the current tab, sourced from the background capture service.
// The background only stores tracks it was allowed to capture, so callers can trust the result
// without re-gating. Returns [] if the background is unreachable.
export async function requestCapturedSubtitles(): Promise<CapturedSubtitle[]> {
    try {
        return (await browser.runtime.sendMessage({ command: 'get-network-subtitles' })) || [];
    } catch {
        return [];
    }
}

export const capturedSubtitleLabel = (captured: CapturedSubtitle): string => `[Site] ${captured.label}`;
