import { api, issueDemoToken } from './api.js';
import { listTemplates, getTemplate, listTemplateRows, createTemplateRow, updateTemplateRow, deleteTemplateRow, exportTemplate } from './templates.js';

class ConstructionManagerUI {
  constructor() {
    this.currentView = 'home';
    this.objects = [];
    this.selectedObjectId = null;
    this.modalMode = null;
    this.templatePage = 1;
    this.templateSearch = '';
    this.currentTemplateCode = null;
    this.currentTemplateOwner = null;
    this.projectsMenuOpen = true;
    this.expandedProjects = new Set();
    this.projectMenus = {};
    this.bind();
    this.bootstrap();
  }

  async bootstrap() {
    if (!localStorage.getItem('cm_token')) await issueDemoToken('admin');
    await this.loadObjects();
    this.renderProjectTree();
    this.renderContent();
  }

  bind() {
    document.querySelectorAll('.menu-item[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view, btn.textContent));
    });

    document.getElementById('toggleSidebar')?.addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    document.getElementById('primaryBtn').addEventListener('click', () => this.handlePrimaryAction());
    document.getElementById('secondaryBtn').addEventListener('click', () => this.handleSecondaryAction());
    document.querySelectorAll('[data-close="true"]').forEach((el) => el.addEventListener('click', () => this.closeModal()));
    document.getElementById('saveEntity').addEventListener('click', () => this.handleSaveModal());
  }

  async loadObjects(search = '', page = 1, pageSize = 100) {
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
    const rows = this.projectsMenuOpen
      ? this.objects.map((p) => {
          const active = String(p.id) === String(this.selectedObjectId);
          const expanded = this.expandedProjects.has(String(p.id));
          return `<div class="tree-row ${active ? 'active' : ''}" data-project="${p.id}">${expanded ? '▼' : '▶'} ${p.name}</div>${expanded ? this.renderProjectSubmenu(p.id) : ''}`;
        }).join('')
      : '';

    tree.innerHTML = `<div class="tree-row" data-toggle-projects="true">${this.projectsMenuOpen ? '▼' : '▶'} Проекты</div>${rows}<div class="tree-row level-1" data-add-project="true">+ Добавить проект</div>`;

    tree.querySelector('[data-toggle-projects]')?.addEventListener('click', () => {
      this.projectsMenuOpen = !this.projectsMenuOpen;
      this.renderProjectTree();
    });

    tree.querySelectorAll('[data-project]').forEach((row) => {
      row.addEventListener('click', () => {
        const pid = row.dataset.project;
        this.selectedObjectId = pid;
        if (this.expandedProjects.has(pid)) this.expandedProjects.delete(pid);
        else this.expandedProjects.add(pid);
        this.renderProjectTree();
        this.renderContent();
      });
    });

    tree.querySelector('[data-add-project]')?.addEventListener('click', () => this.openProjectForm());
    tree.querySelectorAll('[data-view-link]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.switchView(item.dataset.viewLink, item.dataset.viewTitle);
      });
    });
  }

  renderProjectSubmenu(projectId) {
    const menu = this.projectMenus[projectId];
    if (!menu) {
      this.loadProjectMenu(projectId);
      return '<div class="tree-row level-1">Загрузка разделов...</div>';
    }
    const staticNodes = [
      { title: 'ТЭП', view_key: 'tep', children: [] },
      { title: 'Смета', view_key: 'estimate', children: [] },
    ];
    return this.renderMenuNodes([...(menu || []), ...staticNodes], 1);
  }

  renderMenuNodes(nodes, level = 1) {
    return (nodes || []).map((node) => {
      const attrs = node.view_key ? `data-view-link="${node.view_key}" data-view-title="${node.title}"` : '';
      const row = `<div class="tree-row level-${Math.min(level, 2)}" ${attrs}>${node.title}</div>`;
      return `${row}${this.renderMenuNodes(node.children || [], level + 1)}`;
    }).join('');
  }

  async loadProjectMenu(projectId) {
    try {
      const payload = await api(`/objects/${projectId}/menu`);
      this.projectMenus[projectId] = payload.data || [];
      this.renderProjectTree();
    } catch {
      this.projectMenus[projectId] = [];
      this.renderProjectTree();
    }
  }

  configureHeader() {
    const primary = document.getElementById('primaryBtn');
    const secondary = document.getElementById('secondaryBtn');
    secondary.style.display = 'none';

    const map = {
      home: { primary: '+ Добавить проект', secondary: 'Обновить дашборд' },
      projects: { primary: '+ Добавить проект', secondary: 'Обновить список' },
      designSchedule: { primary: '+ Добавить график', secondary: 'Экспорт графика' },
      tep: { primary: '+ Добавить ТЭП', secondary: 'Экспорт ТЭП' },
      estimate: { primary: '+ Добавить строку сметы', secondary: 'Экспорт сметы' },
      auth: { primary: 'Действие', secondary: '' },
    };

    const cfg = map[this.currentView] || map.home;
    primary.textContent = cfg.primary;
    if (cfg.secondary) {
      secondary.style.display = 'inline-block';
      secondary.textContent = cfg.secondary;
    }
  }

  async renderContent() {
    this.configureHeader();
    if (this.currentView === 'auth') return this.renderAuthModel();
    if (this.currentView === 'projects') return this.renderProjects();
    if (this.currentView === 'designSchedule') return this.renderTemplateScreen('design_schedule', 'График проектирования');
    if (this.currentView === 'tep') return this.renderTemplateScreen('tep', 'ТЭП');
    if (this.currentView === 'estimate') return this.renderTemplateScreen('summary_estimate', 'Сметная документация');
    return this.renderHome();
  }

  renderHome() {
    const total = this.objects.length;
    const inProgress = this.objects.filter((o) => ['planning', 'design', 'construction'].includes((o.status || '').toLowerCase())).length;
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-4"><span class="tag">Всего объектов</span><h3>${total}</h3></article>
      <article class="card col-4"><span class="tag">В работе</span><h3>${inProgress}</h3></article>
      <article class="card col-4"><span class="tag">Выбранный объект</span><h3>${this.currentProject()?.name || '—'}</h3></article>
      <article class="card col-12"><h3>Дашборд</h3><div class="metric">Главная страница агрегирует данные по всем объектам из БД.</div></article>`;
  }

  renderProjects() {
    document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>Проекты</h3><table class="table"><thead><tr><th>Наименование</th><th>Адрес</th><th>Статус</th></tr></thead><tbody>${this.objects.map((o) => `<tr><td>${o.name}</td><td>${o.address || '—'}</td><td>${o.status || '—'}</td></tr>`).join('')}</tbody></table></article>`;
  }

  async renderTemplateScreen(defaultCode, title) {
    const project = this.currentProject();
    if (!project) {
      document.getElementById('contentArea').innerHTML = '<article class="card col-12">Выберите проект в дереве слева.</article>';
      return;
    }

    if (this.currentTemplateOwner !== defaultCode) {
      this.currentTemplateOwner = defaultCode;
      this.currentTemplateCode = defaultCode;
      this.templatePage = 1;
      this.templateSearch = '';
    }

    const code = this.currentTemplateCode || defaultCode;
    const [tpl, rowsPayload] = await Promise.all([
      getTemplate(code),
      listTemplateRows(project.id, code, { page: this.templatePage, page_size: 20, search: this.templateSearch }),
    ]);

    const columns = tpl.columns || [];
    const rows = rowsPayload.data || [];
    const pager = rowsPayload.pagination || { page: 1, total: 0, page_size: 20 };

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>${title}: ${tpl.template.name}</h3>
        <div class="row-actions" style="margin-bottom:10px;align-items:center;">
          <input id="templateSearch" placeholder="Поиск" value="${this.templateSearch}">
          <button class="mini" id="templateSearchBtn">Найти</button>
          <button class="mini" id="pickTemplateBtn">Выбрать стандартный шаблон</button>
          ${defaultCode === 'design_schedule' ? '<button class="mini" id="fillStagePBtn">Шаблон стадии П</button><button class="mini" id="fillStageRBtn">Шаблон стадии Р</button>' : ''}
          <span class="metric">Стр. ${pager.page}, всего ${pager.total}</span>
          <button class="mini" id="prevPage">←</button>
          <button class="mini" id="nextPage">→</button>
        </div>
        <table class="table"><thead><tr>${columns.map((c) => `<th>${c.title}</th>`).join('')}<th>Действия</th></tr></thead>
        <tbody>${rows.map((r) => `<tr>${columns.map((c) => `<td>${(r.data || {})[c.field_key] || ''}</td>`).join('')}<td><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button></td></tr>`).join('') || `<tr><td colspan="${columns.length + 1}">Нет данных</td></tr>`}</tbody></table>
      </article>`;

    document.getElementById('templateSearchBtn').onclick = () => {
      this.templateSearch = document.getElementById('templateSearch').value.trim();
      this.templatePage = 1;
      this.renderTemplateScreen(defaultCode, title);
    };

    document.getElementById('pickTemplateBtn').onclick = () => this.openTemplatePicker(defaultCode);

    if (defaultCode === 'design_schedule') {
      document.getElementById('fillStagePBtn').onclick = async () => {
        await this.fillDesignTemplate('P');
        this.renderTemplateScreen(defaultCode, title);
      };
      document.getElementById('fillStageRBtn').onclick = async () => {
        await this.fillDesignTemplate('R');
        this.renderTemplateScreen(defaultCode, title);
      };
    }

    document.getElementById('prevPage').onclick = () => {
      this.templatePage = Math.max(1, this.templatePage - 1);
      this.renderTemplateScreen(defaultCode, title);
    };
    document.getElementById('nextPage').onclick = () => {
      if (pager.page * pager.page_size < pager.total) this.templatePage += 1;
      this.renderTemplateScreen(defaultCode, title);
    };

    document.querySelectorAll('[data-edit-row]').forEach((btn) => btn.onclick = () => this.openTemplateForm(tpl, rows.find((r) => String(r.id) === String(btn.dataset.editRow))));
    document.querySelectorAll('[data-del-row]').forEach((btn) => btn.onclick = async () => {
      await deleteTemplateRow(btn.dataset.delRow);
      this.renderTemplateScreen(defaultCode, title);
    });
  }

  async openTemplatePicker(defaultCode) {
    const templates = await listTemplates();
    const filtered = templates.filter((t) => {
      if (defaultCode === 'design_schedule') return t.code.includes('design');
      if (defaultCode === 'tep') return t.code.includes('tep') || t.code.includes('building');
      if (defaultCode === 'summary_estimate') return t.code.includes('estimate') || t.code.includes('ssr');
      return true;
    });

    this.modalMode = 'selectTemplate';
    document.getElementById('modalTitle').textContent = 'Выбор шаблона';
    document.getElementById('modalBody').innerHTML = `<div class="form-grid">${(filtered.length ? filtered : templates).map((t) => `<label><input type="radio" name="template_code" value="${t.code}" ${t.code === this.currentTemplateCode ? 'checked' : ''}> ${t.name}</label>`).join('')}</div>`;
    this.openModal();
  }

  openTemplateForm(templatePayload, row = null) {
    this.modalMode = row ? 'editRow' : 'createRow';
    document.getElementById('modalTitle').textContent = row ? `Редактировать: ${templatePayload.template.name}` : `Добавить: ${templatePayload.template.name}`;
    document.getElementById('modalBody').innerHTML = `<div class="form-grid">${templatePayload.columns.map((c) => {
      const value = (row?.data || {})[c.field_key] || '';
      const type = c.data_type === 'number' ? 'number' : c.data_type === 'date' ? 'date' : 'text';
      return `<label>${c.title}<input data-field="${c.field_key}" type="${type}" value="${value}"></label>`;
    }).join('')}</div>`;
    document.getElementById('entityModal').dataset.rowId = row?.id || '';
    this.openModal();
  }

  openProjectForm() {
    this.modalMode = 'createProject';
    document.getElementById('modalTitle').textContent = 'Добавить проект';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        <label>Наименование *<input data-project-field="name" type="text" placeholder="Наименование"></label>
        <label>Адрес<input data-project-field="address" type="text" placeholder="Адрес"></label>
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
    if (this.currentView === 'home' || this.currentView === 'projects') return this.openProjectForm();
    if (['tep', 'designSchedule', 'estimate'].includes(this.currentView)) {
      const fallback = this.currentView === 'tep' ? 'tep' : this.currentView === 'estimate' ? 'summary_estimate' : 'design_schedule';
      this.currentTemplateCode = this.currentTemplateCode || fallback;
      const tpl = await getTemplate(this.currentTemplateCode);
      return this.openTemplateForm(tpl, null);
    }
  }

  async handleSecondaryAction() {
    if (this.currentView === 'home' || this.currentView === 'projects') {
      await this.loadObjects();
      this.renderProjectTree();
      return this.renderContent();
    }
    if (['tep', 'designSchedule', 'estimate'].includes(this.currentView)) {
      const code = this.currentTemplateCode || (this.currentView === 'tep' ? 'tep' : this.currentView === 'estimate' ? 'summary_estimate' : 'design_schedule');
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
      this.selectedObjectId = this.objects.at(-1)?.id || null;
      this.closeModal();
      this.renderProjectTree();
      this.switchView('projects', 'Проекты');
      return;
    }

    if (this.modalMode !== 'createRow' && this.modalMode !== 'editRow') return;

    const data = {};
    document.querySelectorAll('[data-field]').forEach((input) => { data[input.dataset.field] = input.value; });
    const code = this.currentTemplateCode || (this.currentView === 'tep' ? 'tep' : this.currentView === 'estimate' ? 'summary_estimate' : 'design_schedule');
    if (modal.dataset.rowId) await updateTemplateRow(modal.dataset.rowId, data);
    else await createTemplateRow(this.selectedObjectId, code, data);

    this.closeModal();
    this.renderContent();
  }

  async fillDesignTemplate(stage) {
    const project = this.currentProject();
    if (!project) return;
    const rows = stage === 'P'
      ? [
          { volume_no: '1', code: 'ПЗ', name: 'Пояснительная записка', executor: 'ГИП', progress: '0' },
          { volume_no: '2', code: 'АР', name: 'Архитектурные решения', executor: 'Архитектор', progress: '0' },
          { volume_no: '3', code: 'КР', name: 'Конструктивные решения', executor: 'Конструктор', progress: '0' },
        ]
      : [
          { volume_no: '1', code: 'АР.Р', name: 'Рабочая документация АР', executor: 'Архитектор', progress: '0' },
          { volume_no: '2', code: 'КЖ.Р', name: 'Рабочая документация КЖ', executor: 'Конструктор', progress: '0' },
          { volume_no: '3', code: 'ОВ.Р', name: 'Рабочая документация ОВ', executor: 'Инженер ОВ', progress: '0' },
        ];
    for (const data of rows) {
      await createTemplateRow(project.id, 'design_schedule', data);
    }
  }

  switchView(view, title) {
    this.currentView = view;
    if (view === 'tep') this.currentTemplateOwner = 'tep';
    if (view === 'designSchedule') this.currentTemplateOwner = 'design_schedule';
    if (view === 'estimate') this.currentTemplateOwner = 'summary_estimate';

    document.getElementById('pageTitle').textContent = title;
    document.querySelectorAll('.menu-item[data-view]').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
    this.renderContent();
  }

  renderAuthModel() {
    document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>Авторизация и роли</h3><p class="metric">Права доступа применяются в API и БД.</p></article>`;
  }

  openModal() { document.getElementById('entityModal').classList.add('open'); }
  closeModal() { document.getElementById('entityModal').classList.remove('open'); }
}

window.addEventListener('DOMContentLoaded', () => new ConstructionManagerUI());
