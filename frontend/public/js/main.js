// ============================================
// MAIN APPLICATION ENTRY POINT
// ============================================

console.log('Main.js: Starting module load...');

import { updateThemeIcon, toggleTheme, setTheme, showConfirm, openModal, closeModal, toggleMobileMenu } from './ui.js';
import { setCurrentUser, setAuthToken } from './state.js';
import { showDashboard, showLoginScreen } from './navigation.js';

// Import all functions that need to be globally accessible
import {
    showLoginForm,
    showRegisterForm,
    handleLogin,
    handleRegister,
    logout,
    validatePassword,
    checkPasswordMatch,
    validateEmail,
    checkEmailMatch,
    showForgotPasswordModal,
    closeForgotPasswordModal,
    handleForgotPassword,
    handleResetPassword,
    validateResetPassword,
    checkResetPasswordMatch,
    showForcePasswordChangeModal,
    handleForcePasswordChange,
    validateForceNewPassword,
    checkForcePasswordMatch,
    showChangePasswordModal,
    closeChangePasswordModal,
    handleChangePassword,
    validateChangePassword,
    checkChangePasswordMatch,
    loadTurnstileConfig
} from './auth.js';

import {
    loadMonitors,
    showAddMonitorModal,
    editMonitor,
    handleMonitorSubmit,
    updateMonitorFields,
    closeMonitorModal,
    filterMonitors,
    showDeleteModal,
    confirmDelete,
    closeDeleteModal
} from './monitors.js';

import {
    loadTags,
    showAddTagModal,
    editTag,
    handleTagSubmit,
    closeTagModal,
    selectSymbol
} from './tags.js';

import {
    loadSettings,
    showSettingsTab,
    loadMonitoringSettings,
    saveMonitoringSettings,
    toggleApiKeyVisibility,
    copyAPIKey,
    regenerateAPIKey,
    confirmDeleteAccount,
    closeDeleteAccountModal,
    executeDeleteAccount,
    confirmClearAllData,
    loadEmailSettings,
    saveEmailSettings,
    sendTestEmail,
    loadApnsSettings,
    saveApnsSettings,
    loadTurnstileSettings,
    saveTurnstileSettings,
    resendVerification,
    showChangeEmailModal,
    handleChangeEmail,
    showChangeUsernameModal,
    closeChangeUsernameModal,
    validateNewUsername,
    checkUsernameMatch,
    checkPasswordForUsernameMatch,
    handleChangeUsername
} from './settings.js';

import {
    loadUsers,
    filterUsers,
    setStatusFilter,
    setPlanFilter,
    showCreateUserModal,
    handleCreateUser,
    showEditUserModal,
    handleEditUser,
    deleteUser,
    resendVerificationEmail,
    resendSetupEmail,
    bulkResendVerification,
    bulkResendSetup,
    showChangeSubscriptionModal,
    handleChangeSubscription
} from './users.js';

import { loadDashboard } from './dashboard.js';

import {
    loadGroups,
    showAddGroupModal,
    handleCreateGroup,
    showEditGroupModal,
    handleEditGroup,
    deleteGroup,
    showGroupDetails,
    assignUserToGroup,
    removeUserFromGroup
} from './groups.js';

import { showView, goToHome } from './navigation.js';

// ============================================
// GLOBAL WINDOW FUNCTIONS
// Make functions globally accessible for inline onclick handlers
// ============================================

// UI Functions
window.toggleTheme = toggleTheme;
window.setTheme = setTheme;
window.showConfirm = showConfirm;
window.openModal = openModal;
window.closeModal = closeModal;
window.toggleMobileMenu = toggleMobileMenu;

// Auth Functions
window.showLoginForm = showLoginForm;
window.showRegisterForm = showRegisterForm;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.logout = logout;
window.validatePassword = validatePassword;
window.checkPasswordMatch = checkPasswordMatch;
window.validateEmail = validateEmail;
window.checkEmailMatch = checkEmailMatch;
window.showForgotPasswordModal = showForgotPasswordModal;
window.closeForgotPasswordModal = closeForgotPasswordModal;
window.validateResetPassword = validateResetPassword;
window.checkResetPasswordMatch = checkResetPasswordMatch;
window.validateForceNewPassword = validateForceNewPassword;
window.checkForcePasswordMatch = checkForcePasswordMatch;
window.showChangePasswordModal = showChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.validateChangePassword = validateChangePassword;
window.checkChangePasswordMatch = checkChangePasswordMatch;

// Navigation Functions
window.showView = showView;
window.goToHome = goToHome;

