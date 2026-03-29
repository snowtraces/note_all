import { request } from './client';

export const createShare = async (noteId, expireDays = 0) => {
  const res = await request('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note_id: noteId, expire_days: expireDays })
  });
  if (!res.ok) throw new Error('Failed to create share link');
  return res.json();
};

export const getPublicShare = async (shareId) => {
  // 注意这里使用 fetch 而不是 request，因为是公开接口，不需要 Authorization
  const res = await fetch(`/api/pub/share/${shareId}`);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Share not found or expired');
  }
  return res.json();
};

export const revokeShare = async (shareId) => {
  const res = await request(`/api/share/${shareId}`, {
    method: 'DELETE'
  });
  if (!res.ok) throw new Error('Failed to revoke share link');
  return res.json();
};

export const getNoteShares = async (noteId) => {
  const res = await request(`/api/note/${noteId}/shares`);
  if (!res.ok) throw new Error('Failed to get share links');
  return res.json();
};
