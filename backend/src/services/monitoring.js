const cron = require('node-cron');
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const db = require('./database');
const pushNotifications = require('./pushNotifications');

const execAsync = promisify(exec);

class MonitoringService {
    constructor() {
        this.jobs = new Map();
        this.isRunning = false;
    }

    start() {
        if (this.isRunning) {
            console.log('⚠️  Monitoring service already running');
            return;
        }

        console.log('🔍 Starting monitoring service...');

        // Run every minute
        this.mainJob = cron.schedule('* * * * *', async () => {
            await this.checkAllMonitors();
        });

        this.isRunning = true;
        console.log('✅ Monitoring service started');

        // Run initial check
        this.checkAllMonitors();
    }

    stop() {
        if (this.mainJob) {
            this.mainJob.stop();
        }
        this.isRunning = false;
        console.log('🛑 Monitoring service stopped');
    }

    async checkAllMonitors() {
        try {
            const result = await db.query(
                `SELECT id, name, type, url, hostname, port, method, accepted_status_codes,
                        check_interval, timeout, current_status, last_check, user_id,
                        notify_on_down, notify_on_up
                 FROM monitors
                 WHERE active = true`
            );

            const monitors = result.rows;
            const now = new Date();

            for (const monitor of monitors) {
                // Check if it's time to check this monitor
                const lastCheck = monitor.last_check ? new Date(monitor.last_check) : null;
                const intervalMs = monitor.check_interval * 1000;

                if (!lastCheck || (now - lastCheck) >= intervalMs) {
                    // Run check asynchronously (don't wait)
                    this.checkMonitor(monitor).catch(error => {
                        console.error(`Error checking monitor ${monitor.id}:`, error);
                    });
                }
            }
        } catch (error) {
            console.error('Error in checkAllMonitors:', error);
        }
    }

    async checkMonitor(monitor) {
        const startTime = Date.now();
        let status = 'down';
        let statusCode = null;
        let errorMessage = null;
        let responseTime = null;

        try {
            switch (monitor.type) {
                case 'http':
                case 'https':
                    ({ status, statusCode, responseTime, errorMessage } = await this.checkHTTP(monitor));
                    break;
                case 'ping':
                    ({ status, responseTime, errorMessage } = await this.checkPing(monitor));
                    break;
                case 'tcp':
                    ({ status, responseTime, errorMessage } = await this.checkTCP(monitor));
                    break;
                case 'dns':
                    ({ status, responseTime, errorMessage } = await this.checkDNS(monitor));
                    break;
                default:
                    errorMessage = `Unsupported monitor type: ${monitor.type}`;
            }
        } catch (error) {
            errorMessage = error.message;
            responseTime = Date.now() - startTime;
        }

        // Save check result
        await this.saveCheckResult(monitor, status, statusCode, responseTime, errorMessage);

        // Send notifications if status changed
        await this.handleStatusChange(monitor, status);
    }

    async checkHTTP(monitor) {
        const startTime = Date.now();

        try {
            const config = {
                method: monitor.method || 'GET',
                url: monitor.url,
                timeout: monitor.timeout * 1000,
                validateStatus: () => true, // Don't throw on any status
                maxRedirects: 5
            };

            const response = await axios(config);
            const responseTime = Date.now() - startTime;

            // Check if status code is acceptable
            const acceptedCodes = this.parseStatusCodes(monitor.accepted_status_codes);
            const isAccepted = acceptedCodes.includes(response.status);

            return {
                status: isAccepted ? 'up' : 'down',
                statusCode: response.status,
                responseTime,
                errorMessage: isAccepted ? null : `Status code ${response.status} not in accepted range`
            };
        } catch (error) {
            return {
                status: 'down',
                statusCode: null,
                responseTime: Date.now() - startTime,
                errorMessage: error.message
            };
        }
    }

    async checkPing(monitor) {
        const startTime = Date.now();

        try {
            const { stdout } = await execAsync(`ping -c 1 -W ${monitor.timeout} ${monitor.hostname}`);
            const responseTime = Date.now() - startTime;

            // Parse ping response time
            const match = stdout.match(/time=([\d.]+)/);
            const pingTime = match ? parseFloat(match[1]) : responseTime;

            return {
                status: 'up',
                responseTime: pingTime,
                errorMessage: null
            };
        } catch (error) {
            return {
                status: 'down',
                responseTime: Date.now() - startTime,
                errorMessage: 'Ping failed: ' + error.message
            };
        }
    }

