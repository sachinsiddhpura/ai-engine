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
  LinearProgress,
  Divider,
  Grid,
} from '@mui/material';
import DataObjectIcon from '@mui/icons-material/DataObject';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BugReportIcon from '@mui/icons-material/BugReport';
import PaymentIcon from '@mui/icons-material/Payment';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import LightbulbIcon from '@mui/icons-material/Lightbulb';
import PersonPinIcon from '@mui/icons-material/PersonPin';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { extractTicket, type TicketExtraction } from '../api/client';

const PRESET_ALERTS = [
  {
    label: 'DB Connection Timeout',
    text: 'HikariPool-1 timeout after 30000ms on payment-service prod-db-01, client queries timing out rapidly!',
  },
  {
    label: 'Kubernetes Pod OOMKilled',
    text: 'Pod auth-service restarted 6 times within 10 minutes due to Exit Code 137 OOMKilled in namespace production.',
  },
  {
    label: 'Customer Billing Issue',
    text: 'User was double-charged $499 on invoice #8921. Needs immediate chargeback reversal from billing support.',
  },
  {
    label: 'Feature Request',
    text: 'It would be amazing to have real-time Slack webhooks and PDF export for weekly incident reviews.',
  },
];

export const ExtractTab: React.FC = () => {
  const [inputText, setInputText] = useState<string>(
    'HikariPool-1 connection timeout after 30000ms on payment-service prod-db-01, client requests failing with 504!'
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<TicketExtraction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    if (!inputText.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await extractTicket(inputText.trim());
      setResult(data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail || e.message || 'Failed to extract structured data.');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryConfig = (category: string) => {
    switch (category) {
      case 'outage':
        return { color: 'error', icon: <ReportProblemIcon fontSize="small" />, label: 'Outage / Incident' };
      case 'bug':
        return { color: 'warning', icon: <BugReportIcon fontSize="small" />, label: 'Software Bug' };
      case 'billing':
        return { color: 'info', icon: <PaymentIcon fontSize="small" />, label: 'Billing Issue' };
      case 'feature_request':
        return { color: 'secondary', icon: <LightbulbIcon fontSize="small" />, label: 'Feature Request' };
      default:
        return { color: 'default', icon: <DataObjectIcon fontSize="small" />, label: category };
    }
  };

  const getUrgencyColor = (urgency: number) => {
    if (urgency >= 4) return 'error';
    if (urgency === 3) return 'warning';
    return 'success';
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: 3 }}>
      {/* Title */}
      <Box sx={{ mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
          <DataObjectIcon color="primary" fontSize="large" />
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Structured Ticket & Alert Extraction
          </Typography>
        </Box>
        <Typography variant="body2" color="text.secondary">
          Converts unstructured customer complaints or production alerts into guaranteed JSON Schema
          attributes with deterministic temperature 0.0.
        </Typography>
      </Box>

      {/* Preset Chips */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          Click an alert preset:
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
          {PRESET_ALERTS.map((preset, idx) => (
            <Chip
              key={idx}
              label={preset.label}
              size="small"
              icon={<AutoFixHighIcon fontSize="small" />}
              onClick={() => setInputText(preset.text)}
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
          rows={3}
          label="Unstructured Alert / Incident Text"
          placeholder="Paste raw log alert, error message, or customer email..."
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={loading}
          sx={{ mb: 2 }}
        />

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary">
            Endpoint: <code style={{ color: '#0284c7' }}>POST /api/v1/ai/extract</code>
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <DataObjectIcon />}
            onClick={handleExtract}
            disabled={loading || !inputText.trim()}
          >
            {loading ? 'Extracting Schema...' : 'Extract JSON Schema'}
          </Button>
        </Box>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Structured Result Display */}
      {result && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Card
            variant="outlined"
            sx={{
              borderColor: 'primary.main',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'rgba(56, 189, 248, 0.04)' : 'rgba(2, 132, 199, 0.03)',
            }}
          >
            <CardContent>
              <Typography variant="h6" sx={{ fontWeight: 700, mb: 2 }}>
                Parsed Metadata Schema
              </Typography>

              <Grid container spacing={3} sx={{ mb: 2 }}>
                {/* Category */}
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    CATEGORY
                  </Typography>
                  {(() => {
                    const cfg = getCategoryConfig(result.category);
                    return (
                      <Chip
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        color={cfg.color as any}
                        icon={cfg.icon}
                        label={cfg.label}
                        sx={{ fontWeight: 600 }}
                      />
                    );
                  })()}
                </Grid>

                {/* Urgency */}
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    URGENCY LEVEL ({result.urgency}/5)
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <LinearProgress
                      variant="determinate"
                      value={(result.urgency / 5) * 100}
                      color={getUrgencyColor(result.urgency)}
                      sx={{ flexGrow: 1, height: 8, borderRadius: 4 }}
                    />
                    <Chip
                      label={`Level ${result.urgency}`}
                      size="small"
                      color={getUrgencyColor(result.urgency)}
                      variant="outlined"
                    />
                  </Box>
                </Grid>

                {/* Requires Human */}
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                    HUMAN REVIEW NEEDED
                  </Typography>
                  {result.requires_human ? (
                    <Chip
                      icon={<PersonPinIcon fontSize="small" />}
                      label="Requires Human Escalation"
                      color="warning"
                    />
                  ) : (
                    <Chip
                      icon={<CheckCircleIcon fontSize="small" />}
                      label="Auto-Resolvable"
                      color="success"
                      variant="outlined"
                    />
                  )}
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />

              {/* Summary */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                  CANONICAL SUMMARY
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 500 }}>
                  {result.summary}
                </Typography>
              </Box>

              <Divider sx={{ my: 2 }} />

              {/* Raw JSON */}
              <Box>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                  RAW JSON PAYLOAD
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    p: 1.5,
                    borderRadius: 1,
                    bgcolor: 'background.default',
                    fontSize: '0.85rem',
                    overflowX: 'auto',
                    m: 0,
                  }}
                >
                  {JSON.stringify(result, null, 2)}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}
    </Box>
  );
};
