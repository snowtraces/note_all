export const getTrash = async () => {
  const res = await fetch('/api/trash');
  const data = await res.json();
  return data.data || [];
};

export const searchNotes = async (query) => {
  const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  return data.data || [];
};

export const deleteNote = async (id, hard = false) => {
  const res = await fetch(`/api/note/${id}${hard ? '/hard' : ''}`, { method: 'DELETE' });
  if (!res.ok) throw new Error("Delete failed");
};

export const restoreNote = async (id) => {
  const res = await fetch(`/api/note/${id}/restore`, { method: 'POST' });
  if (!res.ok) throw new Error("Restore failed");
};

export const updateNoteText = async (id, text) => {
  const res = await fetch(`/api/note/${id}/text`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  if (!res.ok) throw new Error("Update text failed");
};

export const uploadNote = async (formData) => {
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Upload failed");
};

export const createTextNote = async (text) => {
  const res = await fetch("/api/note/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Text note creation failed");
};

export const getTags = async () => {
  const res = await fetch('/api/tags');
  const data = await res.json();
  return data.data || [];
};


export const askAI = async (messages, sessionId = 0) => {
  // 过滤掉多余字段，只保留后端需要的 role 和 content，防止 JSON 校验失败
  const cleanMessages = messages.map(m => ({ role: m.role, content: m.content }));
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: cleanMessages, session_id: sessionId }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(()=>({}));
    throw new Error(errData.error || "Ask AI failed");
  }
  const data = await res.json();
  return { 
    answer: data.data || "", 
    session_id: data.session_id,
    references: data.references || []
  };
};

export const getChatSessions = async () => {
  const res = await fetch('/api/chat/sessions');
  const data = await res.json();
  return data.data || [];
};

export const getChatMessages = async (id) => {
  const res = await fetch(`/api/chat/session/${id}`);
  const data = await res.json();
  return data.data || [];
};

export const deleteChatSession = async (id) => {
  const res = await fetch(`/api/chat/session/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error("Delete session failed");
};

export const getSerendipity = async () => {
  const res = await fetch('/api/serendipity');
  if (!res.ok) throw new Error("Get serendipity failed");
  const data = await res.json();
  return { 
    content: data.data || "", 
    references: data.references || []
  };
};

export const reprocessNote = async (id, templateId) => {
    let url = `/api/note/${id}/reprocess`;
    if (templateId) {
        url += `?template_id=${templateId}`;
    }
    const res = await fetch(url, {
        method: 'POST'
    });
    if (!res.ok) throw new Error('Reprocess failed');
    return res.json();
};

export const getRelatedNotes = async (id) => {
  const res = await fetch(`/api/note/${id}/related`);
  if (!res.ok) throw new Error("Get related notes failed");
  const data = await res.json();
  return data.data || [];
};

export const getGraph = async () => {
  const res = await fetch('/api/graph');
  if (!res.ok) throw new Error("Get graph failed");
  const data = await res.json();
  return data.data || { nodes: [], links: [] };
};

export const synthesizeNotes = async (ids, prompt) => {
  const res = await fetch("/api/note/synthesize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, prompt }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Synthesis failed");
  }
  const data = await res.json();
  return data.data;
};

export const batchArchiveNotes = async (ids, archive = true) => {
  const res = await fetch("/api/note/batch/archive", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, archive }),
  });
  if (!res.ok) throw new Error("Batch archive failed");
};

