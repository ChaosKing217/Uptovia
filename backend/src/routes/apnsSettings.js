const express = require('express');
const db = require('../services/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

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

router.use(verifyToken);
router.use(requireAdmin);

// Get APNS settings
router.get('/', async (req, res) => {
    try {
        // Check if table exists and create it if it doesn't
        await db.query(`
            CREATE TABLE IF NOT EXISTS apns_settings (
                id SERIAL PRIMARY KEY,
                apns_key_path VARCHAR(500),
                apns_key_id VARCHAR(100),
                apns_team_id VARCHAR(100),
                apns_bundle_id VARCHAR(200),
                is_configured BOOLEAN DEFAULT false,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER REFERENCES users(id)
            )
        `);

        const result = await db.query('SELECT * FROM apns_settings ORDER BY id LIMIT 1');

        if (result.rows.length === 0) {
            // Create default settings
            const defaultResult = await db.query(
                'INSERT INTO apns_settings (is_configured) VALUES (false) RETURNING *'
            );
            return res.json({ settings: defaultResult.rows[0] });
        }

        res.json({ settings: result.rows[0] });
    } catch (error) {
        console.error('Get APNS settings error:', error);
        res.status(500).json({ error: error.message || 'Failed to get APNS settings' });
    }
});

// Update APNS settings
router.put('/', async (req, res) => {
    try {
        const { apns_key_path, apns_key_id, apns_team_id, apns_bundle_id } = req.body;

        // Check if settings exist, create if not
        const existingSettings = await db.query('SELECT id FROM apns_settings LIMIT 1');
        if (existingSettings.rows.length === 0) {
            await db.query('INSERT INTO apns_settings (is_configured) VALUES (false)');
        }

        // Mark as configured if all required fields are present
        const isConfigured = !!(apns_key_path && apns_key_id && apns_team_id && apns_bundle_id);

        const result = await db.query(
            `UPDATE apns_settings
             SET apns_key_path = $1,
                 apns_key_id = $2,
                 apns_team_id = $3,
                 apns_bundle_id = $4,
                 is_configured = $5,
                 updated_at = CURRENT_TIMESTAMP,
                 updated_by = $6
             WHERE id = (SELECT id FROM apns_settings ORDER BY id LIMIT 1)
             RETURNING *`,
            [apns_key_path, apns_key_id, apns_team_id, apns_bundle_id, isConfigured, req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'APNS settings not found' });
        }

        res.json({ settings: result.rows[0], message: 'APNS settings updated successfully' });
    } catch (error) {
        console.error('Update APNS settings error:', error);
        res.status(500).json({ error: error.message || 'Failed to update APNS settings' });
    }
});

module.exports = router;
