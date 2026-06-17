import CssBaseline from '@mui/material/CssBaseline';
import ThemeProvider from '@mui/material/styles/ThemeProvider';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import SubtitleSyncDialog from './SubtitleSyncDialog';
import Bridge from '../bridge';
import {
    Message,
    SubtitleSyncCandidate,
    SubtitleSyncUiBridgeCloseMessage,
    SubtitleSyncUiBridgeSyncMessage,
    SubtitleSyncUiModel,
    UpdateStateMessage,
} from '@project/common';
import { createTheme } from '@project/common/theme';
import { type PaletteMode } from '@mui/material/styles';
import { bufferToBase64 } from '@project/common/base64';
import { StyledEngineProvider } from '@mui/material/styles';

interface Props {
    bridge: Bridge;
}

export default function SubtitleSyncUi({ bridge }: Props) {
    const [open, setOpen] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [primaryLabel, setPrimaryLabel] = useState<string>();
    const [candidates, setCandidates] = useState<SubtitleSyncCandidate[]>([]);
    const [selectedReferenceId, setSelectedReferenceId] = useState<string>('audio');
    const [error, setError] = useState<string>();
    const [themeType, setThemeType] = useState<string>('dark');

    const theme = useMemo(() => createTheme(themeType as PaletteMode), [themeType]);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const uploadsRef = useRef<Map<string, { name: string; base64: string }>>(new Map());

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
            if (model.primaryLabel !== undefined) {
                setPrimaryLabel(model.primaryLabel);
            }
            if (model.candidates !== undefined) {
                uploadsRef.current.clear();
                setCandidates(model.candidates);
            }
            if (model.selectedReferenceId !== undefined) {
                setSelectedReferenceId(model.selectedReferenceId);
            }
            if (model.error !== undefined) {
                setError(model.error);
            }
            if (model.themeType !== undefined) {
                setThemeType(model.themeType);
            }
        });
    }, [bridge]);

    const handleClose = useCallback(() => {
        setOpen(false);
        const message: SubtitleSyncUiBridgeCloseMessage = { command: 'close' };
        bridge.sendMessageFromServer(message);
    }, [bridge]);

    const handleReferenceChange = useCallback((id: string) => setSelectedReferenceId(id), []);

    const handleUpload = useCallback(() => fileInputRef.current?.click(), []);

    const handleFileInputChange = useCallback(async () => {
        const files = fileInputRef.current?.files;

        if (files && files.length > 0) {
            const file = files[0];
            const base64 = await bufferToBase64(await file.arrayBuffer());
            const id = `uploaded-${Date.now()}`;

            uploadsRef.current.set(id, { name: file.name, base64 });
            setCandidates((cs) => [...cs, { id, label: file.name, origin: 'uploaded' }]);
            setSelectedReferenceId(id);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, []);

    const handleSync = useCallback(() => {
        const message: SubtitleSyncUiBridgeSyncMessage = {
            command: 'sync',
            referenceId: selectedReferenceId,
            uploaded: uploadsRef.current.get(selectedReferenceId),
        };
        bridge.sendMessageFromServer(message);
        setOpen(false);
    }, [bridge, selectedReferenceId]);

    return (
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                <SubtitleSyncDialog
                    open={open}
                    isLoading={isLoading}
                    primaryLabel={primaryLabel}
                    candidates={candidates}
                    selectedReferenceId={selectedReferenceId}
                    error={error}
                    onClose={handleClose}
                    onReferenceChange={handleReferenceChange}
                    onUpload={handleUpload}
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
