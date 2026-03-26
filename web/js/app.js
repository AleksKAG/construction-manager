// Construction AI - Frontend Application

// State
const state = {
    currentPage: 'dashboard',
    objects: [],
    organizations: [],
    specialists: [],
    documents: [],
    risks: [],
    approvals: []
};

// API Base URL (adjust based on your backend)
const API_BASE = '/api';

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializeForms();
    loadDashboardData();
});

// Navigation
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            navigateTo(page);
        });
    });
    
    // Add object button
    const addObjBtn = document.getElementById('add-object-btn');
    if (addObjBtn) {
        addObjBtn.addEventListener('click', () => navigateTo('add-object'));
    }
}

function navigateTo(page) {
    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) {
            item.classList.add('active');
        }
    });
    
    // Hide all pages
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
    });
    
    // Show target page
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) {
        targetPage.classList.add('active');
    }
    
    // Update page title
    const titles = {
        'dashboard': 'Дашборд',
        'objects': 'Объекты строительства',
        'add-object': 'Добавить объект',
        'organizations': 'Организации',
        'add-organization': 'Добавить организацию',
        'specialists': 'Специалисты',
        'documents': 'Документация',
        'approvals': 'Согласования',
        'schedule': 'График работ',
        'risks': 'Реестр рисков'
    };
    
    const titleEl = document.getElementById('page-title');
    if (titleEl && titles[page]) {
        titleEl.textContent = titles[page];
    }
    
    state.currentPage = page;
    
    // Load data for specific pages
    switch(page) {
        case 'objects':
            loadObjects();
            break;
        case 'organizations':
            loadOrganizations();
            break;
        case 'specialists':
            loadSpecialists();
            break;
        case 'documents':
            loadDocuments();
            break;
        case 'risks':
            loadRisks();
            break;
        case 'approvals':
            loadApprovals();
            break;
        case 'add-object':
            loadOrganizationsForSelect();
            break;
        case 'add-organization':
            // Nothing to load
            break;
    }
}

// Forms
function initializeForms() {
    // Add Object Form
    const addObjectForm = document.getElementById('add-object-form');
    if (addObjectForm) {
        addObjectForm.addEventListener('submit', handleAddObject);
    }
    
    // Add Organization Form
    const addOrgForm = document.getElementById('add-organization-form');
    if (addOrgForm) {
        addOrgForm.addEventListener('submit', handleAddOrganization);
    }
}

