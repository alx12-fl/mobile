const api = {
  async get(path) {
    const response = await fetch(`/api${path}`, { headers: { accept: 'application/json' } });
    const payload = await response.json().catch(() => ({ ok: false, error: `Invalid response (${response.status})` }));
    if (!response.ok || !payload.ok) throw new Error(payload.error || `Request failed (${response.status})`);
    return payload.data;
  },
  health: () => api.get('/health'),
  brands: () => api.get('/brands'),
  brand: id => api.get(`/brands/${encodeURIComponent(id)}`),
  device: id => api.get(`/device/${encodeURIComponent(id)}`),
  search: q => api.get(`/search?q=${encodeURIComponent(q)}`),
  top: () => api.get('/top'),
  deals: () => api.get('/deals'),
  glossary: () => api.get('/glossary'),
  term: id => api.get(`/glossary/${encodeURIComponent(id)}`),
  enriched: name => api.get(`/enriched?name=${encodeURIComponent(name)}`),
  compare: ids => api.get(`/compare?ids=${ids.map(encodeURIComponent).join(',')}`)
};
export default api;
