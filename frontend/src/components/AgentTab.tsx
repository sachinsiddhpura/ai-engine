import React, { useState } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  CircularProgress,
  Chip,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Divider,
  Stack,
  Card,
  CardContent,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import BuildCircleIcon from '@mui/icons-material/BuildCircle';
import TaskAltIcon from '@mui/icons-material/TaskAlt';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import { runAgent, type AgentRunResponse } from '../api/client';

const PRESET_GOALS = [
  'Inspect all services and create an incident ticket for any service with high CPU or degraded status.',
  'Check the status and CPU of payment-gateway. If degraded, file a P1 incident ticket.',
  'Get metrics for auth-service and search knowledge base for operational details.',
];

export const AgentTab: React.FC = () => {
  const [goal, setGoal] = useState<string>(
    'Inspect all microservices and create an incident ticket if any service has high CPU or is degraded.'
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<AgentRunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleRun = async () => {
    if (!goal.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await runAgent(goal);
      setResult(data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail || e.message || 'Failed to execute agent loop.');
    } finally {
      setLoading(false);
    }
  };

  const copyFinalAnswer = () => {
    if (result?.final_answer) {
      navigator.clipboard.writeText(result.final_answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
      {/* Title & Description */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <PrecisionManufacturingIcon color="primary" fontSize="large" />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Autonomous ReAct Agent (MCP)
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Powered by LangGraph ReAct cyclic loop connected via Server-Sent Events to the FastMCP
          server. The agent autonomously queries SQLite metrics, searches Qdrant knowledge base,
          and writes incidents.
        </Typography>
      </Box>

      {/* Preset Chips */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Try sample operational goals:
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {PRESET_GOALS.map((preset, idx) => (
            <Chip
              key={idx}
              label={preset}
              size="small"
              icon={<AutoFixHighIcon fontSize="small" />}
              onClick={() => setGoal(preset)}
              sx={{ cursor: 'pointer', mb: 0.5 }}
            />
          ))}
        </Box>
      </Box>

      {/* Goal Input Card */}
      <Paper sx={{ p: 2.5, mb: 3 }}>
        <TextField
          fullWidth
          multiline
          rows={3}
          label="Agent Goal / Mission"
          placeholder="E.g. Check all microservices and create an incident ticket for any service with high CPU or degraded status."
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          disabled={loading}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Endpoint: <code style={{ color: '#0284c7' }}>POST /api/v1/agent/run</code>
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
            onClick={handleRun}
            disabled={loading || !goal.trim()}
          >
            {loading ? 'Agent Executing Plan...' : 'Run Agent Loop'}
          </Button>
        </Box>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading Progress State */}
      {loading && (
        <Paper sx={{ p: 4, textAlign: 'center', mb: 3 }}>
          <CircularProgress size={44} sx={{ mb: 2 }} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            Autonomous Agent in ReAct Loop...
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Calling FastMCP tools over SSE transport: inspecting SQLite database and synthesizing actions.
          </Typography>
        </Paper>
      )}

      {/* Result Section */}
      {result && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Final Answer Banner */}
          <Card
            variant="outlined"
            sx={{
              borderColor: 'success.main',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.05)',
            }}
          >
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <TaskAltIcon color="success" />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.main' }}>
                    Final Agent Resolution
                  </Typography>
                </Box>
                <Button
                  size="small"
                  variant="outlined"
                  color="success"
                  startIcon={<ContentCopyIcon />}
                  onClick={copyFinalAnswer}
                >
                  {copied ? 'Copied!' : 'Copy Answer'}
                </Button>
              </Box>
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                {result.final_answer}
              </Typography>
            </CardContent>
          </Card>

          {/* Execution Trace / Tool Steps */}
          <Paper sx={{ p: 2.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BuildCircleIcon color="secondary" />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Execution Trace & Tool Steps
                </Typography>
              </Box>
              <Chip
                label={`${result.steps_taken.length} Tool Actions Executed`}
                color="secondary"
                size="small"
              />
            </Box>

            {result.steps_taken.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                The agent resolved the goal directly from internal context without calling MCP tools.
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {result.steps_taken.map((step, idx) => (
                  <Accordion key={idx} defaultExpanded variant="outlined">
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                        <Chip
                          label={`Step ${idx + 1}`}
                          size="small"
                          color="primary"
                        />
                        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                          {step.tool_name}
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                      <Divider sx={{ mb: 1.5 }} />
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                        Arguments:
                      </Typography>
                      <Box
                        component="pre"
                        sx={{
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: 'background.default',
                          fontSize: '0.85rem',
                          overflowX: 'auto',
                          my: 0.5,
                        }}
                      >
                        {JSON.stringify(step.arguments, null, 2)}
                      </Box>

                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block', fontWeight: 600 }}>
                        Tool Output:
                      </Typography>
                      <Box
                        component="pre"
                        sx={{
                          p: 1.5,
                          borderRadius: 1,
                          bgcolor: 'background.default',
                          fontSize: '0.85rem',
                          overflowX: 'auto',
                          my: 0.5,
                          whiteSpace: 'pre-wrap',
                          borderLeft: '3px solid',
                          borderColor: 'primary.main',
                        }}
                      >
                        {step.output}
                      </Box>
                    </AccordionDetails>
                  </Accordion>
                ))}
              </Stack>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
};
