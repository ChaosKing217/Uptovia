// ============================================
// UI UTILITIES - Toast, Modals, Theme, etc.
// ============================================

/**
 * Show a toast notification
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {string} type - Toast type: 'success', 'error', 'warning'
 */
export function showToast(title, message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        warning: '⚠'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type] || icons.success}</div>
        <div class="toast-content">
            <div class="toast-title">${escapeHtml(title)}</div>
            ${message ? `<div class="toast-message">${escapeHtml(message)}</div>` : ''}
        </div>
    `;

    container.appendChild(toast);

    // Auto-remove after 4 seconds
    setTimeout(() => {
        toast.classList.add('fadeOut');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Show a confirmation dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {function} onConfirm - Callback when confirmed
 */
export function showConfirm(title, message, onConfirm) {
    const dialog = document.createElement('div');
    dialog.className = 'confirm-dialog';

    dialog.innerHTML = `
        <div class="confirm-dialog-content">
            <div class="confirm-dialog-title">${escapeHtml(title)}</div>
            <div class="confirm-dialog-message">${escapeHtml(message)}</div>
            <div class="confirm-dialog-buttons">
                <button class="btn-secondary" onclick="this.closest('.confirm-dialog').remove()">Cancel</button>
                <button class="btn-danger" id="confirmBtn">Confirm</button>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    // Handle confirm
    dialog.querySelector('#confirmBtn').onclick = () => {
        dialog.remove();
        onConfirm();
    };

    // Handle click outside
    dialog.onclick = (e) => {
        if (e.target === dialog) {
            dialog.remove();
        }
    };
}

/**
 * Toggle between light and dark theme
 */
export function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');

    // Save preference
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Update icon
    updateThemeIcon();
    updateThemeButtonStates();
}

/**
 * Set specific theme
 * @param {string} theme - 'light' or 'dark'
 */
export function setTheme(theme) {
    const body = document.body;

    if (theme === 'dark') {
        body.classList.add('dark-theme');
    } else {
        body.classList.remove('dark-theme');
    }

    // Save preference
    localStorage.setItem('theme', theme);

    // Update UI
    updateThemeIcon();
    updateThemeButtonStates();
}

/**
 * Update theme toggle icon
 */
export function updateThemeIcon() {
    const themeIcon = document.querySelector('.theme-icon');
    const isDark = document.body.classList.contains('dark-theme');

    if (themeIcon) {
        themeIcon.textContent = isDark ? '☀️' : '🌙';
    }
}

/**
 * Update theme button states in settings
 */
export function updateThemeButtonStates() {
    const isDark = document.body.classList.contains('dark-theme');
    const lightBtn = document.getElementById('lightThemeBtn');
    const darkBtn = document.getElementById('darkThemeBtn');

    if (lightBtn && darkBtn) {
        if (isDark) {
            lightBtn.classList.remove('active');
            darkBtn.classList.add('active');
        } else {
            lightBtn.classList.add('active');
            darkBtn.classList.remove('active');
        }
    }
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
export function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Open a modal by ID
 * @param {string} modalId - Modal element ID
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

/**
 * Close a modal by ID
 * @param {string} modalId - Modal element ID
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

/**
 * Close all modals
 */
export function closeAllModals() {
    document.querySelectorAll('.modal.active').forEach(modal => {
        modal.classList.remove('active');
    });
}

/**
 * Toggle mobile menu
 */
export function toggleMobileMenu() {
    const mobileSidebar = document.getElementById('mobileSidebar');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');

    mobileSidebar.classList.toggle('active');
    mobileMenuOverlay.classList.toggle('active');
}
