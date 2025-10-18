// ============================================
// GLOBAL STATE
// ============================================
let currentUser = null;
let authToken = null;
let monitors = [];
let tags = [];
let currentView = 'monitors';
let deleteTarget = null;
let apiKeyVisible = false;

// ============================================
// API CONFIGURATION
// ============================================
const API_BASE = window.location.origin + '/api';

// ============================================
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        updateThemeIcon();
    }

    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');

    if (savedToken && savedUser) {
        authToken = savedToken;
        currentUser = JSON.parse(savedUser);
        showDashboard();
    } else {
        showLoginScreen();
    }

    setupEventListeners();
});

function setupEventListeners() {
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('monitorForm').addEventListener('submit', handleMonitorSubmit);
    document.getElementById('tagForm').addEventListener('submit', handleTagSubmit);
    document.getElementById('forgotPasswordForm').addEventListener('submit', handleForgotPassword);
    document.getElementById('resetPasswordForm').addEventListener('submit', handleResetPassword);
    document.getElementById('forcePasswordChangeForm').addEventListener('submit', handleForcePasswordChange);
    document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);

    // Color picker sync
    document.getElementById('tagColor').addEventListener('input', (e) => {
        document.getElementById('tagColorText').value = e.target.value;
    });
    document.getElementById('tagColorText').addEventListener('input', (e) => {
        document.getElementById('tagColor').value = e.target.value;
    });

    // Check for password reset token in URL (both query and hash)
    const urlParams = new URLSearchParams(window.location.search);
    let resetToken = urlParams.get('token');

    // Check hash for reset-password route
    if (window.location.hash.includes('reset-password')) {
        const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
        resetToken = hashParams.get('token');
    }

    if (resetToken) {
        document.getElementById('resetToken').value = resetToken;
        document.getElementById('resetPasswordModal').classList.add('active');
    }
}

// ============================================
// SCREEN MANAGEMENT
// ============================================
function showLoginScreen() {
    document.getElementById('loginScreen').classList.add('active');
    document.getElementById('dashboardScreen').classList.remove('active');
}

function showDashboard() {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('dashboardScreen').classList.add('active');
    document.getElementById('sidebarUsername').textContent = currentUser.username;

    // Set user role based on their primary group
    if (currentUser.groups && currentUser.groups.length > 0) {
        // Show the first group name (Admin group has priority as it's id: 1)
        document.getElementById('sidebarUserRole').textContent = currentUser.groups[0].name;
    }

    loadData();
    showView('monitors');

    // Auto-refresh every 30 seconds
    setInterval(() => {
        if (currentView === 'monitors') {
            loadMonitors();
        }
    }, 30000);
}

