export const login = async (password) => {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Login failed');
  }
  const data = await res.json();
  if (data.token) {
    localStorage.setItem('auth_token', data.token);
  }
  return data;
};

export const checkAuth = async () => {
  const token = localStorage.getItem('auth_token');
  if (!token) return false;

  try {
    const res = await fetch('/api/auth/check', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.ok;
  } catch (e) {
    return false;
  }
};

export const logout = () => {
  localStorage.removeItem('auth_token');
  window.location.reload();
};

export const getAuthToken = () => localStorage.getItem('auth_token');
