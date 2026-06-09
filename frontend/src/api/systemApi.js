import { request } from './client';

const API_BASE = '/api';

export const getEmbeddingStatus = async () => {
    const res = await request(`${API_BASE}/system/embedding/status`);
    if (!res.ok) throw new Error('Failed to fetch embedding status');
    return await res.json();
};

export const rebuildEmbeddings = async () => {
    const res = await request(`${API_BASE}/system/embedding/rebuild`, {
        method: 'POST',
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to rebuild embeddings');
    }
    return await res.json();
};

export const getSynonymStatus = async () => {
    const res = await request(`${API_BASE}/system/synonym/status`);
    if (!res.ok) throw new Error('Failed to fetch synonym status');
    return await res.json();
};

export const syncSynonyms = async () => {
    const res = await request(`${API_BASE}/system/synonym/sync`, {
        method: 'POST',
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to sync synonyms');
    }
    return await res.json();
};

export const exportNotesZip = async () => {
    const res = await request(`${API_BASE}/system/export/zip`);
    if (!res.ok) throw new Error('Failed to export notes');
    return await res.blob();
};

export const importNotesZip = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await request(`${API_BASE}/system/import/zip`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to import ZIP');
    }
    return await res.json();
};

export const importSingleMD = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await request(`${API_BASE}/system/import/md`, {
        method: 'POST',
        body: formData,
    });
    if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to import MD');
    }
    return await res.json();
};