function showView(viewName, e) {
    currentView = viewName;

    // Update nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Update active state - find the nav item for this view
    const navItem = document.querySelector(`.nav-item[onclick*="${viewName}"]`);
    if (navItem) {
        navItem.classList.add('active');
    }

    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}View`).classList.add('active');

    // Load data for the view
    if (viewName === 'monitors') {
        loadMonitors();
    } else if (viewName === 'tags') {
        loadTags();
    } else if (viewName === 'settings') {
        loadSettings();
    }
}

function goToHome() {
    // Set monitors nav item as active
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelectorAll('.nav-item')[0].classList.add('active');

    // Show monitors view
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById('monitorsView').classList.add('active');

    // Refresh monitors data
    currentView = 'monitors';
    loadMonitors();
}

// ============================================
// AUTH FUNCTIONS
// ============================================
function showLoginForm() {
    document.querySelectorAll('.login-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.login-tab')[0].classList.add('active');
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('registerForm').classList.remove('active');
}

function showRegisterForm() {
    document.querySelectorAll('.login-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.login-tab')[1].classList.add('active');
    document.getElementById('registerForm').classList.add('active');
    document.getElementById('loginForm').classList.remove('active');
}

async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Login failed');
        }

        authToken = data.token;
        currentUser = data.user;

        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // Check if user needs to change password
        if (currentUser.forcePasswordReset || currentUser.forceUsernameChange) {
            showForcePasswordChangeModal(currentUser.forceUsernameChange);
        } else {
            showDashboard();
        }
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const email = document.getElementById('registerEmail').value;
    const errorDiv = document.getElementById('registerError');

    // Validate password strength
    const passwordValidation = validatePasswordStrength(password);
    if (!passwordValidation.valid) {
        errorDiv.textContent = passwordValidation.message;
        return;
    }

    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }

    try {
        const requestBody = { username, password, email };

        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Registration failed');
        }

        authToken = data.token;
        currentUser = data.user;

        localStorage.setItem('authToken', authToken);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        showDashboard();
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

function validatePasswordStrength(password) {
    if (password.length < 8) {
        return { valid: false, message: 'Password must be at least 8 characters long' };
    }

    const hasUppercase = /[A-Z]/.test(password);
    if (!hasUppercase) {
        return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }

    const hasNumberOrSymbol = /[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    if (!hasNumberOrSymbol) {
        return { valid: false, message: 'Password must contain at least one number or symbol' };
    }

    return { valid: true, message: 'Password is strong' };
}

function validatePassword() {
    const password = document.getElementById('registerPassword').value;
    const requirementsEl = document.getElementById('passwordRequirements');

    if (password.length === 0) {
        requirementsEl.style.color = 'var(--text-secondary)';
        requirementsEl.textContent = 'Must contain: 8+ characters, 1 uppercase letter, 1 number or symbol';
        return;
    }

    const validation = validatePasswordStrength(password);

    if (validation.valid) {
        requirementsEl.style.color = 'var(--success)';
        requirementsEl.textContent = '✓ Password meets all requirements';
    } else {
        requirementsEl.style.color = 'var(--error)';
        requirementsEl.textContent = '✗ ' + validation.message;
    }

    // Also check password match when password changes
    checkPasswordMatch();
}

function checkPasswordMatch() {
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const messageEl = document.getElementById('passwordMatchMessage');

    if (confirmPassword.length === 0) {
        messageEl.style.display = 'none';
        return;
    }

    messageEl.style.display = 'block';

    if (password === confirmPassword) {
        messageEl.style.color = 'var(--success)';
        messageEl.textContent = '✓ Passwords match';
    } else {
        messageEl.style.color = 'var(--error)';
        messageEl.textContent = '✗ Passwords do not match';
    }
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    authToken = null;
    currentUser = null;
    showLoginScreen();
}

// ============================================
// PASSWORD RESET FUNCTIONS
// ============================================
function showForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').classList.add('active');
    document.getElementById('forgotPasswordForm').reset();
    document.getElementById('forgotPasswordError').textContent = '';
    document.getElementById('forgotPasswordSuccess').textContent = '';
}

function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').classList.remove('active');
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const identifier = document.getElementById('forgotIdentifier').value;
    const errorDiv = document.getElementById('forgotPasswordError');
    const successDiv = document.getElementById('forgotPasswordSuccess');

    errorDiv.textContent = '';
    successDiv.style.display = 'none';
    successDiv.textContent = '';

    try {
        const response = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to send reset email');
        }

        successDiv.textContent = data.message;
        successDiv.style.display = 'block';
        document.getElementById('forgotPasswordForm').reset();

        // Close modal after 5 seconds
        setTimeout(() => {
            closeForgotPasswordModal();
        }, 5000);
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

async function handleResetPassword(e) {
    e.preventDefault();
    const token = document.getElementById('resetToken').value;
    const newPassword = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;
    const errorDiv = document.getElementById('resetPasswordError');
    const successDiv = document.getElementById('resetPasswordSuccess');

    errorDiv.textContent = '';
    successDiv.textContent = '';

    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }

    if (newPassword.length < 8) {
        errorDiv.textContent = 'Password must be at least 8 characters';
        return;
    }

    if (!/[A-Z]/.test(newPassword)) {
        errorDiv.textContent = 'Password must contain at least one uppercase letter';
        return;
    }

    if (!/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
        errorDiv.textContent = 'Password must contain at least one number or symbol';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to reset password');
        }

        successDiv.textContent = data.message;
        document.getElementById('resetPasswordForm').reset();

        // Redirect to login after 2 seconds
        setTimeout(() => {
            document.getElementById('resetPasswordModal').classList.remove('active');
            showLoginForm();
            // Remove token from URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 2000);
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

// ============================================
// API HELPER
// ============================================
async function apiRequest(endpoint, options = {}) {
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
            ...options.headers
        }
    });

    if (response.status === 401) {
        logout();
        throw new Error('Session expired');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

// ============================================
// DATA LOADING
// ============================================
async function loadData() {
    // Load user info first to get groups
    try {
        const data = await apiRequest('/auth/me');
        currentUser = { ...currentUser, ...data.user };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // Update sidebar role with group info
        if (currentUser.groups && currentUser.groups.length > 0) {
            document.getElementById('sidebarUserRole').textContent = currentUser.groups[0].name;
        }
    } catch (error) {
        console.error('Failed to load user info:', error);
    }

    await Promise.all([loadMonitors(), loadTags()]);
}

async function loadMonitors() {
    try {
        const data = await apiRequest('/monitors');
        monitors = data.monitors;
        updateTagFilter();
        filterMonitors();
        updateStats();
    } catch (error) {
        console.error('Failed to load monitors:', error);
    }
}

async function loadTags() {
    try {
        const data = await apiRequest('/tags');
        tags = data.tags;
        if (currentView === 'tags') {
            renderTags();
        }
    } catch (error) {
        console.error('Failed to load tags:', error);
    }
}

async function loadSettings() {
    try {
        const data = await apiRequest('/auth/me');
        const user = data.user;

        document.getElementById('settingsUsername').textContent = user.username;
        document.getElementById('settingsEmail').textContent = user.email || 'Not set';
        document.getElementById('settingsCreated').textContent = new Date(user.created_at).toLocaleDateString();
        document.getElementById('sessionUsername').textContent = user.username;
        document.getElementById('settingsApiKey').textContent = '••••••••••••••••';
        document.getElementById('settingsApiKey').dataset.key = user.api_key;

        // Show Users, Groups, Email, and APNS tabs if user is admin
        if (user.is_admin) {
            document.getElementById('usersTab').style.display = 'block';
            document.getElementById('groupsTab').style.display = 'block';
            document.getElementById('emailTab').style.display = 'block';
            document.getElementById('apnsTab').style.display = 'block';
        }

        // Load monitoring settings from localStorage
        loadMonitoringSettings();

        // Update theme button states
        updateThemeButtonStates();
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function loadMonitoringSettings() {
    try {
        const data = await apiRequest('/monitoring-settings');
        const settings = data.settings;

        // Set default check interval
        document.getElementById('defaultCheckInterval').value = settings.default_check_interval || 60;

        // Set default timeout
        document.getElementById('defaultTimeout').value = settings.default_timeout || 30;

        // Set retention period
        document.getElementById('retentionPeriod').value = settings.retention_period || 30;

        // Set notification preferences
        document.getElementById('notifyOnDown').checked = settings.notify_on_down !== false;
        document.getElementById('notifyOnUp').checked = settings.notify_on_up !== false;
    } catch (error) {
        console.error('Failed to load monitoring settings:', error);
    }
}

async function saveMonitoringSettings() {
    try {
        const settings = {
            default_check_interval: parseInt(document.getElementById('defaultCheckInterval').value),
            default_timeout: parseInt(document.getElementById('defaultTimeout').value),
            retention_period: parseInt(document.getElementById('retentionPeriod').value),
            notify_on_down: document.getElementById('notifyOnDown').checked,
            notify_on_up: document.getElementById('notifyOnUp').checked
        };

        await apiRequest('/monitoring-settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });

        // Show a subtle toast notification
        showToast('Settings Saved', 'Monitoring preferences updated', 'success');
    } catch (error) {
        console.error('Failed to save monitoring settings:', error);
        showToast('Save Failed', error.message, 'error');
    }
}

async function getMonitoringDefaults() {
    try {
        const data = await apiRequest('/monitoring-settings');
        const settings = data.settings;
        return {
            checkInterval: parseInt(settings.default_check_interval) || 60,
            timeout: parseInt(settings.default_timeout) || 30,
            notifyOnDown: settings.notify_on_down !== false,
            notifyOnUp: settings.notify_on_up !== false
        };
    } catch (error) {
        console.error('Failed to get monitoring defaults:', error);
        return {
            checkInterval: 60,
            timeout: 30,
            notifyOnDown: true,
            notifyOnUp: true
        };
    }
}

function showSettingsTab(tabName, e) {
    // Update tab buttons
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    // Find and activate the clicked tab or the tab for this name
    if (e && e.target) {
        e.target.classList.add('active');
    } else {
        const tab = document.querySelector(`.settings-tab[onclick*="${tabName}"]`);
        if (tab) {
            tab.classList.add('active');
        }
    }

    // Update tab content
    document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}Settings`).classList.add('active');

    // Load data when specific tabs are shown
    if (tabName === 'users') {
        loadUsers();
    } else if (tabName === 'groups') {
        loadGroups();
    } else if (tabName === 'email') {
        loadEmailSettings();
    } else if (tabName === 'apns') {
        loadApnsSettings();
    }
}

