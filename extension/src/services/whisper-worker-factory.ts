export const whisperWorkerFactory = async () => {
    const code = await (await fetch(browser.runtime.getURL('/whisper-worker.js'))).text();
    const blob = new Blob([code], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
};
