import { api, issueDemoToken } from './api.js';
import {
  listTemplates,
  getTemplate,
  listTemplateRows,
  createTemplateRow,
  updateTemplateRow,
  deleteTemplateRow,
  updateIrdRow,
  deleteIrdRow,
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
      tableLoading: false,
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
    this.ganttScope = 'page';
    this.ganttScale = 'day';
    this.editRowId = null;
    this.templateAutoCalculatedFields = new Set();
    this.projectsMenuOpen = true;
    this.expandedProjects = new Set();
    this.expandedMenuNodes = new Set();
    this.projectMenus = {};
    this.dashboardTimer = null;
    this.projectsTimer = null;
    this.touchStartX = null;
    this.dashboardMetrics = {};
    this.isCreatingProject = false; // Флаг для блокировки повторных кликов при создании проекта
    this.templateEditModes = {};
    this.registryEditModes = { 'phase-p': false, 'phase-r': false };
    this.templateRowsCache = [];
    this.irdEditingRowId = null;
    this.irdDraftData = {};
    this.docsPRows = [];
    this.docsRRows = [];
    this.registryRows = [];
    this.registryStage = null;
    this.registryTitle = '';
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
    this.importDraft = null;
    this.aiClipboardBound = false;
    this.renderNonce = 0;

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
        const view = this.isKnownView(rawView) || rawView.startsWith('template:') ? rawView : `template:${rawView}`;
        this.switchView(view, item.dataset.viewTitle, { collapseMobile: item.dataset.hasChildren !== 'true' });
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
    const menu = this.sanitizeProjectMenu(this.projectMenus[projectId] || []);
    return this.renderMenuNodes(projectId, menu || [], 1);
  }

  sanitizeProjectMenu(nodes = []) {
    const cloned = (nodes || []).map((n) => ({ ...n, children: this.sanitizeProjectMenu(n.children || []) }));
    const designNode = cloned.find((node) => String(node.title || '').trim() === 'Проектирование');
    if (!designNode || !Array.isArray(designNode.children)) return cloned;
    const hasStageP = designNode.children.some((child) => String(child.title || '').trim() === 'Стадия П');
    if (!hasStageP) return cloned;
    const hiddenDocsArchiveItems = new Set(['ИРД', 'Изыскания', 'Стадия П', 'Экспертиза', 'Стадия Р']);
    designNode.children = designNode.children
      .filter((child) => !['ТЭП', 'График проектирования'].includes(String(child.title || '').trim()))
      .map((child) => {
        const normalized = String(child.title || '').trim();
        if (normalized.endsWith('(архив)')) {
          const clean = normalized.replace(/\s*\(архив\)\s*$/i, '').trim();
          if (hiddenDocsArchiveItems.has(clean)) return null;
          return { ...child, title: clean };
        }
        return child;
      })
      .filter(Boolean);
    const expertiseNode = designNode.children.find((child) => String(child.title || '').trim() === 'Экспертиза');
    if (expertiseNode && Array.isArray(expertiseNode.children)) {
      expertiseNode.children = expertiseNode.children.filter((child) => String(child.title || '').trim() !== 'Заключение Р');
    }
    return cloned;
  }

  renderMenuNodes(projectId, nodes, level = 1) {
    return (nodes || []).map((node) => {
      const nodeKey = `${projectId}:${node.id}`;
      const hasChildren = Array.isArray(node.children) && node.children.length > 0;
      const expanded = hasChildren && this.expandedMenuNodes.has(nodeKey);
      const marker = hasChildren ? (expanded ? '▼ ' : '▶ ') : '';
      const resolvedView = node.view_key || this.resolveMenuViewKey(node.title);
      const attrs = (resolvedView && !hasChildren) ? `data-view-link="${resolvedView}" data-view-title="${node.title}" data-has-children="false"` : '';
      const toggleAttrs = hasChildren ? `data-menu-toggle="${nodeKey}"` : '';
      const row = `<div class="tree-row level-${Math.min(level, 4)}" ${attrs} ${toggleAttrs}>${marker}${node.title}</div>`;
      const children = expanded ? this.renderMenuNodes(projectId, node.children || [], level + 1) : '';
      return `${row}${children}`;
    }).join('');
  }

  resolveMenuViewKey(title) {
    const map = {
      'Ведомость комплектов ПД': 'registryP',
      'Ведомость комплектов РД': 'registryR',
      'График ПД': 'designSchedule',
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
      'ИРД': 'docsArchiveIrd',
      'Изыскания': 'docsArchiveSurvey',
      'Стадия П': 'docsArchiveStageP',
      'Экспертиза': 'docsArchiveExpertise',
      'Стадия Р': 'docsArchiveStageR',
      'ИРД (архив)': 'docsArchiveIrd',
      'Изыскания (архив)': 'docsArchiveSurvey',
      'Стадия П (архив)': 'docsArchiveStageP',
      'Экспертиза (архив)': 'docsArchiveExpertise',
      'Стадия Р (архив)': 'docsArchiveStageR',
      'Шаблоны документов': 'docsTemplates',
      'ТЭП': 'tep',
      'График проектирования': 'designSchedule',
      'Заключение Р': 'docsArchiveExpertise',
    };
    const normalized = String(title || '').trim();
    const result = map[normalized] || '';
    if (!result && normalized) {
      console.warn(`[resolveMenuViewKey] Не найдено соответствие для: "${normalized}"`);
    }
    return result;
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
        ? { primary: '+ Добавить строку', secondary: this.templateEditModes[this.currentView || code] ? 'Завершить редактирование' : 'Редактировать' }
        : { primary: '+ Добавить строку', secondary: 'Экспорт в CSV' };
    }
    primary.textContent = cfg.primary;
    if (cfg.secondary) {
      secondary.style.display = 'inline-block';
      secondary.textContent = cfg.secondary;
    }
  }

  async renderContent() {
    this.renderNonce += 1;
    this.configureHeader();
    if (this.currentView === 'projects') return this.renderProjects();
    if (this.currentView === 'designSchedule') return this.renderTemplateScreen('design_schedule', 'График ПД');
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
    if (this.currentView === 'docsArchiveIrd') return this.renderDocsArchiveStub('ИРД', 'Архив оригиналов документов: МТЗ, ТЗ, ТУ, письма и исходно-разрешительная документация.');
    if (this.currentView === 'docsArchiveSurvey') return this.renderDocsArchiveStub('Изыскания', 'Раздел для отчетов по инженерным изысканиям, заключений и приложений.');
    if (this.currentView === 'docsArchiveStageP') return this.renderDocsArchiveStub('Стадия П', 'Согласованная документация после экспертизы: номер заключения, дата, состав томов.');
    if (this.currentView === 'docsArchiveExpertise') return this.renderDocsArchiveStub('Экспертиза', 'Документация до/после экспертизы, замечания и ответы, история корректировок.');
    if (this.currentView === 'docsArchiveStageR') return this.renderDocsArchiveStub('Стадия Р', 'Документация на проверку и комплект РД, переданный в производство работ.');
    if (this.currentView === 'docsTemplates') return this.renderDocsArchiveStub('Шаблоны документов', 'Шаблоны писем, реестров, сопроводительных и типовых форм по проекту.');
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
        <td>
          <button class="mini" data-edit-project="${o.id}">✏️</button>
          <button class="mini danger" data-delete-project="${o.id}">🗑</button>
        </td>
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

    document.querySelectorAll('[data-delete-project]').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteProject(btn.dataset.deleteProject));
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
    const body = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.cipher || '—'}</td>
        <td>${r.name || '—'}</td>
        <td>${r.section || '—'}</td>
        <td>
          <div class="row-actions">
            <button class="mini" data-edit-docp="${r.id}" data-cipher="${(r.cipher||'').replace(/"/g,'&quot;')}" data-name="${(r.name||'').replace(/"/g,'&quot;')}" data-section="${(r.section||'').replace(/"/g,'&quot;')}">✏️</button>
            <button class="mini danger" data-del-docp="${r.id}">🗑</button>
          </div>
        </td>
      </tr>`).join('');
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Стадия П — ведомость комплектов</h3>
        <div class="form-grid two" style="margin-bottom:12px;align-items:end">
          <label>Шифр<input id="docpCipher" placeholder="АР, КЖ, ..." style="margin-top:4px"></label>
          <label>Наименование<input id="docpName" placeholder="Архитектурные решения" style="margin-top:4px"></label>
          <label>Раздел/Блок<input id="docpSection" placeholder="Раздел 3" style="margin-top:4px"></label>
          <div style="padding-top:20px"><button id="addDocPBtn" class="mini primary">+ Добавить</button></div>
        </div>
        <table class="table">
          <thead><tr><th>№</th><th>Шифр</th><th>Наименование</th><th>Раздел/Блок</th><th></th></tr></thead>
          <tbody>${body || '<tr><td colspan="5">Нет данных</td></tr>'}</tbody>
        </table>
      </article>
    `;
    document.getElementById('addDocPBtn')?.addEventListener('click', async () => {
      const cipher = document.getElementById('docpCipher')?.value.trim();
      const name = document.getElementById('docpName')?.value.trim();
      const section = document.getElementById('docpSection')?.value.trim();
      if (!cipher) return this.showToast('Укажите шифр', 'error');
      if (!name) return this.showToast('Укажите наименование', 'error');
      try {
        await api(`/projects/${project.id}/docs/p`, 'POST', { cipher, name, section });
        await this.renderDocsStageP();
      } catch (e) { this.showToast(e.message || 'Ошибка сохранения', 'error'); }
    });
    document.querySelectorAll('[data-edit-docp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.getElementById('docpCipher').value = btn.dataset.cipher || '';
        document.getElementById('docpName').value = btn.dataset.name || '';
        document.getElementById('docpSection').value = btn.dataset.section || '';
        const addBtn = document.getElementById('addDocPBtn');
        addBtn.textContent = 'Сохранить';
        addBtn.onclick = async () => {
          const cipher = document.getElementById('docpCipher')?.value.trim();
          const name = document.getElementById('docpName')?.value.trim();
          const section = document.getElementById('docpSection')?.value.trim();
          if (!cipher || !name) return this.showToast('Заполните шифр и наименование', 'error');
          await api(`/projects/${project.id}/docs/p/${btn.dataset.editDocp}`, 'PUT', { cipher, name, section });
          await this.renderDocsStageP();
        };
      });
    });
    document.querySelectorAll('[data-del-docp]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить запись?')) return;
        await api(`/projects/${project.id}/docs/p/${btn.dataset.delDocp}`, 'DELETE');
        await this.renderDocsStageP();
      });
    });
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
          <td>
            <div class="row-actions">
              <button class="mini" data-add-rev="${r.id}">+ Изменение</button>
              <button class="mini danger" data-del-docr="${r.id}">🗑</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Стадия Р — ведомость РД</h3>
        <div class="form-grid two" style="margin-bottom:12px;align-items:end">
          <label>Шифр Р *<input id="docrCipherR" placeholder="АР.001" style="margin-top:4px"></label>
          <label>Шифр П (ссылка)<input id="docrCipherP" placeholder="АР" style="margin-top:4px"></label>
          <label>Наименование *<input id="docrName" placeholder="Архитектурные решения" style="margin-top:4px"></label>
          <label>Дата выдачи<input id="docrIssueDate" type="date" style="margin-top:4px"></label>
          <div style="padding-top:20px"><button id="addDocRBtn" class="mini primary">+ Добавить</button></div>
        </div>
        <table class="table">
          <thead><tr><th>№</th><th>Шифр П</th><th>Шифр Р</th><th>Наименование</th><th>Дата выдачи</th><th>Версия</th><th>Дата ИЗМ</th><th></th></tr></thead>
          <tbody>${body || '<tr><td colspan="8">Нет данных</td></tr>'}</tbody>
        </table>
      </article>
    `;
    document.getElementById('addDocRBtn')?.addEventListener('click', async () => {
      const cipher_r = document.getElementById('docrCipherR')?.value.trim();
      const cipher_p_ref = document.getElementById('docrCipherP')?.value.trim();
      const name = document.getElementById('docrName')?.value.trim();
      const issue_date = document.getElementById('docrIssueDate')?.value;
      if (!cipher_r) return this.showToast('Укажите шифр Р', 'error');
      if (!name) return this.showToast('Укажите наименование', 'error');
      try {
        await api(`/projects/${project.id}/docs/r`, 'POST', { cipher_r, cipher_p_ref, name, issue_date });
        await this.renderDocsStageR();
      } catch (e) { this.showToast(e.message || 'Ошибка сохранения', 'error'); }
    });
    document.querySelectorAll('[data-add-rev]').forEach((btn) => btn.addEventListener('click', () => this.openAddRevisionModal(btn.dataset.addRev)));
    document.querySelectorAll('[data-del-docr]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить документ РД?')) return;
        await api(`/projects/${project.id}/docs/r/${btn.dataset.delDocr}`, 'DELETE');
        await this.renderDocsStageR();
      });
    });
  }

  async renderRegistry(stage, title) {
    const project = this.currentProject();
    if (!project) return;
    const rows = await api(`/projects/${project.id}/design/${stage}/registry`);
    this.registryRows = Array.isArray(rows) ? rows : [];
    this.registryStage = stage;
    this.registryTitle = title;
    const isEditMode = !!this.registryEditModes[stage];
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
        <td class="${isEditMode ? '' : 'hidden'}">
          <div class="row-actions">
            <button class="mini" data-edit-registry="${r.id}">✏️</button>
            <button class="mini danger" data-del-registry="${r.id}">🗑</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>${title}</h3>
        <div class="row-actions table-toolbar" style="margin-bottom:12px;justify-content:flex-end">
          <div class="actions-dropdown" data-actions-menu="registryActions">
            <button id="registryActionsBtn" class="mini" title="Открыть меню действий" aria-label="Открыть меню действий">⚙ Действия</button>
            <div class="actions-dropdown-menu">
              <button id="addRegistryBtn" class="mini">Добавить строку</button>
              <button id="editRegistryBtn" class="mini">Редактировать: ${isEditMode ? 'вкл' : 'выкл'}</button>
              <button id="importRegistryBtn" class="mini">Импорт CSV/XLSX</button>
              <button id="exportRegistryBtn" class="mini">Экспорт XLSX</button>
            </div>
          </div>
        </div>
        <p class="metric">Редактирование включается через меню «Действия» и применяется только к текущей таблице.</p>
        <div class="table-wrap table-load-wrap ${this.state.tableLoading ? "is-loading" : ""}">
          <div class="table-loading-overlay ${this.state.tableLoading ? "" : "hidden"}"><span class="spinner"></span></div>
        <table class="table table-sticky">
          <thead><tr><th>№</th><th>Том</th><th>Шифр</th><th>Марка</th><th>Обозначение</th><th>Наименование</th><th>Исполнитель</th><th>Примечание</th><th class="${isEditMode ? '' : 'hidden'}"></th></tr></thead>
          <tbody>${body || '<tr><td colspan="9">Нет данных</td></tr>'}</tbody>
        </table>
        </div>
      </article>
    `;
    this.bindActionsDropdown('registryActions');
    document.getElementById('addRegistryBtn')?.addEventListener('click', () => this.openRegistryForm(stage, title));
    document.getElementById('editRegistryBtn')?.addEventListener('click', () => { this.registryEditModes[stage] = !this.registryEditModes[stage]; this.renderRegistry(stage, title); });
    document.getElementById('importRegistryBtn')?.addEventListener('click', () => this.startRegistryImport(stage, title));
    document.getElementById('exportRegistryBtn')?.addEventListener('click', () => this.exportRegistryXLSX(stage, title));
    if (isEditMode) {
      document.querySelectorAll('[data-registry-field]').forEach((cell) => {
        cell.addEventListener('dblclick', () => this.startRegistryInlineEdit(cell, stage));
      });
      document.querySelectorAll('[data-edit-registry]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const row = this.registryRows.find((r) => String(r.id) === String(btn.dataset.editRegistry));
          if (!row) return;
          this.openRegistryForm(stage, title, row);
        });
      });
    }
    document.querySelectorAll('[data-del-registry]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Удалить строку ведомости?')) return;
        try {
          await api(`/projects/${project.id}/design/${stage}/registry/${btn.dataset.delRegistry}`, 'DELETE');
          await this.renderRegistry(stage, title);
        } catch (e) { this.showToast(e.message || 'Ошибка удаления', 'error'); }
      });
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
      if (!task_id || !work_date) return this.showToast('Заполните задачу и дату', 'error');
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


  renderDocsArchiveStub(section, text) {
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>Документация (Проектирование) — ${section}</h3>
        <p class="notice">${text}</p>
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
    const renderNonce = this.renderNonce;
    const expectedView = this.currentView;
    const project = this.currentProject();
    if (!project) {
      document.getElementById('contentArea').innerHTML = '<article class="card col-12"><h3>Нет проектов</h3><p>Добавьте проект, чтобы работать с таблицами.</p></article>';
      return;
    }

    const resolvedCode = this.resolveTemplateView(this.currentView).code;
    const code = resolvedCode || defaultCode;
    const isIRD = code === 'input_design_data';
    const scheduleStage = code === 'design_schedule' ? (this.currentView === 'designScheduleR' ? 'R' : 'P') : '';
    let tpl;
    let rowsPayload;

    try {
      [tpl, rowsPayload] = await Promise.all([
        getTemplate(code),
        listTemplateRows(project.id, code, { page: this.templatePage, page_size: isIRD ? 200 : 20, search: this.templateSearch, ...(scheduleStage ? { schedule_stage: scheduleStage } : {}) }),
      ]);
      if (renderNonce !== this.renderNonce || expectedView !== this.currentView) return;
    } catch (error) {
      document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>${title}</h3><p>${error.message}</p></article>`;
      return;
    }

    const columns = tpl.columns || [];
    rowsPayload = await this.ensureDefaultTemplateRows(project.id, code, rowsPayload);
    if (code === 'design_schedule') rowsPayload = await this.syncScheduleRowsWithRegistry(project.id, rowsPayload, scheduleStage);
    const rows = rowsPayload.data || [];
    const pager = rowsPayload.pagination || { page: 1, total: rows.length, page_size: 20 };

    this.currentTemplateCode = code;
    const templateName = tpl.template?.name || title;
    this.currentTemplateName = (this.currentView === 'designScheduleR')
      ? 'График разработки рабочей документации'
      : templateName;
    let ganttRows = rows;
    if (code === 'design_schedule' && this.ganttScope === 'all') {
      try {
        const allPayload = await listTemplateRows(project.id, code, { page: 1, page_size: 500, search: this.templateSearch, ...(scheduleStage ? { schedule_stage: scheduleStage } : {}) });
        ganttRows = allPayload.data || rows;
      } catch (_) {
        ganttRows = rows;
      }
    }
    const ganttBlock = code === 'design_schedule' ? this.renderScheduleGantt(ganttRows, { projectId: project.id, scope: this.ganttScope, scale: this.ganttScale, stage: scheduleStage }) : '';

    document.getElementById('contentArea').innerHTML = `
      <article class="card col-12">
        <h3>${code === "tep" ? `ТЭП объекта: ${project.name}` : `${title}: ${this.currentTemplateName}`}</h3>
        <div class="row-actions" style="margin-bottom:10px;align-items:center;flex-wrap:wrap;">
          <div class="actions-dropdown" data-actions-menu="templateActions">
            <button class="mini" id="templateActionsBtn" title="Открыть меню действий" aria-label="Открыть меню действий">⚙ Действия</button>
            <div class="actions-dropdown-menu">
              <button class="mini" id="addTemplateRowBtn">Добавить строку</button>
              <button class="mini" id="editTemplateRowsBtn">Редактировать: ${this.templateEditModes[this.currentView || code] ? "вкл" : "выкл"}</button>
              <button class="mini" id="exportTemplateBtn">Экспорт XLSX</button>
              <button class="mini" id="importTemplateBtn">Импорт CSV/XLSX</button>
            </div>
          </div>
          <input id="templateSearch" placeholder="Поиск" value="${this.templateSearch}">
          <button class="mini" id="templateSearchBtn">Найти</button>
          <span class="metric">Стр. ${pager.page}, всего ${pager.total}</span>
          <button class="mini" id="prevPage">←</button>
          <button class="mini" id="nextPage">→</button>
        </div>
        ${ganttBlock}
        <div class="table-wrap table-load-wrap ${this.state.tableLoading ? "is-loading" : ""}">
          <div class="table-loading-overlay ${this.state.tableLoading ? "" : "hidden"}"><span class="spinner"></span></div>
        <table class="table ${isIRD ? 'table-sticky-head' : ''}">
          <thead><tr>${columns.map((c) => `<th>${this.normalizeTemplateColumnTitle(code, c)}</th>`).join('')}<th class="actions-col ${this.templateEditModes[this.currentView || code] ? "" : "hidden"}">Действия</th></tr></thead>
          <tbody>
            ${this.renderTemplateRows(code, rows, columns) || `<tr><td colspan="${columns.length + 1}">Нет данных</td></tr>`}
          </tbody>
        </table>
        </div>
      </article>
    `;

    this.bindActionsDropdown('templateActions');
    document.getElementById('templateSearchBtn').onclick = () => {
      this.templateSearch = document.getElementById('templateSearch').value.trim();
      this.templatePage = 1;
      this.renderTemplateScreen(defaultCode, title);
    };
    document.getElementById('prevPage').onclick = () => { this.templatePage = Math.max(1, this.templatePage - 1); this.renderTemplateScreen(defaultCode, title); };
    document.getElementById('nextPage').onclick = () => { if (pager.page * pager.page_size < pager.total) this.templatePage += 1; this.renderTemplateScreen(defaultCode, title); };
    document.getElementById('addTemplateRowBtn').onclick = () => this.openTemplateForm(tpl, null);
    document.getElementById('editTemplateRowsBtn').onclick = () => { const key = this.currentView || code; this.templateEditModes[key] = !this.templateEditModes[key]; this.renderTemplateScreen(defaultCode, title); };
    document.getElementById('exportTemplateBtn').onclick = () => {
      if (code === 'design_schedule') return this.exportCurrentScheduleXLSX();
      return this.exportTemplateXLSX(project.id, code);
    };
    document.getElementById('importTemplateBtn').onclick = () => this.startTemplateImport();
    if (code === 'design_schedule') {
      document.querySelectorAll('[data-gantt-scope]').forEach((btn) => btn.onclick = async () => {
        this.ganttScope = btn.dataset.ganttScope;
        await this.renderTemplateScreen(defaultCode, title);
      });
      document.querySelectorAll('[data-gantt-scale]').forEach((btn) => btn.onclick = async () => {
        this.ganttScale = btn.dataset.ganttScale;
        await this.renderTemplateScreen(defaultCode, title);
      });
    }
    document.querySelectorAll('[data-edit-row]').forEach((btn) => { btn.onclick = () => this.openTemplateForm(tpl, rows.find((r) => String(r.id) === String(btn.dataset.editRow))); });
    document.querySelectorAll('[data-del-row]').forEach((btn) => { btn.onclick = async () => { if (!confirm("Удалить строку?")) return; await deleteTemplateRow(btn.dataset.delRow); if (["tep", "summary_estimate"].includes(code)) await this.refreshDashboardMetrics(); await this.renderTemplateScreen(defaultCode, title); }; });
    document.querySelectorAll("[data-move-row]").forEach((btn) => { btn.onclick = async () => { const [rowId, direction] = String(btn.dataset.moveRow).split(":"); await this.moveTemplateRow(code, rowId, direction); await this.renderTemplateScreen(defaultCode, title); }; });
    if (isIRD) {
      this.bindIRDEditEvents(defaultCode, title);
    }
  }

  renderScheduleGantt(rows, options = {}) {
    const scope = options.scope || 'page';
    const scale = options.scale || 'day';
    const prepared = (rows || []).map((r) => r.data || {}).map((d) => ({
      name: d.name || d.code || d.volume_no || 'Этап',
      start: d.fact_start || d.baseline_start || '',
      end: d.fact_end || d.baseline_end || '',
      progress: Number(d.progress || 0),
    })).filter((x) => x.start && x.end);
    if (!prepared.length) {
      return `<div class="gantt-wrap"><div class="metric">Диаграмма Ганта: недостаточно дат для построения.</div></div>`;
    }
    const stamps = prepared.flatMap((x) => [new Date(`${x.start}T00:00:00`).getTime(), new Date(`${x.end}T00:00:00`).getTime()]);
    const minTs = Math.min(...stamps);
    const maxTs = Math.max(...stamps);
    const divisor = scale === 'month' ? 30 : 1;
    const total = Math.max(1, ((maxTs - minTs) / 86400000) / divisor);
    const bars = prepared.map((x) => {
      const s = new Date(`${x.start}T00:00:00`).getTime();
      const e = new Date(`${x.end}T00:00:00`).getTime();
      const left = (((s - minTs) / 86400000) / divisor) / total * 100;
      const width = Math.max(1, ((((e - s) / 86400000) / divisor) / total) * 100);
      const progress = Math.max(0, Math.min(100, Number.isFinite(x.progress) ? x.progress : 0));
      return `<div class="gantt-row">
        <div class="gantt-name" title="${x.name}">${x.name}</div>
        <div class="gantt-track">
          <div class="gantt-bar" style="left:${left}%;width:${width}%"><span style="width:${progress}%"></span></div>
        </div>
        <div class="gantt-dates">${x.start} → ${x.end}</div>
      </div>`;
    }).join('');
    return `<div class="gantt-wrap">
      <div class="gantt-header"><strong>Диаграмма Ганта</strong><span class="metric">${scope === 'all' ? 'по всем строкам' : 'по текущей странице'} (${prepared.length} задач)</span></div>
      <div class="row-actions" style="margin-bottom:8px;gap:6px;">
        <button class="mini ${scope === 'page' ? 'primary' : ''}" data-gantt-scope="page">Текущая страница</button>
        <button class="mini ${scope === 'all' ? 'primary' : ''}" data-gantt-scope="all">Все строки</button>
        <button class="mini ${scale === 'day' ? 'primary' : ''}" data-gantt-scale="day">Дни</button>
        <button class="mini ${scale === 'month' ? 'primary' : ''}" data-gantt-scale="month">Месяцы</button>
      </div>
      ${bars}
    </div>`;
  }

  bindActionsDropdown(menuName) {
    const dropdown = document.querySelector(`[data-actions-menu="${menuName}"]`);
    if (!dropdown) return;
    const trigger = dropdown.querySelector('button');
    if (!trigger) return;
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const shouldOpen = !dropdown.classList.contains('open');
      document.querySelectorAll('.actions-dropdown.open').forEach((item) => item.classList.remove('open'));
      if (shouldOpen) dropdown.classList.add('open');
    });

    dropdown.querySelectorAll('.actions-dropdown-menu .mini').forEach((btn) => {
      btn.addEventListener('click', () => dropdown.classList.remove('open'));
    });

    const closeOnOutsideClick = (e) => {
      if (!dropdown.contains(e.target)) {
        dropdown.classList.remove('open');
        document.removeEventListener('click', closeOnOutsideClick);
      }
    };
    document.addEventListener('click', closeOnOutsideClick);
  }

  async syncScheduleRowsWithRegistry(projectId, rowsPayload, scheduleStage = 'P') {
    const registryStage = scheduleStage === 'R' ? 'phase-r' : 'phase-p';
    let registry = [];
    try {
      const payload = await api(`/projects/${projectId}/design/${registryStage}/registry`);
      registry = Array.isArray(payload) ? payload : [];
    } catch (_) {
      return rowsPayload;
    }
    const allRowsPayload = await listTemplateRows(projectId, 'design_schedule', { page: 1, page_size: 500, search: '', schedule_stage: scheduleStage });
    const existing = [...(allRowsPayload.data || [])].sort((a, b) => (a.row_number || 0) - (b.row_number || 0));

    // Оптимизация: не обновляем строки на каждом рендере.
    // Автосоздание выполняем только если для стадии пока нет строк,
    // чтобы не тормозить меню/переключение экранов множеством PATCH/POST.
    if (existing.length === 0 && registry.length > 0) {
      for (let i = 0; i < registry.length; i += 1) {
        const item = registry[i];
        const base = {
          volume_no: item.volume_number || String(i + 1),
          code: item.designation || item.code || '',
          name: item.name || '',
          executor: item.contractor || '',
          schedule_stage: scheduleStage,
        };
        await createTemplateRow(projectId, 'design_schedule', base);
      }
    }
    const refreshed = await listTemplateRows(projectId, 'design_schedule', { page: 1, page_size: 500, search: this.templateSearch, schedule_stage: scheduleStage });
    const filtered = refreshed.data || [];
    const pageSize = 20;
    const page = Math.max(1, this.templatePage);
    const start = (page - 1) * pageSize;
    const end = Math.min(filtered.length, start + pageSize);
    return {
      data: filtered.slice(start, end),
      pagination: { page, page_size: pageSize, total: filtered.length },
    };
  }

  async forceSyncScheduleFromRegistry(projectId, stage = 'phase-p') {
    const scheduleStage = stage === 'phase-r' ? 'R' : 'P';
    const payload = await api(`/projects/${projectId}/design/${stage}/registry`);
    const registry = Array.isArray(payload) ? payload : [];
    if (!registry.length) return;
    const schedulePayload = await listTemplateRows(projectId, 'design_schedule', { page: 1, page_size: 500, search: '', schedule_stage: scheduleStage });
    const existing = schedulePayload.data || [];
    const byCode = new Map(existing.map((row) => [String((row.data || {}).code || '').trim().toLowerCase(), row]));
    for (let i = 0; i < registry.length; i += 1) {
      const item = registry[i];
      const code = String(item.designation || item.code || '').trim();
      const normalized = code.toLowerCase();
      const base = {
        volume_no: item.volume_number || String(i + 1),
        code,
        name: item.name || '',
        executor: item.contractor || '',
        schedule_stage: scheduleStage,
      };
      const current = byCode.get(normalized);
      if (!current) {
        await createTemplateRow(projectId, 'design_schedule', base);
      } else {
        await updateTemplateRow(current.id, { ...(current.data || {}), ...base });
      }
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
    return rows.map((r) => `<tr>${columns.map((c) => `<td>${(r.data || {})[c.field_key] ?? ""}</td>`).join("")}<td class="actions-col ${this.templateEditModes[this.currentView || code] ? "" : "hidden"}"><div class="row-actions"><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button><button class="mini" data-move-row="${r.id}:up">↑</button><button class="mini" data-move-row="${r.id}:down">↓</button></div></td></tr>`).join("");
  }

  formatDisplayDate(value) {
    if (!value) return '';
    const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return value;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  showToast(message, type = 'success') {
    const root = document.getElementById('toastRoot') || (() => {
      const el = document.createElement('div');
      el.id = 'toastRoot';
      el.className = 'toast-root';
      document.body.appendChild(el);
      return el;
    })();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<button class="toast-close" aria-label="Закрыть">✕</button><div>${message}</div>`;
    root.appendChild(toast);
    const close = () => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); };
    toast.querySelector('.toast-close')?.addEventListener('click', close);
    setTimeout(close, 5000);
  }

  async withTableLoading(action) {
    this.state.tableLoading = true;
    document.querySelectorAll('.table-load-wrap').forEach((el) => el.classList.add('is-loading'));
    document.querySelectorAll('.table-loading-overlay').forEach((el) => el.classList.remove('hidden'));
    try { return await action(); }
    finally {
      this.state.tableLoading = false;
      document.querySelectorAll('.table-load-wrap').forEach((el) => el.classList.remove('is-loading'));
      document.querySelectorAll('.table-loading-overlay').forEach((el) => el.classList.add('hidden'));
    }
  }

  renderIRDRows(rows, columns) {
    const code = this.currentTemplateCode || 'input_design_data';
    return rows.map((r) => {
      const isRowEditing = this.irdEditingRowId != null && String(this.irdEditingRowId) === String(r.id);
      const cells = columns.map((c) => {
        const current = isRowEditing ? (this.irdDraftData[c.field_key] ?? '') : ((r.data || {})[c.field_key] ?? '');
        if (!isRowEditing) return `<td>${c.data_type === 'date' ? this.formatDisplayDate(current) : current}</td>`;
        const type = c.data_type === 'number' ? 'number' : c.data_type === 'date' ? 'date' : 'text';
        return `<td><input class="ird-inline-input" data-ird-field="${c.field_key}" type="${type}" value="${current}"></td>`;
      }).join('');
      const actions = !this.templateEditModes[this.currentView || code]
        ? ''
        : `<div class="row-actions">
            ${isRowEditing
              ? `<button class="mini" data-ird-save="${r.id}">Сохранить</button><button class="mini" data-ird-cancel="${r.id}">Отмена</button>`
              : `<button class="mini" data-ird-edit="${r.id}">Ред.</button>`
            }
            <button class="mini danger" data-del-ird="${r.id}">Удал.</button>
            <button class="mini" data-move-row="${r.id}:up">↑</button>
            <button class="mini" data-move-row="${r.id}:down">↓</button>
          </div>`;
      return `<tr>${cells}<td class="actions-col ${this.templateEditModes[this.currentView || code] ? "" : "hidden"}">${actions}</td></tr>`;
    }).join("");
  }

  bindIRDEditEvents(defaultCode, title) {
    const container = document.getElementById('contentArea');
    if (!container) return;

    container.onclick = async (e) => {
      const btn = e.target.closest('[data-ird-edit], [data-ird-save], [data-ird-cancel], [data-del-ird], .ird-inline-input');
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
      if (btn.dataset.delIrd) {
        e.preventDefault();
        if (!confirm('Удалить строку ИРД?')) return;
        await deleteIrdRow(btn.dataset.delIrd);
        await this.renderTemplateScreen(defaultCode, title);
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
    this.renderTemplateScreen(this.currentTemplateCode || 'input_design_data', this.currentTemplateName || 'ИРД');
  }

  cancelIRDEdit(defaultCode, title) {
    this.irdEditingRowId = null;
    this.irdDraftData = {};
    this.renderTemplateScreen(defaultCode, title);
  }

  async saveIRDEdit(rowId, defaultCode, title) {
    if (!rowId) return;
    const irdError = this.validateIrdDates(this.irdDraftData || {});
    if (irdError) {
      this.showToast(irdError, 'error');
      return;
    }
    try {
      await this.withTableLoading(async () => {
        await updateIrdRow(rowId, this.irdDraftData);
        this.irdEditingRowId = null;
        this.irdDraftData = {};
        await this.renderTemplateScreen(defaultCode, title);
      });
      this.showToast('Данные добавлены/обновлены.', 'success');
    } catch (error) {
      this.showToast(`Ошибка сохранения: ${error?.message || 'неизвестная ошибка'}`, 'error');
      throw error;
    }
  }

  renderTEPSectionedRows(rows, columns) {
    const code = this.currentTemplateCode || 'tep';
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
      const body = grouped[i].map((r) => `<tr>${columns.map((c) => `<td>${(r.data || {})[c.field_key] ?? ""}</td>`).join("")}<td class="actions-col ${this.templateEditModes[this.currentView || code] ? "" : "hidden"}"><div class="row-actions"><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button><button class="mini" data-move-row="${r.id}:up">↑</button><button class="mini" data-move-row="${r.id}:down">↓</button></div></td></tr>`).join("");
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
    if ((this.currentTemplateCode || this.resolveTemplateView(this.currentView).code) === 'design_schedule') {
      this.templateAutoCalculatedFields = new Set();
      setTimeout(() => this.bindDesignScheduleAutocalc(), 0);
    }
    this.openModal();
  }

  bindDesignScheduleAutocalc() {
    const all = Array.from(document.querySelectorAll('#modalBody [data-field]'));
    const byField = Object.fromEntries(all.map((el) => [el.dataset.field, el]));
    const pairs = [
      { start: 'baseline_start', end: 'baseline_end', days: 'baseline_days' },
      { start: 'fact_start', end: 'fact_end', days: 'fact_days' },
    ];
    const parseDate = (v) => (v ? new Date(`${v}T00:00:00`) : null);
    const toYMD = (d) => d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '';
    const daysBetween = (a, b) => Math.round((b - a) / 86400000);
    const recalc = (group) => {
      const s = byField[group.start]; const e = byField[group.end]; const d = byField[group.days];
      if (!s || !e || !d) return;
      [s, e, d].forEach((el) => el.classList.remove('auto-calculated'));
      const start = parseDate(s.value); const end = parseDate(e.value);
      const daysRaw = String(d.value || '').trim();
      const days = daysRaw === '' ? null : Number(daysRaw);
      if (start && end && (days === null || Number.isNaN(days))) {
        d.value = String(daysBetween(start, end));
        d.classList.add('auto-calculated'); this.templateAutoCalculatedFields.add(group.days); return;
      }
      if (start && Number.isFinite(days) && !end) {
        e.value = toYMD(new Date(start.getTime() + days * 86400000));
        e.classList.add('auto-calculated'); this.templateAutoCalculatedFields.add(group.end); return;
      }
      if (end && Number.isFinite(days) && !start) {
        s.value = toYMD(new Date(end.getTime() - days * 86400000));
        s.classList.add('auto-calculated'); this.templateAutoCalculatedFields.add(group.start);
      }
    };
    all.forEach((el) => el.addEventListener('input', () => pairs.forEach(recalc)));
  }

  openProjectForm() {
    this.state.editProjectId = null;
    this.modalMode = 'createProject';
    this.isCreatingProject = false; // Сброс флага при открытии формы
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
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
            <h4 style="margin:0;">Основная информация</h4>
            <button type="button" class="mini danger" data-delete-project-in-modal="${id}">Удалить проект</button>
          </div>
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
      document.querySelector('[data-delete-project-in-modal]')?.addEventListener('click', async () => {
        const deleteId = String(id);
        const deleted = await this.deleteProject(deleteId);
        if (deleted) this.closeModal();
      });
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

  validateIrdDates(data) {
    const issue = String(data?.issue_date || '').trim();
    const expiry = String(data?.expiry_date || '').trim();
    if (!issue || !expiry) return null;
    const issueDate = new Date(issue);
    const expiryDate = new Date(expiry);
    if (Number.isNaN(issueDate.getTime()) || Number.isNaN(expiryDate.getTime())) return null;
    if (expiryDate < issueDate) return 'Срок действия (expiry_date) не может быть раньше даты выдачи (issue_date)';
    return null;
  }

  async deleteProject(id) {
    if (!confirm('Вы уверены, что хотите удалить этот проект? Это действие нельзя отменить.')) return false;
    try {
      await api(`/objects/${id}`, 'DELETE');
      await this.loadObjects();
      this.renderProjectTree();
      this.renderProjects();
      if (this.selectedObjectId === id) {
        this.selectedObjectId = this.objects[0]?.id || null;
      }
      return true;
    } catch (e) {
      this.showToast('Ошибка удаления проекта: ' + (e.message || 'Неизвестная ошибка'), 'error');
      return false;
    }
  }

  openRegistryForm(stage, title, row = null) {
    this.modalMode = 'registryAdd';
    document.getElementById('modalTitle').textContent = row ? `${title}: редактировать строку` : `${title}: добавить строку`;
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid two">
        <label>Обозначение *<input id="regDesignation" value="${(row?.designation || '').replace(/"/g, '&quot;')}" placeholder="АР.001-ПД" style="margin-top:4px"></label>
        <label>Наименование *<input id="regName" value="${(row?.name || '').replace(/"/g, '&quot;')}" placeholder="Архитектурные решения" style="margin-top:4px"></label>
        <label>Марка<input id="regMark" value="${(row?.mark || '').replace(/"/g, '&quot;')}" placeholder="АР" style="margin-top:4px"></label>
        <label>Шифр<input id="regCode" value="${(row?.code || '').replace(/"/g, '&quot;')}" placeholder="001" style="margin-top:4px"></label>
        <label>Исполнитель<input id="regContractor" value="${(row?.contractor || '').replace(/"/g, '&quot;')}" style="margin-top:4px"></label>
        <label>Дата выдачи факт<input id="regIssueDate" type="date" value="${row?.issue_date_fact ? String(row.issue_date_fact).slice(0, 10) : ''}" style="margin-top:4px"></label>
      </div>
    `;
    this.importDraft = { kind: row ? 'registry-edit' : 'registry-add', stage, title, rowId: row?.id };
    this.openModal();
  }

  normalizeImportToken(value) {
    return String(value || '')
      .replace(/^\uFEFF/, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
  }

  parseCSV(text) {
    const firstLine = String(text || '').split(/\r?\n/, 1)[0] || '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';
    const rows = [];
    let current = '';
    let row = [];
    let inQuotes = false;
    const pushCell = () => { row.push(current.trim()); current = ''; };
    const pushRow = () => {
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    };
    for (let i = 0; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '"') {
        if (inQuotes && text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else inQuotes = !inQuotes;
      } else if (ch === delimiter && !inQuotes) pushCell();
      else if ((ch === '\n' || ch === '\r') && !inQuotes) {
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
        pushCell();
        pushRow();
      } else current += ch;
    }
    pushCell();
    pushRow();
    return rows;
  }

  async pickFile(accept = '.csv') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.onchange = () => resolve(input.files?.[0] || null);
      input.click();
    });
  }

  async parseSpreadsheetRows(file) {
    const name = String(file?.name || '').toLowerCase();
    if (name.endsWith('.csv')) return this.parseCSV(await file.text());
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      if (!window.XLSX) throw new Error('Библиотека XLSX не загружена');
      const buffer = await file.arrayBuffer();
      const workbook = window.XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) return [];
      const sheet = workbook.Sheets[sheetName];
      return window.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    }
    throw new Error('Поддерживаются только файлы CSV/XLSX');
  }

  async startTemplateImport() {
    const project = this.currentProject();
    if (!project) return;
    const code = this.currentTemplateCode || this.resolveTemplateView(this.currentView).code;
    const isIRD = code === 'input_design_data';
    const tpl = await getTemplate(code);
    const file = await this.pickFile('.csv,.xlsx,.xls');
    if (!file) return;
    const parsed = await this.parseSpreadsheetRows(file);
    if (parsed.length < 2) return this.showToast('Файл пустой или нет строк для импорта', 'error');
    const headers = parsed[0].map((h) => this.normalizeImportToken(h));
    const columns = tpl.columns || [];
    
    // Для ИРД используем упрощенное сопоставление полей
    const rows = parsed.slice(1).map((line) => {
      const data = {};
      columns.forEach((col) => {
        const fieldKey = col.field_key || '';
        const title = col.title || '';
        // Пробуем найти колонку по ключу поля или заголовку
        const idx = headers.findIndex((h) => {
          const normalizedKey = this.normalizeImportToken(fieldKey);
          const normalizedTitle = this.normalizeImportToken(title);
          return h === normalizedKey || h === normalizedTitle || h.includes(normalizedKey) || normalizedKey.includes(h);
        });
        if (idx >= 0) data[col.field_key] = line[idx] ?? '';
      });
      return data;
    }).filter((entry) => Object.values(entry).some((v) => String(v || '').trim() !== ''));
    
    if (code === 'design_schedule') {
      const scheduleStage = this.currentView === 'designScheduleR' ? 'R' : 'P';
      rows.forEach((row) => { row.schedule_stage = scheduleStage; });
    }
    if (!rows.length) return this.showToast('Не удалось распознать строки по заголовкам CSV. Проверьте названия колонок в файле.', 'error');
    const fields = columns.map((c) => c.field_key);
    this.importDraft = {
      kind: 'template-import',
      code,
      title: this.currentTemplateName || code,
      rows,
      mode: 'upsert',
      fields,
      keyField: this.detectImportKeyField(fields),
    };
    this.modalMode = 'importPreview';
    document.getElementById('modalTitle').textContent = `Импорт (${this.currentTemplateName || code}) — предпросмотр`;
    document.getElementById('modalBody').innerHTML = this.renderImportPreviewTable(fields, rows, 'tpl');
    this.bindImportPreviewControls();
    document.getElementById('saveEntity').textContent = 'Сохранить импорт';
    this.openModal();
  }

  async startRegistryImport(stage, title) {
    const file = await this.pickFile('.csv,.xlsx,.xls');
    if (!file) return;
    const parsed = await this.parseSpreadsheetRows(file);
    if (parsed.length < 2) return this.showToast('Файл пустой или нет строк для импорта', 'error');
    const headers = parsed[0].map((h) => this.normalizeImportToken(h));
    const map = {
      volume_number: ['№', 'номер', 'том', '№ тома', 'volume_number'],
      designation: ['обозначение', 'обозначение *', 'designation'],
      name: ['наименование', 'наименование *', 'name'],
      contractor: ['исполнитель', 'contractor'],
      mark: ['марка', 'mark'],
      code: ['шифр', 'code'],
      note: ['примечание', 'note'],
      issue_date_fact: ['дата выдачи факт', 'issue_date_fact'],
    };
    const fields = Object.keys(map);
    const rows = parsed.slice(1).map((line) => {
      const data = {};
      fields.forEach((field) => {
        const aliases = map[field].map((token) => this.normalizeImportToken(token));
        // Ищем точное совпадение или частичное вхождение
        let idx = headers.findIndex((h) => aliases.includes(h));
        if (idx === -1) {
          // Пробуем найти по частичному совпадению
          for (const alias of aliases) {
            idx = headers.findIndex((h) => h.includes(alias) || alias.includes(h));
            if (idx >= 0) break;
          }
        }
        if (idx >= 0) data[field] = line[idx] ?? '';
      });
      return data;
    }).filter((entry) => String(entry.designation || '').trim() && String(entry.name || '').trim());
    if (!rows.length) return this.showToast('Не удалось распознать обязательные поля (Обозначение, Наименование). Проверьте названия колонок в файле.', 'error');
    this.importDraft = { kind: 'registry-import', stage, title, rows, mode: 'upsert' };
    this.modalMode = 'importPreview';
    document.getElementById('modalTitle').textContent = `${title}: импорт — предпросмотр`;
    document.getElementById('modalBody').innerHTML = this.renderImportPreviewTable(fields, rows, 'registry');
    this.bindImportPreviewControls();
    document.getElementById('saveEntity').textContent = 'Сохранить импорт';
    this.openModal();
  }

  renderImportPreviewTable(fields, rows, mode) {
    const importMode = this.importDraft?.mode || 'add';
    const keyField = this.importDraft?.keyField || '';
    return `
      <p class="metric">Данные можно поправить перед сохранением. При «Отмена» база не меняется.</p>
      <div class="form-grid two" style="margin-bottom:12px">
        <label>Режим импорта
          <select id="importModeSelect" style="margin-top:4px">
            <option value="add" ${importMode === 'add' ? 'selected' : ''}>Только добавить новые</option>
            <option value="upsert" ${importMode === 'upsert' ? 'selected' : ''}>Добавить + обновить существующие</option>
          </select>
        </label>
        ${mode === 'tpl' ? `<label>Ключ обновления
          <select id="importKeyFieldSelect" style="margin-top:4px">
            ${fields.map((field) => `<option value="${field}" ${field === keyField ? 'selected' : ''}>${field}</option>`).join('')}
          </select>
        </label>` : '<div></div>'}
      </div>
      <div class="table-wrap table-load-wrap ${this.state.tableLoading ? "is-loading" : ""}">
          <div class="table-loading-overlay ${this.state.tableLoading ? "" : "hidden"}"><span class="spinner"></span></div>
      <table class="table">
        <thead><tr>${fields.map((f) => `<th>${f}</th>`).join('')}</tr></thead>
        <tbody>
          ${rows.map((row, idx) => `<tr>${fields.map((field) => `<td><input data-import-mode="${mode}" data-import-row="${idx}" data-import-field="${field}" value="${(row[field] ?? '').toString().replace(/"/g, '&quot;')}"></td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
      </div>
    `;
  }

  bindImportPreviewControls() {
    const modeEl = document.getElementById('importModeSelect');
    if (modeEl) {
      modeEl.addEventListener('change', () => {
        if (this.importDraft) this.importDraft.mode = modeEl.value;
      });
    }
    const keyEl = document.getElementById('importKeyFieldSelect');
    if (keyEl) {
      keyEl.addEventListener('change', () => {
        if (this.importDraft) this.importDraft.keyField = keyEl.value;
      });
    }
  }

  detectImportKeyField(fields = []) {
    const preferred = ['designation', 'code', 'cipher', 'num', 'number', 'id'];
    const lowered = fields.map((f) => String(f || '').toLowerCase());
    const found = preferred.find((key) => lowered.includes(key));
    if (found) return fields[lowered.indexOf(found)];
    return fields[0] || '';
  }

  parseImportInt(value) {
    if (value === null || value === undefined) return undefined;
    const normalized = String(value).trim().replace(',', '.');
    if (!normalized) return undefined;
    const parsed = Number.parseInt(normalized, 10);
    return Number.isNaN(parsed) ? undefined : parsed;
  }

  showImportResultModal(title, stats) {
    this.modalMode = 'importResult';
    const errors = Array.isArray(stats?.errors) ? stats.errors : [];
    const rows = errors.map((err) => `
      <tr>
        <td>${err.index ?? ''}</td>
        <td>${(err.message || '').toString().replace(/</g, '&lt;')}</td>
      </tr>
    `).join('');
    document.getElementById('modalTitle').textContent = `Результат импорта: ${title}`;
    document.getElementById('modalBody').innerHTML = `
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Создано</div><div class="kpi-value">${stats.created || 0}</div></div>
        <div class="kpi"><div class="kpi-label">Обновлено</div><div class="kpi-value">${stats.updated || 0}</div></div>
        <div class="kpi"><div class="kpi-label">Пропущено</div><div class="kpi-value">${stats.skipped || 0}</div></div>
        <div class="kpi"><div class="kpi-label">Ошибок</div><div class="kpi-value">${errors.length}</div></div>
      </div>
      ${errors.length ? `
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <h4 style="margin:0">Ошибки импорта</h4>
        <button class="mini" id="downloadImportErrorsBtn">Скачать ошибки CSV</button>
      </div>
      <div class="table-wrap table-load-wrap ${this.state.tableLoading ? "is-loading" : ""}">
          <div class="table-loading-overlay ${this.state.tableLoading ? "" : "hidden"}"><span class="spinner"></span></div>
        <table class="table">
          <thead><tr><th>Строка</th><th>Ошибка</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ` : '<p class="metric" style="margin-top:12px">Импорт завершён без ошибок.</p>'}
    `;
    const saveBtn = document.getElementById('saveEntity');
    if (saveBtn) saveBtn.style.display = 'none';
    document.getElementById('cancelModal').textContent = 'Закрыть';
    this.openModal();
    document.getElementById('downloadImportErrorsBtn')?.addEventListener('click', () => {
      const header = ['row_index', 'message'];
      const lines = [
        header.join(','),
        ...errors.map((err) => [`"${String(err.index ?? '').replace(/"/g, '""')}"`, `"${String(err.message ?? '').replace(/"/g, '""')}"`].join(',')),
      ];
      const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `import_errors_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });
  }

  collectImportDraftEdits() {
    if (!this.importDraft?.rows) return;
    document.querySelectorAll('[data-import-row][data-import-field]').forEach((el) => {
      const idx = Number(el.dataset.importRow);
      const field = el.dataset.importField;
      if (!Number.isNaN(idx) && this.importDraft.rows[idx]) this.importDraft.rows[idx][field] = el.value;
    });
  }

  exportRegistryCSV(stage, title) {
    const rows = this.registryRows || [];
    const headers = ['№', 'Том', 'Шифр', 'Марка', 'Обозначение', 'Наименование', 'Исполнитель', 'Примечание', 'Дата выдачи факт'];
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [
      headers.join(','),
      ...rows.map((r, idx) => [
        idx + 1, r.volume_number || '', r.code || '', r.mark || '',
        r.designation || '', r.name || '', r.contractor || '', r.note || '',
        r.issue_date_fact ? String(r.issue_date_fact).slice(0, 10) : '',
      ].map(escape).join(',')),
    ];
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${stage}_${(title || 'registry').replace(/\s+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  exportRowsToXLSX(fileName, headers, rows) {
    if (!window.XLSX) return this.showToast('Библиотека XLSX не загружена', 'error');
    const sheet = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const book = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(book, sheet, 'Данные');
    window.XLSX.writeFile(book, fileName);
  }

  exportRegistryXLSX(stage, title) {
    const rows = this.registryRows || [];
    const headers = ['№', 'Том', 'Шифр', 'Марка', 'Обозначение', 'Наименование', 'Исполнитель', 'Примечание', 'Дата выдачи факт'];
    const body = rows.map((r, idx) => [
      idx + 1, r.volume_number || '', r.code || '', r.mark || '',
      r.designation || '', r.name || '', r.contractor || '', r.note || '',
      r.issue_date_fact ? String(r.issue_date_fact).slice(0, 10) : '',
    ]);
    this.exportRowsToXLSX(`${stage}_${(title || 'registry').replace(/\s+/g, '_')}.xlsx`, headers, body);
  }

  exportCurrentScheduleXLSX() {
    const rows = this.templateRowsCache || [];
    const headers = ['№ тома', 'Обозначение', 'Наименование', 'Исполнитель', 'Дата начала базовая', 'Дата выдачи базовая', 'Дней разработки база', 'Дата начала факт', 'Дата выдачи факт', 'Дней разработки факт', '% завершения'];
    const fields = ['volume_no', 'code', 'name', 'executor', 'baseline_start', 'baseline_end', 'baseline_days', 'fact_start', 'fact_end', 'fact_days', 'progress'];
    const body = rows.map((row) => fields.map((field) => (row.data || {})[field] || ''));
    this.exportRowsToXLSX(`${this.currentView === 'designScheduleR' ? 'graph_rd' : 'graph_pd'}.xlsx`, headers, body);
  }

  async exportTemplateXLSX(projectId, code) {
    const payload = await listTemplateRows(projectId, code, { page: 1, page_size: 5000, search: '' });
    const tpl = await getTemplate(code);
    const columns = tpl.columns || [];
    const headers = columns.map((c) => this.normalizeTemplateColumnTitle(code, c));
    const rows = (payload.data || []).map((r) => columns.map((c) => (r.data || {})[c.field_key] ?? ''));
    this.exportRowsToXLSX(`${code}_${projectId}.xlsx`, headers, rows);
  }

  async handlePrimaryAction() {
    if (this.currentView === 'home') return this.openDashboardForm();
    if (this.currentView === 'projects') return this.openProjectForm();
    if (this.currentView === 'docsStageP') return this.renderDocsStageP();
    if (this.currentView === 'docsStageR') return this.renderDocsStageR();
    if (this.currentView === 'registryP') return this.renderRegistry('phase-p', 'Ведомость комплектов ПД');
    if (this.currentView === 'registryR') return this.renderRegistry('phase-r', 'Ведомость комплектов РД');
    if (this.currentView === 'workforceDaily') return this.renderWorkforceDaily();
    if (this.currentView === 'svorMain') return this.openCreateSvorModal();
    if (this.currentView === 'svorDashboard') return this.renderSvorDashboard();
    if (this.currentView === 'svorHistory') return this.renderSvorHistoryList();
    if (this.currentView === 'auth') {
      await issueDemoToken('admin');
      return this.showToast('Demo token обновлён.', 'success');
    }
    if (['protocolInternal', 'protocolDesign', 'protocolSMR'].includes(this.currentView)) {
      // Для протоколов — заглушка, в будущем можно открыть форму создания поручения
      const section = this.currentView === 'protocolInternal' ? 'Внутренние' : this.currentView === 'protocolDesign' ? 'Проектирование' : 'СМР';
      return this.showToast(`Раздел «Протоколы — ${section}» в разработке. Скоро появится возможность добавлять поручения.`, 'info');
    }
    if (this.currentView === 'docsTemplates') {
      // Для шаблонов документов открываем форму создания нового шаблона
      const project = this.currentProject();
      if (!project) return this.showToast('Выберите проект', 'error');
      // Можно реализовать открытие модального окна для создания шаблона
      return this.showToast('Функционал добавления шаблона документа будет реализован в следующей версии', 'info');
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
      if (code === 'design_schedule') return this.exportCurrentScheduleXLSX();
      if (code === 'input_design_data') {
        const key = this.currentView || code;
        this.templateEditModes[key] = !this.templateEditModes[key];
        return this.renderContent();
      }
      return this.exportTemplateXLSX(this.selectedObjectId, code);
    }
    if (this.currentView === 'docsStageP') {
      const token = localStorage.getItem('cm_token');
      const project = this.currentProject();
      const url = `/api/v1/projects/${project.id}/docs/p/export.xlsx`;
      window.open(url + (token ? `?token=${encodeURIComponent(token)}` : ''), '_blank');
      return;
    }
    if (this.currentView === 'docsStageR') return this.renderDocsStageR();
    if (this.currentView === 'registryP') {
      this.registryEditModes['phase-p'] = !this.registryEditModes['phase-p'];
      return this.renderRegistry('phase-p', 'Ведомость комплектов ПД');
    }
    if (this.currentView === 'registryR') {
      this.registryEditModes['phase-r'] = !this.registryEditModes['phase-r'];
      return this.renderRegistry('phase-r', 'Ведомость комплектов РД');
    }
    if (this.currentView === 'workforceDaily') return this.renderWorkforceDaily();
    if (this.currentView === 'svorMain') {
      const project = this.currentProject();
      const q = new URLSearchParams();
      if (this.svorFilters.status) q.set('status', this.svorFilters.status);
      if (this.svorFilters.dateFrom) q.set('date_from', this.svorFilters.dateFrom);
      if (this.svorFilters.dateTo) q.set('date_to', this.svorFilters.dateTo);
      window.open(`/api/v1/projects/${project.id}/svor/report.xlsx?${q.toString()}`, '_blank');
    }
    if (['protocolInternal', 'protocolDesign', 'protocolSMR'].includes(this.currentView)) {
      // Для протоколов — обновление списка (заглушка)
      return this.renderContent();
    }
    if (this.currentView === 'docsTemplates') {
      // Экспорт шаблонов документов в XLSX
      const project = this.currentProject();
      if (!project) return this.showToast('Выберите проект', 'error');
      const token = localStorage.getItem('cm_token');
      const url = `/api/v1/projects/${project.id}/docs/templates/export.xlsx`;
      window.open(url + (token ? `?token=${encodeURIComponent(token)}` : ''), '_blank');
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
    this.modalMode = 'agentSummary';
    document.getElementById('modalTitle').textContent = 'AI-агент: сводка по активным проектам';
    document.getElementById('modalBody').innerHTML = `
      <div class="form-grid">
        <div class="notice">Формируется общая сводка только по активным проектам: прогресс, последние выполненные задачи, критические моменты.</div>
        <div id="agentAnswer" class="notice">Нажмите «Сформировать сводку», чтобы получить данные.</div>
      </div>
    `;
    const saveBtn = document.getElementById('saveEntity');
    if (saveBtn) saveBtn.textContent = 'Сформировать сводку';
    this.openModal();
  }

  async analyzeDashboardsWithAI() {
    const activeStatuses = new Set(['active', 'design', 'construction']);
    const activeProjects = this.objects.filter((o) => activeStatuses.has(String(o.status || '').toLowerCase()));
    
    if (!activeProjects.length) {
      return 'Нет активных проектов для анализа.';
    }

    const dashboardData = this.state.dashboards
      .filter((d) => activeProjects.some((p) => String(p.id) === String(d.projectId)))
      .map((d) => {
        const project = activeProjects.find((p) => String(p.id) === String(d.projectId));
        const metrics = this.dashboardMetrics[String(project?.id)] || {};
        return {
          projectName: d.projectName,
          type: d.type,
          status: project?.status,
          progress: metrics.fact || 0,
          plan: metrics.plan || 0,
          deviation: metrics.deviation || 0,
          budget: metrics.cost || 0,
          spent: metrics.spent || 0,
          address: metrics.address || '',
          area: metrics.area || 0,
          milestones: metrics.milestones || [],
        };
      });

    if (!dashboardData.length) {
      return 'Дашборды для активных проектов не найдены.';
    }

    try {
      const payload = await api('/agent/summary', 'POST', {
        question: 'Проанализируй дашборды по активным проектам. Укажи: общий прогресс, критические отставания (где факт < плана более чем на 10%), проблемы по бюджету, рекомендации.',
        context: { dashboards: dashboardData, projects_count: activeProjects.length },
      });
      return payload.answer || 'Не удалось получить анализ.';
    } catch (error) {
      return `Ошибка анализа: ${error.message || 'Неизвестная ошибка'}`;
    }
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
      if (!docRID || !revision_num || !revision_date) return this.showToast('Заполните номер и дату изменения', 'error');
      await api(`/projects/${project.id}/docs/r/${docRID}/revisions`, 'POST', { revision_num, revision_date, change_note });
      this.closeModal();
      return this.renderDocsStageR();
    }

    if (this.modalMode === 'createSvor') {
      const project = this.currentProject();
      const doc_r_id = document.getElementById('newSvorDocR')?.value;
      if (!doc_r_id) return this.showToast('Выберите комплект РД', 'error');
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
      // Блокировка повторных кликов
      if (this.isCreatingProject) return;
      
      const data = this.collectProjectForm();
      const err = this.validateProjectForm(data);
      if (err) return this.showToast(err, 'error');
      
      this.isCreatingProject = true;
      const saveBtn = document.getElementById('saveEntity');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Создание...';
      }
      
      try {
        await api('/objects', 'POST', { name: data.name, address: data.address, budget: Number(data.budget || 0), status: data.status || 'planning' });
        await this.loadObjects();
        this.selectedObjectId = this.objects.at(-1)?.id || this.selectedObjectId;
        this.closeModal();
        this.renderProjectTree();
        this.switchView('projects', 'Проекты');
      } catch (e) {
        this.showToast('Ошибка создания проекта: ' + (e.message || 'Неизвестная ошибка'), 'error');
      } finally {
        this.isCreatingProject = false;
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Создать';
        }
      }
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
        return this.showToast(err, 'error');
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
        this.showToast('Сохранено', 'success');
        await this.loadObjects();
        this.renderProjectTree();
        this.closeModal();
        this.renderProjects();
      } catch (e) {
        this.showToast(e.message || 'Ошибка сохранения', 'error');
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
      if (!projectId) return this.showToast('Выберите проект', 'error');
      if (this.state.dashboards.some((d) => String(d.projectId) === String(projectId) && d.type === type)) {
        return this.showToast('Этот проект уже добавлен для выбранного типа дашборда', 'error');
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
      const answerEl = document.getElementById('agentAnswer');
      const activeStatuses = new Set(['active', 'design', 'construction']);
      const activeProjects = this.objects.filter((o) => activeStatuses.has(String(o.status || '').toLowerCase()));
      if (!activeProjects.length) {
        answerEl.textContent = 'Нет активных проектов для формирования сводки.';
        return;
      }
      saveBtn.disabled = true;
      saveBtn.textContent = 'Формирование...';
      try {
        // Сначала пробуем анализ дашбордов
        const dashboardAnalysis = await this.analyzeDashboardsWithAI();
        
        // Затем получаем сводку по каждому проекту
        const chunks = await Promise.all(activeProjects.map(async (project) => {
          if (!project?.id) return `Проект: ${project?.name || 'Без названия'}\nОшибка: project_id is required`;
          const payload = await api('/agent/summary', 'POST', { project_id: String(project.id), question: 'Сформируй краткий статус, прогресс, последние задачи и критические моменты.' });
          return [`Проект: ${project.name}`, payload.answer, 'Рекомендации:', ...(payload.next_actions || []).map((a, i) => `${i + 1}. ${a}`)].join('\n');
        }));
        
        const lines = [
          `Сводка по активным проектам (${activeProjects.length})`,
          '',
          '=== AI-АНАЛИЗ ДАШБОРДОВ ===',
          dashboardAnalysis,
          '',
          '=== ДЕТАЛИ ПО ПРОЕКТАМ ===',
          ...chunks
        ];
        answerEl.textContent = lines.join('\n');
      } catch (error) {
        answerEl.textContent = error?.message || 'Не удалось получить ответ агента';
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Обновить сводку';
      }
      return;
    }

    if (this.modalMode === 'registryAdd') {
      const stage = this.importDraft?.stage;
      const title = this.importDraft?.title || (stage === 'phase-p' ? 'Ведомость комплектов ПД' : 'Ведомость комплектов РД');
      const project = this.currentProject();
      const designation = document.getElementById('regDesignation')?.value.trim();
      const name = document.getElementById('regName')?.value.trim();
      const mark = document.getElementById('regMark')?.value.trim();
      const code = document.getElementById('regCode')?.value.trim();
      const contractor = document.getElementById('regContractor')?.value.trim();
      const issue_date_fact = document.getElementById('regIssueDate')?.value || undefined;
      if (!designation) {
        this.showToast('Укажите обозначение', 'error');
        return;
      }
      if (!name) {
        this.showToast('Укажите наименование', 'error');
        return;
      }
      await this.withTableLoading(async () => {
        await api(`/projects/${project.id}/design/${stage}/registry`, 'POST', {
          id: this.importDraft?.kind === 'registry-edit' ? this.importDraft?.rowId : undefined,
          designation,
          name,
          mark,
          code,
          contractor,
          issue_date_fact,
        });
        await this.renderRegistry(stage, title);
      });
      this.closeModal();
      this.showToast('Данные добавлены/обновлены.', 'success');
      return;
    }

    if (this.modalMode === 'importPreview') {
      this.collectImportDraftEdits();
      const project = this.currentProject();
      if (!this.importDraft || !project) return;
      if (this.importDraft.kind === 'template-import') {
        const mode = this.importDraft.mode || 'add';
        const keyField = this.importDraft.keyField || this.detectImportKeyField(this.importDraft.fields || []);
        const stats = await this.withTableLoading(async () => {
          const result = await api(`/objects/${project.id}/templates/${this.importDraft.code}/import`, 'POST', {
            mode,
            key_field: keyField,
            rows: this.importDraft.rows,
          });
          await this.renderTemplateScreen(this.importDraft.code, this.importDraft.title);
          return result;
        });
        this.closeModal();
        this.showToast((stats.errors && stats.errors.length) ? `Импорт с ошибками: ${stats.errors.length}` : 'Данные добавлены.', (stats.errors && stats.errors.length) ? 'error' : 'success');
        this.showImportResultModal(this.importDraft.title, stats);
        return;
      }
      if (this.importDraft.kind === 'registry-import') {
        const mode = this.importDraft.mode || 'add';
        const rows = this.importDraft.rows.map((row) => ({
          ...row,
          volume_number: this.parseImportInt(row.volume_number),
        }));
        const stats = await this.withTableLoading(async () => {
          const result = await api(`/projects/${project.id}/design/${this.importDraft.stage}/registry/import`, 'POST', { mode, rows });
          await this.forceSyncScheduleFromRegistry(project.id, this.importDraft.stage);
          await this.renderRegistry(this.importDraft.stage, this.importDraft.title);
          return result;
        });
        this.closeModal();
        this.showToast((stats.errors && stats.errors.length) ? `Импорт с ошибками: ${stats.errors.length}` : 'Данные добавлены.', (stats.errors && stats.errors.length) ? 'error' : 'success');
        this.showImportResultModal(this.importDraft.title, stats);
        return;
      }
    }

    if (this.modalMode === 'createRow' || this.modalMode === 'editRow') {
      try {
        const data = {};
        document.querySelectorAll('[data-field]').forEach((input) => { data[input.dataset.field] = input.value; });
        const code = this.currentTemplateCode || this.resolveTemplateView(this.currentView).code;
        if (code === 'input_design_data') {
          const irdError = this.validateIrdDates(data);
          if (irdError) {
            this.showToast(irdError, 'error');
            return;
          }
        }
        if (code === 'design_schedule') {
          const computedFields = Array.from(this.templateAutoCalculatedFields || []);
          if (computedFields.length && !confirm(`Будут сохранены автоматически рассчитанные поля: ${computedFields.join(', ')}. Продолжить?`)) return;
        }
        if (code === 'design_schedule') data.schedule_stage = this.currentView === 'designScheduleR' ? 'R' : 'P';
        await this.withTableLoading(async () => {
          if (this.editRowId) await updateTemplateRow(this.editRowId, data);
          else await createTemplateRow(this.selectedObjectId, code, data);
        });
        this.closeModal();
        if (["tep", "summary_estimate"].includes(code)) await this.refreshDashboardMetrics();
        await this.renderContent();
        this.showToast('Данные добавлены/обновлены.', 'success');
        return;
      } catch (error) {
        this.showToast(error?.message || 'Не удалось сохранить строку', 'error');
      }
    }
  }

  handleModalCancel() {
    if (this.modalMode === 'editProject' && this.state.modalDirty) {
      if (!confirm('Есть несохраненные изменения. Закрыть без сохранения?')) return;
    }
    this.closeModal();
  }

  switchView(view, title, options = {}) {
    const { collapseMobile = true } = options;
    this.currentView = view;
    this.currentTemplateCode = null;
    this.currentTemplateName = null;
    this.templatePage = 1;
    this.templateSearch = '';

    document.getElementById('pageTitle').textContent = title;
    document.querySelectorAll('.menu-item[data-view]').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
    this.renderContent();
    if (!this.state.isDesktop && collapseMobile) this.toggleSidebar(false);
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
    this.isCreatingProject = false; // Сброс флага блокировки при закрытии модалки
    this.editRowId = null;
    this.templateAutoCalculatedFields = new Set();
    this.state.modalDirty = false;
    this.importDraft = null;
    this.state.editProjectId = null;
    this.state.projectFormSnapshot = '';
    const saveBtn = document.getElementById('saveEntity');
    if (saveBtn) {
      saveBtn.style.display = '';
      saveBtn.disabled = false;
      saveBtn.textContent = 'Сохранить';
    }
    const cancelBtn = document.getElementById('cancelModal');
    if (cancelBtn) cancelBtn.textContent = 'Отмена';
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
      this.showToast('Поддерживаются только изображения.', 'error');
      return;
    }
    const maxBytes = 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      this.showToast('Слишком большой файл. Максимум 8 МБ.', 'error');
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
      this.showToast('Ваш браузер не поддерживает захват экрана.', 'error');
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
      'docsArchiveIrd', 'docsArchiveSurvey', 'docsArchiveStageP', 'docsArchiveExpertise', 'docsArchiveStageR', 'docsTemplates',
      'svorMain', 'svorHistory', 'svorDashboard',
    ].includes(view);
  }

  resolveTemplateView(view) {
    if (view === 'tep') return { code: 'tep', title: 'ТЭП' };
    if (view === 'designSchedule') return { code: 'design_schedule', title: 'График ПД' };
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
