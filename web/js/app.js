import { api, issueDemoToken } from './api.js';
import { getTemplate, listTemplateRows, createTemplateRow, updateTemplateRow, deleteTemplateRow, exportTemplate } from './templates.js';

class ConstructionManagerUI {
  constructor() {
    this.currentView = 'home';
    this.objects = [];
    this.selectedObjectId = null;
    this.modalMode = null;
    this.templatePage = 1;
    this.templateSearch = '';
    this.bind();
    this.bootstrap();
  }

  async bootstrap() {
    if (!localStorage.getItem('cm_token')) {
      await issueDemoToken('admin');
    }
    await this.loadObjects();
    this.renderProjectTree();
    this.renderContent();
  }

  bind() {
    document.querySelectorAll('.menu-item[data-view]').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.menu-item[data-view]').forEach(i => i.classList.remove('active'));
      btn.classList.add('active');
      this.currentView = btn.dataset.view;
      document.getElementById('pageTitle').textContent = btn.textContent;
      this.renderContent();
    }));
    document.getElementById('primaryBtn').addEventListener('click', () => this.handlePrimaryAction());
    document.getElementById('secondaryBtn').addEventListener('click', () => this.handleSecondaryAction());
    document.querySelectorAll('[data-close="true"]').forEach(el => el.addEventListener('click', () => this.closeModal()));
    document.getElementById('saveEntity').addEventListener('click', () => this.handleSaveModal());
  }

  async loadObjects(search = '', page = 1, pageSize = 20) {
    const query = new URLSearchParams({ search, page, page_size: pageSize }).toString();
    const payload = await api(`/objects?${query}`);
    this.objects = payload.data || [];
    if (!this.selectedObjectId && this.objects.length) this.selectedObjectId = this.objects[0].id;
    return payload.pagination;
  }

  renderProjectTree() {
    const tree = document.getElementById('projectTree');
    tree.innerHTML = this.objects.map(p => `<div class="tree-row" data-project="${p.id}">${p.name}</div>`).join('');
    tree.querySelectorAll('[data-project]').forEach(row => row.addEventListener('click', () => {
      this.selectedObjectId = row.dataset.project;
      this.renderContent();
    }));
  }

  configureHeader() {
    const primary = document.getElementById('primaryBtn');
    const secondary = document.getElementById('secondaryBtn');
    secondary.style.display = 'none';
    if (this.currentView === 'projects') {
      primary.textContent = '+ Добавить проект';
      secondary.style.display = 'inline-block';
      secondary.textContent = 'Обновить';
    } else if (this.currentView === 'tep') {
      primary.textContent = '+ Добавить строку ТЭП';
      secondary.style.display = 'inline-block';
      secondary.textContent = 'Экспорт Excel';
    }
  }

  async renderContent() {
    this.configureHeader();
    if (this.currentView === 'projects') return this.renderProjects();
    if (this.currentView === 'tep') return this.renderTemplate('tep', 'ТЭП');
    if (this.currentView === 'designSchedule') return this.renderTemplate('design_schedule', 'График проектирования');
    document.getElementById('contentArea').innerHTML = '<article class="card col-12">Выберите раздел.</article>';
  }

  async renderProjects() {
    const rows = this.objects.map(o => `<tr><td>${o.name}</td><td>${o.address || '—'}</td><td>${o.status || '—'}</td></tr>`).join('');
    document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>Проекты</h3><table class="table"><thead><tr><th>Наименование</th><th>Адрес</th><th>Статус</th></tr></thead><tbody>${rows}</tbody></table></article>`;
  }

  async renderTemplate(code, title) {
    const current = this.objects.find(o => o.id === this.selectedObjectId);
    if (!current) return document.getElementById('contentArea').innerHTML = '<article class="card col-12">Выберите проект.</article>';

    const [tpl, rowsPayload] = await Promise.all([
      getTemplate(code),
      listTemplateRows(current.id, code, { page: this.templatePage, page_size: 20, search: this.templateSearch })
    ]);
    this.currentTemplateCode = code;
    const columns = tpl.columns || [];
    const rows = rowsPayload.data || [];
    const pagination = rowsPayload.pagination || { page: 1, total: 0, page_size: 20 };

    const head = columns.map(c => `<th>${c.title}</th>`).join('');
    const body = rows.map(r => `<tr>${columns.map(c => `<td>${(r.data || {})[c.field_key] || ''}</td>`).join('')}<td><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-delete-row="${r.id}">Удал.</button></td></tr>`).join('');

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>${title} — ${current.name}</h3>
        <div class="row-actions" style="margin-bottom:8px;">
          <input id="templateSearch" placeholder="Поиск" value="${this.templateSearch}">
          <button class="mini" id="templateSearchBtn">Найти</button>
          <button class="mini" id="templatePrev">←</button>
          <span class="metric">Стр. ${pagination.page}, всего: ${pagination.total}</span>
          <button class="mini" id="templateNext">→</button>
        </div>
        <table class="table"><thead><tr>${head}<th>Действия</th></tr></thead><tbody>${body || `<tr><td colspan="${columns.length + 1}">Нет данных</td></tr>`}</tbody></table>
      </article>`;

    document.getElementById('templateSearchBtn').onclick = () => { this.templateSearch = document.getElementById('templateSearch').value.trim(); this.templatePage = 1; this.renderTemplate(code, title); };
    document.getElementById('templatePrev').onclick = () => { this.templatePage = Math.max(1, this.templatePage - 1); this.renderTemplate(code, title); };
    document.getElementById('templateNext').onclick = () => { if ((pagination.page * pagination.page_size) < pagination.total) this.templatePage += 1; this.renderTemplate(code, title); };
    document.querySelectorAll('[data-edit-row]').forEach(b => b.onclick = () => this.openTemplateRowModal(code, columns, rows.find(r => r.id === b.dataset.editRow)));
    document.querySelectorAll('[data-delete-row]').forEach(b => b.onclick = async () => { await deleteTemplateRow(b.dataset.deleteRow); this.renderTemplate(code, title); });
  }

  openTemplateRowModal(code, columns, row = null) {
    this.modalMode = row ? 'editTemplateRow' : 'createTemplateRow';
    document.getElementById('modalTitle').textContent = row ? 'Редактировать строку' : 'Добавить строку';
    document.getElementById('modalBody').innerHTML = `<div class="form-grid">${columns.map(c => `<label>${c.title}${c.required ? '*' : ''}<input data-field="${c.field_key}" type="${c.data_type === 'number' ? 'number' : c.data_type === 'date' ? 'date' : 'text'}" value="${(row?.data || {})[c.field_key] || ''}"></label>`).join('')}</div>`;
    const modal = document.getElementById('entityModal');
    modal.dataset.rowId = row?.id || '';
    modal.dataset.code = code;
    modal.classList.add('open');
  }

  async handleSaveModal() {
    if (this.modalMode !== 'createTemplateRow' && this.modalMode !== 'editTemplateRow') return;
    const data = {};
    document.querySelectorAll('[data-field]').forEach(i => { data[i.dataset.field] = i.value; });
    const modal = document.getElementById('entityModal');
    const rowId = modal.dataset.rowId;
    const code = modal.dataset.code;
    if (rowId) await updateTemplateRow(rowId, data);
    else await createTemplateRow(this.selectedObjectId, code, data);
    this.closeModal();
    this.renderTemplate(code, code === 'tep' ? 'ТЭП' : 'График проектирования');
  }

  handlePrimaryAction() {
    if (this.currentView === 'tep') return this.prepareModalForCurrentTemplate();
    if (this.currentView === 'designSchedule') return this.prepareModalForCurrentTemplate();
  }

  async prepareModalForCurrentTemplate() {
    const tpl = await getTemplate(this.currentTemplateCode || (this.currentView === 'tep' ? 'tep' : 'design_schedule'));
    this.openTemplateRowModal(tpl.template.code, tpl.columns, null);
  }

  handleSecondaryAction() {
    if (this.currentView === 'projects') return this.loadObjects().then(() => { this.renderProjectTree(); this.renderProjects(); });
    if (this.currentView === 'tep' || this.currentView === 'designSchedule') return exportTemplate(this.selectedObjectId, this.currentTemplateCode || (this.currentView === 'tep' ? 'tep' : 'design_schedule'));
  }

  closeModal() {
    document.getElementById('entityModal').classList.remove('open');
  }
}

window.addEventListener('DOMContentLoaded', () => new ConstructionManagerUI());
