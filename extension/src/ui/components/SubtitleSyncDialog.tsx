import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/Close';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import makeStyles from '@mui/styles/makeStyles';
import { SubtitleSyncSubtitleTrack } from '@project/common';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';

const useStyles = makeStyles(() => ({
    relative: {
        position: 'relative',
    },
    spinner: {
        position: 'absolute',
        right: 'calc(1em + 14px)',
        top: 'calc(50% - 13px)',
        fontSize: '1.5em',
    },
}));

interface Props {
    open: boolean;
    isLoading: boolean;
    subtitleTracks: SubtitleSyncSubtitleTrack[];
    selectedPrimarySubtitleId: string;
    selectedReferenceSubtitleId: string;
    error?: string;
    onClose: () => void;
    onPrimarySubtitleChange: (id: string) => void;
    onReferenceSubtitleChange: (id: string) => void;
    onUploadPrimary: () => void;
    onUploadReference: () => void;
    onUseAudio: () => void;
    onSync: () => void;
}

export default function SubtitleSyncDialog({
    open,
    isLoading,
    subtitleTracks,
    selectedPrimarySubtitleId,
    selectedReferenceSubtitleId,
    error,
    onClose,
    onPrimarySubtitleChange,
    onReferenceSubtitleChange,
    onUploadPrimary,
    onUploadReference,
    onUseAudio,
    onSync,
}: Props) {
    const { t } = useTranslation();
    const classes = useStyles();

    const noneOption: SubtitleSyncSubtitleTrack = {
        id: '-',
        label: t('extension.subtitleSync.none'),
    };

    const primaryOptions = subtitleTracks;
    const referenceOptions = [noneOption, ...subtitleTracks];

    const canSync = selectedPrimarySubtitleId !== '-' || selectedReferenceSubtitleId !== '-';

    return (
        <Dialog disableRestoreFocus disableEnforceFocus fullWidth maxWidth="sm" open={open} onClose={onClose}>
            <Toolbar>
                <Typography variant="h6" style={{ flexGrow: 1 }}>
                    {t('extension.subtitleSync.title')}
                </Typography>
                <IconButton edge="end" onClick={onClose}>
                    <CloseIcon />
                </IconButton>
            </Toolbar>
            <DialogContent>
                <Grid container direction="column" spacing={2}>
                    {error && (
                        <Grid item>
                            <Alert severity="error">{error}</Alert>
                        </Grid>
                    )}

                    <Grid item>
                        <Typography variant="body2" color="textSecondary" gutterBottom>
                            {t('extension.subtitleSync.primarySubtitle')}
                        </Typography>
                        <div className={classes.relative}>
                            <TextField
                                select
                                fullWidth
                                variant="filled"
                                value={selectedPrimarySubtitleId}
                                disabled={isLoading}
                                onChange={(e) => onPrimarySubtitleChange(e.target.value)}
                            >
                                {primaryOptions.map((track) => (
                                    <MenuItem value={track.id} key={track.id}>
                                        {track.label}
                                    </MenuItem>
                                ))}
                                <MenuItem onClick={onUploadPrimary}>{t('action.openFiles')}</MenuItem>
                            </TextField>
                            {isLoading && (
                                <span className={classes.spinner}>
                                    <CircularProgress size={20} color="primary" />
                                </span>
                            )}
                        </div>
                    </Grid>

                    <Grid item>
                        <Typography variant="body2" color="textSecondary" gutterBottom>
                            {t('extension.subtitleSync.referenceSubtitle')}
                        </Typography>
                        <TextField
                            select
                            fullWidth
                            variant="filled"
                            value={selectedReferenceSubtitleId}
                            disabled={isLoading}
                            onChange={(e) => onReferenceSubtitleChange(e.target.value)}
                        >
                            {referenceOptions.map((track) => (
                                <MenuItem value={track.id} key={track.id}>
                                    {track.label}
                                </MenuItem>
                            ))}
                            <MenuItem onClick={onUploadReference}>{t('action.openFiles')}</MenuItem>
                        </TextField>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onUseAudio} disabled={isLoading}>
                    {t('extension.subtitleSync.useAudio')}
                </Button>
                <Button onClick={onSync} disabled={!canSync || isLoading}>
                    {t('extension.subtitleSync.sync')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
