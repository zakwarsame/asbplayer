import FrameBridgeServer from '@/services/frame-bridge-server';
import { renderSubtitleSyncUi } from '@/ui/subtitle-sync';

export default defineUnlistedScript(() => {
    window.addEventListener('load', () => {
        const root = document.getElementById('root')!;
        const loc = JSON.parse(document.getElementById('loc')!.innerHTML!);
        const bridge = renderSubtitleSyncUi(root, loc.lang, loc.strings);
        const listener = new FrameBridgeServer(bridge);
        listener.bind();

        window.addEventListener('unload', () => {
            listener.unbind();
        });
    });
});
