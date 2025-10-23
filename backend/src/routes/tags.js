const express = require('express');
const db = require('../services/database');
const { verifyAPIKey, verifyToken } = require('../middleware/auth');

const router = express.Router();

// Helper function to check if user can create tags
async function canUserCreateTag(userId) {
    try {
        const userCheck = await db.query(
            'SELECT is_admin, email_verified FROM users WHERE id = $1',
            [userId]
        );

        if (userCheck.rows.length === 0) {
            return { allowed: false, reason: 'User not found' };
        }

        const user = userCheck.rows[0];

        // Admins can always create tags
        if (user.is_admin) {
            return { allowed: true };
        }

        // Regular users must verify email first
        if (!user.email_verified) {
            return { allowed: false, reason: 'Email verification required. You can resend the verification email from Account Settings.' };
        }

        return { allowed: true };
    } catch (error) {
        console.error('Error checking user permissions:', error);
        return { allowed: false, reason: 'Permission check failed' };
    }
}

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

// Get all tags accessible to user (personal + group tags)
router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT t.id, t.name, t.color, t.symbol, t.user_id, t.group_id, t.created_at,
                    g.name as group_name,
                    (SELECT COUNT(*) FROM monitor_tags WHERE tag_id = t.id) as monitor_count
             FROM tags t
             LEFT JOIN groups g ON t.group_id = g.id
             WHERE t.user_id = $1
                OR t.group_id IN (
                    SELECT group_id FROM user_groups WHERE user_id = $1
                )
             ORDER BY t.name ASC`,
            [req.userId]
        );

        res.json({ tags: result.rows });
    } catch (error) {
        console.error('Get tags error:', error);
        res.status(500).json({ error: 'Failed to get tags' });
    }
});

// Get tags for specific group
router.get('/group/:groupId', async (req, res) => {
    try {
        // Check user has access to this group
        const access = await db.query(
            'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
            [req.userId, req.params.groupId]
        );

        if (access.rows.length === 0) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const result = await db.query(
            `SELECT t.id, t.name, t.color, t.symbol, t.created_at,
                    (SELECT COUNT(*) FROM monitor_tags WHERE tag_id = t.id) as monitor_count
             FROM tags t
             WHERE t.group_id = $1
             ORDER BY t.name ASC`,
            [req.params.groupId]
        );

        res.json({ tags: result.rows });
    } catch (error) {
        console.error('Get group tags error:', error);
        res.status(500).json({ error: 'Failed to get tags' });
    }
});

// Create tag
router.post('/', async (req, res) => {
    try {
        const { name, color = '#3B82F6', symbol = 'tag.fill', groupId } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Name is required' });
        }

        // Check if user can create tags (email verification required for non-admins)
        const permission = await canUserCreateTag(req.userId);
        if (!permission.allowed) {
            return res.status(403).json({ error: permission.reason });
        }

        // If groupId is provided, check user has access
        if (groupId) {
            const access = await db.query(
                'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
                [req.userId, groupId]
            );

            if (access.rows.length === 0) {
                return res.status(403).json({ error: 'Access denied to this group' });
            }

            // Only admins and owners can create group tags
            if (!['owner', 'admin', 'member'].includes(access.rows[0].role)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
        }

        const result = await db.query(
            `INSERT INTO tags (name, color, symbol, user_id, group_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [name, color, symbol, groupId ? null : req.userId, groupId || null]
        );

        res.status(201).json({ tag: result.rows[0] });
    } catch (error) {
        console.error('Create tag error:', error);
        res.status(500).json({ error: 'Failed to create tag' });
    }
});

