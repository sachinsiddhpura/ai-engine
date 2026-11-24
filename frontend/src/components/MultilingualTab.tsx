import React, { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import TranslateIcon from '@mui/icons-material/Translate';
import SendIcon from '@mui/icons-material/Send';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import {
  askGujaratiText,
  askGujaratiVoice,
  getGeneratedAudioUrl,
  type MultilingualRAGResponse,
} from '../api/client';

const SAMPLE_QUESTION = 'જો દર્દીનો eGFR 28.5 હોય તો શું મેટફોર્મિન આપી શકાય?';
const SUPPORTED_AUDIO_TYPES = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/x-m4a', 'audio/mp4', 'audio/ogg'];

export const MultilingualTab: React.FC = () => {
  const [question, setQuestion] = useState(SAMPLE_QUESTION);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<MultilingualRAGResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTextQuery = async () => {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await askGujaratiText(question.trim(), includeAudio));
    } catch (err: unknown) {
      const responseError = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(responseError.response?.data?.detail || responseError.message || 'Unable to process the Gujarati question.');
    } finally {
      setLoading(false);
    }
  };

  const runVoiceQuery = async () => {
    if (!audioFile || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await askGujaratiVoice(audioFile, includeAudio));
    } catch (err: unknown) {
      const responseError = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(responseError.response?.data?.detail || responseError.message || 'Unable to transcribe and process the audio file.');
    } finally {
      setLoading(false);
    }
  };

  const handleAudioChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    if (!SUPPORTED_AUDIO_TYPES.includes(file.type) && !/\.(wav|mp3|m4a|ogg)$/i.test(file.name)) {
      setError('Upload a WAV, MP3, M4A, or OGG audio file.');
      setAudioFile(null);
      return;
    }
    setAudioFile(file);
    setError(null);
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <TranslateIcon color="primary" fontSize="large" />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Gujarati Voice & Translation RAG
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Ask clinical knowledge-base questions in Gujarati. The service translates to English, retrieves a grounded answer, then returns Gujarati text and optional speech.
        </Typography>
      </Box>

      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Response preferences</Typography>
            <Typography variant="body2" color="text.secondary">Generate a Gujarati MP3 answer when speech playback is needed.</Typography>
          </Box>
          <FormControlLabel
            control={<Switch checked={includeAudio} onChange={(event) => setIncludeAudio(event.target.checked)} />}
            label="Generate spoken answer"
          />
        </Box>
        <Divider sx={{ mb: 2.5 }} />

        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Ask in Gujarati text</Typography>
        <TextField
          fullWidth
          multiline
          minRows={3}
          label="Gujarati question"
          placeholder="ગુજરાતીમાં તમારો પ્રશ્ન લખો..."
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={loading}
          slotProps={{ htmlInput: { lang: 'gu' } }}
          sx={{ mb: 1.5 }}
        />
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button size="small" onClick={() => setQuestion(SAMPLE_QUESTION)} disabled={loading}>Use sample question</Button>
          <Button
            variant="contained"
            startIcon={loading ? <CircularProgress color="inherit" size={18} /> : <SendIcon />}
            disabled={loading || question.trim().length < 2}
            onClick={runTextQuery}
          >
            {loading ? 'Translating & searching...' : 'Ask in Gujarati'}
          </Button>
        </Box>
      </Paper>

      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>Or ask with Gujarati voice</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload a spoken Gujarati WAV, MP3, M4A, or OGG recording. The original upload is only used to create the transcription.
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button variant="outlined" component="label" startIcon={<UploadFileIcon />} disabled={loading}>
            Choose audio file
            <input hidden type="file" accept="audio/wav,audio/mpeg,audio/mp3,audio/x-m4a,audio/mp4,audio/ogg,.wav,.mp3,.m4a,.ogg" onChange={handleAudioChange} />
          </Button>
          {audioFile && <Chip label={`${audioFile.name} (${(audioFile.size / 1024).toFixed(1)} KB)`} onDelete={() => setAudioFile(null)} color="primary" variant="outlined" />}
          <Button
            variant="contained"
            disabled={!audioFile || loading}
            onClick={runVoiceQuery}
            startIcon={loading ? <CircularProgress color="inherit" size={18} /> : <GraphicEqIcon />}
          >
            {loading ? 'Transcribing & searching...' : 'Process voice question'}
          </Button>
        </Box>
      </Paper>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {result && (
        <Stack spacing={3}>
          <Card variant="outlined" sx={{ borderColor: 'primary.main', bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(2, 132, 199, 0.04)' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <FormatQuoteIcon color="primary" fontSize="large" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>ગુજરાતીમાં જવાબ</Typography>
              </Box>
              <Typography lang="gu" variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{result.gujarati_final_answer}</Typography>
              {result.audio_output_path && (
                <Box sx={{ mt: 2.5, pt: 2, borderTop: 1, borderColor: 'divider' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}><VolumeUpIcon color="primary" /><Typography variant="subtitle2">Spoken Gujarati reply</Typography></Box>
                  <audio controls preload="metadata" src={getGeneratedAudioUrl(result.audio_output_path)} style={{ width: '100%' }}>Your browser does not support audio playback.</audio>
                </Box>
              )}
            </CardContent>
          </Card>

          <Paper sx={{ p: 2.5 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2 }}>Translation & retrieval trace</Typography>
            <Stack spacing={2}>
              <Box><Typography variant="caption" color="text.secondary">ORIGINAL GUJARATI QUESTION</Typography><Typography lang="gu" sx={{ whiteSpace: 'pre-wrap' }}>{result.original_gujarati_query}</Typography></Box>
              <Divider />
              <Box><Typography variant="caption" color="text.secondary">ENGLISH SEARCH QUERY</Typography><Typography sx={{ whiteSpace: 'pre-wrap' }}>{result.translated_english_query}</Typography></Box>
              <Divider />
              <Box><Typography variant="caption" color="text.secondary">ENGLISH GROUNDED ANSWER</Typography><Typography sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{result.english_rag_answer}</Typography></Box>
              {result.citations.length > 0 && <><Divider /><Box><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>CITATIONS</Typography><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>{result.citations.map((citation) => <Chip key={citation} label={citation} size="small" variant="outlined" />)}</Box></Box></>}
            </Stack>
          </Paper>
        </Stack>
      )}
    </Box>
  );
};
