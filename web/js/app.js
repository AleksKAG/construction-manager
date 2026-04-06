import { api, issueDemoToken } from './api.js';
import {
  listTemplates,
  getTemplate,
  listTemplateRows,
  createTemplateRow,
  updateTemplateRow,
  deleteTemplateRow,
  exportTemplate,
} from './templates.js';

class ConstructionManagerUI {
  constructor() {
    this.currentView = 'home';
    this.objects = [];
    this.selectedObjectId = null;
    this.modalMode = null;
    this.templatePage = 1;
    this.templateSearch = '';
    this.currentTemplateCode = null;
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
    document.querySelectorAll('.menu-item[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.menu-item[data-view]').forEach((i) => i.classList.remove('active'));
        btn.classList.add('active');
        this.currentView = btn.dataset.view;
        document.getElementById('pageTitle').textContent = btn.textContent;
        this.renderContent();
      });
    });

    const toggleSidebar = document.getElementById('toggleSidebar');
    if (toggleSidebar) {
      toggleSidebar.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
      });
    }

    document.getElementById('primaryBtn').addEventListener('click', () => this.handlePrimaryAction());
    document.getElementById('secondaryBtn').addEventListener('click', () => this.handleSecondaryAction());
    document.querySelectorAll('[data-close="true"]').forEach((el) => el.addEventListener('click', () => this.closeModal()));
    document.getElementById('saveEntity').addEventListener('click', () => this.handleSaveModal());

    const menuEditor = document.getElementById('menuEditor');
    if (menuEditor) {
      menuEditor.addEventListener('click', () => alert('Редактор меню будет доступен в следующих версиях.'));
    }
  }

  async loadObjects(search = '', page = 1, pageSize = 50) {
    const query = new URLSearchParams({ search, page, page_size: pageSize }).toString();
    const payload = await api(`/objects?${query}`);
    this.objects = payload.data || [];
    if (!this.selectedObjectId && this.objects.length) this.selectedObjectId = this.objects[0].id;
  }

  currentProject() {
    return this.objects.find((o) => String(o.id) === String(this.selectedObjectId));
  }

  renderProjectTree() {
    const tree = document.getElementById('projectTree');
    tree.innerHTML = this.objects
      .map((p) => `<div class="tree-row ${String(p.id) === String(this.selectedObjectId) ? 'active' : ''}" data-project="${p.id}">${p.name}</div>`)
      .join('');

    tree.querySelectorAll('[data-project]').forEach((row) => {
      row.addEventListener('click', () => {
        this.selectedObjectId = row.dataset.project;
        this.renderProjectTree();
        this.renderContent();
      });
    });
  }

  configureHeader() {
    const primary = document.getElementById('primaryBtn');
    const secondary = document.getElementById('secondaryBtn');
    secondary.style.display = 'none';

    if (this.currentView === 'home') {
      primary.textContent = '+ Добавить проект';
      secondary.style.display = 'inline-block';
      secondary.textContent = 'Обновить дашборд';
    } else if (this.currentView === 'tep') {
      primary.textContent = '+ Добавить ТЭП';
      secondary.style.display = 'inline-block';
      secondary.textContent = 'Экспорт в Excel (CSV)';
    } else if (this.currentView === 'designSchedule') {
      primary.textContent = '+ Добавить график';
      secondary.style.display = 'inline-block';
      secondary.textContent = 'Экспорт графика';
    } else if (this.currentView === 'projects') {
      primary.textContent = '+ Добавить проект';
      secondary.style.display = 'inline-block';
      secondary.textContent = 'Обновить список';
    } else {
      primary.textContent = 'Действие';
    }
  }

  async renderContent() {
    this.configureHeader();
    if (this.currentView === 'auth') return this.renderAuthModel();
    if (this.currentView === 'tep') return this.renderTemplateScreen('tep', 'Технико-экономические показатели');
    if (this.currentView === 'designSchedule') return this.renderTemplateScreen('design_schedule', 'График проектирования');
    if (this.currentView === 'projects') return this.renderProjects();
    return this.renderHome();
  }

  renderHome() {
    const p = this.currentProject();
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-4">
        <span class="tag">Проекты</span>
        <h3>${this.objects.length}</h3>
        <div class="metric">Всего объектов в системе</div>
      </article>
      <article class="card col-4">
        <span class="tag">Активный проект</span>
        <h3>${p?.name || 'Не выбран'}</h3>
        <div class="metric">${p?.address || 'Выберите проект в дереве слева'}</div>
      </article>
      <article class="card col-4">
        <span class="tag">Статус</span>
        <h3>${p?.status || '—'}</h3>
        <div class="metric">Текущий этап реализации</div>
      </article>
      <article class="card col-12">
        <h3>Быстрые действия</h3>
        <div class="row-actions">
          <button class="mini" id="quickAddProject">+ Добавить проект</button>
          <button class="mini" id="quickGoProjects">Открыть проекты</button>
          <button class="mini" id="quickGoDesign">График проектирования</button>
          <button class="mini" id="quickGoTep">ТЭП</button>
        </div>
      </article>`;

    document.getElementById('quickAddProject').onclick = () => this.openProjectForm();
    document.getElementById('quickGoProjects').onclick = () => this.switchView('projects', 'Проекты');
    document.getElementById('quickGoDesign').onclick = () => this.switchView('designSchedule', 'График проектирования');
    document.getElementById('quickGoTep').onclick = () => this.switchView('tep', 'ТЭП');
  }

  renderProjects() {
    document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>Проекты</h3><table class="table"><thead><tr><th>Наименование</th><th>Адрес</th><th>Статус</th></tr></thead><tbody>${this.objects
      .map((o) => `<tr><td>${o.name}</td><td>${o.address || '—'}</td><td>${o.status || '—'}</td></tr>`)
      .join('')}</tbody></table></article>`;
  }

  async renderTemplateScreen(defaultCode, title) {
    const project = this.currentProject();
    if (!project) {
      document.getElementById('contentArea').innerHTML = '<article class="card col-12">Выберите проект в дереве слева.</article>';
      return;
    }

    const code = this.currentTemplateCode || defaultCode;
    const [tpl, rowsPayload] = await Promise.all([
      getTemplate(code),
      listTemplateRows(project.id, code, { page: this.templatePage, page_size: 20, search: this.templateSearch }),
    ]);
    const columns = tpl.columns || [];
    const rows = rowsPayload.data || [];
    const pager = rowsPayload.pagination || { page: 1, total: 0, page_size: 20 };
    this.currentTemplateCode = code;

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>${title}: ${tpl.template.name}</h3>
        <div class="row-actions" style="margin-bottom:10px;align-items:center;">
          <input id="templateSearch" placeholder="Поиск по строкам" value="${this.templateSearch}">
          <button class="mini" id="templateSearchBtn">Найти</button>
          <button class="mini" id="pickTemplateBtn">Выбрать стандартный шаблон</button>
          <span class="metric">Стр. ${pager.page}, всего ${pager.total}</span>
          <button class="mini" id="prevPage">←</button>
          <button class="mini" id="nextPage">→</button>
        </div>
        <table class="table"><thead><tr>${columns.map((c) => `<th>${c.title}${c.required ? ' *' : ''}</th>`).join('')}<th>Действия</th></tr></thead>
        <tbody>${rows
          .map(
            (r) => `<tr>${columns.map((c) => `<td>${(r.data || {})[c.field_key] || ''}</td>`).join('')}<td><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button></td></tr>`,
          )
          .join('') || `<tr><td colspan="${columns.length + 1}">Нет данных</td></tr>`}</tbody></table>
      </article>`;

    document.getElementById('templateSearchBtn').onclick = () => {
      this.templateSearch = document.getElementById('templateSearch').value.trim();
      this.templatePage = 1;
      this.renderTemplateScreen(defaultCode, title);
    };
    document.getElementById('pickTemplateBtn').onclick = () => this.openTemplatePicker(defaultCode);
    document.getElementById('prevPage').onclick = () => {
      this.templatePage = Math.max(1, this.templatePage - 1);
      this.renderTemplateScreen(defaultCode, title);
    };
    document.getElementById('nextPage').onclick = () => {
      if (pager.page * pager.page_size < pager.total) this.templatePage += 1;
      this.renderTemplateScreen(defaultCode, title);
    };
    document.querySelectorAll('[data-edit-row]').forEach((btn) => {
      btn.onclick = () => this.openTemplateForm(tpl, rows.find((r) => String(r.id) === String(btn.dataset.editRow)));
    });
    document.querySelectorAll('[data-del-row]').forEach((btn) => {
      btn.onclick = async () => {
        await deleteTemplateRow(btn.dataset.delRow);
        this.renderTemplateScreen(defaultCode, title);
      };
    });
  }

  async openTemplatePicker(preferredCode) {
    const templates = await listTemplates();
    const filtered = templates.filter((t) =>
      preferredCode === 'tep'
        ? t.code.includes('tep') || t.code.includes('building') || t.code.includes('site')
        : t.code.includes('design'),
    );
    this.modalMode = 'selectTemplate';
    document.getElementById('modalTitle').textContent = 'Выбор стандартного шаблона';
    document.getElementById('modalBody').innerHTML = `<div class="form-grid">${(filtered.length ? filtered : templates)
      .map(
        (t) => `<label><input type="radio" name="template_code" value="${t.code}" ${t.code === this.currentTemplateCode ? 'checked' : ''}> ${t.name} <span class="metric">(${t.code})</span></label>`,
      )
      .join('')}</div>`;
    this.openModal();
  }

  openTemplateForm(templatePayload, row = null) {
    this.modalMode = row ? 'editRow' : 'createRow';
    document.getElementById('modalTitle').textContent = row
      ? `Редактировать: ${templatePayload.template.name}`
      : `Добавить: ${templatePayload.template.name}`;
    document.getElementById('modalBody').innerHTML = `<div class="form-grid">${templatePayload.columns
      .map((c) => {
        const value = (row?.data || {})[c.field_key] || '';
        const type = c.data_type === 'number' ? 'number' : c.data_type === 'date' ? 'date' : 'text';
        return `<label>${c.title}${c.required ? ' *' : ''}${c.unit ? ` (${c.unit})` : ''}<input data-field="${c.field_key}" type="${type}" value="${value}"></label>`;
      })
      .join('')}</div>`;
    const modal = document.getElementById('entityModal');
    modal.dataset.rowId = row?.id || '';
    this.openModal();
  }

  openProjectForm() {
    this.modalMode = 'createProject';
    document.getElementById('modalTitle').textContent = 'Добавить проект';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        <label>Наименование *<input data-project-field="name" type="text" placeholder="Например: Жилой квартал"></label>
        <label>Адрес<input data-project-field="address" type="text" placeholder="г. Москва, ..."></label>
        <label>Статус
          <select data-project-field="status">
            <option value="planning">planning</option>
            <option value="design">design</option>
            <option value="construction">construction</option>
            <option value="complete">complete</option>
          </select>
        </label>
      </div>`;
    this.openModal();
  }

  async handlePrimaryAction() {
    if (this.currentView === 'home' || this.currentView === 'projects') {
      return this.openProjectForm();
    }
    if (this.currentView === 'tep') {
      this.currentTemplateCode = this.currentTemplateCode || 'tep';
      const tpl = await getTemplate(this.currentTemplateCode);
      return this.openTemplateForm(tpl, null);
    }
    if (this.currentView === 'designSchedule') {
      this.currentTemplateCode = this.currentTemplateCode || 'design_schedule';
      const tpl = await getTemplate(this.currentTemplateCode);
      return this.openTemplateForm(tpl, null);
    }
  }

  async handleSecondaryAction() {
    if (this.currentView === 'home' || this.currentView === 'projects') {
      await this.loadObjects();
      this.renderProjectTree();
      return this.currentView === 'projects' ? this.renderProjects() : this.renderHome();
    }
    if (this.currentView === 'tep' || this.currentView === 'designSchedule') {
      const code = this.currentTemplateCode || (this.currentView === 'tep' ? 'tep' : 'design_schedule');
      return exportTemplate(this.selectedObjectId, code);
    }
  }

  async handleSaveModal() {
    const modal = document.getElementById('entityModal');

    if (this.modalMode === 'selectTemplate') {
      const selected = document.querySelector('input[name="template_code"]:checked');
      if (!selected) return alert('Выберите шаблон');
      this.currentTemplateCode = selected.value;
      this.closeModal();
      return this.renderContent();
    }

    if (this.modalMode === 'createProject') {
      const name = (document.querySelector('[data-project-field="name"]')?.value || '').trim();
      const address = (document.querySelector('[data-project-field="address"]')?.value || '').trim();
      const status = (document.querySelector('[data-project-field="status"]')?.value || 'planning').trim();
      if (!name) return alert('Введите наименование проекта');

      await api('/objects', 'POST', { name, address, status });
      await this.loadObjects();
      this.selectedObjectId = this.objects.length ? this.objects[this.objects.length - 1].id : null;
      this.closeModal();
      this.renderProjectTree();
      this.renderProjects();
      return;
    }

    if (this.modalMode !== 'createRow' && this.modalMode !== 'editRow') return;

    const data = {};
    document.querySelectorAll('[data-field]').forEach((input) => {
      data[input.dataset.field] = input.value;
    });

    const code = this.currentTemplateCode || (this.currentView === 'tep' ? 'tep' : 'design_schedule');
    if (modal.dataset.rowId) await updateTemplateRow(modal.dataset.rowId, data);
    else await createTemplateRow(this.selectedObjectId, code, data);

    this.closeModal();
    this.renderContent();
  }

  openModal() {
    document.getElementById('entityModal').classList.add('open');
  }

  closeModal() {
    document.getElementById('entityModal').classList.remove('open');
  }

  switchView(view, title) {
    this.currentView = view;
    document.getElementById('pageTitle').textContent = title;
    document.querySelectorAll('.menu-item[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    this.renderContent();
  }

  renderAuthModel() {
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Авторизация и роли</h3>
        <p class="metric">Раздел подключен. Права чтения/редактирования шаблонов применяются на API-уровне.</p>
      </article>`;
  }
}

window.addEventListener('DOMContentLoaded', () => new ConstructionManagerUI());
