import { request } from './client';

export const generateImage = async (prompt, model, quantity, ratio, resolution) => {
  const response = await request('/api/image_gen/create', {
    method: 'POST',
    body: JSON.stringify({ prompt, model, quantity, ratio, resolution }),
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to generate image');
  }
  return await response.json();
};

export const getImageHistory = async (query = '', archived = false) => {
  const response = await request(`/api/image_gen/history?query=${encodeURIComponent(query)}&archived=${archived}`, {
    method: 'GET',
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to fetch image history');
  }
  return await response.json();
};

export const toggleArchive = async (id) => {
  const response = await request(`/api/image_gen/${id}/archive`, {
    method: 'POST',
  });
  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error || 'Failed to toggle archive');
  }
  return await response.json();
};