// ============================================
// MONITORS RENDERING
// ============================================
function renderMonitors() {
    const container = document.getElementById('monitorsList');

    if (monitors.length === 0) {
        container.innerHTML = '<div class="loading">No monitors yet. Click "Add Monitor" to get started.</div>';
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
                    <button class="btn-icon" onclick="editMonitor(${monitor.id})" title="Edit">✏️</button>
                    <button class="btn-icon danger" onclick="showDeleteModal('monitor', ${monitor.id}, '${escapeHtml(monitor.name)}')" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

function updateStats() {
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
function updateTagFilter() {
    const tagFilter = document.getElementById('tagFilter');
    if (!tagFilter) return;

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

function filterMonitors() {
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

function renderFilteredMonitors(filteredMonitors) {
    const container = document.getElementById('monitorsList');

    if (filteredMonitors.length === 0) {
        container.innerHTML = '<div class="loading">No monitors match your filters.</div>';
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
                    <button class="btn-icon" onclick="editMonitor(${monitor.id})" title="Edit">✏️</button>
                    <button class="btn-icon danger" onclick="showDeleteModal('monitor', ${monitor.id}, '${escapeHtml(monitor.name)}')" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// TAGS RENDERING
// ============================================
function renderTags() {
    const container = document.getElementById('tagsList');

    if (tags.length === 0) {
        container.innerHTML = '<div class="loading">No tags yet. Click "Add Tag" to create one.</div>';
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
                <button class="btn-icon" onclick="editTag(${tag.id})" title="Edit">✏️</button>
                <button class="btn-icon danger" onclick="showDeleteModal('tag', ${tag.id}, '${escapeHtml(tag.name)}')" title="Delete">🗑️</button>
            </div>
        </div>
    `).join('');
}

// ============================================
// TAGS SELECTOR FOR MONITORS
// ============================================
function renderTagsSelector(selectedTagIds = []) {
    const container = document.getElementById('monitorTags');

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
// MONITOR CRUD
// ============================================
function showAddMonitorModal() {
    document.getElementById('modalTitle').textContent = 'Add Monitor';
    document.getElementById('monitorId').value = '';
    document.getElementById('monitorForm').reset();
    renderTagsSelector();
    updateMonitorFields();
    document.getElementById('monitorModal').classList.add('active');
}

async function editMonitor(id) {
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

async function handleMonitorSubmit(e) {
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

function updateMonitorFields() {
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

function closeMonitorModal() {
    document.getElementById('monitorModal').classList.remove('active');
    document.getElementById('monitorForm').reset();
    document.getElementById('monitorFormError').textContent = '';
}

// ============================================
// TAG CRUD
// ============================================
// SF Symbol name to Unicode/emoji mapping
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

function renderSymbolPicker(selectedSymbol = 'tag.fill') {
    const container = document.getElementById('symbolPicker');
    container.innerHTML = Object.entries(symbolMap).map(([key, emoji]) => `
        <div class="symbol-option ${key === selectedSymbol ? 'selected' : ''}"
             data-symbol="${key}"
             onclick="selectSymbol('${key}')"
             title="${key}">
            ${emoji}
        </div>
    `).join('');
}

function selectSymbol(symbol) {
    document.getElementById('tagSymbol').value = symbol;
    document.querySelectorAll('.symbol-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.symbol === symbol);
    });
}

function showAddTagModal() {
    document.getElementById('tagModalTitle').textContent = 'Add Tag';
    document.getElementById('tagId').value = '';
    document.getElementById('tagForm').reset();
    document.getElementById('tagColor').value = '#3B82F6';
    document.getElementById('tagColorText').value = '#3B82F6';
    document.getElementById('tagSymbol').value = 'tag.fill';
    renderSymbolPicker('tag.fill');
    document.getElementById('tagModal').classList.add('active');
}

async function editTag(id) {
    try {
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

async function handleTagSubmit(e) {
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

function closeTagModal() {
    document.getElementById('tagModal').classList.remove('active');
    document.getElementById('tagForm').reset();
    document.getElementById('tagFormError').textContent = '';
}

// ============================================
// DELETE MODAL
// ============================================
function showDeleteModal(type, id, name) {
    deleteTarget = { type, id };
    document.getElementById('deleteModalTitle').textContent = `Delete ${type.charAt(0).toUpperCase() + type.slice(1)}`;
    document.getElementById('deleteModalMessage').textContent = `Are you sure you want to delete "${name}"?`;
    document.getElementById('deleteModal').classList.add('active');
}

async function confirmDelete() {
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
            loadTags();
        }
    } catch (error) {
        showToast('Deletion Failed', `Failed to delete: ${error.message}`, 'error');
    }
}

function closeDeleteModal() {
    document.getElementById('deleteModal').classList.remove('active');
    deleteTarget = null;
}

// ============================================
// SETTINGS FUNCTIONS
// ============================================
function toggleApiKeyVisibility() {
    const apiKeyDisplay = document.getElementById('settingsApiKey');
    apiKeyVisible = !apiKeyVisible;

    if (apiKeyVisible) {
        apiKeyDisplay.textContent = apiKeyDisplay.dataset.key;
        event.target.textContent = '👁️‍🗨️ Hide';
    } else {
        apiKeyDisplay.textContent = '••••••••••••••••';
        event.target.textContent = '👁️ Show';
    }
}

function copyAPIKey() {
    const apiKey = document.getElementById('settingsApiKey').dataset.key;
    navigator.clipboard.writeText(apiKey).then(() => {
        const btn = event.target;
        const originalText = btn.textContent;
        btn.textContent = '✅ Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 2000);
    });
}

async function regenerateAPIKey() {
    showConfirm(
        'Regenerate API Key?',
        'Your old API key will stop working immediately and you\'ll need to update your iOS app.',
        async () => {
            try {
                const data = await apiRequest('/auth/regenerate-api-key', { method: 'POST' });

                currentUser.apiKey = data.apiKey;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));

                document.getElementById('settingsApiKey').dataset.key = data.apiKey;

                if (apiKeyVisible) {
                    document.getElementById('settingsApiKey').textContent = data.apiKey;
                }

                showToast('API Key Regenerated', 'Make sure to update your iOS app with the new key.', 'success');
            } catch (error) {
                showToast('Regeneration Failed', `Failed to regenerate API key: ${error.message}`, 'error');
            }
        }
    );
}

function showChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('active');
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordError').textContent = '';
    document.getElementById('changePasswordSuccess').textContent = '';
}

function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.remove('active');
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordError').textContent = '';
    document.getElementById('changePasswordSuccess').textContent = '';
}

async function handleChangePassword(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('currentPasswordChange').value;
    const newPassword = document.getElementById('newPasswordChange').value;
    const confirmPassword = document.getElementById('confirmPasswordChange').value;
    const errorDiv = document.getElementById('changePasswordError');
    const successDiv = document.getElementById('changePasswordSuccess');

    errorDiv.textContent = '';
    successDiv.textContent = '';

    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }

    if (newPassword.length < 8) {
        errorDiv.textContent = 'Password must be at least 8 characters';
        return;
    }

    if (!/[A-Z]/.test(newPassword)) {
        errorDiv.textContent = 'Password must contain at least one uppercase letter';
        return;
    }

    if (!/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
        errorDiv.textContent = 'Password must contain at least one number or symbol';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to change password');
        }

        successDiv.textContent = 'Password changed successfully!';
        document.getElementById('changePasswordForm').reset();

        // Close modal after 2 seconds
        setTimeout(() => {
            closeChangePasswordModal();
            showToast('Success', 'Your password has been changed successfully', 'success');
        }, 2000);
    } catch (error) {
        if (error.message.includes('invalid token') || error.message.includes('Invalid token')) {
            errorDiv.textContent = 'Your session has expired. Please log out and log back in.';
        } else {
            errorDiv.textContent = error.message;
        }
    }
}

function confirmDeleteAccount() {
    // Create a password prompt modal
    const modalHtml = `
        <div id="deleteAccountConfirmModal" class="modal active">
            <div class="modal-overlay"></div>
            <div class="modal-container modal-small">
                <div class="modal-header" style="background: var(--error); color: white;">
                    <h2>⚠️ Delete Account</h2>
                </div>
                <div class="modal-body">
                    <p style="color: var(--error); font-weight: 600; margin-bottom: var(--space-4);">
                        This will permanently delete your account and all associated data. This action cannot be undone!
                    </p>
                    <p style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-5);">
                        Please enter your password to confirm account deletion:
                    </p>
                    <div class="input-group">
                        <label for="deleteAccountPassword">Password</label>
                        <input type="password" id="deleteAccountPassword" required placeholder="Enter your password">
                    </div>
                    <div id="deleteAccountError" class="error-message"></div>
                </div>
                <div class="modal-footer">
                    <button class="btn-secondary" onclick="closeDeleteAccountModal()">Cancel</button>
                    <button class="btn-danger" onclick="executeDeleteAccount()">Delete My Account</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeDeleteAccountModal() {
    const modal = document.getElementById('deleteAccountConfirmModal');
    if (modal) {
        modal.remove();
    }
}

async function executeDeleteAccount() {
    const password = document.getElementById('deleteAccountPassword').value;
    const errorDiv = document.getElementById('deleteAccountError');

    errorDiv.textContent = '';

    if (!password) {
        errorDiv.textContent = 'Password is required';
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/auth/account`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to delete account');
        }

        // Account deleted successfully - log out
        closeDeleteAccountModal();
        showToast('Account Deleted', 'Your account has been permanently deleted', 'success');

        // Log out after 2 seconds
        setTimeout(() => {
            logout();
        }, 2000);
    } catch (error) {
        if (error.message.includes('invalid token') || error.message.includes('Invalid token')) {
            errorDiv.textContent = 'Your session has expired. Please log out and log back in.';
        } else {
            errorDiv.textContent = error.message;
        }
    }
}

function confirmClearAllData() {
    showConfirm(
        'Clear All Monitoring Data?',
        'This will delete ALL monitors and check history. This action cannot be undone!',
        () => {
            showConfirm(
                'Final Warning',
                'This will permanently delete all your monitors and their history. Are you absolutely sure?',
                async () => {
                    try {
                        const response = await fetch(`${API_BASE}/monitors/clear-all`, {
                            method: 'DELETE',
                            headers: {
                                'Authorization': `Bearer ${authToken}`
                            }
                        });

                        const data = await response.json();

                        if (!response.ok) {
                            console.error('Clear all data error:', data);
                            throw new Error(data.error || 'Failed to clear data');
                        }

                        showToast('Data Cleared', data.message, 'success');

                        // Reload monitors to show empty state
                        await loadMonitors();
                    } catch (error) {
                        console.error('Clear all data exception:', error);
                        showToast('Clear Failed', error.message, 'error');
                    }
                }
            );
        }
    );
}

// ============================================
// THEME TOGGLE
// ============================================
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.toggle('dark-theme');

    // Save preference
    localStorage.setItem('theme', isDark ? 'dark' : 'light');

    // Update icon
    updateThemeIcon();
    updateThemeButtonStates();
}

function setTheme(theme) {
    const body = document.body;

    if (theme === 'dark') {
        body.classList.add('dark-theme');
    } else {
        body.classList.remove('dark-theme');
    }

    // Save preference
    localStorage.setItem('theme', theme);

    // Update icon and button states
    updateThemeIcon();
    updateThemeButtonStates();
}

function updateThemeIcon() {
    const themeIcon = document.querySelector('.theme-icon');
    const isDark = document.body.classList.contains('dark-theme');

    if (themeIcon) {
        themeIcon.textContent = isDark ? '☀️' : '🌙';
    }
}

function updateThemeButtonStates() {
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

// ============================================
// FORCE PASSWORD CHANGE
// ============================================
function showForcePasswordChangeModal(requireUsernameChange = false) {
    document.getElementById('loginScreen').classList.remove('active');
    document.getElementById('forcePasswordChangeModal').classList.add('active');
    document.getElementById('forcePasswordChangeForm').reset();
    document.getElementById('forcePasswordChangeError').textContent = '';

    // Show username field if username change is required
    const usernameGroup = document.getElementById('forceUsernameGroup');
    const usernameInput = document.getElementById('forceNewUsername');

    if (requireUsernameChange) {
        usernameGroup.style.display = 'block';
        usernameInput.required = true;
        document.getElementById('forceChangeMessage').textContent =
            'For security reasons, you must change your username, update your email, and change your password before continuing.';
    } else {
        usernameGroup.style.display = 'none';
        usernameInput.required = false;
        document.getElementById('forceChangeMessage').textContent =
            'For security reasons, you must change your password and update your email before continuing.';
    }
}

async function handleForcePasswordChange(e) {
    e.preventDefault();
    const currentPassword = document.getElementById('forceCurrentPassword').value;
    const newPassword = document.getElementById('forceNewPassword').value;
    const confirmPassword = document.getElementById('forceConfirmPassword').value;
    const newEmail = document.getElementById('forceNewEmail').value;
    const newUsername = document.getElementById('forceNewUsername').value;
    const errorDiv = document.getElementById('forcePasswordChangeError');

    errorDiv.textContent = '';

    // Validate username if it's being changed
    if (document.getElementById('forceUsernameGroup').style.display !== 'none') {
        if (!newUsername || newUsername.length < 3) {
            errorDiv.textContent = 'Username must be at least 3 characters';
            return;
        }
        if (newUsername === 'admin') {
            errorDiv.textContent = 'Please choose a different username for security';
            return;
        }
    }

    // Validate email
    if (!newEmail || !newEmail.includes('@')) {
        errorDiv.textContent = 'Please provide a valid email address';
        return;
    }

    // Validate password strength
    const passwordValidation = validatePasswordStrength(newPassword);
    if (!passwordValidation.valid) {
        errorDiv.textContent = passwordValidation.message;
        return;
    }

    if (newPassword !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }

    try {
        const requestBody = { currentPassword, newPassword, newEmail };

        // Only include username if it's being changed
        if (document.getElementById('forceUsernameGroup').style.display !== 'none' && newUsername) {
            requestBody.newUsername = newUsername;
        }

        const response = await fetch(`${API_BASE}/auth/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update account');
        }

        // Update local user object
        currentUser.forcePasswordReset = false;
        currentUser.forceUsernameChange = false;
        if (newUsername) {
            currentUser.username = newUsername;
        }
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // Close modal and show dashboard
        document.getElementById('forcePasswordChangeModal').classList.remove('active');
        showDashboard();

        // Show appropriate success message
        const message = newUsername
            ? 'Your username, email, and password have been successfully updated. Welcome!'
            : 'Your password and email have been successfully updated. Welcome!';
        showToast('Account Updated', message, 'success');
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

function validateForceNewPassword() {
    const password = document.getElementById('forceNewPassword').value;
    const requirementsEl = document.getElementById('forcePasswordRequirements');

    if (password.length === 0) {
        requirementsEl.style.color = 'var(--text-secondary)';
        requirementsEl.textContent = 'Must contain: 8+ characters, 1 uppercase letter, 1 number or symbol';
        return;
    }

    const validation = validatePasswordStrength(password);

    if (validation.valid) {
        requirementsEl.style.color = 'var(--success)';
        requirementsEl.textContent = '✓ Password meets all requirements';
    } else {
        requirementsEl.style.color = 'var(--error)';
        requirementsEl.textContent = '✗ ' + validation.message;
    }

    checkForcePasswordMatch();
}

function checkForcePasswordMatch() {
    const password = document.getElementById('forceNewPassword').value;
    const confirmPassword = document.getElementById('forceConfirmPassword').value;
    const messageEl = document.getElementById('forcePasswordMatchMessage');

    if (confirmPassword.length === 0) {
        messageEl.style.display = 'none';
        return;
    }

    messageEl.style.display = 'block';

    if (password === confirmPassword) {
        messageEl.style.color = 'var(--success)';
        messageEl.textContent = '✓ Passwords match';
    } else {
        messageEl.style.color = 'var(--error)';
        messageEl.textContent = '✗ Passwords do not match';
    }
}

// Change Password Modal Validation
function validateChangePassword() {
    const password = document.getElementById('newPasswordChange').value;
    const requirementsEl = document.getElementById('changePasswordRequirements');

    if (password.length === 0) {
        requirementsEl.style.color = 'var(--text-secondary)';
        requirementsEl.textContent = 'Must contain: 8+ characters, 1 uppercase letter, 1 number or symbol';
        return;
    }

    const validation = validatePasswordStrength(password);

    if (validation.valid) {
        requirementsEl.style.color = 'var(--success)';
        requirementsEl.textContent = '✓ Password meets all requirements';
    } else {
        requirementsEl.style.color = 'var(--error)';
        requirementsEl.textContent = '✗ ' + validation.message;
    }

    checkChangePasswordMatch();
}

function checkChangePasswordMatch() {
    const password = document.getElementById('newPasswordChange').value;
    const confirmPassword = document.getElementById('confirmPasswordChange').value;
    const messageEl = document.getElementById('changePasswordMatchMessage');

    if (confirmPassword.length === 0) {
        messageEl.style.display = 'none';
        return;
    }

    messageEl.style.display = 'block';

    if (password === confirmPassword) {
        messageEl.style.color = 'var(--success)';
        messageEl.textContent = '✓ Passwords match';
    } else {
        messageEl.style.color = 'var(--error)';
        messageEl.textContent = '✗ Passwords do not match';
    }
}

// Reset Password Modal Validation
function validateResetPassword() {
    const password = document.getElementById('resetNewPassword').value;
    const requirementsEl = document.getElementById('resetPasswordRequirements');

    if (password.length === 0) {
        requirementsEl.style.color = 'var(--text-secondary)';
        requirementsEl.textContent = 'Must contain: 8+ characters, 1 uppercase letter, 1 number or symbol';
        return;
    }

    const validation = validatePasswordStrength(password);

    if (validation.valid) {
        requirementsEl.style.color = 'var(--success)';
        requirementsEl.textContent = '✓ Password meets all requirements';
    } else {
        requirementsEl.style.color = 'var(--error)';
        requirementsEl.textContent = '✗ ' + validation.message;
    }

    checkResetPasswordMatch();
}

function checkResetPasswordMatch() {
    const password = document.getElementById('resetNewPassword').value;
    const confirmPassword = document.getElementById('resetConfirmPassword').value;
    const messageEl = document.getElementById('resetPasswordMatchMessage');

    if (confirmPassword.length === 0) {
        messageEl.style.display = 'none';
        return;
    }

    messageEl.style.display = 'block';

    if (password === confirmPassword) {
        messageEl.style.color = 'var(--success)';
        messageEl.textContent = '✓ Passwords match';
    } else {
        messageEl.style.color = 'var(--error)';
        messageEl.textContent = '✗ Passwords do not match';
    }
}

// ============================================
// USER MANAGEMENT (ADMIN ONLY)
// ============================================
async function loadUsers() {
    try {
        const data = await apiRequest('/users/admin/all');
        const usersList = document.getElementById('usersList');

        if (!data.users || data.users.length === 0) {
            usersList.innerHTML = '<div style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">No users found</div>';
            return;
        }

        usersList.innerHTML = data.users.map(user => `
            <div style="padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: var(--space-3); transition: all 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
                            <h4 style="font-size: var(--text-base); font-weight: 600; margin: 0;">${escapeHtml(user.username)}</h4>
                            ${user.is_admin ? '<span style="background: var(--primary); color: white; font-size: var(--text-xs); padding: 2px 8px; border-radius: var(--radius-sm);">Admin</span>' : ''}
                        </div>
                        <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-1);">
                            📧 ${escapeHtml(user.email || 'No email')}
                        </div>
                        <div style="color: var(--text-tertiary); font-size: var(--text-xs);">
                            Created: ${new Date(user.created_at).toLocaleDateString()}
                        </div>
                    </div>
                    <div style="display: flex; gap: var(--space-2);">
                        <button onclick="showEditUserModal(${user.id})" class="btn-secondary" style="padding: var(--space-2) var(--space-3); font-size: var(--text-sm);">
                            Edit
                        </button>
                        ${user.id !== currentUser.id ? `
                            <button onclick="deleteUser(${user.id}, '${escapeHtml(user.username)}')" class="btn-danger" style="padding: var(--space-2) var(--space-3); font-size: var(--text-sm);">
                                Delete
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        showToast('Load Failed', error.message, 'error');
    }
}

function showCreateUserModal() {
    const modalHtml = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="this.remove()">
            <div style="background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-lg); max-width: 500px; width: 90%; padding: var(--space-6);" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                    <h2 style="font-size: var(--text-xl); font-weight: 600;">Create New User</h2>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                </div>

                <form onsubmit="handleCreateUser(event)" style="display: flex; flex-direction: column; gap: var(--space-4);">
                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Username *</label>
                        <input type="text" id="createUsername" required minlength="3" placeholder="Enter username" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Email *</label>
                        <input type="email" id="createEmail" required placeholder="user@example.com" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Password *</label>
                        <input type="password" id="createPassword" required minlength="8" placeholder="At least 8 characters" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                        <small style="color: var(--text-secondary); font-size: var(--text-xs); display: block; margin-top: var(--space-1);">
                            Must contain: 8+ characters, 1 uppercase, 1 number/symbol
                        </small>
                    </div>

                    <div style="display: flex; align-items: center; gap: var(--space-2);">
                        <input type="checkbox" id="createIsAdmin" style="width: 16px; height: 16px;">
                        <label for="createIsAdmin" style="font-weight: 500; cursor: pointer;">Administrator</label>
                    </div>

                    <div style="display: flex; align-items: center; gap: var(--space-2);">
                        <input type="checkbox" id="createForcePasswordReset" checked style="width: 16px; height: 16px;">
                        <label for="createForcePasswordReset" style="font-weight: 500; cursor: pointer;">Force password change on first login</label>
                    </div>

                    <div id="createUserError" class="error-message"></div>

                    <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
                        <button type="button" onclick="this.closest('[style*=fixed]').remove()" class="btn-secondary">Cancel</button>
                        <button type="submit" class="btn-primary">Create User</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function handleCreateUser(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('createUserError');
    errorDiv.textContent = '';

    const username = document.getElementById('createUsername').value;
    const email = document.getElementById('createEmail').value;
    const password = document.getElementById('createPassword').value;
    const isAdmin = document.getElementById('createIsAdmin').checked;
    const forcePasswordReset = document.getElementById('createForcePasswordReset').checked;

    try {
        await apiRequest('/users/admin/create', {
            method: 'POST',
            body: JSON.stringify({
                username,
                email,
                password,
                isAdmin,
                forcePasswordReset
            })
        });

        showToast('User Created', `${username} has been created successfully.`, 'success');
        document.querySelector('[style*="position: fixed"]').remove();
        loadUsers();
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

async function showEditUserModal(userId) {
    try {
        const data = await apiRequest(`/users/admin/${userId}`);
        const user = data.user;

        const modalHtml = `
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="this.remove()">
                <div style="background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-lg); max-width: 500px; width: 90%; padding: var(--space-6);" onclick="event.stopPropagation()">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                        <h2 style="font-size: var(--text-xl); font-weight: 600;">Edit User</h2>
                        <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                    </div>

                    <form onsubmit="handleEditUser(event, ${userId})" style="display: flex; flex-direction: column; gap: var(--space-4);">
                        <div>
                            <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Username</label>
                            <input type="text" id="editUsername" required minlength="3" value="${escapeHtml(user.username)}" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                        </div>

                        <div>
                            <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Email</label>
                            <input type="email" id="editEmail" required value="${escapeHtml(user.email || '')}" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                        </div>

                        <div>
                            <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">New Password (leave empty to keep current)</label>
                            <input type="password" id="editPassword" minlength="8" placeholder="Enter new password" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                            <small style="color: var(--text-secondary); font-size: var(--text-xs); display: block; margin-top: var(--space-1);">
                                Leave blank to keep existing password
                            </small>
                        </div>

                        <div style="display: flex; align-items: center; gap: var(--space-2);">
                            <input type="checkbox" id="editIsAdmin" ${user.is_admin ? 'checked' : ''} style="width: 16px; height: 16px;">
                            <label for="editIsAdmin" style="font-weight: 500; cursor: pointer;">Administrator</label>
                        </div>

                        <div style="display: flex; align-items: center; gap: var(--space-2);">
                            <input type="checkbox" id="editForcePasswordReset" ${user.force_password_reset ? 'checked' : ''} style="width: 16px; height: 16px;">
                            <label for="editForcePasswordReset" style="font-weight: 500; cursor: pointer;">Force password change on next login</label>
                        </div>

                        <div id="editUserError" class="error-message"></div>

                        <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
                            <button type="button" onclick="this.closest('[style*=fixed]').remove()" class="btn-secondary">Cancel</button>
                            <button type="submit" class="btn-primary">Save Changes</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    } catch (error) {
        showToast('Load Failed', error.message, 'error');
    }
}

async function handleEditUser(e, userId) {
    e.preventDefault();
    const errorDiv = document.getElementById('editUserError');
    errorDiv.textContent = '';

    const username = document.getElementById('editUsername').value;
    const email = document.getElementById('editEmail').value;
    const password = document.getElementById('editPassword').value;
    const isAdmin = document.getElementById('editIsAdmin').checked;
    const forcePasswordReset = document.getElementById('editForcePasswordReset').checked;

    try {
        const body = {
            username,
            email,
            isAdmin,
            forcePasswordReset
        };

        // Only include password if it was changed
        if (password) {
            body.password = password;
        }

        await apiRequest(`/users/admin/${userId}`, {
            method: 'PUT',
            body: JSON.stringify(body)
        });

        showToast('User Updated', `${username} has been updated successfully.`, 'success');
        document.querySelector('[style*="position: fixed"]').remove();
        loadUsers();
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

async function deleteUser(userId, username) {
    showConfirm(
        'Delete User',
        `Are you sure you want to delete ${username}? This action cannot be undone.`,
        async () => {
            try {
                await apiRequest(`/users/admin/${userId}`, {
                    method: 'DELETE'
                });

                showToast('User Deleted', `${username} has been deleted successfully.`, 'success');
                loadUsers();
            } catch (error) {
                showToast('Deletion Failed', error.message, 'error');
            }
        }
    );
}

// ============================================
// GROUPS MANAGEMENT (ADMIN ONLY)
// ============================================
async function loadGroups() {
    try {
        const data = await apiRequest('/groups/admin/all');
        renderGroups(data.groups);
    } catch (error) {
        console.error('Failed to load groups:', error);
        document.getElementById('groupsList').innerHTML = '<div class="error-message">Failed to load groups</div>';
    }
}

function renderGroups(groups) {
    const listEl = document.getElementById('groupsList');

    if (groups.length === 0) {
        listEl.innerHTML = '<div style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">No groups found</div>';
        return;
    }

    listEl.innerHTML = groups.map(group => `
        <div class="group-item" style="padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: var(--space-3); cursor: pointer;" onclick="showGroupDetails(${group.id})">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 600; font-size: var(--text-base); margin-bottom: var(--space-1);">${escapeHtml(group.name)}</div>
                    <div style="font-size: var(--text-sm); color: var(--text-secondary);">
                        ${group.member_count} member${group.member_count !== 1 ? 's' : ''}
                        ${group.description ? ` • ${escapeHtml(group.description)}` : ''}
                    </div>
                </div>
                <div style="display: flex; gap: var(--space-2);">
                    ${group.id > 2 ? `
                        <button class="btn-secondary" onclick="event.stopPropagation(); showEditGroupModal(${group.id}, '${escapeHtml(group.name)}', '${escapeHtml(group.description || '')}')" style="padding: var(--space-2) var(--space-3); font-size: var(--text-sm);">Edit</button>
                        <button class="btn-danger" onclick="event.stopPropagation(); deleteGroup(${group.id}, '${escapeHtml(group.name)}')" style="padding: var(--space-2) var(--space-3); font-size: var(--text-sm);">Delete</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

function showAddGroupModal() {
    const modalHtml = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="this.remove()">
            <div style="background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-lg); max-width: 500px; width: 90%; padding: var(--space-6);" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                    <h2 style="font-size: var(--text-xl); font-weight: 600;">Create New Group</h2>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                </div>

                <form onsubmit="handleCreateGroup(event)" style="display: flex; flex-direction: column; gap: var(--space-4);">
                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Group Name *</label>
                        <input type="text" id="createGroupName" required placeholder="Enter group name" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Description</label>
                        <textarea id="createGroupDescription" rows="3" placeholder="Enter group description (optional)" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary); resize: vertical;"></textarea>
                    </div>

                    <div id="createGroupError" class="error-message"></div>

                    <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
                        <button type="button" onclick="this.closest('[style*=fixed]').remove()" class="btn-secondary">Cancel</button>
                        <button type="submit" class="btn-primary">Create Group</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('createGroupName').focus();
}

async function handleCreateGroup(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('createGroupError');
    errorDiv.textContent = '';

    const name = document.getElementById('createGroupName').value;
    const description = document.getElementById('createGroupDescription').value;

    try {
        await apiRequest('/groups', {
            method: 'POST',
            body: JSON.stringify({ name, description })
        });

        showToast('Group Created', `${name} has been created successfully.`, 'success');
        document.querySelector('[style*="position: fixed"]').remove();
        loadGroups();
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

function showEditGroupModal(id, name, description) {
    const modalHtml = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="this.remove()">
            <div style="background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-lg); max-width: 500px; width: 90%; padding: var(--space-6);" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                    <h2 style="font-size: var(--text-xl); font-weight: 600;">Edit Group</h2>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                </div>

                <form onsubmit="handleEditGroup(event, ${id})" style="display: flex; flex-direction: column; gap: var(--space-4);">
                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Group Name *</label>
                        <input type="text" id="editGroupName" required value="${escapeHtml(name)}" placeholder="Enter group name" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Description</label>
                        <textarea id="editGroupDescription" rows="3" placeholder="Enter group description (optional)" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary); resize: vertical;">${escapeHtml(description || '')}</textarea>
                    </div>

                    <div id="editGroupError" class="error-message"></div>

                    <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
                        <button type="button" onclick="this.closest('[style*=fixed]').remove()" class="btn-secondary">Cancel</button>
                        <button type="submit" class="btn-primary">Save Changes</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('editGroupName').focus();
}

async function handleEditGroup(e, id) {
    e.preventDefault();
    const errorDiv = document.getElementById('editGroupError');
    errorDiv.textContent = '';

    const name = document.getElementById('editGroupName').value;
    const description = document.getElementById('editGroupDescription').value;

    updateGroup(id, name, description);
    document.querySelector('[style*="position: fixed"]').remove();
}

async function updateGroup(id, name, description) {
    try {
        await apiRequest(`/groups/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name, description })
        });

        showToast('Group Updated', `${name} has been updated successfully.`, 'success');
        loadGroups();
    } catch (error) {
        showToast('Update Failed', error.message, 'error');
    }
}

async function deleteGroup(id, name) {
    showConfirm(
        'Delete Group',
        `Are you sure you want to delete "${name}"? This action cannot be undone.`,
        async () => {
            try {
                await apiRequest(`/groups/${id}`, {
                    method: 'DELETE'
                });

                showToast('Group Deleted', `${name} has been deleted successfully.`, 'success');
                loadGroups();
            } catch (error) {
                showToast('Deletion Failed', error.message, 'error');
            }
        }
    );
}

async function showGroupDetails(groupId) {
    try {
        const [membersData, usersData] = await Promise.all([
            apiRequest(`/groups/admin/${groupId}/members`),
            apiRequest('/groups/admin/users')
        ]);

        const members = membersData.members;
        const allUsers = usersData.users;

        // Filter out users already in the group
        const memberIds = new Set(members.map(m => m.id));
        const availableUsers = allUsers.filter(u => !memberIds.has(u.id));

        const modalHtml = `
            <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="this.remove()">
                <div style="background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-lg); max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; padding: var(--space-6);" onclick="event.stopPropagation()">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                        <h2 style="font-size: var(--text-xl); font-weight: 600;">Group Members</h2>
                        <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                    </div>

                    <div style="margin-bottom: var(--space-5);">
                        <h3 style="font-size: var(--text-base); font-weight: 600; margin-bottom: var(--space-3);">Add User to Group</h3>
                        <div style="position: relative;">
                            <input
                                type="text"
                                id="userSearchInput"
                                placeholder="Search users by name or email..."
                                autocomplete="off"
                                style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary); margin-bottom: var(--space-2);"
                            />
                            <div id="userSearchResults" style="display: none; position: absolute; top: calc(100% - var(--space-2)); left: 0; right: 0; background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-md); max-height: 300px; overflow-y: auto; z-index: 10001; box-shadow: 0 4px 6px rgba(0,0,0,0.1); margin-top: -8px;"></div>
                            <input type="hidden" id="selectedUserId" value="" />
                            <div id="selectedUserDisplay" style="display: none; padding: var(--space-3); border: 1px solid var(--success); border-radius: var(--radius-md); background: var(--success-bg, rgba(34, 197, 94, 0.1)); margin-bottom: var(--space-2);">
                                <div style="display: flex; justify-content: space-between; align-items: center;">
                                    <div>
                                        <div style="font-weight: 500;" id="selectedUserName"></div>
                                        <div style="font-size: var(--text-sm); color: var(--text-secondary);" id="selectedUserEmail"></div>
                                    </div>
                                    <button onclick="clearUserSelection()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-secondary);">×</button>
                                </div>
                            </div>
                            <button onclick="assignUserToGroup(${groupId})" class="btn-secondary" style="width: 100%; padding: var(--space-2) var(--space-4);">Add User</button>
                        </div>
                    </div>

                    <div>
                        <h3 style="font-size: var(--text-base); font-weight: 600; margin-bottom: var(--space-3);">Current Members</h3>
                        ${members.length === 0 ? '<div style="text-align: center; padding: var(--space-4); color: var(--text-secondary);">No members</div>' : ''}
                        ${members.map(member => `
                            <div style="display: flex; justify-content: space-between; align-items: center; padding: var(--space-3); border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: var(--space-2);">
                                <div>
                                    <div style="font-weight: 500;">${escapeHtml(member.username)}</div>
                                    <div style="font-size: var(--text-sm); color: var(--text-secondary);">${escapeHtml(member.email)} • ${member.role}</div>
                                </div>
                                ${groupId !== 1 || !member.is_admin ? `
                                    <button onclick="removeUserFromGroup(${groupId}, ${member.id}, '${escapeHtml(member.username)}')" class="btn-danger" style="padding: var(--space-1) var(--space-3); font-size: var(--text-sm);">Remove</button>
                                ` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Set up user search functionality after modal is inserted
        setupUserSearch(availableUsers);
    } catch (error) {
        showToast('Load Failed', error.message, 'error');
    }
}

// User search functionality
function setupUserSearch(availableUsers) {
    console.log('Setting up user search with', availableUsers.length, 'users');

    const searchInput = document.getElementById('userSearchInput');
    const resultsDiv = document.getElementById('userSearchResults');

    if (!searchInput || !resultsDiv) {
        console.error('Search elements not found');
        return;
    }

    console.log('Search elements found, attaching listeners');

    function filterUsers() {
        const searchTerm = searchInput.value.toLowerCase().trim();
        console.log('Searching for:', searchTerm);

        if (!searchTerm) {
            resultsDiv.style.display = 'none';
            return;
        }

        const filtered = availableUsers.filter(u =>
            u.username.toLowerCase().includes(searchTerm) ||
            u.email.toLowerCase().includes(searchTerm)
        );

        console.log('Filtered results:', filtered.length);

        if (filtered.length === 0) {
            resultsDiv.innerHTML = '<div style="padding: var(--space-3); text-align: center; color: var(--text-secondary);">No users found</div>';
            resultsDiv.style.display = 'block';
            return;
        }

        resultsDiv.innerHTML = '';
        filtered.forEach(u => {
            const div = document.createElement('div');
            div.className = 'user-search-result';
            div.style.cssText = 'padding: var(--space-3); cursor: pointer; border-bottom: 1px solid var(--border); transition: background 0.2s;';

            const nameDiv = document.createElement('div');
            nameDiv.style.fontWeight = '500';
            nameDiv.textContent = u.username;

            const emailDiv = document.createElement('div');
            emailDiv.style.cssText = 'font-size: var(--text-sm); color: var(--text-secondary);';
            emailDiv.textContent = u.email;

            div.appendChild(nameDiv);
            div.appendChild(emailDiv);

            div.addEventListener('mouseover', function() {
                this.style.background = 'var(--hover)';
            });
            div.addEventListener('mouseout', function() {
                this.style.background = 'transparent';
            });
            div.addEventListener('click', function() {
                console.log('User clicked:', u.username);
                selectUser(u.id, u.username, u.email);
            });

            resultsDiv.appendChild(div);
        });

        console.log('Showing results div');
        resultsDiv.style.display = 'block';
    }

    function selectUser(id, username, email) {
        console.log('selectUser called with:', id, username, email);
        document.getElementById('selectedUserId').value = id;
        document.getElementById('selectedUserName').textContent = username;
        document.getElementById('selectedUserEmail').textContent = email;
        document.getElementById('selectedUserDisplay').style.display = 'block';
        searchInput.value = '';
        resultsDiv.style.display = 'none';
    }

    window.clearUserSelection = function() {
        document.getElementById('selectedUserId').value = '';
        document.getElementById('selectedUserDisplay').style.display = 'none';
        searchInput.focus();
    };

    // Attach event listener
    searchInput.addEventListener('input', filterUsers);

    // Close search results when clicking outside
    document.addEventListener('click', function(e) {
        if (searchInput && resultsDiv && !searchInput.contains(e.target) && !resultsDiv.contains(e.target)) {
            resultsDiv.style.display = 'none';
        }
    });
}

async function assignUserToGroup(groupId) {
    const userId = document.getElementById('selectedUserId').value;
    if (!userId) {
        showToast('Selection Required', 'Please search and select a user to add to the group.', 'warning');
        return;
    }

    try {
        await apiRequest(`/groups/admin/${groupId}/assign`, {
            method: 'POST',
            body: JSON.stringify({ userId: parseInt(userId), role: 'member' })
        });

        showToast('User Added', 'User has been successfully added to the group.', 'success');

        // Reload the groups list to update member count
        await loadGroups();

        // Close current modal and reopen group details
        document.querySelector('[style*="position: fixed"]').remove();
        showGroupDetails(groupId);
    } catch (error) {
        showToast('Assignment Failed', error.message, 'error');
    }
}

async function removeUserFromGroup(groupId, userId, username) {
    showConfirm(
        'Remove User',
        `Remove ${username} from this group?`,
        async () => {
            try {
                await apiRequest(`/groups/admin/${groupId}/members/${userId}`, {
                    method: 'DELETE'
                });

                showToast('User Removed', `${username} has been removed from the group.`, 'success');

                // Reload the groups list to update member count
                await loadGroups();

                // Close current modal and reopen group details
                document.querySelector('[style*="position: fixed"]').remove();
                showGroupDetails(groupId);
            } catch (error) {
                showToast('Removal Failed', error.message, 'error');
            }
        }
    );
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(title, message, type = 'success') {
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

function showConfirm(title, message, onConfirm) {
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

// ============================================
// UTILITY FUNCTIONS
// ============================================
function escapeHtml(text) {
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

// ============================================
// EMAIL SETTINGS
// ============================================
async function loadEmailSettings() {
    try {
        const data = await apiRequest('/email-settings');
        const settings = data.settings;

        document.getElementById('smtpHost').value = settings.smtp_host || '';
        document.getElementById('smtpPort').value = settings.smtp_port || 587;
        document.getElementById('smtpSecure').checked = settings.smtp_secure || false;
        document.getElementById('smtpUser').value = settings.smtp_user || '';
        document.getElementById('smtpPassword').value = '';
        document.getElementById('smtpFrom').value = settings.smtp_from || 'Uptime Monitor <noreply@monitor.local>';

        // Make password field not required if settings exist
        if (settings.is_configured) {
            document.getElementById('smtpPassword').removeAttribute('required');
            document.getElementById('smtpPassword').placeholder = 'Leave empty to keep current password';
        } else {
            document.getElementById('smtpPassword').setAttribute('required', 'required');
            document.getElementById('smtpPassword').placeholder = 'Enter SMTP password';
        }
    } catch (error) {
        console.error('Failed to load email settings:', error);
        showToast('Load Failed', error.message, 'error');
    }
}

async function saveEmailSettings(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('emailSettingsError');
    errorDiv.textContent = '';

    try {
        const data = {
            smtp_host: document.getElementById('smtpHost').value,
            smtp_port: parseInt(document.getElementById('smtpPort').value),
            smtp_secure: document.getElementById('smtpSecure').checked,
            smtp_user: document.getElementById('smtpUser').value,
            smtp_from: document.getElementById('smtpFrom').value
        };

        const password = document.getElementById('smtpPassword').value;
        if (password) {
            data.smtp_password = password;
        }

        await apiRequest('/email-settings', {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        showToast('Settings Saved', 'Email settings have been updated successfully.', 'success');

        // Reload settings to update UI
        await loadEmailSettings();
    } catch (error) {
        errorDiv.textContent = error.message;
        showToast('Save Failed', error.message, 'error');
    }
}

async function sendTestEmail() {
    const resultDiv = document.getElementById('emailTestResult');

    try {
        const user = await apiRequest('/auth/me');
        const email = user.user.email;

        if (!email) {
            showToast('Email Required', 'Your account must have an email address to receive test emails.', 'warning');
            return;
        }

        resultDiv.innerHTML = '<div class="loading">Sending test email...</div>';
        resultDiv.style.display = 'block';

        await apiRequest('/email-settings/test', {
            method: 'POST',
            body: JSON.stringify({ email })
        });

        resultDiv.innerHTML = `
            <div style="padding: var(--space-4); background: var(--success-bg, rgba(34, 197, 94, 0.1)); border: 1px solid var(--success); border-radius: var(--radius-md); color: var(--success);">
                <strong>✅ Test email sent!</strong>
                <p style="margin-top: var(--space-2); color: var(--text-secondary);">Check ${email} for the test email.</p>
            </div>
        `;
        showToast('Test Email Sent', `Test email sent to ${email}`, 'success');
    } catch (error) {
        resultDiv.innerHTML = `
            <div style="padding: var(--space-4); background: var(--danger-bg, rgba(239, 68, 68, 0.1)); border: 1px solid var(--danger); border-radius: var(--radius-md); color: var(--danger);">
                <strong>❌ Failed to send test email</strong>
                <p style="margin-top: var(--space-2); color: var(--text-secondary);">${error.message}</p>
            </div>
        `;
        showToast('Test Failed', error.message, 'error');
    }
}

// ============================================
// APNS SETTINGS
// ============================================
async function loadApnsSettings() {
    try {
        const data = await apiRequest('/apns-settings');
        const settings = data.settings;

        document.getElementById('apnsKeyPath').value = settings.apns_key_path || '';
        document.getElementById('apnsKeyId').value = settings.apns_key_id || '';
        document.getElementById('apnsTeamId').value = settings.apns_team_id || '';
        document.getElementById('apnsBundleId').value = settings.apns_bundle_id || '';
    } catch (error) {
        console.error('Failed to load APNS settings:', error);
        showToast('Load Failed', error.message, 'error');
    }
}

async function saveApnsSettings(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('apnsSettingsError');
    errorDiv.textContent = '';

    try {
        const settings = {
            apns_key_path: document.getElementById('apnsKeyPath').value,
            apns_key_id: document.getElementById('apnsKeyId').value,
            apns_team_id: document.getElementById('apnsTeamId').value,
            apns_bundle_id: document.getElementById('apnsBundleId').value
        };

        await apiRequest('/apns-settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });

        showToast('Settings Saved', 'APNs settings have been updated successfully.', 'success');

        // Reload settings to update UI
        await loadApnsSettings();
    } catch (error) {
        errorDiv.textContent = error.message;
        showToast('Save Failed', error.message, 'error');
    }
}
