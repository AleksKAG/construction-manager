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
    this.currentView = "home";
    this.projects = [];
    this.selectedProjectId = null;
    this.templates = [
      { code: "input_design_data", title: "Исходные данные" },
      { code: "design_schedule", title: "График проектирования" },
      { code: "tep", title: "ТЭП" },
      { code: "summary_estimate", title: "Смета" },
      { code: "smr_schedule", title: "График СМР" },
    ];
    this.sdrTemplateRows = this.getSdrTemplateRows();
    this.bind();
    this.init();
  }

  async init() {
    await this.loadProjects();
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

  async loadObjects(search = '', page = 1, pageSize = 50) {
    const query = new URLSearchParams({ search, page, page_size: pageSize }).toString();
    const payload = await api(`/objects?${query}`);
    this.objects = payload.data || [];
    if (!this.selectedObjectId && this.objects.length) this.selectedObjectId = this.objects[0].id;
  }

  currentProject() {
    return this.objects.find(o => o.id === this.selectedObjectId);
  }

  renderProjectTree() {
    const tree = document.getElementById('projectTree');
    tree.innerHTML = this.objects.map(p => `<div class="tree-row ${p.id === this.selectedObjectId ? 'active' : ''}" data-project="${p.id}">${p.name}</div>`).join('');
    tree.querySelectorAll('[data-project]').forEach(row => row.addEventListener('click', () => {
      this.selectedObjectId = row.dataset.project;
      this.renderProjectTree();
      this.renderContent();
    }));
  }

  configureHeader() {
    const primary = document.getElementById('primaryBtn');
    const secondary = document.getElementById('secondaryBtn');
    secondary.style.display = 'none';

    if (this.currentView === 'tep') {
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
    if (this.currentView === 'tep') return this.renderTemplateScreen('tep', 'Технико-экономические показатели');
    if (this.currentView === 'designSchedule') return this.renderTemplateScreen('design_schedule', 'График проектирования');
    if (this.currentView === 'projects') return this.renderProjects();
    return this.renderHome();
  }

  renderHome() {
    const p = this.currentProject();
    document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>Наглядный режим</h3><div class="metric">Выбран проект: ${p?.name || 'не выбран'}</div><div class="notice">Да, окна для заполнения стандартных характеристик ТЭП и графиков добавлены: кнопка "+ Добавить ТЭП" / "+ Добавить график" открывает мастер выбора шаблона и форму полей.</div></article>`;
  }

  renderProjects() {
    document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>Проекты</h3><table class="table"><thead><tr><th>Наименование</th><th>Адрес</th><th>Статус</th></tr></thead><tbody>${this.objects.map(o => `<tr><td>${o.name}</td><td>${o.address || '—'}</td><td>${o.status || '—'}</td></tr>`).join('')}</tbody></table></article>`;
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
      listTemplateRows(project.id, code, { page: this.templatePage, page_size: 20, search: this.templateSearch })
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
        <table class="table"><thead><tr>${columns.map(c => `<th>${c.title}${c.required ? ' *' : ''}</th>`).join('')}<th>Действия</th></tr></thead>
        <tbody>${rows.map(r => `<tr>${columns.map(c => `<td>${(r.data || {})[c.field_key] || ''}</td>`).join('')}<td><button class="mini" data-edit-row="${r.id}">Ред.</button><button class="mini danger" data-del-row="${r.id}">Удал.</button></td></tr>`).join('') || `<tr><td colspan="${columns.length + 1}">Нет данных</td></tr>`}</tbody></table>
      </article>`;

    document.getElementById('templateSearchBtn').onclick = () => { this.templateSearch = document.getElementById('templateSearch').value.trim(); this.templatePage = 1; this.renderTemplateScreen(defaultCode, title); };
    document.getElementById('pickTemplateBtn').onclick = () => this.openTemplatePicker(defaultCode);
    document.getElementById('prevPage').onclick = () => { this.templatePage = Math.max(1, this.templatePage - 1); this.renderTemplateScreen(defaultCode, title); };
    document.getElementById('nextPage').onclick = () => { if (pager.page * pager.page_size < pager.total) this.templatePage += 1; this.renderTemplateScreen(defaultCode, title); };
    document.querySelectorAll('[data-edit-row]').forEach(btn => btn.onclick = () => this.openTemplateForm(tpl, rows.find(r => r.id === btn.dataset.editRow)));
    document.querySelectorAll('[data-del-row]').forEach(btn => btn.onclick = async () => { await deleteTemplateRow(btn.dataset.delRow); this.renderTemplateScreen(defaultCode, title); });
  }

  async openTemplatePicker(preferredCode) {
    const templates = await listTemplates();
    const filtered = templates.filter(t => preferredCode === 'tep' ? t.code.includes('tep') || t.code.includes('building') || t.code.includes('site') : t.code.includes('design'));
    this.modalMode = 'selectTemplate';
    document.getElementById('modalTitle').textContent = 'Выбор стандартного шаблона';
    document.getElementById('modalBody').innerHTML = `<div class="form-grid">${(filtered.length ? filtered : templates).map(t => `<label><input type="radio" name="template_code" value="${t.code}" ${t.code === this.currentTemplateCode ? 'checked' : ''}> ${t.name} <span class="metric">(${t.code})</span></label>`).join('')}</div>`;
    this.openModal();
  }

  openTemplateForm(templatePayload, row = null) {
    this.modalMode = row ? 'editRow' : 'createRow';
    document.getElementById('modalTitle').textContent = row ? `Редактировать: ${templatePayload.template.name}` : `Добавить: ${templatePayload.template.name}`;
    document.getElementById('modalBody').innerHTML = `<div class="form-grid">${templatePayload.columns.map(c => {
      const value = (row?.data || {})[c.field_key] || '';
      const type = c.data_type === 'number' ? 'number' : c.data_type === 'date' ? 'date' : 'text';
      return `<label>${c.title}${c.required ? ' *' : ''}${c.unit ? ` (${c.unit})` : ''}<input data-field="${c.field_key}" type="${type}" value="${value}"></label>`;
    }).join('')}</div>`;
    const modal = document.getElementById('entityModal');
    modal.dataset.rowId = row?.id || '';
    this.openModal();
  }

  async handlePrimaryAction() {
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
    if (this.currentView === 'projects') {
      await this.loadObjects();
      this.renderProjectTree();
      return this.renderProjects();
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

    if (this.modalMode !== 'createRow' && this.modalMode !== 'editRow') return;
    const data = {};
    document.querySelectorAll('[data-field]').forEach(input => { data[input.dataset.field] = input.value; });
    const code = this.currentTemplateCode || (this.currentView === 'tep' ? 'tep' : 'design_schedule');
    if (modal.dataset.rowId) await updateTemplateRow(modal.dataset.rowId, data);
    else await createTemplateRow(this.selectedObjectId, code, data);

    this.closeModal();
    this.renderContent();
  }

  openModal() { document.getElementById('entityModal').classList.add('open'); }
  closeModal() { document.getElementById('entityModal').classList.remove('open'); }
}

window.addEventListener('DOMContentLoaded', () => new ConstructionManagerUI());
    document.querySelectorAll(".menu-item[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".menu-item[data-view]").forEach((i) => i.classList.remove("active"));
        btn.classList.add("active");
        this.currentView = btn.dataset.view;
        document.getElementById("pageTitle").textContent = btn.textContent;
        this.renderContent();
      });
    });

    document.getElementById("toggleSidebar").addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("open");
    });

    document.getElementById("addBtn").addEventListener("click", () => this.openModal());
    document.querySelectorAll('[data-close="true"]').forEach((el) => el.addEventListener("click", () => this.closeModal()));
    document.getElementById("saveProject").addEventListener("click", () => this.saveProject());
    document.getElementById("menuEditor").addEventListener("click", () => alert("Редактор меню будет доступен в следующих версиях."));
  }

  async api(path, options = {}) {
    const res = await fetch(`/api/v1${path}`, {
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
      ...options,
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status}`);
    }
    return res.json().catch(() => ({}));
  }

  async loadProjects() {
    try {
      this.projects = await this.api("/objects");
      if (!this.selectedProjectId && this.projects.length > 0) {
        this.selectedProjectId = this.projects[0].id;
      }
    } catch (e) {
      this.notify(`Ошибка загрузки проектов: ${e.message}`);
    }
  }

  renderMenu() {
    const tree = document.getElementById("projectTree");
    const rows = this.projects
      .map(
        (project) => `
        <button class="tree-row ${this.selectedProjectId === project.id ? "active" : ""}" data-project-id="${project.id}">
          ${project.name}
        </button>`
      )
      .join("");
    tree.innerHTML = `${rows}<button class="tree-row add-project">+ Добавить проект</button>`;

    tree.querySelectorAll("[data-project-id]").forEach((el) => {
      el.addEventListener("click", () => {
        this.selectedProjectId = el.dataset.projectId;
        this.currentView = "home";
        document.getElementById("pageTitle").textContent = "Главная";
        document.querySelectorAll(".menu-item[data-view]").forEach((i) => i.classList.toggle("active", i.dataset.view === "home"));
        this.renderMenu();
        this.renderContent();
      });
    });
    const addBtn = tree.querySelector(".add-project");
    if (addBtn) addBtn.addEventListener("click", () => this.openModal());
  }

  get selectedProject() {
    return this.projects.find((p) => p.id === this.selectedProjectId) || null;
  }

  async renderContent() {
    const area = document.getElementById("contentArea");
    if (this.currentView === "auth") {
      area.innerHTML = this.renderAuthModel();
      return;
    }
    if (!this.selectedProject) {
      area.innerHTML = `<article class="card col-12"><h3>Нет проектов</h3><p>Добавьте первый проект.</p></article>`;
      return;
    }

    area.innerHTML = `<article class="card col-12"><h3>Загрузка...</h3></article>`;
    try {
      const tasks = await this.api(`/objects/${this.selectedProject.id}/tasks`);
      const [tepRows, estimateRows, designRows, smrRows] = await Promise.all([
        this.api(`/objects/${this.selectedProject.id}/templates/tep/rows`),
        this.api(`/objects/${this.selectedProject.id}/templates/summary_estimate/rows`),
        this.api(`/objects/${this.selectedProject.id}/templates/design_schedule/rows`),
        this.api(`/objects/${this.selectedProject.id}/templates/smr_schedule/rows`),
      ]);

      area.innerHTML = `
        <article class="card col-12">
          <span class="tag">Проект</span>
          <h3>${this.selectedProject.name}</h3>
          <div class="metric">${this.selectedProject.address || "Адрес не заполнен"}</div>
        </article>

        <article class="card col-6">
          <h3>График (задачи)</h3>
          ${this.renderTasksTable(tasks)}
          <button class="primary" id="addTaskBtn">+ Добавить задачу</button>
        </article>

        <article class="card col-6">
          <h3>ТЭП</h3>
          ${this.renderSimpleTable(tepRows, ["indicator", "unit", "amount"])}
          <button class="primary" id="addTepBtn">+ Добавить строку ТЭП</button>
        </article>

        <article class="card col-6">
          <h3>Смета</h3>
          ${this.renderSimpleTable(estimateRows, ["work_name", "total_cost"])}
          <button class="primary" id="addEstimateBtn">+ Добавить строку сметы</button>
        </article>

        <article class="card col-6">
          <h3>График проектирования</h3>
          ${this.renderSimpleTable(designRows, ["name", "executor", "progress"])}
          <button class="primary" id="addDesignBtn">+ Добавить строку графика ПД</button>
        </article>

        <article class="card col-12">
          <h3>График СМР</h3>
          ${this.renderSimpleTable(smrRows, [
            "num",
            "task_name",
            "contractor",
            "contract_start",
            "contract_end",
            "progress",
            "duration",
            "fact_start",
            "fact_end",
            "finish_deviation",
          ])}
          <div style="display:flex; gap:8px; flex-wrap: wrap;">
            <button class="primary" id="addSmrBtn">+ Добавить строку СМР</button>
            <button class="ghost" id="loadSdrTemplateBtn">Загрузить шаблон СДР</button>
            <button class="ghost" id="exportSmrBtn">Экспорт JSON</button>
            <button class="ghost" id="clearSmrBtn">Очистить СМР</button>
          </div>
        </article>
      `;

      this.bindAddButtons();
    } catch (e) {
      area.innerHTML = `<article class="card col-12"><h3>Ошибка</h3><p>${e.message}</p></article>`;
    }
  }

  renderTasksTable(tasks) {
    if (!tasks?.length) return "<p>Нет задач.</p>";
    return `<table class="table"><thead><tr><th>Название</th><th>Старт</th><th>Финиш</th><th>%</th></tr></thead><tbody>
      ${tasks
        .map(
          (t) => `<tr><td>${t.name || ""}</td><td>${t.start_date || ""}</td><td>${t.end_date || ""}</td><td>${Math.round(t.progress || 0)}</td></tr>`
        )
        .join("")}
    </tbody></table>`;
  }

  renderSimpleTable(rows, keys) {
    if (!rows?.length) return "<p>Нет данных.</p>";
    const header = keys.map((k) => `<th>${this.escapeHtml(k)}</th>`).join("");
    const body = rows
      .map((row) => `<tr>${keys.map((k) => `<td>${this.escapeHtml((row.data && row.data[k]) || "")}</td>`).join("")}</tr>`)
      .join("");
    return `<table class="table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
  }

  bindAddButtons() {
    const project = this.selectedProject;
    if (!project) return;
    this.bindPromptTemplateButton("addTepBtn", "tep", ["indicator", "unit", "amount"]);
    this.bindPromptTemplateButton("addEstimateBtn", "summary_estimate", ["work_name", "total_cost"]);
    this.bindPromptTemplateButton("addDesignBtn", "design_schedule", ["name", "executor", "progress"]);
    this.bindPromptTemplateButton("addSmrBtn", "smr_schedule", [
      "num",
      "task_name",
      "contractor",
      "contract_start",
      "contract_end",
      "progress",
      "duration",
      "fact_start",
      "fact_end",
      "finish_deviation",
    ]);

    const loadSdrTemplateBtn = document.getElementById("loadSdrTemplateBtn");
    if (loadSdrTemplateBtn) {
      loadSdrTemplateBtn.addEventListener("click", async () => {
        try {
          await this.loadSdrTemplate();
          this.notify(`Шаблон СДР загружен (${this.sdrTemplateRows.length} строк)`);
          this.renderContent();
        } catch (e) {
          this.notify(`Ошибка загрузки шаблона СДР: ${e.message}`);
        }
      });
    }

    const exportSmrBtn = document.getElementById("exportSmrBtn");
    if (exportSmrBtn) {
      exportSmrBtn.addEventListener("click", async () => {
        try {
          const rows = await this.api(`/objects/${this.selectedProject.id}/templates/smr_schedule/rows`);
          const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `smr_schedule_${this.selectedProject.id}.json`;
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          this.notify(`Ошибка экспорта СМР: ${e.message}`);
        }
      });
    }

    const clearSmrBtn = document.getElementById("clearSmrBtn");
    if (clearSmrBtn) {
      clearSmrBtn.addEventListener("click", async () => {
        if (!confirm("Удалить все строки шаблона СМР в текущем проекте?")) return;
        try {
          await this.clearSmrRows();
          this.notify("Шаблон СМР очищен");
          this.renderContent();
        } catch (e) {
          this.notify(`Ошибка очистки СМР: ${e.message}`);
        }
      });
    }

    const addTaskBtn = document.getElementById("addTaskBtn");
    if (addTaskBtn) {
      addTaskBtn.addEventListener("click", async () => {
        const name = prompt("Название задачи:");
        if (!name) return;
        const start = prompt("Дата начала (YYYY-MM-DD):", "");
        const end = prompt("Дата окончания (YYYY-MM-DD):", "");
        try {
          await this.api("/tasks", {
            method: "POST",
            body: JSON.stringify({ object_id: project.id, name, start_date: start, end_date: end, progress: 0 }),
          });
          this.notify("Задача добавлена");
          this.renderContent();
        } catch (e) {
          this.notify(`Ошибка добавления задачи: ${e.message}`);
        }
      });
    }
  }

  bindPromptTemplateButton(buttonId, code, fields) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const data = {};
      for (const field of fields) {
        const value = prompt(`Введите ${field}:`, "");
        if (value === null) return;
        data[field] = value;
      }
      try {
        await this.api(`/objects/${this.selectedProject.id}/templates/${code}/rows`, {
          method: "POST",
          body: JSON.stringify({ data }),
        });
        this.notify("Строка добавлена");
        this.renderContent();
      } catch (e) {
        this.notify(`Ошибка добавления строки: ${e.message}`);
      }
    });
  }

  renderAuthModel() {
    return `
      <article class="card col-12">
        <h3>Авторизация и роли</h3>
        <p class="metric">Базовые таблицы пользователей и ролей уже созданы на backend. Этот блок — справочный.</p>
      </article>`;
  }

  openModal() {
    document.getElementById("projectModal").classList.add("open");
  }

  closeModal() {
    document.getElementById("projectModal").classList.remove("open");
  }

  async saveProject() {
    const name = document.getElementById("projectName").value.trim();
    const description = document.getElementById("projectDescription").value.trim();
    if (!name) return this.notify("Введите наименование проекта");

    try {
      await this.api("/objects", {
        method: "POST",
        body: JSON.stringify({
          name,
          address: description,
          status: "planning",
        }),
      });
      this.closeModal();
      document.getElementById("projectName").value = "";
      document.getElementById("projectDescription").value = "";
      await this.loadProjects();
      this.renderMenu();
      this.renderContent();
      this.notify("Проект добавлен");
    } catch (e) {
      this.notify(`Ошибка добавления проекта: ${e.message}`);
    }
  }

  notify(message) {
    alert(message);
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async clearSmrRows() {
    const rows = await this.api(`/objects/${this.selectedProject.id}/templates/smr_schedule/rows`);
    for (const row of rows) {
      await this.api(`/objects/${this.selectedProject.id}/templates/smr_schedule/rows/${row.id}`, { method: "DELETE" });
    }
  }

  async loadSdrTemplate() {
    await this.clearSmrRows();
    for (const data of this.sdrTemplateRows) {
      await this.api(`/objects/${this.selectedProject.id}/templates/smr_schedule/rows`, {
        method: "POST",
        body: JSON.stringify({ data }),
      });
    }
  }

  getSdrTemplateRows() {
    return [
      { num: "1", task_name: "Объект Онкоцентр", contractor: "", contract_start: "2023-06-01", contract_end: "2026-08-01", progress: "24", duration: "1277.08", fact_start: "2023-06-01", fact_end: "2026-11-29", finish_deviation: "120.08" },
      { num: "1.1", task_name: "Строительство Онкоцентра г. Пермь", contractor: "", contract_start: "2023-06-01", contract_end: "2026-01-27", progress: "24", duration: "1092.08", fact_start: "2023-06-01", fact_end: "2026-05-28", finish_deviation: "120.08" },
      { num: "1.1.1", task_name: "Основные работы", contractor: "", contract_start: "2023-08-14", contract_end: "2026-01-27", progress: "22", duration: "1018.08", fact_start: "2023-08-14", fact_end: "2026-05-28", finish_deviation: "120.08" },
      { num: "1.1.2.2", task_name: "Блок № 1. Центральный блок", contractor: "", contract_start: "2024-01-31", contract_end: "2026-01-27", progress: "21", duration: "821.88", fact_start: "2024-01-31", fact_end: "2026-05-01", finish_deviation: "93.88" },
      { num: "1.1.2.2.8", task_name: "Устройство фасадов, витражи, окна", contractor: "", contract_start: "2025-02-15", contract_end: "2025-11-07", progress: "0", duration: "308.88", fact_start: "2025-03-04", fact_end: "2026-01-06", finish_deviation: "59.88" },
      { num: "1.1.2.2.10", task_name: "Отделочные работы", contractor: "", contract_start: "2025-02-15", contract_end: "2026-01-27", progress: "1", duration: "381.88", fact_start: "2025-04-15", fact_end: "2026-05-01", finish_deviation: "93.88" },
      { num: "1.1.2.2.11", task_name: "Монтаж внутренних сетей", contractor: "", contract_start: "2025-02-15", contract_end: "2026-01-27", progress: "0", duration: "470.88", fact_start: "2025-01-16", fact_end: "2026-05-01", finish_deviation: "93.88" },
      { num: "1.1.2.3", task_name: "Блок № 2. Блок ядерной медицины", contractor: "", contract_start: "2023-08-14", contract_end: "2026-01-21", progress: "17", duration: "1018.08", fact_start: "2023-08-14", fact_end: "2026-05-28", finish_deviation: "126.08" },
      { num: "1.1.2.4", task_name: "Блок № 3. Палатный блок", contractor: "", contract_start: "2024-01-31", contract_end: "2025-12-21", progress: "34", duration: "785.29", fact_start: "2024-01-31", fact_end: "2026-03-26", finish_deviation: "94.31" },
      { num: "1.1.2.5", task_name: "Пансионат", contractor: "", contract_start: "2023-09-13", contract_end: "2025-10-17", progress: "28", duration: "858", fact_start: "2023-09-13", fact_end: "2026-01-17", finish_deviation: "92" },
      { num: "1.1.2.6", task_name: "Возведение инженерно-технических сооружений", contractor: "", contract_start: "2024-06-03", contract_end: "2025-07-05", progress: "51", duration: "517.88", fact_start: "2024-06-01", fact_end: "2025-10-31", finish_deviation: "117.88" },
      { num: "1.1.2.8", task_name: "ВРУ", contractor: "", contract_start: "2025-01-31", contract_end: "2025-05-02", progress: "0", duration: "100.88", fact_start: "2025-06-04", fact_end: "2025-09-13", finish_deviation: "134" },
      { num: "1.1.2.9", task_name: "Наружные сети", contractor: "", contract_start: "2024-09-12", contract_end: "2025-08-20", progress: "14", duration: "497.2", fact_start: "2024-09-01", fact_end: "2026-01-11", finish_deviation: "143.2" },
      { num: "1.1.2.9.1.4", task_name: "Наружные сети теплоснабжения", contractor: "Вектор Строй", contract_start: "2025-02-10", contract_end: "2025-05-21", progress: "3", duration: "297.2", fact_start: "2025-01-22", fact_end: "2025-11-15", finish_deviation: "177.33" },
      { num: "1.1.2.9.2.3", task_name: "Наружные сети водоотведения. Канализация хозбытовая. НВК2", contractor: "Вертикаль", contract_start: "2025-01-21", contract_end: "2025-06-10", progress: "18", duration: "220.59", fact_start: "2025-02-01", fact_end: "2025-09-09", finish_deviation: "91.22" },
      { num: "1.1.2.9.2.4", task_name: "Наружные сети водоотведения. Канализация дождевая. НВК3", contractor: "Вертикаль", contract_start: "2024-11-11", contract_end: "2025-06-07", progress: "34", duration: "417.88", fact_start: "2024-11-08", fact_end: "2025-12-30", finish_deviation: "205.88" },
      { num: "1.1.2.9.2.5", task_name: "Наружные сети водоснабжения. Поливочный водопровод. НВК1", contractor: "Вертикаль", contract_start: "2024-11-12", contract_end: "2025-05-14", progress: "9", duration: "388.88", fact_start: "2024-11-12", fact_end: "2025-12-05", finish_deviation: "204.88" },
      { num: "1.1.2.10", task_name: "Благоустройство территории", contractor: "", contract_start: "2025-02-28", contract_end: "2025-09-25", progress: "0", duration: "136", fact_start: "2025-06-04", fact_end: "2025-10-18", finish_deviation: "22.88" },
    ];
  }
}

window.addEventListener("DOMContentLoaded", () => new ConstructionManagerUI());
