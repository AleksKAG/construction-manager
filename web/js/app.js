class ConstructionManagerUI {
  constructor() {
    this.currentView = 'home';
    this.objects = [];
    this.tasksByObject = {};
    this.selectedObjectId = null;
    this.modalMode = null;
    this.currentTemplateCode = null;

    this.projectMenuTemplate = [
      { title: 'Проектирование', children: ['График Проектирования', 'Документация: ИРД, Изыскания, Стадия П, Экспертиза, Стадия Р'] },
      { title: 'Сметная документация', children: ['Согласованная в экспертизе', 'Корректировка смет: СВОР, КАЦ, Сметы изм'] },
      { title: 'СМР', children: ['График СМР', 'Документация СМР', 'Авторский/Технический надзор'] }
    ];

    this.bind();
    this.bootstrap();
  }

  async bootstrap() {
    await this.loadObjects();
    this.renderProjectTree();
    this.renderContent();
  }

  bind() {
    document.querySelectorAll('.menu-item[data-view]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.menu-item[data-view]').forEach(i => i.classList.remove('active'));
        btn.classList.add('active');
        this.currentView = btn.dataset.view;
        document.getElementById('pageTitle').textContent = btn.textContent;
        this.renderContent();
      });
    });

    document.getElementById('toggleSidebar').addEventListener('click', () => document.getElementById('sidebar').classList.toggle('open'));
    document.getElementById('primaryBtn').addEventListener('click', () => this.handlePrimaryAction());
    document.getElementById('secondaryBtn').addEventListener('click', () => this.handleSecondaryAction());
    document.getElementById('menuEditor').addEventListener('click', () => alert('Следующий этап: настройка меню по роли пользователя.'));
    document.querySelectorAll('[data-close="true"]').forEach(el => el.addEventListener('click', () => this.closeModal()));
    document.getElementById('saveEntity').addEventListener('click', () => this.handleSaveModal());
  }

  async api(path, method = 'GET', body = null) {
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`/api/v1${path}`, options);
    if (!res.ok) {
      let message = `Ошибка ${res.status}`;
      try { const payload = await res.json(); message = payload.error || message; } catch (_) {}
      throw new Error(message);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  async loadObjects() {
    try {
      this.objects = await this.api('/objects');
      if (!this.selectedObjectId && this.objects.length) this.selectedObjectId = this.objects[0].id;
    } catch (error) { this.showError(`Не удалось загрузить объекты: ${error.message}`); }
  }

  async loadTasksForObject(objectId) {
    if (!objectId) return [];
    try {
      const tasks = await this.api(`/objects/${objectId}/tasks`);
      this.tasksByObject[objectId] = tasks;
      return tasks;
    } catch (error) {
      this.showError(`Не удалось загрузить график: ${error.message}`);
      return [];
    }
  }

  async loadTemplate(code) {
    return this.api(`/templates/${code}`);
  }

  async loadTemplateRows(projectId, code) {
    return this.api(`/objects/${projectId}/templates/${code}/rows`);
  }

  renderProjectTree() {
    const tree = document.getElementById('projectTree');
    const rows = [];
    this.objects.forEach(project => {
      const activeClass = this.selectedObjectId === project.id ? ' style="background:#22385f"' : '';
      rows.push(`<div class="tree-row" data-select-project="${project.id}"${activeClass}>${project.name}</div>`);
      this.projectMenuTemplate.forEach(section => {
        rows.push(`<div class="tree-row level-1">/ ${section.title}</div>`);
        section.children.forEach(item => rows.push(`<div class="tree-row level-2">// ${item}</div>`));
      });
    });
    tree.innerHTML = rows.join('');
    tree.querySelectorAll('[data-select-project]').forEach(node => node.addEventListener('click', () => {
      this.selectedObjectId = node.dataset.selectProject;
      this.renderProjectTree();
      this.renderContent();
    }));
  }

  configureHeader() {
    const primaryBtn = document.getElementById('primaryBtn');
    const secondaryBtn = document.getElementById('secondaryBtn');
    const subtitle = document.getElementById('pageSubtitle');
    secondaryBtn.style.display = 'none';

    if (this.currentView === 'projects') {
      primaryBtn.textContent = '+ Добавить проект';
      secondaryBtn.style.display = 'inline-block';
      secondaryBtn.textContent = 'Обновить список';
      subtitle.textContent = 'CRUD по объектам';
    } else if (this.currentView === 'designSchedule') {
      primaryBtn.textContent = '+ Добавить этап графика';
      secondaryBtn.style.display = 'inline-block';
      secondaryBtn.textContent = 'Шаблон графика ПД';
      subtitle.textContent = 'Шаблон + живые задачи';
    } else if (this.currentView === 'tep') {
      primaryBtn.textContent = '+ Добавить строку ТЭП';
      secondaryBtn.style.display = 'inline-block';
      secondaryBtn.textContent = 'Шаблон ТЭП';
      subtitle.textContent = 'Таблица по стандартным колонкам';
    } else {
      primaryBtn.textContent = '+ Добавить проект';
      subtitle.textContent = 'Онлайн-данные из API / SQLite';
    }
  }

  async renderContent() {
    this.configureHeader();
    if (this.currentView === 'projects') return this.renderProjects();
    if (this.currentView === 'designSchedule') return this.renderDesignSchedule();
    if (this.currentView === 'tep') return this.renderTemplateTable('tep', 'Технико-экономические показатели');
    if (this.currentView === 'design') return this.renderDesignOverview();
    if (this.currentView === 'auth') return this.renderAuthModel();
    if (this.currentView === 'tasks') return this.renderSimple('Мои задачи — далее добавим персональный трекинг по пользователю.');
    if (this.currentView === 'account') return this.renderSimple('Аккаунт — далее добавим профиль и аудит действий.');
    return this.renderHome();
  }

  renderSimple(text) {
    document.getElementById('contentArea').innerHTML = `<article class="card col-12">${text}</article>`;
  }

  renderHome() {
    const totalBudget = this.objects.reduce((sum, item) => sum + (item.budget || 0), 0);
    document.getElementById('contentArea').innerHTML = `
      <article class="card col-4"><h3>Проекты</h3><div class="metric">${this.objects.length}</div></article>
      <article class="card col-4"><h3>Суммарный бюджет</h3><div class="metric">${this.formatMoney(totalBudget)}</div></article>
      <article class="card col-4"><h3>Выбранный проект</h3><div class="metric">${this.currentObject()?.name || 'Не выбран'}</div></article>
      <article class="card col-12 notice">Добавлены стандартные шаблоны БД: ИДП, график ПД, ТЭП, сводный расчет и график СМР. При создании записи форма строится по обязательным колонкам шаблона.</article>`;
  }

  async renderProjects() {
    const area = document.getElementById('contentArea');
    const rows = this.objects.map(obj => `<tr>
      <td>${obj.name}</td><td>${obj.address || '—'}</td><td>${obj.status || '—'}</td><td>${obj.duration_days || 0}</td><td>${this.formatMoney(obj.budget || 0)}</td>
      <td><div class="row-actions"><button class="mini" data-edit-object="${obj.id}">Ред.</button><button class="mini danger" data-delete-object="${obj.id}">Удал.</button></div></td></tr>`).join('');
    area.innerHTML = `<article class="card col-12"><h3>Объекты</h3><table class="table"><thead><tr><th>Наименование</th><th>Адрес</th><th>Статус</th><th>Дней</th><th>Бюджет</th><th>Действия</th></tr></thead><tbody>${rows}</tbody></table></article>`;
    area.querySelectorAll('[data-edit-object]').forEach(b => b.addEventListener('click', () => this.openObjectModal(b.dataset.editObject)));
    area.querySelectorAll('[data-delete-object]').forEach(b => b.addEventListener('click', () => this.deleteObject(b.dataset.deleteObject)));
  }

  async renderDesignOverview() {
    const current = this.currentObject();
    if (!current) return this.renderSimple('Выберите проект.');
    const tasks = await this.loadTasksForObject(current.id);
    const progress = tasks.length ? Math.round(tasks.reduce((sum, t) => sum + (t.progress || 0), 0) / tasks.length) : 0;
    document.getElementById('contentArea').innerHTML = `<article class="card col-8"><h3>${current.name}</h3><div class="metric">Адрес: ${current.address || '—'}</div><div class="kpi"><span>Прогресс проектирования</span><span>${progress}%</span></div><div class="progress"><span style="width:${progress}%"></span></div></article><article class="card col-4"><h3>Характеристики</h3>${this.renderMapAsKPI(current.characteristics)}</article>`;
  }

  async renderDesignSchedule() {
    const current = this.currentObject();
    if (!current) return this.renderSimple('Выберите проект для графика проектирования.');
    const tasks = await this.loadTasksForObject(current.id);
    const rows = tasks.map(task => `<tr><td>${task.name}</td><td>${task.start_date || '—'}</td><td>${task.end_date || '—'}</td><td>${task.duration || 0}</td><td>${task.progress || 0}%</td><td>${task.status || '—'}</td><td><div class="row-actions"><button class="mini" data-edit-task="${task.id}">Ред.</button><button class="mini danger" data-delete-task="${task.id}">Удал.</button></div></td></tr>`).join('');
    document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>График проектирования — ${current.name}</h3><table class="table"><thead><tr><th>Этап</th><th>Начало</th><th>Окончание</th><th>Дней</th><th>%</th><th>Статус</th><th>Действия</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Пусто</td></tr>'}</tbody></table></article>`;
    document.querySelectorAll('[data-edit-task]').forEach(b => b.addEventListener('click', () => this.openTaskModal(b.dataset.editTask)));
    document.querySelectorAll('[data-delete-task]').forEach(b => b.addEventListener('click', () => this.deleteTask(b.dataset.deleteTask)));
  }

  async renderTemplateTable(code, title) {
    const current = this.currentObject();
    if (!current) return this.renderSimple('Выберите проект.');

    try {
      const [tplPayload, rows] = await Promise.all([this.loadTemplate(code), this.loadTemplateRows(current.id, code)]);
      const columns = tplPayload.columns || [];
      const head = columns.map(c => `<th>${c.title}</th>`).join('');
      const body = rows.map(row => {
        const cols = columns.map(c => `<td>${(row.data || {})[c.field_key] || '—'}</td>`).join('');
        return `<tr>${cols}<td><div class="row-actions"><button class="mini" data-edit-template-row="${row.id}" data-template-code="${code}">Ред.</button><button class="mini danger" data-delete-template-row="${row.id}" data-template-code="${code}">Удал.</button></div></td></tr>`;
      }).join('');

      this.currentTemplateCode = code;
      document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>${title} — ${current.name}</h3><table class="table"><thead><tr>${head}<th>Действия</th></tr></thead><tbody>${body || `<tr><td colspan="${columns.length + 1}">Нет строк</td></tr>`}</tbody></table></article>`;

      document.querySelectorAll('[data-edit-template-row]').forEach(b => b.addEventListener('click', () => this.openTemplateRowModal(b.dataset.templateCode, b.dataset.editTemplateRow)));
      document.querySelectorAll('[data-delete-template-row]').forEach(b => b.addEventListener('click', () => this.deleteTemplateRow(b.dataset.templateCode, b.dataset.deleteTemplateRow)));
    } catch (e) {
      this.showError(`Ошибка шаблона: ${e.message}`);
    }
  }

  renderAuthModel() {
    document.getElementById('contentArea').innerHTML = `<article class="card col-12"><h3>RBAC + шаблоны</h3><table class="table"><thead><tr><th>Компонент</th><th>Статус</th></tr></thead><tbody><tr><td>RBAC модели</td><td>Созданы</td></tr><tr><td>Стандартные шаблоны колонок</td><td>Созданы и доступны по API</td></tr><tr><td>Project template rows</td><td>CRUD через API</td></tr></tbody></table></article>`;
  }

  handlePrimaryAction() {
    if (this.currentView === 'designSchedule') return this.openTaskModal();
    if (this.currentView === 'tep') return this.openTemplateRowModal('tep');
    return this.openObjectModal();
  }

  async handleSecondaryAction() {
    if (this.currentView === 'projects') return this.refreshProjects();
    if (this.currentView === 'designSchedule') return this.openTemplateInfo('design_schedule');
    if (this.currentView === 'tep') return this.openTemplateInfo('tep');
  }

  async refreshProjects() {
    await this.loadObjects();
    this.renderProjectTree();
    this.renderContent();
  }

  currentObject() {
    return this.objects.find(item => item.id === this.selectedObjectId);
  }

  async openTemplateInfo(code) {
    try {
      const tpl = await this.loadTemplate(code);
      alert(`${tpl.template.name}\n\nКолонки:\n${tpl.columns.map(c => `- ${c.title}${c.required ? ' *' : ''}`).join('\n')}`);
    } catch (e) {
      this.showError(e.message);
    }
  }

  openObjectModal(objectId = null) {
    this.modalMode = objectId ? 'editObject' : 'createObject';
    const entity = objectId ? this.objects.find(item => item.id === objectId) : null;
    document.getElementById('modalTitle').textContent = objectId ? 'Редактировать проект' : 'Добавить проект';
    document.getElementById('modalBody').innerHTML = `<div class="form-grid"><input id="obj-name" placeholder="Наименование" value="${entity?.name || ''}"><input id="obj-address" placeholder="Адрес" value="${entity?.address || ''}"><input id="obj-budget" type="number" placeholder="Бюджет" value="${entity?.budget || 0}"><input id="obj-duration" type="number" placeholder="Длительность (дней)" value="${entity?.duration_days || 0}"><select id="obj-status">${['planning', 'active', 'completed'].map(status => `<option value="${status}" ${entity?.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div>`;
    document.getElementById('entityModal').dataset.entityId = objectId || '';
    this.openModal();
  }

  async deleteObject(id) {
    if (!confirm('Удалить объект?')) return;
    await this.api(`/objects/${id}`, 'DELETE');
    await this.refreshProjects();
  }

  openTaskModal(taskId = null) {
    if (!this.selectedObjectId) return this.showError('Сначала выберите проект');
    const task = taskId ? (this.tasksByObject[this.selectedObjectId] || []).find(t => t.id === taskId) : null;
    this.modalMode = taskId ? 'editTask' : 'createTask';
    document.getElementById('modalTitle').textContent = taskId ? 'Редактировать этап графика' : 'Добавить этап графика';
    document.getElementById('modalBody').innerHTML = `<div class="form-grid"><input id="task-name" placeholder="Наименование" value="${task?.name || ''}"><input id="task-start" type="date" value="${task?.start_date || ''}"><input id="task-end" type="date" value="${task?.end_date || ''}"><input id="task-duration" type="number" placeholder="Длительность" value="${task?.duration || 0}"><input id="task-progress" type="number" min="0" max="100" placeholder="Процент" value="${task?.progress || 0}"><select id="task-status">${['не начато', 'в работе', 'завершено'].map(status => `<option value="${status}" ${task?.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></div>`;
    document.getElementById('entityModal').dataset.entityId = taskId || '';
    this.openModal();
  }

  async deleteTask(id) {
    if (!confirm('Удалить этап графика?')) return;
    await this.api(`/tasks/${id}`, 'DELETE');
    await this.renderDesignSchedule();
  }

  async openTemplateRowModal(code, rowId = null) {
    if (!this.selectedObjectId) return this.showError('Выберите проект');
    this.modalMode = rowId ? 'editTemplateRow' : 'createTemplateRow';
    this.currentTemplateCode = code;

    const [tplPayload, rows] = await Promise.all([this.loadTemplate(code), this.loadTemplateRows(this.selectedObjectId, code)]);
    const columns = tplPayload.columns || [];
    const targetRow = rowId ? rows.find(r => r.id === rowId) : null;

    document.getElementById('modalTitle').textContent = `${rowId ? 'Редактировать' : 'Добавить'} строку (${tplPayload.template.name})`;
    document.getElementById('modalBody').innerHTML = `<div class="form-grid">${columns.map(c => `<label>${c.title}${c.required ? ' *' : ''}<input data-template-field="${c.field_key}" type="${c.data_type === 'number' ? 'number' : c.data_type === 'date' ? 'date' : 'text'}" value="${(targetRow?.data || {})[c.field_key] || ''}"></label>`).join('')}</div>`;
    document.getElementById('entityModal').dataset.entityId = rowId || '';
    document.getElementById('entityModal').dataset.templateCode = code;
    this.openModal();
  }

  async deleteTemplateRow(code, rowId) {
    if (!confirm('Удалить строку?')) return;
    await this.api(`/template-rows/${rowId}`, 'DELETE');
    await this.renderTemplateTable(code, code === 'tep' ? 'Технико-экономические показатели' : code);
  }

  async handleSaveModal() {
    try {
      if (this.modalMode === 'createObject' || this.modalMode === 'editObject') {
        const payload = { name: document.getElementById('obj-name').value.trim(), address: document.getElementById('obj-address').value.trim(), budget: Number(document.getElementById('obj-budget').value || 0), duration_days: Number(document.getElementById('obj-duration').value || 0), status: document.getElementById('obj-status').value };
        if (!payload.name) return this.showError('Заполните наименование проекта');
        const id = document.getElementById('entityModal').dataset.entityId;
        if (id) await this.api(`/objects/${id}`, 'PUT', payload); else await this.api('/objects', 'POST', payload);
        await this.refreshProjects();
      }

      if (this.modalMode === 'createTask' || this.modalMode === 'editTask') {
        const payload = { object_id: this.selectedObjectId, name: document.getElementById('task-name').value.trim(), start_date: document.getElementById('task-start').value, end_date: document.getElementById('task-end').value, duration: Number(document.getElementById('task-duration').value || 0), progress: Number(document.getElementById('task-progress').value || 0), status: document.getElementById('task-status').value };
        if (!payload.name) return this.showError('Заполните наименование этапа');
        const id = document.getElementById('entityModal').dataset.entityId;
        if (id) await this.api(`/tasks/${id}`, 'PUT', payload); else await this.api('/tasks', 'POST', payload);
        await this.renderDesignSchedule();
      }

      if (this.modalMode === 'createTemplateRow' || this.modalMode === 'editTemplateRow') {
        const data = {};
        document.querySelectorAll('[data-template-field]').forEach(input => { data[input.dataset.templateField] = input.value; });
        const rowId = document.getElementById('entityModal').dataset.entityId;
        const code = document.getElementById('entityModal').dataset.templateCode;
        if (rowId) await this.api(`/template-rows/${rowId}`, 'PUT', { data });
        else await this.api(`/objects/${this.selectedObjectId}/templates/${code}/rows`, 'POST', { data });
        await this.renderTemplateTable(code, code === 'tep' ? 'Технико-экономические показатели' : code);
      }

      this.closeModal();
    } catch (error) {
      this.showError(`Ошибка сохранения: ${error.message}`);
    }
  }

  renderMapAsKPI(mapData = {}) {
    const entries = Object.entries(mapData || {});
    if (!entries.length) return '<div class="metric">Пока нет данных</div>';
    return entries.map(([k, v]) => `<div class="kpi"><span>${k}</span><span>${v}</span></div>`).join('');
  }

  openModal() { document.getElementById('entityModal').classList.add('open'); }
  closeModal() { document.getElementById('entityModal').classList.remove('open'); }
  showError(message) { alert(message); }

  formatMoney(value) {
    return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value || 0);
  }
}

window.addEventListener('DOMContentLoaded', () => new ConstructionManagerUI());
