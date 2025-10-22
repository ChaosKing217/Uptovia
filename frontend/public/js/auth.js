// ============================================
// AUTHENTICATION MODULE
// ============================================

import { API_BASE } from './config.js';
import { setCurrentUser, setAuthToken, getCurrentUser, getAuthToken } from './state.js';
import { showToast } from './ui.js';

// ============================================
// TURNSTILE CONFIGURATION
// ============================================
let turnstileConfig = { enabled: false, siteKey: null };
let loginTurnstileWidgetId = null;
let registerTurnstileWidgetId = null;

// Load Turnstile configuration
export async function loadTurnstileConfig() {
    try {
        const response = await fetch(`${API_BASE}/settings/turnstile/public`);
        const data = await response.json();
        turnstileConfig = data;

        // Show/hide Turnstile widgets based on configuration
        if (turnstileConfig.enabled && turnstileConfig.siteKey) {
            document.getElementById('loginTurnstile').style.display = 'block';
            document.getElementById('registerTurnstile').style.display = 'block';
            initializeTurnstile();
        } else {
            document.getElementById('loginTurnstile').style.display = 'none';
            document.getElementById('registerTurnstile').style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load Turnstile config:', error);
        turnstileConfig = { enabled: false, siteKey: null };
    }
}

// Initialize Turnstile widgets
function initializeTurnstile() {
    if (!turnstileConfig.enabled || !turnstileConfig.siteKey) {
        console.log('Turnstile not enabled or siteKey missing');
        return;
    }

    // Validate siteKey is a string
    if (typeof turnstileConfig.siteKey !== 'string') {
        console.error('Turnstile siteKey must be a string, got:', typeof turnstileConfig.siteKey);
        return;
    }

    // Wait for Turnstile API to load
    const checkTurnstile = setInterval(() => {
        if (window.turnstile) {
            clearInterval(checkTurnstile);

            // Render login Turnstile
            const loginContainer = document.getElementById('loginTurnstile');
            if (loginContainer && !loginTurnstileWidgetId) {
                loginContainer.innerHTML = ''; // Clear any existing content
                try {
                    loginTurnstileWidgetId = window.turnstile.render('#loginTurnstile', {
                        sitekey: turnstileConfig.siteKey,
                        theme: 'light',
                        size: 'normal'
                    });
                } catch (error) {
                    console.error('Failed to render login Turnstile:', error);
                }
            }

            // Render register Turnstile
            const registerContainer = document.getElementById('registerTurnstile');
            if (registerContainer && !registerTurnstileWidgetId) {
                registerContainer.innerHTML = ''; // Clear any existing content
                registerTurnstileWidgetId = window.turnstile.render('#registerTurnstile', {
                    sitekey: turnstileConfig.siteKey,
                    theme: 'light',
                    size: 'normal'
                });
            }
        }
    }, 100);

    // Stop checking after 10 seconds
    setTimeout(() => clearInterval(checkTurnstile), 10000);
}

// Get Turnstile token
function getTurnstileToken(widgetId) {
    if (!turnstileConfig.enabled || !window.turnstile || !widgetId) {
        return null;
    }
    return window.turnstile.getResponse(widgetId);
}

// Reset Turnstile widget
function resetTurnstile(widgetId) {
    if (window.turnstile && widgetId) {
        window.turnstile.reset(widgetId);
    }
}

// ============================================
// AUTH SCREEN SWITCHING
// ============================================
export function showLoginForm() {
    document.querySelectorAll('.login-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.login-tab')[0].classList.add('active');
    document.getElementById('loginForm').classList.add('active');
    document.getElementById('registerForm').classList.remove('active');
}

export function showRegisterForm() {
    document.querySelectorAll('.login-tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.login-tab')[1].classList.add('active');
    document.getElementById('registerForm').classList.add('active');
    document.getElementById('loginForm').classList.remove('active');
}

// ============================================
// LOGIN & REGISTER
// ============================================
export async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    const errorDiv = document.getElementById('loginError');

    try {
        // Get Turnstile token if enabled
        const turnstileToken = getTurnstileToken(loginTurnstileWidgetId);

        const response = await fetch(`${API_BASE}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, turnstileToken })
        });

        const data = await response.json();

        if (!response.ok) {
            // Reset Turnstile widget on error
            resetTurnstile(loginTurnstileWidgetId);
            throw new Error(data.error || 'Login failed');
        }

        setAuthToken(data.token);
        setCurrentUser(data.user);

        localStorage.setItem('authToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));

        // Check if user needs to change password
        if (data.user.forcePasswordReset || data.user.forceUsernameChange) {
            showForcePasswordChangeModal(data.user.forceUsernameChange);
        } else {
            // Import showDashboard dynamically to avoid circular dependency
            const { showDashboard } = await import('./navigation.js');
            showDashboard();
        }
    } catch (error) {
        errorDiv.textContent = error.message;
        // Reset Turnstile widget on error
        resetTurnstile(loginTurnstileWidgetId);
    }
}

export async function handleRegister(e) {
    e.preventDefault();
    const username = document.getElementById('registerUsername').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const email = document.getElementById('registerEmail').value;
    const confirmEmail = document.getElementById('confirmRegisterEmail').value;
    const errorDiv = document.getElementById('registerError');

    // Validate email format
    if (!email.includes('@')) {
        errorDiv.textContent = 'Email must contain an @ symbol';
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        errorDiv.textContent = 'Please enter a valid email address';
        return;
    }

    // Check email match
    if (email !== confirmEmail) {
        errorDiv.textContent = 'Email addresses do not match';
        return;
    }

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
        // Get Turnstile token if enabled
        const turnstileToken = getTurnstileToken(registerTurnstileWidgetId);

        const requestBody = { username, password, email, turnstileToken };

        const response = await fetch(`${API_BASE}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            // Reset Turnstile widget on error
            resetTurnstile(registerTurnstileWidgetId);
            throw new Error(data.error || 'Registration failed');
        }

        setAuthToken(data.token);
        setCurrentUser(data.user);

        localStorage.setItem('authToken', data.token);
        localStorage.setItem('currentUser', JSON.stringify(data.user));

        // Show verification reminder
        showToast('Registration Successful', 'Please check your email to verify your account. You can still use the app while unverified.', 'success');

        // Import showDashboard dynamically to avoid circular dependency
        const { showDashboard } = await import('./navigation.js');
        showDashboard();
    } catch (error) {
        errorDiv.textContent = error.message;
        // Reset Turnstile widget on error
        resetTurnstile(registerTurnstileWidgetId);
    }
}

