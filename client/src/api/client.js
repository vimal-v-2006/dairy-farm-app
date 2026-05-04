const tokenKey = 'milk_business_pro_token';
const legacyTokenKeys = ['dairy_farm_token'];

function clearLegacyTokens() {
  legacyTokenKeys.forEach((key) => localStorage.removeItem(key));
}

export const storage = {
  getToken: () => {
    clearLegacyTokens();
    return localStorage.getItem(tokenKey);
  },
  setToken: (token) => {
    clearLegacyTokens();
    localStorage.setItem(tokenKey, token);
  },
  clear: () => {
    localStorage.removeItem(tokenKey);
    clearLegacyTokens();
  }
};

export async function api(path, options = {}) {
  const token = storage.getToken();
  const headers = options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(path, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Server returned an invalid response. Please refresh the page and try again.');
  }
  if (!response.ok) throw new Error(data.message || 'Request failed');
  return data;
}
