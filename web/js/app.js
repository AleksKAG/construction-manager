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
class ConstructionManagerUI {
  constructor() {
    this.currentView = 'home';
    this.projects = [
      { id: 'p1', name: 'Наименование 1', description: 'Многофункциональный комплекс' },
      { id: 'p2', name: 'Наименование 2', description: 'Реконструкция объекта' }
    ];
    this.projectMenuTemplate = [
      { title: 'Проектирование', children: ['График Проектирования', 'Документация (Проектирование): ИРД, Изыскания, Стадия П, Экспертиза, Стадия Р'] },
      { title: 'Сметная документация', children: ['Согласованная в экспертизе', 'Корректировка смет: СВОР, КАЦ, Сметы изм, Экспертиза повторная'] },
      { title: 'СМР', children: ['График СМР', 'Документация СМР', 'Авторский надзор', 'Технический надзор', 'График поставки оборудования'] },
      { title: 'Ввод в эксплуатацию', children: ['График (дорожная карта)', 'Документация'] },
      { title: 'Протоколы совещаний', children: ['Внутренние', 'Проектирование', 'СМР', 'Добавить раздел протоколов'] }
    ];

    this.bind();
    this.renderMenu();
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
    document.querySelectorAll('.menu-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.menu-item[data-view]').forEach(i => i.classList.remove('active'));
        btn.classList.add('active');
        this.currentView = btn.dataset.view;
        document.getElementById('pageTitle').textContent = btn.textContent;
        this.renderContent();
      });
    });

    document.getElementById('toggleSidebar').addEventListener('click', () => {
      document.getElementById('sidebar').classList.toggle('open');
    });

    document.getElementById('addBtn').addEventListener('click', () => this.openModal());
    document.querySelectorAll('[data-close="true"]').forEach(el => el.addEventListener('click', () => this.closeModal()));
    document.getElementById('saveProject').addEventListener('click', () => this.saveProject());

    document.getElementById('menuEditor').addEventListener('click', () => {
      alert('Режим настройки меню: в БД предусмотрены menu_items + account_menu_permissions.');
    });
  }

  renderMenu() {
    const tree = document.getElementById('projectTree');
    const rows = [];
    this.projects.forEach(project => {
      rows.push(`<div class="tree-row">${project.name}</div>`);
      this.projectMenuTemplate.forEach(section => {
        rows.push(`<div class="tree-row level-1">/ ${section.title}</div>`);
        section.children.forEach(item => rows.push(`<div class="tree-row level-2">// ${item}</div>`));
      });
    });
    rows.push('<div class="tree-row">+ Добавить проект</div>');
    tree.innerHTML = rows.join('');
  }

  renderContent() {
    const area = document.getElementById('contentArea');
    if (this.currentView === 'auth') {
      area.innerHTML = this.renderAuthModel();
      return;
    }
    area.innerHTML = `
      <article class="card col-8">
        <span class="tag">Дашборд проекта</span>
        <h3>Наименование проекта 1</h3>
        <div class="metric">Сроки реализации всего проекта: 01.2025 — 12.2027</div>
        <div class="kpi"><span>Стадия П</span><span>62%</span></div>
        <div class="progress"><span style="width:62%"></span></div>
        <div class="kpi"><span>Стадия Р</span><span>41%</span></div>
        <div class="progress"><span style="width:41%"></span></div>
        <div class="kpi"><span>СМР (строительная готовность)</span><span>36%</span></div>
        <div class="progress"><span style="width:36%"></span></div>
        <div class="kpi"><span>Авансирование / Выполнено</span><span>410 / 295 млн ₽</span></div>
      </article>

      <article class="card col-4">
        <h3>В работе</h3>
        <div class="kpi"><span>Просрочено по протоколам</span><strong style="color:#c62828">7</strong></div>
        <div class="kpi"><span>Ближайшие вопросы</span><span>3</span></div>
        <div class="kpi"><span>Новые документы СМР</span><span>5</span></div>
      </article>

      <article class="card col-6">
        <h3>График проектирования</h3>
        <table class="table">
          <thead><tr><th>Этап</th><th>План</th><th>Факт</th><th>%</th></tr></thead>
          <tbody>
            <tr><td>ИРД</td><td>01.02</td><td>04.02</td><td>100</td></tr>
            <tr><td>Изыскания</td><td>15.03</td><td>12.03</td><td>100</td></tr>
            <tr><td>Стадия П</td><td>20.06</td><td>—</td><td>62</td></tr>
            <tr><td>Экспертиза</td><td>15.09</td><td>—</td><td>0</td></tr>
          </tbody>
        </table>
      </article>

      <article class="card col-6">
        <h3>Сметная документация</h3>
        <div class="kpi"><span>Сводный сметный расчет (баз/тек)</span><span>1.92 / 2.34 млрд ₽</span></div>
        <div class="kpi"><span>Последние документы</span><span>СВОР_12.xlsx, КАЦ_07.xlsx</span></div>
        <div class="kpi"><span>Готово к приемке</span><span>317 млн ₽</span></div>
      </article>

      <article class="card col-12">
        <h3>Показатели по графику проектирования</h3>
        <div class="kpi"><span>Всего комплектов РД</span><span>56</span></div>
        <div class="kpi"><span>Согласовано в производство</span><span>34</span></div>
        <div class="kpi"><span>Выдано в производство работ</span><span>812 млн ₽</span></div>
        <div class="kpi"><span>На рассмотрении</span><span>129 млн ₽</span></div>
      </article>
    `;
  }

  renderAuthModel() {
    return `
      <article class="card col-12">
        <h3>Основа авторизации и структуры БД</h3>
        <table class="table">
          <thead><tr><th>Таблица</th><th>Назначение</th><th>Ключевые поля</th></tr></thead>
          <tbody>
            <tr><td>users</td><td>Пользователи</td><td>id, full_name, email, status</td></tr>
            <tr><td>roles</td><td>Роли</td><td>id, code(viewer/editor/admin), name</td></tr>
            <tr><td>permissions</td><td>Права</td><td>resource, action(view/edit/admin)</td></tr>
            <tr><td>user_roles</td><td>Назначение ролей</td><td>user_id, role_id, project_id</td></tr>
            <tr><td>projects</td><td>Проекты</td><td>name, description, customer_org_id</td></tr>
            <tr><td>menu_items</td><td>Дерево меню</td><td>parent_id, title, item_type, sort_order</td></tr>
            <tr><td>dashboards/widgets</td><td>Конфиг дашбордов</td><td>scope, config_json</td></tr>
            <tr><td>schedule_items</td><td>Графики П/Р/СМР/ввод</td><td>baseline/current, progress</td></tr>
            <tr><td>meeting_protocols</td><td>Протоколы</td><td>section, due_date, status</td></tr>
            <tr><td>documents</td><td>Документы</td><td>doc_type, stage, file_url, version</td></tr>
          </tbody>
        </table>
      </article>`;
  }

  openModal() { document.getElementById('projectModal').classList.add('open'); }
  closeModal() { document.getElementById('projectModal').classList.remove('open'); }

  saveProject() {
    const name = document.getElementById('projectName').value.trim();
    const description = document.getElementById('projectDescription').value.trim();
    if (!name) return alert('Введите наименование проекта');
    this.projects.push({ id: `p${Date.now()}`, name, description });
    this.renderMenu();
    this.closeModal();
    document.getElementById('projectName').value = '';
    document.getElementById('projectDescription').value = '';
  }
}

window.addEventListener('DOMContentLoaded', () => new ConstructionManagerUI());
