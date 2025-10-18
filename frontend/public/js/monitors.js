// ============================================
// MONITORS MODULE
// ============================================

import { apiRequest } from './api.js';
import { getMonitors, setMonitors, getTags, getDeleteTarget, setDeleteTarget } from './state.js';
import { showToast, escapeHtml } from './ui.js';

// Symbol map for tag icons
const symbolMap = {
    'tag.fill': '🏷️',
    'star.fill': '⭐',
    'heart.fill': '❤️',
    'flag.fill': '🚩',
    'bookmark.fill': '🔖',
    'pin.fill': '📌',
    'circle.fill': '⚫',
    'square.fill': '⬛',
    'triangle.fill': '🔺',
    'diamond.fill': '💎',
    'hexagon.fill': '⬡',
    'seal.fill': '🏵️',
    'cloud.fill': '☁️',
    'flame.fill': '🔥',
    'bolt.fill': '⚡',
    'sparkles': '✨',
    'globe': '🌐',
    'network': '🔗',
    'server.rack': '🖥️',
    'desktopcomputer': '💻',
    'laptopcomputer': '💻',
    'iphone': '📱',
    'shield.fill': '🛡️',
    'lock.fill': '🔒',
    'key.fill': '🔑',
    'wrench.and.screwdriver.fill': '🛠️',
    'hammer.fill': '🔨',
    'gear': '⚙️',
    'chart.bar.fill': '📊',
    'chart.line.uptrend.xyaxis': '📈',
    'bell.fill': '🔔',
    'checkmark.circle.fill': '✅',
    'xmark.circle.fill': '❌',
    'exclamationmark.triangle.fill': '⚠️'
};

// ============================================
// MONITOR LOADING
// ============================================
export async function loadMonitors() {
    try {
        const data = await apiRequest('/monitors');
        setMonitors(data.monitors);
        updateTagFilter();
        filterMonitors();
        updateStats();
    } catch (error) {
        console.error('Failed to load monitors:', error);
    }
}

