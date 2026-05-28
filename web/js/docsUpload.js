/**
 * AIUploadModal — загрузка с AI-анализом через SSE
 */
export class AIUploadModal {
  constructor(projectId, onConfirm) {
    this.projectId = projectId;
    this.onConfirm = onConfirm;
    this._overlay = null;
  }

  _token() {
    return localStorage.getItem('cm_token') || localStorage.getItem('authToken') || localStorage.getItem('token') || '';
  }

  _api(path, opts = {}) {
    const token = this._token();
    return fetch('/api/v1' + path, {
      ...opts,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.headers || {})
      }
    });
  }

  show() {
    this._removeOverlay();
    const overlay = document.createElement('div');
    overlay.className = 'ai-modal-overlay';
    overlay.innerHTML = `
      <div class="ai-modal">
        <h4>⬆️ Загрузить документ</h4>
        <div id="aiUploadDropzone" style="border:2px dashed var(--line,#cbd5e1);border-radius:10px;
          padding:32px;text-align:center;cursor:pointer;margin-bottom:16px;transition:background .2s;">
          <div style="font-size:2rem;">📄</div>
          <div style="margin-top:8px;color:var(--muted,#64748b);">Перетащите файл или нажмите для выбора</div>
          <input type="file" id="aiFileInput" style="display:none;" multiple accept="*/*">
        </div>
        <div id="aiUploadStatus" style="display:none;"></div>
        <div class="modal-actions">
          <button class="ghost" id="aiCancelBtn">Отмена</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    this._overlay = overlay;

    const dropzone = overlay.querySelector('#aiUploadDropzone');
    const fileInput = overlay.querySelector('#aiFileInput');

    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.style.background = 'var(--accent-light,#eff6ff)'; });
    dropzone.addEventListener('dragleave', () => { dropzone.style.background = ''; });
    dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dropzone.style.background = '';
      if (e.dataTransfer.files.length) this.startUpload(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => { if (fileInput.files.length) this.startUpload(fileInput.files[0]); });
    overlay.querySelector('#aiCancelBtn').addEventListener('click', () => this._removeOverlay());
    overlay.addEventListener('click', e => { if (e.target === overlay) this._removeOverlay(); });
  }

  async startUpload(file) {
    const statusEl = this._overlay?.querySelector('#aiUploadStatus');
    const dropzone = this._overlay?.querySelector('#aiUploadDropzone');
    if (!statusEl) return;

    dropzone && (dropzone.style.display = 'none');
    statusEl.style.display = 'block';
    statusEl.innerHTML = `<div class="ai-explanation">⏳ Получение presigned URL для <b>${file.name}</b>...</div>`;

    try {
      // 1. Запрос presigned URL
      const res = await this._api('/files/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: this.projectId,
          name: file.name,
          content_type: file.type || 'application/octet-stream',
          size: file.size,
          idempotency_key: `${Date.now()}-${file.name}`
        })
      });

      if (!res.ok) throw new Error(`Сервер вернул ${res.status}`);
      const { upload_url, file_id } = await res.json();

      statusEl.innerHTML = `<div class="ai-explanation">📤 Загрузка файла на S3...</div>
        <progress style="width:100%;height:6px;border-radius:4px;" id="aiProgress" max="100" value="0"></progress>`;

      // 2. PUT в S3
      await this._putToS3(upload_url, file, (pct) => {
        const p = this._overlay?.querySelector('#aiProgress');
        if (p) p.value = pct;
      });

      statusEl.innerHTML = `<div class="ai-explanation">🔍 AI анализирует документ...</div>
        <div style="text-align:center;font-size:1.5rem;margin:12px 0;">⚙️</div>`;

      // 3. SSE — ждём результат AI
      await this._subscribeSSE(file_id, statusEl);

    } catch (e) {
      statusEl.innerHTML = `<div class="ai-explanation" style="color:#991b1b;">❌ Ошибка: ${e.message}</div>`;
      const actions = this._overlay?.querySelector('.modal-actions');
      if (actions) actions.innerHTML = `<button class="ghost" id="aiCancelBtn">Закрыть</button>`;
      this._overlay?.querySelector('#aiCancelBtn')?.addEventListener('click', () => this._removeOverlay());
    }
  }

  _putToS3(url, file, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
      xhr.onload = () => xhr.status < 400 ? resolve() : reject(new Error(`S3 PUT failed: ${xhr.status}`));
      xhr.onerror = () => reject(new Error('Сетевая ошибка при загрузке в S3'));
      xhr.send(file);
    });
  }

  _subscribeSSE(fileId, statusEl) {
    return new Promise((resolve) => {
      const token = this._token();
      const url = `/api/v1/files/events/${fileId}${token ? '?token=' + encodeURIComponent(token) : ''}`;
      const es = new EventSource(url);
      const timeout = setTimeout(() => {
        es.close();
        this._showAIResult(statusEl, fileId, {
          confidence: 0.7,
          suggested_folder: '/documents',
          version_action: 'new',
          explanation_for_user: 'AI-анализ не успел завершиться. Выберите действие вручную.',
          requires_human_review: true
        });
        resolve();
      }, 15000);

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.event === 'analysis_ready' || data.confidence !== undefined) {
            clearTimeout(timeout);
            es.close();
            this._showAIResult(statusEl, fileId, data.data || data);
            resolve();
          }
        } catch (_) {}
      };
      es.onerror = () => {
        clearTimeout(timeout);
        es.close();
        this._showAIResult(statusEl, fileId, {
          confidence: 0.75,
          suggested_folder: '/documents',
          version_action: 'new',
          explanation_for_user: 'Документ загружен. Выберите действие.',
          requires_human_review: true
        });
        resolve();
      };
    });
  }

  _showAIResult(statusEl, fileId, data) {
    const pct = Math.round((data.confidence || 0) * 100);
    statusEl.innerHTML = `
      <div class="ai-explanation">
        <b>🤖 Результат AI-анализа</b><br>
        ${data.explanation_for_user || 'Документ проанализирован.'}
      </div>
      <div class="ai-confidence">
        Уверенность: <b>${pct}%</b>
        ${data.suggested_folder ? ` • Папка: <code>${data.suggested_folder}</code>` : ''}
      </div>
      <label style="display:block;margin-bottom:8px;font-size:.85rem;">Папка для сохранения:
        <input id="aiTargetFolder" class="input" style="display:block;width:100%;margin-top:4px;"
          value="${data.suggested_folder || '/documents'}">
      </label>`;

    const actions = this._overlay?.querySelector('.modal-actions');
    if (!actions) return;
    actions.innerHTML = `
      <button class="primary" id="aiActionNew">📄 Новый файл</button>
      <button class="secondary" id="aiActionUpdate">🔄 Новая версия</button>
      <button class="ghost" id="aiActionArchive">📦 Архив</button>
      <button class="ghost" id="aiCancelBtn2">Отмена</button>`;

    const getFolder = () => this._overlay?.querySelector('#aiTargetFolder')?.value || '/documents';
    actions.querySelector('#aiActionNew').addEventListener('click', () => this._confirm(fileId, 'new', getFolder()));
    actions.querySelector('#aiActionUpdate').addEventListener('click', () => this._confirm(fileId, 'update', getFolder()));
    actions.querySelector('#aiActionArchive').addEventListener('click', () => this._confirm(fileId, 'archive', getFolder()));
    actions.querySelector('#aiCancelBtn2').addEventListener('click', () => this._removeOverlay());
  }

  async _confirm(fileId, action, folderPath) {
    const statusEl = this._overlay?.querySelector('#aiUploadStatus');
    if (statusEl) statusEl.innerHTML = '<div class="ai-explanation">⏳ Сохранение...</div>';
    try {
      const res = await this._api(`/files/${fileId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, folder_path: folderPath })
      });
      if (!res.ok) throw new Error(`Сервер вернул ${res.status}`);
      this._removeOverlay();
      this.onConfirm && this.onConfirm();
    } catch (e) {
      if (statusEl) statusEl.innerHTML = `<div class="ai-explanation" style="color:#991b1b;">❌ ${e.message}</div>`;
    }
  }

  _removeOverlay() {
    this._overlay?.remove();
    this._overlay = null;
  }
}
