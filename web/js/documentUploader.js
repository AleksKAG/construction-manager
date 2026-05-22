import { api } from './api.js';

function ensureUploaderUI() {
  if (document.getElementById('s3UploaderCard')) return;
  const content = document.getElementById('contentArea');
  if (!content) return;
  const card = document.createElement('div');
  card.className = 'card col-12';
  card.id = 's3UploaderCard';
  card.innerHTML = `
    <h3>Проверка S3 загрузки</h3>
    <div class="notice" style="margin-bottom:12px;">Выберите файл, получите presigned URL, загрузите напрямую в S3 и подтвердите хеш на бэкенде.</div>
    <div class="form-grid two">
      <label>Project ID<input id="s3ProjectId" placeholder="project text id"></label>
      <label>Тип документа
        <select id="s3DocType">
          <option value="ird">ird</option><option value="pd">pd</option><option value="rd">rd</option>
          <option value="estimate">estimate</option><option value="protocol">protocol</option><option value="act">act</option>
        </select>
      </label>
      <label>Обозначение<input id="s3Designation" placeholder="AR-001"></label>
      <label>Файл<input id="s3FileInput" type="file"></label>
    </div>
    <div style="display:flex; gap:8px; margin-top:12px; align-items:center;">
      <button id="s3UploadBtn" class="primary">Загрузить </button>
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
    xhr.onerror = () => reject(new Error('Network error during S3 PUT'));
    xhr.send(file);
  });
}

async function startUpload() {
  const result = document.getElementById('s3Result');
  const projectId = document.getElementById('s3ProjectId').value.trim();
  const docType = document.getElementById('s3DocType').value;
  const designation = document.getElementById('s3Designation').value.trim();
  const file = document.getElementById('s3FileInput').files?.[0];
  const progress = document.getElementById('s3Progress');
  const progressText = document.getElementById('s3ProgressText');

  if (!projectId || !designation || !file) {
    result.textContent = 'Заполните Project ID, Designation и выберите файл.';
    return;
  }

  try {
    progress.value = 0; progressText.textContent = '0%';
    result.textContent = '1) Запрос presigned URL...';
    const presigned = await api('/documents/presigned-url', 'POST', {
      project_id: projectId,
      doc_type: docType,
      designation: designation,
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
  const projectId = document.getElementById('s3ProjectId').value.trim();
  const designation = document.getElementById('s3Designation').value.trim();
  if (!projectId || !designation) {
    result.textContent = 'Для сравнения версий заполните Project ID и Designation.';
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
              <td style="max-width:340px; word-break:break-all;">${r.storage_key ?? ''}</td>
              <td style="font-family:monospace;">${r.file_hash ?? ''}</td>
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
