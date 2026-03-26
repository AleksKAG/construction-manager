// Construction AI - Frontend Application

class ConstructionApp {
    constructor() {
        this.currentPage = 'dashboard';
        this.initializeMockData();
        this.init();
    }

    initializeMockData() {
        this.data = {
            objects: [
                {
                    id: '1',
                    name: 'Жилой комплекс "Северный"',
                    address: 'г. Москва, ул. Ленина, 45',
                    type: 'новое строительство',
                    status: 'строительство',
                    start_date: '2024-01-15',
                    end_date: '2025-12-30',
                    client_id: '1',
                    client_name: 'ООО "СтройИнвест"',
                    characteristics: {
                        'Площадь': '15 000 м²',
                        'Этажность': '25 этажей',
                        'Тип фундамента': 'свайный',
                        'Материал стен': 'монолит'
                    },
                    cost_estimates: {
                        'Проектирование': 12500000,
                        'СМР': 450000000,
                        'Оборудование': 85000000
                    }
                },
                {
                    id: '2',
                    name: 'Торговый центр "Плаза"',
                    address: 'г. Москва, пр. Мира, 120',
                    type: 'реконструкция',
                    status: 'проектирование',
                    start_date: '2024-06-01',
                    end_date: '2025-06-30',
                    client_id: '2',
                    client_name: 'ЗАО "ТоргЦентр"',
                    characteristics: {
                        'Площадь': '8 500 м²',
                        'Этажность': '3 этажа',
                        'Парковка': '200 машиномест'
                    },
                    cost_estimates: {
                        'Проектирование': 5200000,
                        'СМР': 180000000
                    }
                },
                {
                    id: '3',
                    name: 'Школа №125',
                    address: 'г. Москва, ул. Гагарина, 78',
                    type: 'капитальный ремонт',
                    status: 'сдан',
                    start_date: '2023-03-01',
                    end_date: '2024-08-31',
                    client_id: '4',
                    client_name: 'Департамент образования',
                    characteristics: {
                        'Площадь': '4 200 м²',
                        'Вместимость': '550 учащихся',
                        'Спортивный зал': 'да'
                    },
                    cost_estimates: {
                        'Проектирование': 2100000,
                        'СМР': 95000000
                    }
                }
            ],
            organizations: [
                { id: '1', name: 'ООО "СтройИнвест"', type: 'заказчик', contact_person: 'Иванов П.С.', phone: '+7 (495) 123-45-67', email: 'info@stroyinvest.ru' },
                { id: '2', name: 'ЗАО "ТоргЦентр"', type: 'заказчик', contact_person: 'Петрова А.М.', phone: '+7 (495) 987-65-43', email: 'contact@torgcenter.ru' },
                { id: '3', name: 'ООО "СтройМонтаж"', type: 'генподрядчик', contact_person: 'Сидоров В.К.', phone: '+7 (495) 555-12-34', email: 'info@stroymontazh.ru' },
                { id: '4', name: 'Проектное бюро "Архитектор"', type: 'проектировщик', contact_person: 'Козлов Д.А.', phone: '+7 (495) 777-88-99', email: 'project@architect.ru' }
            ],
            specialists: [
                { id: '1', full_name: 'Смирнов Алексей Петрович', role: 'Главный инженер', organization_id: '3', organization: 'ООО "СтройМонтаж"', phone: '+7 (903) 111-22-33', email: 'smirnov@stroymontazh.ru' },
                { id: '2', full_name: 'Волкова Мария Ивановна', role: 'Архитектор', organization_id: '4', organization: 'Проектное бюро "Архитектор"', phone: '+7 (903) 444-55-66', email: 'volkova@architect.ru' },
                { id: '3', full_name: 'Николаев Сергей Владимирович', role: 'Прораб', organization_id: '3', organization: 'ООО "СтройМонтаж"', phone: '+7 (903) 777-88-99', email: 'nikolaev@stroymontazh.ru' }
            ],
            documents: [
                { id: '1', item_id: '1', code: 'АР-01', title: 'Архитектурные решения', stage: 'П', status: 'согласован', uploaded_at: '2024-01-20', version: 1 },
                { id: '2', item_id: '2', code: 'КР-05', title: 'Конструктивные решения', stage: 'Р', status: 'в работе', uploaded_at: '2024-02-15', version: 2 },
                { id: '3', item_id: '3', code: 'ОВ-03', title: 'Отопление и вентиляция', stage: 'П', status: 'на согласовании', uploaded_at: '2024-02-28', version: 1 }
            ],
            approvals: [
                { id: '1', document_id: '1', approver: 'Мосгосстройнадзор', approval_type: 'внешнее', status: 'ожидает', comment: '', approved_at: null },
                { id: '2', document_id: '2', approver: 'Внутреннее согласование', approval_type: 'внутреннее', status: 'одобрено', comment: 'Замечаний нет', approved_at: '2024-02-20' }
            ],
            schedule: [
                { id: '1', object_id: '1', work_type: 'Подготовительные работы', start_date: '2024-01-15', end_date: '2024-02-28', status: 'завершено', duration: 45 },
                { id: '2', object_id: '1', work_type: 'Нулевой цикл', start_date: '2024-03-01', end_date: '2024-05-31', status: 'в работе', duration: 92 },
                { id: '3', object_id: '1', work_type: 'Возведение каркаса', start_date: '2024-06-01', end_date: '2024-12-31', status: 'запланирован', duration: 214 }
            ],
            risks: [
                { id: '1', object_id: '1', description: 'Задержка поставки материалов', type: 'поставки', probability: 0.7, impact: 'высокий', mitigation_plan: 'Поиск альтернативных поставщиков', status: 'активен' },
                { id: '2', object_id: '1', description: 'Неблагоприятные погодные условия', type: 'погода', probability: 0.4, impact: 'средний', mitigation_plan: 'Корректировка графика', status: 'мониторинг' },
                { id: '3', object_id: '2', description: 'Изменения в проектной документации', type: 'согласования', probability: 0.5, impact: 'высокий', mitigation_plan: 'Раннее согласование всех изменений', status: 'активен' }
            ]
        };
    }

