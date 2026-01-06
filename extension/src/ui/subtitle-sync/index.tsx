import { createRoot } from 'react-dom/client';
import Bridge from '../bridge';
import SubtitleSyncUi from '../components/SubtitleSyncUi';
import { i18nInit } from '../i18n';

export function renderSubtitleSyncUi(element: Element, language: string, locStrings: any) {
    const bridge = new Bridge();
    i18nInit(language, locStrings);
    createRoot(element).render(<SubtitleSyncUi bridge={bridge} />);
    return bridge;
}
