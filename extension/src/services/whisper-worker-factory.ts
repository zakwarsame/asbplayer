// Note: This factory is no longer used. Whisper transcription now runs
// directly in the offscreen document instead of a Worker, because:
// 1. Workers created from blob URLs can't do dynamic imports to extension URLs
// 2. Workers loaded directly can't use dynamic imports either due to CSP
// The offscreen document runs in a proper browser context where transformers.js works.
export const whisperWorkerFactory = async () => {
    throw new Error('whisperWorkerFactory is deprecated. Use offscreen document transcription instead.');
};
