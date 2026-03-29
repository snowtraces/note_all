import { request } from './client';

const API_BASE = '/api';

export const getTemplates = async () => {
    const res = await request(`${API_BASE}/templates`);
    if (!res.ok) throw new Error('Failed to fetch templates');
    const json = await res.json();
    return json.data;
};

export const createTemplate = async (template) => {
    const res = await request(`${API_BASE}/templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
    });
    if (!res.ok) throw new Error('Failed to create template');
    const json = await res.json();
    return json.data;
};

export const updateTemplate = async (id, template) => {
    const res = await request(`${API_BASE}/templates/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
    });
    if (!res.ok) throw new Error('Failed to update template');
    const json = await res.json();
    return json.data;
};

export const deleteTemplate = async (id) => {
    const res = await request(`${API_BASE}/templates/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete template');
};

export const setActiveTemplate = async (id) => {
    const res = await request(`${API_BASE}/templates/${id}/active`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to set active template');
};
