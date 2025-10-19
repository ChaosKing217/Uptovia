const express = require('express');
const db = require('../services/database');
const { verifyAPIKey, verifyToken } = require('../middleware/auth');

const router = express.Router();

// Helper function to get user's subscription plan limits
async function getUserPlanLimits(userId) {
    try {
        // Check if user is admin (admins have no limits)
        const adminCheck = await db.query(
            'SELECT is_admin FROM users WHERE id = $1',
            [userId]
        );

        if (adminCheck.rows.length > 0 && adminCheck.rows[0].is_admin) {
            return { maxMonitors: -1, maxTags: -1, planName: 'Admin' };
        }

        // Get user's subscription plan (Free Plan: id 2, Starter Plan: id 3, Pro Plan: id 4)
        const planResult = await db.query(
            `SELECT group_id FROM user_groups
             WHERE user_id = $1 AND group_id IN (2, 3, 4)
             ORDER BY group_id DESC LIMIT 1`,
            [userId]
        );

        if (planResult.rows.length === 0) {
            // Default to Free Plan if no subscription found
            return { maxMonitors: 5, maxTags: 2, planName: 'Free Plan' };
        }

        const groupId = planResult.rows[0].group_id;

        // Return limits based on plan
        switch (groupId) {
            case 2: // Free Plan
                return { maxMonitors: 5, maxTags: 2, planName: 'Free Plan' };
            case 3: // Starter Plan
                return { maxMonitors: 10, maxTags: 5, planName: 'Starter Plan' };
            case 4: // Pro Plan
                return { maxMonitors: -1, maxTags: -1, planName: 'Pro Plan' }; // -1 = unlimited
            default:
                return { maxMonitors: 5, maxTags: 2, planName: 'Free Plan' };
        }
    } catch (error) {
        console.error('Error getting plan limits:', error);
        return { maxMonitors: 5, maxTags: 2, planName: 'Free Plan' };
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

// Get all monitors for user (personal + group monitors)
router.get('/', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT m.id, m.name, m.type, m.url, m.hostname, m.port, m.method, m.check_interval,
                    m.retry_interval, m.max_retries, m.timeout, m.active, m.current_status,
                    m.last_check, m.uptime_percentage, m.avg_response_time, m.ssl_cert_expiry,
                    m.ssl_cert_days_remaining, m.notify_on_down, m.notify_on_up, m.created_at,
                    m.user_id, m.group_id,
                    g.name as group_name,
                    COALESCE(
                        json_agg(
                            json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                        ) FILTER (WHERE t.id IS NOT NULL),
                        '[]'
                    ) as tags,
                    COALESCE(
                        array_agg(t.id) FILTER (WHERE t.id IS NOT NULL),
                        ARRAY[]::INTEGER[]
                    ) as tag_ids
             FROM monitors m
             LEFT JOIN groups g ON m.group_id = g.id
             LEFT JOIN monitor_tags mt ON m.id = mt.monitor_id
             LEFT JOIN tags t ON mt.tag_id = t.id
             WHERE m.user_id = $1
                OR m.group_id IN (
                    SELECT group_id FROM user_groups WHERE user_id = $1
                )
             GROUP BY m.id, g.name
             ORDER BY m.created_at DESC`,
            [req.userId]
        );

        res.json({ monitors: result.rows });
    } catch (error) {
        console.error('Get monitors error:', error);
        res.status(500).json({ error: 'Failed to get monitors' });
    }
});

// Get single monitor
router.get('/:id', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT m.*, g.name as group_name,
                    COALESCE(
                        json_agg(
                            json_build_object('id', t.id, 'name', t.name, 'color', t.color)
                        ) FILTER (WHERE t.id IS NOT NULL),
                        '[]'
                    ) as tags,
                    COALESCE(
                        array_agg(t.id) FILTER (WHERE t.id IS NOT NULL),
                        ARRAY[]::INTEGER[]
                    ) as tag_ids
             FROM monitors m
             LEFT JOIN groups g ON m.group_id = g.id
             LEFT JOIN monitor_tags mt ON m.id = mt.monitor_id
             LEFT JOIN tags t ON mt.tag_id = t.id
             WHERE m.id = $1 AND (
                m.user_id = $2
                OR m.group_id IN (SELECT group_id FROM user_groups WHERE user_id = $2)
             )
             GROUP BY m.id, g.name`,
            [req.params.id, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Monitor not found' });
        }

        res.json({ monitor: result.rows[0] });
    } catch (error) {
        console.error('Get monitor error:', error);
        res.status(500).json({ error: 'Failed to get monitor' });
    }
});