// Monitor Functions
window.showAddMonitorModal = showAddMonitorModal;
window.editMonitor = editMonitor;
window.updateMonitorFields = updateMonitorFields;
window.closeMonitorModal = closeMonitorModal;
window.filterMonitors = filterMonitors;
window.showDeleteModal = showDeleteModal;
window.confirmDelete = confirmDelete;
window.closeDeleteModal = closeDeleteModal;

// Tag Functions
window.showAddTagModal = showAddTagModal;
window.editTag = editTag;
window.closeTagModal = closeTagModal;
window.selectSymbol = selectSymbol;

// Settings Functions
window.showSettingsTab = showSettingsTab;
window.saveMonitoringSettings = saveMonitoringSettings;
window.toggleApiKeyVisibility = toggleApiKeyVisibility;
window.copyAPIKey = copyAPIKey;
window.regenerateAPIKey = regenerateAPIKey;
window.confirmDeleteAccount = confirmDeleteAccount;
window.closeDeleteAccountModal = closeDeleteAccountModal;
window.executeDeleteAccount = executeDeleteAccount;
window.confirmClearAllData = confirmClearAllData;
window.sendTestEmail = sendTestEmail;
window.loadTurnstileSettings = loadTurnstileSettings;
window.saveTurnstileSettings = saveTurnstileSettings;
window.resendVerification = resendVerification;
window.showChangeEmailModal = showChangeEmailModal;
window.handleChangeEmail = handleChangeEmail;
window.showChangeUsernameModal = showChangeUsernameModal;
window.closeChangeUsernameModal = closeChangeUsernameModal;
window.validateNewUsername = validateNewUsername;
window.checkUsernameMatch = checkUsernameMatch;
window.checkPasswordForUsernameMatch = checkPasswordForUsernameMatch;
window.handleChangeUsername = handleChangeUsername;

// User Management Functions
window.filterUsers = filterUsers;
window.setStatusFilter = setStatusFilter;
window.setPlanFilter = setPlanFilter;
window.showCreateUserModal = showCreateUserModal;
window.handleCreateUser = handleCreateUser;
window.showEditUserModal = showEditUserModal;
window.handleEditUser = handleEditUser;
window.deleteUser = deleteUser;
window.resendVerificationEmail = resendVerificationEmail;
window.resendSetupEmail = resendSetupEmail;
window.bulkResendVerification = bulkResendVerification;
window.bulkResendSetup = bulkResendSetup;
window.showChangeSubscriptionModal = showChangeSubscriptionModal;
window.handleChangeSubscription = handleChangeSubscription;

// Group Management Functions
window.showAddGroupModal = showAddGroupModal;
window.handleCreateGroup = handleCreateGroup;
window.showEditGroupModal = showEditGroupModal;
window.handleEditGroup = handleEditGroup;
window.deleteGroup = deleteGroup;
window.showGroupDetails = showGroupDetails;
window.assignUserToGroup = assignUserToGroup;
window.removeUserFromGroup = removeUserFromGroup;

// Dashboard Functions
window.loadDashboard = loadDashboard;

// ============================================
// EVENT LISTENERS SETUP
// ============================================
function setupEventListeners() {
    // Auth Forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('registerForm').addEventListener('submit', handleRegister);
    document.getElementById('forgotPasswordForm').addEventListener('submit', handleForgotPassword);
    document.getElementById('resetPasswordForm').addEventListener('submit', handleResetPassword);
    document.getElementById('forcePasswordChangeForm').addEventListener('submit', handleForcePasswordChange);
    document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);

    // Monitor Form
    document.getElementById('monitorForm').addEventListener('submit', handleMonitorSubmit);

    // Tag Form
    document.getElementById('tagForm').addEventListener('submit', handleTagSubmit);

    // Email Settings Form
    const emailSettingsForm = document.getElementById('emailSettingsForm');
    if (emailSettingsForm) {
        emailSettingsForm.addEventListener('submit', saveEmailSettings);
    }

    // APNS Settings Form
    const apnsSettingsForm = document.getElementById('apnsSettingsForm');
    if (apnsSettingsForm) {
        apnsSettingsForm.addEventListener('submit', saveApnsSettings);
    }

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
// INITIALIZATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Application initializing...');

    // Load theme preference
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-theme');
        updateThemeIcon();
    }

    // Load Turnstile configuration
    loadTurnstileConfig();

    // Check for existing auth
    const savedToken = localStorage.getItem('authToken');
    const savedUser = localStorage.getItem('currentUser');

    if (savedToken && savedUser) {
        setAuthToken(savedToken);
        setCurrentUser(JSON.parse(savedUser));
        showDashboard();
    } else {
        showLoginScreen();
    }

    // Setup all event listeners
    setupEventListeners();

    console.log('Application initialized successfully');
});

console.log('Main.js module loaded');
