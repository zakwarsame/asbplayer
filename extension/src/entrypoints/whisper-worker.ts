import { onMessage } from '@project/common/whisper/whisper-worker';

export default defineUnlistedScript(() => {
    onMessage();
});