// Create monitor
router.post('/', async (req, res) => {
    try {
        const {
            name, type, url, hostname, port, method, accepted_status_codes,
            check_interval, retry_interval, max_retries, timeout, active,
            notify_on_down, notify_on_up, dns_resolver, dns_record_type,
            auth_method, auth_username, auth_password, groupId, tags
        } = req.body;

        if (!name || !type) {
            return res.status(400).json({ error: 'Name and type are required' });
        }

        // Check subscription limits before creating monitor
        const limits = await getUserPlanLimits(req.userId);

        // Count existing monitors for this user
        const countResult = await db.query(
            'SELECT COUNT(*) as count FROM monitors WHERE user_id = $1',
            [req.userId]
        );
        const currentMonitorCount = parseInt(countResult.rows[0].count);

        // Check if user has reached their limit (unlimited = -1)
        if (limits.maxMonitors !== -1 && currentMonitorCount >= limits.maxMonitors) {
            return res.status(403).json({
                error: `Monitor limit reached. Your ${limits.planName} allows a maximum of ${limits.maxMonitors} monitors.`,
                limit: limits.maxMonitors,
                current: currentMonitorCount
            });
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
        }

        const result = await db.query(
            `INSERT INTO monitors
             (user_id, group_id, name, type, url, hostname, port, method, accepted_status_codes,
              check_interval, retry_interval, max_retries, timeout, active,
              notify_on_down, notify_on_up, dns_resolver, dns_record_type,
              auth_method, auth_username, auth_password)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
             RETURNING *`,
            [
                groupId ? null : req.userId, groupId || null, name, type, url, hostname, port,
                method, accepted_status_codes, check_interval || 60, retry_interval || 60,
                max_retries || 3, timeout || 30, active !== false, notify_on_down !== false,
                notify_on_up !== false, dns_resolver, dns_record_type,
                auth_method, auth_username, auth_password
            ]
        );

        const monitor = result.rows[0];

        // Add tags if provided
        if (tags && Array.isArray(tags) && tags.length > 0) {
            for (const tagId of tags) {
                await db.query(
                    'INSERT INTO monitor_tags (monitor_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                    [monitor.id, tagId]
                );
            }
        }

        // Fetch complete monitor data with tags
        const completeResult = await db.query(
            `SELECT m.*, g.name as group_name,
                    COALESCE(
                        array_agg(t.id) FILTER (WHERE t.id IS NOT NULL),
                        ARRAY[]::INTEGER[]
                    ) as tag_ids
             FROM monitors m
             LEFT JOIN groups g ON m.group_id = g.id
             LEFT JOIN monitor_tags mt ON m.id = mt.monitor_id
             LEFT JOIN tags t ON mt.tag_id = t.id
             WHERE m.id = $1
             GROUP BY m.id, g.name`,
            [monitor.id]
        );

        res.status(201).json({ monitor: completeResult.rows[0] });
    } catch (error) {
        console.error('Create monitor error:', error);
        res.status(500).json({ error: 'Failed to create monitor' });
    }
});

// Update monitor
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        // Check ownership or group access
        const existing = await db.query(
            `SELECT * FROM monitors
             WHERE id = $1 AND (
                user_id = $2
                OR group_id IN (
                    SELECT group_id FROM user_groups
                    WHERE user_id = $2 AND role IN ('owner', 'admin', 'member')
                )
             )`,
            [id, req.userId]
        );

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Monitor not found or access denied' });
        }

        // Build update query dynamically
        const fields = [];
        const values = [];
        let paramCount = 1;

        const allowedFields = [
            'name', 'type', 'url', 'hostname', 'port', 'method', 'accepted_status_codes',
            'check_interval', 'retry_interval', 'max_retries', 'timeout', 'active',
            'notify_on_down', 'notify_on_up', 'dns_resolver', 'dns_record_type',
            'auth_method', 'auth_username', 'auth_password'
        ];

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = $${paramCount}`);
                values.push(updates[field]);
                paramCount++;
            }
        }

        if (fields.length === 0 && updates.tags === undefined) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        fields.push(`updated_at = CURRENT_TIMESTAMP`);
        values.push(id);

        const query = `UPDATE monitors SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

        const result = await db.query(query, values);
        const monitor = result.rows[0];

        // Update tags if provided
        if (updates.tags !== undefined && Array.isArray(updates.tags)) {
            // Remove all existing tags for this monitor
            await db.query('DELETE FROM monitor_tags WHERE monitor_id = $1', [id]);

            // Add new tags
            if (updates.tags.length > 0) {
                for (const tagId of updates.tags) {
                    await db.query(
                        'INSERT INTO monitor_tags (monitor_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                        [id, tagId]
                    );
                }
            }
        }

        // Fetch complete monitor data with tags
        const completeResult = await db.query(
            `SELECT m.*, g.name as group_name,
                    COALESCE(
                        array_agg(t.id) FILTER (WHERE t.id IS NOT NULL),
                        ARRAY[]::INTEGER[]
                    ) as tag_ids
             FROM monitors m
             LEFT JOIN groups g ON m.group_id = g.id
             LEFT JOIN monitor_tags mt ON m.id = mt.monitor_id
             LEFT JOIN tags t ON mt.tag_id = t.id
             WHERE m.id = $1
             GROUP BY m.id, g.name`,
            [id]
        );

        res.json({ monitor: completeResult.rows[0] });
    } catch (error) {
        console.error('Update monitor error:', error);
        res.status(500).json({ error: 'Failed to update monitor' });
    }
});

