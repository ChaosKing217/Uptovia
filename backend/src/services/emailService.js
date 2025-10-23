const nodemailer = require('nodemailer');

class EmailService {
    constructor() {
        this.transporter = null;
        this.isConfigured = false;
        this.fromAddress = 'Uptovia <noreply@monitor.local>';
    }

    async initialize() {
        try {
            // Try to load from database first
            const db = require('./database');
            const result = await db.query('SELECT * FROM email_settings ORDER BY id LIMIT 1');

            if (result.rows.length > 0 && result.rows[0].is_configured) {
                const settings = result.rows[0];
                this.initializeWithSettings(settings);
                return;
            }

            // Fallback to environment variables
            if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
                console.log('⚠️  SMTP not configured - email functionality disabled');
                return;
            }

            this.initializeWithEnv();
        } catch (error) {
            console.error('Failed to initialize email service:', error);
            // Try env variables as fallback
            if (process.env.SMTP_HOST && process.env.SMTP_USER) {
                this.initializeWithEnv();
            } else {
                this.isConfigured = false;
            }
        }
    }

    initializeWithEnv() {
        try {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || '587'),
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD
                }
            });

            this.fromAddress = process.env.SMTP_FROM || 'Uptovia <noreply@monitor.local>';
            this.isConfigured = true;
            console.log('✅ Email service initialized from environment');

            this.transporter.verify((error) => {
                if (error) {
                    console.error('❌ SMTP connection failed:', error.message);
                    this.isConfigured = false;
                } else {
                    console.log('✅ SMTP server is ready to send emails');
                }
            });
        } catch (error) {
            console.error('Failed to initialize email service from env:', error);
            this.isConfigured = false;
        }
    }

    initializeWithSettings(settings) {
        try {
            if (!settings.smtp_host || !settings.smtp_user || !settings.smtp_password) {
                console.log('⚠️  SMTP settings incomplete');
                this.isConfigured = false;
                return;
            }

            this.transporter = nodemailer.createTransport({
                host: settings.smtp_host,
                port: settings.smtp_port || 587,
                secure: settings.smtp_secure || false,
                auth: {
                    user: settings.smtp_user,
                    pass: settings.smtp_password
                }
            });

            this.fromAddress = settings.smtp_from || 'Uptovia <noreply@monitor.local>';
            this.isConfigured = true;
            console.log('✅ Email service initialized from database');

            this.transporter.verify((error) => {
                if (error) {
                    console.error('❌ SMTP connection failed:', error.message);
                    this.isConfigured = false;
                } else {
                    console.log('✅ SMTP server is ready to send emails');
                }
            });
        } catch (error) {
            console.error('Failed to initialize email service from settings:', error);
            this.isConfigured = false;
        }
    }

    reinitialize(settings) {
        this.initializeWithSettings(settings);
    }

    async sendPasswordResetEmail(email, username, resetToken) {
        if (!this.isConfigured) {
            throw new Error('Email service is not configured');
        }

        const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/#reset-password?token=${resetToken}`;

        const mailOptions = {
            from: this.fromAddress,
            to: email,
            subject: 'Password Reset Request - Uptovia',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background: #f5f5f7;
                        }
                        .container {
                            background: #ffffff;
                            border-radius: 12px;
                            overflow: hidden;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            background: linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%);
                            color: white;
                            padding: 40px 30px;
                            text-align: center;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 28px;
                            font-weight: 600;
                        }
                        .content {
                            padding: 40px 30px;
                        }
                        .button {
                            display: inline-block;
                            padding: 16px 32px;
                            background: #007AFF;
                            color: white !important;
                            text-decoration: none;
                            border-radius: 8px;
                            margin: 20px 0;
                            font-weight: 600;
                            font-size: 16px;
                        }
                        .button:hover {
                            background: #0051D5;
                        }
                        .warning {
                            background: #FFF3CD;
                            border-left: 4px solid #FF9500;
                            padding: 20px;
                            border-radius: 8px;
                            margin: 25px 0;
                        }
                        .code {
                            background: #f5f5f7;
                            padding: 12px;
                            border-radius: 6px;
                            font-family: 'Courier New', monospace;
                            font-size: 13px;
                            word-break: break-all;
                            color: #007AFF;
                            border: 1px solid #e5e5ea;
                        }
                        .footer {
                            text-align: center;
                            padding: 30px;
                            color: #86868b;
                            font-size: 14px;
                            border-top: 1px solid #e5e5ea;
                        }
                        .security-icon {
                            font-size: 48px;
                            text-align: center;
                            margin: 20px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🔍 Uptovia</h1>
                            <p style="margin: 10px 0 0 0; opacity: 0.9;">Password Reset Request</p>
                        </div>
                        <div class="content">
                            <div class="security-icon">🔐</div>

                            <h2 style="color: #1d1d1f; text-align: center; margin-top: 0;">Reset Your Password</h2>

                            <p>Hello <strong>${username}</strong>,</p>

                            <p>We received a request to reset the password for your Uptovia account. If you made this request, click the button below to create a new password:</p>

                            <center>
                                <a href="${resetUrl}" class="button">Reset Password Now</a>
                            </center>

                            <p style="color: #86868b; font-size: 14px;">Or copy and paste this link into your browser:</p>
                            <div class="code">${resetUrl}</div>

                            <div class="warning">
                                <strong style="color: #FF9500;">🔒 Security Information:</strong>
                                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                                    <li>This reset link will expire in <strong>30 minutes</strong></li>
                                    <li>The link can only be used once</li>
                                    <li>If you didn't request this reset, please ignore this email</li>
                                    <li>Your password will remain unchanged until you create a new one</li>
                                </ul>
                            </div>

                            <p style="color: #86868b; font-size: 14px; margin-top: 30px;">If you didn't request a password reset, someone might be trying to access your account. Please contact your system administrator immediately.</p>

                            <p style="margin-top: 30px;">Best regards,<br>
                            <strong>Uptovia Team</strong></p>
                        </div>
                        <div class="footer">
                            <p>This is an automated email from Uptovia.<br>
                            Please do not reply to this email.<br>
                            Sent to: <strong>${email}</strong></p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `
🔐 Password Reset Request - Uptovia

Hello ${username},

We received a request to reset the password for your Uptovia account.

Click the link below to reset your password:
${resetUrl}

SECURITY INFORMATION:
- This reset link will expire in 30 minutes
- The link can only be used once
- If you didn't request this reset, please ignore this email
- Your password will remain unchanged until you create a new one

If you didn't request a password reset, someone might be trying to access your account. Please contact your system administrator immediately.

Best regards,
Uptovia Team

---
This is an automated security email from Uptovia.
Please do not reply to this email.
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Password reset email sent to:', email);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send password reset email:', error);
            throw error;
        }
    }

    async sendAccountSetupEmail(email, username, setupToken) {
        if (!this.isConfigured) {
            throw new Error('Email service is not configured');
        }

        const setupUrl = `${process.env.APP_URL || 'http://localhost:3000'}/setup-account.html?token=${setupToken}`;

        const mailOptions = {
            from: this.fromAddress,
            to: email,
            subject: 'Set Up Your Account - Uptovia',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background: #f5f5f7;
                        }
                        .container {
                            background: #ffffff;
                            border-radius: 12px;
                            overflow: hidden;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            background: linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%);
                            color: white;
                            padding: 40px 30px;
                            text-align: center;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 28px;
                            font-weight: 600;
                        }
                        .content {
                            padding: 40px 30px;
                        }
                        .button {
                            display: inline-block;
                            padding: 16px 32px;
                            background: #34C759;
                            color: white !important;
                            text-decoration: none;
                            border-radius: 8px;
                            margin: 20px 0;
                            font-weight: 600;
                            font-size: 16px;
                        }
                        .button:hover {
                            background: #248A3D;
                        }
                        .info-box {
                            background: #E3F2FD;
                            border-left: 4px solid #007AFF;
                            padding: 20px;
                            border-radius: 8px;
                            margin: 25px 0;
                        }
                        .code {
                            background: #f5f5f7;
                            padding: 12px;
                            border-radius: 6px;
                            font-family: 'Courier New', monospace;
                            font-size: 13px;
                            word-break: break-all;
                            color: #007AFF;
                            border: 1px solid #e5e5ea;
                        }
                        .footer {
                            text-align: center;
                            padding: 30px;
                            color: #86868b;
                            font-size: 14px;
                            border-top: 1px solid #e5e5ea;
                        }
                        .icon {
                            font-size: 48px;
                            text-align: center;
                            margin: 20px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🔍 Uptovia</h1>
                            <p style="margin: 10px 0 0 0; opacity: 0.9;">Account Invitation</p>
                        </div>
                        <div class="content">
                            <div class="icon">👋</div>

                            <h2 style="color: #1d1d1f; text-align: center; margin-top: 0;">Welcome! Set Up Your Account</h2>

                            <p>Hello <strong>${username}</strong>,</p>

                            <p>An administrator has invited you to join Uptovia. To activate your account, please click the button below to verify your email and set your password:</p>

                            <center>
                                <a href="${setupUrl}" class="button">Set Up Account</a>
                            </center>

                            <p style="color: #86868b; font-size: 14px;">Or copy and paste this link into your browser:</p>
                            <div class="code">${setupUrl}</div>

                            <div class="info-box">
                                <strong style="color: #007AFF;">📋 What's Next:</strong>
                                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                                    <li>Click the link to open the account setup page</li>
                                    <li>Verify your email address: <strong>${email}</strong></li>
                                    <li>Create a secure password for your account</li>
                                    <li>This link will expire in <strong>48 hours</strong></li>
                                </ul>
                            </div>

                            <p style="color: #86868b; font-size: 14px; margin-top: 30px;">Your username is: <strong style="color: #1d1d1f;">${username}</strong></p>

                            <p style="margin-top: 30px;">Best regards,<br>
                            <strong>Uptovia Team</strong></p>
                        </div>
                        <div class="footer">
                            <p>This is an automated email from Uptovia.<br>
                            Please do not reply to this email.<br>
                            Sent to: <strong>${email}</strong></p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `
👋 Welcome to Uptovia!

Hello ${username},

An administrator has invited you to join Uptovia. To activate your account, please click the link below to verify your email and set your password:

${setupUrl}

WHAT'S NEXT:
- Click the link to open the account setup page
- Verify your email address: ${email}
- Create a secure password for your account
- This link will expire in 48 hours

Your username is: ${username}

Best regards,
Uptovia Team

---
This is an automated email from Uptovia.
Please do not reply to this email.
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Account setup email sent to:', email);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send account setup email:', error);
            throw error;
        }
    }

    async sendAdminCreatedAccountEmail(email, username, verificationToken) {
        if (!this.isConfigured) {
            throw new Error('Email service is not configured');
        }

        const verificationUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${verificationToken}`;

        const mailOptions = {
            from: this.fromAddress,
            to: email,
            subject: 'Account Created - Verify Your Email',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background: #f5f5f7;
                        }
                        .container {
                            background: #ffffff;
                            border-radius: 12px;
                            overflow: hidden;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            background: linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%);
                            color: white;
                            padding: 40px 30px;
                            text-align: center;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 28px;
                            font-weight: 600;
                        }
                        .content {
                            padding: 40px 30px;
                        }
                        .button {
                            display: inline-block;
                            padding: 16px 32px;
                            background: #34C759;
                            color: white !important;
                            text-decoration: none;
                            border-radius: 8px;
                            margin: 20px 0;
                            font-weight: 600;
                            font-size: 16px;
                        }
                        .button:hover {
                            background: #248A3D;
                        }
                        .info-box {
                            background: #E3F2FD;
                            border-left: 4px solid #007AFF;
                            padding: 20px;
                            border-radius: 8px;
                            margin: 25px 0;
                        }
                        .code {
                            background: #f5f5f7;
                            padding: 12px;
                            border-radius: 6px;
                            font-family: 'Courier New', monospace;
                            font-size: 13px;
                            word-break: break-all;
                            color: #007AFF;
                            border: 1px solid #e5e5ea;
                        }
                        .footer {
                            text-align: center;
                            padding: 30px;
                            color: #86868b;
                            font-size: 14px;
                            border-top: 1px solid #e5e5ea;
                        }
                        .icon {
                            font-size: 48px;
                            text-align: center;
                            margin: 20px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🔍 Uptovia</h1>
                            <p style="margin: 10px 0 0 0; opacity: 0.9;">Account Created</p>
                        </div>
                        <div class="content">
                            <div class="icon">👤</div>

                            <h2 style="color: #1d1d1f; text-align: center; margin-top: 0;">An Account Was Created For You</h2>

                            <p>Hello <strong>${username}</strong>,</p>

                            <p>An administrator has created an Uptovia account for you. To activate your account and access all features, please verify your email address by clicking the button below:</p>

                            <center>
                                <a href="${verificationUrl}" class="button">Verify Email Address</a>
                            </center>

                            <p style="color: #86868b; font-size: 14px;">Or copy and paste this link into your browser:</p>
                            <div class="code">${verificationUrl}</div>

                            <div class="info-box">
                                <strong style="color: #007AFF;">📋 Important Information:</strong>
                                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                                    <li>This verification link will expire in <strong>24 hours</strong></li>
                                    <li>After verification, you'll have access to all features</li>
                                    <li>You can log in using your username: <strong>${username}</strong></li>
                                    <li>Contact your administrator if you didn't expect this account</li>
                                </ul>
                            </div>

                            <p style="margin-top: 30px;">Best regards,<br>
                            <strong>Uptovia Team</strong></p>
                        </div>
                        <div class="footer">
                            <p>This is an automated email from Uptovia.<br>
                            Please do not reply to this email.<br>
                            Sent to: <strong>${email}</strong></p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `
👤 Account Created - Uptovia

Hello ${username},

An administrator has created an Uptovia account for you. To activate your account and access all features, please verify your email address by clicking the link below:

${verificationUrl}

IMPORTANT INFORMATION:
- This verification link will expire in 24 hours
- After verification, you'll have access to all features
- You can log in using your username: ${username}
- Contact your administrator if you didn't expect this account

Best regards,
Uptovia Team

---
This is an automated email from Uptovia.
Please do not reply to this email.
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Account creation verification email sent to:', email);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send account creation email:', error);
            throw error;
        }
    }

    async sendVerificationEmail(email, username, verificationToken) {
        if (!this.isConfigured) {
            throw new Error('Email service is not configured');
        }

        const verificationUrl = `${process.env.APP_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${verificationToken}`;

        const mailOptions = {
            from: this.fromAddress,
            to: email,
            subject: 'Verify Your Email - Uptovia',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background: #f5f5f7;
                        }
                        .container {
                            background: #ffffff;
                            border-radius: 12px;
                            overflow: hidden;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            background: linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%);
                            color: white;
                            padding: 40px 30px;
                            text-align: center;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 28px;
                            font-weight: 600;
                        }
                        .content {
                            padding: 40px 30px;
                        }
                        .button {
                            display: inline-block;
                            padding: 16px 32px;
                            background: #34C759;
                            color: white !important;
                            text-decoration: none;
                            border-radius: 8px;
                            margin: 20px 0;
                            font-weight: 600;
                            font-size: 16px;
                        }
                        .button:hover {
                            background: #248A3D;
                        }
                        .info-box {
                            background: #E3F2FD;
                            border-left: 4px solid #007AFF;
                            padding: 20px;
                            border-radius: 8px;
                            margin: 25px 0;
                        }
                        .code {
                            background: #f5f5f7;
                            padding: 12px;
                            border-radius: 6px;
                            font-family: 'Courier New', monospace;
                            font-size: 13px;
                            word-break: break-all;
                            color: #007AFF;
                            border: 1px solid #e5e5ea;
                        }
                        .footer {
                            text-align: center;
                            padding: 30px;
                            color: #86868b;
                            font-size: 14px;
                            border-top: 1px solid #e5e5ea;
                        }
                        .icon {
                            font-size: 48px;
                            text-align: center;
                            margin: 20px 0;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🔍 Uptovia</h1>
                            <p style="margin: 10px 0 0 0; opacity: 0.9;">Verify Your Email Address</p>
                        </div>
                        <div class="content">
                            <div class="icon">📧</div>

                            <h2 style="color: #1d1d1f; text-align: center; margin-top: 0;">Welcome to Uptovia!</h2>

                            <p>Hello <strong>${username}</strong>,</p>

                            <p>Thank you for creating an account! To complete your registration and unlock all features, please verify your email address by clicking the button below:</p>

                            <center>
                                <a href="${verificationUrl}" class="button">Verify Email Address</a>
                            </center>

                            <p style="color: #86868b; font-size: 14px;">Or copy and paste this link into your browser:</p>
                            <div class="code">${verificationUrl}</div>

                            <div class="info-box">
                                <strong style="color: #007AFF;">📋 Important Information:</strong>
                                <ul style="margin: 10px 0 0 0; padding-left: 20px;">
                                    <li>This verification link will expire in <strong>24 hours</strong></li>
                                    <li>After verification, you'll have access to all features</li>
                                    <li>If you didn't create this account, please ignore this email</li>
                                    <li>You can request a new verification link from your account settings</li>
                                </ul>
                            </div>

                            <p style="margin-top: 30px;">Best regards,<br>
                            <strong>Uptovia Team</strong></p>
                        </div>
                        <div class="footer">
                            <p>This is an automated email from Uptovia.<br>
                            Please do not reply to this email.<br>
                            Sent to: <strong>${email}</strong></p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `
📧 Verify Your Email Address - Uptovia

Hello ${username},

Thank you for creating an account! To complete your registration and unlock all features, please verify your email address by clicking the link below:

${verificationUrl}

IMPORTANT INFORMATION:
- This verification link will expire in 24 hours
- After verification, you'll have access to all features
- If you didn't create this account, please ignore this email
- You can request a new verification link from your account settings

Best regards,
Uptovia Team

---
This is an automated email from Uptovia.
Please do not reply to this email.
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            console.log('✅ Verification email sent to:', email);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Failed to send verification email:', error);
            throw error;
        }
    }

    async sendWelcomeEmail(email, username) {
        if (!this.isConfigured) {
            console.log('⚠️  Email not configured, skipping welcome email');
            return;
        }

        const mailOptions = {
            from: this.fromAddress,
            to: email,
            subject: 'Welcome to Uptovia!',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background: #f5f5f7;
                        }
                        .container {
                            background: #ffffff;
                            border-radius: 12px;
                            overflow: hidden;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            background: linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%);
                            color: white;
                            padding: 40px 30px;
                            text-align: center;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 28px;
                            font-weight: 600;
                        }
                        .content {
                            padding: 40px 30px;
                        }
                        .feature {
                            padding: 15px;
                            margin: 10px 0;
                            background: #f5f5f7;
                            border-radius: 8px;
                        }
                        .footer {
                            text-align: center;
                            padding: 30px;
                            color: #86868b;
                            font-size: 14px;
                            border-top: 1px solid #e5e5ea;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🔍 Welcome to Uptovia!</h1>
                            <p style="margin: 10px 0 0 0; opacity: 0.9;">Your account is ready</p>
                        </div>
                        <div class="content">
                            <p>Hello <strong>${username}</strong>,</p>

                            <p>Thank you for verifying your email! Your Uptovia account is now ready to use.</p>

                            <h3 style="color: #1d1d1f;">What you can do:</h3>

                            <div class="feature">
                                <strong>📊 Monitor Services</strong><br>
                                Track HTTP/HTTPS, Ping, TCP, and DNS endpoints with real-time status updates.
                            </div>

                            <div class="feature">
                                <strong>🔔 Get Notifications</strong><br>
                                Receive instant alerts when your services go down or come back up.
                            </div>

                            <div class="feature">
                                <strong>🏷️ Organize with Tags</strong><br>
                                Create tags to categorize and filter your monitors.
                            </div>

                            <p>Get started by adding your first monitor!</p>

                            <center>
                                <a href="${process.env.APP_URL || 'http://localhost:3000'}" class="button" style="display: inline-block; padding: 16px 32px; background: #007AFF; color: white !important; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 600; font-size: 16px;">Go to Dashboard</a>
                            </center>

                            <p style="margin-top: 30px;">Best regards,<br>
                            <strong>Uptovia Team</strong></p>
                        </div>
                        <div class="footer">
                            <p>This is an automated email from Uptovia.<br>
                            Please do not reply to this email.<br>
                            Sent to: <strong>${email}</strong></p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `
🔍 Welcome to Uptovia!

Hello ${username},

Thank you for verifying your email! Your Uptovia account is now ready to use.

What you can do:
- Monitor Services: Track HTTP/HTTPS, Ping, TCP, and DNS endpoints with real-time status updates
- Get Notifications: Receive instant alerts when your services go down or come back up
- Organize with Tags: Create tags to categorize and filter your monitors

Get started by adding your first monitor!

Best regards,
Uptovia Team

---
This is an automated email from Uptovia.
Please do not reply to this email.
            `
        };

        try {
            await this.transporter.sendMail(mailOptions);
            console.log('✅ Welcome email sent to:', email);
        } catch (error) {
            console.error('Failed to send welcome email:', error);
            // Don't throw error for welcome email
        }
    }

    async sendTestEmail(email) {
        if (!this.isConfigured) {
            throw new Error('Email service is not configured');
        }

        const mailOptions = {
            from: this.fromAddress,
            to: email,
            subject: 'Test Email - Uptovia',
            html: `
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background: #f5f5f7;
                        }
                        .container {
                            background: #ffffff;
                            border-radius: 12px;
                            overflow: hidden;
                            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                        }
                        .header {
                            background: linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%);
                            color: white;
                            padding: 40px 30px;
                            text-align: center;
                        }
                        .header h1 {
                            margin: 0;
                            font-size: 28px;
                            font-weight: 600;
                        }
                        .content {
                            padding: 40px 30px;
                        }
                        .success-badge {
                            background: #34C759;
                            color: white;
                            display: inline-block;
                            padding: 10px 20px;
                            border-radius: 8px;
                            font-weight: 600;
                            margin-bottom: 20px;
                        }
                        .info-box {
                            background: #f5f5f7;
                            border-left: 4px solid #007AFF;
                            padding: 20px;
                            border-radius: 8px;
                            margin: 20px 0;
                        }
                        .footer {
                            text-align: center;
                            padding: 30px;
                            color: #86868b;
                            font-size: 14px;
                            border-top: 1px solid #e5e5ea;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <h1>🔍 Uptovia</h1>
                            <p style="margin: 10px 0 0 0; opacity: 0.9;">Email Configuration Test</p>
                        </div>
                        <div class="content">
                            <div class="success-badge">
                                ✅ Configuration Successful
                            </div>

                            <h2 style="color: #1d1d1f; margin-top: 0;">Congratulations!</h2>

                            <p>Your email configuration is working perfectly. This test email confirms that:</p>

                            <div class="info-box">
                                <strong>✓ SMTP Connection:</strong> Successfully established<br>
                                <strong>✓ Authentication:</strong> Valid credentials<br>
                                <strong>✓ Email Delivery:</strong> Operational
                            </div>

                            <p>Your Uptovia monitoring system is now ready to send notifications for:</p>
                            <ul style="color: #1d1d1f;">
                                <li>Service downtime alerts</li>
                                <li>Service recovery notifications</li>
                                <li>Password reset requests</li>
                                <li>System notifications</li>
                            </ul>

                            <p>If you have any questions, please contact your system administrator.</p>
                        </div>
                        <div class="footer">
                            <p>This is an automated test email from Uptovia.<br>
                            Please do not reply to this email.<br>
                            Sent to: <strong>${email}</strong></p>
                        </div>
                    </div>
                </body>
                </html>
            `,
            text: `
✅ Email Configuration Test - Uptovia

Congratulations! Your email configuration is working perfectly.

This test email confirms that:
- SMTP Connection: Successfully established
- Authentication: Valid credentials
- Email Delivery: Operational

Your Uptovia monitoring system is now ready to send notifications.

Sent to: ${email}
            `
        };

        try {
            const info = await this.transporter.sendMail(mailOptions);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new EmailService();