export function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    setAuthToken(null);
    setCurrentUser(null);

    // Import showLoginScreen dynamically to avoid circular dependency
    import('./navigation.js').then(({ showLoginScreen }) => {
        showLoginScreen();
    });
}

// ============================================
// PASSWORD VALIDATION
// ============================================
export function validatePasswordStrength(password) {
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

export function validatePassword() {
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

export function checkPasswordMatch() {
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

// ============================================
// EMAIL VALIDATION
// ============================================
export function validateEmail(inputId, messageId) {
    const email = document.getElementById(inputId).value;
    const messageEl = document.getElementById(messageId);

    if (email.length === 0) {
        messageEl.style.display = 'none';
        return;
    }

    messageEl.style.display = 'block';

    // Check if email contains @ symbol
    if (!email.includes('@')) {
        messageEl.style.color = 'var(--error)';
        messageEl.textContent = '✗ Email must contain an @ symbol';
        return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        messageEl.style.color = 'var(--error)';
        messageEl.textContent = '✗ Please enter a valid email address';
        return;
    }

    messageEl.style.color = 'var(--success)';
    messageEl.textContent = '✓ Valid email address';

    // Also check email match when email changes (for registration)
    if (inputId === 'registerEmail') {
        checkEmailMatch();
    }
}

export function checkEmailMatch() {
    const email = document.getElementById('registerEmail').value;
    const confirmEmail = document.getElementById('confirmRegisterEmail').value;
    const messageEl = document.getElementById('emailMatchMessage');

    if (confirmEmail.length === 0) {
        messageEl.style.display = 'none';
        return;
    }

    messageEl.style.display = 'block';

    if (email === confirmEmail) {
        messageEl.style.color = 'var(--success)';
        messageEl.textContent = '✓ Email addresses match';
    } else {
        messageEl.style.color = 'var(--error)';
        messageEl.textContent = '✗ Email addresses do not match';
    }
}

// ============================================
// FORGOT PASSWORD
// ============================================
export function showForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').classList.add('active');
    document.getElementById('forgotPasswordForm').reset();
    document.getElementById('forgotPasswordError').textContent = '';
    document.getElementById('forgotPasswordSuccess').textContent = '';
}

export function closeForgotPasswordModal() {
    document.getElementById('forgotPasswordModal').classList.remove('active');
}

export async function handleForgotPassword(e) {
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

// ============================================
// RESET PASSWORD
// ============================================
export async function handleResetPassword(e) {
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

export function validateResetPassword() {
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

export function checkResetPasswordMatch() {
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
// FORCE PASSWORD CHANGE
// ============================================
export function showForcePasswordChangeModal(requireUsernameChange = false) {
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

export async function handleForcePasswordChange(e) {
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
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to update account');
        }

        // Update local user object
        const currentUser = getCurrentUser();
        currentUser.forcePasswordReset = false;
        currentUser.forceUsernameChange = false;
        if (newUsername) {
            currentUser.username = newUsername;
        }
        setCurrentUser(currentUser);
        localStorage.setItem('currentUser', JSON.stringify(currentUser));

        // Close modal and show dashboard
        document.getElementById('forcePasswordChangeModal').classList.remove('active');

        // Import showDashboard dynamically to avoid circular dependency
        const { showDashboard } = await import('./navigation.js');
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

export function validateForceNewPassword() {
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

export function checkForcePasswordMatch() {
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

// ============================================
// CHANGE PASSWORD (SETTINGS)
// ============================================
export async function handleChangePassword(e) {
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
                'Authorization': `Bearer ${getAuthToken()}`
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

export function showChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.add('active');
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordError').textContent = '';
    document.getElementById('changePasswordSuccess').textContent = '';
}

export function closeChangePasswordModal() {
    document.getElementById('changePasswordModal').classList.remove('active');
    document.getElementById('changePasswordForm').reset();
    document.getElementById('changePasswordError').textContent = '';
    document.getElementById('changePasswordSuccess').textContent = '';
}

export function validateChangePassword() {
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

export function checkChangePasswordMatch() {
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
