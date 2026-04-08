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

const DEFAULT_TEP_ROWS = [
  { num: '', indicator: 'Характеристика земельного участка', unit: '', amount: '' },
  { num: '1', indicator: 'Общая площадь земельного участка', unit: 'м2', amount: '' },
  { num: '2', indicator: 'Площадь участка в границах проектирования', unit: 'м2', amount: '' },
  { num: '3', indicator: 'Площадь застройки', unit: 'м2', amount: '' },
  { num: '4', indicator: 'Площадь озеленения', unit: 'м2', amount: '' },
  { num: '5', indicator: 'Площадь покрытий', unit: 'м2', amount: '' },
  { num: '', indicator: 'Характеристики зданий, строений, сооружений', unit: '', amount: '' },
  { num: '6', indicator: 'Строительный объем', unit: 'м3', amount: '' },
  { num: '7', indicator: 'Общая площадь здания', unit: 'м2', amount: '' },
  { num: '8', indicator: 'Высота этажа (в чистоте)', unit: 'м', amount: '' },
  { num: '9', indicator: 'Количество этажей', unit: '', amount: '' },
  { num: '', indicator: 'Потребность объекта капитального строительства в топливе, газе, воде и электрической энергии', unit: '', amount: '' },
  { num: '10', indicator: 'Холодное водоснабжение', unit: 'м3/сут', amount: '' },
  { num: '11', indicator: 'Горячее водоснабжение', unit: 'м3/сут', amount: '' },
  { num: '12', indicator: 'Водоотведение хозяйственно-бытовых сточных вод', unit: 'м3/сут', amount: '' },
  { num: '13', indicator: 'Расход тепла', unit: 'кВт', amount: '' },
  { num: '14', indicator: 'в т.ч. - отопление, вентиляцию', unit: 'кВт', amount: '' },
  { num: '15', indicator: 'ГВС', unit: 'кВт', amount: '' },
  { num: '16', indicator: 'Установленная мощность', unit: 'кВт', amount: '' },
  { num: '17', indicator: 'Расчетная мощность', unit: 'кВт', amount: '' },
];

class ConstructionManagerUI {
  constructor() {
    this.currentView = 'home';
    this.objects = [];
    this.selectedObjectId = null;
    this.modalMode = null;
    this.currentTemplateCode = null;
    this.currentTemplateName = null;
    this.templatePage = 1;
    this.templateSearch = '';
    this.editRowId = null;
    this.projectsMenuOpen = true;
    this.expandedProjects = new Set();
    this.expandedMenuNodes = new Set();
    this.projectMenus = {};

    this.bind();
    this.bootstrap();
  }

  async bootstrap() {
    if (!localStorage.getItem('cm_token')) await issueDemoToken('admin');
    await this.loadObjects();
    this.renderProjectTree();
    await this.renderContent();
  }

  bind() {
    document.querySelectorAll('.menu-item[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view, btn.textContent.trim()));
    });