// ============================================
// MONITOR RENDERING
// ============================================
export function renderMonitors() {
    const container = document.getElementById('monitorsList');
    const monitors = getMonitors();
    const tags = getTags();

    if (monitors.length === 0) {
        container.innerHTML = '<div class="loading">No monitors yet. Click "New Monitor" to get started.</div>';
        return;
    }

    container.innerHTML = monitors.map(monitor => {
        // Get tags for this monitor
        const monitorTags = (monitor.tag_ids || []).map(tagId =>
            tags.find(t => t.id === tagId)
        ).filter(t => t);

        const tagsHtml = monitorTags.length > 0 ? `
            <div class="monitor-tags">
                ${monitorTags.map(tag => `
                    <span class="tag-badge" style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}">
                        ${symbolMap[tag.symbol] || symbolMap['tag.fill']} ${escapeHtml(tag.name)}
                    </span>
                `).join('')}
            </div>
        ` : '';

        return `
            <div class="monitor-item">
                <div class="monitor-status-indicator ${monitor.current_status}"></div>
                <div class="monitor-info">
                    <div class="monitor-name">${escapeHtml(monitor.name)}</div>
                    <div class="monitor-url">${escapeHtml(monitor.url || monitor.hostname || monitor.type)}</div>
                    ${tagsHtml}
                </div>
                <div class="monitor-stats">
                    <div class="monitor-stat">
                        <div class="monitor-stat-label">Uptime</div>
                        <div class="monitor-stat-value">${monitor.uptime_percentage || 0}%</div>
                    </div>
                    ${monitor.avg_response_time ? `
                    <div class="monitor-stat">
                        <div class="monitor-stat-label">Response</div>
                        <div class="monitor-stat-value">${monitor.avg_response_time}ms</div>
                    </div>
                    ` : ''}
                </div>
                <div class="monitor-actions">
                    <button class="btn-icon" onclick="window.editMonitor(${monitor.id})" title="Edit">✏️</button>
                    <button class="btn-icon danger" onclick="window.showDeleteModal('monitor', ${monitor.id}, '${escapeHtml(monitor.name)}')" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function renderFilteredMonitors(filteredMonitors) {
    const container = document.getElementById('monitorsList');
    const tags = getTags();
    const allMonitors = getMonitors();

    if (filteredMonitors.length === 0) {
        // Check if there are any monitors at all
        if (allMonitors.length === 0) {
            container.innerHTML = '<div class="loading">No monitors yet. Click "New Monitor" to get started.</div>';
        } else {
            container.innerHTML = '<div class="loading">No monitors match your filters.</div>';
        }
        return;
    }

    container.innerHTML = filteredMonitors.map(monitor => {
        // Get tags for this monitor
        const monitorTags = (monitor.tag_ids || []).map(tagId =>
            tags.find(t => t.id === tagId)
        ).filter(t => t);

        const tagsHtml = monitorTags.length > 0 ? `
            <div class="monitor-tags">
                ${monitorTags.map(tag => `
                    <span class="tag-badge" style="background-color: ${tag.color}20; color: ${tag.color}; border: 1px solid ${tag.color}">
                        ${symbolMap[tag.symbol] || symbolMap['tag.fill']} ${escapeHtml(tag.name)}
                    </span>
                `).join('')}
            </div>
        ` : '';

        return `
            <div class="monitor-item">
                <div class="monitor-status-indicator ${monitor.current_status}"></div>
                <div class="monitor-info">
                    <div class="monitor-name">${escapeHtml(monitor.name)}</div>
                    <div class="monitor-url">${escapeHtml(monitor.url || monitor.hostname || monitor.type)}</div>
                    ${tagsHtml}
                </div>
                <div class="monitor-stats">
                    <div class="monitor-stat">
                        <div class="monitor-stat-label">Uptime</div>
                        <div class="monitor-stat-value">${monitor.uptime_percentage || 0}%</div>
                    </div>
                    ${monitor.avg_response_time ? `
                    <div class="monitor-stat">
                        <div class="monitor-stat-label">Response</div>
                        <div class="monitor-stat-value">${monitor.avg_response_time}ms</div>
                    </div>
                    ` : ''}
                </div>
                <div class="monitor-actions">
                    <button class="btn-icon" onclick="window.editMonitor(${monitor.id})" title="Edit">✏️</button>
                    <button class="btn-icon danger" onclick="window.showDeleteModal('monitor', ${monitor.id}, '${escapeHtml(monitor.name)}')" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

export function updateStats() {
    const monitors = getMonitors();
    const total = monitors.length;
    const up = monitors.filter(m => m.current_status === 'up').length;
    const down = monitors.filter(m => m.current_status === 'down').length;
    const pending = monitors.filter(m => m.current_status === 'pending').length;

    document.getElementById('totalMonitors').textContent = total;
    document.getElementById('upMonitors').textContent = up;
    document.getElementById('downMonitors').textContent = down;
    document.getElementById('pendingMonitors').textContent = pending;
}

// ============================================
// SEARCH AND FILTER
// ============================================
export function updateTagFilter() {
    const tagFilter = document.getElementById('tagFilter');
    if (!tagFilter) return;

    const tags = getTags();

    // Preserve current selection
    const currentValue = tagFilter.value;

    // Update options
    tagFilter.innerHTML = '<option value="">All Tags</option>' +
        tags.map(tag => `<option value="${tag.id}">${escapeHtml(tag.name)}</option>`).join('');

    // Restore selection if still valid
    if (currentValue && tags.find(t => t.id == currentValue)) {
        tagFilter.value = currentValue;
    }
}

export function filterMonitors() {
    const monitors = getMonitors();
    const searchTerm = document.getElementById('monitorSearch')?.value.toLowerCase() || '';
    const tagFilterValue = document.getElementById('tagFilter')?.value || '';
    const statusFilterValue = document.getElementById('statusFilter')?.value || '';

    const filtered = monitors.filter(monitor => {
        // Search filter
        const matchesSearch = !searchTerm ||
            monitor.name.toLowerCase().includes(searchTerm) ||
            (monitor.url && monitor.url.toLowerCase().includes(searchTerm)) ||
            (monitor.hostname && monitor.hostname.toLowerCase().includes(searchTerm));

        // Tag filter
        const matchesTag = !tagFilterValue ||
            (monitor.tag_ids && monitor.tag_ids.includes(parseInt(tagFilterValue)));

        // Status filter
        const matchesStatus = !statusFilterValue ||
            monitor.current_status === statusFilterValue;

        return matchesSearch && matchesTag && matchesStatus;
    });

    renderFilteredMonitors(filtered);
}

// ============================================
// MONITOR CRUD
// ============================================
export function showAddMonitorModal() {
    document.getElementById('modalTitle').textContent = 'Add Monitor';
    document.getElementById('monitorId').value = '';
    document.getElementById('monitorForm').reset();
    renderTagsSelector();
    updateMonitorFields();
    document.getElementById('monitorModal').classList.add('active');
}

export async function editMonitor(id) {
    try {
        const data = await apiRequest(`/monitors/${id}`);
        const monitor = data.monitor;

        document.getElementById('modalTitle').textContent = 'Edit Monitor';
        document.getElementById('monitorId').value = monitor.id;
        document.getElementById('monitorName').value = monitor.name;
        document.getElementById('monitorType').value = monitor.type;
        document.getElementById('monitorUrl').value = monitor.url || '';
        document.getElementById('monitorHostname').value = monitor.hostname || '';
        document.getElementById('monitorPort').value = monitor.port || '';
        document.getElementById('monitorMethod').value = monitor.method || 'GET';
        document.getElementById('acceptedStatusCodes').value = monitor.accepted_status_codes || '200';
        document.getElementById('checkInterval').value = monitor.check_interval || 60;
        document.getElementById('timeout').value = monitor.timeout || 30;
        document.getElementById('notifyOnDownModal').checked = monitor.notify_on_down !== false;
        document.getElementById('notifyOnUpModal').checked = monitor.notify_on_up !== false;
        document.getElementById('monitorActive').checked = monitor.active !== false;

        if (monitor.dns_record_type) {
            document.getElementById('dnsRecordType').value = monitor.dns_record_type;
        }

        // Render tags selector with monitor's selected tags
        renderTagsSelector(monitor.tag_ids || []);

        updateMonitorFields();
        document.getElementById('monitorModal').classList.add('active');
    } catch (error) {
        showToast('Load Failed', `Failed to load monitor: ${error.message}`, 'error');
    }
}

export async function handleMonitorSubmit(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('monitorFormError');
    errorDiv.textContent = '';

    const id = document.getElementById('monitorId').value;
    const type = document.getElementById('monitorType').value;

    const monitorData = {
        name: document.getElementById('monitorName').value,
        type: type,
        check_interval: parseInt(document.getElementById('checkInterval').value),
        timeout: parseInt(document.getElementById('timeout').value),
        notify_on_down: document.getElementById('notifyOnDownModal').checked,
        notify_on_up: document.getElementById('notifyOnUpModal').checked,
        active: document.getElementById('monitorActive').checked,
        tags: getSelectedTags()
    };

    if (type === 'http' || type === 'https') {
        monitorData.url = document.getElementById('monitorUrl').value;
        monitorData.method = document.getElementById('monitorMethod').value;
        monitorData.accepted_status_codes = document.getElementById('acceptedStatusCodes').value;
    }

    if (type === 'ping' || type === 'tcp' || type === 'dns') {
        monitorData.hostname = document.getElementById('monitorHostname').value;
    }

    if (type === 'tcp') {
        monitorData.port = parseInt(document.getElementById('monitorPort').value);
    }

    if (type === 'dns') {
        monitorData.dns_record_type = document.getElementById('dnsRecordType').value;
    }

    try {
        if (id) {
            await apiRequest(`/monitors/${id}`, {
                method: 'PUT',
                body: JSON.stringify(monitorData)
            });
        } else {
            await apiRequest('/monitors', {
                method: 'POST',
                body: JSON.stringify(monitorData)
            });
        }

        closeMonitorModal();
        loadMonitors();
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

export function updateMonitorFields() {
    const type = document.getElementById('monitorType').value;

    document.getElementById('httpFields').style.display = 'none';
    document.getElementById('hostFields').style.display = 'none';
    document.getElementById('tcpFields').style.display = 'none';
    document.getElementById('dnsFields').style.display = 'none';

    if (type === 'http' || type === 'https') {
        document.getElementById('httpFields').style.display = 'block';
    }

    if (type === 'ping' || type === 'tcp' || type === 'dns') {
        document.getElementById('hostFields').style.display = 'block';
    }

    if (type === 'tcp') {
        document.getElementById('tcpFields').style.display = 'block';
    }

    if (type === 'dns') {
        document.getElementById('dnsFields').style.display = 'block';
    }
}

export function closeMonitorModal() {
    document.getElementById('monitorModal').classList.remove('active');
    document.getElementById('monitorForm').reset();
    document.getElementById('monitorFormError').textContent = '';
}

// ============================================
// TAGS SELECTOR FOR MONITORS
// ============================================
function renderTagsSelector(selectedTagIds = []) {
    const container = document.getElementById('monitorTags');
    const tags = getTags();

    if (tags.length === 0) {
        container.innerHTML = '<div style="padding: 8px; color: var(--text-secondary); font-size: 13px;">No tags available. Create tags in the Tags view first.</div>';
        return;
    }

    container.innerHTML = tags.map(tag => `
        <input type="checkbox"
               id="tag-${tag.id}"
               class="tag-checkbox"
               value="${tag.id}"
               ${selectedTagIds.includes(tag.id) ? 'checked' : ''}>
        <label for="tag-${tag.id}" class="tag-checkbox-label">
            <span class="tag-checkbox-color" style="background-color: ${tag.color}">
                ${symbolMap[tag.symbol] || symbolMap['tag.fill']}
            </span>
            ${escapeHtml(tag.name)}
        </label>
    `).join('');
}

function getSelectedTags() {
    const checkboxes = document.querySelectorAll('.tag-checkbox:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.value));
}

// ============================================
// DELETE MODAL
// ============================================
export function showDeleteModal(type, id, name) {
    setDeleteTarget({ type, id });
    document.getElementById('deleteModalTitle').textContent = `Delete ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete "${name}"?`;
    document.getElementById('deleteModal').classList.add('active');
}

export async function confirmDelete() {
    const deleteTarget = getDeleteTarget();
    if (!deleteTarget) return;

    try {
        const endpoint = deleteTarget.type === 'monitor'
            ? `/monitors/${deleteTarget.id}`
            : `/tags/${deleteTarget.id}`;

        await apiRequest(endpoint, { method: 'DELETE' });

        closeDeleteModal();

        if (deleteTarget.type === 'monitor') {
            loadMonitors();
        } else {
            const { loadTags } = await import('./tags.js');
            loadTags();
        }
    } catch (error) {
        showToast('Deletion Failed', `Failed to delete: ${error.message}`, 'error');
    }
}

export function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
    setDeleteTarget(null);
}