// Update tag
router.put('/:id', async (req, res) => {
    try {
        const { name, color, symbol } = req.body;

        // Check ownership or group access
        const tag = await db.query(
            'SELECT * FROM tags WHERE id = $1',
            [req.params.id]
        );

        if (tag.rows.length === 0) {
            return res.status(404).json({ error: 'Tag not found' });
        }

        const tagData = tag.rows[0];

        // Check permissions
        if (tagData.user_id && tagData.user_id !== req.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (tagData.group_id) {
            const access = await db.query(
                'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
                [req.userId, tagData.group_id]
            );

            if (access.rows.length === 0 || !['owner', 'admin', 'member'].includes(access.rows[0].role)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
        }

        const fields = [];
        const values = [];
        let paramCount = 1;

        if (name !== undefined) {
            fields.push(`name = $${paramCount}`);
            values.push(name);
            paramCount++;
        }

        if (color !== undefined) {
            fields.push(`color = $${paramCount}`);
            values.push(color);
            paramCount++;
        }

        if (symbol !== undefined) {
            fields.push(`symbol = $${paramCount}`);
            values.push(symbol);
            paramCount++;
        }

        if (fields.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        values.push(req.params.id);

        const result = await db.query(
            `UPDATE tags SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
            values
        );

        res.json({ tag: result.rows[0] });
    } catch (error) {
        console.error('Update tag error:', error);
        res.status(500).json({ error: 'Failed to update tag' });
    }
});

// Delete tag
router.delete('/:id', async (req, res) => {
    try {
        // Check ownership or group access
        const tag = await db.query(
            'SELECT * FROM tags WHERE id = $1',
            [req.params.id]
        );

        if (tag.rows.length === 0) {
            return res.status(404).json({ error: 'Tag not found' });
        }

        const tagData = tag.rows[0];

        // Check permissions
        if (tagData.user_id && tagData.user_id !== req.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (tagData.group_id) {
            const access = await db.query(
                'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
                [req.userId, tagData.group_id]
            );

            if (access.rows.length === 0 || !['owner', 'admin'].includes(access.rows[0].role)) {
                return res.status(403).json({ error: 'Only owners and admins can delete group tags' });
            }
        }

        await db.query('DELETE FROM tags WHERE id = $1', [req.params.id]);

        res.json({ message: 'Tag deleted successfully' });
    } catch (error) {
        console.error('Delete tag error:', error);
        res.status(500).json({ error: 'Failed to delete tag' });
    }
});

// Assign tag to monitor
router.post('/:id/monitors/:monitorId', async (req, res) => {
    try {
        // Check user has access to both tag and monitor
        const tag = await db.query(
            `SELECT t.* FROM tags t
             WHERE t.id = $1 AND (
                t.user_id = $2
                OR t.group_id IN (SELECT group_id FROM user_groups WHERE user_id = $2)
             )`,
            [req.params.id, req.userId]
        );

        if (tag.rows.length === 0) {
            return res.status(404).json({ error: 'Tag not found or access denied' });
        }

        const monitor = await db.query(
            `SELECT * FROM monitors
             WHERE id = $1 AND (
                user_id = $2
                OR group_id IN (SELECT group_id FROM user_groups WHERE user_id = $2)
             )`,
            [req.params.monitorId, req.userId]
        );

        if (monitor.rows.length === 0) {
            return res.status(404).json({ error: 'Monitor not found or access denied' });
        }

        await db.query(
            `INSERT INTO monitor_tags (monitor_id, tag_id)
             VALUES ($1, $2)
             ON CONFLICT (monitor_id, tag_id) DO NOTHING`,
            [req.params.monitorId, req.params.id]
        );

        res.json({ message: 'Tag assigned to monitor successfully' });
    } catch (error) {
        console.error('Assign tag error:', error);
        res.status(500).json({ error: 'Failed to assign tag' });
    }
});

// Remove tag from monitor
router.delete('/:id/monitors/:monitorId', async (req, res) => {
    try {
        await db.query(
            'DELETE FROM monitor_tags WHERE monitor_id = $1 AND tag_id = $2',
            [req.params.monitorId, req.params.id]
        );

        res.json({ message: 'Tag removed from monitor successfully' });
    } catch (error) {
        console.error('Remove tag error:', error);
        res.status(500).json({ error: 'Failed to remove tag' });
    }
});

// Get monitors for a tag
router.get('/:id/monitors', async (req, res) => {
    try {
        // Check user has access to tag
        const tag = await db.query(
            `SELECT * FROM tags
             WHERE id = $1 AND (
                user_id = $2
                OR group_id IN (SELECT group_id FROM user_groups WHERE user_id = $2)
             )`,
            [req.params.id, req.userId]
        );

        if (tag.rows.length === 0) {
            return res.status(404).json({ error: 'Tag not found or access denied' });
        }

        const result = await db.query(
            `SELECT m.id, m.name, m.type, m.url, m.hostname, m.current_status,
                    m.uptime_percentage, m.avg_response_time
             FROM monitors m
             INNER JOIN monitor_tags mt ON m.id = mt.monitor_id
             WHERE mt.tag_id = $1
             ORDER BY m.name ASC`,
            [req.params.id]
        );

        res.json({ monitors: result.rows });
    } catch (error) {
        console.error('Get tag monitors error:', error);
        res.status(500).json({ error: 'Failed to get monitors' });
    }
});

module.exports = router;
