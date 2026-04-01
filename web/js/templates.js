import { api } from './api.js';

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

export function exportTemplate(projectId, code) {
  const token = localStorage.getItem('cm_token');
  const url = new URL(`/api/v1/objects/${projectId}/templates/${code}/export.csv`, window.location.origin);
  if (token) url.searchParams.set('token', token);
  window.open(url.toString(), '_blank');
}
