// ---------------------------------------------------------
// Mode registry — one entry per backend feature group
// ---------------------------------------------------------
const MODES = {
  chat: {
    label: "💬 Chat",
    title: "Multi-Turn Chat",
    desc: "Conversational memory with a sliding context window.",
    kind: "chat",
  },
  extract: {
    label: "🎫 Ticket Extractor",
    title: "Structured Ticket Extraction",
    desc: "Paste raw text, get back structured JSON (category, urgency, summary).",
    kind: "extract",
  },
  toolchat: {
    label: "🛠️ Tool-Calling Chat",
    title: "DevOps Tool-Calling Chat",
    desc: "The model can call check_service_health() live while answering.",
    kind: "toolchat",
  },
  rag: {
    label: "📄 RAG (PDF Q&A)",
    title: "Document RAG",
    desc: "Upload a PDF, then ask grounded questions with citations.",
    kind: "rag",
  },
  agent: {
    label: "🤖 MCP Agent",
    title: "Autonomous SRE Agent",
    desc: "ReAct agent with live MCP tools — give it a goal, watch its trace.",
    kind: "agent",
  },
  ops: {
    label: "📊 Ops Dashboard",
    title: "Services & Incidents",
    desc: "Live service health and incident feed from ops_data.db.",
    kind: "ops",
  },
  multilingual: {
    label: "🗣️ Gujarati Voice RAG",
    title: "Gujarati Voice & Text RAG",
    desc: "Ask in Gujarati text or voice, get a grounded Gujarati answer + audio.",
    kind: "voice",
    api: "multilingual",
  },
  universal: {
    label: "🌐 Universal Voice RAG",
    title: "Any-Language Voice & Text RAG",
    desc: "Auto-detects language, translates, runs RAG, replies in the same language + voice.",
    kind: "voice",
    api: "universal",
  },
};

const MODE_ORDER = ["chat", "extract", "toolchat", "rag", "agent", "ops", "multilingual", "universal"];

// ---------------------------------------------------------
// State
// ---------------------------------------------------------
const STORAGE_KEY = "aiEngineConsoleState";

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {};
}

function saveState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        conversations: state.conversations,
        chatSessionId: state.chatSessionId,
        chatSettings: state.chatSettings,
        currentMode: state.currentMode,
      })
    );
  } catch (_) {}
}

const saved = loadState();
const state = {
  currentMode: saved.currentMode || "chat",
  conversations: saved.conversations || {},
  chatSessionId: saved.chatSessionId || crypto.randomUUID(),
  chatSettings: saved.chatSettings || {
    systemPrompt: "You are a helpful senior AI engineer.",
    temperature: 0.7,
  },
  ragReady: false,
  mediaRecorder: null,
  recordedChunks: [],
  isRecording: false,
};

for (const key of MODE_ORDER) {
  if (!state.conversations[key]) state.conversations[key] = [];
}

// ---------------------------------------------------------
// DOM refs
// ---------------------------------------------------------
const modeListEl = document.getElementById("modeList");
const messagesEl = document.getElementById("messages");
const composerEl = document.getElementById("composer");
const modeTitleEl = document.getElementById("modeTitle");
const modeDescEl = document.getElementById("modeDesc");
const healthDotEl = document.getElementById("healthDot");
const healthTextEl = document.getElementById("healthText");
const newChatBtn = document.getElementById("newChatBtn");

