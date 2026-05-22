import { api } from './api.js';

let knownObjects = [];

function getPickedProjectId() {
  const select = document.getElementById('s3ProjectSelect');
  const manual = document.getElementById('s3ProjectId');
  return (select?.value || manual?.value || '').trim();
}

function ensureUploaderUI() {
  if (document.getElementById('s3UploaderCard')) return;
  const content = document.getElementById('contentArea');
  if (!content) return;
  const card = document.createElement('div');
  card.className = 'card col-12';
  card.id = 's3UploaderCard';
  card.innerHTML = `
    <h3>Проверка S3 загрузки</h3>
    <div class="notice" style="margin-bottom:12px;">Выберите проект и файл: загрузка идёт напрямую в S3, затем подтверждается на backend.</div>
    <div class="form-grid two">
      <label>Проект (рекомендуется из списка)
        <select id="s3ProjectSelect"><option value="">Загрузка списка проектов...</option></select>
      </label>
      <label>Project ID (ручной ввод)
        <input id="s3ProjectId" placeholder="uuid/text project id">
      </label>
      <label>Тип документа
        <select id="s3DocType">
          <option value="ird">ird</option><option value="pd">pd</option><option value="rd">rd</option>
          <option value="estimate">estimate</option><option value="protocol">protocol</option><option value="act">act</option>
        </select>
      </label>
      <label>Обозначение<input id="s3Designation" placeholder="AR-001"></label>
      <label>Файл<input id="s3FileInput" type="file"></label>
    </div>
    <div style="display:flex; gap:8px; margin-top:12px; align-items:center; flex-wrap:wrap;">
      <button id="s3UploadBtn" class="primary">Загрузить</button>
      <button id="s3CompareBtn" class="ghost">Показать версии</button>
      <progress id="s3Progress" max="100" value="0" style="width:240px;"></progress>
      <span id="s3ProgressText" class="metric">0%</span>
    </div>
    <div id="s3VersionsWrap" style="margin-top:12px;"></div>
    <pre id="s3Result" style="margin-top:12px; white-space:pre-wrap; background:#f8fafc; border:1px solid var(--line); border-radius:8px; padding:10px;"></pre>
  `;
  content.prepend(card);

  card.querySelector('#s3UploadBtn').addEventListener('click', startUpload);
  card.querySelector('#s3CompareBtn').addEventListener('click', loadVersions);
  card.querySelector('#s3ProjectSelect').addEventListener('change', (e) => {
    const manual = document.getElementById('s3ProjectId');
    if (manual && e.target.value) manual.value = e.target.value;
  });

  void loadObjectsIntoUploader();
}

async function loadObjectsIntoUploader() {
  const select = document.getElementById('s3ProjectSelect');
  if (!select) return;
  try {
    const rows = await api('/objects?page=1&page_size=200');
    knownObjects = Array.isArray(rows) ? rows : (rows?.items || []);
    const options = ['<option value="">-- выберите проект --</option>'];
    for (const o of knownObjects) {
      const id = String(o.id ?? '').trim();
      const title = String(o.name || o.title || o.project_name || id);
      if (!id) continue;
      options.push(`<option value="${escapeHtml(id)}">${escapeHtml(title)} (${escapeHtml(id)})</option>`);
    }
    select.innerHTML = options.join('');
  } catch (_) {
    select.innerHTML = '<option value="">Не удалось загрузить список проектов</option>';
  }
}

function escapeHtml(v) {
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

async function sha256Hex(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function putWithProgress(url, file, contentType, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) onProgress(Math.round((evt.loaded / evt.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`PUT failed: ${xhr.status}`)));
    xhr.onerror = () => reject(new Error('Network error during S3 PUT (проверьте CORS/доступность S3 endpoint из браузера)'));
    xhr.send(file);
  });
}

async function startUpload() {
  const result = document.getElementById('s3Result');
  const projectId = getPickedProjectId();
  const docType = document.getElementById('s3DocType').value;
  const designation = document.getElementById('s3Designation').value.trim();
  const file = document.getElementById('s3FileInput').files?.[0];
  const progress = document.getElementById('s3Progress');
  const progressText = document.getElementById('s3ProgressText');

  if (!projectId || !designation || !file) {
    result.textContent = 'Заполните Project ID/выберите проект, Designation и выберите файл.';
    return;
  }

  const obj = knownObjects.find((o) => String(o.id) === projectId);
  if (obj && String(obj.name || obj.title || '').trim() === projectId) {
    result.textContent = 'Похоже выбрано имя проекта вместо ID. Используйте ID проекта.';
    return;
  }

  try {
    progress.value = 0; progressText.textContent = '0%';
    result.textContent = '1) Запрос presigned URL...';
    const presigned = await api('/documents/presigned-url', 'POST', {
      project_id: projectId,
      doc_type: docType,
      designation,
      filename: file.name,
      content_type: file.type || 'application/octet-stream',
      size: file.size,
    });

    result.textContent += '\n2) Подсчёт SHA-256...';
    const hash = await sha256Hex(file);

    result.textContent += '\n3) PUT в S3 по presigned URL...';
    await putWithProgress(presigned.presigned_url, file, file.type, (v) => { progress.value = v; progressText.textContent = `${v}%`; });

    result.textContent += '\n4) Confirm upload на backend...';
    const confirmed = await api('/documents/confirm', 'POST', {
      storage_key: presigned.storage_key,
      file_hash: hash,
      size: file.size,
    });

    result.textContent += `\n✅ Готово.\nDocument ID: ${confirmed.id}\nVersion: ${confirmed.version}\nStorage key: ${confirmed.storage_key}`;
  } catch (e) {
    result.textContent += `\n❌ Ошибка: ${e.message}`;
  }
}

async function loadVersions() {
  const result = document.getElementById('s3Result');
  const wrap = document.getElementById('s3VersionsWrap');
  const projectId = getPickedProjectId();
  const designation = document.getElementById('s3Designation').value.trim();
  if (!projectId || !designation) {
    result.textContent = 'Для сравнения версий заполните Project ID/выберите проект и Designation.';
    return;
  }
  try {
    result.textContent = 'Запрос списка версий...';
    const rows = await api('/documents/compare', 'POST', { project_id: projectId, designation });
    if (!rows?.length) {
      wrap.innerHTML = '<div class="notice">Версии не найдены.</div>';
      result.textContent = 'Готово: версий нет.';
      return;
    }
    wrap.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Version</th><th>Status</th><th>Storage key</th><th>Hash (SHA-256)</th></tr></thead>
          <tbody>
            ${rows.map((r) => `<tr>
              <td>${r.version ?? ''}</td>
              <td>${r.status ?? ''}</td>
              <td style="max-width:340px; word-break:break-all;">${escapeHtml(r.storage_key ?? '')}</td>
              <td style="font-family:monospace;">${escapeHtml(r.file_hash ?? '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    result.textContent = `Готово: найдено версий ${rows.length}.`;
  } catch (e) {
    result.textContent = `Ошибка загрузки версий: ${e.message}`;
  }
}

const observer = new MutationObserver(() => ensureUploaderUI());
observer.observe(document.body, { childList: true, subtree: true });
ensureUploaderUI();
