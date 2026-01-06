import CssBaseline from '@mui/material/CssBaseline';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import SubtitleSyncDialog from './SubtitleSyncDialog';
import Bridge from '../bridge';
import {
    Message,
    SerializedSubtitleFile,
    SubtitleSyncSubtitleTrack,
    SubtitleSyncUiBridgeCloseMessage,
    SubtitleSyncUiBridgeSyncMessage,
    SubtitleSyncUiBridgeUseAudioMessage,
    SubtitleSyncUiModel,
    UpdateStateMessage,
} from '@project/common';
import { createTheme } from '@project/common/theme';
import { type PaletteMode } from '@mui/material/styles';
import { bufferToBase64 } from '@project/common/base64';
import { useTranslation } from 'react-i18next';
import { StyledEngineProvider } from '@mui/material/styles';

interface Props {
    bridge: Bridge;
}

export default function SubtitleSyncUi({ bridge }: Props) {
    const { t } = useTranslation();
    const [open, setOpen] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [subtitleTracks, setSubtitleTracks] = useState<SubtitleSyncSubtitleTrack[]>([]);
    const [selectedPrimarySubtitleId, setSelectedPrimarySubtitleId] = useState<string>('-');
    const [selectedReferenceSubtitleId, setSelectedReferenceSubtitleId] = useState<string>('-');
    const [error, setError] = useState<string>();
    const [themeType, setThemeType] = useState<string>('dark');
    const [uploadTarget, setUploadTarget] = useState<'primary' | 'reference'>('primary');

    const theme = useMemo(() => createTheme(themeType as PaletteMode), [themeType]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        bridge.addClientMessageListener((message: Message) => {
            if (message.command !== 'updateState') {
                return;
            }

            const model = (message as UpdateStateMessage).state as SubtitleSyncUiModel;

            if (model.open !== undefined) {
                setOpen(model.open);
            }

            if (model.isLoading !== undefined) {
                setIsLoading(model.isLoading);
            }

            if (model.loadedSubtitles !== undefined) {
                setSubtitleTracks(model.loadedSubtitles);
                // Auto-select first subtitle as primary if available
                if (model.loadedSubtitles.length > 0 && selectedPrimarySubtitleId === '-') {
                    setSelectedPrimarySubtitleId(model.loadedSubtitles[0].id);
                }
            }

            if (model.selectedPrimarySubtitleId !== undefined) {
                setSelectedPrimarySubtitleId(model.selectedPrimarySubtitleId);
            }

            if (model.selectedReferenceSubtitleId !== undefined) {
                setSelectedReferenceSubtitleId(model.selectedReferenceSubtitleId);
            }

            if (model.error !== undefined) {
                setError(model.error);
            }

            if (model.themeType !== undefined) {
                setThemeType(model.themeType);
            }
        });
    }, [bridge, selectedPrimarySubtitleId]);

    const handleClose = useCallback(() => {
        setOpen(false);
        const message: SubtitleSyncUiBridgeCloseMessage = { command: 'close' };
        bridge.sendMessageFromServer(message);
    }, [bridge]);

    const handlePrimarySubtitleChange = useCallback((id: string) => {
        setSelectedPrimarySubtitleId(id);
    }, []);

    const handleReferenceSubtitleChange = useCallback((id: string) => {
        setSelectedReferenceSubtitleId(id);
    }, []);

    const handleFileInputChange = useCallback(async () => {
        const files = fileInputRef.current?.files;

        if (files && files.length > 0) {
            const file = files[0];
            const base64 = await bufferToBase64(await file.arrayBuffer());

            const newTrack: SubtitleSyncSubtitleTrack = {
                id: `uploaded-${Date.now()}`,
                label: file.name,
                fileName: file.name,
            };

            setSubtitleTracks((tracks) => [...tracks, newTrack]);

            if (uploadTarget === 'primary') {
                setSelectedPrimarySubtitleId(newTrack.id);
            } else {
                setSelectedReferenceSubtitleId(newTrack.id);
            }

            // Store the base64 data in a way the controller can access
            // We'll send it with the sync message
            (newTrack as any).base64 = base64;
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, [uploadTarget]);

    const handleUploadPrimary = useCallback(() => {
        setUploadTarget('primary');
        fileInputRef.current?.click();
    }, []);

    const handleUploadReference = useCallback(() => {
        setUploadTarget('reference');
        fileInputRef.current?.click();
    }, []);

    const handleUseAudio = useCallback(() => {
        const message: SubtitleSyncUiBridgeUseAudioMessage = { command: 'use-audio' };
        bridge.sendMessageFromServer(message);
        setOpen(false);
    }, [bridge]);

    const handleSync = useCallback(() => {
        const primaryTrack = subtitleTracks.find((t) => t.id === selectedPrimarySubtitleId);
        const referenceTrack = subtitleTracks.find((t) => t.id === selectedReferenceSubtitleId);

        const message: SubtitleSyncUiBridgeSyncMessage = {
            command: 'sync',
            primarySubtitle: primaryTrack
                ? {
                      name: primaryTrack.fileName || primaryTrack.label,
                      base64: (primaryTrack as any).base64 || '',
                  }
                : undefined,
            referenceSubtitle:
                referenceTrack && selectedReferenceSubtitleId !== '-'
                    ? {
                          name: referenceTrack.fileName || referenceTrack.label,
                          base64: (referenceTrack as any).base64 || '',
                      }
                    : undefined,
        };
        bridge.sendMessageFromServer(message);
    }, [bridge, subtitleTracks, selectedPrimarySubtitleId, selectedReferenceSubtitleId]);

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <SubtitleSyncDialog
                    open={open}
                    isLoading={isLoading}
                    subtitleTracks={subtitleTracks}
                    selectedPrimarySubtitleId={selectedPrimarySubtitleId}
                    selectedReferenceSubtitleId={selectedReferenceSubtitleId}
                    error={error}
                    onClose={handleClose}
                    onPrimarySubtitleChange={handlePrimarySubtitleChange}
                    onReferenceSubtitleChange={handleReferenceSubtitleChange}
                    onUploadPrimary={handleUploadPrimary}
                    onUploadReference={handleUploadReference}
                    onUseAudio={handleUseAudio}
                    onSync={handleSync}
                />
                <input
                    ref={fileInputRef}
                    onChange={handleFileInputChange}
                    type="file"
                    accept=".srt,.ass,.vtt,.sup,.dfxp,.ttml2"
                    hidden
                />
            </ThemeProvider>
        </StyledEngineProvider>
    );
}