async function handleAddObject(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        address: formData.get('address'),
        type: formData.get('type'),
        status: formData.get('status'),
        start_date: formData.get('start_date'),
        end_date: formData.get('end_date'),
        client_id: formData.get('client_id') || null,
        characteristics: parseJSON(formData.get('characteristics')),
        cost_estimates: {}
    };
    
    try {
        const response = await fetch(`${API_BASE}/objects`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showNotification('Объект успешно создан!', 'success');
            e.target.reset();
            navigateTo('objects');
            loadDashboardData();
        } else {
            const error = await response.json();
            showNotification(error.message || 'Ошибка при создании объекта', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    }
}

async function handleAddOrganization(e) {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const data = {
        name: formData.get('name'),
        type: formData.get('type'),
        contact_person: formData.get('contact_person'),
        phone: formData.get('phone'),
        email: formData.get('email')
    };
    
    try {
        const response = await fetch(`${API_BASE}/organizations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            showNotification('Организация успешно создана!', 'success');
            e.target.reset();
            navigateTo('organizations');
        } else {
            const error = await response.json();
            showNotification(error.message || 'Ошибка при создании организации', 'error');
        }
    } catch (error) {
        console.error('Error:', error);
        showNotification('Ошибка соединения с сервером', 'error');
    }
}

// Data Loading Functions
async function loadDashboardData() {
    try {
        // In a real app, these would be API calls
        // For demo, we'll use mock data
        
        // Load stats
        document.getElementById('total-objects').textContent = state.objects.length || 5;
        document.getElementById('active-projects').textContent = state.objects.filter(o => o.status === 'строительство').length || 3;
        document.getElementById('pending-approvals').textContent = state.approvals.filter(a => a.status === 'ожидает').length || 2;
        document.getElementById('high-risks').textContent = state.risks.filter(r => r.impact === 'высокий').length || 1;
        
        // Load chart
        loadObjectsChart();
        
        // Load recent events
        loadRecentEvents();
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadObjects() {
    try {
        const response = await fetch(`${API_BASE}/objects`);
        if (response.ok) {
            state.objects = await response.json();
        } else {
            // Use mock data for demo
            state.objects = getMockObjects();
        }
        renderObjectsTable();
    } catch (error) {
        console.error('Error loading objects:', error);
        state.objects = getMockObjects();
        renderObjectsTable();
    }
}

async function loadOrganizations() {
    try {
        const response = await fetch(`${API_BASE}/organizations`);
        if (response.ok) {
            state.organizations = await response.json();
        } else {
            state.organizations = getMockOrganizations();
        }
        renderOrganizationsTable();
    } catch (error) {
        console.error('Error loading organizations:', error);
        state.organizations = getMockOrganizations();
        renderOrganizationsTable();
    }
}

async function loadOrganizationsForSelect() {
    const select = document.getElementById('object-client');
    if (!select) return;
    
    // Clear existing options except first
    select.innerHTML = '<option value="">Выберите заказчика</option>';
    
    state.organizations
        .filter(org => org.type === 'заказчик')
        .forEach(org => {
            const option = document.createElement('option');
            option.value = org.id;
            option.textContent = org.name;
            select.appendChild(option);
        });
}

async function loadSpecialists() {
    try {
        const response = await fetch(`${API_BASE}/specialists`);
        if (response.ok) {
            state.specialists = await response.json();
        } else {
            state.specialists = getMockSpecialists();
        }
        renderSpecialistsTable();
    } catch (error) {
        console.error('Error loading specialists:', error);
        state.specialists = getMockSpecialists();
        renderSpecialistsTable();
    }
}

async function loadDocuments() {
    try {
        const response = await fetch(`${API_BASE}/documents`);
        if (response.ok) {
            state.documents = await response.json();
        } else {
            state.documents = getMockDocuments();
        }
        renderDocumentsTable();
    } catch (error) {
        console.error('Error loading documents:', error);
        state.documents = getMockDocuments();
        renderDocumentsTable();
    }
}

async function loadRisks() {
    try {
        const response = await fetch(`${API_BASE}/risks`);
        if (response.ok) {
            state.risks = await response.json();
        } else {
            state.risks = getMockRisks();
        }
        renderRisksTable();
    } catch (error) {
        console.error('Error loading risks:', error);
        state.risks = getMockRisks();
        renderRisksTable();
    }
}

async function loadApprovals() {
    try {
        const response = await fetch(`${API_BASE}/approvals`);
        if (response.ok) {
            state.approvals = await response.json();
        } else {
            state.approvals = getMockApprovals();
        }
        renderApprovalsTable();
    } catch (error) {
        console.error('Error loading approvals:', error);
        state.approvals = getMockApprovals();
        renderApprovalsTable();
    }
}

// Render Functions
function renderObjectsTable() {
    const tbody = document.getElementById('objects-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = state.objects.map(obj => `
        <tr>
            <td><strong>${obj.name}</strong></td>
            <td>${obj.address || '-'}</td>
            <td>${formatType(obj.type)}</td>
            <td>${renderStatusBadge(obj.status)}</td>
            <td>${obj.client_name || '-'}</td>
            <td>${formatDates(obj.start_date, obj.end_date)}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="viewObject('${obj.id}')">
                    <i class="fas fa-eye"></i>
                </button>
                <button class="btn btn-sm btn-primary" onclick="editObject('${obj.id}')">
                    <i class="fas fa-edit"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderOrganizationsTable() {
    const tbody = document.getElementById('organizations-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = state.organizations.map(org => `
        <tr>
            <td><strong>${org.name}</strong></td>
            <td>${formatOrgType(org.type)}</td>
            <td>${org.contact_person || '-'}</td>
            <td>${org.phone || '-'}</td>
            <td>${org.email || '-'}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="viewOrganization('${org.id}')">
                    <i class="fas fa-eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderSpecialistsTable() {
    const tbody = document.getElementById('specialists-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = state.specialists.map(spec => `
        <tr>
            <td><strong>${spec.full_name}</strong></td>
            <td>${spec.role}</td>
            <td>${spec.organization_name || '-'}</td>
            <td>${spec.phone || '-'}</td>
            <td>${spec.email || '-'}</td>
        </tr>
    `).join('');
}

function renderDocumentsTable() {
    const tbody = document.getElementById('documents-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = state.documents.map(doc => `
        <tr>
            <td><strong>${doc.code}</strong></td>
            <td>${doc.title}</td>
            <td>${doc.stage}</td>
            <td>v${doc.version}</td>
            <td>${renderStatusBadge(doc.status)}</td>
            <td>${formatDate(doc.uploaded_at)}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="downloadDocument('${doc.id}')">
                    <i class="fas fa-download"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderRisksTable() {
    const tbody = document.getElementById('risks-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = state.risks.map(risk => `
        <tr>
            <td>${risk.description}</td>
            <td>${formatRiskType(risk.type)}</td>
            <td>${(risk.probability * 100).toFixed(0)}%</td>
            <td>${renderImpactBadge(risk.impact)}</td>
            <td>${risk.mitigation_plan || '-'}</td>
            <td>${formatDate(risk.detected_at)}</td>
        </tr>
    `).join('');
}

function renderApprovalsTable() {
    const tbody = document.getElementById('approvals-tbody');
    if (!tbody) return;
    
    tbody.innerHTML = state.approvals.map(approval => `
        <tr>
            <td>Документ #${approval.document_id?.substring(0, 8)}</td>
            <td>${approval.approval_type}</td>
            <td>${approval.approver_name || '-'}</td>
            <td>${renderApprovalStatus(approval.status)}</td>
            <td>${approval.comment || '-'}</td>
            <td>${formatDate(approval.approved_at || approval.created_at)}</td>
        </tr>
    `).join('');
}

// Chart
function loadObjectsChart() {
    const ctx = document.getElementById('objects-chart');
    if (!ctx) return;
    
    // Destroy existing chart
    const existingChart = Chart.getChart(ctx);
    if (existingChart) {
        existingChart.destroy();
    }
    
    const statusCounts = {
        'проектирование': 0,
        'строительство': 0,
        'сдан': 0,
        'приостановлен': 0
    };
    
    state.objects.forEach(obj => {
        if (statusCounts[obj.status] !== undefined) {
            statusCounts[obj.status]++;
        }
    });
    
    // If no real data, use mock
    if (state.objects.length === 0) {
        statusCounts['проектирование'] = 2;
        statusCounts['строительство'] = 3;
        statusCounts['сдан'] = 1;
        statusCounts['приостановлен'] = 0;
    }
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Проектирование', 'Строительство', 'Сдан', 'Приостановлен'],
            datasets: [{
                data: Object.values(statusCounts),
                backgroundColor: [
                    'rgba(59, 130, 246, 0.8)',
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(100, 116, 139, 0.8)',
                    'rgba(245, 158, 11, 0.8)'
                ],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function loadRecentEvents() {
    const container = document.getElementById('recent-events');
    if (!container) return;
    
    const events = [
        { title: 'Документ "АР" загружен на согласование', time: '2 часа назад' },
        { title: 'Объект "ЖК Северный" перешел в стадию строительства', time: '5 часов назад' },
        { title: 'Риск "Задержка поставок" обнаружен для объекта "ТЦ Плаза"', time: '1 день назад' },
        { title: 'Согласование от МЧС получено', time: '2 дня назад' }
    ];
    
    container.innerHTML = events.map(event => `
        <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div class="timeline-content">
                <div class="timeline-title">${event.title}</div>
                <div class="timeline-time">${event.time}</div>
            </div>
        </div>
    `).join('');
}

// Modal Functions
function viewObject(id) {
    const obj = state.objects.find(o => o.id === id);
    if (!obj) return;
    
    document.getElementById('modal-title').textContent = obj.name;
    document.getElementById('modal-body').innerHTML = `
        <div class="form-grid">
            <div class="form-group">
                <label>Адрес</label>
                <p>${obj.address || 'Не указан'}</p>
            </div>
            <div class="form-group">
                <label>Тип</label>
                <p>${formatType(obj.type)}</p>
            </div>
            <div class="form-group">
                <label>Статус</label>
                <p>${renderStatusBadge(obj.status)}</p>
            </div>
            <div class="form-group">
                <label>Заказчик</label>
                <p>${obj.client_name || 'Не указан'}</p>
            </div>
        </div>
    `;
    
    document.getElementById('modal').classList.add('active');
}

function closeModal() {
    document.getElementById('modal').classList.remove('active');
}

// Close modal on outside click
window.onclick = function(event) {
    const modal = document.getElementById('modal');
    if (event.target === modal) {
        closeModal();
    }
}

// Utility Functions
function parseJSON(str) {
    if (!str) return {};
    try {
        return JSON.parse(str);
    } catch (e) {
        return {};
    }
}

function formatType(type) {
    const types = {
        'новое строительство': 'Новое строительство',
        'реконструкция': 'Реконструкция',
        'капитальный ремонт': 'Капитальный ремонт'
    };
    return types[type] || type;
}

function formatOrgType(type) {
    const types = {
        'заказчик': 'Заказчик',
        'генподрядчик': 'Генподрядчик',
        'проектировщик': 'Проектировщик',
        'экспертиза': 'Экспертиза',
        'поставщик': 'Поставщик'
    };
    return types[type] || type;
}

function formatRiskType(type) {
    const types = {
        'погода': 'Погода',
        'поставки': 'Поставки',
        'согласования': 'Согласования',
        'персонал': 'Персонал',
        'финансы': 'Финансы'
    };
    return types[type] || type;
}

function formatDates(start, end) {
    const s = start ? new Date(start).toLocaleDateString('ru-RU') : '-';
    const e = end ? new Date(end).toLocaleDateString('ru-RU') : '-';
    return `${s} — ${e}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('ru-RU');
}

function renderStatusBadge(status) {
    const badges = {
        'проектирование': '<span class="badge badge-info">Проектирование</span>',
        'строительство': '<span class="badge badge-success">Строительство</span>',
        'сдан': '<span class="badge badge-secondary">Сдан</span>',
        'приостановлен': '<span class="badge badge-warning">Приостановлен</span>',
        'черновик': '<span class="badge badge-secondary">Черновик</span>',
        'на согласовании': '<span class="badge badge-warning">На согласовании</span>',
        'согласован': '<span class="badge badge-success">Согласован</span>',
        'отклонён': '<span class="badge badge-danger">Отклонён</span>'
    };
    return badges[status] || `<span class="badge badge-secondary">${status}</span>`;
}

function renderApprovalStatus(status) {
    const badges = {
        'ожидает': '<span class="badge badge-warning">Ожидает</span>',
        'одобрено': '<span class="badge badge-success">Одобрено</span>',
        'отклонено': '<span class="badge badge-danger">Отклонено</span>'
    };
    return badges[status] || `<span class="badge badge-secondary">${status}</span>`;
}

function renderImpactBadge(impact) {
    const badges = {
        'низкий': '<span class="badge badge-info">Низкий</span>',
        'средний': '<span class="badge badge-warning">Средний</span>',
        'высокий': '<span class="badge badge-danger">Высокий</span>'
    };
    return badges[impact] || `<span class="badge badge-secondary">${impact}</span>`;
}

function showNotification(message, type = 'info') {
    // Simple notification (can be enhanced with a proper notification library)
    alert(`${type === 'error' ? '❌' : '✅'} ${message}`);
}

// Mock Data (for demo purposes)
function getMockObjects() {
    return [
        { id: '1', name: 'ЖК "Северный"', address: 'ул. Ленина, 45', type: 'новое строительство', status: 'строительство', start_date: '2025-01-15', end_date: '2026-12-30', client_name: 'ООО "Застройщик"' },
        { id: '2', name: 'ТЦ "Плаза"', address: 'пр. Мира, 120', type: 'реконструкция', status: 'проектирование', start_date: '2025-06-01', end_date: '2026-06-01', client_name: 'АО "Торговый дом"' },
        { id: '3', name: 'Школа №15', address: 'ул. Школьная, 8', type: 'капитальный ремонт', status: 'сдан', start_date: '2024-03-01', end_date: '2024-08-31', client_name: 'Минобрнауки' },
        { id: '4', name: 'БЦ "Олимп"', address: 'ул. Деловая, 22', type: 'новое строительство', status: 'проектирование', start_date: '2025-09-01', end_date: '2027-09-01', client_name: 'ООО "Инвест"' },
        { id: '5', name: 'Стадион "Арена"', address: 'ул. Спортивная, 1', type: 'новое строительство', status: 'строительство', start_date: '2024-05-01', end_date: '2026-05-01', client_name: 'Минспорт' }
    ];
}

function getMockOrganizations() {
    return [
        { id: '1', name: 'ООО "Застройщик"', type: 'заказчик', contact_person: 'Иванов И.И.', phone: '+7 (495) 123-45-67', email: 'info@zastroyschik.ru' },
        { id: '2', name: 'АО "СтройМонтаж"', type: 'генподрядчик', contact_person: 'Петров П.П.', phone: '+7 (495) 234-56-78', email: 'info@stroymontazh.ru' },
        { id: '3', name: 'ООО "ПроектБюро"', type: 'проектировщик', contact_person: 'Сидоров С.С.', phone: '+7 (495) 345-67-89', email: 'info@projectburo.ru' },
        { id: '4', name: 'ФБУ "Главгосэкспертиза"', type: 'экспертиза', contact_person: 'Кузнецов К.К.', phone: '+7 (495) 456-78-90', email: 'info@gge.ru' },
        { id: '5', name: 'ООО "СтройМатериалы"', type: 'поставщик', contact_person: 'Смирнов С.С.', phone: '+7 (495) 567-89-01', email: 'sales@stroy materials.ru' }
    ];
}

function getMockSpecialists() {
    return [
        { id: '1', full_name: 'Алексеев Алексей Алексеевич', role: 'Главный инженер', organization_name: 'АО "СтройМонтаж"', phone: '+7 (999) 111-22-33', email: 'alexeev@stroymontazh.ru' },
        { id: '2', full_name: 'Борисова Анна Борисовна', role: 'Архитектор', organization_name: 'ООО "ПроектБюро"', phone: '+7 (999) 222-33-44', email: 'borisova@projectburo.ru' },
        { id: '3', full_name: 'Васильев Василий Васильевич', role: 'Прораб', organization_name: 'АО "СтройМонтаж"', phone: '+7 (999) 333-44-55', email: 'vasiliev@stroymontazh.ru' },
        { id: '4', full_name: 'Григорьев Григорий Григорьевич', role: 'Инженер ПТО', organization_name: 'АО "СтройМонтаж"', phone: '+7 (999) 444-55-66', email: 'grigoriev@stroymontazh.ru' }
    ];
}

function getMockDocuments() {
    return [
        { id: '1', code: 'АР', title: 'Архитектурные решения', stage: 'П', version: 2, status: 'согласован', uploaded_at: '2025-03-15' },
        { id: '2', code: 'КР', title: 'Конструктивные решения', stage: 'П', version: 1, status: 'на согласовании', uploaded_at: '2025-03-20' },
        { id: '3', code: 'ОВ', title: 'Отопление и вентиляция', stage: 'Р', version: 3, status: 'согласован', uploaded_at: '2025-02-10' },
        { id: '4', code: 'ЭО', title: 'Электрооборудование', stage: 'Р', version: 1, status: 'черновик', uploaded_at: '2025-03-25' }
    ];
}

function getMockRisks() {
    return [
        { id: '1', description: 'Задержка поставки металлоконструкций', type: 'поставки', probability: 0.7, impact: 'высокий', mitigation_plan: 'Поиск альтернативных поставщиков', detected_at: '2025-03-20' },
        { id: '2', description: 'Неблагоприятные погодные условия', type: 'погода', probability: 0.4, impact: 'средний', mitigation_plan: 'Корректировка графика работ', detected_at: '2025-03-18' },
        { id: '3', description: 'Задержка согласования в экспертизе', type: 'согласования', probability: 0.5, impact: 'высокий', mitigation_plan: 'Заблаговременная подача документов', detected_at: '2025-03-15' }
    ];
}

function getMockApprovals() {
    return [
        { id: '1', document_id: '1', approval_type: 'внутреннее', approver_name: 'Иванов И.И.', status: 'одобрено', comment: 'Замечаний нет', approved_at: '2025-03-16', created_at: '2025-03-15' },
        { id: '2', document_id: '2', approval_type: 'Мосгосстройнадзор', approver_name: '-', status: 'ожидает', comment: '-', approved_at: null, created_at: '2025-03-21' },
        { id: '3', document_id: '3', approval_type: 'МЧС', approver_name: 'Петров П.П.', status: 'одобрено', comment: 'Требования выполнены', approved_at: '2025-02-15', created_at: '2025-02-11' }
    ];
}

// Export functions for global access
window.navigateTo = navigateTo;
window.closeModal = closeModal;
window.viewObject = viewObject;
window.editObject = (id) => console.log('Edit object:', id);
window.viewOrganization = (id) => console.log('View organization:', id);
window.downloadDocument = (id) => console.log('Download document:', id);
