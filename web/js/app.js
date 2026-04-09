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
    this.state = {
      sidebarOpen: JSON.parse(localStorage.getItem('cm_sidebar_open') || 'true'),
      isDesktop: window.matchMedia('(min-width: 1024px)').matches,
      dashboards: JSON.parse(localStorage.getItem('cm_dashboards') || '[]'),
      dashboardRefreshSeconds: Number(localStorage.getItem('cm_dashboard_refresh_sec') || 60),
      projectRefreshSeconds: 120,
      dashboardRefreshing: false,
      projectsRefreshing: false,
      modalDirty: false,
      editProjectId: null,
      projectFormSnapshot: '',
    };

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
    this.dashboardTimer = null;
    this.projectsTimer = null;
    this.touchStartX = null;
    this.dashboardMetrics = {};
    this.templateEditMode = false;
    this.templateRowsCache = [];

    this.bind();
    this.setupResponsiveSidebar();
    this.bootstrap();
  }

  async bootstrap() {
    if (!localStorage.getItem('cm_token')) await issueDemoToken('admin');
    await this.loadObjects();
    if (!this.state.dashboards.length) this.seedDashboards();
    this.renderProjectTree();
    this.applySidebarState();
    this.bindConnectivity();
    this.setupAutoRefresh();
    await this.renderContent();
  }

  bind() {
    document.querySelectorAll('.menu-item[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => this.switchView(btn.dataset.view, btn.textContent.trim()));
    });

    document.getElementById('primaryBtn')?.addEventListener('click', () => this.handlePrimaryAction());
    document.getElementById('secondaryBtn')?.addEventListener('click', () => this.handleSecondaryAction());
    document.getElementById('saveEntity')?.addEventListener('click', () => this.handleSaveModal());
    document.querySelectorAll('[data-close="true"]').forEach((el) => el.addEventListener('click', () => this.handleModalCancel()));

    document.getElementById('mobileMenuBtn')?.addEventListener('click', () => this.toggleSidebar(true));
    document.getElementById('sidebarCloseBtn')?.addEventListener('click', () => this.toggleSidebar(false));
    document.getElementById('sidebarBackdrop')?.addEventListener('click', () => this.toggleSidebar(false));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.toggleSidebar(false);
        if (this.modalMode) this.handleModalCancel();
      }
    });

    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.addEventListener('touchstart', (e) => {
        this.touchStartX = e.changedTouches?.[0]?.clientX ?? null;
      }, { passive: true });
      sidebar.addEventListener('touchend', (e) => {
        const endX = e.changedTouches?.[0]?.clientX;
        if (this.touchStartX != null && endX != null && this.touchStartX - endX > 70 && !this.state.isDesktop) {
          this.toggleSidebar(false);
        }
      }, { passive: true });
    }
  }

  setupResponsiveSidebar() {
    const media = window.matchMedia('(min-width: 1024px)');
    const handler = (ev) => {
      this.state.isDesktop = ev.matches;
      this.applySidebarState();
    };
    if (media.addEventListener) media.addEventListener('change', handler);
    else media.addListener(handler);
  }

  toggleSidebar(open) {
    this.state.sidebarOpen = open;
    localStorage.setItem('cm_sidebar_open', JSON.stringify(open));
    this.applySidebarState();
  }

  applySidebarState() {
    const layout = document.getElementById('appLayout');
    if (!layout) return;
    layout.classList.toggle('sidebar-mobile-open', !this.state.isDesktop && this.state.sidebarOpen);
  }

  bindConnectivity() {
    const rerender = () => {
      if (this.currentView === 'home') this.renderHome();
    };
    window.addEventListener('online', rerender);
    window.addEventListener('offline', rerender);
  }

  setupAutoRefresh() {
    clearInterval(this.dashboardTimer);
    clearInterval(this.projectsTimer);

    this.dashboardTimer = setInterval(async () => {
      if (this.currentView !== 'home') return;
      this.state.dashboardRefreshing = true;
      this.renderHome();
      await this.loadObjects();
      this.state.dashboardRefreshing = false;
      this.renderHome();
    }, this.state.dashboardRefreshSeconds * 1000);

    this.projectsTimer = setInterval(async () => {
      if (this.currentView !== 'projects') return;
      this.state.projectsRefreshing = true;
      this.renderProjects();
      await this.loadObjects();
      this.state.projectsRefreshing = false;
      this.renderProjects();
    }, this.state.projectRefreshSeconds * 1000);
  }

  seedDashboards() {
    this.state.dashboards = this.objects.slice(0, 3).map((o, i) => ({
      id: crypto.randomUUID(),
      projectId: o.id,
      projectName: o.name,
      type: i === 0 ? 'basic' : i === 1 ? 'extended' : 'financial',
      title: `${o.name} (${i === 0 ? 'Карточка' : i === 1 ? 'Расширенный' : 'Финансовый'})`,
    }));
    this.persistDashboards();
  }

  persistDashboards() {
    localStorage.setItem('cm_dashboards', JSON.stringify(this.state.dashboards));
  }

  async loadObjects() {
    const payload = await api('/objects?page=1&page_size=200');
    this.objects = Array.isArray(payload) ? payload : (payload?.data || []);
    if (!this.selectedObjectId && this.objects.length) this.selectedObjectId = this.objects[0].id;
    await this.refreshDashboardMetrics();
  }

  currentProject() {
    return this.objects.find((o) => String(o.id) === String(this.selectedObjectId));
  }

  normalizeTemplateColumnTitle(code, column) {
    if (code !== 'tep') return column.title;
    const titles = { num: '№ п/п', indicator: 'Наименование', unit: 'Ед. изм.', amount: 'Количество' };
    return titles[column.field_key] || column.title;
  }

  async ensureDefaultTemplateRows(projectId, code, rowsPayload) {
    const rows = rowsPayload.data || [];
    if (code !== 'tep' || rows.length > 0 || this.templateSearch) return rowsPayload;
    for (let i = 0; i < DEFAULT_TEP_ROWS.length; i += 1) await createTemplateRow(projectId, code, DEFAULT_TEP_ROWS[i]);
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
      ? this.objects.map((project) => {
          const id = String(project.id);
          const active = String(this.selectedObjectId) === id;
          const expanded = this.expandedProjects.has(id);
          const submenu = expanded ? this.renderProjectSubmenu(project.id) : '';
          return `<div class="tree-row ${active ? 'active' : ''}" data-project="${project.id}">${expanded ? '▼' : '▶'} ${project.name}</div>${submenu}`;
        }).join('')
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
        this.expandedProjects.clear();
        this.expandedProjects.add(pid);
        await this.loadProjectMenu(pid);
        this.renderProjectTree();
        this.renderContent();
        if (!this.state.isDesktop) this.toggleSidebar(false);
      });
    });

    tree.querySelector('[data-add-project]')?.addEventListener('click', () => this.openProjectForm());
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
        if (this.expandedMenuNodes.has(key)) this.expandedMenuNodes.delete(key);
        else this.expandedMenuNodes.add(key);
        this.renderProjectTree();
      });
    });
  }

  renderProjectSubmenu(projectId) {
    const menu = this.projectMenus[projectId] || [];
    return this.renderMenuNodes(projectId, menu || [], 1);
  }

  renderMenuNodes(projectId, nodes, level = 1) {
    return (nodes || []).map((node) => {
      const nodeKey = `${projectId}:${node.id}`;
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const expanded = hasChildren && this.expandedMenuNodes.has(nodeKey);
      const marker = hasChildren ? (expanded ? '▼ ' : '▶ ') : '';
      const attrs = node.view_key ? `data-view-link="${node.view_key}" data-view-title="${node.title}"` : '';
      const toggleAttrs = hasChildren ? `data-menu-toggle="${nodeKey}"` : '';
      const row = `<div class="tree-row level-${Math.min(level, 4)}" ${attrs} ${toggleAttrs}>${marker}${node.title}</div>`;
      const children = expanded ? this.renderMenuNodes(projectId, node.children || [], level + 1) : '';
      return `${row}${children}`;
    }).join('');
  }

  configureHeader() {
    const primary = document.getElementById('primaryBtn');
    const secondary = document.getElementById('secondaryBtn');
    if (!primary || !secondary) return;

    secondary.style.display = 'none';
    const map = {
      home: { primary: '+ Добавить дашборд', secondary: '' },
      projects: { primary: '+ Добавить проект', secondary: '' },
      designSchedule: { primary: '+ Добавить строку', secondary: 'Экспорт в CSV' },
      tep: { primary: '+ Добавить строку', secondary: 'Экспорт в CSV' },
      estimate: { primary: '+ Добавить строку', secondary: 'Экспорт в CSV' },
      auth: { primary: 'Выдать demo token', secondary: '' },
    };

    const cfg = this.isTemplateView(this.currentView)
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
    if (this.currentView === 'designSchedule') return this.renderTemplateScreen('design_schedule', 'График проектирования');
    if (this.currentView === 'tep') return this.renderTemplateScreen('tep', 'ТЭП');
    if (this.currentView === 'estimate') return this.renderTemplateScreen('summary_estimate', 'Сметная документация');
    if (this.currentView === 'auth') return this.renderAuthView();
    if (this.isTemplateView(this.currentView)) {
      const { code, title } = this.resolveTemplateView(this.currentView);
      return this.renderTemplateScreen(code, title);
    }
    return this.renderHome();
  }

  metricDataFor(project) {
    const metrics = this.dashboardMetrics[String(project?.id)] || {};
    const plan = Number(metrics?.progress?.plan_percent || 0);
    const fact = Number(metrics?.progress?.fact_percent || 0);
    const deviation = fact - plan;
    const cost = Number(metrics?.cost?.value || project?.budget || 0);
    const spent = cost * (Math.max(0, Math.min(100, fact)) / 100);
    const remainder = Math.max(0, cost - spent);
    return {
      address: project?.address || "—",
      area: Number(metrics?.area?.total_area_m2 || 0),
      cost,
      plan,
      fact,
      deviation,
      milestones: ["Разрешение", "Фундамент", "Каркас", "Фасад", "Отделка"].slice(0, 3 + ((project?.name?.length || 0) % 3)),
      spent,
      remainder,
      eac: cost ? cost * (100 / Math.max(1, fact || 1)) : 0,
    };
  }

  async refreshDashboardMetrics() {
    const ids = [...new Set(this.state.dashboards.map((d) => String(d.projectId)))];
    if (!ids.length) return;
    const entries = await Promise.all(ids.map(async (id) => {
      try {
        const payload = await api(`/dashboard/metrics/${id}`);
        return [id, payload];
      } catch (_) {
        return [id, null];
      }
    }));
    entries.forEach(([id, payload]) => { if (payload) this.dashboardMetrics[id] = payload; });
  }

  statusClass(fact) {
    if (fact >= 75) return 'ok';
    if (fact >= 45) return 'warn';
    return 'danger';
  }

  renderDashboardCard(d) {
    const project = this.objects.find((o) => String(o.id) === String(d.projectId));
    if (!project) return '';
    const m = this.metricDataFor(project);
    const statusClass = this.statusClass(m.fact);

    const common = `
      <div class="kv"><span>📍 Адрес:</span><strong>${m.address}</strong></div>
      <div class="kv"><span>📐 Площадь:</span><strong>${m.area.toLocaleString('ru-RU')} м²</strong></div>
      <div class="kv"><span>💰 Стоимость:</span><strong>${m.cost.toLocaleString('ru-RU')} руб.</strong></div>
      <div class="kv"><span>План:</span><strong>${m.plan}%</strong></div>
      <div class="kv"><span>Факт:</span><strong>${m.fact}%</strong></div>
      <div class="kv"><span>Отклонение:</span><strong>${m.deviation > 0 ? '+' : ''}${m.deviation}%</strong></div>
      <div class="progress"><span style="width:${m.fact}%"></span></div>
      <span class="status-pill ${statusClass}">${statusClass === 'ok' ? 'Зеленый статус' : statusClass === 'warn' ? 'Желтый статус' : 'Красный статус'}</span>
    `;

    const extended = `
      <div class="notice" style="margin-top:8px">Мини-Гант: ${m.milestones.join(' → ')}</div>
      <div class="kv"><span>Бюджет план/факт:</span><strong>${Math.round(m.plan)}% / ${Math.round(m.fact)}%</strong></div>
      <div class="mini-chart">${Array.from({ length: 10 }, (_, i) => `<span style="height:${10 + ((i * 7 + m.fact) % 24)}px"></span>`).join('')}</div>
    `;
    const financial = `
      <div class="kv"><span>Освоено:</span><strong>${m.spent.toLocaleString('ru-RU')} руб. (${m.fact}%)</strong></div>
      <div class="kv"><span>Остаток:</span><strong>${m.remainder.toLocaleString('ru-RU')} руб.</strong></div>
      <div class="kv"><span>Прогноз EAC:</span><strong>${Math.round(m.eac).toLocaleString('ru-RU')} руб.</strong></div>
    `;

    return `
      <article class="card dashboard-card">
        <button class="card-remove" data-remove-dashboard="${d.id}" title="Удалить">✕</button>
        <h3>${project.name}</h3>
        ${common}
        ${d.type === 'extended' ? extended : ''}
        ${d.type === 'financial' ? financial : ''}
      </article>
    `;
  }

  renderHome() {
    const total = this.objects.length;
    const inProgress = this.objects.filter((o) => ['planning', 'design', 'construction'].includes((o.status || '').toLowerCase())).length;
    const lastUpdate = new Date().toLocaleTimeString('ru-RU');

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-4"><span class="tag">Всего проектов</span><h3>${total}</h3></article>
      <article class="card col-4"><span class="tag">В работе</span><h3>${inProgress}</h3></article>
      <article class="card col-12">
        <div class="dashboard-toolbar">
          <h3>Дашборды проектов</h3>
          <div class="row-actions">
            <label class="metric">Интервал (сек)
              <input id="dashboardRefreshInput" type="number" min="15" value="${this.state.dashboardRefreshSeconds}" style="width:88px;margin-left:6px;">
            </label>
            <button class="mini" id="saveDashboardRefresh">Применить</button>
          </div>
        </div>
        <div class="status-line">
          <span>Обновлено: ${lastUpdate}</span>
          <span class="connection ${navigator.onLine ? 'online' : 'offline'}">${navigator.onLine ? 'online' : 'offline'}</span>
          <span class="spinner ${this.state.dashboardRefreshing ? '' : 'hidden'}"></span>
        </div>
        <div class="dashboard-grid" id="dashboardGrid">
          ${this.state.dashboards.map((d) => this.renderDashboardCard(d)).join('') || '<div class="notice">Добавьте дашборд через кнопку в шапке.</div>'}
        </div>
      </article>
    `;

    document.getElementById('saveDashboardRefresh')?.addEventListener('click', () => {
      const sec = Number(document.getElementById('dashboardRefreshInput').value || 60);
      this.state.dashboardRefreshSeconds = Math.max(15, sec);
      localStorage.setItem('cm_dashboard_refresh_sec', String(this.state.dashboardRefreshSeconds));
      this.setupAutoRefresh();
    });

    document.querySelectorAll('[data-remove-dashboard]').forEach((btn) => {
      btn.addEventListener('click', () => this.removeDashboard(btn.dataset.removeDashboard));
    });
  }

  localizeProjectStatus(status) {
    const map = {
      draft: "Черновик",
      planning: "Черновик",
      active: "В работе",
      design: "В работе",
      construction: "В работе",
      on_hold: "Приостановлен",
      completed: "Завершен",
      complete: "Завершен",
      archived: "Архив",
    };
    return map[String(status || "").toLowerCase()] || (status || "—");
  }

  renderProjects() {
    const rows = this.objects.map((o) => `
      <tr>
        <td>${o.name}</td>
        <td>${o.address || '—'}</td>
        <td>${this.localizeProjectStatus(o.status)}</td>
        <td>${(Number(o.budget) || 0).toLocaleString('ru-RU')}</td>
        <td><button class="mini" data-edit-project="${o.id}">✏️</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5">Нет проектов</td></tr>';

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <div class="dashboard-toolbar">
          <h3>Проекты</h3>
          <div class="status-line">
            <span>Автообновление: ${this.state.projectRefreshSeconds} сек.</span>
            <span class="spinner ${this.state.projectsRefreshing ? '' : 'hidden'}"></span>
          </div>
        </div>
        <table class="table">
          <thead><tr><th>Наименование</th><th>Адрес</th><th>Статус</th><th>Бюджет</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </article>
    `;

    document.querySelectorAll('[data-edit-project]').forEach((btn) => {
      btn.addEventListener('click', () => this.openProjectEditForm(btn.dataset.editProject));
    });
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
        <h3>${code === "tep" ? `ТЭП объекта: ${project.name}` : `${title}: ${this.currentTemplateName}`}</h3>
        <div class="row-actions" style="margin-bottom:10px;align-items:center;flex-wrap:wrap;">
          <input id="templateSearch" placeholder="Поиск" value="${this.templateSearch}">
          <button class="mini" id="templateSearchBtn">Найти</button>
          <span class="metric">Стр. ${pager.page}, всего ${pager.total}</span>
          <button class="mini" id="toggleEditMode">✏️ Режим редактирования: ${this.templateEditMode ? "вкл" : "выкл"}</button>
          <button class="mini" id="prevPage">←</button>
          <button class="mini" id="nextPage">→</button>
        </div>
        <table class="table">
          <thead><tr>${columns.map((c) => `<th>${this.normalizeTemplateColumnTitle(code, c)}</th>`).join('')}<th class="actions-col ${this.templateEditMode ? "" : "hidden"}">Действия</th></tr></thead>
          <tbody>
            ${this.renderTemplateRows(code, rows, columns) || `<tr><td colspan="${columns.length + 1}">Нет данных</td></tr>`}
          </tbody>
        </table>
      </article>
    `;

    document.getElementById('templateSearchBtn').onclick = () => {
      this.templateSearch = document.getElementById('templateSearch').value.trim();
      this.templatePage = 1;
      this.renderTemplateScreen(defaultCode, title);
    };
    document.getElementById('prevPage').onclick = () => { this.templatePage = Math.max(1, this.templatePage - 1); this.renderTemplateScreen(defaultCode, title); };
    document.getElementById('nextPage').onclick = () => { if (pager.page * pager.page_size < pager.total) this.templatePage += 1; this.renderTemplateScreen(defaultCode, title); };
    document.getElementById('toggleEditMode').onclick = () => { this.templateEditMode = !this.templateEditMode; this.renderTemplateScreen(defaultCode, title); };
    document.querySelectorAll('[data-edit-row]').forEach((btn) => { btn.onclick = () => this.openTemplateForm(tpl, rows.find((r) => String(r.id) === String(btn.dataset.editRow))); });
    document.querySelectorAll('[data-del-row]').forEach((btn) => { btn.onclick = async () => { if (!confirm("Удалить строку?")) return; await deleteTemplateRow(btn.dataset.delRow); if (["tep", "summary_estimate"].includes(code)) await this.refreshDashboardMetrics(); await this.renderTemplateScreen(defaultCode, title); }; });
    document.querySelectorAll("[data-move-row]").forEach((btn) => { btn.onclick = async () => { const [rowId, direction] = String(btn.dataset.moveRow).split(":"); await this.moveTemplateRow(code, rowId, direction); await this.renderTemplateScreen(defaultCode, title); }; });
  }


  renderTemplateRows(code, rows, columns) {
    this.templateRowsCache = rows;
    if (code === "tep") {
      return this.renderTEPSectionedRows(rows, columns);
    }
    return rows.map((r) => `<tr>${columns.map((c) => `<td>${(r.data || {})[c.field_key] ?? ""}</td>`).join("")}<td class="actions-col ${this.templateEditMode ? "" : "hidden"}"><div class="row-actions"><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button><button class="mini" data-move-row="${r.id}:up">↑</button><button class="mini" data-move-row="${r.id}:down">↓</button></div></td></tr>`).join("");
  }

  renderTEPSectionedRows(rows, columns) {
    const groups = [
      { title: "Раздел 1. Характеристика земельного участка", min: 1, max: 5 },
      { title: "Раздел 2. Характеристики зданий, строений, сооружений", min: 6, max: 9 },
      { title: "Раздел 3. Инженерные нагрузки и ресурсы", min: 10, max: 17 },
      { title: "Раздел 4. Стоимостные показатели", min: 18, max: 9999 },
    ];
    const classify = (row) => {
      const n = Number((row.data || {}).num || row.row_number || 0);
      if (Number.isFinite(n)) {
        if (n >= 1 && n <= 5) return 0;
        if (n >= 6 && n <= 9) return 1;
        if (n >= 10 && n <= 17) return 2;
        if (n >= 18) return 3;
      }
      const indicator = String((row.data || {}).indicator || "").toLowerCase();
      if (indicator.includes("стоим")) return 3;
      return 3;
    };
    const grouped = [[], [], [], []];
    rows.forEach((row) => grouped[classify(row)].push(row));
    return groups.map((g, i) => {
      const body = grouped[i].map((r) => `<tr>${columns.map((c) => `<td>${(r.data || {})[c.field_key] ?? ""}</td>`).join("")}<td class="actions-col ${this.templateEditMode ? "" : "hidden"}"><div class="row-actions"><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button><button class="mini" data-move-row="${r.id}:up">↑</button><button class="mini" data-move-row="${r.id}:down">↓</button></div></td></tr>`).join("");
      const sectionRow = `<tr class="section-row"><td colspan="${columns.length + 1}">${g.title}</td></tr>`;
      return sectionRow + (body || `<tr><td colspan="${columns.length + 1}" class="metric">Пусто</td></tr>`);
    }).join("");
  }

  async moveTemplateRow(code, rowId, direction) {
    const rows = [...this.templateRowsCache].sort((a, b) => (a.row_number || 0) - (b.row_number || 0));
    const idx = rows.findIndex((r) => String(r.id) === String(rowId));
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= rows.length) return;
    const current = rows[idx];
    const swap = rows[swapIdx];
    const curOrder = current.row_number || idx + 1;
    const swapOrder = swap.row_number || swapIdx + 1;
    if (code === "tep") {
      await api(`/tep/${current.id}`, "PATCH", { sort_order: swapOrder });
      await api(`/tep/${swap.id}`, "PATCH", { sort_order: curOrder });
    } else {
      await api(`/template-rows/${current.id}`, "PUT", { sort_order: swapOrder });
      await api(`/template-rows/${swap.id}`, "PUT", { sort_order: curOrder });
    }
    if (["tep", "summary_estimate"].includes(code)) await this.refreshDashboardMetrics();
  }

  openTemplateForm(templatePayload, row = null) {
    this.modalMode = row ? 'editRow' : 'createRow';
    this.editRowId = row?.id || null;
    document.getElementById('modalTitle').textContent = row ? `Редактировать: ${templatePayload.template.name}` : `Добавить: ${templatePayload.template.name}`;
    document.getElementById('modalBody').innerHTML = `<div class="form-grid">${templatePayload.columns.map((c) => {
      const value = (row?.data || {})[c.field_key] || '';
      const type = c.data_type === 'number' ? 'number' : c.data_type === 'date' ? 'date' : 'text';
      return `<label>${c.title}<input data-field="${c.field_key}" type="${type}" value="${value}"></label>`;
    }).join('')}</div>`;
    this.openModal();
  }

  openProjectForm() {
    this.state.editProjectId = null;
    this.modalMode = 'createProject';
    document.getElementById('modalTitle').textContent = 'Добавить проект';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        <label>Наименование *<input data-project-field="name" type="text"></label>
        <label>Адрес<input data-project-field="address" type="text"></label>
        <label>Бюджет<input data-project-field="budget" type="number" min="0"></label>
        <label>Статус
          <select data-project-field="status">
            <option value="planning">Черновик</option>
            <option value="design">Активный</option>
            <option value="construction">На паузе</option>
            <option value="complete">Завершен</option>
          </select>
        </label>
      </div>
    `;
    this.openModal();
  }

  async openProjectEditForm(id) {
    this.modalMode = 'editProject';
    this.state.editProjectId = id;
    document.getElementById('modalTitle').textContent = 'Редактирование проекта';
    document.getElementById('modalBody').innerHTML = '<div class="metric">Загрузка...</div>';
    this.openModal();

    try {
      const p = await api(`/objects/${id}`);
      document.getElementById('modalBody').innerHTML = `
        <div class="form-grid">
          <h4>Основная информация</h4>
          <label>Наименование*<input data-project-field="name" value="${p.name || ''}" required></label>
          <label>Адрес объекта*<input data-project-field="address" value="${p.address || ''}" required></label>
          <div class="form-grid two">
            <label>Город<input data-project-field="city"></label>
            <label>Улица<input data-project-field="street"></label>
          </div>
          <label>Описание<textarea data-project-field="description" rows="3"></textarea></label>
          <h4>Параметры проекта</h4>
          <div class="form-grid two">
            <label>Дата начала*<input data-project-field="start_date" type="date"></label>
            <label>Плановая дата конца<input data-project-field="planned_end_date" type="date"></label>
          </div>
          <label>Бюджет проекта<input data-project-field="budget" type="number" min="0" value="${p.budget || 0}"></label>
          <label>Статус
            <select data-project-field="status">
              <option value="planning" ${(p.status || '') === 'planning' ? 'selected' : ''}>Черновик</option>
              <option value="design" ${(p.status || '') === 'design' ? 'selected' : ''}>Активный</option>
              <option value="construction" ${(p.status || '') === 'construction' ? 'selected' : ''}>На паузе</option>
              <option value="complete" ${(p.status || '') === 'complete' ? 'selected' : ''}>Завершен</option>
            </select>
          </label>
          <h4>Ответственные</h4>
          <div class="form-grid two">
            <label>Генподрядчик<input data-project-field="general_contractor"></label>
            <label>Генпроектировщик<input data-project-field="general_designer"></label>
          </div>
        </div>
      `;
      this.state.projectFormSnapshot = this.serializedProjectForm();
      document.querySelectorAll('[data-project-field]').forEach((el) => el.addEventListener('input', () => {
        this.state.modalDirty = this.serializedProjectForm() !== this.state.projectFormSnapshot;
      }));
    } catch (e) {
      document.getElementById('modalBody').innerHTML = `<div class="notice">${e.message}</div>`;
    }
  }

  serializedProjectForm() {
    const obj = {};
    document.querySelectorAll('[data-project-field]').forEach((el) => { obj[el.dataset.projectField] = el.value; });
    return JSON.stringify(obj);
  }

  collectProjectForm() {
    const data = {};
    document.querySelectorAll('[data-project-field]').forEach((el) => { data[el.dataset.projectField] = (el.value || '').trim(); });
    return data;
  }

  validateProjectForm(data, isEdit = false) {
    if (!data.name) return 'Наименование обязательно';
    if (!data.address) return 'Адрес обязателен';
    if (data.budget && Number(data.budget) < 0) return 'Бюджет должен быть >= 0';
    if (data.start_date && data.planned_end_date && new Date(data.start_date) > new Date(data.planned_end_date)) return 'Дата начала должна быть раньше даты окончания';
    const duplicate = this.objects.find((o) => o.name.toLowerCase() === data.name.toLowerCase() && (!isEdit || String(o.id) !== String(this.state.editProjectId)));
    if (duplicate) return 'Проект с таким наименованием уже существует';
    return null;
  }

  async handlePrimaryAction() {
    if (this.currentView === 'home') return this.openDashboardForm();
    if (this.currentView === 'projects') return this.openProjectForm();
    if (this.currentView === 'auth') {
      await issueDemoToken('admin');
      return alert('Demo token обновлён.');
    }
    if (this.isTemplateView(this.currentView)) {
      const fallback = this.resolveTemplateView(this.currentView).code;
      this.currentTemplateCode = this.currentTemplateCode || fallback;
      const tpl = await getTemplate(this.currentTemplateCode);
      return this.openTemplateForm(tpl, null);
    }
  }

  async handleSecondaryAction() {
    if (this.isTemplateView(this.currentView)) {
      const code = this.currentTemplateCode || this.resolveTemplateView(this.currentView).code;
      return exportTemplate(this.selectedObjectId, code);
    }
  }

  openDashboardForm() {
    this.modalMode = 'addDashboard';
    document.getElementById('modalTitle').textContent = 'Добавить дашборд';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        <label>Проект
          <input id="dashboardProjectSearch" placeholder="Поиск проекта" style="margin-bottom:8px">
          <select id="dashboardProject">${this.objects.map((o) => `<option value="${o.id}">${o.name}</option>`).join('')}</select>
        </label>
        <label>Тип дашборда</label>
        <div class="radio-row">
          <label><input type="radio" name="dashType" value="basic" checked> Карточка проекта</label>
          <label><input type="radio" name="dashType" value="extended"> Расширенный</label>
          <label><input type="radio" name="dashType" value="financial"> Финансовый</label>
        </div>
        <label>Название (опционально)<input id="dashboardName"></label>
      </div>
    `;
    document.getElementById('dashboardProjectSearch')?.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      const select = document.getElementById('dashboardProject');
      select.innerHTML = this.objects.filter((o) => o.name.toLowerCase().includes(q)).map((o) => `<option value="${o.id}">${o.name}</option>`).join('');
    });
    this.openModal();
  }

  removeDashboard(id) {
    if (!confirm('Удалить дашборд?')) return;
    this.state.dashboards = this.state.dashboards.filter((d) => d.id !== id);
    this.persistDashboards();
    this.renderHome();
  }

  async handleSaveModal() {
    if (this.modalMode === 'createProject') {
      const data = this.collectProjectForm();
      const err = this.validateProjectForm(data);
      if (err) return alert(err);
      await api('/objects', 'POST', { name: data.name, address: data.address, budget: Number(data.budget || 0), status: data.status || 'planning' });
      await this.loadObjects();
      this.selectedObjectId = this.objects.at(-1)?.id || this.selectedObjectId;
      this.closeModal();
      this.renderProjectTree();
      this.switchView('projects', 'Проекты');
      return;
    }

    if (this.modalMode === 'editProject') {
      const saveBtn = document.getElementById('saveEntity');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';
      const data = this.collectProjectForm();
      const err = this.validateProjectForm(data, true);
      if (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить';
        return alert(err);
      }
      try {
        await api(`/objects/${this.state.editProjectId}`, 'PUT', {
          name: data.name,
          address: data.address,
          budget: Number(data.budget || 0),
          status: data.status || 'planning',
          start_date: data.start_date || null,
          planned_end_date: data.planned_end_date || null,
          description: data.description || '',
        });
        alert('Сохранено');
        await this.loadObjects();
        this.renderProjectTree();
        this.closeModal();
        this.renderProjects();
      } catch (e) {
        alert(e.message || 'Ошибка сохранения');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить';
      }
      return;
    }

    if (this.modalMode === 'addDashboard') {
      const projectId = document.getElementById('dashboardProject')?.value;
      const type = document.querySelector('input[name="dashType"]:checked')?.value || 'basic';
      const name = document.getElementById('dashboardName')?.value?.trim();
      if (!projectId) return alert('Выберите проект');
      if (this.state.dashboards.some((d) => String(d.projectId) === String(projectId) && d.type === type)) {
        return alert('Этот проект уже добавлен для выбранного типа дашборда');
      }
      const project = this.objects.find((o) => String(o.id) === String(projectId));
      this.state.dashboards.push({ id: crypto.randomUUID(), projectId, projectName: project?.name || 'Проект', type, title: name || `${project?.name || 'Проект'} • ${type}` });
      this.persistDashboards();
      this.closeModal();
      this.renderHome();
      return;
    }

    if (this.modalMode === 'createRow' || this.modalMode === 'editRow') {
      try {
        const data = {};
        document.querySelectorAll('[data-field]').forEach((input) => { data[input.dataset.field] = input.value; });
        const code = this.currentTemplateCode || this.resolveTemplateView(this.currentView).code;
        if (this.editRowId) await updateTemplateRow(this.editRowId, data);
        else await createTemplateRow(this.selectedObjectId, code, data);
        this.closeModal();
        if (["tep", "summary_estimate"].includes(code)) await this.refreshDashboardMetrics();
        return this.renderContent();
      } catch (error) {
        alert(error?.message || 'Не удалось сохранить строку');
      }
    }
  }

  handleModalCancel() {
    if (this.modalMode === 'editProject' && this.state.modalDirty) {
      if (!confirm('Есть несохраненные изменения. Закрыть без сохранения?')) return;
    }
    this.closeModal();
  }

  switchView(view, title) {
    this.currentView = view;
    this.currentTemplateCode = null;
    this.currentTemplateName = null;
    this.templatePage = 1;
    this.templateSearch = '';

    document.getElementById('pageTitle').textContent = title;
    document.querySelectorAll('.menu-item[data-view]').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
    this.renderContent();
    if (!this.state.isDesktop) this.toggleSidebar(false);
  }

  renderAuthView() {
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Авторизация и роли</h3>
        <p class="metric">Приложение использует demo JWT-токен для работы вкладок шаблонов.</p>
      </article>
    `;
  }

  openModal() {
    document.body.style.overflow = 'hidden';
    document.getElementById('entityModal').classList.add('open');
  }

  closeModal() {
    document.body.style.overflow = '';
    document.getElementById('entityModal').classList.remove('open');
    this.modalMode = null;
    this.editRowId = null;
    this.state.modalDirty = false;
    this.state.editProjectId = null;
    this.state.projectFormSnapshot = '';
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
