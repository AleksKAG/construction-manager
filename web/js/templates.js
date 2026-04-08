import { api } from './api.js';

export async function listTemplates(search = '') {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return api(`/templates${q}`);
}

export async function getTemplate(code) {
  return api(`/templates/${code}`);
}

export async function listTemplateRows(projectId, code, params = {}) {
  const query = new URLSearchParams(params).toString();
  return api(`/objects/${projectId}/templates/${code}/rows${query ? `?${query}` : ''}`);
}

export async function createTemplateRow(projectId, code, data) {
  return api(`/objects/${projectId}/templates/${code}/rows`, 'POST', { data });
}

export async function updateTemplateRow(rowId, data) {
  return api(`/template-rows/${rowId}`, 'PUT', { data });
}

export async function deleteTemplateRow(rowId) {
  return api(`/template-rows/${rowId}`, 'DELETE');
}

export async function exportTemplate(projectId, code) {
  const token = localStorage.getItem('cm_token');
  const res = await fetch(`/api/v1/objects/${projectId}/templates/${code}/export.csv`, {
    method: 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    let message = `Ошибка экспорта (${res.status})`;
    try {
      const payload = await res.json();
      if (payload?.error) message = payload.error;
    } catch (_) {}
    throw new Error(message);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${code}_${projectId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
