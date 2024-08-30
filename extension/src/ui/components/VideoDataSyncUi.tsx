import CssBaseline from '@material-ui/core/CssBaseline';
import ThemeProvider from '@material-ui/styles/ThemeProvider';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import VideoDataSyncDialog from './VideoDataSyncDialog';
import Bridge from '../bridge';
import {
    ConfirmedVideoDataSubtitleTrack,
    Message,
    SerializedSubtitleFile,
    UpdateStateMessage,
    VideoDataSubtitleTrack,
    VideoDataUiBridgeConfirmMessage,
    VideoDataUiBridgeOpenFileMessage,
} from '@project/common';
import { createTheme } from '@project/common/theme';
import { PaletteType } from '@material-ui/core';
import { bufferToBase64 } from '../../services/base64';
import { useTranslation } from 'react-i18next';

interface Props {
    bridge: Bridge;
}

export default function VideoDataSyncUi({ bridge }: Props) {
    const { t } = useTranslation();
    const [open, setOpen] = useState<boolean>(false);
    const [disabled, setDisabled] = useState<boolean>(false);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [suggestedName, setSuggestedName] = useState<string>('');
    const [showSubSelect, setShowSubSelect] = useState<boolean>(true);
    const [subtitles, setSubtitles] = useState<VideoDataSubtitleTrack[]>([
        { id: '-', language: '-', url: '-', label: t('extension.videoDataSync.emptySubtitleTrack'), extension: 'srt' },
    ]);
    const [selectedSubtitleTrackIds, setSelectedSubtitleTrackIds] = useState<string[]>(['-', '-', '-']);
    const [defaultCheckboxState, setDefaultCheckboxState] = useState<boolean>(false);
    const [openedFromMiningCommand, setOpenedFromMiningCommand] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [themeType, setThemeType] = useState<string>();
    const [apiKey, setApiKey] = useState<string>('');
    const [episode, setEpisode] = useState<number | ''>('');

    const [isAnimeSite, setIsAnimeSite] = useState<boolean>(false);

    const theme = useMemo(() => createTheme((themeType || 'dark') as PaletteType), [themeType]);

    const handleCancel = useCallback(() => {
        setOpen(false);
        bridge.sendMessageFromServer({ command: 'cancel' });
    }, [bridge]);
    const handleConfirm = useCallback(
        (data: ConfirmedVideoDataSubtitleTrack[], shouldRememberTrackChoices: boolean) => {
            setOpen(false);
            const message: VideoDataUiBridgeConfirmMessage = { command: 'confirm', data, shouldRememberTrackChoices };
            bridge.sendMessageFromServer(message);
        },
        [bridge]
    );

    useEffect(() => {
        bridge.addClientMessageListener((message: Message) => {
            if (message.command !== 'updateState') {
                return;
            }

            const state = (message as UpdateStateMessage).state;

            if (Object.prototype.hasOwnProperty.call(state, 'open')) {
                setOpen(state.open);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'isLoading')) {
                setIsLoading(state.isLoading);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'suggestedName')) {
                setSuggestedName(state.suggestedName);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'showSubSelect')) {
                setShowSubSelect(state.showSubSelect);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'subtitles')) {
                setSubtitles([
                    {
                        id: '-',
                        language: '-',
                        url: '-',
                        label: t('extension.videoDataSync.emptySubtitleTrack'),
                        extension: 'srt',
                    },
                    ...state.subtitles,
                ]);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'selectedSubtitle')) {
                setSelectedSubtitleTrackIds(state.selectedSubtitle);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'defaultCheckboxState')) {
                setDefaultCheckboxState(state.defaultCheckboxState);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'error')) {
                setError(state.error);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'themeType')) {
                setThemeType(state.themeType);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'openedFromMiningCommand')) {
                setOpenedFromMiningCommand(state.openedFromMiningCommand);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'apiKey')) {
                setApiKey(state.apiKey);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'episode')) {
                setEpisode(state.episode);
            }

            if (Object.prototype.hasOwnProperty.call(state, 'isAnimeSite')) {
                setIsAnimeSite(state.isAnimeSite);
            }
        });
    }, [bridge, t]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileInputChange = useCallback(async () => {
        const files = fileInputRef.current?.files;

        if (files && files.length > 0) {
            try {
                setDisabled(true);
                const subtitles: SerializedSubtitleFile[] = [];

                for (let i = 0; i < files.length; ++i) {
                    const f = files[i];
                    const base64 = await bufferToBase64(await f.arrayBuffer());

                    subtitles.push({
                        name: f.name,
                        base64: base64,
                    });
                }

                setOpen(false);
                const message: VideoDataUiBridgeOpenFileMessage = { command: 'openFile', subtitles };
                bridge.sendMessageFromServer(message);
            } finally {
                setDisabled(false);
            }
        }
    }, [bridge]);

    const handleOpenFile = useCallback(() => fileInputRef.current?.click(), []);

    const handleApiKeyChange = useCallback(
        (newApiKey: string) => {
            setApiKey(newApiKey);
            bridge.sendMessageFromServer({ command: 'updateApiKey', apiKey: newApiKey });
        },
        [bridge]
    );

    const handleEpisodeChange = useCallback(
        (newEpisode: number | '') => {
            setEpisode(newEpisode);
            bridge.sendMessageFromServer({ command: 'updateEpisode', episode: newEpisode });
        },
        [bridge]
    );

    const handleSearch = useCallback(
        (title: string, episode: number | '', apiKey: string) => {
            bridge.sendMessageFromServer({ command: 'search', title, episode, apiKey });
            setOpen(true);
        },
        [bridge]
    );

    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <VideoDataSyncDialog
                open={open}
                disabled={disabled}
                isLoading={isLoading}
                suggestedName={suggestedName}
                showSubSelect={showSubSelect}
                subtitleTracks={subtitles}
                selectedSubtitleTrackIds={selectedSubtitleTrackIds}
                defaultCheckboxState={defaultCheckboxState}
                openedFromMiningCommand={openedFromMiningCommand}
                error={error}
                isAnimeSite={isAnimeSite}
                onCancel={handleCancel}
                onOpenFile={handleOpenFile}
                onConfirm={handleConfirm}
                apiKey={apiKey}
                episode={episode}
                onApiKeyChange={handleApiKeyChange}
                onEpisodeChange={handleEpisodeChange}
                onSearch={handleSearch}
            />
            <input
                ref={fileInputRef}
                onChange={handleFileInputChange}
                type="file"
                accept=".srt,.ass,.vtt,.sup,.dfxp,.ttml2"
                multiple
                hidden
            />
        </ThemeProvider>
    );
}
