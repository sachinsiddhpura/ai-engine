import React, { useState, useEffect, useCallback } from 'react';
import {
  ThemeProvider,
  CssBaseline,
  Box,
  Tabs,
  Tab,
  Container,
} from '@mui/material';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import MenuBookIcon from '@mui/icons-material/MenuBook';
import ChatIcon from '@mui/icons-material/Chat';
import DataObjectIcon from '@mui/icons-material/DataObject';
import HandymanIcon from '@mui/icons-material/Handyman';
import DnsIcon from '@mui/icons-material/Dns';

import { getAppTheme } from './theme/theme';
import { Header } from './components/Header';
import { AgentTab } from './components/AgentTab';
import { RagTab } from './components/RagTab';
import { ChatTab } from './components/ChatTab';
import { ExtractTab } from './components/ExtractTab';
import { ToolChatTab } from './components/ToolChatTab';
import { OpsTab } from './components/OpsTab';
import { getHealth, type HealthResponse } from './api/client';

export const App: React.FC = () => {
  const [mode, setMode] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme_mode');
    return saved === 'light' ? 'light' : 'dark';
  });

  const [activeTab, setActiveTab] = useState<number>(0);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState<boolean>(false);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await getHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const toggleTheme = () => {
    const next = mode === 'dark' ? 'light' : 'dark';
    setMode(next);
    localStorage.setItem('theme_mode', next);
  };

  const theme = getAppTheme(mode);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
        {/* Global Navigation Header */}
        <Header
          health={health}
          loading={healthLoading}
          onRefresh={fetchHealth}
          mode={mode}
          onToggleTheme={toggleTheme}
        />

        {/* Feature Navigation Tabs Bar */}
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Container maxWidth="xl">
            <Tabs
              value={activeTab}
              onChange={(_, val) => setActiveTab(val)}
              variant="scrollable"
              scrollButtons="auto"
              sx={{
                '& .MuiTab-root': {
                  minHeight: 56,
                  fontWeight: 600,
                  fontSize: '0.9rem',
                },
              }}
            >
              <Tab icon={<PrecisionManufacturingIcon />} iconPosition="start" label="ReAct MCP Agent" />
              <Tab icon={<MenuBookIcon />} iconPosition="start" label="RAG Pipeline" />
              <Tab icon={<ChatIcon />} iconPosition="start" label="Multi-Turn Chat" />
              <Tab icon={<DataObjectIcon />} iconPosition="start" label="Structured Extraction" />
              <Tab icon={<HandymanIcon />} iconPosition="start" label="Tool Calling" />
              <Tab icon={<DnsIcon />} iconPosition="start" label="Live Ops Database" />
            </Tabs>
          </Container>
        </Box>

        {/* Tab Content Panes */}
        <Box sx={{ flexGrow: 1, py: 3 }}>
          {activeTab === 0 && <AgentTab />}
          {activeTab === 1 && <RagTab />}
          {activeTab === 2 && <ChatTab />}
          {activeTab === 3 && <ExtractTab />}
          {activeTab === 4 && <ToolChatTab />}
          {activeTab === 5 && <OpsTab />}
        </Box>
      </Box>
    </ThemeProvider>
  );
};

export default App;
