/**
 * DocsTree — ленивое дерево папок для FMS
 */
export class DocsTree {
  constructor(projectId, containerId, onSelect) {
    this.projectId = projectId;
    this.containerId = containerId;
    this.onSelect = onSelect;
    this.currentPath = '/';
    this.expanded = new Set(['/']);
  }

  container() {
    return document.getElementById(this.containerId);
  }

  async loadNode(path) {
    this.currentPath = path;
    const el = this.container();
    if (!el) return;
    el.className = 'fms-tree';
    el.innerHTML = '<span class="muted">📂 Загрузка дерева...</span>';
    try {
      const token = localStorage.getItem('cm_token') || localStorage.getItem('authToken') || localStorage.getItem('token') || '';
      const res = await fetch(`/api/v1/files/tree?project_id=${encodeURIComponent(this.projectId)}&path=${encodeURIComponent(path)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      const data = res.ok ? await res.json() : [];
      const nodes = Array.isArray(data) ? data : (data?.nodes || data?.items || []);
      el.innerHTML = '';
      el.appendChild(this._renderRoot(nodes));
    } catch (e) {
      el.innerHTML = `<span class="muted">📂 Дерево недоступно</span>`;
    }
    this.onSelect && this.onSelect(path);
  }

  _renderRoot(nodes) {
    const root = document.createElement('div');
    root.className = 'tree-node';
    const row = this._makeRow('/', '📁 Корень', 0);
    row.classList.add('selected');
    root.appendChild(row);
    if (nodes.length) {
      const children = document.createElement('div');
      children.className = 'tree-children';
      nodes.forEach(n => children.appendChild(this._renderNode(n, 1)));
      root.appendChild(children);
    }
    return root;
  }

  _renderNode(node, level) {
    const wrap = document.createElement('div');
    wrap.className = 'tree-node';
    const hasChildren = node.has_children || node.children?.length > 0;
    const icon = hasChildren ? '📁' : '📄';
    const row = this._makeRow(node.path || node.folder_path || '/', `${icon} ${node.name}`, level);
    wrap.appendChild(row);
    if (node.children?.length) {
      const sub = document.createElement('div');
      sub.className = 'tree-children';
      node.children.forEach(c => sub.appendChild(this._renderNode(c, level + 1)));
      wrap.appendChild(sub);
    }
    return wrap;
  }

  _makeRow(path, label, level) {
    const row = document.createElement('div');
    row.className = 'tree-node-row';
    row.style.paddingLeft = `${6 + level * 16}px`;
    row.textContent = label;
    row.dataset.path = path;
    row.addEventListener('click', (e) => {
      this.container().querySelectorAll('.tree-node-row').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      this.currentPath = path;
      this.onSelect && this.onSelect(path);
    });
    return row;
  }

  refresh() {
    this.loadNode(this.currentPath);
  }
}
