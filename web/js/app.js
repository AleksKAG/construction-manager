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
    this.bind();
    this.init();
  }

  async init() {
    await this.loadProjects();
    this.renderMenu();
    this.renderContent();
  }

  bind() {
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
          ${this.renderSimpleTable(smrRows, ["task_name", "contractor", "progress"])}
          <button class="primary" id="addSmrBtn">+ Добавить строку СМР</button>
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
    const header = keys.map((k) => `<th>${k}</th>`).join("");
    const body = rows
      .map((row) => `<tr>${keys.map((k) => `<td>${(row.data && row.data[k]) || ""}</td>`).join("")}</tr>`)
      .join("");
    return `<table class="table"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
  }

  bindAddButtons() {
    const project = this.selectedProject;
    if (!project) return;
    this.bindPromptTemplateButton("addTepBtn", "tep", ["indicator", "unit", "amount"]);
    this.bindPromptTemplateButton("addEstimateBtn", "summary_estimate", ["work_name", "total_cost"]);
    this.bindPromptTemplateButton("addDesignBtn", "design_schedule", ["name", "executor", "progress"]);
    this.bindPromptTemplateButton("addSmrBtn", "smr_schedule", ["task_name", "contractor", "progress"]);

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
}

window.addEventListener("DOMContentLoaded", () => new ConstructionManagerUI());
