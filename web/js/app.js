class ConstructionManagerUI {
    constructor() {
        this.projects = [];
        this.selectedProjectId = null;
        this.currentView = "dashboard";
        this.bindEvents();
        this.init();
    }

    async init() {
        await this.loadProjects();
        this.renderProjectTree();
        this.showDashboard();
    }

    bindEvents() {
        document.getElementById("toggleSidebar").addEventListener("click", () => {
            document.getElementById("sidebar").classList.toggle("open");
        });

        document.getElementById("addProjectBtn").addEventListener("click", () => this.openProjectModal());
        document.getElementById("saveProjectBtn").addEventListener("click", () => this.saveNewProject());

        // Закрытие модалки
        document.querySelectorAll("[data-close]").forEach(el => {
            el.addEventListener("click", () => this.closeModal());
        });
    }

    async loadProjects() {
        try {
            const res = await fetch("/api/v1/objects");
            this.projects = await res.json();
            if (!this.selectedProjectId && this.projects.length > 0) {
                this.selectedProjectId = this.projects[0].id;
            }
        } catch (e) {
            console.error("Ошибка загрузки проектов", e);
        }
    }

    renderProjectTree() {
        const tree = document.getElementById("projectTree");
        tree.innerHTML = "";

        this.projects.forEach(project => {
            const item = document.createElement("div");
            item.className = `tree-item ${this.selectedProjectId === project.id ? "active" : ""}`;
            item.textContent = project.name || "Без названия";
            item.onclick = () => {
                this.selectedProjectId = project.id;
                this.renderProjectTree();
                this.showProjectDashboard(project);
            };
            tree.appendChild(item);
        });

        // Кнопка "Добавить проект"
        const addBtn = document.createElement("button");
        addBtn.className = "tree-item add";
        addBtn.textContent = "+ Добавить проект";
        addBtn.onclick = () => this.openProjectModal();
        tree.appendChild(addBtn);
    }

    // Главный дашборд (все проекты)
    async showDashboard() {
        this.currentView = "dashboard";
        document.getElementById("pageTitle").textContent = "Главная";

        let html = `<h2>Обзор всех проектов</h2><div class="dashboard-grid">`;

        for (const p of this.projects) {
            const tasks = await this.fetchTasks(p.id).catch(() => []);
            const progress = tasks.length ?
                Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length) : 0;

            html += `
                <div class="card">
                    <h3>${p.name}</h3>
                    <p>${p.address || "Адрес не указан"}</p>
                    <div class="progress-bar">
                        <div class="progress" style="width: ${progress}%"></div>
                    </div>
                    <small>Готовность: ${progress}%</small>
                </div>`;
        }

        html += `</div>`;
        document.getElementById("contentArea").innerHTML = html;
    }

    async showProjectDashboard(project) {
        document.getElementById("pageTitle").textContent = project.name;

        const html = `
            <div class="project-header">
                <h2>${project.name}</h2>
                <p>${project.address || ""}</p>
            </div>
            <div class="quick-actions">
                <button onclick="ui.showSection('design')">График Проектирования</button>
                <button onclick="ui.showSection('tep')">ТЭП</button>
                <button onclick="ui.showSection('estimate')">Сметная документация</button>
                <button onclick="ui.showSection('smr')">График СМР</button>
            </div>`;

        document.getElementById("contentArea").innerHTML = html;
    }

    // Вспомогательные методы
    async fetchTasks(projectId) {
        const res = await fetch(`/api/v1/objects/${projectId}/tasks`);
        return res.json();
    }

    openProjectModal() {
        document.getElementById("projectModal").style.display = "flex";
    }

    closeModal() {
        document.getElementById("projectModal").style.display = "none";
    }

    async saveNewProject() {
        const name = document.getElementById("projectName").value.trim();
        const description = document.getElementById("projectDescription").value.trim();

        if (!name) return alert("Введите наименование проекта");

        try {
            await fetch("/api/v1/objects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, address: description, status: "planning" })
            });

            this.closeModal();
            document.getElementById("projectName").value = "";
            document.getElementById("projectDescription").value = "";

            await this.loadProjects();
            this.renderProjectTree();
            this.showDashboard();

            alert("Проект успешно добавлен!");
        } catch (e) {
            alert("Ошибка при создании проекта: " + e.message);
        }
    }

    // Заглушка для будущих разделов
    showSection(section) {
        alert(`Раздел "${section}" будет открыт в следующей версии.\n\nСейчас доступны только базовые дашборды.`);
    }
}

// Инициализация
let ui;
window.addEventListener("DOMContentLoaded", () => {
    ui = new ConstructionManagerUI();
});
