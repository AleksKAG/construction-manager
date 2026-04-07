class ConstructionManagerUI {
    constructor() {
        this.projects = [];
        this.selectedProjectId = null;
        this.bindEvents();
        this.init();
    }

    async init() {
        await this.loadProjects();
        this.renderProjectTree();
        this.showMainDashboard();
    }

    bindEvents() {
        document.getElementById("toggleSidebar").addEventListener("click", () => {
            document.getElementById("sidebar").classList.toggle("open");
        });

        document.getElementById("addProjectBtn").addEventListener("click", () => this.openProjectModal());
        document.getElementById("saveProjectBtn").addEventListener("click", () => this.saveProject());
        document.querySelectorAll('[data-close="true"]').forEach((el) => {
            el.addEventListener("click", () => this.closeModal());
        });
    }

    async loadProjects() {
        try {
            const res = await fetch("/api/v1/objects");
            const payload = await res.json();
            this.projects = Array.isArray(payload) ? payload : (payload.data || []);
        } catch (e) {
            console.error(e);
        }
    }

    renderProjectTree() {
        const container = document.getElementById("projectTree");
        container.innerHTML = "";

        this.projects.forEach(project => {
            const div = document.createElement("div");
            div.className = `tree-project ${this.selectedProjectId === project.id ? 'active' : ''}`;
            div.textContent = project.name;
            div.onclick = () => this.selectProject(project.id);
            container.appendChild(div);
        });
    }

    selectProject(projectId) {
        this.selectedProjectId = projectId;
        this.renderProjectTree();
        this.showProjectView(projectId);
    }

    // Главный дашборд (все проекты)
    async showMainDashboard() {
        document.getElementById("pageTitle").textContent = "Главная";

        let html = `<h2>Обзор проектов</h2><div class="dashboard-grid">`;

        for (let p of this.projects) {
            const [design, smr] = await this.getProgress(p.id);
            html += `
                <div class="card" onclick="ui.selectProject('${p.id}')">
                    <h3>${p.name}</h3>
                    <p>${p.address || '—'}</p>
                    <div class="progress-container">
                        <div>Проектирование: ${design.toFixed(0)}%</div>
                        <div class="progress-bar"><div style="width:${design}%"></div></div>
                        <div>СМР: ${smr.toFixed(0)}%</div>
                        <div class="progress-bar"><div style="width:${smr}%"></div></div>
                    </div>
                </div>`;
        }

        html += `</div>`;
        document.getElementById("contentArea").innerHTML = html;
    }

    async getProgress(projectId) {
        try {
            const res = await fetch(`/api/v1/dashboard/progress/${projectId}`);
            const data = await res.json();
            return [data.design || 0, data.smr || 0];
        } catch (e) {
            return [0, 0];
        }
    }

    async showProjectView(projectId) {
        const project = this.projects.find(p => p.id === projectId);
        if (!project) return;

        document.getElementById("pageTitle").textContent = project.name;

        const html = `
            <div class="project-view">
                <h2>${project.name}</h2>
                <div class="menu-grid">
                    <button onclick="ui.goToSection('${projectId}', 'design')">График Проектирования</button>
                    <button onclick="ui.goToSection('${projectId}', 'tep')">ТЭП</button>
                    <button onclick="ui.goToSection('${projectId}', 'estimate')">Сметная документация</button>
                    <button onclick="ui.goToSection('${projectId}', 'smr')">График СМР</button>
                    <button onclick="ui.goToSection('${projectId}', 'documents')">Документация</button>
                    <button onclick="ui.goToSection('${projectId}', 'protocols')">Протоколы</button>
                </div>
            </div>`;

        document.getElementById("contentArea").innerHTML = html;
    }

    goToSection(projectId, section) {
        alert(`Открывается раздел "${section}" для проекта ${projectId}\n\n(Будет реализовано в следующем шаге)`);
    }

    openProjectModal() {
        document.getElementById("projectModal").style.display = "flex";
    }

    async saveProject() {
        const name = document.getElementById("projectName").value.trim();
        if (!name) return alert("Введите название проекта");

        try {
            await fetch("/api/v1/objects", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ name, address: document.getElementById("projectDescription").value })
            });

            this.closeModal();
            await this.loadProjects();
            this.renderProjectTree();
            this.showMainDashboard();
        } catch (e) {
            alert("Ошибка: " + e.message);
        }
    }

    closeModal() {
        document.getElementById("projectModal").style.display = "none";
    }
}

window.ui = new ConstructionManagerUI(); // глобально для onclick
