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
  { num: '', indicator: 'Стоимостные показатели', unit: '', amount: '' },
  { num: '18', indicator: 'Стоимость строительства', unit: 'руб.', amount: '' },
  { num: '19', indicator: 'Проектно-изыскательские работы', unit: 'руб.', amount: '' },
  { num: '20', indicator: 'Стоимость СМР', unit: 'руб.', amount: '' },
  { num: '21', indicator: 'Прочие затраты', unit: 'руб.', amount: '' },
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
    this.irdEditingRowId = null;
    this.irdDraftData = {};
    this.docsPRows = [];
    this.docsRRows = [];
    this.registryRows = [];
    this.workforceRows = [];
    this.workforceTasks = [];
    this.svorRows = [];
    this.svorPagination = { page: 1, page_size: 20, total: 0 };
    this.svorFilters = { status: '', dateFrom: '', dateTo: '' };
    this.svorDashboard = null;
    this.aiState = {
      open: false,
      minimized: false,
      input: '',
      messages: [],
      loading: false,
      screenshotDataUrl: '',
      screenshotName: '',
    };
    this.aiClipboardBound = false;

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
    this.initAIAssistantWidget();
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
      const resolvedView = node.view_key || this.resolveMenuViewKey(node.title);
      const attrs = resolvedView ? `data-view-link="${resolvedView}" data-view-title="${node.title}"` : '';
      const toggleAttrs = hasChildren ? `data-menu-toggle="${nodeKey}"` : '';
      const row = `<div class="tree-row level-${Math.min(level, 4)}" ${attrs} ${toggleAttrs}>${marker}${node.title}</div>`;
      const children = expanded ? this.renderMenuNodes(projectId, node.children || [], level + 1) : '';
      return `${row}${children}`;
    }).join('');
  }

  resolveMenuViewKey(title) {
    const map = {
      'Стадия П': 'docsStageP',
      'Стадия Р': 'docsStageR',
      'Ведомость комплектов ПД': 'registryP',
      'Ведомость комплектов РД': 'registryR',
      'График РД': 'designScheduleR',
      'График СМР': 'smrSchedule',
      'Учёт рабочих': 'workforceDaily',
      'Внутренние': 'protocolInternal',
      'Проектирование': 'protocolDesign',
      'Протоколы проектирование': 'protocolDesign',
      'Протоколы СМР': 'protocolSMR',
      'СВОР': 'svorMain',
      'История согласований': 'svorHistory',
      'Сводный дашборд по СВОР': 'svorDashboard',
    };
    return map[String(title || '').trim()] || '';
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
      docsStageP: { primary: 'Обновить', secondary: 'Экспорт XLSX' },
      docsStageR: { primary: '+ Добавить изменение', secondary: 'Обновить' },
      registryP: { primary: '+ Добавить строку', secondary: 'Обновить' },
      registryR: { primary: '+ Добавить строку', secondary: 'Обновить' },
      smrSchedule: { primary: '+ Добавить строку', secondary: 'Экспорт в CSV' },
      workforceDaily: { primary: '+ Добавить запись', secondary: 'Обновить' },
      protocolInternal: { primary: 'Обновить', secondary: '' },
      protocolDesign: { primary: 'Обновить', secondary: '' },
      protocolSMR: { primary: 'Обновить', secondary: '' },
      svorMain: { primary: '+ Создать СВОР', secondary: 'Экспорт отчета XLSX' },
      svorHistory: { primary: 'Обновить', secondary: '' },
      svorDashboard: { primary: 'Обновить', secondary: '' },
      auth: { primary: 'Выдать demo token', secondary: '' },
    };

    let cfg = map[this.currentView] || map.home;
    if (this.isTemplateView(this.currentView)) {
      const { code } = this.resolveTemplateView(this.currentView);
      cfg = code === 'input_design_data'
        ? { primary: '+ Добавить строку', secondary: this.templateEditMode ? 'Завершить редактирование' : 'Редактировать' }
        : { primary: '+ Добавить строку', secondary: 'Экспорт в CSV' };
    }
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
    if (this.currentView === 'docsStageP') return this.renderDocsStageP();
    if (this.currentView === 'docsStageR') return this.renderDocsStageR();
    if (this.currentView === 'registryP') return this.renderRegistry('phase-p', 'Ведомость комплектов ПД');
    if (this.currentView === 'registryR') return this.renderRegistry('phase-r', 'Ведомость комплектов РД');
    if (this.currentView === 'smrSchedule') return this.renderTemplateScreen('smr_schedule', 'График СМР');
    if (this.currentView === 'designScheduleR') return this.renderTemplateScreen('design_schedule', 'График РД');
    if (this.currentView === 'workforceDaily') return this.renderWorkforceDaily();
    if (this.currentView === 'protocolInternal') return this.renderProtocolStub('Внутренние');
    if (this.currentView === 'protocolDesign') return this.renderProtocolStub('Проектирование');
    if (this.currentView === 'protocolSMR') return this.renderProtocolStub('СМР');
    if (this.currentView === 'svorMain') return this.renderSvorMain();
    if (this.currentView === 'svorHistory') return this.renderSvorHistoryList();
    if (this.currentView === 'svorDashboard') return this.renderSvorDashboard();
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
      <div class="kv"><span>Адрес:</span><strong>${m.address}</strong></div>
      <div class="kv"><span>Площадь:</span><strong>${m.area.toLocaleString('ru-RU')} м²</strong></div>
      <div class="kv"><span>Стоимость:</span><strong>${m.cost.toLocaleString('ru-RU')} руб.</strong></div>
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
            <button class="mini" id="openAgentSummary">AI-сводка</button>
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
    document.getElementById('openAgentSummary')?.addEventListener('click', () => this.openAgentSummaryForm());

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

  formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return d.toISOString().slice(0, 10);
  }

  statusLabel(status) {
    const map = {
      draft: 'Черновик',
      sent: 'Направлен',
      smh_remarks: 'Замечания СМХ',
      rework: 'На доработке',
      approved: 'Согласован',
      rejected: 'Отклонен',
    };
    return map[status] || status || '—';
  }

  async renderDocsStageP() {
    const project = this.currentProject();
    if (!project) return;
    const rows = await api(`/projects/${project.id}/docs/p`);
    const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.cipher || '—'}</td><td>${r.name || '—'}</td><td>${r.section || '—'}</td></tr>`).join('');
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Стадия П — ведомость комплектов</h3>
        <table class="table">
          <thead><tr><th>№</th><th>Шифр</th><th>Наименование</th><th>Раздел/Блок</th></tr></thead>
          <tbody>${body || '<tr><td colspan="4">Нет данных</td></tr>'}</tbody>
        </table>
      </article>
    `;
  }

  async renderDocsStageR() {
    const project = this.currentProject();
    if (!project) return;
    const rows = await api(`/projects/${project.id}/docs/r`);
    this.docsRRows = rows;
    const body = rows.map((entry, i) => {
      const r = entry.doc || {};
      return `
        <tr class="${entry.alert === 'red' ? 'row-alert-red' : entry.alert === 'yellow' ? 'row-alert-yellow' : ''}">
          <td>${i + 1}</td>
          <td>${r.cipher_p_ref || '—'}</td>
          <td>${r.cipher_r || '—'}</td>
          <td>${r.name || '—'}</td>
          <td>${this.formatDate(r.issue_date)}</td>
          <td>${r.current_version || '0'}</td>
          <td>${this.formatDate(r.current_revision_date)}</td>
          <td><button class="mini" data-add-rev="${r.id}">Добавить изменение</button></td>
        </tr>
      `;
    }).join('');
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Стадия Р — ведомость РД</h3>
        <table class="table">
          <thead><tr><th>№</th><th>Шифр П</th><th>Шифр Р</th><th>Наименование</th><th>Дата выдачи</th><th>Текущая версия</th><th>Дата последнего ИЗМ</th><th></th></tr></thead>
          <tbody>${body || '<tr><td colspan="8">Нет данных</td></tr>'}</tbody>
        </table>
      </article>
    `;
    document.querySelectorAll('[data-add-rev]').forEach((btn) => btn.addEventListener('click', () => this.openAddRevisionModal(btn.dataset.addRev)));
  }

  async renderRegistry(stage, title) {
    const project = this.currentProject();
    if (!project) return;
    const rows = await api(`/projects/${project.id}/design/${stage}/registry`);
    this.registryRows = Array.isArray(rows) ? rows : [];
    const body = this.registryRows.map((r, idx) => {
      const issueDate = r.issue_date_fact ? String(r.issue_date_fact).slice(0, 10) : '';
      return `<tr data-registry-id="${r.id}">
        <td>${idx + 1}</td>
        <td>${r.volume_number ?? '—'}</td>
        <td>${r.code || '—'}</td>
        <td>${r.mark || '—'}</td>
        <td class="editable-cell" data-registry-field="designation">${r.designation || '—'}</td>
        <td class="editable-cell" data-registry-field="name">${r.name || '—'}</td>
        <td class="editable-cell" data-registry-field="contractor">${r.contractor || '—'}</td>
        <td class="editable-cell" data-registry-field="note">${r.note || '—'}</td>
        <td class="editable-cell" data-registry-field="issue_date_fact">${issueDate || '—'}</td>
        <td>${(r.synced_progress || 0).toFixed(1)}%</td>
        <td>${r.synced_status || '—'}</td>
      </tr>`;
    }).join('');

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>${title}</h3>
        <p class="metric">Двойной клик по ячейке — inline-редактирование, Enter/Ctrl+Enter — сохранить.</p>
        <table class="table table-sticky">
          <thead><tr><th>№</th><th>Том</th><th>Шифр</th><th>Марка</th><th>Обозначение</th><th>Наименование</th><th>Исполнитель</th><th>Примечание</th><th>Дата выдачи факт</th><th>% синх.</th><th>Статус</th></tr></thead>
          <tbody>${body || '<tr><td colspan="11">Нет данных</td></tr>'}</tbody>
        </table>
      </article>
    `;
    document.querySelectorAll('[data-registry-field]').forEach((cell) => {
      cell.addEventListener('dblclick', () => this.startRegistryInlineEdit(cell, stage));
    });
  }

  async renderWorkforceDaily() {
    const project = this.currentProject();
    if (!project) return;
    const [rows, tasks] = await Promise.all([
      api(`/projects/${project.id}/smr/workforce`),
      api(`/tasks/by-object?object_id=${project.id}`),
    ]);
    this.workforceRows = Array.isArray(rows) ? rows : [];
    this.workforceTasks = Array.isArray(tasks) ? tasks : [];
    const options = this.workforceTasks.map((t) => `<option value="${t.id}">${t.name}</option>`).join('');
    const body = this.workforceRows.map((r, idx) => `<tr>
      <td>${idx + 1}</td>
      <td>${String(r.work_date || '').slice(0, 10)}</td>
      <td>${r.task_id || '—'}</td>
      <td>${r.planned ?? '—'}</td>
      <td>${r.actual ?? '—'}</td>
      <td>${r.reported_by || '—'}</td>
      <td>${r.comment || '—'}</td>
    </tr>`).join('');

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Учёт рабочих по задачам СМР</h3>
        <div class="form-grid two" style="margin-bottom:12px">
          <label>Задача<select id="workforceTask">${options}</select></label>
          <label>Дата<input id="workforceDate" type="date"></label>
          <label>План, чел<input id="workforcePlan" type="number" min="0"></label>
          <label>Факт, чел<input id="workforceFact" type="number" min="0"></label>
          <label>Кто сообщил<input id="workforceReportedBy" placeholder="Прораб"></label>
          <label>Комментарий<input id="workforceComment"></label>
        </div>
        <button class="mini" id="saveWorkforceBtn">Сохранить запись</button>
        <table class="table" style="margin-top:12px">
          <thead><tr><th>№</th><th>Дата</th><th>Task ID</th><th>План</th><th>Факт</th><th>Кто</th><th>Комментарий</th></tr></thead>
          <tbody>${body || '<tr><td colspan="7">Нет данных</td></tr>'}</tbody>
        </table>
      </article>
    `;

    document.getElementById('saveWorkforceBtn')?.addEventListener('click', async () => {
      const task_id = document.getElementById('workforceTask')?.value;
      const work_date = document.getElementById('workforceDate')?.value;
      if (!task_id || !work_date) return alert('Заполните задачу и дату');
      const plannedValue = document.getElementById('workforcePlan')?.value;
      const actualValue = document.getElementById('workforceFact')?.value;
      await api(`/projects/${project.id}/smr/workforce`, 'POST', {
        task_id,
        work_date,
        planned: plannedValue === '' ? null : Number(plannedValue),
        actual: actualValue === '' ? null : Number(actualValue),
        reported_by: document.getElementById('workforceReportedBy')?.value || '',
        comment: document.getElementById('workforceComment')?.value || '',
      });
      await this.renderWorkforceDaily();
    });
  }

  renderProtocolStub(section) {
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Протоколы — ${section}</h3>
        <p class="metric">В MVP добавлен каркас раздела. Следующий шаг: шаблоны поручений и автоповестка по просроченным задачам.</p>
      </article>
    `;
  }

  async renderSvorMain() {
    const project = this.currentProject();
    if (!project) return;
    const statusQ = this.svorFilters.status ? `&status=${encodeURIComponent(this.svorFilters.status)}` : '';
    const payload = await api(`/projects/${project.id}/svor?page=${this.svorPagination.page}&page_size=${this.svorPagination.page_size}${statusQ}`);
    this.svorRows = payload.data || [];
    this.svorPagination = payload.pagination || this.svorPagination;
    const body = this.svorRows.map((entry, i) => {
      const r = entry.record || {};
      const doc = r.doc_r || {};
      return `<tr data-svor-row="${r.id}">
        <td>${(this.svorPagination.page - 1) * this.svorPagination.page_size + i + 1}</td>
        <td>${doc.cipher_p_ref || '—'}</td>
        <td>${doc.name || '—'}</td>
        <td>${doc.cipher_r || '—'}</td>
        <td>${this.formatDate(doc.issue_date)}</td>
        <td>${r.rd_version_snapshot || '—'}</td>
        <td>${this.formatDate(r.rd_revision_date_snapshot)}</td>
        <td class="editable-cell" data-field="submission_date">${this.formatDate(r.submission_date)}</td>
        <td class="editable-cell" data-field="contractor_feedback_date">${this.formatDate(r.contractor_feedback_date)}</td>
        <td class="editable-cell" data-field="rd_adjustment_version">${r.rd_adjustment_version || '—'}</td>
        <td class="editable-cell" data-field="status">${this.statusLabel(r.status)}</td>
        <td class="editable-cell" data-field="notes">${r.notes || '—'}</td>
        <td>${entry.rd_version_changed_after_submission ? '<span class="warn-pill">⚠️ Версия РД изменилась</span>' : ''}</td>
        <td>
          <div class="row-actions">
            <button class="mini" data-svor-action="approve" data-id="${r.id}">✅</button>
            <button class="mini" data-svor-action="remark" data-id="${r.id}">📝</button>
            <button class="mini" data-svor-action="sync" data-id="${r.id}">🔄</button>
            <button class="mini" data-svor-history="${r.id}">История</button>
          </div>
        </td>
      </tr>`;
    }).join('');
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12 svor-scroll">
        <h3>СВОР — основная таблица</h3>
        <div class="row-actions" style="margin-bottom:8px">
          <select id="svorStatusFilter">
            <option value="">Все статусы</option>
            <option value="draft">Черновик</option><option value="sent">Направлен</option><option value="smh_remarks">Замечания СМХ</option><option value="rework">На доработке</option><option value="approved">Согласован</option><option value="rejected">Отклонен</option>
          </select>
          <button class="mini" id="svorApplyFilter">Фильтр</button>
          <span class="metric">Всего: ${this.svorPagination.total || 0}</span>
        </div>
        <table class="table table-sticky">
          <thead><tr><th>№</th><th>Стадия П</th><th>Наименование</th><th>Стадия Р</th><th>Дата выдачи РД</th><th>Версия РД</th><th>Дата ИЗМ</th><th>СВОР направлен</th><th>Дата замечаний СМХ</th><th>Версия РД корректировки</th><th>Статус</th><th>Примечание</th><th>⚠️</th><th></th></tr></thead>
          <tbody>${body || '<tr><td colspan="14">Нет данных</td></tr>'}</tbody>
        </table>
      </article>
    `;
    document.getElementById('svorStatusFilter').value = this.svorFilters.status || '';
    document.getElementById('svorApplyFilter')?.addEventListener('click', () => {
      this.svorFilters.status = document.getElementById('svorStatusFilter').value || '';
      this.renderSvorMain();
    });
    document.querySelectorAll('.editable-cell').forEach((cell) => cell.addEventListener('dblclick', (e) => this.startInlineEdit(e.currentTarget)));
    document.querySelectorAll('[data-svor-action]').forEach((btn) => btn.addEventListener('click', () => this.handleSvorQuickAction(btn.dataset.id, btn.dataset.svorAction)));
    document.querySelectorAll('[data-svor-history]').forEach((btn) => btn.addEventListener('click', () => this.openSvorHistoryModal(btn.dataset.svorHistory)));
  }

  async renderSvorHistoryList() {
    document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>История СВОР</h3><p>Откройте историю из основной таблицы по кнопке «История».</p></article>`;
  }

  async renderSvorDashboard() {
    const project = this.currentProject();
    if (!project) return;
    const dash = await api(`/projects/${project.id}/svor/dashboard`);
    this.svorDashboard = dash;
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Сводный дашборд по СВОР</h3>
        <div class="kv"><span>Всего комплектов РД / СВОР:</span><strong>${dash.total_rd || 0} / ${dash.total_svor || 0}</strong></div>
        <div class="kv"><span>% согласованных:</span><strong>${Number(dash.approved_percent || 0).toFixed(1)}%</strong></div>
        <div class="kv"><span>% на доработке:</span><strong>${Number(dash.rework_percent || 0).toFixed(1)}%</strong></div>
        <div class="kv"><span>% замечаний СМХ:</span><strong>${Number(dash.smh_remarks_percent || 0).toFixed(1)}%</strong></div>
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
    const isIRD = code === 'input_design_data';
    let tpl;
    let rowsPayload;

    try {
      [tpl, rowsPayload] = await Promise.all([
        getTemplate(code),
        listTemplateRows(project.id, code, { page: this.templatePage, page_size: isIRD ? 200 : 20, search: this.templateSearch }),
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
        <div class="table-wrap">
        <table class="table ${isIRD ? 'table-sticky-head' : ''}">
          <thead><tr>${columns.map((c) => `<th>${this.normalizeTemplateColumnTitle(code, c)}</th>`).join('')}<th class="actions-col ${this.templateEditMode ? "" : "hidden"}">Действия</th></tr></thead>
          <tbody>
            ${this.renderTemplateRows(code, rows, columns) || `<tr><td colspan="${columns.length + 1}">Нет данных</td></tr>`}
          </tbody>
        </table>
        </div>
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
    if (isIRD) {
      this.bindIRDEditEvents(defaultCode, title);
    }
  }


  renderTemplateRows(code, rows, columns) {
    this.templateRowsCache = rows;
    if (code === "tep") {
      return this.renderTEPSectionedRows(rows, columns);
    }
    if (code === 'input_design_data') {
      return this.renderIRDRows(rows, columns);
    }
    return rows.map((r) => `<tr>${columns.map((c) => `<td>${(r.data || {})[c.field_key] ?? ""}</td>`).join("")}<td class="actions-col ${this.templateEditMode ? "" : "hidden"}"><div class="row-actions"><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button><button class="mini" data-move-row="${r.id}:up">↑</button><button class="mini" data-move-row="${r.id}:down">↓</button></div></td></tr>`).join("");
  }

  renderIRDRows(rows, columns) {
    return rows.map((r) => {
      const isRowEditing = this.irdEditingRowId != null && String(this.irdEditingRowId) === String(r.id);
      const cells = columns.map((c) => {
        const current = isRowEditing ? (this.irdDraftData[c.field_key] ?? '') : ((r.data || {})[c.field_key] ?? '');
        if (!isRowEditing) return `<td>${current}</td>`;
        const type = c.data_type === 'number' ? 'number' : c.data_type === 'date' ? 'date' : 'text';
        return `<td><input class="ird-inline-input" data-ird-field="${c.field_key}" type="${type}" value="${current}"></td>`;
      }).join('');
      const actions = !this.templateEditMode
        ? ''
        : `<div class="row-actions">
            ${isRowEditing
              ? `<button class="mini" data-ird-save="${r.id}">Сохранить</button><button class="mini" data-ird-cancel="${r.id}">Отмена</button>`
              : `<button class="mini" data-ird-edit="${r.id}">Ред.</button>`
            }
            <button class="mini danger" data-del-row="${r.id}">Удал.</button>
            <button class="mini" data-move-row="${r.id}:up">↑</button>
            <button class="mini" data-move-row="${r.id}:down">↓</button>
          </div>`;
      return `<tr>${cells}<td class="actions-col ${this.templateEditMode ? "" : "hidden"}">${actions}</td></tr>`;
    }).join("");
  }

  bindIRDEditEvents(defaultCode, title) {
  const container = document.getElementById('contentArea');
  if (!container) return;
  
  container.onclick = (e) => {
    const btn = e.target.closest('[data-ird-edit], [data-ird-save], [data-ird-cancel], .ird-inline-input');
    if (!btn) return;
    
    if (btn.dataset.irdEdit) {
      e.preventDefault();
      this.startIRDEdit(btn.dataset.irdEdit);
    }
    if (btn.dataset.irdSave) {
      e.preventDefault();
      this.saveIRDEdit(btn.dataset.irdSave, defaultCode, title);
    }
    if (btn.dataset.irdCancel) {
      e.preventDefault();
      this.cancelIRDEdit(defaultCode, title);
    }
    if (btn.classList.contains('ird-inline-input')) {
      const field = btn.dataset.irdField;
      this.irdDraftData[field] = btn.value;
    }
  };
}

  startIRDEdit(rowId) {
    const row = this.templateRowsCache.find((item) => String(item.id) === String(rowId));
    if (!row) return;
    this.irdEditingRowId = row.id;
    this.irdDraftData = { ...(row.data || {}) };
    this.renderContent(this.currentTemplateCode || 'input_design_data', this.currentTemplateName);
  }

  cancelIRDEdit(defaultCode, title) {
    this.irdEditingRowId = null;
    this.irdDraftData = {};
    this.renderTemplateScreen(defaultCode, title);
  }

  async saveIRDEdit(rowId, defaultCode, title) {
    if (!rowId) return;
    await updateTemplateRow(rowId, this.irdDraftData);
    this.irdEditingRowId = null;
    this.irdDraftData = {};
    await this.renderTemplateScreen(defaultCode, title);
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
    if (this.currentView === 'docsStageP') return this.openAddDocPModal();
    if (this.currentView === 'docsStageR') {
      if (!this.docsRRows.length) await this.renderDocsStageR();
      const first = this.docsRRows[0]?.doc?.id;
      if (first) return this.openAddRevisionModal(first);
      return;
    }
    if (this.currentView === 'registryP') return this.openAddRegistryModal('phase-p', 'Ведомость комплектов ПД');
    if (this.currentView === 'registryR') return this.openAddRegistryModal('phase-r', 'Ведомость комплектов РД');
    if (this.currentView === 'workforceDaily') return this.renderWorkforceDaily();
    if (this.currentView === 'svorMain') return this.openCreateSvorModal();
    if (this.currentView === 'svorDashboard') return this.renderSvorDashboard();
    if (this.currentView === 'svorHistory') return this.renderSvorHistoryList();
    if (this.currentView === 'auth') {
      await issueDemoToken('admin');
      return alert('Demo token обновлён.');
    }
    if (this.isTemplateView(this.currentView)) {
      const resolved = this.resolveTemplateView(this.currentView);
      this.currentTemplateCode = this.currentTemplateCode || resolved.code;
      const tpl = await getTemplate(this.currentTemplateCode);
      return this.openTemplateForm(tpl, null);
    }
  }

  async handleSecondaryAction() {
    if (this.isTemplateView(this.currentView)) {
      const code = this.currentTemplateCode || this.resolveTemplateView(this.currentView).code;
      if (code === 'input_design_data') {
        this.templateEditMode = !this.templateEditMode;
        return this.renderContent();
      }
      return exportTemplate(this.selectedObjectId, code);
    }
    if (this.currentView === 'docsStageP') {
      const token = localStorage.getItem('cm_token');
      const project = this.currentProject();
      const url = `/api/v1/projects/${project.id}/docs/p/export.xlsx`;
      window.open(url + (token ? `?token=${encodeURIComponent(token)}` : ''), '_blank');
      return;
    }
    if (this.currentView === 'docsStageR') return this.renderDocsStageR();
    if (this.currentView === 'registryP') return this.renderRegistry('phase-p', 'Ведомость комплектов ПД');
    if (this.currentView === 'registryR') return this.renderRegistry('phase-r', 'Ведомость комплектов РД');
    if (this.currentView === 'workforceDaily') return this.renderWorkforceDaily();
    if (this.currentView === 'svorMain') {
      const project = this.currentProject();
      const q = new URLSearchParams();
      if (this.svorFilters.status) q.set('status', this.svorFilters.status);
      if (this.svorFilters.dateFrom) q.set('date_from', this.svorFilters.dateFrom);
      if (this.svorFilters.dateTo) q.set('date_to', this.svorFilters.dateTo);
      window.open(`/api/v1/projects/${project.id}/svor/report.xlsx?${q.toString()}`, '_blank');
    }
  }

  openAddRevisionModal(docRID) {
    this.modalMode = 'addDocRRevision';
    document.getElementById('modalTitle').textContent = 'Добавить изменение РД';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        <input type="hidden" id="docRId" value="${docRID}">
        <label>Номер изм.<input id="revNum" placeholder="Изм.1"></label>
        <label>Дата<input id="revDate" type="date"></label>
        <label>Комментарий<textarea id="revNote" rows="3"></textarea></label>
      </div>
    `;
    this.openModal();
  }

  async openCreateSvorModal() {
    if (!this.docsRRows.length) {
      const project = this.currentProject();
      this.docsRRows = await api(`/projects/${project.id}/docs/r`);
    }
    const options = this.docsRRows.map((r) => `<option value="${r.doc?.id}">${r.doc?.cipher_r || ''} — ${r.doc?.name || ''}</option>`).join('');
    this.modalMode = 'createSvor';
    document.getElementById('modalTitle').textContent = 'Создать запись СВОР';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        <label>Комплект РД<select id="newSvorDocR">${options}</select></label>
        <label>Дата направления<input id="newSvorSubmissionDate" type="date"></label>
        <label>Статус<select id="newSvorStatus"><option value="draft">Черновик</option><option value="sent">Направлен</option></select></label>
        <label>Примечание<textarea id="newSvorNotes" rows="3"></textarea></label>
      </div>
    `;
    this.openModal();
  }

  async openSvorHistoryModal(svorId) {
    const project = this.currentProject();
    const rows = await api(`/projects/${project.id}/svor/${svorId}/history`);
    this.modalMode = 'readonly';
    document.getElementById('modalTitle').textContent = 'История согласований СВОР';
    document.getElementById('modalBody').innerHTML = `
      <table class="table">
        <thead><tr><th>Дата</th><th>Кто</th><th>Действие</th><th>Старое</th><th>Новое</th><th>Комментарий</th></tr></thead>
        <tbody>${rows.map((h) => `<tr><td>${this.formatDate(h.action_date)}</td><td>${h.user_id || '—'}</td><td>${h.action_type || '—'}</td><td>${this.statusLabel(h.old_status)}</td><td>${this.statusLabel(h.new_status)}</td><td>${h.comment || '—'}</td></tr>`).join('')}</tbody>
      </table>
    `;
    this.openModal();
  }

  startRegistryInlineEdit(cell, stage) {
    const row = cell.closest('tr');
    const rowID = row?.dataset?.registryId;
    const field = cell.dataset.registryField;
    if (!rowID || !field) return;
    const current = String(cell.textContent || '').trim();
    const type = field.includes('date') ? 'date' : 'text';
    cell.innerHTML = `<input class="inline-editor" type="${type}" value="${current === '—' ? '' : current}">`;
    const input = cell.querySelector('input');
    if (!input) return;
    input.focus();

    const commit = async () => {
      const currentRow = this.registryRows.find((r) => String(r.id) === String(rowID));
      if (!currentRow) return this.renderRegistry(stage, stage === 'phase-p' ? 'Ведомость комплектов ПД' : 'Ведомость комплектов РД');
      const payload = {
        id: currentRow.id,
        designation: currentRow.designation || '',
        name: currentRow.name || '',
        contractor: currentRow.contractor || '',
        note: currentRow.note || '',
        issue_date_fact: currentRow.issue_date_fact ? String(currentRow.issue_date_fact).slice(0, 10) : '',
      };
      payload[field] = input.value.trim();
      await api(`/projects/${this.selectedObjectId}/design/${stage}/registry`, 'POST', payload);
      await this.renderRegistry(stage, stage === 'phase-p' ? 'Ведомость комплектов ПД' : 'Ведомость комплектов РД');
    };

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') return this.renderRegistry(stage, stage === 'phase-p' ? 'Ведомость комплектов ПД' : 'Ведомость комплектов РД');
      if (e.key === 'Enter') {
        e.preventDefault();
        await commit();
      }
    });
    input.addEventListener('blur', () => this.renderRegistry(stage, stage === 'phase-p' ? 'Ведомость комплектов ПД' : 'Ведомость комплектов РД'));
  }

  startInlineEdit(cell) {
    const row = cell.closest('tr');
    const svorId = row?.dataset?.svorRow;
    const field = cell.dataset.field;
    if (!svorId || !field) return;
    const entry = this.svorRows.find((x) => x.record?.id === svorId);
    const value = entry?.record?.[field] || '';
    const isDate = field.includes('date');
    if (field === 'status') {
      cell.innerHTML = `<select class="inline-editor"><option value="draft">Черновик</option><option value="sent">Направлен</option><option value="smh_remarks">Замечания СМХ</option><option value="rework">На доработке</option><option value="approved">Согласован</option><option value="rejected">Отклонен</option></select>`;
      const sel = cell.querySelector('select');
      sel.value = entry?.record?.status || 'draft';
      sel.addEventListener('change', () => this.patchSvorRecord(svorId, { status: sel.value }, 'inline status update'));
      return;
    }
    cell.innerHTML = `<input class="inline-editor" type="${isDate ? 'date' : 'text'}" value="${String(value || '').slice(0, 10)}">`;
    const input = cell.querySelector('input');
    input.focus();
    input.addEventListener('blur', () => this.patchSvorRecord(svorId, { [field]: input.value }, 'inline update'));
  }

  async handleSvorQuickAction(svorId, action) {
    if (action === 'approve') return this.patchSvorRecord(svorId, { status: 'approved' }, 'quick approve');
    if (action === 'remark') {
      const note = prompt('Введите замечание');
      if (!note) return;
      return this.patchSvorRecord(svorId, { status: 'smh_remarks', feedback_details: note, contractor_feedback_date: new Date().toISOString().slice(0, 10) }, note);
    }
    if (action === 'sync') return this.patchSvorRecord(svorId, { sync_version: true }, 'sync rd version');
  }

  async patchSvorRecord(svorId, patchData, comment = '') {
    const project = this.currentProject();
    const entry = this.svorRows.find((x) => x.record?.id === svorId);
    if (!entry?.record) return;
    await api(`/projects/${project.id}/svor/${svorId}`, 'PATCH', { ...patchData, comment, lock_version: entry.record.lock_version });
    await this.renderSvorMain();
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

  openAgentSummaryForm() {
    const selected = this.currentProject();
    this.modalMode = 'agentSummary';
    document.getElementById('modalTitle').textContent = 'AI-агент: сводка по проекту';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        <label>Проект
          <select id="agentProject">${this.objects.map((o) => `<option value="${o.id}" ${String(o.id) === String(selected?.id) ? 'selected' : ''}>${o.name}</option>`).join('')}</select>
        </label>
        <label>Вопрос (опционально)
          <textarea id="agentQuestion" rows="3" placeholder="Например: какие главные риски на 2 недели?"></textarea>
        </label>
        <div id="agentAnswer" class="notice">Нажмите «Спросить агента», чтобы получить сводку.</div>
      </div>
    `;
    const saveBtn = document.getElementById('saveEntity');
    if (saveBtn) saveBtn.textContent = 'Спросить агента';
    this.openModal();
  }

  removeDashboard(id) {
    if (!confirm('Удалить дашборд?')) return;
    this.state.dashboards = this.state.dashboards.filter((d) => d.id !== id);
    this.persistDashboards();
    this.renderHome();
  }

  async handleSaveModal() {
    if (this.modalMode === 'addDocRRevision') {
      const project = this.currentProject();
      const docRID = document.getElementById('docRId')?.value;
      const revision_num = document.getElementById('revNum')?.value?.trim();
      const revision_date = document.getElementById('revDate')?.value;
      const change_note = document.getElementById('revNote')?.value?.trim();
      if (!docRID || !revision_num || !revision_date) return alert('Заполните номер и дату изменения');
      await api(`/projects/${project.id}/docs/r/${docRID}/revisions`, 'POST', { revision_num, revision_date, change_note });
      this.closeModal();
      return this.renderDocsStageR();
    }

    if (this.modalMode === 'createSvor') {
      const project = this.currentProject();
      const doc_r_id = document.getElementById('newSvorDocR')?.value;
      if (!doc_r_id) return alert('Выберите комплект РД');
      await api(`/projects/${project.id}/svor`, 'POST', {
        doc_r_id,
        submission_date: document.getElementById('newSvorSubmissionDate')?.value || '',
        status: document.getElementById('newSvorStatus')?.value || 'draft',
        notes: document.getElementById('newSvorNotes')?.value || '',
      });
      this.closeModal();
      return this.renderSvorMain();
    }

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

    if (this.modalMode === 'agentSummary') {
      const saveBtn = document.getElementById('saveEntity');
      const projectId = document.getElementById('agentProject')?.value;
      const question = document.getElementById('agentQuestion')?.value?.trim() || '';
      const answerEl = document.getElementById('agentAnswer');
      if (!projectId) return alert('Выберите проект');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Запрос...';
      try {
        const payload = await api('/agent/summary', 'POST', { project_id: String(projectId), question });
        const lines = [payload.answer, '', 'Рекомендации:', ...(payload.next_actions || []).map((a, i) => `${i + 1}. ${a}`)];
        answerEl.textContent = lines.join('\n');
      } catch (error) {
        answerEl.textContent = error?.message || 'Не удалось получить ответ агента';
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Спросить агента';
      }
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
    const saveBtn = document.getElementById('saveEntity');
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Сохранить';
    }
  }

  initAIAssistantWidget() {
    if (document.getElementById('aiAssistantRoot')) return;
    const host = document.createElement('div');
    host.id = 'aiAssistantRoot';
    document.body.appendChild(host);
    this.bindAIAssistantClipboard();
    this.renderAIAssistant();
  }

  bindAIAssistantClipboard() {
    if (this.aiClipboardBound) return;
    this.aiClipboardBound = true;
    document.addEventListener('paste', async (e) => {
      if (!this.aiState.open) return;
      const items = Array.from(e.clipboardData?.items || []);
      const imgItem = items.find((it) => it.type?.startsWith('image/'));
      if (!imgItem) return;
      const file = imgItem.getAsFile();
      if (!file) return;
      e.preventDefault();
      await this.attachImageFile(file);
    });
  }

  renderAIAssistant() {
    const root = document.getElementById('aiAssistantRoot');
    if (!root) return;

    if (!this.aiState.open) {
      root.innerHTML = `<button class="ai-fab" id="aiToggleBtn" aria-label="Открыть AI ассистента">🤖</button>`;
      document.getElementById('aiToggleBtn')?.addEventListener('click', () => {
        this.aiState.open = true;
        this.aiState.minimized = false;
        this.renderAIAssistant();
      });
      return;
    }

    const messages = this.aiState.messages.map((m) => `
      <div class="ai-msg ${m.role}"><div class="ai-bubble">${m.text.replaceAll('<', '&lt;')}</div></div>
    `).join('');

    root.innerHTML = `
      <section class="ai-widget ${this.aiState.minimized ? 'min' : ''}">
        <header class="ai-head" id="aiHeadToggle">
          <strong>🤖 AI Ассистент</strong>
          <div class="ai-head-actions">
            <button class="ai-icon-btn" id="aiMinBtn" title="Свернуть">${this.aiState.minimized ? '▢' : '—'}</button>
            <button class="ai-icon-btn" id="aiCloseBtn" title="Закрыть">✕</button>
          </div>
        </header>
        <div class="ai-body">
          <div class="ai-messages" id="aiMessages">
            ${messages || '<div class="notice">Задайте вопрос по текущему проекту.</div>'}
          </div>
          ${this.aiState.screenshotDataUrl ? `<div class="ai-attachment">📎 ${this.aiState.screenshotName || 'Снимок экрана'} <button id="aiClearShot" class="mini">Удалить</button></div>` : ''}
          <div class="ai-input-row">
            <input id="aiInput" class="ai-input" placeholder="Спросите по проекту..." value="${this.aiState.input.replaceAll('"', '&quot;')}">
            <button id="aiUploadBtn" class="mini" title="Прикрепить изображение">📎</button>
            <button id="aiShotBtn" class="mini" title="Снимок экрана">📸</button>
            <button id="aiSendBtn" class="primary" ${this.aiState.loading ? 'disabled' : ''}>➤</button>
          </div>
          <input type="file" id="aiFileInput" accept="image/*" style="display:none">
        </div>
      </section>
    `;

    document.getElementById('aiHeadToggle')?.addEventListener('click', (e) => {
      if (e.target?.id === 'aiCloseBtn' || e.target?.id === 'aiMinBtn') return;
      this.aiState.minimized = !this.aiState.minimized;
      this.renderAIAssistant();
    });
    document.getElementById('aiCloseBtn')?.addEventListener('click', () => {
      this.aiState.open = false;
      this.renderAIAssistant();
    });
    document.getElementById('aiMinBtn')?.addEventListener('click', () => {
      this.aiState.minimized = !this.aiState.minimized;
      this.renderAIAssistant();
    });
    document.getElementById('aiInput')?.addEventListener('input', (e) => {
      this.aiState.input = e.target.value;
    });
    document.getElementById('aiInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendAIMessage();
    });
    document.getElementById('aiSendBtn')?.addEventListener('click', () => this.sendAIMessage());
    document.getElementById('aiUploadBtn')?.addEventListener('click', () => document.getElementById('aiFileInput')?.click());
    document.getElementById('aiFileInput')?.addEventListener('change', async (e) => {
      const [file] = Array.from(e.target.files || []);
      if (!file) return;
      await this.attachImageFile(file);
      e.target.value = '';
    });
    document.getElementById('aiShotBtn')?.addEventListener('click', () => this.captureScreenshotArea());
    document.getElementById('aiClearShot')?.addEventListener('click', () => {
      this.aiState.screenshotDataUrl = '';
      this.aiState.screenshotName = '';
      this.renderAIAssistant();
    });

    const box = document.getElementById('aiMessages');
    if (box) box.scrollTop = box.scrollHeight;
  }

  async sendAIMessage() {
    const text = this.aiState.input.trim();
    if (!text || this.aiState.loading) return;

    this.aiState.messages.push({ role: 'user', text });
    this.aiState.input = '';
    this.aiState.loading = true;
    this.renderAIAssistant();

    const token = localStorage.getItem('cm_token');
    const projectId = String(this.selectedObjectId || this.objects[0]?.id || '');
    let assistantText = '';
    this.aiState.messages.push({ role: 'assistant', text: '' });
    this.renderAIAssistant();

    try {
      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message: text,
          screenshot: this.aiState.screenshotDataUrl || '',
          screenshot_name: this.aiState.screenshotName || '',
          context: {
            project_id: projectId,
            route: this.currentView,
            selected_doc: this.currentTemplateCode || '',
          },
        }),
      });

      if (!res.ok || !res.body) throw new Error(`AI недоступен (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() || '';
        for (const evt of events) {
          const eventMatch = evt.match(/event:\s*(\w+)/);
          const dataMatch = evt.match(/data:\s*(.*)/);
          const eventType = eventMatch?.[1] || 'token';
          const data = dataMatch?.[1] || '{}';
          if (eventType === 'token') {
            try {
              const parsed = JSON.parse(data);
              assistantText += parsed.text || '';
            } catch {
              assistantText += data;
            }
            this.aiState.messages[this.aiState.messages.length - 1].text = assistantText;
            this.renderAIAssistant();
          }
        }
      }

      this.aiState.screenshotDataUrl = '';
      this.aiState.screenshotName = '';
    } catch (error) {
      this.aiState.messages[this.aiState.messages.length - 1].text = error?.message || 'Не удалось получить ответ.';
    } finally {
      this.aiState.loading = false;
      this.renderAIAssistant();
    }
  }

  async attachImageFile(file) {
    if (!file.type?.startsWith('image/')) {
      alert('Поддерживаются только изображения.');
      return;
    }
    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      alert('Слишком большой файл. Максимум 8 МБ.');
      return;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      reader.readAsDataURL(file);
    });

    this.aiState.screenshotDataUrl = String(dataUrl || '');
    this.aiState.screenshotName = file.name || `image_${Date.now()}.png`;
    this.renderAIAssistant();
  }

  async captureScreenshotArea() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      alert('Ваш браузер не поддерживает захват экрана.');
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
    } catch {
      return;
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    await video.play();

    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = video.videoWidth;
    frameCanvas.height = video.videoHeight;
    frameCanvas.getContext('2d')?.drawImage(video, 0, 0);
    stream.getTracks().forEach((t) => t.stop());

    const overlay = document.createElement('div');
    overlay.className = 'ai-capture-overlay';
    overlay.innerHTML = `
      <div class="ai-capture-hint">Выделите область мышью. Esc — отмена.</div>
      <img src="${frameCanvas.toDataURL('image/png')}" class="ai-capture-image" alt="capture">
      <div class="ai-capture-rect" id="aiCaptureRect"></div>
    `;
    document.body.appendChild(overlay);

    const img = overlay.querySelector('.ai-capture-image');
    const rect = overlay.querySelector('#aiCaptureRect');
    let startX = 0;
    let startY = 0;
    let drawing = false;

    const cleanup = () => {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
    };

    const onKey = (e) => { if (e.key === 'Escape') cleanup(); };
    document.addEventListener('keydown', onKey);

    img.addEventListener('mousedown', (e) => {
      drawing = true;
      startX = e.offsetX;
      startY = e.offsetY;
      rect.style.display = 'block';
      rect.style.left = `${startX}px`;
      rect.style.top = `${startY}px`;
      rect.style.width = '0px';
      rect.style.height = '0px';
    });

    img.addEventListener('mousemove', (e) => {
      if (!drawing) return;
      const x = Math.min(e.offsetX, startX);
      const y = Math.min(e.offsetY, startY);
      const w = Math.abs(e.offsetX - startX);
      const h = Math.abs(e.offsetY - startY);
      rect.style.left = `${x}px`;
      rect.style.top = `${y}px`;
      rect.style.width = `${w}px`;
      rect.style.height = `${h}px`;
    });

    img.addEventListener('mouseup', (e) => {
      if (!drawing) return;
      drawing = false;
      const x1 = Math.min(e.offsetX, startX);
      const y1 = Math.min(e.offsetY, startY);
      const w = Math.abs(e.offsetX - startX);
      const h = Math.abs(e.offsetY - startY);
      if (w < 8 || h < 8) {
        cleanup();
        return;
      }

      const crop = document.createElement('canvas');
      crop.width = w;
      crop.height = h;
      crop.getContext('2d')?.drawImage(frameCanvas, x1, y1, w, h, 0, 0, w, h);
      this.aiState.screenshotDataUrl = crop.toDataURL('image/jpeg', 0.92);
      this.aiState.screenshotName = `capture_${Date.now()}.jpg`;
      cleanup();
      this.renderAIAssistant();
    });
  }

  isTemplateView(view) {
    return ['tep', 'designSchedule', 'designScheduleR', 'estimate', 'smrSchedule'].includes(view) || String(view || '').startsWith('template:');
  }

  isKnownView(view) {
    return [
      'home', 'projects', 'auth', 'tep', 'designSchedule', 'designScheduleR', 'smrSchedule', 'estimate',
      'docsStageP', 'docsStageR', 'registryP', 'registryR', 'workforceDaily',
      'protocolInternal', 'protocolDesign', 'protocolSMR',
      'svorMain', 'svorHistory', 'svorDashboard',
    ].includes(view);
  }

  resolveTemplateView(view) {
    if (view === 'tep') return { code: 'tep', title: 'ТЭП' };
    if (view === 'designSchedule') return { code: 'design_schedule', title: 'График проектирования' };
    if (view === 'designScheduleR') return { code: 'design_schedule', title: 'График РД' };
    if (view === 'smrSchedule') return { code: 'smr_schedule', title: 'График СМР' };
    if (view === 'estimate') return { code: 'summary_estimate', title: 'Сметная документация' };
    if (String(view || '').startsWith('template:')) {
      const rawCode = String(view).replace('template:', '') || 'tep';
      const aliases = {
        ird: 'input_design_data',
      };
      const code = aliases[rawCode] || rawCode;
      if (code === 'input_design_data') return { code, title: 'ИРД — исходные данные для проектирования' };
      return { code, title: `Таблица: ${code}` };
    }
    return { code: 'tep', title: 'ТЭП' };
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.ui = new ConstructionManagerUI();
});
