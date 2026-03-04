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
