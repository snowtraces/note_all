import { request } from './client';

export const getFolders = async () => {
  const res = await request('/api/folders');
  if (!res.ok) throw new Error("Failed to fetch folders");
  return res.json();
};

export const getFolderTree = async () => {
  const res = await request('/api/folders/tree');
  if (!res.ok) throw new Error("Failed to fetch folder tree");
  return res.json();
};

export const createFolder = async (folderData) => {
  const res = await request('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(folderData)
  });
  if (!res.ok) throw new Error("Failed to create folder");
  return res.json();
};

export const updateFolder = async (id, folderData) => {
  const res = await request(`/api/folders/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(folderData)
  });
  if (!res.ok) throw new Error("Failed to update folder");
  return res.json();
};

export const deleteFolder = async (id) => {
  const res = await request(`/api/folders/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error("Failed to delete folder");
  return res.json();
};

export const updateNoteFolder = async (id, folderL1, folderL2) => {
  const res = await request(`/api/note/${id}/folder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_l1: folderL1, folder_l2: folderL2 })
  });
  if (!res.ok) throw new Error("Failed to update note folder");
  return res.json();
};

export const updateSubfolder = async (folderL1, folderL2, newName) => {
  const res = await request('/api/folders/subfolder', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_l1: folderL1, folder_l2: folderL2, new_name: newName })
  });
  if (!res.ok) throw new Error("Failed to update subfolder");
  return res.json();
};

export const deleteSubfolder = async (folderL1, folderL2) => {
  const res = await request('/api/folders/subfolder', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_l1: folderL1, folder_l2: folderL2 })
  });
  if (!res.ok) throw new Error("Failed to delete subfolder");
  return res.json();
};
