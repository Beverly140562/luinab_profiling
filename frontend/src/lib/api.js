
const TOKEN_KEY = 'luinab_token';

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || ''
).replace(/\/+$/, '');

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const normalizedPath = path.startsWith('/')
    ? path
    : `/${path}`;

  const url = `${API_BASE_URL}/api${normalizedPath}`;

  let res;

  try {
    res = await fetch(url, {
      ...options,
      headers,
    });
  } catch (cause) {
    const error = new Error(
      `Cannot connect to the API at ${url}. Check VITE_API_URL, backend availability, and CORS.`
    );
    error.cause = cause;
    throw error;
  }

  const contentType =
    res.headers.get('content-type') || '';

  const isCsv = contentType.includes('text/csv');

  if (res.status === 401 && path !== '/auth/login') {
    clearToken();
    window.location.href = '/login';

    const error = new Error('Session expired.');
    error.status = 401;
    error.response = { status: 401 };
    throw error;
  }

  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    const errorText = await res.text();

    if (errorText.trim()) {
      try {
        const data = JSON.parse(errorText);
        message =
          data?.error ||
          data?.message ||
          message;
      } catch {
        message = errorText.trim();
      }
    }

    const error = new Error(message);
    error.status = res.status;
    error.response = {
      status: res.status,
      data: { error: message },
    };

    throw error;
  }

  if (isCsv) {
    return res.text();
  }

  const text = await res.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const error = new Error(
      `Invalid JSON response from ${url}.`
    );
    error.status = res.status;
    throw error;
  }
}

export const api = {
  get: (p) => request(p),

  post: (p, body) =>
    request(p, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),

  put: (p, body) =>
    request(p, {
      method: 'PUT',
      body: JSON.stringify(body || {}),
    }),

  patch: (p, body) =>
    request(p, {
      method: 'PATCH',
      body: JSON.stringify(body || {}),
    }),

  del: (p) =>
    request(p, {
      method: 'DELETE',
    }),
};
