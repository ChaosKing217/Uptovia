// ============================================
// TAGS MODULE
// ============================================

import { apiRequest } from './api.js';
import { getTags, setTags, getCurrentView, getCurrentUser } from './state.js';
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
// TAG LOADING
// ============================================
export async function loadTags() {
    try {
        const data = await apiRequest('/tags');
        setTags(data.tags);
        if (getCurrentView() === 'tags') {
            renderTags();
        }
    } catch (error) {
        console.error('Failed to load tags:', error);
    }
}

// ============================================
// TAG RENDERING
// ============================================
export function renderTags() {
    const container = document.getElementById('tagsList');
    const tags = getTags();

    if (tags.length === 0) {
        container.innerHTML = '<div class="loading">No tags yet. Click "New Tag" to create one.</div>';
        return;
    }

    container.innerHTML = tags.map(tag => `
        <div class="tag-item">
            <div class="tag-color-preview" style="background-color: ${tag.color}">
                ${symbolMap[tag.symbol] || symbolMap['tag.fill']}
            </div>
            <div class="tag-info">
                <div class="tag-name">${escapeHtml(tag.name)}</div>
                <div class="tag-count">${tag.monitor_count || 0} monitors</div>
            </div>
            <div class="tag-actions">
                <button class="btn-icon" onclick="window.editTag(${tag.id})" title="Edit">✏️</button>
                <button class="btn-icon danger" onclick="window.showDeleteModal('tag', ${tag.id}, '${escapeHtml(tag.name)}')" title="Delete">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ============================================
// SYMBOL PICKER
// ============================================
export function renderSymbolPicker(selectedSymbol = 'tag.fill') {
    const container = document.getElementById('symbolPicker');
    container.innerHTML = Object.entries(symbolMap).map(([key, emoji]) => `
        <div class="symbol-option ${key === selectedSymbol ? 'selected' : ''}"
             data-symbol="${key}"
             onclick="window.selectSymbol('${key}')"
             title="${key}">
            ${emoji}
        </div>
    `).join('');
}

export function selectSymbol(symbol) {
    document.getElementById('tagSymbol').value = symbol;
    document.querySelectorAll('.symbol-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.symbol === symbol);
    });
}

// ============================================
// TAG CRUD
// ============================================
export function showAddTagModal() {
    // Check if user's email is verified
    const user = getCurrentUser();
    if (!user.email_verified && !user.is_admin) {
        showToast('Email Not Verified', 'Please verify your email address before creating tags.', 'error');
        return;
    }

    document.getElementById('tagModalTitle').textContent = 'Add Tag';
    document.getElementById('tagId').value = '';
    document.getElementById('tagForm').reset();
    document.getElementById('tagColor').value = '#3B82F6';
    document.getElementById('tagColorText').value = '#3B82F6';
    document.getElementById('tagSymbol').value = 'tag.fill';
    renderSymbolPicker('tag.fill');
    document.getElementById('tagModal').classList.add('active');
}

export async function editTag(id) {
    try {
        const tags = getTags();
        const tag = tags.find(t => t.id === id);
        if (!tag) throw new Error('Tag not found');

        document.getElementById('tagModalTitle').textContent = 'Edit Tag';
        document.getElementById('tagId').value = tag.id;
        document.getElementById('tagName').value = tag.name;
        document.getElementById('tagColor').value = tag.color;
        document.getElementById('tagColorText').value = tag.color;
        document.getElementById('tagSymbol').value = tag.symbol || 'tag.fill';
        renderSymbolPicker(tag.symbol || 'tag.fill');
        document.getElementById('tagModal').classList.add('active');
    } catch (error) {
        showToast('Load Failed', `Failed to load tag: ${error.message}`, 'error');
    }
}

export async function handleTagSubmit(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('tagFormError');
    errorDiv.textContent = '';

    const id = document.getElementById('tagId').value;
    const tagData = {
        name: document.getElementById('tagName').value,
        color: document.getElementById('tagColor').value,
        symbol: document.getElementById('tagSymbol').value
    };

    try {
        if (id) {
            await apiRequest(`/tags/${id}`, {
                method: 'PUT',
                body: JSON.stringify(tagData)
            });
        } else {
            await apiRequest('/tags', {
                method: 'POST',
                body: JSON.stringify(tagData)
            });
        }

        closeTagModal();
        loadTags();
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

export function closeTagModal() {
    document.getElementById('tagModal').classList.remove('active');
    document.getElementById('tagForm').reset();
    document.getElementById('tagFormError').textContent = '';
}
