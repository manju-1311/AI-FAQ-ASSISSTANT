const configuredApiUrl = globalThis.API_BASE_URL || '';
const isLocalPreview = window.location.protocol === 'file:'
  || ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port !== '5000';
const localPreviewApiUrl = isLocalPreview
  ? 'http://localhost:5000/api'
  : '/api';
const API_BASE_URL = configuredApiUrl || localPreviewApiUrl;
const TOKEN_KEY = 'askly-token';

export class ApiError extends Error { constructor(message, status) { super(message); this.name = 'ApiError'; this.status = status; } }
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('The API took too long to respond. Start MongoDB and the Express server, then try again.', 408);
    }

    throw new ApiError('The API is unavailable. Start the Express server, then try again.', 503);
  } finally {
    clearTimeout(timeout);
  }

  const contentType = response.headers.get('content-type') || '';
  let payload;

  if (!contentType.includes('application/json')) {
    const text = await response.text();
    const preview = text.replace(/\s+/g, ' ').trim();
    throw new ApiError(
      preview && preview.length < 200
        ? `The server responded with invalid JSON: ${preview}`
        : 'The server responded with an unexpected HTML/text payload instead of JSON.',
      response.status,
    );
  }

  try { payload = await response.json(); } catch (error) { throw new ApiError('The server returned an unreadable response. Check that the app is running on the expected port.', response.status); }
  if (response.status === 401) { const hadToken = Boolean(getToken()); setToken(null); window.dispatchEvent(new CustomEvent('auth:expired', { detail: { hadToken } })); }
  if (!response.ok || payload.success === false) throw new ApiError(payload.message || 'Something went wrong.', response.status);
  return payload;
}

export const authApi = { login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }), register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }), profile: () => request('/auth/profile') };
export const faqApi = { list: () => request('/faqs'), search: (query) => request(`/faqs/search?q=${encodeURIComponent(query)}`), create: (data) => request('/faqs', { method: 'POST', body: JSON.stringify(data) }), update: (id, data) => request(`/faqs/${id}`, { method: 'PUT', body: JSON.stringify(data) }), remove: (id) => request(`/faqs/${id}`, { method: 'DELETE' }) };
export const aiApi = { generateFaq: (topic) => request('/ai/generate-faq', { method: 'POST', body: JSON.stringify({ topic }) }), generateAnswer: (question) => request('/ai/answer', { method: 'POST', body: JSON.stringify({ question }) }) };