    async checkTCP(monitor) {
        const net = require('net');
        const startTime = Date.now();

        return new Promise((resolve) => {
            const socket = new net.Socket();
            const timeout = setTimeout(() => {
                socket.destroy();
                resolve({
                    status: 'down',
                    responseTime: Date.now() - startTime,
                    errorMessage: 'Connection timeout'
                });
            }, monitor.timeout * 1000);

            socket.connect(monitor.port, monitor.hostname, () => {
                clearTimeout(timeout);
                socket.destroy();
                resolve({
                    status: 'up',
                    responseTime: Date.now() - startTime,
                    errorMessage: null
                });
            });

            socket.on('error', (error) => {
                clearTimeout(timeout);
                resolve({
                    status: 'down',
                    responseTime: Date.now() - startTime,
                    errorMessage: error.message
                });
            });
        });
    }

    async checkDNS(monitor) {
        const dns = require('dns').promises;
        const startTime = Date.now();

        try {
            await dns.resolve(monitor.hostname, monitor.dns_record_type || 'A');
            return {
                status: 'up',
                responseTime: Date.now() - startTime,
                errorMessage: null
            };
        } catch (error) {
            return {
                status: 'down',
                responseTime: Date.now() - startTime,
                errorMessage: error.message
            };
        }
    }

    parseStatusCodes(codesString) {
        if (!codesString) return [200];

        const codes = [];
        const parts = codesString.split(',');

        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(s => parseInt(s.trim()));
                for (let i = start; i <= end; i++) {
                    codes.push(i);
                }
            } else {
                codes.push(parseInt(part.trim()));
            }
        }

        return codes;
    }

    async saveCheckResult(monitor, status, statusCode, responseTime, errorMessage) {
        try {
            // Save to check history
            await db.query(
                `INSERT INTO check_history (monitor_id, status, response_time, status_code, error_message)
                 VALUES ($1, $2, $3, $4, $5)`,
                [monitor.id, status, responseTime, statusCode, errorMessage]
            );

            // Update monitor status
            const updateFields = [
                'last_check = CURRENT_TIMESTAMP',
                'current_status = $1',
                'updated_at = CURRENT_TIMESTAMP'
            ];
            const updateValues = [status];
            let paramCount = 2;

            if (responseTime !== null) {
                updateFields.push(`avg_response_time = $${paramCount}`);
                updateValues.push(responseTime);
                paramCount++;
            }

            if (status === 'up') {
                updateFields.push('last_up_time = CURRENT_TIMESTAMP');
            } else {
                updateFields.push('last_down_time = CURRENT_TIMESTAMP');
            }

            updateValues.push(monitor.id);

            await db.query(
                `UPDATE monitors SET ${updateFields.join(', ')} WHERE id = $${paramCount}`,
                updateValues
            );

            // Update uptime percentage
            await this.updateUptimePercentage(monitor.id);

        } catch (error) {
            console.error('Error saving check result:', error);
        }
    }

    async updateUptimePercentage(monitorId) {
        try {
            const result = await db.query(
                `SELECT
                    COUNT(*) as total_checks,
                    COUNT(CASE WHEN status = 'up' THEN 1 END) as successful_checks
                 FROM check_history
                 WHERE monitor_id = $1 AND checked_at > NOW() - INTERVAL '24 hours'`,
                [monitorId]
            );

            const { total_checks, successful_checks } = result.rows[0];

            if (total_checks > 0) {
                const uptimePercentage = (successful_checks / total_checks * 100).toFixed(2);

                await db.query(
                    'UPDATE monitors SET uptime_percentage = $1 WHERE id = $2',
                    [uptimePercentage, monitorId]
                );
            }
        } catch (error) {
            console.error('Error updating uptime percentage:', error);
        }
    }

    async handleStatusChange(monitor, newStatus) {
        try {
            // Only send notification if status changed
            if (monitor.current_status !== newStatus) {
                console.log(`📊 Monitor "${monitor.name}" status changed: ${monitor.current_status} → ${newStatus}`);

                // Check if notifications are enabled for this status change
                const shouldNotify = (newStatus === 'down' && monitor.notify_on_down) ||
                                   (newStatus === 'up' && monitor.notify_on_up);

                if (shouldNotify) {
                    await pushNotifications.sendMonitorAlert(monitor, newStatus);
                }
            }
        } catch (error) {
            console.error('Error handling status change:', error);
        }
    }
}

module.exports = new MonitoringService();
