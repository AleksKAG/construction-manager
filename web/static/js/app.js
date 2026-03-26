// Construction AI - Frontend Application

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

    init() {
        this.bindEvents();
        this.loadPage('dashboard');
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
                                <th>Тип</th>
                                <th>Статус</th>
                                <th>Начало</th>
                                <th>Окончание</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>ЖК "Северный"</td>
                                <td>ул. Ленина, 45</td>
                                <td>новое строительство</td>
                                <td><span class="badge badge-success">строительство</span></td>
                                <td>01.01.2025</td>
                                <td>31.12.2026</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                    <button class="btn btn-secondary btn-sm">🗑️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>ТЦ "Плаза"</td>
                                <td>пр. Мира, 12</td>
                                <td>реконструкция</td>
                                <td><span class="badge badge-warning">проектирование</span></td>
                                <td>01.03.2025</td>
                                <td>30.06.2026</td>
                                <td>
                                    <button class="btn btn-secondary btn-sm">✏️</button>
                                    <button class="btn btn-secondary btn-sm">🗑️</button>
                                </td>
                            </tr>
                            <tr>
                                <td>Школа №45</td>
                                <td>ул. Гагарина, 8</td>
                                <td>капитальный ремонт</td>
                                <td><span class="badge badge-info">сдан</span></td>
                                <td>01.09.2024</td>
                                <td>31.08.2025</td>
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
                    <input type="text" id="objName" class="form-input" required placeholder="Например: ЖК 'Северный'">
                </div>
                <div class="form-group">
                    <label class="form-label" for="objAddress">Адрес</label>
                    <input type="text" id="objAddress" class="form-input" placeholder="Город, улица, дом">
                </div>
                <div class="form-group">
                    <label class="form-label" for="objType">Тип *</label>
                    <select id="objType" class="form-select" required>
                        <option value="">Выберите тип</option>
                        <option value="новое строительство">Новое строительство</option>
                        <option value="реконструкция">Реконструкция</option>
                        <option value="капитальный ремонт">Капитальный ремонт</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="objStatus">Статус *</label>
                    <select id="objStatus" class="form-select" required>
                        <option value="">Выберите статус</option>
                        <option value="проектирование">Проектирование</option>
                        <option value="строительство">Строительство</option>
                        <option value="сдан">Сдан</option>
                        <option value="приостановлен">Приостановлен</option>
                    </select>
                </div>
                <div class="form-group">
                    <label class="form-label" for="objStartDate">Дата начала</label>
                    <input type="date" id="objStartDate" class="form-input">
                </div>
                <div class="form-group">
                    <label class="form-label" for="objEndDate">Дата окончания</label>
                    <input type="date" id="objEndDate" class="form-input">
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
                    <input type="text" id="orgName" class="form-input" required placeholder="Например: ООО 'Застройщик'">
                </div>
                <div class="form-group">
                    <label class="form-label" for="orgType">Тип *</label>
                    <select id="orgType" class="form-select" required>
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
                    <input type="text" id="orgContact" class="form-input" placeholder="ФИО">
                </div>
                <div class="form-group">
                    <label class="form-label" for="orgPhone">Телефон</label>
                    <input type="tel" id="orgPhone" class="form-input" placeholder="+7 (___) ___-__-__">
                </div>
                <div class="form-group">
                    <label class="form-label" for="orgEmail">Email</label>
                    <input type="email" id="orgEmail" class="form-input" placeholder="email@example.com">
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
        
        console.log('Form submitted:', data);
        
        // Here you would typically send data to backend
        // For now, just show success message and close modal
        alert('Данные успешно сохранены! (демо режим)');
        this.closeModal();
        
        // Reload current page to show updated data
        this.renderContent(this.currentPage);
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
