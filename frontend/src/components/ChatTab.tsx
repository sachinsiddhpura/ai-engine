import React, { useState, useRef, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  TextField,
  Button,
  Slider,
  Chip,
  IconButton,
  Avatar,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import ChatIcon from '@mui/icons-material/Chat';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import SettingsIcon from '@mui/icons-material/Settings';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import { chatWithMemory, type TokenUsage } from '../api/client';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokens?: TokenUsage;
}

export const ChatTab: React.FC = () => {
  const [sessionId, setSessionId] = useState<string>('session-1');
  const [systemPrompt, setSystemPrompt] = useState<string>(
    'You are a helpful senior AI engineer. Provide clear, accurate, and concise technical advice.'
  );
  const [temperature, setTemperature] = useState<number>(0.7);
  const [inputMessage, setInputMessage] = useState<string>('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [totalTokens, setTotalTokens] = useState<number>(0);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async () => {
    if (!inputMessage.trim() || loading) return;

    const userText = inputMessage.trim();
    const userMsg: ChatMessage = {
      id: Math.random().toString(),
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setLoading(true);
    setError(null);

    try {
      const res = await chatWithMemory({
        session_id: sessionId,
        message: userText,
        system_prompt: systemPrompt,
        temperature,
      });

      const assistantMsg: ChatMessage = {
        id: Math.random().toString(),
        role: 'assistant',
        content: res.reply,
        timestamp: new Date().toLocaleTimeString(),
        tokens: res.usage,
      };

      setMessages((prev) => [...prev, assistantMsg]);
      setTotalTokens((prev) => prev + (res.usage?.total_tokens || 0));
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(e.response?.data?.detail || e.message || 'Failed to send message.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startNewSession = () => {
    const newId = `session-${Date.now().toString().slice(-4)}`;
    setSessionId(newId);
    setMessages([]);
    setTotalTokens(0);
  };

  const clearCurrentChat = () => {
    setMessages([]);
    setTotalTokens(0);
  };

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', p: 3 }}>
      {/* Title */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
            <ChatIcon color="primary" fontSize="large" />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              Multi-Turn Memory Chat
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Continuous conversational state with sliding-window context compression and live token telemetry.
          </Typography>
        </Box>

        {/* Action Controls */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Chip
            label={`Session: ${sessionId}`}
            color="primary"
            variant="outlined"
            size="small"
          />
          <Tooltip title="New Session">
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddCircleIcon />}
              onClick={startNewSession}
            >
              New
            </Button>
          </Tooltip>
          <Tooltip title="Clear Chat Window">
            <IconButton size="small" onClick={clearCurrentChat} color="inherit">
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Toggle Configuration">
            <IconButton
              size="small"
              onClick={() => setShowSettings(!showSettings)}
              color={showSettings ? 'primary' : 'inherit'}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Settings Drawer / Box */}
      {showSettings && (
        <Paper sx={{ p: 2.5, mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
            Engine Hyperparameters & Prompts
          </Typography>
          <TextField
            fullWidth
            label="System Prompt"
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            size="small"
            sx={{ mb: 2 }}
          />
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Typography variant="body2" sx={{ minWidth: 150 }}>
              Temperature: <strong>{temperature}</strong>
            </Typography>
            <Slider
              value={temperature}
              min={0.0}
              max={1.5}
              step={0.1}
              valueLabelDisplay="auto"
              onChange={(_, val) => setTemperature(val as number)}
              sx={{ maxWidth: 300 }}
            />
          </Box>
        </Paper>
      )}

      {/* Metrics Banner */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Chip
          label={`Messages: ${messages.length}`}
          size="small"
          variant="outlined"
        />
        <Chip
          label={`Cumulative Tokens: ${totalTokens}`}
          size="small"
          color="secondary"
          variant="outlined"
        />
        <Chip
          label="Sliding Window: 10 items"
          size="small"
          variant="outlined"
        />
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Chat Messages Container */}
      <Paper
        sx={{
          p: 3,
          minHeight: 380,
          maxHeight: 480,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          mb: 2,
          bgcolor: (theme) =>
            theme.palette.mode === 'dark' ? '#0b1329' : '#f8fafc',
        }}
      >
        {messages.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 300,
              color: 'text.secondary',
            }}
          >
            <SmartToyIcon sx={{ fontSize: 48, mb: 1, opacity: 0.5 }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Start a multi-turn conversation
            </Typography>
            <Typography variant="body2">
              Send a prompt below. Session history is maintained automatically by the backend.
            </Typography>
          </Box>
        ) : (
          messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <Box
                key={msg.id}
                sx={{
                  display: 'flex',
                  justifyContent: isUser ? 'flex-end' : 'flex-start',
                  alignItems: 'flex-start',
                  gap: 1.5,
                }}
              >
                {!isUser && (
                  <Avatar sx={{ bgcolor: 'primary.main', width: 34, height: 34 }}>
                    <SmartToyIcon fontSize="small" />
                  </Avatar>
                )}
                <Box
                  sx={{
                    maxWidth: '75%',
                    p: 2,
                    borderRadius: 2,
                    bgcolor: isUser
                      ? 'primary.main'
                      : (theme) => (theme.palette.mode === 'dark' ? '#1e293b' : '#ffffff'),
                    color: isUser ? '#ffffff' : 'text.primary',
                    border: isUser
                      ? 'none'
                      : (theme) =>
                          `1px solid ${theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  }}
                >
                  <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {msg.content}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      mt: 1,
                      pt: 0.5,
                      borderTop: isUser ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(0,0,0,0.05)',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ opacity: 0.75, fontSize: '0.7rem' }}
                    >
                      {msg.timestamp}
                    </Typography>
                    {msg.tokens && (
                      <Typography
                        variant="caption"
                        sx={{ opacity: 0.75, fontSize: '0.7rem' }}
                      >
                        {msg.tokens.total_tokens} tokens ({msg.tokens.prompt_tokens} in / {msg.tokens.completion_tokens} out)
                      </Typography>
                    )}
                  </Box>
                </Box>
                {isUser && (
                  <Avatar sx={{ bgcolor: 'secondary.main', width: 34, height: 34 }}>
                    <PersonIcon fontSize="small" />
                  </Avatar>
                )}
              </Box>
            );
          })
        )}

        {loading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar sx={{ bgcolor: 'primary.main', width: 34, height: 34 }}>
              <SmartToyIcon fontSize="small" />
            </Avatar>
            <Paper sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Generating response...
              </Typography>
            </Paper>
          </Box>
        )}
        <div ref={messagesEndRef} />
      </Paper>

      {/* Input Field & Send Button */}
      <Paper sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
        <TextField
          fullWidth
          placeholder="Ask a technical question... (Shift+Enter for newline, Enter to send)"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          variant="standard"
          slotProps={{ input: { disableUnderline: true, sx: { px: 1.5 } } }}
        />
        <Button
          variant="contained"
          color="primary"
          onClick={handleSend}
          disabled={loading || !inputMessage.trim()}
          sx={{ minWidth: 44, height: 40, px: 2 }}
        >
          <SendIcon fontSize="small" />
        </Button>
      </Paper>
    </Box>
  );
};
