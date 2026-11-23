import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Slider,
  Grid,
  Card,
  CardContent,
  Chip,
  Alert,
  CircularProgress,
  Stack,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SearchIcon from '@mui/icons-material/Search';
import TuneIcon from '@mui/icons-material/Tune';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import {
  ingestPdf,
  queryRAG,
  type IngestResponse,
  type RAGQueryResponse,
} from '../api/client';

const SAMPLE_QUESTIONS = [
  'What chunk size and overlap are used in the ingestion pipeline?',
  'Which port does the Qdrant vector database run on?',
  'What are the requirements for microservice health checks?',
];

export const RagTab: React.FC = () => {
  // Ingest State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [ingesting, setIngesting] = useState<boolean>(false);
  const [ingestSuccess, setIngestSuccess] = useState<IngestResponse | null>(null);
  const [ingestError, setIngestError] = useState<string | null>(null);

  // Query State
  const [question, setQuestion] = useState<string>('What chunk size and overlap are used in the ingestion pipeline?');
  const [initialTopK, setInitialTopK] = useState<number>(15);
  const [finalTopK, setFinalTopK] = useState<number>(3);
  const [querying, setQuerying] = useState<boolean>(false);
  const [queryResult, setQueryResult] = useState<RAGQueryResponse | null>(null);
  const [queryError, setQueryError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setIngestError('Only PDF files are supported by the RAG ingestion pipeline.');
        setSelectedFile(null);
        return;
      }
      setSelectedFile(file);
      setIngestError(null);
      setIngestSuccess(null);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setIngesting(true);
    setIngestError(null);
    setIngestSuccess(null);

    try {
      const res = await ingestPdf(selectedFile);
      setIngestSuccess(res);
      setSelectedFile(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setIngestError(e.response?.data?.detail || e.message || 'Failed to ingest PDF.');
    } finally {
      setIngesting(false);
    }
  };

  const handleQuery = async () => {
    if (!question.trim()) return;
    setQuerying(true);
    setQueryError(null);
    setQueryResult(null);

    try {
      const res = await queryRAG({
        question,
        initial_top_k: initialTopK,
        final_top_k: finalTopK,
      });
      setQueryResult(res);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setQueryError(e.response?.data?.detail || e.message || 'Failed to query RAG pipeline.');
    } finally {
      setQuerying(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <MenuBookIcon color="primary" fontSize="large" />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Enterprise RAG Pipeline
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Dense vector embeddings via Ollama (<code>nomic-embed-text</code>) stored in Qdrant,
          coupled with Cross-Encoder (<code>ms-marco-MiniLM-L-6-v2</code>) reranking for high-precision citation.
        </Typography>
      </Box>

      {/* Top Section: Document Ingestion */}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          1. Document Ingestion (PDF &rarr; Chunks &rarr; Qdrant)
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Upload PDF technical runbooks, architecture specs, or incident playbooks to index into vector store.
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            component="label"
            startIcon={<UploadFileIcon />}
            disabled={ingesting}
          >
            Select PDF Document
            <input type="file" accept="application/pdf" hidden onChange={handleFileChange} />
          </Button>

          {selectedFile && (
            <Chip
              label={`${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`}
              onDelete={() => setSelectedFile(null)}
              color="primary"
              variant="outlined"
            />
          )}

          <Button
            variant="contained"
            color="primary"
            onClick={handleUpload}
            disabled={!selectedFile || ingesting}
            startIcon={ingesting ? <CircularProgress size={18} color="inherit" /> : <UploadFileIcon />}
          >
            {ingesting ? 'Processing & Vectorizing...' : 'Ingest & Index'}
          </Button>
        </Box>

        {ingestSuccess && (
          <Alert
            severity="success"
            icon={<CheckCircleIcon fontSize="inherit" />}
            sx={{ mt: 2 }}
            onClose={() => setIngestSuccess(null)}
          >
            Successfully indexed <strong>{ingestSuccess.filename}</strong>! Processed{' '}
            <strong>{ingestSuccess.pages_processed} pages</strong> into{' '}
            <strong>{ingestSuccess.chunks_indexed} vector chunks</strong> in collection{' '}
            <code>{ingestSuccess.collection}</code>.
          </Alert>
        )}

        {ingestError && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setIngestError(null)}>
            {ingestError}
          </Alert>
        )}
      </Paper>

      {/* Middle Section: Semantic Search & Reranking */}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          2. Grounded Q&A with Reranking
        </Typography>

        {/* Sample Questions */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            Sample knowledge base queries:
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {SAMPLE_QUESTIONS.map((q, idx) => (
              <Chip
                key={idx}
                label={q}
                size="small"
                onClick={() => setQuestion(q)}
                sx={{ cursor: 'pointer', mb: 0.5 }}
              />
            ))}
          </Box>
        </Box>

        <TextField
          fullWidth
          multiline
          rows={2}
          label="Question / Technical Query"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={querying}
          sx={{ mb: 2 }}
        />

        {/* Reranker Controls */}
        <Accordion variant="outlined" sx={{ mb: 2 }}>
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TuneIcon fontSize="small" color="primary" />
              <Typography variant="subtitle2">Reranker & Retrieval Hyperparameters</Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Initial Candidates from Qdrant (<code>initial_top_k</code>): <strong>{initialTopK}</strong>
                </Typography>
                <Slider
                  value={initialTopK}
                  min={3}
                  max={40}
                  step={1}
                  valueLabelDisplay="auto"
                  onChange={(_, val) => setInitialTopK(val as number)}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Final Reranked Context (<code>final_top_k</code>): <strong>{finalTopK}</strong>
                </Typography>
                <Slider
                  value={finalTopK}
                  min={1}
                  max={10}
                  step={1}
                  valueLabelDisplay="auto"
                  onChange={(_, val) => setFinalTopK(val as number)}
                />
              </Grid>
            </Grid>
          </AccordionDetails>
        </Accordion>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Endpoint: <code style={{ color: '#0284c7' }}>POST /api/v1/rag/query</code>
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={querying ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
            onClick={handleQuery}
            disabled={querying || !question.trim()}
          >
            {querying ? 'Searching & Reranking...' : 'Ask RAG Pipeline'}
          </Button>
        </Box>
      </Paper>

      {queryError && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setQueryError(null)}>
          {queryError}
        </Alert>
      )}

      {/* Response Display */}
      {queryResult && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Grounded Answer Card */}
          <Card
            variant="outlined"
            sx={{
              borderColor: 'primary.main',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(2, 132, 199, 0.04)',
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                <FormatQuoteIcon color="primary" fontSize="large" />
                <Typography variant="h6" sx={{ fontWeight: 700 }}>
                  Grounded Synthesis
                </Typography>
              </Box>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                {queryResult.answer}
              </Typography>
            </CardContent>
          </Card>

          {/* Sources and Rerank Scores */}
          <Paper sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Retrieved & Reranked Source Chunks
              </Typography>
              <Chip
                label={`${queryResult.sources.length} Context Chunks Cited`}
                color="primary"
                size="small"
              />
            </Box>

            {queryResult.sources.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                No indexed chunks were found matching this query in Qdrant collection.
              </Typography>
            ) : (
              <Stack spacing={2}>
                {queryResult.sources.map((src, idx) => (
                  <Card key={idx} variant="outlined">
                    <CardContent sx={{ pb: '16px !important' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip label={`Chunk #${idx + 1}`} size="small" />
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {src.source} (Page {src.page})
                          </Typography>
                        </Box>
                        <Chip
                          label={`Rerank Score: ${src.rerank_score}`}
                          color={src.rerank_score > 0 ? 'success' : 'default'}
                          size="small"
                        />
                      </Box>
                      <Divider sx={{ my: 1 }} />
                      <Typography
                        variant="body2"
                        sx={{
                          fontStyle: 'italic',
                          color: 'text.secondary',
                          lineHeight: 1.6,
                        }}
                      >
                        "{src.text_preview}"
                      </Typography>
                    </CardContent>
                  </Card>
                ))}
              </Stack>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
};
