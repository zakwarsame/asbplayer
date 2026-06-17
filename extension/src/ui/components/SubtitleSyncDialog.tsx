import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import CloseIcon from '@mui/icons-material/Close';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import makeStyles from '@mui/styles/makeStyles';
import { SubtitleSyncCandidate } from '@project/common';
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

const UPLOAD_ID = '__upload__';

interface Props {
    open: boolean;
    isLoading: boolean;
    primaryLabel?: string;
    candidates: SubtitleSyncCandidate[];
    selectedReferenceId: string;
    error?: string;
    onClose: () => void;
    onReferenceChange: (id: string) => void;
    onUpload: () => void;
    onSync: () => void;
}

export default function SubtitleSyncDialog({
    open,
    isLoading,
    primaryLabel,
    candidates,
    selectedReferenceId,
    error,
    onClose,
    onReferenceChange,
    onUpload,
    onSync,
}: Props) {
    const { t } = useTranslation();
    const classes = useStyles();

    const referenceLabel = (candidate: SubtitleSyncCandidate) =>
        candidate.confidence === undefined
            ? candidate.label
            : `${candidate.label} — ${Math.round(candidate.confidence * 100)}%`;

    const handleSelect = (id: string) => {
        if (id !== UPLOAD_ID) {
            onReferenceChange(id);
        }
    };

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
                        <Typography variant="body2" color="textSecondary">
                            {t('extension.subtitleSync.primarySubtitle')}
                        </Typography>
                        <Typography variant="body1">{primaryLabel ?? '—'}</Typography>
                    </Grid>

                    <Grid item>
                        <Typography variant="body2" color="textSecondary" gutterBottom>
                            {t('extension.subtitleSync.alignTo')}
                        </Typography>
                        <div className={classes.relative}>
                            <TextField
                                select
                                fullWidth
                                variant="filled"
                                value={selectedReferenceId}
                                disabled={isLoading}
                                onChange={(e) => handleSelect(e.target.value)}
                            >
                                <MenuItem value="audio">{t('extension.subtitleSync.audio')}</MenuItem>
                                {candidates.map((candidate) => (
                                    <MenuItem value={candidate.id} key={candidate.id}>
                                        {referenceLabel(candidate)}
                                    </MenuItem>
                                ))}
                                <Divider />
                                <MenuItem value={UPLOAD_ID} onClick={onUpload}>
                                    {t('extension.subtitleSync.upload')}
                                </MenuItem>
                            </TextField>
                            {isLoading && (
                                <span className={classes.spinner}>
                                    <CircularProgress size={20} color="primary" />
                                </span>
                            )}
                        </div>
                    </Grid>
                </Grid>
            </DialogContent>
            <DialogActions>
                <Button onClick={onSync} disabled={isLoading}>
                    {t('extension.subtitleSync.sync')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
