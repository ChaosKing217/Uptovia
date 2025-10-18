const express = require('express');
const db = require('../services/database');
const { verifyAPIKey, verifyToken } = require('../middleware/auth');

const router = express.Router();

// Support both API key and JWT authentication
const authenticate = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    const token = req.headers.authorization;

    if (apiKey) {
        return verifyAPIKey(req, res, next);
    } else if (token) {
        return verifyToken(req, res, next);
    } else {
        return res.status(401).json({ error: 'Authentication required' });
    }
};

router.use(authenticate);

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
    try {
        const result = await db.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0 || !result.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ error: 'Authorization check failed' });
    }
};

// Get all groups (admin endpoint)
router.get('/admin/all', requireAdmin, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT g.id, g.name, g.description, g.created_at,
                    COUNT(DISTINCT ug.user_id) as member_count
             FROM groups g
             LEFT JOIN user_groups ug ON g.id = ug.group_id
             GROUP BY g.id
             ORDER BY g.id ASC`
        );

        res.json({ groups: result.rows });
    } catch (error) {
        console.error('Get all groups error:', error);
        res.status(500).json({ error: 'Failed to get groups' });
    }
});

// Get all users (admin endpoint for user assignment)
router.get('/admin/users', requireAdmin, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT id, username, email, is_admin, created_at
             FROM users
             ORDER BY username ASC`
        );

        res.json({ users: result.rows });
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Get group members (admin endpoint)
router.get('/admin/:id/members', requireAdmin, async (req, res) => {
    try {
        const result = await db.query(
            `SELECT u.id, u.username, u.email, u.is_admin, ug.role, ug.created_at as joined_at
             FROM users u
             INNER JOIN user_groups ug ON u.id = ug.user_id
             WHERE ug.group_id = $1
             ORDER BY ug.created_at ASC`,
            [req.params.id]
        );

        res.json({ members: result.rows });
    } catch (error) {
        console.error('Get group members error:', error);
        res.status(500).json({ error: 'Failed to get members' });
    }
});

// Assign user to group (admin endpoint)
router.post('/admin/:id/assign', requireAdmin, async (req, res) => {
    try {
        const { userId, role } = req.body;
        const groupId = parseInt(req.params.id);

        if (!userId) {
            return res.status(400).json({ error: 'User ID is required' });
        }

        await db.query(
            `INSERT INTO user_groups (user_id, group_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, group_id) DO UPDATE SET role = $3`,
            [userId, groupId, role || 'member']
        );

        res.json({ message: 'User assigned to group successfully' });
    } catch (error) {
        console.error('Assign user error:', error);
        res.status(500).json({ error: 'Failed to assign user' });
    }
});

// Remove user from group (admin endpoint)
router.delete('/admin/:id/members/:userId', requireAdmin, async (req, res) => {
    try {
        const groupId = parseInt(req.params.id);
        const userId = parseInt(req.params.userId);

        // Prevent removing admin from Admin group
        if (groupId === 1) {
            const adminCheck = await db.query(
                'SELECT is_admin FROM users WHERE id = $1',
                [userId]
            );
            if (adminCheck.rows.length > 0 && adminCheck.rows[0].is_admin) {
                return res.status(403).json({ error: 'Cannot remove admin user from Admin group' });
            }
        }

        await db.query(
            'DELETE FROM user_groups WHERE group_id = $1 AND user_id = $2',
            [groupId, userId]
        );

        res.json({ message: 'User removed from group successfully' });
    } catch (error) {
        console.error('Remove user error:', error);
        res.status(500).json({ error: 'Failed to remove user' });
    }
});

// Get all groups for user
router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT g.id, g.name, g.description, g.created_at, g.updated_at,
                    ug.role,
                    u.username as created_by_username,
                    (SELECT COUNT(*) FROM user_groups WHERE group_id = g.id) as member_count,
                    (SELECT COUNT(*) FROM monitors WHERE group_id = g.id) as monitor_count
             FROM groups g
             INNER JOIN user_groups ug ON g.id = ug.group_id
             LEFT JOIN users u ON g.created_by = u.id
             WHERE ug.user_id = $1
             ORDER BY g.created_at DESC`,
            [req.userId]
        );

        res.json({ groups: result.rows });
    } catch (error) {
        console.error('Get groups error:', error);
        res.status(500).json({ error: 'Failed to get groups' });
    }
});

// Get single group
router.get('/:id', async (req, res) => {
    try {
        // Check user has access to this group
        const access = await db.query(
            'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
            [req.userId, req.params.id]
        );

        if (access.rows.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(
            `SELECT g.*, u.username as created_by_username
             FROM groups g
             LEFT JOIN users u ON g.created_by = u.id
             WHERE g.id = $1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Get members
        const members = await db.query(
            `SELECT u.id, u.username, u.email, ug.role, ug.created_at as joined_at
             FROM users u
             INNER JOIN user_groups ug ON u.id = ug.user_id
             WHERE ug.group_id = $1
             ORDER BY ug.created_at ASC`,
            [req.params.id]
        );

        const group = {
            ...result.rows[0],
            members: members.rows,
            userRole: access.rows[0].role
        };

        res.json({ group });
    } catch (error) {
        console.error('Get group error:', error);
        res.status(500).json({ error: 'Failed to get group' });
    }
});

