import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    TextField,
    CircularProgress,
    Typography,
    IconButton,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';

interface AutoSubsDialogProps {
    open: boolean;
    onClose: () => void;
    onSubtitleSelected: (subtitle: Subs) => void;
    title: string;
    episode: number | '';
    apiKey: string;
    onVideoInfoChange: React.Dispatch<React.SetStateAction<{ title: string; episode: number | ''; apiKey: string }>>;
}

interface Subs {
    name: string;
    url: string;
}

const AutoSubsDialog: React.FC<AutoSubsDialogProps> = ({
    open,
    onClose,
    onSubtitleSelected,
    title,
    episode,
    apiKey,
    onVideoInfoChange,
}) => {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [subtitles, setSubtitles] = useState<Subs[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [selectedSubtitle, setSelectedSubtitle] = useState<Subs | null>(null);

    const fetchSubtitles = useCallback(
        async (currentAnilistId: number) => {
            setLoading(true);
            setError(null);

            if (!episode) {
                setError('Please enter an episode number');
                setLoading(false);
                return;
            }

            if (!currentAnilistId) {
                setError('Please enter an anime title');
                setLoading(false);
                return;
            }
            try {
                const apiKey = await getapiKey();
                if (!apiKey) {
                    throw new Error('Jimaku API Key not found');
                }

                const BASE_URL = 'https://jimaku.cc/api';
                const jimakuErrors = new Map([
                    [400, "Something went wrong! This shouldn't happen"],
                    [401, 'Authentication failed. Check your API Key'],
                    [404, 'Entry not found'],
                    [429, 'You downloaded too many subs in a short amount of time. Try again in a short bit'],
                ]);

                if (subtitles && subtitles.length > 0) {
                    return;
                }

                if (!currentAnilistId) {
                    return;
                }

                const searchResponse = await fetch(`${BASE_URL}/entries/search?anilist_id=${currentAnilistId}`, {
                    method: 'GET',
                    headers: {
                        Authorization: `${apiKey}`,
                    },
                });

                if (!searchResponse.ok) {
                    const error = jimakuErrors.get(searchResponse.status) || 'Something went wrong';
                    throw new Error(error);
                }

                const jimakuEntry = await searchResponse.json();
                if (jimakuEntry.length === 0) {
                    throw new Error('No subs found for this anime');
                }

                const id = jimakuEntry[0].id;
                const filesResponse = await fetch(`${BASE_URL}/entries/${id}/files?episode=${episode}`, {
                    method: 'GET',
                    headers: {
                        Authorization: `${apiKey}`,
                    },
                });

                if (!filesResponse.ok) {
                    const error = jimakuErrors.get(filesResponse.status) || 'Something went wrong';
                    throw new Error(error);
                }

                const subs: Subs[] = await filesResponse.json();
                if (subs.length === 0) {
                    throw new Error(`No subs for episode ${episode} found`);
                }

                setSubtitles(subs);
                setSelectedSubtitle(subs[0]);
            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        },
        [episode]
    );

    const handleDownload = useCallback(() => {
        if (selectedSubtitle) {
            onSubtitleSelected(selectedSubtitle);
            onClose();
        }
    }, [selectedSubtitle, onSubtitleSelected, onClose]);

    const handleTempAnilistIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onVideoInfoChange((prev) => ({ ...prev, title: e.target.value }));
    };

    const handleTempEpisodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsedEpisode = parseInt(e.target.value);
        if (!isNaN(parsedEpisode)) {
            onVideoInfoChange((prev) => ({ ...prev, episode: parsedEpisode || '' }));
        }

        if (e.target.value === '') {
            onVideoInfoChange((prev) => ({ ...prev, episode: '' }));
        }

        if (isNaN(parsedEpisode)) {
            setError('Please enter a number for the episode');
        }
    };

    const handleSubmitTemp = useCallback(async () => {
        const missingFields: string[] = [];
        if (!title.trim()) missingFields.push('anime title');
        if (!episode) missingFields.push('episode number');
        if (!apiKey.trim()) missingFields.push('Jimaku API Key');

        if (missingFields.length > 0) {
            const errorMessage = `Please enter ${missingFields.join(', ')}`;
            setError(errorMessage);
            return;
        }

        const episodeNumber = Number(episode);
        if (isNaN(episodeNumber) || episodeNumber <= 0) {
            setError('Episode must be a valid positive number');
            return;
        }

        if (apiKey.length < 15) {
            setError('Jimaku API Key seems too short. Please check it');
            return;
        }
        try {
            setLoading(true);
            setError(null);
            const { anilistId: resultAnilistId } = await fetchAnilistInfo(title);
            if (resultAnilistId) {
                await fetchSubtitles(resultAnilistId);
            } else {
                throw new Error('Unable to find Anilist ID for the given title');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [title, fetchSubtitles]);

    const handleapiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newApiKey = e.target.value;
        onVideoInfoChange((prev) => ({ ...prev, apiKey: newApiKey }));
        localStorage.setItem('apiKey', newApiKey);
    };

    return (
        <Dialog open={open} onClose={onClose}>
            <DialogTitle>
                {t('autoSubsDialog.title')}
                <IconButton
                    aria-label="close"
                    onClick={onClose}
                    style={{
                        position: 'absolute',
                        right: 8,
                        top: 8,
                    }}
                >
                    <CloseIcon />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <TextField
                    fullWidth
                    label={t('autoSubsDialog.apiKey')}
                    value={apiKey}
                    onChange={handleapiKeyChange}
                    margin="normal"
                    variant="outlined"
                />
                <TextField
                    fullWidth
                    label={t('autoSubsDialog.animeTitle')}
                    value={title}
                    onChange={handleTempAnilistIdChange}
                    margin="normal"
                    variant="outlined"
                />
                <TextField
                    fullWidth
                    label={t('autoSubsDialog.episode')}
                    value={episode}
                    onChange={handleTempEpisodeChange}
                    margin="normal"
                    variant="outlined"
                    type="number"
                />
                {loading && <CircularProgress />}
                {error && <Typography color="error">{error}</Typography>}
                {subtitles && (
                    <FormControl fullWidth margin="normal">
                        <InputLabel id="subtitle-select-label">{t('autoSubsDialog.selectSubtitle')}</InputLabel>
                        <Select
                            labelId="subtitle-select-label"
                            id="subtitle-select"
                            value={selectedSubtitle?.name || ''}
                            onChange={(e) =>
                                setSelectedSubtitle(
                                    subtitles.find((sub) => sub.name === (e.target.value as string)) || null
                                )
                            }
                            label={t('autoSubsDialog.selectSubtitle')}
                        >
                            {subtitles.map((sub) => (
                                <MenuItem key={sub.name} value={sub.name}>
                                    {sub.name.length > 50 ? `${sub.name.substring(0, 47)}...` : sub.name}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('action.cancel')}</Button>
                <Button onClick={handleSubmitTemp} color="default">
                    {t('autoSubsDialog.search')}
                </Button>
                {subtitles && (
                    <Button onClick={handleDownload} color="default" disabled={!selectedSubtitle}>
                        {t('autoSubsDialog.load')}
                    </Button>
                )}
            </DialogActions>
        </Dialog>
    );
};

async function getapiKey(): Promise<string | null> {
    return localStorage.getItem('apiKey');
}

export async function fetchAnilistInfo(episodeTitle: string): Promise<{ anilistId: number | null }> {
    const title = episodeTitle;

    const query = `
    query ($title: String) {
        Media (search: $title, type: ANIME) {
            id
            title {
                romaji
                english
                native
            }
        }
    }
    `;

    if (!title) {
        return { anilistId: null };
    }

    const variables = { title };
    try {
        const response = await fetch('https://graphql.anilist.co', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
            },
            body: JSON.stringify({ query, variables }),
        });

        if (!response.ok) {
            console.error('Response status:', response.status, response.statusText);
            throw new Error('Anilist API request failed');
        }

        const { data } = await response.json();
        const anilistId = data.Media.id;

        return { anilistId };
    } catch (error) {
        console.error('Error fetching Anilist info:', error);
        return { anilistId: null };
    }
}

export default AutoSubsDialog;
