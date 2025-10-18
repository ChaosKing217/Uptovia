// ============================================
// USER MANAGEMENT MODULE (ADMIN ONLY)
// ============================================

import { apiRequest } from './api.js';
import { getCurrentUser } from './state.js';
import { showToast, showConfirm, escapeHtml } from './ui.js';

// Store all users for filtering
let allUsers = [];
let currentStatusFilter = 'all';

// ============================================
// USER LOADING
// ============================================
export async function loadUsers() {
    try {
        const data = await apiRequest('/users/admin/all');
        allUsers = data.users || [];

        // Clear search input
        const searchInput = document.getElementById('userSearchInput');
        if (searchInput) searchInput.value = '';

        // Reset filter
        currentStatusFilter = 'all';

        renderUsers(allUsers);
        updateFilterButtons();
    } catch (error) {
        showToast('Load Failed', error.message, 'error');
    }
}

// ============================================
// USER FILTERING
// ============================================
export function filterUsers() {
    const searchInput = document.getElementById('userSearchInput');
    const searchTerm = searchInput.value.toLowerCase().trim();

    let filteredUsers = allUsers;

    // Apply status filter
    if (currentStatusFilter !== 'all') {
        filteredUsers = filteredUsers.filter(user => {
            const status = getUserStatus(user);
            return status === currentStatusFilter;
        });
    }

    // Apply search filter
    if (searchTerm) {
        filteredUsers = filteredUsers.filter(user => {
            const username = (user.username || '').toLowerCase();
            const email = (user.email || '').toLowerCase();
            return username.includes(searchTerm) || email.includes(searchTerm);
        });
    }

    renderUsers(filteredUsers);
}

export function setStatusFilter(status) {
    currentStatusFilter = status;
    updateFilterButtons();
    filterUsers();
}

function getUserStatus(user) {
    if (user.email_verified) {
        return 'verified';
    } else if (user.admin_created) {
        // User was created by admin and needs to complete account setup
        return 'invited';
    } else {
        // User self-registered and needs to verify email
        return 'unverified';
    }
}

function updateFilterButtons() {
    const filters = ['all', 'verified', 'unverified', 'invited'];
    filters.forEach(filter => {
        const button = document.getElementById(`filter-${filter}`);
        if (button) {
            if (filter === currentStatusFilter) {
                button.style.background = 'var(--primary)';
                button.style.color = 'white';
            } else {
                button.style.background = 'var(--surface, #f5f5f7)';
                button.style.color = 'var(--text-primary)';
            }
        }
    });

    // Update counts
    const verifiedCount = allUsers.filter(u => getUserStatus(u) === 'verified').length;
    const unverifiedCount = allUsers.filter(u => getUserStatus(u) === 'unverified').length;
    const invitedCount = allUsers.filter(u => getUserStatus(u) === 'invited').length;

    const verifiedBtn = document.getElementById('filter-verified');
    const unverifiedBtn = document.getElementById('filter-unverified');
    const invitedBtn = document.getElementById('filter-invited');
    const allBtn = document.getElementById('filter-all');

    if (verifiedBtn) verifiedBtn.textContent = `Verified (${verifiedCount})`;
    if (unverifiedBtn) unverifiedBtn.textContent = `Not Verified (${unverifiedCount})`;
    if (invitedBtn) invitedBtn.textContent = `Invited (${invitedCount})`;
    if (allBtn) allBtn.textContent = `All (${allUsers.length})`;
}