    init() {
        this.bindEvents();
        // Check hash first, default to dashboard
        const hash = window.location.hash.substring(1);
        const page = hash || 'dashboard';
        this.loadPage(page);
        
        // Listen for hash changes
        window.addEventListener('hashchange', () => {
            const newHash = window.location.hash.substring(1);
            if (newHash) {
                this.loadPage(newHash);
            }
        });
    }

    bindEvents() {
        // Navigation items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                window.location.hash = page;
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
        const objects = this.data.objects;
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
                            ${objects.map(obj => `
                                <tr>
                                    <td>${obj.name}</td>
                                    <td>${obj.address}</td>
                                    <td>${obj.type}</td>
                                    <td><span class="badge badge-${this.getStatusClass(obj.status)}">${obj.status}</span></td>
                                    <td>${this.formatDate(obj.start_date)}</td>
                                    <td>${this.formatDate(obj.end_date)}</td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm" onclick="app.viewObject('${obj.id}')">👁️</button>
                                        <button class="btn btn-secondary btn-sm" onclick="app.editObject('${obj.id}')">✏️</button>
                                        <button class="btn btn-secondary btn-sm" onclick="app.deleteObject('${obj.id}')">🗑️</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    getStatusClass(status) {
        const classes = {
            'строительство': 'success',
            'проектирование': 'warning',
            'сдан': 'info',
            'приостановлен': 'danger',
            'завершено': 'success',
            'в работе': 'warning',
            'запланирован': 'secondary'
        };
        return classes[status] || 'secondary';
    }

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('ru-RU');
    }

    viewObject(id) {
        const obj = this.data.objects.find(o => o.id === id);
        if (!obj) return;
        
        const characteristicsHtml = Object.entries(obj.characteristics || {}).map(([key, value]) => 
            `<div class="detail-row"><span class="detail-label">${key}:</span><span class="detail-value">${value}</span></div>`
        ).join('');
        
        const costEstimatesHtml = Object.entries(obj.cost_estimates || {}).map(([key, value]) => 
            `<div class="detail-row"><span class="detail-label">${key}:</span><span class="detail-value">${this.formatMoney(value)}</span></div>`
        ).join('');
        
        const modalBody = `
            <div class="object-details">
                <div class="detail-section">
                    <h3>Основная информация</h3>
                    <div class="detail-row"><span class="detail-label">Название:</span><span class="detail-value">${obj.name}</span></div>
                    <div class="detail-row"><span class="detail-label">Адрес:</span><span class="detail-value">${obj.address}</span></div>
                    <div class="detail-row"><span class="detail-label">Тип:</span><span class="detail-value">${obj.type}</span></div>
                    <div class="detail-row"><span class="detail-label">Статус:</span><span class="detail-value"><span class="badge badge-${this.getStatusClass(obj.status)}">${obj.status}</span></span></div>
                    <div class="detail-row"><span class="detail-label">Заказчик:</span><span class="detail-value">${obj.client_name || '-'}</span></div>
                    <div class="detail-row"><span class="detail-label">Начало работ:</span><span class="detail-value">${this.formatDate(obj.start_date)}</span></div>
                    <div class="detail-row"><span class="detail-label">Окончание работ:</span><span class="detail-value">${this.formatDate(obj.end_date)}</span></div>
                </div>
                
                <div class="detail-section">
                    <h3>Характеристики объекта</h3>
                    ${characteristicsHtml || '<p>Характеристики не указаны</p>'}
                </div>
                
                <div class="detail-section">
                    <h3>Оценки стоимости</h3>
                    ${costEstimatesHtml || '<p>Оценки не указаны</p>'}
                </div>
            </div>
        `;
        
        this.showModal('Объект: ' + obj.name, modalBody);
    }

    formatMoney(amount) {
        return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount);
    }

    editObject(id) {
        const obj = this.data.objects.find(o => o.id === id);
        if (!obj) return;
        
        const formHtml = this.getObjectForm(obj);
        const modalBody = `<form id="objectForm">${formHtml}</form>`;
        
        this.showModal('Редактировать объект', modalBody, () => {
            this.saveObject(id);
        });
    }

    deleteObject(id) {
        if (confirm('Вы уверены, что хотите удалить этот объект?')) {
            this.data.objects = this.data.objects.filter(o => o.id !== id);
            this.loadPage('objects');
        }
    }

    getObjectForm(data = {}) {
        return `
            <div class="form-group">
                <label for="objName">Название объекта *</label>
                <input type="text" id="objName" name="name" value="${data.name || ''}" required>
            </div>
            <div class="form-group">
                <label for="objAddress">Адрес</label>
                <input type="text" id="objAddress" name="address" value="${data.address || ''}">
            </div>
            <div class="form-group">
                <label for="objType">Тип объекта *</label>
                <select id="objType" name="type" required>
                    <option value="">Выберите тип</option>
                    <option value="новое строительство" ${data.type === 'новое строительство' ? 'selected' : ''}>Новое строительство</option>
                    <option value="реконструкция" ${data.type === 'реконструкция' ? 'selected' : ''}>Реконструкция</option>
                    <option value="капитальный ремонт" ${data.type === 'капитальный ремонт' ? 'selected' : ''}>Капитальный ремонт</option>
                </select>
            </div>
            <div class="form-group">
                <label for="objStatus">Статус *</label>
                <select id="objStatus" name="status" required>
                    <option value="">Выберите статус</option>
                    <option value="проектирование" ${data.status === 'проектирование' ? 'selected' : ''}>Проектирование</option>
                    <option value="строительство" ${data.status === 'строительство' ? 'selected' : ''}>Строительство</option>
                    <option value="сдан" ${data.status === 'сдан' ? 'selected' : ''}>Сдан</option>
                    <option value="приостановлен" ${data.status === 'приостановлен' ? 'selected' : ''}>Приостановлен</option>
                </select>
            </div>
            <div class="form-group">
                <label for="objClient">Заказчик</label>
                <select id="objClient" name="client_id">
                    <option value="">Выберите заказчика</option>
                    ${this.data.organizations.filter(o => o.type === 'заказчик').map(org => 
                        `<option value="${org.id}" ${data.client_id === org.id ? 'selected' : ''}>${org.name}</option>`
                    ).join('')}
                </select>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="objStartDate">Дата начала</label>
                    <input type="date" id="objStartDate" name="start_date" value="${data.start_date || ''}">
                </div>
                <div class="form-group">
                    <label for="objEndDate">Дата окончания</label>
                    <input type="date" id="objEndDate" name="end_date" value="${data.end_date || ''}">
                </div>
            </div>
            
            <div class="form-section">
                <h4>Характеристики объекта</h4>
                <div id="characteristicsContainer">
                    ${this.renderKeyValueFields(data.characteristics, 'characteristic')}
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.addKeyValueField('characteristicsContainer', 'characteristic')">+ Добавить характеристику</button>
            </div>
            
            <div class="form-section">
                <h4>Оценки стоимости</h4>
                <div id="costEstimatesContainer">
                    ${this.renderKeyValueFields(data.cost_estimates, 'cost', true)}
                </div>
                <button type="button" class="btn btn-secondary btn-sm" onclick="app.addKeyValueField('costEstimatesContainer', 'cost', true)">+ Добавить оценку</button>
            </div>
        `;
    }

    renderKeyValueFields(data = {}, prefix, isNumber = false) {
        const entries = Object.entries(data);
        if (entries.length === 0) {
            return this.getKeyValueFieldHTML('', '', prefix, isNumber);
        }
        return entries.map(([key, value]) => this.getKeyValueFieldHTML(key, value, prefix, isNumber)).join('');
    }

    getKeyValueFieldHTML(key, value, prefix, isNumber) {
        const inputType = isNumber ? 'number' : 'text';
        return `
            <div class="key-value-row">
                <input type="text" name="${prefix}_key[]" placeholder="Наименование" value="${key}" class="kv-key">
                <input type="${inputType}" name="${prefix}_value[]" placeholder="Значение" value="${value}" class="kv-value">
                <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">🗑️</button>
            </div>
        `;
    }

    addKeyValueField(containerId, prefix, isNumber = false) {
        const container = document.getElementById(containerId);
        const row = document.createElement('div');
        row.className = 'key-value-row';
        row.innerHTML = this.getKeyValueFieldHTML('', '', prefix, isNumber);
        container.appendChild(row);
    }

    saveObject(id = null) {
        const form = document.getElementById('objectForm');
        if (!form) return;
        
        const formData = new FormData(form);
        const characteristics = {};
        const costEstimates = {};
        
        const charKeys = formData.getAll('characteristic_key[]');
        const charValues = formData.getAll('characteristic_value[]');
        charKeys.forEach((key, index) => {
            if (key.trim()) {
                characteristics[key.trim()] = charValues[index];
            }
        });
        
        const costKeys = formData.getAll('cost_key[]');
        const costValues = formData.getAll('cost_value[]');
        costKeys.forEach((key, index) => {
            if (key.trim() && costValues[index]) {
                costEstimates[key.trim()] = parseFloat(costValues[index]);
            }
        });
        
        const clientSelect = document.getElementById('objClient');
        const clientName = clientSelect.options[clientSelect.selectedIndex]?.text || '';
        
        const objectData = {
            name: formData.get('name'),
            address: formData.get('address'),
            type: formData.get('type'),
            status: formData.get('status'),
            start_date: formData.get('start_date'),
            end_date: formData.get('end_date'),
            client_id: formData.get('client_id'),
            client_name: clientName,
            characteristics,
            cost_estimates: costEstimates
        };
        
        if (id) {
            const index = this.data.objects.findIndex(o => o.id === id);
            if (index !== -1) {
                this.data.objects[index] = { ...this.data.objects[index], ...objectData };
            }
        } else {
            objectData.id = Date.now().toString();
            this.data.objects.push(objectData);
        }
        
        this.closeModal();
        this.loadPage('objects');
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
                formHtml = `<form id="addObjectForm">${this.getObjectForm()}</form>`;
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
        
        // Bind form submit for objects
        if (this.currentPage === 'objects') {
            const form = modalBody.querySelector('form');
            if (form) {
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    this.saveObject();
                });
            }
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

    showModal(title, bodyHtml, onSaveCallback = null) {
        const modal = document.getElementById('addModal');
        const modalTitle = document.getElementById('modalTitle');
        const modalBody = document.getElementById('modalBody');
        
        modalTitle.textContent = title;
        modalBody.innerHTML = bodyHtml;
        modal.classList.add('active');
        
        // Store callback for potential save button
        if (onSaveCallback) {
            this.modalSaveCallback = onSaveCallback;
        } else {
            this.modalSaveCallback = null;
        }
    }
}

// Initialize app when DOM is loaded
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new ConstructionApp();
});
