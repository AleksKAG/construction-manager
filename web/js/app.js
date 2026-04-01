// Construction AI - Frontend Application

const API_BASE = '/api/v1';

class ConstructionApp {
    constructor() {
        this.currentPage = 'dashboard';
        this.data = {
            objects: [],
            organizations: [],
            specialists: [],
            documents: [],
            approvals: [],
            schedule: [],
            risks: []
        };
        this.init();
    }

    async init() {
        this.bindEvents();
        await this.loadObjects();
        await this.loadSchedule();
        this.loadPage('dashboard');
    }

    async loadObjects() {
        try {
            const response = await fetch(`${API_BASE}/objects`);
            if (response.ok) {
                this.data.objects = await response.json();
            }
        } catch (error) {
            console.error('Failed to load objects:', error);
        }
    }

    async loadSchedule() {
        const firstObject = this.data.objects[0];
        if (!firstObject?.id) {
            this.data.schedule = [];
            return;
        }

        try {
            const response = await fetch(`${API_BASE}/objects/${firstObject.id}/tasks`);
            if (response.ok) {
                this.data.schedule = await response.json();
            } else {
                this.data.schedule = [];
            }
        } catch (error) {
            console.error('Failed to load schedule:', error);
            this.data.schedule = [];
        }
    }

    bindEvents() {
        // Navigation items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.loadPage(page);
            });
        });

        // Sidebar toggle
        const sidebarToggle = document.getElementById('sidebarToggle');
        if (sidebarToggle) {
            sidebarToggle.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('collapsed');
                document.querySelector('.main-content').classList.toggle('expanded');
            });
        }

        // Mobile menu
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                document.getElementById('sidebar').classList.toggle('active');
            });
        }

        // Add action button
        const addActionBtn = document.getElementById('addActionBtn');
        if (addActionBtn) {
            addActionBtn.addEventListener('click', () => {
                this.showAddModal();
            });
        }

        // Modal close
        const modalClose = document.getElementById('modalClose');
        const modalOverlay = document.querySelector('.modal-overlay');
        
        if (modalClose) {
            modalClose.addEventListener('click', () => {
                this.closeModal();
            });
        }
        
        if (modalOverlay) {
            modalOverlay.addEventListener('click', () => {
                this.closeModal();
            });
        }

        // Close modal on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeModal();
            }
        });
    }

    loadPage(page) {
        this.currentPage = page;
        
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.page === page) {
                item.classList.add('active');
            }
        });

        // Update page title
        const titles = {
            dashboard: 'Дашборд',
            objects: 'Объекты строительства',
            organizations: 'Организации',
            specialists: 'Специалисты',
            documents: 'Документы',
            approvals: 'Согласования',
            schedule: 'График работ',
            risks: 'Риски'
        };
        document.getElementById('pageTitle').textContent = titles[page] || 'Страница';

        // Load content
        this.renderContent(page);
    }

    renderContent(page) {
        const contentArea = document.getElementById('contentArea');
        let html = '';

        switch(page) {
            case 'dashboard':
                html = this.renderDashboard();
                break;
            case 'objects':
                html = this.renderObjects();
                break;
            case 'organizations':
                html = this.renderOrganizations();
                break;
            case 'specialists':
                html = this.renderSpecialists();
                break;
            case 'documents':
                html = this.renderDocuments();
                break;
            case 'approvals':
                html = this.renderApprovals();
                break;
            case 'schedule':
                html = this.renderSchedule();
                break;
            case 'risks':
                html = this.renderRisks();
                break;
            default:
                html = '<div class="card"><p>Страница не найдена</p></div>';
        }

        contentArea.innerHTML = html;
        contentArea.classList.add('fade-in');
        setTimeout(() => contentArea.classList.remove('fade-in'), 300);
    }

    renderDashboard() {
        return `
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-icon blue">🏢</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.data.objects.length || 5}</div>
                        <div class="stat-label">Объектов</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon green">🏛️</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.data.organizations.length || 12}</div>
                        <div class="stat-label">Организаций</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon yellow">👥</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.data.specialists.length || 24}</div>
                        <div class="stat-label">Специалистов</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon red">⚠️</div>
                    <div class="stat-content">
                        <div class="stat-value">${this.data.risks.length || 3}</div>
                        <div class="stat-label">Активных рисков</div>
                    </div>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Последние объекты</h2>
                    <button class="btn btn-secondary btn-sm" onclick="app.loadPage('objects')">Все объекты</button>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Тип</th>
                                <th>Статус</th>
                                <th>Заказчик</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>ЖК "Северный"</td>
                                <td>новое строительство</td>
                                <td><span class="badge badge-success">строительство</span></td>
                                <td>ООО "Застройщик"</td>
                            </tr>
                            <tr>
                                <td>ТЦ "Плаза"</td>
                                <td>реконструкция</td>
                                <td><span class="badge badge-warning">проектирование</span></td>
                                <td>АО "Инвест"</td>
                            </tr>
                            <tr>
                                <td>Школа №45</td>
                                <td>капитальный ремонт</td>
                                <td><span class="badge badge-info">сдан</span></td>
                                <td>Управление образования</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Статус согласований</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Документ</th>
                                <th>Тип согласования</th>
                                <th>Статус</th>
                                <th>Дата</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Проектная документация АР</td>
                                <td>Мосгосстройнадзор</td>
                                <td><span class="badge badge-warning">ожидает</span></td>
                                <td>15.03.2026</td>
                            </tr>
                            <tr>
                                <td>Раздел КМ</td>
                                <td>Внутреннее</td>
                                <td><span class="badge badge-success">одобрено</span></td>
                                <td>10.03.2026</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderObjects() {
        const objects = this.data.objects.length > 0 ? this.data.objects : [];
        
        let rows = '';
        if (objects.length === 0) {
            rows = '<tr><td colspan="7" style="text-align:center;">Нет данных</td></tr>';
        } else {
            rows = objects.map(obj => `
                <tr>
                    <td>${this.escapeHtml(obj.name || 'Без названия')}</td>
                    <td>${this.escapeHtml(obj.address || '')}</td>
                    <td><span class="badge badge-${this.getStatusClass(obj.status)}">${this.escapeHtml(obj.status || 'planning')}</span></td>
                    <td>${obj.budget ? this.formatCurrency(obj.budget) : '-'}</td>
                    <td>${obj.duration_days || '-'}</td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="app.editObject('${obj.id}')">✏️</button>
                        <button class="btn btn-secondary btn-sm" onclick="app.deleteObject('${obj.id}')">🗑️</button>
                    </td>
                </tr>
            `).join('');
        }
        
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Список объектов</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Адрес</th>
                                <th>Статус</th>
                                <th>Бюджет</th>
                                <th>Длительность (дней)</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    formatCurrency(value) {
        if (!value) return '-';
        return new Intl.NumberFormat('ru-RU', { 
            style: 'currency', 
            currency: 'RUB',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value);
    }

    getStatusClass(status) {
        const statusMap = {
            'planning': 'warning',
            'active': 'success',
            'completed': 'info',
            'on_hold': 'secondary'
        };
        return statusMap[status] || 'secondary';
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async editObject(id) {
        const obj = this.data.objects.find(o => o.id === id);
        if (!obj) return;

        const modal = document.getElementById('addModal');
        document.getElementById('modalTitle').textContent = 'Редактировать объект';
        document.getElementById('modalBody').innerHTML = `
            <form id="editObjectForm">
                <input type="hidden" id="editObjId" value="${obj.id}">
                <div class="form-group">
                    <label class="form-label" for="editObjName">Название *</label>
                    <input type="text" id="editObjName" class="form-input" value="${this.escapeHtml(obj.name)}" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="editObjAddress">Адрес</label>
                    <input type="text" id="editObjAddress" class="form-input" value="${this.escapeHtml(obj.address || '')}">
                </div>
                <div class="form-group">
                    <label class="form-label" for="editObjStatus">Статус *</label>
                    <select id="editObjStatus" class="form-select" required>
                        <option value="planning" ${obj.status === 'planning' ? 'selected' : ''}>Планирование</option>
                        <option value="active" ${obj.status === 'active' ? 'selected' : ''}>Активный</option>
                        <option value="completed" ${obj.status === 'completed' ? 'selected' : ''}>Завершен</option>
                        <option value="on_hold" ${obj.status === 'on_hold' ? 'selected' : ''}>Приостановлен</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="editObjBudget">Бюджет</label>
                    <input type="number" id="editObjBudget" class="form-input" value="${obj.budget || ''}" step="0.01">
                </div>
                <div class="form-group">
                    <label class="form-label" for="editObjDuration">Длительность (дней)</label>
                    <input type="number" id="editObjDuration" class="form-input" value="${obj.duration_days || ''}">
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </div>
            </form>
        `;
        modal.classList.add('active');

        document.getElementById('editObjectForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveObjectEdit(id);
        });
    }

    async saveObjectEdit(id) {
        const data = {
            name: document.getElementById('editObjName').value,
            address: document.getElementById('editObjAddress').value,
            status: document.getElementById('editObjStatus').value,
            budget: parseFloat(document.getElementById('editObjBudget').value) || 0,
            duration_days: parseInt(document.getElementById('editObjDuration').value) || 0
        };

        try {
            const response = await fetch(`${API_BASE}/objects/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                await this.loadObjects();
                this.renderContent(this.currentPage);
                this.closeModal();
                alert('Объект успешно обновлен!');
            } else {
                alert('Ошибка при обновлении объекта');
            }
        } catch (error) {
            console.error('Error updating object:', error);
            alert('Ошибка при обновлении объекта');
        }
    }

    async deleteObject(id) {
        if (!confirm('Вы уверены, что хотите удалить этот объект?')) return;

        try {
            const response = await fetch(`${API_BASE}/objects/${id}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                await this.loadObjects();
                this.renderContent(this.currentPage);
                alert('Объект успешно удален!');
            } else {
                alert('Ошибка при удалении объекта');
            }
        } catch (error) {
            console.error('Error deleting object:', error);
            alert('Ошибка при удалении объекта');
        }
    }

    renderOrganizations() {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Организации</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Тип</th>
                                <th>Контактное лицо</th>
                                <th>Телефон</th>
                                <th>Email</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>ООО "Застройщик"</td>
                                <td><span class="badge badge-info">заказчик</span></td>
                                <td>Иванов И.И.</td>
                                <td>+7 (495) 123-45-67</td>
                                <td>info@zastroyschik.ru</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                    <button class="btn btn-secondary btn-sm">🗑️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>АО "СтройМонтаж"</td>
                                <td><span class="badge badge-success">генподрядчик</span></td>
                                <td>Петров П.П.</td>
                                <td>+7 (495) 234-56-78</td>
                                <td>info@stroymontazh.ru</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                    <button class="btn btn-secondary btn-sm">🗑️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>ЗАО "ПроектИнститут"</td>
                                <td><span class="badge badge-warning">проектировщик</span></td>
                                <td>Сидоров С.С.</td>
                                <td>+7 (495) 345-67-89</td>
                                <td>info@projectinst.ru</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                    <button class="btn btn-secondary btn-sm">🗑️</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderSpecialists() {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Специалисты</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>ФИО</th>
                                <th>Роль</th>
                                <th>Организация</th>
                                <th>Телефон</th>
                                <th>Email</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Иванов Иван Иванович</td>
                                <td>Главный инженер</td>
                                <td>ООО "Застройщик"</td>
                                <td>+7 (999) 111-22-33</td>
                                <td>ivanov@zastroyschik.ru</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                    <button class="btn btn-secondary btn-sm">🗑️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>Петров Петр Петрович</td>
                                <td>Архитектор</td>
                                <td>ЗАО "ПроектИнститут"</td>
                                <td>+7 (999) 222-33-44</td>
                                <td>petrov@projectinst.ru</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                    <button class="btn btn-secondary btn-sm">🗑️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>Сидоров Сергей Сергеевич</td>
                                <td>Прораб</td>
                                <td>АО "СтройМонтаж"</td>
                                <td>+7 (999) 333-44-55</td>
                                <td>sidorov@stroymontazh.ru</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                    <button class="btn btn-secondary btn-sm">🗑️</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderDocuments() {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Документы</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Код</th>
                                <th>Версия</th>
                                <th>Статус</th>
                                <th>Загружен</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Архитектурные решения</td>
                                <td>АР</td>
                                <td>2</td>
                                <td><span class="badge badge-warning">на согласовании</span></td>
                                <td>15.03.2026</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">📥</button>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>Конструктивные решения</td>
                                <td>КР</td>
                                <td>1</td>
                                <td><span class="badge badge-success">согласован</span></td>
                                <td>10.03.2026</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">📥</button>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderApprovals() {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Согласования</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Документ</th>
                                <th>Тип</th>
                                <th>Согласующий</th>
                                <th>Статус</th>
                                <th>Комментарий</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Проектная документация АР</td>
                                <td>Мосгосстройнадзор</td>
                                <td>Госэкспертиза</td>
                                <td><span class="badge badge-warning">ожидает</span></td>
                                <td>-</td>
                                <td>
                                    <button class="btn btn-primary btn-sm">✓</button>
                                    <button class="btn btn-secondary btn-sm">✗</button>
                                </td>
                            </tr>
                            <tr>
                                <td>Раздел КМ</td>
                                <td>Внутреннее</td>
                                <td>Главный инженер</td>
                                <td><span class="badge badge-success">одобрено</span></td>
                                <td>Замечаний нет</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm" disabled>✓</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderSchedule() {
        if (this.data.schedule.length > 0) {
            const rows = this.data.schedule.map(task => `
                <tr>
                    <td>${this.escapeHtml(task.name || 'Без названия')}</td>
                    <td>${this.escapeHtml(task.task_type || '—')}</td>
                    <td>${this.escapeHtml(task.start_date || '—')}</td>
                    <td>${this.escapeHtml(task.end_date || '—')}</td>
                    <td>${this.escapeHtml(task.contractor || '—')}</td>
                    <td><span class="badge badge-${this.getStatusClass(task.status)}">${this.escapeHtml(task.status || 'planning')}</span></td>
                    <td>
                        <button class="btn btn-secondary btn-sm" onclick="app.editTask('${task.id}')">✏️</button>
                    </td>
                </tr>
            `).join('');

            return `
                <div class="card">
                    <div class="card-header">
                        <h2 class="card-title">График работ</h2>
                    </div>
                    <div class="table-container">
                        <table class="data-table">
                            <thead>
                                <tr>
                                    <th>Работа</th>
                                    <th>Тип</th>
                                    <th>Начало</th>
                                    <th>Окончание</th>
                                    <th>Подрядчик</th>
                                    <th>Статус</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">График работ</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Работа</th>
                                <th>Тип</th>
                                <th>Начало</th>
                                <th>Окончание</th>
                                <th>Подрядчик</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Подготовительные работы</td>
                                <td>общестроительные</td>
                                <td>01.01.2025</td>
                                <td>31.01.2025</td>
                                <td>АО "СтройМонтаж"</td>
                                <td><span class="badge badge-success">завершено</span></td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>Нулевой цикл</td>
                                <td>общестроительные</td>
                                <td>01.02.2025</td>
                                <td>28.02.2025</td>
                                <td>АО "СтройМонтаж"</td>
                                <td><span class="badge badge-warning">в работе</span></td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>Монтаж конструкций</td>
                                <td>общестроительные</td>
                                <td>01.03.2025</td>
                                <td>30.06.2025</td>
                                <td>АО "СтройМонтаж"</td>
                                <td><span class="badge badge-gray">не начато</span></td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    renderRisks() {
        return `
            <div class="card">
                <div class="card-header">
                    <h2 class="card-title">Реестр рисков</h2>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Описание</th>
                                <th>Тип</th>
                                <th>Вероятность</th>
                                <th>Влияние</th>
                                <th>План мероприятий</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>Задержка поставки материалов</td>
                                <td><span class="badge badge-warning">поставки</span></td>
                                <td>0.7</td>
                                <td><span class="badge badge-danger">высокий</span></td>
                                <td>Поиск альтернативных поставщиков</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>Неблагоприятные погодные условия</td>
                                <td><span class="badge badge-info">погода</span></td>
                                <td>0.4</td>
                                <td><span class="badge badge-warning">средний</span></td>
                                <td>Корректировка графика работ</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>Задержка согласования документации</td>
                                <td><span class="badge badge-success">согласования</span></td>
                                <td>0.5</td>
                                <td><span class="badge badge-warning">средний</span></td>
                                <td>Ранняя подача документов</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    showAddModal() {
        const modal = document.getElementById('addModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        let formHtml = '';
        
        switch(this.currentPage) {
            case 'objects':
                modalTitle.textContent = 'Добавить объект';
                formHtml = this.getObjectsForm();
                break;
            case 'organizations':
                modalTitle.textContent = 'Добавить организацию';
                formHtml = this.getOrganizationsForm();
                break;
            case 'schedule':
                modalTitle.textContent = 'Добавить задачу';
                formHtml = this.getTaskForm();
                break;
            default:
                modalTitle.textContent = 'Добавление';
                formHtml = '<p>Форма добавления для этой страницы будет доступна позже.</p>';
        }
        
        modalBody.innerHTML = formHtml;
        modal.classList.add('active');
        
        // Bind form submit
        const form = modalBody.querySelector('form');
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFormSubmit(form);
            });
        }
    }

    getObjectsForm() {
        return `
            <form id="addObjectForm">
                <div class="form-group">
                    <label class="form-label" for="objName">Название *</label>
                    <input type="text" id="objName" name="name" class="form-input" required placeholder="Например: ЖК 'Северный'">
                </div>
                <div class="form-group">
                    <label class="form-label" for="objAddress">Адрес</label>
                    <input type="text" id="objAddress" name="address" class="form-input" placeholder="Город, улица, дом">
                </div>
                <div class="form-group">
                    <label class="form-label" for="objStatus">Статус *</label>
                    <select id="objStatus" name="status" class="form-select" required>
                        <option value="">Выберите статус</option>
                        <option value="planning">Планирование</option>
                        <option value="active">Активный</option>
                        <option value="completed">Завершен</option>
                        <option value="on_hold">Приостановлен</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="objBudget">Бюджет (₽)</label>
                    <input type="number" id="objBudget" name="budget" class="form-input" placeholder="0" min="0" step="1">
                </div>
                <div class="form-group">
                    <label class="form-label" for="objDuration">Длительность (дней)</label>
                    <input type="number" id="objDuration" name="duration_days" class="form-input" placeholder="0" min="0">
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </div>
            </form>
        `;
    }

    getOrganizationsForm() {
        return `
            <form id="addOrganizationForm">
                <div class="form-group">
                    <label class="form-label" for="orgName">Название *</label>
                    <input type="text" id="orgName" name="name" class="form-input" required placeholder="Например: ООО 'Застройщик'">
                </div>
                <div class="form-group">
                    <label class="form-label" for="orgType">Тип *</label>
                    <select id="orgType" name="type" class="form-select" required>
                        <option value="">Выберите тип</option>
                        <option value="заказчик">Заказчик</option>
                        <option value="генподрядчик">Генподрядчик</option>
                        <option value="проектировщик">Проектировщик</option>
                        <option value="экспертиза">Экспертиза</option>
                        <option value="поставщик">Поставщик</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="orgContact">Контактное лицо</label>
                    <input type="text" id="orgContact" name="contact" class="form-input" placeholder="ФИО">
                </div>
                <div class="form-group">
                    <label class="form-label" for="orgPhone">Телефон</label>
                    <input type="tel" id="orgPhone" name="phone" class="form-input" placeholder="+7 (___) ___-__-__">
                </div>
                <div class="form-group">
                    <label class="form-label" for="orgEmail">Email</label>
                    <input type="email" id="orgEmail" name="email" class="form-input" placeholder="email@example.com">
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </div>
            </form>
        `;
    }

    getTaskForm() {
        const defaultObjectID = this.data.objects[0]?.id || '';
        return `
            <form id="addTaskForm">
                <div class="form-group">
                    <label class="form-label" for="taskName">Работа *</label>
                    <input type="text" id="taskName" name="name" class="form-input" required>
                </div>
                <div class="form-group">
                    <label class="form-label" for="taskObjectId">Объект *</label>
                    <select id="taskObjectId" name="object_id" class="form-select" required>
                        ${this.data.objects.map(obj => `<option value="${obj.id}" ${obj.id === defaultObjectID ? 'selected' : ''}>${this.escapeHtml(obj.name || 'Без названия')}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="taskStatus">Статус</label>
                    <select id="taskStatus" name="status" class="form-select">
                        <option value="planning">Планирование</option>
                        <option value="active">В работе</option>
                        <option value="completed">Завершено</option>
                        <option value="on_hold">Приостановлено</option>
                    </select>
                </div>
                <div class="form-actions">
                    <button type="button" class="btn btn-secondary" onclick="app.closeModal()">Отмена</button>
                    <button type="submit" class="btn btn-primary">Сохранить</button>
                </div>
            </form>
        `;
    }

    handleFormSubmit(form) {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        // Преобразуем числовые поля
        if (data.budget) data.budget = parseFloat(data.budget);
        if (data.duration_days) data.duration_days = parseInt(data.duration_days);
        
        console.log('Form submitted:', data);
        
        if (this.currentPage === 'objects') {
            this.createObject(data);
            return;
        }
        if (this.currentPage === 'organizations') {
            this.createOrganization(data);
            return;
        }
        if (this.currentPage === 'schedule') {
            this.createTask(data);
        }
    }

    async createObject(data) {
        try {
            const response = await fetch(`${API_BASE}/objects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Object created:', result);
                alert('Объект успешно создан!');
                this.closeModal();
                await this.loadObjects();
                this.renderContent(this.currentPage);
            } else {
                const error = await response.json();
                alert('Ошибка при создании объекта: ' + (error.error || 'Неизвестная ошибка'));
            }
        } catch (error) {
            console.error('Error creating object:', error);
            alert('Ошибка при создании объекта: ' + error.message);
        }
    }

    createOrganization(data) {
        this.data.organizations.push({
            id: crypto.randomUUID(),
            ...data
        });
        alert('Организация успешно добавлена!');
        this.closeModal();
        this.renderContent(this.currentPage);
    }

    async createTask(data) {
        try {
            const response = await fetch(`${API_BASE}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            if (response.ok) {
                alert('Задача успешно создана!');
                this.closeModal();
                await this.loadSchedule();
                this.renderContent(this.currentPage);
            } else {
                const error = await response.json();
                alert('Ошибка при создании задачи: ' + (error.error || 'Неизвестная ошибка'));
            }
        } catch (error) {
            console.error('Error creating task:', error);
            alert('Ошибка при создании задачи: ' + error.message);
        }
    }

    editTask() {
        alert('Редактирование задач будет добавлено в следующей версии.');
    }

    closeModal() {
        const modal = document.getElementById('addModal');
        modal.classList.remove('active');
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ConstructionApp();
});