// Clear all monitoring data (monitors and check history)
// IMPORTANT: This must come BEFORE the /:id route to avoid "clear-all" being matched as an ID
router.delete('/clear-all', async (req, res) => {
    try {
        // Delete all monitors owned by the user (cascading delete will handle check_history and monitor_tags)
        const result = await db.query(
            'DELETE FROM monitors WHERE user_id = $1 RETURNING id',
            [req.userId]
        );

        const deletedCount = result.rows.length;

        console.log(`User ${req.userId} cleared ${deletedCount} monitors`);

        res.json({
            message: `Successfully deleted ${deletedCount} monitor(s) and all associated data`,
            deletedCount
        });
    } catch (error) {
        console.error('Clear all data error:', error);
        console.error('Error details:', error.stack);
        res.status(500).json({ error: 'Failed to clear monitoring data', details: error.message });
    }
});

// Delete monitor
router.delete('/:id', async (req, res) => {
    try {
        // Check ownership or group admin/owner access
        const monitor = await db.query(
            `SELECT * FROM monitors WHERE id = $1`,
            [req.params.id]
        );

        if (monitor.rows.length === 0) {
            return res.status(404).json({ error: 'Monitor not found' });
        }

        const monitorData = monitor.rows[0];

        // Check permissions
        if (monitorData.user_id && monitorData.user_id !== req.userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        if (monitorData.group_id) {
            const access = await db.query(
                'SELECT role FROM user_groups WHERE user_id = $1 AND group_id = $2',
                [req.userId, monitorData.group_id]
            );

            if (access.rows.length === 0 || !['owner', 'admin', 'member'].includes(access.rows[0].role)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
        }

        await db.query('DELETE FROM monitors WHERE id = $1', [req.params.id]);

        res.json({ message: 'Monitor deleted successfully' });
    } catch (error) {
        console.error('Delete monitor error:', error);
        res.status(500).json({ error: 'Failed to delete monitor' });
    }
});

// Get monitor check history
router.get('/:id/history', async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;

        // Verify ownership
        const monitor = await db.query(
            'SELECT id FROM monitors WHERE id = $1 AND user_id = $2',
            [req.params.id, req.userId]
        );

        if (monitor.rows.length === 0) {
            return res.status(404).json({ error: 'Monitor not found' });
        }

        const result = await db.query(
            `SELECT id, status, response_time, status_code, error_message, checked_at
             FROM check_history
             WHERE monitor_id = $1
             ORDER BY checked_at DESC
             LIMIT $2 OFFSET $3`,
            [req.params.id, limit, offset]
        );

        res.json({ history: result.rows });
    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Failed to get history' });
    }
});

// Get monitor statistics
router.get('/:id/stats', async (req, res) => {
    try {
        // Verify ownership
        const monitor = await db.query(
            'SELECT id FROM monitors WHERE id = $1 AND user_id = $2',
            [req.params.id, req.userId]
        );

        if (monitor.rows.length === 0) {
            return res.status(404).json({ error: 'Monitor not found' });
        }

        // Get stats for last 24 hours
        const stats = await db.query(
            `SELECT
                COUNT(*) as total_checks,
                COUNT(CASE WHEN status = 'up' THEN 1 END) as successful_checks,
                COUNT(CASE WHEN status = 'down' THEN 1 END) as failed_checks,
                AVG(response_time) as avg_response_time,
                MIN(response_time) as min_response_time,
                MAX(response_time) as max_response_time
             FROM check_history
             WHERE monitor_id = $1 AND checked_at > NOW() - INTERVAL '24 hours'`,
            [req.params.id]
        );

        res.json({ stats: stats.rows[0] });
    } catch (error) {
        console.error('Get stats error:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

module.exports = router;