// ---------------------------------------------------------
// API helpers
// ---------------------------------------------------------
async function postJSON(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

async function postForm(url, formData) {
  const res = await fetch(url, { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || res.statusText);
  return data;
}

async function getJSON(url) {
  const res = await fetch(url);
  const data = await res.json().catch(() => []);
  if (!res.ok) throw new Error((data && data.detail) || res.statusText);
  return data;
}

const api = {
  chat: (payload) => postJSON("/api/v1/ai/chat", payload),
  extract: (text) => postJSON("/api/v1/ai/extract", { text }),
  toolChat: (prompt) => postJSON("/api/v1/ai/agent-chat", { prompt }),
  ragIngest: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return postForm("/api/v1/rag/ingest", fd);
  },
  ragQuery: (question) => postJSON("/api/v1/rag/query", { question }),
  agentRun: (goal) => postJSON("/api/v1/agent/run", { goal }),
  opsServices: () => getJSON("/api/v1/ops/services"),
  opsIncidents: () => getJSON("/api/v1/ops/incidents"),
  multilingualText: (gujarati_question, include_audio) =>
    postJSON("/api/v1/multilingual/ask-gujarati-text", { gujarati_question, include_audio }),
  multilingualVoice: (blob, include_audio) => {
    const fd = new FormData();
    fd.append("audio_file", blob, "recording.webm");
    return postForm(`/api/v1/multilingual/ask-gujarati-voice?include_audio=${include_audio}`, fd);
  },
  universalText: (query, include_audio) =>
    postJSON("/api/v1/universal-rag/ask-text", { query, include_audio }),
  universalVoice: (blob, include_audio) => {
    const fd = new FormData();
    fd.append("audio_file", blob, "recording.webm");
    return postForm(`/api/v1/universal-rag/ask-voice?include_audio=${include_audio}`, fd);
  },
};

function audioUrl(apiName, path) {
  if (!path) return null;
  const filename = path.split(/[\\/]/).pop();
  return apiName === "multilingual"
    ? `/api/v1/multilingual/audio/${filename}`
    : `/api/v1/universal-rag/audio/${filename}`;
}

// ---------------------------------------------------------
// Sidebar
// ---------------------------------------------------------
function renderSidebar() {
  modeListEl.innerHTML = "";
  for (const key of MODE_ORDER) {
    const m = MODES[key];
    const item = document.createElement("div");
    item.className = "mode-item" + (key === state.currentMode ? " active" : "");
    item.textContent = m.label;
    item.addEventListener("click", () => switchMode(key));
    modeListEl.appendChild(item);
  }
}

function switchMode(key) {
  state.currentMode = key;
  saveState();
  renderSidebar();
  renderHeader();
  renderComposer();
  renderMessages();
  if (key === "ops") loadOpsData();
}

function renderHeader() {
  const m = MODES[state.currentMode];
  modeTitleEl.textContent = m.title;
  modeDescEl.textContent = m.desc;
}

newChatBtn.addEventListener("click", () => {
  const mode = state.currentMode;
  state.conversations[mode] = [];
  if (mode === "chat") state.chatSessionId = crypto.randomUUID();
  if (mode === "rag") state.ragReady = false;
  saveState();
  renderMessages();
  if (mode === "ops") loadOpsData();
});

// ---------------------------------------------------------
// Messages rendering
// ---------------------------------------------------------
function pushMessage(mode, msg) {
  state.conversations[mode].push(msg);
  saveState();
  renderMessages();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMessages() {
  const mode = state.currentMode;
  messagesEl.innerHTML = "";

  if (mode === "ops") {
    renderOpsView();
    return;
  }

  const msgs = state.conversations[mode];
  if (!msgs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const m = MODES[mode];
    empty.innerHTML = `<h2>${m.title}</h2><p>${m.desc}</p>`;
    messagesEl.appendChild(empty);
    return;
  }

  for (const msg of msgs) {
    messagesEl.appendChild(renderMessageNode(msg));
  }
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function renderMessageNode(msg) {
  const wrap = document.createElement("div");
  wrap.className = `msg ${msg.role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent =
    msg.role === "user" ? "🧑" : msg.role === "error" ? "⚠️" : msg.role === "system" ? "ℹ️" : "🤖";
  wrap.appendChild(avatar);

  const body = document.createElement("div");
  body.style.flex = "1";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = msg.pending ? "" : msg.text || "";
  if (msg.pending) {
    const dots = document.createElement("span");
    dots.className = "dots";
    dots.textContent = "Thinking";
    bubble.appendChild(dots);
  }
  body.appendChild(bubble);

  if (msg.chips && msg.chips.length) {
    const chips = document.createElement("div");
    chips.className = "chips";
    for (const c of msg.chips) {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = c;
      chips.appendChild(chip);
    }
    body.appendChild(chips);
  }

  if (msg.trace && msg.trace.length) {
    const details = document.createElement("details");
    details.className = "trace";
    const summary = document.createElement("summary");
    summary.textContent = `🔧 Trace (${msg.trace.length} step${msg.trace.length > 1 ? "s" : ""})`;
    details.appendChild(summary);
    for (const step of msg.trace) {
      const div = document.createElement("div");
      div.className = "step";
      div.innerHTML = `<code>${escapeHtml(step.tool_name)}(${escapeHtml(
        JSON.stringify(step.arguments)
      )})</code><div style="margin-top:4px;color:var(--text-dim)">${escapeHtml(step.output)}</div>`;
      details.appendChild(div);
    }
    body.appendChild(details);
  }

  if (msg.sources && msg.sources.length) {
    const details = document.createElement("details");
    details.className = "trace";
    const summary = document.createElement("summary");
    summary.textContent = `📚 Sources (${msg.sources.length})`;
    details.appendChild(summary);
    for (const s of msg.sources) {
      const div = document.createElement("div");
      div.className = "step";
      div.innerHTML = `<code>${escapeHtml(s.source)} · p.${s.page} · score ${s.rerank_score.toFixed(
        3
      )}</code><div style="margin-top:4px;color:var(--text-dim)">${escapeHtml(s.text_preview)}</div>`;
      details.appendChild(div);
    }
    body.appendChild(details);
  }

  if (msg.audioSrc) {
    const audio = document.createElement("audio");
    audio.controls = true;
    audio.src = msg.audioSrc;
    body.appendChild(audio);
  }

  if (msg.meta) {
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = msg.meta;
    body.appendChild(meta);
  }

  wrap.appendChild(body);
  return wrap;
}

function updateMessage(mode, pendingMsg, patch) {
  Object.assign(pendingMsg, patch, { pending: false });
  saveState();
  renderMessages();
}

// ---------------------------------------------------------
// Composer rendering (mode-specific)
// ---------------------------------------------------------
function renderComposer() {
  const mode = state.currentMode;
  const kind = MODES[mode].kind;
  composerEl.innerHTML = "";

  if (kind === "ops") {
    const inner = document.createElement("div");
    inner.className = "composer-inner hint";
    inner.textContent = "Read-only dashboard — use the refresh button above the tables.";
    composerEl.appendChild(inner);
    return;
  }

  const inner = document.createElement("div");
  inner.className = "composer-inner";

  if (kind === "chat") {
    inner.appendChild(buildOptionsRow([
      { type: "text", label: "System prompt", value: state.chatSettings.systemPrompt,
        onChange: (v) => (state.chatSettings.systemPrompt = v) },
      { type: "number", label: "Temp", value: state.chatSettings.temperature, step: 0.1, min: 0, max: 2,
        onChange: (v) => (state.chatSettings.temperature = parseFloat(v) || 0.7) },
    ]));
  }

  let includeAudioCheckbox = null;
  if (kind === "voice") {
    const row = document.createElement("div");
    row.className = "options-row";
    const label = document.createElement("label");
    includeAudioCheckbox = document.createElement("input");
    includeAudioCheckbox.type = "checkbox";
    includeAudioCheckbox.checked = true;
    label.appendChild(includeAudioCheckbox);
    label.appendChild(document.createTextNode(" Synthesize spoken reply"));
    row.appendChild(label);
    inner.appendChild(row);
  }

  if (kind === "rag") {
    const row = document.createElement("div");
    row.className = "options-row";
    row.textContent = state.ragReady
      ? "A document is indexed for this session — ask away."
      : "No document ingested yet in this session — upload a PDF to begin.";
    inner.appendChild(row);
  }

  const row = document.createElement("div");
  row.className = "composer-row";

  if (kind === "rag") {
    row.appendChild(
      buildIconButton("📎", "Upload PDF", () => pdfInput.click())
    );
    const pdfInput = document.createElement("input");
    pdfInput.type = "file";
    pdfInput.accept = ".pdf";
    pdfInput.style.display = "none";
    pdfInput.addEventListener("change", () => {
      if (pdfInput.files[0]) handleRagIngest(pdfInput.files[0]);
      pdfInput.value = "";
    });
    row.appendChild(pdfInput);
  }

  if (kind === "voice") {
    row.appendChild(buildIconButton("📁", "Upload audio", () => audioInput.click()));
    const audioInput = document.createElement("input");
    audioInput.type = "file";
    audioInput.accept = "audio/*";
    audioInput.style.display = "none";
    audioInput.addEventListener("change", () => {
      if (audioInput.files[0]) handleVoiceSubmit(mode, audioInput.files[0], includeAudioCheckbox.checked);
      audioInput.value = "";
    });
    row.appendChild(audioInput);

    const micBtn = buildIconButton("🎤", "Record", () => toggleRecording(mode, micBtn, includeAudioCheckbox));
    micBtn.id = "micBtn";
    row.appendChild(micBtn);
  }

  const textarea = document.createElement("textarea");
  textarea.className = "composer-text";
  textarea.rows = 1;
  textarea.placeholder = placeholderFor(mode);
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitText();
    }
  });
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + "px";
  });
  row.appendChild(textarea);

  const sendBtn = document.createElement("button");
  sendBtn.className = "send-btn";
  sendBtn.textContent = "➤";
  sendBtn.addEventListener("click", submitText);
  row.appendChild(sendBtn);

  function submitText() {
    const value = textarea.value.trim();
    if (!value) return;
    textarea.value = "";
    textarea.style.height = "auto";
    if (kind === "voice") {
      handleVoiceSubmit(mode, value, includeAudioCheckbox.checked);
    } else {
      handleTextSubmit(mode, value);
    }
  }

  inner.appendChild(row);
  composerEl.appendChild(inner);
}

function buildOptionsRow(fields) {
  const row = document.createElement("div");
  row.className = "options-row";
  for (const f of fields) {
    const label = document.createElement("label");
    label.appendChild(document.createTextNode(f.label));
    const input = document.createElement("input");
    input.type = f.type;
    input.value = f.value;
    if (f.step) input.step = f.step;
    if (f.min !== undefined) input.min = f.min;
    if (f.max !== undefined) input.max = f.max;
    input.addEventListener("change", () => f.onChange(input.value));
    label.appendChild(input);
    row.appendChild(label);
  }
  return row;
}

function buildIconButton(icon, title, onClick) {
  const btn = document.createElement("button");
  btn.className = "icon-btn";
  btn.title = title;
  btn.textContent = icon;
  btn.addEventListener("click", onClick);
  return btn;
}

function placeholderFor(mode) {
  switch (mode) {
    case "chat": return "Message the assistant…";
    case "extract": return "Paste raw support text to extract ticket fields…";
    case "toolchat": return "Ask about a service's health…";
    case "rag": return "Ask a question about the uploaded PDF…";
    case "agent": return "Describe a multi-step goal for the agent…";
    case "multilingual": return "Gujarati પ્રશ્ન ટાઈપ કરો…";
    case "universal": return "Ask in any language…";
    default: return "Type a message…";
  }
}

// ---------------------------------------------------------
// Submit handlers per mode
// ---------------------------------------------------------
async function handleTextSubmit(mode, text) {
  pushMessage(mode, { role: "user", text });
  const pending = { role: "assistant", text: "", pending: true };
  pushMessage(mode, pending);

  try {
    if (mode === "chat") {
      const res = await api.chat({
        session_id: state.chatSessionId,
        message: text,
        system_prompt: state.chatSettings.systemPrompt,
        temperature: state.chatSettings.temperature,
      });
      updateMessage(mode, pending, {
        text: res.reply,
        meta: `history: ${res.history_length} msgs · tokens: ${res.usage.total_tokens}`,
      });
    } else if (mode === "extract") {
      const res = await api.extract(text);
      updateMessage(mode, pending, {
        text:
          `Category: ${res.category}\n` +
          `Urgency: ${res.urgency}/5\n` +
          `Requires human: ${res.requires_human ? "Yes" : "No"}\n\n` +
          `Summary: ${res.summary}`,
      });
    } else if (mode === "toolchat") {
      const res = await api.toolChat(text);
      updateMessage(mode, pending, {
        text: res.reply,
        chips: res.tools_executed,
        meta: `tokens: ${res.usage.total_tokens}`,
      });
    } else if (mode === "rag") {
      const res = await api.ragQuery(text);
      updateMessage(mode, pending, {
        text: res.answer,
        sources: res.sources,
      });
    } else if (mode === "agent") {
      const res = await api.agentRun(text);
      updateMessage(mode, pending, {
        text: res.final_answer,
        trace: res.steps_taken,
      });
    }
  } catch (err) {
    pending.role = "error";
    updateMessage(mode, pending, { text: err.message || String(err) });
  }
}

async function handleRagIngest(file) {
  const mode = "rag";
  pushMessage(mode, { role: "user", text: `📎 Uploaded: ${file.name}` });
  const pending = { role: "system", text: "", pending: true };
  pushMessage(mode, pending);
  try {
    const res = await api.ragIngest(file);
    state.ragReady = true;
    updateMessage(mode, pending, {
      text: `✅ Ingested "${res.filename}" — ${res.pages_processed} pages, ${res.chunks_indexed} chunks indexed into "${res.collection}". You can ask questions now.`,
    });
    renderComposer();
  } catch (err) {
    pending.role = "error";
    updateMessage(mode, pending, { text: err.message || String(err) });
  }
}

async function handleVoiceSubmit(mode, textOrFile, includeAudio) {
  const api_name = MODES[mode].api;
  const isFile = textOrFile instanceof File || textOrFile instanceof Blob;
  pushMessage(mode, { role: "user", text: isFile ? `🎤 ${textOrFile.name || "voice message"}` : textOrFile });
  const pending = { role: "assistant", text: "", pending: true };
  pushMessage(mode, pending);

  try {
    let res;
    if (api_name === "multilingual") {
      res = isFile
        ? await api.multilingualVoice(textOrFile, includeAudio)
        : await api.multilingualText(textOrFile, includeAudio);
      updateMessage(mode, pending, {
        text: res.gujarati_final_answer,
        chips: res.citations,
        audioSrc: audioUrl("multilingual", res.audio_output_path),
        meta: `English query: ${res.translated_english_query}`,
      });
    } else {
      res = isFile
        ? await api.universalVoice(textOrFile, includeAudio)
        : await api.universalText(textOrFile, includeAudio);
      updateMessage(mode, pending, {
        text: res.localized_answer,
        chips: res.citations,
        audioSrc: audioUrl("universal", res.audio_output_path),
        meta: `Detected language: ${res.detected_language} · English query: ${res.english_query}`,
      });
    }
  } catch (err) {
    pending.role = "error";
    updateMessage(mode, pending, { text: err.message || String(err) });
  }
}

// ---------------------------------------------------------
// Voice recording (MediaRecorder)
// ---------------------------------------------------------
async function toggleRecording(mode, btn, includeAudioCheckbox) {
  if (state.isRecording) {
    state.mediaRecorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    state.recordedChunks = [];
    recorder.ondataavailable = (e) => state.recordedChunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      state.isRecording = false;
      btn.classList.remove("recording");
      const blob = new Blob(state.recordedChunks, { type: "audio/webm" });
      handleVoiceSubmit(mode, blob, includeAudioCheckbox.checked);
    };
    recorder.start();
    state.mediaRecorder = recorder;
    state.isRecording = true;
    btn.classList.add("recording");
  } catch (err) {
    alert("Microphone access failed: " + (err.message || err));
  }
}

// ---------------------------------------------------------
// Ops dashboard
// ---------------------------------------------------------
async function loadOpsData() {
  if (state.currentMode !== "ops") return;
  messagesEl.innerHTML = "";

  const toolbar = document.createElement("div");
  toolbar.className = "ops-toolbar";
  const refreshBtn = document.createElement("button");
  refreshBtn.className = "ops-refresh";
  refreshBtn.textContent = "🔄 Refresh";
  refreshBtn.addEventListener("click", loadOpsData);
  toolbar.appendChild(refreshBtn);
  messagesEl.appendChild(toolbar);

  const status = document.createElement("div");
  status.className = "empty-state";
  status.textContent = "Loading…";
  messagesEl.appendChild(status);

  try {
    const [services, incidents] = await Promise.all([api.opsServices(), api.opsIncidents()]);
    status.remove();

    const svcTable = buildTable(
      ["Service", "Owner", "Status", "CPU %", "Version"],
      services.map((s) => [
        s.name,
        s.owner_team,
        badge(s.status),
        s.cpu_usage.toFixed(1),
        s.version,
      ])
    );
    messagesEl.appendChild(sectionLabel("Services"));
    messagesEl.appendChild(svcTable);

    const incTable = buildTable(
      ["#", "Service", "Severity", "Description", "Created"],
      incidents.map((i) => [i.id, i.service_name, badge(i.severity), i.description, i.created_at])
    );
    messagesEl.appendChild(sectionLabel("Incidents"));
    messagesEl.appendChild(incTable);
  } catch (err) {
    status.textContent = "Failed to load: " + (err.message || err);
  }
}

function sectionLabel(text) {
  const el = document.createElement("div");
  el.className = "options-row";
  el.style.maxWidth = "760px";
  el.style.margin = "0 auto";
  el.style.fontWeight = "600";
  el.style.color = "var(--text)";
  el.textContent = text;
  return el;
}

function badge(value) {
  return `<span class="badge ${String(value).toLowerCase()}">${value}</span>`;
}

function buildTable(headers, rows) {
  const table = document.createElement("table");
  table.className = "ops-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  tbody.innerHTML = rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`)
    .join("");
  table.appendChild(tbody);
  return table;
}

function renderOpsView() {
  loadOpsData();
}

// ---------------------------------------------------------
// Health check
// ---------------------------------------------------------
async function checkHealth() {
  try {
    const res = await getJSON("/health");
    healthDotEl.className = "health-dot ok";
    healthTextEl.textContent = `${res.model}`;
  } catch (err) {
    healthDotEl.className = "health-dot bad";
    healthTextEl.textContent = "backend unreachable";
  }
}

// ---------------------------------------------------------
// Init
// ---------------------------------------------------------
renderSidebar();
renderHeader();
renderComposer();
renderMessages();
checkHealth();
