const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../services/database');
const emailService = require('../services/emailService');
const { verifyToken, verifyAPIKey } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Verify Cloudflare Turnstile token
async function verifyTurnstileToken(token, remoteip) {
    try {
        // Get Turnstile settings
        const settingsResult = await db.query(
            'SELECT secret_key, is_enabled FROM turnstile_settings ORDER BY id DESC LIMIT 1'
        );

        // If Turnstile is not enabled, skip verification
        if (settingsResult.rows.length === 0 || !settingsResult.rows[0].is_enabled) {
            return { success: true, message: 'Turnstile not enabled' };
        }

        const secretKey = settingsResult.rows[0].secret_key;

        // If no token provided but Turnstile is enabled
        if (!token) {
            return { success: false, message: 'Turnstile verification required' };
        }

        // Verify token with Cloudflare
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                secret: secretKey,
                response: token,
                remoteip: remoteip
            }),
        });

        const data = await response.json();

        if (data.success) {
            return { success: true, message: 'Verification successful' };
        } else {
            return { success: false, message: 'Turnstile verification failed', errors: data['error-codes'] };
        }
    } catch (error) {
        console.error('Turnstile verification error:', error);
        return { success: false, message: 'Turnstile verification error' };
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

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { username, password, email, turnstileToken } = req.body;

        // Verify Turnstile token
        const turnstileVerification = await verifyTurnstileToken(turnstileToken, req.ip);
        if (!turnstileVerification.success) {
            return res.status(400).json({ error: turnstileVerification.message || 'Bot verification failed' });
        }

        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        if (!/[A-Z]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
        }

        if (!/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one number or symbol' });
        }

        // Validate email
        if (!isValidEmail(email)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        // Check if username exists
        const existingUser = await db.query(
            'SELECT id FROM users WHERE username = $1',
            [username]
        );

        if (existingUser.rows.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Check if email exists
        const existingEmail = await db.query(
            'SELECT id FROM users WHERE email = $1',
            [email]
        );

        if (existingEmail.rows.length > 0) {
            return res.status(400).json({ error: 'Email already exists' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Generate API key
        const apiKey = crypto.randomBytes(32).toString('hex');

        // Generate email verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpiry = new Date(Date.now() + 86400000); // 24 hours from now

        // Create user
        const result = await db.query(
            'INSERT INTO users (username, email, password_hash, api_key, email_verification_token, email_verification_expires) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, api_key',
            [username, email || null, passwordHash, apiKey, verificationToken, verificationExpiry]
        );

        const user = result.rows[0];

        // Assign user to Member group (id: 2) by default
        try {
            await db.query(
                'INSERT INTO user_groups (user_id, group_id, role) VALUES ($1, 2, $2)',
                [user.id, 'member']
            );
        } catch (error) {
            console.error('Failed to assign user to Member group:', error);
            // Don't fail registration if group assignment fails
        }

        // Send verification email
        if (email) {
            try {
                await emailService.sendVerificationEmail(email, username, verificationToken);
            } catch (error) {
                console.error('Failed to send verification email:', error);
                // Don't fail registration if email fails
            }
        }

        // Generate JWT
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                apiKey: user.api_key
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { username, password, turnstileToken } = req.body;

        // Verify Turnstile token
        const turnstileVerification = await verifyTurnstileToken(turnstileToken, req.ip);
        if (!turnstileVerification.success) {
            return res.status(400).json({ error: turnstileVerification.message || 'Bot verification failed' });
        }

        if (!username || !password) {
            return res.status(400).json({ error: 'Username or email and password required' });
        }

        // Get user by username or email
        const result = await db.query(
            'SELECT id, username, password_hash, api_key, force_password_reset, force_username_change, email_verified FROM users WHERE username = $1 OR (email IS NOT NULL AND email = $1)',
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        // Generate JWT
        const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '30d' });

        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                apiKey: user.api_key,
                forcePasswordReset: user.force_password_reset,
                forceUsernameChange: user.force_username_change,
                emailVerified: user.email_verified
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
    try {
        const result = await db.query(
            'SELECT id, username, email, api_key, is_admin, email_verified, created_at FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Get user's groups
        const groupsResult = await db.query(
            `SELECT g.id, g.name, ug.role
             FROM groups g
             INNER JOIN user_groups ug ON g.id = ug.group_id
             WHERE ug.user_id = $1
             ORDER BY g.id ASC`,
            [req.userId]
        );

        const user = {
            ...result.rows[0],
            groups: groupsResult.rows
        };

        res.json({ user });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
});

// Change password
router.post('/change-password', verifyToken, async (req, res) => {
    try {
        const { currentPassword, newPassword, newEmail, newUsername } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Current password and new password are required' });
        }

        // Validate new password strength
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        if (!/[A-Z]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
        }

        if (!/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password must contain at least one number or symbol' });
        }

        // Validate username if provided
        if (newUsername) {
            if (newUsername.length < 3) {
                return res.status(400).json({ error: 'Username must be at least 3 characters' });
            }

            // Check if username already exists for another user
            const usernameCheck = await db.query(
                'SELECT id FROM users WHERE username = $1 AND id != $2',
                [newUsername, req.userId]
            );

            if (usernameCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Username already exists' });
            }
        }

        // Validate email if provided
        if (newEmail) {
            if (!isValidEmail(newEmail)) {
                return res.status(400).json({ error: 'Invalid email address' });
            }

            // Check if email already exists for another user
            const emailCheck = await db.query(
                'SELECT id FROM users WHERE email = $1 AND id != $2',
                [newEmail, req.userId]
            );

            if (emailCheck.rows.length > 0) {
                return res.status(400).json({ error: 'Email already exists' });
            }
        }

        // Get user's current password hash
        const result = await db.query(
            'SELECT password_hash FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, result.rows[0].password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const newPasswordHash = await bcrypt.hash(newPassword, 10);

        // Build dynamic update query
        const updates = ['password_hash = $1', 'force_password_reset = false', 'force_username_change = false', 'updated_at = CURRENT_TIMESTAMP'];
        const values = [newPasswordHash];
        let paramCount = 2;

        if (newUsername) {
            updates.push(`username = $${paramCount}`);
            values.push(newUsername);
            paramCount++;
        }

        if (newEmail) {
            updates.push(`email = $${paramCount}`);
            values.push(newEmail);
            paramCount++;
        }

        values.push(req.userId);

        await db.query(
            `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramCount}`,
            values
        );

        res.json({ message: 'Password changed successfully' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// Regenerate API key
router.post('/regenerate-api-key', verifyToken, async (req, res) => {
    try {
        const newApiKey = crypto.randomBytes(32).toString('hex');

        await db.query(
            'UPDATE users SET api_key = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newApiKey, req.userId]
        );

        res.json({ apiKey: newApiKey });
    } catch (error) {
        console.error('API key regeneration error:', error);
        res.status(500).json({ error: 'Failed to regenerate API key' });
    }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
    try {
        const { identifier } = req.body; // Can be email or username

        if (!identifier) {
            return res.status(400).json({ error: 'Email or username is required' });
        }

        // Find user by email or username
        const result = await db.query(
            'SELECT id, username, email FROM users WHERE email = $1 OR username = $1',
            [identifier]
        );

        // Always return success even if user not found (security)
        if (result.rows.length === 0) {
            return res.json({ message: 'If an account exists with this email or username, a password reset link has been sent.' });
        }

        const user = result.rows[0];

        // Check if user has an email address
        if (!user.email) {
            return res.json({ message: 'If an account exists with this email or username, a password reset link has been sent.' });
        }

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 1800000); // 30 minutes from now

        // Save token to database
        await db.query(
            'UPDATE users SET reset_token = $1, reset_token_expiry = $2 WHERE id = $3',
            [resetToken, resetTokenExpiry, user.id]
        );

        // Send reset email
        try {
            await emailService.sendPasswordResetEmail(user.email, user.username, resetToken);
        } catch (error) {
            console.error('Failed to send reset email:', error);
            return res.status(500).json({ error: 'Failed to send reset email. Please check your email configuration in settings.' });
        }

        res.json({ message: 'If an account exists with this email or username, a password reset link has been sent.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Failed to process password reset request' });
    }
});

// Reset password with token
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        // Validate password strength (same as registration)
        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        if (!/[A-Z]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
        }

        if (!/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
            return res.status(400).json({ error: 'Password must contain at least one number or symbol' });
        }

        // Find user with valid token
        const result = await db.query(
            'SELECT id, username FROM users WHERE reset_token = $1 AND reset_token_expiry > NOW()',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token. Please request a new password reset link.' });
        }

        const user = result.rows[0];

        // Hash new password
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Update password and clear reset token
        await db.query(
            'UPDATE users SET password_hash = $1, reset_token = NULL, reset_token_expiry = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [passwordHash, user.id]
        );

        res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Delete account
router.delete('/account', verifyToken, async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Password is required to delete your account' });
        }

        // Get user's current password hash and admin status
        const result = await db.query(
            'SELECT password_hash, is_admin FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        // Prevent admin account deletion
        if (user.is_admin) {
            return res.status(403).json({ error: 'Admin accounts cannot be deleted. Please remove admin privileges first or contact another administrator.' });
        }

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        // Delete user (cascading deletes will handle related data)
        await db.query('DELETE FROM users WHERE id = $1', [req.userId]);

        res.json({ message: 'Account deleted successfully' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

// Verify email
router.get('/verify-email', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: 'Verification token is required' });
        }

        // Find user with valid token
        const result = await db.query(
            'SELECT id, username, email FROM users WHERE email_verification_token = $1 AND email_verification_expires > NOW()',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Verification Failed - Uptime Monitor</title>
                    <style>
                        * {
                            margin: 0;
                            padding: 0;
                            box-sizing: border-box;
                        }

                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                            background: linear-gradient(135deg, #FF3B30 0%, #FF9500 100%);
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            padding: 20px;
                        }

                        .container {
                            background: white;
                            border-radius: 16px;
                            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                            max-width: 500px;
                            width: 100%;
                            padding: 48px 32px;
                            text-align: center;
                        }

                        .icon {
                            font-size: 72px;
                            margin-bottom: 24px;
                        }

                        h1 {
                            color: #1d1d1f;
                            font-size: 28px;
                            font-weight: 600;
                            margin-bottom: 16px;
                        }

                        p {
                            color: #86868b;
                            font-size: 16px;
                            line-height: 1.5;
                            margin-bottom: 32px;
                        }

                        .button {
                            display: inline-block;
                            background: #007AFF;
                            color: white;
                            padding: 14px 32px;
                            border-radius: 8px;
                            text-decoration: none;
                            font-weight: 600;
                            font-size: 16px;
                            transition: background 0.2s;
                        }

                        .button:hover {
                            background: #0051D5;
                        }

                        .error-badge {
                            display: inline-block;
                            background: #FFEBEE;
                            color: #FF3B30;
                            padding: 8px 16px;
                            border-radius: 20px;
                            font-size: 14px;
                            font-weight: 600;
                            margin-bottom: 24px;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="icon">❌</div>
                        <div class="error-badge">Verification Failed</div>
                        <h1>Invalid or Expired Link</h1>
                        <p>This verification link is invalid or has expired. Please request a new verification email from your account settings.</p>
                        <a href="/" class="button">Go to Dashboard</a>
                    </div>
                </body>
                </html>
            `);
        }

        const user = result.rows[0];

        // Mark email as verified and clear token
        await db.query(
            'UPDATE users SET email_verified = true, email_verification_token = NULL, email_verification_expires = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
            [user.id]
        );

        // Send welcome email after successful verification
        try {
            await emailService.sendWelcomeEmail(user.email, user.username);
        } catch (emailError) {
            // Log error but don't fail the verification
            console.error('Failed to send welcome email:', emailError);
        }

        // Return HTML page instead of JSON
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Email Verified - Uptime Monitor</title>
                <style>
                    * {
                        margin: 0;
                        padding: 0;
                        box-sizing: border-box;
                    }

                    body {
                        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                        background: linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%);
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 20px;
                    }

                    .container {
                        background: white;
                        border-radius: 16px;
                        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                        max-width: 500px;
                        width: 100%;
                        padding: 48px 32px;
                        text-align: center;
                    }

                    .icon {
                        font-size: 72px;
                        margin-bottom: 24px;
                        animation: bounce 1s ease;
                    }

                    @keyframes bounce {
                        0%, 100% { transform: translateY(0); }
                        50% { transform: translateY(-20px); }
                    }

                    h1 {
                        color: #1d1d1f;
                        font-size: 28px;
                        font-weight: 600;
                        margin-bottom: 16px;
                    }

                    p {
                        color: #86868b;
                        font-size: 16px;
                        line-height: 1.5;
                        margin-bottom: 32px;
                    }

                    .button {
                        display: inline-block;
                        background: #007AFF;
                        color: white;
                        padding: 14px 32px;
                        border-radius: 8px;
                        text-decoration: none;
                        font-weight: 600;
                        font-size: 16px;
                        transition: background 0.2s;
                    }

                    .button:hover {
                        background: #0051D5;
                    }

                    .success-badge {
                        display: inline-block;
                        background: #E3F2FD;
                        color: #007AFF;
                        padding: 8px 16px;
                        border-radius: 20px;
                        font-size: 14px;
                        font-weight: 600;
                        margin-bottom: 24px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">✅</div>
                    <div class="success-badge">Email Verified</div>
                    <h1>Your email has been verified!</h1>
                    <p>Thank you for verifying your email address. Your Uptime Monitor account is now fully activated and you can access all features.</p>
                    <p style="color: #1d1d1f; font-weight: 500; margin-bottom: 24px;">We've sent you a welcome email with tips to get started!</p>
                    <a href="/" class="button">Go to Dashboard</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Email verification error:', error);
        res.status(500).json({ error: 'Failed to verify email' });
    }
});

// Resend verification email
router.post('/resend-verification', verifyToken, async (req, res) => {
    try {
        // Get user's current info
        const result = await db.query(
            'SELECT id, username, email, email_verified FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        if (user.email_verified) {
            return res.status(400).json({ error: 'Email is already verified' });
        }

        if (!user.email) {
            return res.status(400).json({ error: 'No email address associated with this account' });
        }

        // Generate new verification token
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpiry = new Date(Date.now() + 86400000); // 24 hours from now

        // Update token in database
        await db.query(
            'UPDATE users SET email_verification_token = $1, email_verification_expires = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [verificationToken, verificationExpiry, user.id]
        );

        // Send verification email
        try {
            await emailService.sendVerificationEmail(user.email, user.username, verificationToken);
        } catch (error) {
            console.error('Failed to send verification email:', error);
            return res.status(500).json({ error: 'Failed to send verification email. Please check your email configuration in settings.' });
        }

        res.json({ message: 'Verification email sent successfully. Please check your inbox.' });
    } catch (error) {
        console.error('Resend verification error:', error);
        res.status(500).json({ error: 'Failed to resend verification email' });
    }
});

// Change email address
router.post('/change-email', verifyToken, async (req, res) => {
    try {
        const { newEmail, password } = req.body;

        if (!newEmail || !password) {
            return res.status(400).json({ error: 'New email and password are required' });
        }

        // Validate email format
        if (!isValidEmail(newEmail)) {
            return res.status(400).json({ error: 'Invalid email address' });
        }

        // Get user's current password hash
        const result = await db.query(
            'SELECT password_hash, email FROM users WHERE id = $1',
            [req.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = result.rows[0];

        // Verify password
        const isValid = await bcrypt.compare(password, user.password_hash);

        if (!isValid) {
            return res.status(401).json({ error: 'Incorrect password' });
        }

        // Check if email is already in use by another user
        const emailCheck = await db.query(
            'SELECT id FROM users WHERE email = $1 AND id != $2',
            [newEmail, req.userId]
        );

        if (emailCheck.rows.length > 0) {
            return res.status(400).json({ error: 'Email address is already in use' });
        }

        // Generate new verification token for the new email
        const verificationToken = crypto.randomBytes(32).toString('hex');
        const verificationExpiry = new Date(Date.now() + 86400000); // 24 hours from now

        // Update email and set as unverified
        await db.query(
            'UPDATE users SET email = $1, email_verified = false, email_verification_token = $2, email_verification_expires = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
            [newEmail, verificationToken, verificationExpiry, req.userId]
        );

        // Get username for email
        const userResult = await db.query(
            'SELECT username FROM users WHERE id = $1',
            [req.userId]
        );

        const username = userResult.rows[0].username;

        // Send verification email to new address
        try {
            await emailService.sendVerificationEmail(newEmail, username, verificationToken);
        } catch (error) {
            console.error('Failed to send verification email:', error);
            return res.status(500).json({ error: 'Email changed but failed to send verification email. You can resend it from settings.' });
        }

        res.json({ message: 'Email address changed successfully. Please verify your new email address.' });
    } catch (error) {
        console.error('Change email error:', error);
        res.status(500).json({ error: 'Failed to change email address' });
    }
});

// Get account setup information (validate token and return user info)
router.get('/setup-account', async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).json({ error: 'Setup token is required' });
        }

        // Find user with valid token and not yet verified
        const result = await db.query(
            'SELECT id, username, email FROM users WHERE email_verification_token = $1 AND email_verification_expires > NOW() AND email_verified = false',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired setup token' });
        }

        const user = result.rows[0];

        res.json({
            username: user.username,
            email: user.email
        });
    } catch (error) {
        console.error('Get setup account error:', error);
        res.status(500).json({ error: 'Failed to get account setup information' });
    }
});

// Complete account setup (set password and verify email)
router.post('/setup-account', async (req, res) => {
    try {
        const { token, email, password } = req.body;

        if (!token || !email || !password) {
            return res.status(400).json({ error: 'Token, email, and password are required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Validate password strength
        if (password.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        if (!/[A-Z]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one uppercase letter' });
        }

        if (!/[\d!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
            return res.status(400).json({ error: 'Password must contain at least one number or symbol' });
        }

        // Find user with valid token and not yet verified
        const result = await db.query(
            'SELECT id, username, email FROM users WHERE email_verification_token = $1 AND email_verification_expires > NOW() AND email_verified = false',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired setup token' });
        }

        const user = result.rows[0];

        // Verify email matches
        if (email !== user.email) {
            return res.status(400).json({ error: 'Email does not match the invitation email' });
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);

        // Generate API key
        const apiKey = crypto.randomBytes(32).toString('hex');

        // Update user with password, API key, verify email, and clear token
        await db.query(
            `UPDATE users
             SET password_hash = $1,
                 api_key = $2,
                 email_verified = true,
                 email_verification_token = NULL,
                 email_verification_expires = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [passwordHash, apiKey, user.id]
        );

        // Send welcome email
        try {
            await emailService.sendWelcomeEmail(user.email, user.username);
        } catch (emailError) {
            console.error('Failed to send welcome email:', emailError);
        }

        res.json({ message: 'Account setup completed successfully! You can now log in.' });
    } catch (error) {
        console.error('Account setup error:', error);
        res.status(500).json({ error: 'Failed to complete account setup' });
    }
});

// Change username
router.post('/change-username', verifyToken, async (req, res) => {
    try {
        const { currentUsername, newUsername, password } = req.body;

        if (!currentUsername || !newUsername || !password) {
            return res.status(400).json({ error: 'All fields are required' });
        }

        // Get user
        const userResult = await db.query(
            'SELECT id, username, password_hash FROM users WHERE id = $1',
            [req.userId]
        );

        if (userResult.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userResult.rows[0];

        // Verify current username matches
        if (user.username !== currentUsername) {
            return res.status(400).json({ error: 'Current username verification failed' });
        }

        // Verify password
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Validate new username
        if (newUsername.length < 3) {
            return res.status(400).json({ error: 'Username must be at least 3 characters long' });
        }

        if (newUsername === currentUsername) {
            return res.status(400).json({ error: 'New username must be different from current username' });
        }

        // Check if new username is already taken
        const existingUser = await db.query(
            'SELECT id FROM users WHERE username = $1 AND id != $2',
            [newUsername, req.userId]
        );

        if (existingUser.rows.length > 0) {
            return res.status(409).json({ error: 'Username is already taken' });
        }

        // Update username
        await db.query(
            'UPDATE users SET username = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
            [newUsername, req.userId]
        );

        res.json({ message: 'Username changed successfully' });
    } catch (error) {
        console.error('Change username error:', error);
        res.status(500).json({ error: 'Failed to change username' });
    }
});

// Helper function to validate email
function isValidEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

module.exports = router;
