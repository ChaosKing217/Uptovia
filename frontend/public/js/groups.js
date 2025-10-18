// ============================================
// GROUPS MANAGEMENT MODULE (ADMIN ONLY)
// ============================================

import { apiRequest } from './api.js';
import { showToast, showConfirm, escapeHtml } from './ui.js';

// ============================================
// GROUP LOADING
// ============================================
export async function loadGroups() {
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
        <div class="group-item" style="padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-lg); margin-bottom: var(--space-3); cursor: pointer;" onclick="window.showGroupDetails(${group.id})">
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
                        <button class="btn-secondary" onclick="event.stopPropagation(); window.showEditGroupModal(${group.id}, '${escapeHtml(group.name)}', '${escapeHtml(group.description || '')}')" style="padding: var(--space-2) var(--space-3); font-size: var(--text-sm);">Edit</button>
                        <button class="btn-danger" onclick="event.stopPropagation(); window.deleteGroup(${group.id}, '${escapeHtml(group.name)}')" style="padding: var(--space-2) var(--space-3); font-size: var(--text-sm);">Delete</button>
                    ` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// ============================================
// GROUP CRUD
// ============================================
export function showAddGroupModal() {
    const modalHtml = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="this.remove()">
            <div style="background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-lg); max-width: 500px; width: 90%; padding: var(--space-6);" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                    <h2 style="font-size: var(--text-xl); font-weight: 600;">Create New Group</h2>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                </div>

                <form onsubmit="window.handleCreateGroup(event)" style="display: flex; flex-direction: column; gap: var(--space-4);">
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

export async function handleCreateGroup(e) {
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

export function showEditGroupModal(id, name, description) {
    const modalHtml = `
        <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 10000;" onclick="this.remove()">
            <div style="background: var(--background); border: 1px solid var(--border); border-radius: var(--radius-lg); max-width: 500px; width: 90%; padding: var(--space-6);" onclick="event.stopPropagation()">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-5);">
                    <h2 style="font-size: var(--text-xl); font-weight: 600;">Edit Group</h2>
                    <button onclick="this.closest('[style*=fixed]').remove()" style="background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary);">×</button>
                </div>

                <form onsubmit="window.handleEditGroup(event, ${id})" style="display: flex; flex-direction: column; gap: var(--space-4);">
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

export async function handleEditGroup(e, id) {
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

export async function deleteGroup(id, name) {
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

// ============================================
// GROUP DETAILS & MEMBERS
// ============================================
export async function showGroupDetails(groupId) {
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
                                    <button onclick="window.clearUserSelection()" style="background: none; border: none; font-size: 20px; cursor: pointer; color: var(--text-secondary);">×</button>
                                </div>
                            </div>
                            <button onclick="window.assignUserToGroup(${groupId})" class="btn-secondary" style="width: 100%; padding: var(--space-2) var(--space-4);">Add User</button>
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
                                    <button onclick="window.removeUserFromGroup(${groupId}, ${member.id}, '${escapeHtml(member.username)}')" class="btn-danger" style="padding: var(--space-1) var(--space-3); font-size: var(--text-sm);">Remove</button>
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

// ============================================
// USER SEARCH FUNCTIONALITY
// ============================================
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

export async function assignUserToGroup(groupId) {
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

export async function removeUserFromGroup(groupId, userId, username) {
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
