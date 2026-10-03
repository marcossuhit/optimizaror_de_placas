;(function initializeMaterialImageApi() {
  const apiBase = typeof window.MATERIAL_IMAGE_API_BASE_URL === 'string'
    ? window.MATERIAL_IMAGE_API_BASE_URL.trim().replace(/\/$/, '')
    : '/api/material-images';

  async function readResponse(response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || `El servidor respondió ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  function getToken() {
    return window.Auth?.getGoogleIdToken?.() || '';
  }

  async function get(material) {
    const query = new URLSearchParams({ material: String(material || '') });
    try {
      const response = await fetch(`${apiBase}?${query}`, { cache: 'no-store' });
      if (response.status === 404) return { available: false, imageUrl: '' };
      const payload = await readResponse(response);
      return { available: true, imageUrl: payload.imageUrl || '' };
    } catch (error) {
      if (error.status) throw error;
      return { available: false, imageUrl: '' };
    }
  }

  async function save(material, imageDataUrl) {
    const token = getToken();
    if (!token) return null;
    const response = await fetch(apiBase, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ material, imageDataUrl })
    });
    if (response.status === 404) return null;
    const payload = await readResponse(response);
    return payload.imageUrl || '';
  }

  async function remove(material) {
    const token = getToken();
    if (!token) return null;
    const query = new URLSearchParams({ material: String(material || '') });
    const response = await fetch(`${apiBase}?${query}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (response.status === 404) return null;
    await readResponse(response);
    return true;
  }

  window.MaterialImages = Object.freeze({ get, save, remove });
})();