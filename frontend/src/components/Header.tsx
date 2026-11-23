import React from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import RefreshIcon from '@mui/icons-material/Refresh';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import StorageIcon from '@mui/icons-material/Storage';
import HubIcon from '@mui/icons-material/Hub';
import type { HealthResponse } from '../api/client';

interface HeaderProps {
  health: HealthResponse | null;
  loading: boolean;
  onRefresh: () => void;
  mode: 'light' | 'dark';
  onToggleTheme: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  loading,
  onRefresh,
  mode,
  onToggleTheme,
}) => {
  const isHealthy = health?.status === 'ok';

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        bgcolor: 'background.paper',
        color: 'text.primary',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, py: 1 }}>
        {/* Brand / Logo */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 40,
              height: 40,
              borderRadius: 2,
              background: 'linear-gradient(135deg, #0284c7 0%, #7c3aed 100%)',
              color: '#ffffff',
            }}
          >
            <SmartToyIcon fontSize="medium" />
          </Box>
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.2, fontWeight: 700 }}>
              Production AI Engine
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Multi-Turn Memory • RAG • MCP Agents • Tool Calling
            </Typography>
          </Box>
        </Box>

        {/* Live Service Status Badges */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          {/* Engine Status */}
          <Chip
            size="small"
            icon={isHealthy ? <CheckCircleIcon /> : <ErrorIcon />}
            label={isHealthy ? `FastAPI: OK (${health?.model})` : 'FastAPI: Offline'}
            color={isHealthy ? 'success' : 'error'}
            variant="outlined"
          />

          {/* Qdrant Status */}
          <Chip
            size="small"
            icon={<StorageIcon />}
            label="Qdrant: Vector Store :6333"
            color="primary"
            variant="outlined"
          />

          {/* MCP Server */}
          <Chip
            size="small"
            icon={<HubIcon />}
            label="MCP SSE Server :8001"
            color="secondary"
            variant="outlined"
          />

          {/* Refresh Health Button */}
          <Tooltip title="Ping FastAPI Health">
            <span>
              <IconButton size="small" onClick={onRefresh} disabled={loading} color="inherit">
                {loading ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>

          {/* Light/Dark Toggle */}
          <Tooltip title={`Switch to ${mode === 'dark' ? 'Light' : 'Dark'} Mode`}>
            <IconButton size="small" onClick={onToggleTheme} color="inherit">
              {mode === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
        </Box>
      </Toolbar>
    </AppBar>
  );
};
