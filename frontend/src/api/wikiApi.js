import { request } from './client';

export const getPendingWikiTasks = async () => {
    const res = await request('/api/wiki/pending');
    if (!res.ok) throw new Error("Failed to get pending wiki tasks");
    const data = await res.json();
    // The backend returns an array directly: c.JSON(http.StatusOK, tasks)
    return Array.isArray(data) ? data : (data.data || []);
};

export const compileWikiTask = async (taskId) => {
    const res = await request('/api/wiki/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
    });
    if (!res.ok) throw new Error("Failed to compile wiki task");
    const data = await res.json();
    return data;
};

export const rejectWikiTask = async (taskId) => {
    const res = await request('/api/wiki/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId }),
    });
    if (!res.ok) throw new Error("Failed to reject wiki task");
    const data = await res.json();
    return data;
};

export const getRelatedWikis = async (noteId) => {
    const res = await request(`/api/wiki/related?note_id=${noteId}`);
    if (!res.ok) throw new Error("Failed to get related wikis");
    const data = await res.json();
    return Array.isArray(data) ? data : (data.data || []);
};

export const getAllWikiEntities = async () => {
    const res = await request('/api/wiki/entities');
    if (!res.ok) throw new Error("Failed to get all wiki entities");
    const data = await res.json();
    return data.data || [];
};

export const getWikiEntityDetail = async (id) => {
    const res = await request(`/api/wiki/entities/${id}`);
    if (!res.ok) throw new Error("Failed to get wiki entity detail");
    const data = await res.json();
	return data; // returns { data: WikiEntity, references: []NoteItem }
};

export const deleteWikiEntity = async (id) => {
    const res = await request(`/api/wiki/entities/${id}`, {
        method: 'DELETE',
    });
    if (!res.ok) throw new Error("Failed to delete wiki entity");
    return res.json();
};

export const mergeWikiEntity = async (sourceId, targetId) => {
    const res = await request(`/api/wiki/entities/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: sourceId, target_id: targetId }),
    });
    if (!res.ok) throw new Error("Failed to merge wiki entity");
    return res.json();
};