// ============================================
// USER RENDERING
// ============================================
function renderUsers(users) {
    const usersList = document.getElementById('usersList');

    if (!users || users.length === 0) {
        const searchInput = document.getElementById('userSearchInput');
        const isSearching = searchInput && searchInput.value.trim() !== '';

        if (isSearching) {
            usersList.innerHTML = '<div style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">No users match your search</div>';
        } else {
            usersList.innerHTML = '<div style="text-align: center; padding: var(--space-8); color: var(--text-secondary);">No users found</div>';
        }
        return;
    }

    const currentUser = getCurrentUser();
    usersList.innerHTML = users.map(user => {
        const status = getUserStatus(user);
        const statusBadge = user.email ? (
            user.email_verified
                ? '<span style="background: #34C759; color: white; font-size: var(--text-xs); padding: 2px 6px; border-radius: var(--radius-sm);">✓ Verified</span>'
                : (status === 'invited'
                    ? '<span style="background: #5AC8FA; color: white; font-size: var(--text-xs); padding: 2px 6px; border-radius: var(--radius-sm);">📧 Invited</span>'
                    : '<span style="background: #FF9500; color: white; font-size: var(--text-xs); padding: 2px 6px; border-radius: var(--radius-sm);">⚠ Unverified</span>')
        ) : '';

        return `
            <div style="padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-md); margin-bottom: var(--space-3); transition: all 0.2s;">
                <div style="display: flex; justify-content: space-between; align-items: start; gap: var(--space-3);">
                    <div style="flex: 1;">
                        <div style="display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-2);">
                            <h4 style="font-size: var(--text-base); font-weight: 600; margin: 0;">${escapeHtml(user.username)}</h4>
                            ${user.is_admin ? '<span style="background: var(--primary); color: white; font-size: var(--text-xs); padding: 2px 8px; border-radius: var(--radius-sm);">Admin</span>' : ''}
                        </div>
                        <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-bottom: var(--space-1); display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
                            📧 ${escapeHtml(user.email || 'No email')}
                            ${statusBadge}
                        </div>
                        <div style="color: var(--text-tertiary); font-size: var(--text-xs);">
                            Created: ${new Date(user.created_at).toLocaleDateString()}
                        </div>
                    </div>
                    <div style="display: flex; gap: var(--space-2); flex-wrap: wrap;">
                        ${!user.email_verified && status === 'unverified' ? `
                            <button onclick="window.resendVerificationEmail(${user.id})" class="btn-secondary" style="padding: var(--space-2) var(--space-3); font-size: var(--text-xs); white-space: nowrap;">
                                📧 Resend Verification
                            </button>
                        ` : ''}
                        ${status === 'invited' ? `
                            <button onclick="window.resendSetupEmail(${user.id})" class="btn-secondary" style="padding: var(--space-2) var(--space-3); font-size: var(--text-xs); white-space: nowrap;">
                                📧 Resend Setup
                            </button>
                        ` : ''}
                        <button onclick="window.showEditUserModal(${user.id})" class="btn-secondary" style="padding: var(--space-2) var(--space-3); font-size: var(--text-sm);">
                            Edit
                        </button>
                        ${user.id !== currentUser.id ? `
                            <button onclick="window.deleteUser(${user.id}, '${escapeHtml(user.username)}')" class="btn-danger" style="padding: var(--space-2) var(--space-3); font-size: var(--text-sm);">
                                Delete
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ============================================
// USER CRUD
// ============================================
export function showCreateUserModal() {
    const modalHtml = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="this.remove()">
            <div style="background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-lg); max-width: 500px; width: 90%; padding: var(--space-6);" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                    <h2 style="font-size: var(--text-xl); font-weight: 600;">Invite New User</h2>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                </div>

                <div style="background: var(--surface, #f5f5f7); padding: var(--space-3); border-radius: var(--radius-md); margin-bottom: var(--space-4); border-left: 4px solid var(--primary);">
                    <p style="margin: 0; color: var(--text-secondary); font-size: var(--text-sm);">
                        📧 An invitation email will be sent to the user with a link to set up their account and create their own password.
                    </p>
                </div>

                <form onsubmit="window.handleCreateUser(event)" style="display: flex; flex-direction: column; gap: var(--space-4);">
                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Username *</label>
                        <input type="text" id="createUsername" required minlength="3" placeholder="Enter username" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                        <small style="color: var(--text-secondary); font-size: var(--text-xs); display: block; margin-top: var(--space-1);">
                            The user will log in with this username
                        </small>
                    </div>

                    <div>
                        <label style="display: block; margin-bottom: var(--space-2); font-weight: 500;">Email *</label>
                        <input type="email" id="createEmail" required placeholder="user@example.com" style="width: 100%; padding: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--background); color: var(--text-primary);">
                        <small style="color: var(--text-secondary); font-size: var(--text-xs); display: block; margin-top: var(--space-1);">
                            Setup instructions will be sent to this email
                        </small>
                    </div>

                    <div id="createUserError" class="error-message"></div>

                    <div style="display: flex; gap: var(--space-2); justify-content: flex-end;">
                        <button type="button" onclick="this.closest('[style*=fixed]').remove()" class="btn-secondary">Cancel</button>
                        <button type="submit" class="btn-primary">Send Invitation</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

export async function handleCreateUser(e) {
    e.preventDefault();
    const errorDiv = document.getElementById('createUserError');
    errorDiv.textContent = '';

    const username = document.getElementById('createUsername').value;
    const email = document.getElementById('createEmail').value;

    try {
        await apiRequest('/users/admin/create', {
            method: 'POST',
            body: JSON.stringify({
                username,
                email
            })
        });

        showToast('Invitation Sent', `An invitation email has been sent to ${email}`, 'success');
        document.querySelector('[style*="position: fixed"]').remove();
        loadUsers();
    } catch (error) {
        errorDiv.textContent = error.message;
    }
}

export async function showEditUserModal(userId) {
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

                    <form onsubmit="window.handleEditUser(event, ${userId})" style="display: flex; flex-direction: column; gap: var(--space-4);">
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

export async function handleEditUser(e, userId) {
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

export async function deleteUser(userId, username) {
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
// EMAIL RESENDING
// ============================================
export async function resendVerificationEmail(userId) {
    try {
        await apiRequest(`/users/admin/${userId}/resend-verification`, {
            method: 'POST'
        });
        showToast('Email Sent', 'Verification email has been resent successfully.', 'success');
    } catch (error) {
        showToast('Send Failed', error.message, 'error');
    }
}

export async function resendSetupEmail(userId) {
    try {
        await apiRequest(`/users/admin/${userId}/resend-setup`, {
            method: 'POST'
        });
        showToast('Email Sent', 'Setup invitation email has been resent successfully.', 'success');
    } catch (error) {
        showToast('Send Failed', error.message, 'error');
    }
}

export async function bulkResendVerification() {
    const unverifiedUsers = allUsers.filter(u => getUserStatus(u) === 'unverified');

    if (unverifiedUsers.length === 0) {
        showToast('No Users', 'No unverified users found.', 'info');
        return;
    }

    showConfirm(
        'Resend Verification Emails',
        `Send verification emails to ${unverifiedUsers.length} unverified user(s)?`,
        async () => {
            try {
                await apiRequest('/users/admin/bulk-resend-verification', {
                    method: 'POST'
                });
                showToast('Emails Sent', `Verification emails sent to ${unverifiedUsers.length} user(s).`, 'success');
            } catch (error) {
                showToast('Send Failed', error.message, 'error');
            }
        }
    );
}

export async function bulkResendSetup() {
    const invitedUsers = allUsers.filter(u => getUserStatus(u) === 'invited');

    if (invitedUsers.length === 0) {
        showToast('No Users', 'No invited users found.', 'info');
        return;
    }

    showConfirm(
        'Resend Setup Emails',
        `Send setup invitation emails to ${invitedUsers.length} invited user(s)?`,
        async () => {
            try {
                await apiRequest('/users/admin/bulk-resend-setup', {
                    method: 'POST'
                });
                showToast('Emails Sent', `Setup emails sent to ${invitedUsers.length} user(s).`, 'success');
            } catch (error) {
                showToast('Send Failed', error.message, 'error');
            }
        }
    );
}
