import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Chip,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  Divider,
} from '@mui/material';
import HandymanIcon from '@mui/icons-material/Handyman';
import SendIcon from '@mui/icons-material/Send';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import TerminalIcon from '@mui/icons-material/Terminal';
import TokenIcon from '@mui/icons-material/Token';
import { chatWithTools, type ToolChatResponse } from '../api/client';

const SAMPLE_TOOL_PROMPTS = [
  'What is the real-time operational status and latency of auth and payments services?',
  'Check service health for notifications and summarize any downtime.',
  'Can you check the payments microservice health and recommend actions?',
];

export const ToolChatTab: React.FC = () => {
  const [prompt, setPrompt] = useState<string>(
    'What is the real-time operational status and latency of auth and payments services?'
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ToolChatResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await chatWithTools(prompt.trim());
      setResult(data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail || e.message || 'Failed to execute tool-calling chat.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: 3 }}>
      {/* Title */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <HandymanIcon color="primary" fontSize="large" />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Native Tool-Calling Chat
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Two-stage function calling: Ollama inspects your query, emits function calls to local Python
          handlers (<code>check_service_health</code>), and synthesizes a human response from the live output.
        </Typography>
      </Box>

      {/* Preset Chips */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Try sample DevOps queries:
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {SAMPLE_TOOL_PROMPTS.map((sample, idx) => (
            <Chip
              key={idx}
              label={sample}
              size="small"
              icon={<AutoFixHighIcon fontSize="small" />}
              onClick={() => setPrompt(sample)}
              sx={{ cursor: 'pointer', mb: 0.5 }}
            />
          ))}
        </Box>
      </Box>

      {/* Input Area */}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <TextField
          fullWidth
          multiline
          rows={2}
          label="Prompt (DevOps / Service Diagnostics)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Endpoint: <code style={{ color: '#0284c7' }}>POST /api/v1/ai/agent-chat</code>
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SendIcon />}
            onClick={handleSend}
            disabled={loading || !prompt.trim()}
          >
            {loading ? 'Executing Tool Calling...' : 'Invoke Tool Agent'}
          </Button>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Result Card */}
      {result && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Tools Executed Banner */}
          <Paper sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <TerminalIcon color="primary" />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Functions Invoked by LLM
              </Typography>
            </Box>

            {result.tools_executed.length === 0 ? (
              <Chip label="No tool needed - answered directly" color="default" size="small" />
            ) : (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {result.tools_executed.map((tool, idx) => (
                  <Chip
                    key={idx}
                    icon={<CheckCircleIcon fontSize="small" />}
                    label={tool}
                    color="success"
                    variant="outlined"
                    sx={{ fontFamily: 'monospace' }}
                  />
                ))}
              </Box>
            )}

            <Divider sx={{ my: 2 }} />

            {/* Token Usage */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <TokenIcon fontSize="small" color="secondary" />
              <Typography variant="caption" color="text.secondary">
                Two-Pass Token Usage:
              </Typography>
              <Chip
                label={`Prompt: ${result.usage.prompt_tokens}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Completion: ${result.usage.completion_tokens}`}
                size="small"
                variant="outlined"
              />
              <Chip
                label={`Total: ${result.usage.total_tokens}`}
                size="small"
                color="secondary"
                variant="outlined"
              />
            </Box>
          </Paper>

          {/* Final Synthesized Reply */}
          <Card
            variant="outlined"
            sx={{
              borderColor: 'primary.main',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(56, 189, 248, 0.05)' : 'rgba(2, 132, 199, 0.04)',
            }}
          >
            <CardContent>
              <Typography variant="subtitle2" color="primary" sx={{ fontWeight: 700, mb: 1 }}>
                Synthesized Assistant Resolution:
              </Typography>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {result.reply}
              </Typography>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};
