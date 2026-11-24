import axios from 'axios';

// Connect either through Vite proxy or directly to port 8000
const API_BASE = 'http://127.0.0.1:8000';

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes for LLM/Reranker generations
});

// Types
export interface HealthResponse {
  status: string;
  model: string;
  qdrant_url: string;
  mcp_server_url: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface MultiTurnChatRequest {
  session_id: string;
  message: string;
  system_prompt?: string;
  temperature?: number;
}

export interface MultiTurnChatResponse {
  session_id: string;
  reply: string;
  history_length: number;
  usage: TokenUsage;
}

export interface TicketExtraction {
  category: 'billing' | 'bug' | 'feature_request' | 'outage';
  urgency: number; // 1 to 5
  summary: string;
  requires_human: boolean;
}

export interface ToolChatRequest {
  prompt: string;
}

export interface ToolChatResponse {
  reply: string;
  tools_executed: string[];
  usage: TokenUsage;
}

export interface IngestResponse {
  filename: string;
  pages_processed: number;
  chunks_indexed: number;
  collection: string;
}

export interface RetrievedChunk {
  source: string;
  page: number;
  rerank_score: number;
  text_preview: string;
}

export interface RAGQueryRequest {
  question: string;
  initial_top_k?: number;
  final_top_k?: number;
}

export interface RAGQueryResponse {
  question: string;
  answer: string;
  sources: RetrievedChunk[];
}

export interface ToolStep {
  tool_name: string;
  arguments: Record<string, unknown>;
  output: string;
}

export interface AgentRunResponse {
  goal: string;
  final_answer: string;
  steps_taken: ToolStep[];
}

export interface MultilingualRAGResponse {
  original_gujarati_query: string;
  translated_english_query: string;
  english_rag_answer: string;
  gujarati_final_answer: string;
  citations: string[];
  audio_output_path: string | null;
}

export interface ServiceItem {
  name: string;
  owner_team: string;
  status: string;
  cpu_usage: number;
  version: string;
}

export interface IncidentItem {
  id: number;
  service_name: string;
  severity: string;
  description: string;
  created_at: string;
}

// API Methods
export const getHealth = async (): Promise<HealthResponse> => {
  const res = await api.get<HealthResponse>('/health');
  return res.data;
};

export const chatWithMemory = async (data: MultiTurnChatRequest): Promise<MultiTurnChatResponse> => {
  const res = await api.post<MultiTurnChatResponse>('/api/v1/ai/chat', data);
  return res.data;
};

export const extractTicket = async (text: string): Promise<TicketExtraction> => {
  const res = await api.post<TicketExtraction>('/api/v1/ai/extract', { text });
  return res.data;
};

export const chatWithTools = async (prompt: string): Promise<ToolChatResponse> => {
  const res = await api.post<ToolChatResponse>('/api/v1/ai/agent-chat', { prompt });
  return res.data;
};

export const ingestPdf = async (file: File): Promise<IngestResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post<IngestResponse>('/api/v1/rag/ingest', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const queryRAG = async (data: RAGQueryRequest): Promise<RAGQueryResponse> => {
  const res = await api.post<RAGQueryResponse>('/api/v1/rag/query', data);
  return res.data;
};

export const runAgent = async (goal: string): Promise<AgentRunResponse> => {
  const res = await api.post<AgentRunResponse>('/api/v1/agent/run', { goal });
  return res.data;
};

export const askGujaratiText = async (
  gujaratiQuestion: string,
  includeAudio: boolean,
): Promise<MultilingualRAGResponse> => {
  const res = await api.post<MultilingualRAGResponse>('/api/v1/multilingual/ask-gujarati-text', {
    gujarati_question: gujaratiQuestion,
    include_audio: includeAudio,
  });
  return res.data;
};

export const askGujaratiVoice = async (
  audioFile: File,
  includeAudio: boolean,
): Promise<MultilingualRAGResponse> => {
  const formData = new FormData();
  formData.append('audio_file', audioFile);
  formData.append('include_audio', String(includeAudio));
  const res = await api.post<MultilingualRAGResponse>('/api/v1/multilingual/ask-gujarati-voice', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const getGeneratedAudioUrl = (audioOutputPath: string): string => {
  const filename = audioOutputPath.split(/[\\/]/).pop();
  return `${API_BASE}/api/v1/multilingual/audio/${encodeURIComponent(filename || '')}`;
};

export const getOpsServices = async (): Promise<ServiceItem[]> => {
  const res = await api.get<ServiceItem[]>('/api/v1/ops/services');
  return res.data;
};

export const getOpsIncidents = async (): Promise<IncidentItem[]> => {
  const res = await api.get<IncidentItem[]>('/api/v1/ops/incidents');
  return res.data;
};