// Create group
router.post('/', async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Create group
        const result = await db.query(
            `INSERT INTO groups (name, description, created_by)
             VALUES ($1, $2, $3)
             RETURNING *`,
            [name, description, req.userId]
        );

        const group = result.rows[0];

        // Add creator as owner
        await db.query(
            `INSERT INTO user_groups (user_id, group_id, role)
             VALUES ($1, $2, 'owner')`,
            [req.userId, group.id]
        );

        res.status(201).json({ group });
    } catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// Update group
router.put('/:id', async (req, res) => {
    try {
        // Check user is owner or admin
        const access = await db.query(
            'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
            [req.userId, req.params.id]
        );

        if (access.rows.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (!['owner', 'admin'].includes(access.rows[0].role)) {
            return res.status(403).json({ error: 'Only owners and admins can update groups' });
        }

        const { name, description } = req.body;
        const fields = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined) {
            fields.push(`name = $${paramCount}`);
            values.push(name);
            paramCount++;
        }

        if (description !== undefined) {
            fields.push(`description = $${paramCount}`);
            values.push(description);
            paramCount++;
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        fields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(req.params.id);

        const result = await db.query(
            `UPDATE groups SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
            values
        );

        res.json({ group: result.rows[0] });
    } catch (error) {
        console.error('Update group error:', error);
        res.status(500).json({ error: 'Failed to update group' });
    }
});

// Delete group
router.delete('/:id', async (req, res) => {
    try {
        // Check if user is admin
        const userResult = await db.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        const isAdmin = userResult.rows.length > 0 && userResult.rows[0].is_admin;

        // If not admin, check if user is owner
        if (!isAdmin) {
            const access = await db.query(
                'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
                [req.userId, req.params.id]
            );

            if (access.rows.length === 0 || access.rows[0].role !== 'owner') {
                return res.status(403).json({ error: 'Only owners or admins can delete groups' });
            }
        }

        await db.query('DELETE FROM groups WHERE id = $1', [req.params.id]);

        res.json({ message: 'Group deleted successfully' });
    } catch (error) {
        console.error('Delete group error:', error);
        res.status(500).json({ error: 'Failed to delete group' });
    }
});

// Add member to group
router.post('/:id/members', async (req, res) => {
    try {
        const { username, role = 'member' } = req.body;

        // Check user is owner or admin
        const access = await db.query(
            'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
            [req.userId, req.params.id]
        );

        if (access.rows.length === 0 || !['owner', 'admin'].includes(access.rows[0].role)) {
            return res.status(403).json({ error: 'Only owners and admins can add members' });
        }

        // Get user by username
        const user = await db.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (user.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Add to group
        await db.query(
            `INSERT INTO user_groups (user_id, group_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, group_id) DO UPDATE SET role = $3`,
            [user.rows[0].id, req.params.id, role]
        );

        res.json({ message: 'Member added successfully' });
    } catch (error) {
        console.error('Add member error:', error);
        res.status(500).json({ error: 'Failed to add member' });
    }
});

// Update member role
router.put('/:id/members/:userId', async (req, res) => {
    try {
        const { role } = req.body;

        // Check user is owner or admin
        const access = await db.query(
            'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
            [req.userId, req.params.id]
        );

        if (access.rows.length === 0 || !['owner', 'admin'].includes(access.rows[0].role)) {
            return res.status(403).json({ error: 'Only owners and admins can update roles' });
        }

        // Can't change owner's role
        const targetMember = await db.query(
            'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
            [req.params.userId, req.params.id]
        );

        if (targetMember.rows.length > 0 && targetMember.rows[0].role === 'owner') {
            return res.status(403).json({ error: 'Cannot change owner role' });
        }

        await db.query(
            'UPDATE user_groups SET role = $1 WHERE user_id = $2 AND group_id = $3',
            [role, req.params.userId, req.params.id]
        );

        res.json({ message: 'Role updated successfully' });
    } catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ error: 'Failed to update role' });
    }
});

// Remove member from group
router.delete('/:id/members/:userId', async (req, res) => {
    try {
        // Check user is owner or admin (or removing themselves)
        const access = await db.query(
            'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
            [req.userId, req.params.id]
        );

        if (access.rows.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const isRemovingSelf = req.userId === parseInt(req.params.userId);
        const canRemove = ['owner', 'admin'].includes(access.rows[0].role) || isRemovingSelf;

        if (!canRemove) {
            return res.status(403).json({ error: 'Permission denied' });
        }

        // Can't remove owner
        const targetMember = await db.query(
            'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
            [req.params.userId, req.params.id]
        );

        if (targetMember.rows.length > 0 && targetMember.rows[0].role === 'owner' && !isRemovingSelf) {
            return res.status(403).json({ error: 'Cannot remove owner' });
        }

        await db.query(
            'DELETE FROM user_groups WHERE user_id = $1 AND group_id = $2',
            [req.params.userId, req.params.id]
        );

        res.json({ message: 'Member removed successfully' });
    } catch (error) {
        console.error('Remove member error:', error);
        res.status(500).json({ error: 'Failed to remove member' });
    }
});

module.exports = router;
