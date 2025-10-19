const express = require('express');
const db = require('../services/database');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Middleware to check if user is admin
const requireAdmin = async (req, res, next) => {
    try {
        const result = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.userId]);

        if (result.rows.length === 0 || !result.rows[0].is_admin) {
            return res.status(403).json({ error: 'Admin access required' });
        }

        next();
    } catch (error) {
        console.error('Admin check error:', error);
        res.status(500).json({ error: 'Authorization failed' });
    }
};

// ============================================
// TURNSTILE SETTINGS
// ============================================

// Get Turnstile settings
router.get('/turnstile', verifyToken, requireAdmin, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT site_key, secret_key, is_enabled FROM turnstile_settings ORDER BY id DESC LIMIT 1'
        );

        if (result.rows.length === 0) {
            return res.json({
                site_key: '',
                secret_key: '',
                is_enabled: false
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Get Turnstile settings error:', error);
        res.status(500).json({ error: 'Failed to load Turnstile settings' });
    }
});

// Save Turnstile settings
router.post('/turnstile', verifyToken, requireAdmin, async (req, res) => {
    try {
        const { isEnabled, siteKey, secretKey } = req.body;

        // Check if settings exist
        const existing = await db.query('SELECT id FROM turnstile_settings LIMIT 1');

        if (existing.rows.length === 0) {
            // Insert new settings
            await db.query(
                `INSERT INTO turnstile_settings (site_key, secret_key, is_enabled, updated_by)
                 VALUES ($1, $2, $3, $4)`,
                [siteKey, secretKey, isEnabled, req.userId]
            );
        } else {
            // Update existing settings
            await db.query(
                `UPDATE turnstile_settings
                 SET site_key = $1,
                     secret_key = $2,
                     is_enabled = $3,
                     updated_by = $4,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $5`,
                [siteKey, secretKey, isEnabled, req.userId, existing.rows[0].id]
            );
        }

        res.json({ message: 'Turnstile settings updated successfully' });
    } catch (error) {
        console.error('Save Turnstile settings error:', error);
        res.status(500).json({ error: 'Failed to save Turnstile settings' });
    }
});

// Get public Turnstile configuration (for unauthenticated users)
router.get('/turnstile/public', async (req, res) => {
    try {
        const result = await db.query(
            'SELECT site_key, is_enabled FROM turnstile_settings ORDER BY id DESC LIMIT 1'
        );

        if (result.rows.length === 0 || !result.rows[0].is_enabled) {
            return res.json({
                enabled: false,
                siteKey: null
            });
        }

        res.json({
            enabled: true,
            siteKey: result.rows[0].site_key
        });
    } catch (error) {
        console.error('Get public Turnstile config error:', error);
        res.json({ enabled: false, siteKey: null });
    }
});

module.exports = router;
