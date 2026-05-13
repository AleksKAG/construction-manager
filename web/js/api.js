// Глобальный обработчик 401 — редирект на логин
function handle401() {
  localStorage.removeItem('cm_token');
  localStorage.removeItem('cm_role');
  localStorage.removeItem('cm_token_expires');
  // Показываем overlay если он есть, иначе перезагрузка
  const overlay = document.getElementById('loginOverlay');
  const layout = document.getElementById('appLayout');
  if (overlay && layout) {
    layout.style.visibility = 'hidden';
    overlay.style.display = 'flex';
    setTimeout(() => document.getElementById('loginOverlayField')?.focus(), 50);
  } else {
    window.location.reload();
  }
}

export async function api(path, method = 'GET', body = null, token = localStorage.getItem('cm_token')) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);
  const res = await fetch(`/api/v1${path}`, options);
  if (res.status === 401) {
    handle401();
    throw new Error('Сессия истекла, войдите снова');
  }
  if (!res.ok) {
    let msg = `Ошибка ${res.status}`;
    try { const payload = await res.json(); msg = payload.error || msg; } catch (_) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function apiUpload(path, formData, token = localStorage.getItem('cm_token')) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api/v1${path}`, {
    method: 'POST',
    headers,
    body: formData,
  });
  if (res.status === 401) {
    handle401();
    throw new Error('Сессия истекла, войдите снова');
  }
  if (!res.ok) {
    let msg = `Ошибка ${res.status}`;
    try { const payload = await res.json(); msg = payload.error || msg; } catch (_) {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function issueDemoToken(role = 'admin') {
  const payload = await api('/auth/token', 'POST', { role, user_id: 'demo-user' }, null);
  localStorage.setItem('cm_token', payload.access_token);
  return payload;
}
