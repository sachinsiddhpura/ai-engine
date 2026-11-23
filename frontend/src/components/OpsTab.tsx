import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  LinearProgress,
  Grid,
} from '@mui/material';
import DnsIcon from '@mui/icons-material/Dns';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import NotificationImportantIcon from '@mui/icons-material/NotificationImportant';
import {
  getOpsServices,
  getOpsIncidents,
  type ServiceItem,
  type IncidentItem,
} from '../api/client';

export const OpsTab: React.FC = () => {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [incidents, setIncidents] = useState<IncidentItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [svcData, incData] = await Promise.all([getOpsServices(), getOpsIncidents()]);
      setServices(svcData);
      setIncidents(incData);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail || e.message || 'Failed to fetch operations database.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const getStatusChip = (status: string) => {
    switch (status.toLowerCase()) {
      case 'healthy':
        return (
          <Chip
            size="small"
            color="success"
            icon={<CheckCircleIcon fontSize="small" />}
            label="Healthy"
          />
        );
      case 'degraded':
        return (
          <Chip
            size="small"
            color="warning"
            icon={<WarningAmberIcon fontSize="small" />}
            label="Degraded"
          />
        );
      case 'down':
        return (
          <Chip
            size="small"
            color="error"
            icon={<ErrorIcon fontSize="small" />}
            label="Down"
          />
        );
      default:
        return <Chip size="small" label={status} />;
    }
  };

  const getSeverityChip = (severity: string) => {
    const s = severity.toUpperCase();
    if (s.includes('P1') || s.includes('CRITICAL')) {
      return <Chip size="small" color="error" label={s} sx={{ fontWeight: 700 }} />;
    }
    if (s.includes('P2') || s.includes('HIGH')) {
      return <Chip size="small" color="warning" label={s} sx={{ fontWeight: 600 }} />;
    }
    return <Chip size="small" color="info" label={s} />;
  };

  const degradedCount = services.filter((s) => s.status.toLowerCase() !== 'healthy').length;

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', p: 3 }}>
      {/* Title */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <DnsIcon color="primary" fontSize="large" />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Live Ops Database & Incidents
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Underlying SQLite operational state (<code>ops_data.db</code>) queried and mutated in real time by the MCP tools.
          </Typography>
        </Box>

        <Button
          variant="outlined"
          startIcon={loading ? <CircularProgress size={16} /> : <RefreshIcon />}
          onClick={fetchData}
          disabled={loading}
        >
          Refresh Data
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Summary KPI Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <Card variant="outlined">
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                MONITORED MICROSERVICES
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, mt: 0.5 }}>
                {services.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Card
            variant="outlined"
            sx={{
              borderColor: degradedCount > 0 ? 'warning.main' : 'divider',
            }}
          >
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                DEGRADED / HIGH LOAD
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  mt: 0.5,
                  color: degradedCount > 0 ? 'warning.main' : 'success.main',
                }}
              >
                {degradedCount}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, sm: 4 }}>
          <Card
            variant="outlined"
            sx={{
              borderColor: incidents.length > 0 ? 'error.main' : 'divider',
            }}
          >
            <CardContent sx={{ pb: '16px !important' }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                INCIDENTS LOGGED
              </Typography>
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 700,
                  mt: 0.5,
                  color: incidents.length > 0 ? 'error.main' : 'text.primary',
                }}
              >
                {incidents.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Services Table */}
      <Paper sx={{ mb: 4, overflow: 'hidden' }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Microservices Registry (<code>services</code> table)
          </Typography>
          <Chip label={`${services.length} Active Services`} size="small" />
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'background.default' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Service Name</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Owner Team</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>CPU Usage</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Version</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {services.map((svc) => (
                <TableRow key={svc.name} hover>
                  <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>{svc.name}</TableCell>
                  <TableCell>{svc.owner_team}</TableCell>
                  <TableCell>{getStatusChip(svc.status)}</TableCell>
                  <TableCell sx={{ minWidth: 160 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={Math.min(svc.cpu_usage, 100)}
                        color={svc.cpu_usage > 85 ? 'error' : svc.cpu_usage > 60 ? 'warning' : 'success'}
                        sx={{ flexGrow: 1, height: 6, borderRadius: 3 }}
                      />
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        {svc.cpu_usage}%
                      </Typography>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                    {svc.version}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Incidents Table */}
      <Paper sx={{ overflow: 'hidden' }}>
        <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
          <NotificationImportantIcon color="error" />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            Incident History Log (<code>incidents</code> table)
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'background.default' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 700 }}>Ticket ID</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Service</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                <TableCell sx={{ fontWeight: 700 }}>Timestamp (UTC)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {incidents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 3, color: 'text.secondary' }}>
                    No incident tickets created yet. Run the ReAct agent to file tickets automatically!
                  </TableCell>
                </TableRow>
              ) : (
                incidents.map((inc) => (
                  <TableRow key={inc.id} hover>
                    <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace', color: 'primary.main' }}>
                      INC-{inc.id}
                    </TableCell>
                    <TableCell sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                      {inc.service_name}
                    </TableCell>
                    <TableCell>{getSeverityChip(inc.severity)}</TableCell>
                    <TableCell>{inc.description}</TableCell>
                    <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {inc.created_at}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
