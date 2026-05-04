import { request } from './client';

export const getTrash = async () => {
  const res = await request('/api/trash');
  const data = await res.json();
  return data.data || [];
};

export const searchNotes = async (query) => {
  const res = await request(`/api/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  return data.data || [];
};

export const getNote = async (id) => {
  const res = await request(`/api/note/${id}`);
  if (!res.ok) throw new Error("Get note failed");
  const data = await res.json();
  return data.data;
};

export const deleteNote = async (id, hard = false) => {
  const res = await request(`/api/note/${id}${hard ? '/hard' : ''}`, { method: 'DELETE' });
  if (!res.ok) throw new Error("Delete failed");
};

export const restoreNote = async (id) => {
  const res = await request(`/api/note/${id}/restore`, { method: 'POST' });
  if (!res.ok) throw new Error("Restore failed");
};

export const updateNoteText = async (id, text, reanalyze = false) => {
  const res = await request(`/api/note/${id}/text`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, reanalyze })
  });
  if (!res.ok) throw new Error("Update text failed");
};

export const updateNoteStatus = async (id, status, userComment = "") => {
  const res = await request(`/api/note/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, user_comment: userComment })
  });
  if (!res.ok) throw new Error("Update status failed");
};

export const uploadNote = async (formData) => {
  const res = await request("/api/upload", { method: "POST", body: formData });
  if (!res.ok) throw new Error("Upload failed");
};

export const createTextNote = async (text) => {
  const res = await request("/api/note/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("Text note creation failed");
};

export const getTags = async () => {
  const res = await request('/api/tags');
  const data = await res.json();
  return data.data || [];
};


export const askAI = async (messages, sessionId = 0) => {
  // 过滤掉多余字段，只保留后端需要的 role 和 content，防止 JSON 校验失败
  const cleanMessages = messages.map(m => ({ role: m.role, content: m.content }));
  const res = await request("/api/ask", {
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
  const res = await request('/api/chat/sessions');
  const data = await res.json();
  return data.data || [];
};

export const getChatMessages = async (id) => {
  const res = await request(`/api/chat/session/${id}`);
  const data = await res.json();
  return data.data || [];
};

export const deleteChatSession = async (id) => {
  const res = await request(`/api/chat/session/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error("Delete session failed");
};

export const getSerendipity = async (page = 1) => {
  const res = await request(`/api/serendipity?page=${page}`);
  if (!res.ok) throw new Error("Get pending notes failed");
  const data = await res.json();
  return { 
    content: data.data || "", 
    references: data.references || [],
    total: data.total || 0
  };
};

export const reprocessNote = async (id, templateId) => {
    let url = `/api/note/${id}/reprocess`;
    if (templateId) {
        url += `?template_id=${templateId}`;
    }
    const res = await request(url, {
        method: 'POST'
    });
    if (!res.ok) throw new Error('Reprocess failed');
    return res.json();
};

export const getRelatedNotes = async (id) => {
  const res = await request(`/api/note/${id}/related`);
  if (!res.ok) throw new Error("Get related notes failed");
  const data = await res.json();
  return data.data || [];
};

export const getGraph = async () => {
  const res = await request('/api/graph');
  if (!res.ok) throw new Error("Get graph failed");
  const data = await res.json();
  return data.data || { nodes: [], links: [] };
};

export const synthesizeNotes = async (ids, prompt) => {
  const res = await request("/api/note/synthesize", {
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
  const res = await request("/api/note/batch/archive", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, archive }),
  });
  if (!res.ok) throw new Error("Batch archive failed");
};

export const saveSynthesizedNote = async (ids, title, content) => {
  const res = await request("/api/note/synthesize/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids, title, content }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Save synthesis failed");
  }
  const data = await res.json();
  return data.data;
};

export const generateDailyReview = async () => {
  const res = await request('/api/review/daily', { method: 'POST' });
  if (!res.ok) throw new Error('Generate review failed');
  return res.json();
};

export const getLatestReview = async () => {
  const res = await request('/api/review/latest');
  if (!res.ok) return null;
  const data = await res.json();
  return data.data || null;
};

// uploadImage 上传图片到服务器存储，返回 storage_id 和 URL
export const uploadImage = async (imageData, mimeType) => {
  const res = await request("/api/image/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: imageData, mime_type: mimeType }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Image upload failed");
  }
  const data = await res.json();
  return { storageId: data.storage_id, url: data.url };
};

// uploadImageFromUrl 将外部图片 URL 发给后端下载存储，返回本地 URL
export const uploadImageFromUrl = async (url, mimeType) => {
  const res = await request("/api/image/upload_from_url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, mime_type: mimeType }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || "Image download failed");
  }
  const data = await res.json();
  return { storageId: data.storage_id, url: data.url };
};

