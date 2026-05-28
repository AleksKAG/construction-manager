/**
 * VersionHistoryModal — история версий файла
 */
export class VersionHistoryModal {
  _token() {
    return localStorage.getItem('authToken') || localStorage.getItem('token') || '';
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

  async show(fileId, fileName) {
    document.querySelector('.ver-modal-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.className = 'ai-modal-overlay ver-modal-overlay';
    overlay.innerHTML = `
      <div class="ai-modal" style="max-width:600px;">
        <h4>📜 История версий: <span style="font-weight:400;">${fileName || fileId}</span></h4>
        <div id="verContent"><div class="ai-explanation">⏳ Загрузка...</div></div>
        <div class="modal-actions">
          <button class="ghost" id="verCloseBtn">Закрыть</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#verCloseBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    try {
      const res = await this._api(`/files/${fileId}/versions`);
      if (!res.ok) throw new Error(`Сервер вернул ${res.status}`);
      const data = await res.json();
      const versions = Array.isArray(data) ? data : (data?.versions || []);
      this.renderVersions(overlay.querySelector('#verContent'), fileId, versions);
    } catch (e) {
      overlay.querySelector('#verContent').innerHTML =
        `<div class="ai-explanation" style="color:#991b1b;">❌ Ошибка: ${e.message}</div>`;
    }
  }

  renderVersions(container, fileId, versions) {
    if (!versions.length) {
      container.innerHTML = '<div class="ai-explanation muted">Версий нет</div>';
      return;
    }
    container.innerHTML = `
      <table class="table" style="width:100%;font-size:.9rem;">
        <thead><tr>
          <th>Версия</th><th>Размер</th><th>Автор</th><th>Дата</th><th>Текущая</th><th></th>
        </tr></thead>
        <tbody>${versions.map(v => `
          <tr>
            <td>v${v.version}</td>
            <td>${this._fmtBytes(v.size_bytes)}</td>
            <td>${v.uploaded_by || '—'}</td>
            <td>${v.created_at ? new Date(v.created_at).toLocaleDateString('ru') : '—'}</td>
            <td>${v.is_current ? '✅' : ''}</td>
            <td>${!v.is_current
              ? `<button class="ghost sm" data-rollback="${v.version}" data-file="${fileId}">↩ Откатить</button>`
              : ''}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    container.querySelectorAll('[data-rollback]').forEach(btn => {
      btn.addEventListener('click', () => this.rollback(btn.dataset.file, btn.dataset.rollback, container));
    });
  }

  async rollback(fileId, version, container) {
    if (!confirm(`Откатить к версии v${version}?`)) return;
    try {
      const res = await this._api(`/files/${fileId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: Number(version) })
      });
      if (!res.ok) throw new Error(`Сервер вернул ${res.status}`);
      container.innerHTML = '<div class="ai-explanation">✅ Откат выполнен. Перезагрузите страницу.</div>';
    } catch (e) {
      alert('Ошибка отката: ' + e.message);
    }
  }

  _fmtBytes(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' Б';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
    return (bytes / 1048576).toFixed(1) + ' МБ';
  }
}
