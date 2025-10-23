// ============================================
// SETTINGS MODULE
// ============================================

import { API_BASE } from './config.js';
import { apiRequest } from './api.js';
import { getCurrentUser, getAuthToken, setCurrentUser, isApiKeyVisible, setApiKeyVisible } from './state.js';
import { showToast, showConfirm, updateThemeButtonStates } from './ui.js';

// ============================================
// SETTINGS LOADING
// ============================================
export async function loadSettings() {
    try {
        const data = await apiRequest('/auth/me');
        const user = data.user;

        document.getElementById('settingsUsername').textContent = user.username;
        document.getElementById('settingsEmail').textContent = user.email || 'Not set';
        document.getElementById('settingsCreated').textContent = new Date(user.created_at).toLocaleDateString();
        document.getElementById('sessionUsername').textContent = user.username;
        document.getElementById('settingsApiKey').textContent = '••••••••••••••••';
        document.getElementById('settingsApiKey').dataset.key = user.api_key;

        // Show email verification status
        const verifiedBadge = document.getElementById('emailVerifiedBadge');
        const unverifiedBadge = document.getElementById('emailUnverifiedBadge');
        const resendBtn = document.getElementById('resendVerificationBtn');

        if (user.email) {
            if (user.email_verified) {
                verifiedBadge.style.display = 'inline-block';
                unverifiedBadge.style.display = 'none';
                resendBtn.style.display = 'none';
            } else {
                verifiedBadge.style.display = 'none';
                unverifiedBadge.style.display = 'inline-block';
                resendBtn.style.display = 'inline-block';
            }
        } else {
            verifiedBadge.style.display = 'none';
            unverifiedBadge.style.display = 'none';
            resendBtn.style.display = 'none';
        }

        // Show Users, Groups, Email, APNS, and Turnstile tabs if user is admin
        if (user.is_admin) {
            document.getElementById('usersTab').style.display = 'block';
            document.getElementById('groupsTab').style.display = 'block';
            document.getElementById('emailTab').style.display = 'block';
            document.getElementById('apnsTab').style.display = 'block';
            document.getElementById('turnstileTab').style.display = 'block';
        }

        // Load monitoring settings
        loadMonitoringSettings();

        // Update theme button states
        updateThemeButtonStates();
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

export function showSettingsTab(tabName, e) {
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
        import('./users.js').then(({ loadUsers }) => loadUsers());
    } else if (tabName === 'groups') {
        import('./groups.js').then(({ loadGroups }) => loadGroups());
    } else if (tabName === 'email') {
        loadEmailSettings();
    } else if (tabName === 'apns') {
        loadApnsSettings();
    } else if (tabName === 'turnstile') {
        loadTurnstileSettings();
    }
}

// ============================================
// MONITORING SETTINGS
// ============================================
export async function loadMonitoringSettings() {
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

export async function saveMonitoringSettings() {
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

        showToast('Settings Saved', 'Monitoring preferences updated', 'success');
    } catch (error) {
        console.error('Failed to save monitoring settings:', error);
        showToast('Save Failed', error.message, 'error');
    }
}

export async function getMonitoringDefaults() {
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

// ============================================
// API KEY MANAGEMENT
// ============================================
export function toggleApiKeyVisibility() {
    const apiKeyDisplay = document.getElementById('settingsApiKey');
    const visible = !isApiKeyVisible();
    setApiKeyVisible(visible);

    if (visible) {
        apiKeyDisplay.textContent = apiKeyDisplay.dataset.key;
        event.target.textContent = '👁️‍🗨️ Hide';
    } else {
        apiKeyDisplay.textContent = '••••••••••••••••';
        event.target.textContent = '👁️ Show';
    }
}

export function copyAPIKey() {
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

export async function regenerateAPIKey() {
    showConfirm(
        'Regenerate API Key?',
        'Your old API key will stop working immediately and you\'ll need to update your iOS app.',
        async () => {
            try {
                const data = await apiRequest('/auth/regenerate-api-key', { method: 'POST' });

                const currentUser = getCurrentUser();
                currentUser.apiKey = data.apiKey;
                setCurrentUser(currentUser);
                localStorage.setItem('currentUser', JSON.stringify(currentUser));

                document.getElementById('settingsApiKey').dataset.key = data.apiKey;

                if (isApiKeyVisible()) {
                    document.getElementById('settingsApiKey').textContent = data.apiKey;
                }

                showToast('API Key Regenerated', 'Make sure to update your iOS app with the new key.', 'success');
            } catch (error) {
                showToast('Regeneration Failed', `Failed to regenerate API key: ${error.message}`, 'error');
            }
        }
    );
}

// ============================================
// ACCOUNT MANAGEMENT
// ============================================
export function confirmDeleteAccount() {
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
                    <button class="btn-secondary" onclick="window.closeDeleteAccountModal()">Cancel</button>
                    <button class="btn-danger" onclick="window.executeDeleteAccount()">Delete My Account</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

export function closeDeleteAccountModal() {
    const modal = document.getElementById('deleteAccountConfirmModal');
    if (modal) {
        modal.remove();
    }
}

export async function executeDeleteAccount() {
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
                'Authorization': `Bearer ${getAuthToken()}`
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
            import('./auth.js').then(({ logout }) => logout());
        }, 2000);
    } catch (error) {
        if (error.message.includes('invalid token') || error.message.includes('Invalid token')) {
            errorDiv.textContent = 'Your session has expired. Please log out and log back in.';
        } else {
            errorDiv.textContent = error.message;
        }
    }
}

export function confirmClearAllData() {
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
                                'Authorization': `Bearer ${getAuthToken()}`
                            }
                        });

                        const data = await response.json();

                        if (!response.ok) {
                            console.error('Clear all data error:', data);
                            throw new Error(data.error || 'Failed to clear data');
                        }

                        showToast('Data Cleared', data.message, 'success');

                        // Reload monitors to show empty state
                        const { loadMonitors } = await import('./monitors.js');
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
// EMAIL SETTINGS
// ============================================
export async function loadEmailSettings() {
    try {
        const data = await apiRequest('/email-settings');
        const settings = data.settings;

        document.getElementById('smtpHost').value = settings.smtp_host || '';
        document.getElementById('smtpPort').value = settings.smtp_port || 587;
        document.getElementById('smtpSecure').checked = settings.smtp_secure || false;
        document.getElementById('smtpUser').value = settings.smtp_user || '';
        document.getElementById('smtpPassword').value = '';
        document.getElementById('smtpFrom').value = settings.smtp_from || 'Uptovia <noreply@monitor.local>';

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

export async function saveEmailSettings(e) {
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

export async function sendTestEmail() {
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
export async function loadApnsSettings() {
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

export async function saveApnsSettings(e) {
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

// ============================================
// EMAIL VERIFICATION
// ============================================
export async function resendVerification() {
    try {
        await apiRequest('/auth/resend-verification', {
            method: 'POST'
        });

        showToast('Email Sent', 'Verification email has been sent. Please check your inbox.', 'success');
    } catch (error) {
        showToast('Send Failed', error.message, 'error');
    }
}

// ============================================
// EMAIL CHANGE
// ============================================
export function showChangeEmailModal() {
    const currentUser = getCurrentUser();
    const currentEmail = currentUser.email || 'Not set';

    const modalHtml = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="this.remove()">
            <div style="background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-lg); max-width: 500px; width: 90%; padding: var(--space-6);" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                    <h2 style="font-size: var(--text-xl); font-weight: 600; margin: 0;">Change Email Address</h2>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                </div>

                <form onsubmit="window.handleChangeEmail(event)" style="display: flex; flex-direction: column; gap: var(--space-4);">
                    <div style="background: var(--surface, #f5f5f7); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border);">
                        <div style="font-size: var(--text-sm); color: var(--text-secondary); margin-bottom: var(--space-1);">Current Email</div>
                        <div style="font-weight: 500;">${currentEmail}</div>
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">New Email Address *</label>
                        <input type="email" id="changeEmailNew" required placeholder="newemail@example.com" oninput="window.validateEmail('changeEmailNew', 'changeEmailValidation')" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                        <small id="changeEmailValidation" style="margin-top: var(--space-2); display: none;"></small>
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Confirm Password *</label>
                        <input type="password" id="changeEmailPassword" required placeholder="Enter your password to confirm" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                        <small style="color: var(--text-secondary); font-size: var(--text-xs); display: block; margin-top: var(--space-1);">
                            For security, please enter your current password to confirm this change.
                        </small>
                    </div>

                    <div style="background: #FFF3CD; border-left: 4px solid #FF9500; padding: var(--space-3); border-radius: var(--radius-md);">
                        <strong style="color: #FF9500;">⚠️ Important:</strong>
                        <ul style="margin: var(--space-2) 0 0 0; padding-left: 20px; font-size: var(--text-sm); color: var(--text-secondary);">
                            <li>Your new email will need to be verified</li>
                            <li>A verification link will be sent to the new address</li>
                            <li>You can continue using your account while unverified</li>
                        </ul>
                    </div>

                    <div id="changeEmailError" class="error-message"></div>

                    <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
                        <button type="button" onclick="this.closest('[style*=fixed]').remove()" class="btn-secondary">Cancel</button>
                        <button type="submit" class="btn-primary">Change Email</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

export async function handleChangeEmail(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('changeEmailError');
    errorDiv.textContent = '';

    const newEmail = document.getElementById('changeEmailNew').value;
    const password = document.getElementById('changeEmailPassword').value;

    // Validate email format
    if (!newEmail.includes('@')) {
        errorDiv.textContent = 'Email must contain an @ symbol';
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
        errorDiv.textContent = 'Please enter a valid email address';
        return;
    }

    try {
        await apiRequest('/auth/change-email', {
            method: 'POST',
            body: JSON.stringify({
                newEmail,
                password
            })
        });

        showToast('Email Changed', 'Your email has been changed. Please check your new email to verify it.', 'success');
        document.querySelector('[style*="position: fixed"]').remove();

        // Reload settings to update the UI
        loadSettings();
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

// ============================================
// USERNAME CHANGE
// ============================================
export function showChangeUsernameModal() {
    const user = getCurrentUser();
    document.getElementById('currentUsernameDisplay').textContent = user.username;
    document.getElementById('verifyCurrentUsername').value = '';
    document.getElementById('newUsername').value = '';
    document.getElementById('confirmNewUsername').value = '';
    document.getElementById('passwordForUsername').value = '';
    document.getElementById('confirmPasswordForUsername').value = '';
    document.getElementById('changeUsernameError').textContent = '';
    document.getElementById('changeUsernameSuccess').textContent = '';
    document.getElementById('changeUsernameModal').classList.add('active');

    // Setup form submission
    const form = document.getElementById('changeUsernameForm');
    form.onsubmit = (e) => {
        e.preventDefault();
        handleChangeUsername();
    };
}

export function closeChangeUsernameModal() {
    document.getElementById('changeUsernameModal').classList.remove('active');
}

export function validateNewUsername() {
    const newUsername = document.getElementById('newUsername').value;
    const requirementsDiv = document.getElementById('newUsernameRequirements');

    if (newUsername.length < 3) {
        requirementsDiv.style.color = '#FF3B30';
        requirementsDiv.textContent = '❌ Username must be at least 3 characters';
        return false;
    } else {
        requirementsDiv.style.color = '#34C759';
        requirementsDiv.textContent = '✓ Username length is valid';
        return true;
    }
}

export function checkUsernameMatch() {
    const newUsername = document.getElementById('newUsername').value;
    const confirmUsername = document.getElementById('confirmNewUsername').value;
    const matchMessage = document.getElementById('usernameMatchMessage');

    if (confirmUsername.length === 0) {
        matchMessage.style.display = 'none';
        return false;
    }

    if (newUsername !== confirmUsername) {
        matchMessage.style.display = 'block';
        matchMessage.style.color = '#FF3B30';
        matchMessage.textContent = '❌ Usernames do not match';
        return false;
    } else {
        matchMessage.style.display = 'block';
        matchMessage.style.color = '#34C759';
        matchMessage.textContent = '✓ Usernames match';
        return true;
    }
}

export function checkPasswordForUsernameMatch() {
    const password = document.getElementById('passwordForUsername').value;
    const confirmPassword = document.getElementById('confirmPasswordForUsername').value;
    const matchMessage = document.getElementById('passwordForUsernameMatchMessage');

    if (confirmPassword.length === 0) {
        matchMessage.style.display = 'none';
        return false;
    }

    if (password !== confirmPassword) {
        matchMessage.style.display = 'block';
        matchMessage.style.color = '#FF3B30';
        matchMessage.textContent = '❌ Passwords do not match';
        return false;
    } else {
        matchMessage.style.display = 'block';
        matchMessage.style.color = '#34C759';
        matchMessage.textContent = '✓ Passwords match';
        return true;
    }
}

export async function handleChangeUsername() {
    const errorDiv = document.getElementById('changeUsernameError');
    errorDiv.textContent = '';

    const user = getCurrentUser();
    const verifyUsername = document.getElementById('verifyCurrentUsername').value;
    const newUsername = document.getElementById('newUsername').value;
    const confirmUsername = document.getElementById('confirmNewUsername').value;
    const password = document.getElementById('passwordForUsername').value;
    const confirmPassword = document.getElementById('confirmPasswordForUsername').value;

    // Validate current username
    if (verifyUsername !== user.username) {
        errorDiv.textContent = 'Current username verification failed. Please type your current username exactly.';
        return;
    }

    // Validate new username
    if (newUsername.length < 3) {
        errorDiv.textContent = 'New username must be at least 3 characters long';
        return;
    }

    if (newUsername === user.username) {
        errorDiv.textContent = 'New username must be different from your current username';
        return;
    }

    // Check if usernames match
    if (newUsername !== confirmUsername) {
        errorDiv.textContent = 'New usernames do not match';
        return;
    }

    // Check if passwords match
    if (password !== confirmPassword) {
        errorDiv.textContent = 'Passwords do not match';
        return;
    }

    if (!password) {
        errorDiv.textContent = 'Password is required';
        return;
    }

    try {
        await apiRequest('/auth/change-username', {
            method: 'POST',
            body: JSON.stringify({
                currentUsername: verifyUsername,
                newUsername,
                password
            })
        });

        showToast('Username Changed', 'Your username has been changed successfully. Please log in again with your new username.', 'success');

        // Close modal and log out user after brief delay
        setTimeout(() => {
            closeChangeUsernameModal();
            window.logout();
        }, 2000);
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

// ============================================
// TURNSTILE SETTINGS
// ============================================
export async function loadTurnstileSettings() {
    try {
        const data = await apiRequest('/settings/turnstile');

        document.getElementById('turnstileEnabled').checked = data.is_enabled || false;
        document.getElementById('turnstileSiteKey').value = data.site_key || '';
        document.getElementById('turnstileSecretKey').value = data.secret_key || '';
    } catch (error) {
        console.error('Failed to load Turnstile settings:', error);
        showToast('Load Failed', 'Failed to load Turnstile settings', 'error');
    }
}

export async function saveTurnstileSettings(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('turnstileSettingsError');
    errorDiv.textContent = '';

    const isEnabled = document.getElementById('turnstileEnabled').checked;
    const siteKey = document.getElementById('turnstileSiteKey').value.trim();
    const secretKey = document.getElementById('turnstileSecretKey').value.trim();

    // If enabled, validate that keys are provided
    if (isEnabled && (!siteKey || !secretKey)) {
        errorDiv.textContent = 'Site Key and Secret Key are required when Turnstile is enabled';
        return;
    }

    try {
        await apiRequest('/settings/turnstile', {
            method: 'POST',
            body: JSON.stringify({
                isEnabled,
                siteKey,
                secretKey
            })
        });

        showToast('Settings Saved', 'Turnstile settings have been updated successfully', 'success');
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}