    document.getElementById('primaryBtn')?.addEventListener('click', () => this.handlePrimaryAction());
    document.getElementById('secondaryBtn')?.addEventListener('click', () => this.handleSecondaryAction());
    document.getElementById('saveEntity')?.addEventListener('click', () => this.handleSaveModal());
    document.querySelectorAll('[data-close="true"]').forEach((el) => el.addEventListener('click', () => this.closeModal()));

    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', () => {
        document.getElementById('sidebar').classList.add('active');
      });
    }

    // Sidebar close button
    const sidebarClose = document.getElementById('sidebarClose');
    if (sidebarClose) {
      sidebarClose.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('active');
      });
    }
  }

  async loadObjects() {
    const payload = await api('/objects?page=1&page_size=200');
    this.objects = Array.isArray(payload) ? payload : (payload?.data || []);
    if (!this.selectedObjectId && this.objects.length) this.selectedObjectId = this.objects[0].id;
  }

  currentProject() {
    return this.objects.find((o) => String(o.id) === String(this.selectedObjectId));
  }

  normalizeTemplateColumnTitle(code, column) {
    if (code !== 'tep') return column.title;
    const titles = {
      num: '№ п/п',
      indicator: 'Наименование',
      unit: 'Ед. изм.',
      amount: 'Количество',
    };
    return titles[column.field_key] || column.title;
  }

  async ensureDefaultTemplateRows(projectId, code, rowsPayload) {
    const rows = rowsPayload.data || [];
    if (code !== 'tep' || rows.length > 0 || this.templateSearch) return rowsPayload;
    for (let i = 0; i < DEFAULT_TEP_ROWS.length; i += 1) {
      await createTemplateRow(projectId, code, DEFAULT_TEP_ROWS[i]);
    }
    return listTemplateRows(projectId, code, { page: this.templatePage, page_size: 20, search: this.templateSearch });
  }

  async loadProjectMenu(projectId) {
    if (this.projectMenus[projectId]) return;
    try {
      const payload = await api(`/objects/${projectId}/menu`);
      this.projectMenus[projectId] = payload.data || [];
    } catch {
      this.projectMenus[projectId] = [];
    }
  }

  renderProjectTree() {
    const tree = document.getElementById('projectTree');
    if (!tree) return;

    const projectRows = this.projectsMenuOpen
      ? this.objects
          .map((project) => {
            const id = String(project.id);
            const active = String(this.selectedObjectId) === id;
            const expanded = this.expandedProjects.has(id);
            const submenu = expanded ? this.renderProjectSubmenu(project.id) : '';
            return `<div class="tree-row ${active ? 'active' : ''}" data-project="${project.id}">${expanded ? '▼' : '▶'} ${project.name}</div>${submenu}`;
          })
          .join('')
      : '';

    tree.innerHTML = `
      <div class="tree-row" data-toggle-projects="true">${this.projectsMenuOpen ? '▼' : '▶'} Проекты</div>
      ${projectRows}
      <div class="tree-row level-1" data-add-project="true">+ Добавить проект</div>
    `;

    tree.querySelector('[data-toggle-projects]')?.addEventListener('click', () => {
      this.projectsMenuOpen = !this.projectsMenuOpen;
      this.renderProjectTree();
    });

    tree.querySelectorAll('[data-project]').forEach((row) => {
      row.addEventListener('click', async () => {
        const pid = String(row.dataset.project);
        this.selectedObjectId = pid;
        // Close all other expanded projects and only expand the selected one
        this.expandedProjects.clear();
        this.expandedProjects.add(pid);
        await this.loadProjectMenu(pid);
        this.renderProjectTree();
        this.renderContent();
      });
    });

    tree.querySelectorAll('[data-add-project]')?.addEventListener('click', () => this.openProjectForm());
    tree.querySelectorAll('[data-edit-project]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const pid = item.dataset.editProject;
        const project = this.objects.find((o) => String(o.id) === String(pid));
        if (project) this.openProjectForm(project);
      });
    });
    tree.querySelectorAll('[data-view-link]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const rawView = item.dataset.viewLink;
        const view = this.isKnownView(rawView) ? rawView : `template:${rawView}`;
        this.switchView(view, item.dataset.viewTitle);
      });
    });

    tree.querySelectorAll('[data-menu-toggle]').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const key = item.dataset.menuToggle;
        if (!key) return;
        // Clear all expanded menu nodes for other projects and toggle only the clicked one
        const projectId = key.split(':')[0];
        this.expandedMenuNodes.clear();
        if (!this.expandedMenuNodes.has(key)) {
          this.expandedMenuNodes.add(key);
        }
        this.renderProjectTree();
      });
    });
  }

  renderProjectSubmenu(projectId) {
    const menu = this.projectMenus[projectId] || [];
    const project = this.objects.find((o) => String(o.id) === String(projectId));
    const editBtn = project
      ? `<div class="tree-row level-1" data-edit-project="${projectId}" style="color:#7eb4ff;">✏️ Редактировать проект</div>`
      : '';
    return `${editBtn}${this.renderMenuNodes(projectId, menu || [], 1)}`;
  }

  renderMenuNodes(projectId, nodes, level = 1) {
    return (nodes || [])
      .map((node) => {
        const nodeKey = `${projectId}:${node.id}`;
        const hasChildren = Array.isArray(node.children) && node.children.length > 0;
        const expanded = hasChildren && this.expandedMenuNodes.has(nodeKey);
        const marker = hasChildren ? (expanded ? '▼ ' : '▶ ') : '';
        const attrs = node.view_key ? `data-view-link="${node.view_key}" data-view-title="${node.title}"` : '';
        const toggleAttrs = hasChildren ? `data-menu-toggle="${nodeKey}"` : '';
        const row = `<div class="tree-row level-${Math.min(level, 4)}" ${attrs} ${toggleAttrs}>${marker}${node.title}</div>`;
        const children = expanded ? this.renderMenuNodes(projectId, node.children || [], level + 1) : '';
        return `${row}${children}`;
      })
      .join('');
  }

  configureHeader() {
    const primary = document.getElementById('primaryBtn');
    const secondary = document.getElementById('secondaryBtn');
    if (!primary || !secondary) return;

    secondary.style.display = 'none';

    const map = {
      home: { primary: '+ Добавить проект', secondary: 'Обновить дашборд' },
      projects: { primary: '+ Добавить проект', secondary: 'Обновить список' },
      designSchedule: { primary: '+ Добавить этап ПД', secondary: 'Экспорт в CSV' },
      tep: { primary: '+ Добавить строку', secondary: 'Экспорт в CSV' },
      estimate: { primary: '+ Добавить строку', secondary: 'Экспорт в CSV' },
      auth: { primary: 'Выдать demo token', secondary: '' },
    };

    const cfg = this.isTemplateView(this.currentView) && this.currentView !== 'designSchedule'
      ? { primary: '+ Добавить строку', secondary: 'Экспорт в CSV' }
      : (map[this.currentView] || map.home);
    primary.textContent = cfg.primary;
    if (cfg.secondary) {
      secondary.style.display = 'inline-block';
      secondary.textContent = cfg.secondary;
    }
  }

  async renderContent() {
    this.configureHeader();

    if (this.currentView === 'projects') return this.renderProjects();
    if (this.currentView === 'designSchedule') return this.renderDesignScheduleScreen();
    if (this.currentView === 'tep') return this.renderTemplateScreen('tep', 'ТЭП');
    if (this.currentView === 'estimate') return this.renderTemplateScreen('summary_estimate', 'Сметная документация');
    if (this.currentView === 'auth') return this.renderAuthView();
    if (this.isTemplateView(this.currentView)) {
      const { code, title } = this.resolveTemplateView(this.currentView);
      return this.renderTemplateScreen(code, title);
    }

    return this.renderHome();
  }

  renderHome() {
    const total = this.objects.length;
    const inProgress = this.objects.filter((o) => ['planning', 'design', 'construction'].includes((o.status || '').toLowerCase())).length;
    const selected = this.currentProject();

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-4"><span class="tag">Всего проектов</span><h3>${total}</h3></article>
      <article class="card col-4"><span class="tag">В работе</span><h3>${inProgress}</h3></article>
      <article class="card col-4"><span class="tag">Выбранный проект</span><h3>${selected?.name || '—'}</h3></article>
      <article class="card col-12">
        <h3>Дашборд</h3>
        <div class="metric">Данные агрегируются из API и демонстрационных записей в БД.</div>
        <div class="notice">Выберите проект слева и откройте нужный раздел в дереве проекта, чтобы заполнить таблицы и сделать экспорт.</div>
      </article>
    `;
  }

  renderProjects() {
    const rows = this.objects
      .map((o) => `<tr><td>${o.name}</td><td>${o.address || '—'}</td><td>${o.status || '—'}</td></tr>`)
      .join('') || '<tr><td colspan="3">Нет проектов</td></tr>';

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Проекты</h3>
        <table class="table">
          <thead><tr><th>Наименование</th><th>Адрес</th><th>Статус</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </article>
    `;
  }

  async renderTemplateScreen(defaultCode, title) {
    const project = this.currentProject();
    if (!project) {
      document.getElementById('contentArea').innerHTML = '<article class="card col-12"><h3>Нет проектов</h3><p>Добавьте проект, чтобы работать с таблицами.</p></article>';
      return;
    }

    const code = this.currentTemplateCode || defaultCode;
    let tpl;
    let rowsPayload;

    try {
      [tpl, rowsPayload] = await Promise.all([
        getTemplate(code),
        listTemplateRows(project.id, code, { page: this.templatePage, page_size: 20, search: this.templateSearch }),
      ]);
    } catch (error) {
      document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>${title}</h3><p>${error.message}</p></article>`;
      return;
    }

    const columns = tpl.columns || [];
    rowsPayload = await this.ensureDefaultTemplateRows(project.id, code, rowsPayload);
    const rows = rowsPayload.data || [];
    const pager = rowsPayload.pagination || { page: 1, total: rows.length, page_size: 20 };

    this.currentTemplateCode = code;
    this.currentTemplateName = tpl.template?.name || title;

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>${title}: ${this.currentTemplateName}</h3>
        <div class="row-actions" style="margin-bottom:10px;align-items:center;flex-wrap:wrap;">
          <input id="templateSearch" placeholder="Поиск" value="${this.templateSearch}">
          <button class="mini" id="templateSearchBtn">Найти</button>
          <span class="metric">Стр. ${pager.page}, всего ${pager.total}</span>
          <button class="mini" id="prevPage">←</button>
          <button class="mini" id="nextPage">→</button>
        </div>
        <table class="table">
          <thead><tr>${columns.map((c) => `<th>${this.normalizeTemplateColumnTitle(code, c)}</th>`).join('')}<th>Действия</th></tr></thead>
          <tbody>
            ${rows.map((r) => `<tr>${columns.map((c) => `<td>${(r.data || {})[c.field_key] ?? ''}</td>`).join('')}<td><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button></td></tr>`).join('') || `<tr><td colspan="${columns.length + 1}">Нет данных</td></tr>`}
          </tbody>
        </table>
      </article>
    `;

    document.getElementById('templateSearchBtn').onclick = () => {
      this.templateSearch = document.getElementById('templateSearch').value.trim();
      this.templatePage = 1;
      this.renderTemplateScreen(defaultCode, title);
    };

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
        await this.renderTemplateScreen(defaultCode, title);
      };
    });
  }

  async openTemplatePicker(defaultCode = '') {
    const templates = await listTemplates();
    const filtered = templates.filter((t) => {
      if (defaultCode === 'design_schedule') return t.code.includes('design');
      if (defaultCode === 'tep') return t.code.includes('tep') || t.code.includes('building');
      if (defaultCode === 'summary_estimate') return t.code.includes('estimate') || t.code.includes('ssr');
      return true;
    });

    this.modalMode = 'selectTemplate';
    document.getElementById('modalTitle').textContent = 'Выбор шаблона';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        ${(filtered.length ? filtered : templates)
          .map((t) => `<label><input type="radio" name="template_code" value="${t.code}" ${t.code === this.currentTemplateCode ? 'checked' : ''}> ${t.name}</label>`)
          .join('')}
      </div>
    `;
    this.openModal();
  }

  openTemplateForm(templatePayload, row = null) {
    this.modalMode = row ? 'editRow' : 'createRow';
    this.editRowId = row?.id || null;

    document.getElementById('modalTitle').textContent = row
      ? `Редактировать: ${templatePayload.template.name}`
      : `Добавить: ${templatePayload.template.name}`;

    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        ${templatePayload.columns
          .map((c) => {
            const value = (row?.data || {})[c.field_key] || '';
            const type = c.data_type === 'number' ? 'number' : c.data_type === 'date' ? 'date' : 'text';
            return `<label>${c.title}<input data-field="${c.field_key}" type="${type}" value="${value}"></label>`;
          })
          .join('')}
      </div>
    `;
    this.openModal();
  }

  openProjectForm(project = null) {
    this.modalMode = project ? 'editProject' : 'createProject';
    document.getElementById('modalTitle').textContent = project ? 'Редактировать проект' : 'Добавить проект';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        <label>Наименование *<input data-project-field="name" type="text" placeholder="Наименование" value="${project?.name || ''}"></label>
        <label>Адрес<input data-project-field="address" type="text" placeholder="Адрес" value="${project?.address || ''}"></label>
        <label>Статус
          <select data-project-field="status">
            <option value="planning" ${project?.status === 'planning' ? 'selected' : ''}>planning</option>
            <option value="design" ${project?.status === 'design' ? 'selected' : ''}>design</option>
            <option value="construction" ${project?.status === 'construction' ? 'selected' : ''}>construction</option>
            <option value="complete" ${project?.status === 'complete' ? 'selected' : ''}>complete</option>
          </select>
        </label>
      </div>
    `;
    this.openModal();
  }

  async handlePrimaryAction() {
    if (this.currentView === 'home' || this.currentView === 'projects') return this.openProjectForm();
    if (this.currentView === 'auth') {
      await issueDemoToken('admin');
      return alert('Demo token обновлён.');
    }
    if (this.currentView === 'designSchedule') {
      this.currentTemplateCode = 'design_schedule';
      const tpl = await getTemplate(this.currentTemplateCode);
      return this.openTemplateForm(tpl, null);
    }
    if (this.isTemplateView(this.currentView)) {
      const fallback = this.resolveTemplateView(this.currentView).code;
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
    if (this.currentView === 'designSchedule') {
      return exportTemplate(this.selectedObjectId, 'design_schedule');
    }
    if (this.isTemplateView(this.currentView)) {
      const code = this.currentTemplateCode || this.resolveTemplateView(this.currentView).code;
      return exportTemplate(this.selectedObjectId, code);
    }
  }

  async handleSaveModal() {
    if (this.modalMode === 'createProject') {
      const name = (document.querySelector('[data-project-field="name"]')?.value || '').trim();
      const address = (document.querySelector('[data-project-field="address"]')?.value || '').trim();
      const status = (document.querySelector('[data-project-field="status"]')?.value || 'planning').trim();
      if (!name) return alert('Введите наименование проекта');

      await api('/objects', 'POST', { name, address, status });
      await this.loadObjects();
      this.selectedObjectId = this.objects.at(-1)?.id || this.selectedObjectId;
      this.closeModal();
      this.renderProjectTree();
      this.switchView('projects', 'Проекты');
      return;
    }

    if (this.modalMode === 'editProject') {
      const name = (document.querySelector('[data-project-field="name"]')?.value || '').trim();
      const address = (document.querySelector('[data-project-field="address"]')?.value || '').trim();
      const status = (document.querySelector('[data-project-field="status"]')?.value || 'planning').trim();
      if (!name) return alert('Введите наименование проекта');

      await api(`/objects/${this.selectedObjectId}`, 'PUT', { name, address, status });
      await this.loadObjects();
      this.closeModal();
      this.renderProjectTree();
      this.renderContent();
      return;
    }

    if (this.modalMode === 'selectTemplate') {
      const selected = document.querySelector('input[name="template_code"]:checked')?.value;
      if (!selected) return alert('Выберите шаблон');
      this.currentTemplateCode = selected;
      this.templatePage = 1;
      this.closeModal();
      if (!this.isTemplateView(this.currentView)) {
        this.switchView(`template:${selected}`, `Таблица: ${selected}`);
        return;
      }
      return this.renderContent();
    }

    if (this.modalMode === 'createRow' || this.modalMode === 'editRow') {
      try {
        const data = {};
        document.querySelectorAll('[data-field]').forEach((input) => {
          data[input.dataset.field] = input.value;
        });
        const code = this.currentTemplateCode || this.resolveTemplateView(this.currentView).code;
        if (this.editRowId) await updateTemplateRow(this.editRowId, data);
        else await createTemplateRow(this.selectedObjectId, code, data);
        this.closeModal();
        return this.renderContent();
      } catch (error) {
        alert(error?.message || 'Не удалось сохранить строку');
      }
    }
  }

  switchView(view, title) {
    this.currentView = view;
    this.currentTemplateCode = null;
    this.currentTemplateName = null;
    this.templatePage = 1;
    this.templateSearch = '';

    document.getElementById('pageTitle').textContent = title;
    document.querySelectorAll('.menu-item[data-view]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    this.renderContent();
  }

  renderAuthView() {
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Авторизация и роли</h3>
        <p class="metric">Приложение использует demo JWT-токен для работы вкладок шаблонов.</p>
        <div class="notice">Если вкладки таблиц не открываются, нажмите «Выдать demo token» в правом верхнем углу и обновите страницу.</div>
      </article>
    `;
  }

  async renderDesignScheduleScreen() {
    const project = this.currentProject();
    if (!project) {
      document.getElementById('contentArea').innerHTML = '<article class="card col-12"><h3>Нет проектов</h3><p>Добавьте проект, чтобы работать с графиками.</p></article>';
      return;
    }

    let pdRowsPayload, rdRowsPayload;
    try {
      [pdRowsPayload, rdRowsPayload] = await Promise.all([
        listTemplateRows(project.id, 'design_schedule', { page: 1, page_size: 100 }),
        listTemplateRows(project.id, 'working_docs_schedule', { page: 1, page_size: 100 }),
      ]);
    } catch (error) {
      document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>График проектирования</h3><p>${error.message}</p></article>`;
      return;
    }

    const pdRows = pdRowsPayload.data || [];
    const rdRows = rdRowsPayload.data || [];

    const calcProgress = (rows) => {
      if (!rows.length) return 0;
      const withProgress = rows.filter((r) => r.data?.progress !== undefined && r.data?.progress !== '');
      if (!withProgress.length) return 0;
      const sum = withProgress.reduce((acc, r) => acc + (parseFloat(r.data.progress) || 0), 0);
      return Math.round(sum / withProgress.length);
    };

    const pdProgress = calcProgress(pdRows);
    const rdProgress = calcProgress(rdRows);

    const renderDashboard = (title, code, rows, progress, defaultCode) => {
      const statusColor = progress >= 100 ? '#08a66c' : progress >= 50 ? '#2663ff' : '#d48806';
      return `
        <article class="card col-6" data-dashboard="${code}" style="cursor:pointer;">
          <span class="tag">${title}</span>
          <div class="kpi"><span>Выполнение</span><strong style="color:${statusColor}">${progress}%</strong></div>
          <div class="progress"><span style="width:${progress}%;background:${statusColor}"></span></div>
          <p class="metric">Всего этапов: ${rows.length}</p>
        </article>
      `;
    };

    const renderTable = (title, rows, columns) => {
      if (!columns.length) return '';
      return `
        <article class="card col-12" style="margin-top:14px;">
          <h4>${title}</h4>
          <table class="table">
            <thead><tr>${columns.map((c) => `<th>${c.title}</th>`).join('')}<th>Действия</th></tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>${columns.map((c) => `<td>${(r.data || {})[c.field_key] ?? ''}</td>`).join('')}<td><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button></td></tr>`).join('') || `<tr><td colspan="${columns.length + 1}">Нет данных</td></tr>`}
            </tbody>
          </table>
        </article>
      `;
    };

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>График проектирования</h3>
        <p class="metric">Нажмите на дашборд, чтобы просмотреть подробную таблицу</p>
        <div class="grid" style="margin-top:14px;">
          ${renderDashboard('Проектная документация', 'design_schedule', pdRows, pdProgress)}
          ${renderDashboard('Рабочая документация', 'working_docs_schedule', rdRows, rdProgress)}
        </div>
        <div id="dashboardDetails" class="grid"></div>
      </article>
    `;

    document.querySelectorAll('[data-dashboard]').forEach((card) => {
      card.addEventListener('click', async () => {
        const code = card.dataset.dashboard;
        const title = code === 'design_schedule' ? 'Проектная документация' : 'Рабочая документация';
        const isPD = code === 'design_schedule';
        const currentRows = isPD ? pdRows : rdRows;

        let tpl;
        try {
          tpl = await getTemplate(code);
        } catch (error) {
          document.getElementById('dashboardDetails').innerHTML = `<article class="card col-12"><p>${error.message}</p></article>`;
          return;
        }

        const columns = tpl.columns || [];
        const tableHTML = renderTable(title, currentRows, columns);
        document.getElementById('dashboardDetails').innerHTML = tableHTML;

        document.querySelectorAll('#dashboardDetails [data-edit-row]').forEach((btn) => {
          btn.onclick = () => this.openTemplateForm(tpl, currentRows.find((r) => String(r.id) === String(btn.dataset.editRow)));
        });

        document.querySelectorAll('#dashboardDetails [data-del-row]').forEach((btn) => {
          btn.onclick = async () => {
            await deleteTemplateRow(btn.dataset.delRow);
            this.renderDesignScheduleScreen();
          };
        });

        document.querySelectorAll('[data-dashboard]').forEach((c) => c.style.border = '1px solid var(--line)');
        card.style.border = '2px solid var(--primary)';
      });
    });
  }

  openModal() {
    document.getElementById('entityModal').classList.add('open');
  }

  closeModal() {
    document.getElementById('entityModal').classList.remove('open');
    this.modalMode = null;
    this.editRowId = null;
  }

  isTemplateView(view) {
    return ['tep', 'designSchedule', 'estimate'].includes(view) || String(view || '').startsWith('template:');
  }

  isKnownView(view) {
    return ['home', 'projects', 'auth', 'tep', 'designSchedule', 'estimate'].includes(view);
  }

  resolveTemplateView(view) {
    if (view === 'tep') return { code: 'tep', title: 'ТЭП' };
    if (view === 'designSchedule') return { code: 'design_schedule', title: 'График проектирования' };
    if (view === 'estimate') return { code: 'summary_estimate', title: 'Сметная документация' };
    if (String(view || '').startsWith('template:')) {
      const code = String(view).replace('template:', '') || 'tep';
      return { code, title: `Таблица: ${code}` };
    }
    return { code: 'tep', title: 'ТЭП' };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.ui = new ConstructionManagerUI();
});
