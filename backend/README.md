# Uptime Monitor Backend Server

A powerful 24/7 monitoring backend server with push notifications, user management, groups, and a web-based dashboard.

## Features

- ✅ **Multiple Monitor Types**: HTTP/HTTPS, Ping, TCP Port, DNS
- ✅ **24/7 Monitoring**: Automatic checks with configurable intervals
- ✅ **Push Notifications**: Apple Push Notifications (APNs) support
- ✅ **User Management**: Multi-user support with secure authentication
- ✅ **Groups**: Organize monitors and collaborate with teams
- ✅ **Tags**: Categorize and filter monitors
- ✅ **Web Dashboard**: Full-featured browser-based management interface
- ✅ **REST API**: Complete API for iOS app integration
- ✅ **Docker Support**: Easy deployment with Docker Compose

## Quick Start

### Prerequisites

- Docker and Docker Compose
- (Optional) Apple Developer Account for push notifications

### Installation

1. Clone the repository and navigate to the backend directory:

```bash
cd backend
```

2. Copy the environment file and configure it:

```bash
cp .env.example .env
nano .env
```

3. **Important**: Change these values in `.env`:
   - `POSTGRES_PASSWORD`: Set a strong database password
   - `JWT_SECRET`: Generate a random secret key
   - `APNS_*`: Configure if you want push notifications

4. Start the server:

```bash
docker-compose up -d
```

5. The server will be available at:
   - Web Dashboard: http://localhost:3000
   - API: http://localhost:3000/api

### Default Credentials

**⚠️ IMPORTANT: Change these immediately after first login!**

- Username: `admin`
- Password: `Test1234!`

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `POSTGRES_HOST` | PostgreSQL host | Yes |
| `POSTGRES_DB` | Database name | Yes |
| `POSTGRES_USER` | Database user | Yes |
| `POSTGRES_PASSWORD` | Database password | Yes |
| `JWT_SECRET` | JWT signing secret | Yes |
| `APNS_KEY_PATH` | Path to APNs .p8 key file | No |
| `APNS_KEY_ID` | Apple Key ID | No |
| `APNS_TEAM_ID` | Apple Team ID | No |
| `APNS_BUNDLE_ID` | iOS app bundle ID | No |

### Apple Push Notifications Setup

1. Generate an APNs key from Apple Developer portal
2. Download the `.p8` file
3. Place it in `backend/certs/AuthKey.p8`
4. Configure the `APNS_*` environment variables
5. Restart the container

## API Documentation

### Authentication

All API requests require authentication via either:
- **JWT Token** (for web dashboard): `Authorization: Bearer <token>`
- **API Key** (for iOS app): `X-Api-Key: <api-key>`

### Endpoints

#### Auth
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/regenerate-api-key` - Regenerate API key

#### Monitors
- `GET /api/monitors` - List all monitors
- `GET /api/monitors/:id` - Get single monitor
- `POST /api/monitors` - Create monitor
- `PUT /api/monitors/:id` - Update monitor
- `DELETE /api/monitors/:id` - Delete monitor
- `GET /api/monitors/:id/history` - Get check history
- `GET /api/monitors/:id/stats` - Get statistics

#### Groups
- `GET /api/groups` - List user's groups
- `GET /api/groups/:id` - Get group details
- `POST /api/groups` - Create group
- `PUT /api/groups/:id` - Update group
- `DELETE /api/groups/:id` - Delete group
- `POST /api/groups/:id/members` - Add member
- `DELETE /api/groups/:id/members/:userId` - Remove member

#### Tags
- `GET /api/tags` - List all tags
- `POST /api/tags` - Create tag
- `PUT /api/tags/:id` - Update tag
- `DELETE /api/tags/:id` - Delete tag
- `POST /api/tags/:id/monitors/:monitorId` - Assign tag to monitor

#### Devices
- `POST /api/devices/register` - Register device for push notifications
- `GET /api/devices` - List user's devices
- `DELETE /api/devices/:token` - Unregister device

## Monitor Types

### HTTP/HTTPS
Monitors web endpoints by making HTTP requests.

**Required fields:**
- `url`: Full URL to monitor
- `method`: HTTP method (GET, POST, PUT, HEAD)
- `accepted_status_codes`: Acceptable status codes (e.g., "200,201-299")

### Ping (ICMP)
Monitors server reachability using ping.

**Required fields:**
- `hostname`: Hostname or IP address

### TCP Port
Monitors TCP port availability.

**Required fields:**
- `hostname`: Hostname or IP address
- `port`: Port number to check

### DNS
Monitors DNS resolution.

**Required fields:**
- `hostname`: Domain to resolve
- `dns_record_type`: Record type (A, AAAA, CNAME, MX, TXT)

## Database Schema

The application uses PostgreSQL with the following main tables:

- `users` - User accounts
- `groups` - User groups for collaboration
- `user_groups` - Group membership
- `monitors` - Monitor configurations
- `check_history` - Historical check results
- `tags` - Monitor tags
- `monitor_tags` - Monitor-tag relationships
- `devices` - Registered devices for push notifications

## Deployment

### Docker Compose (Recommended)

```bash
docker-compose up -d
```

### Manual Deployment

1. Install Node.js 18+
2. Install PostgreSQL 15+
3. Install dependencies: `npm install`
4. Set up database: Run `init.sql`
5. Configure `.env` file
6. Start server: `npm start`

### Reverse Proxy Setup (Nginx)

```nginx
server {
    listen 80;
    server_name monitor.example.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## Monitoring Service

The monitoring service runs as a cron job every minute and:

1. Checks all active monitors based on their intervals
2. Performs type-specific checks (HTTP, Ping, TCP, DNS)
3. Records results in check history
4. Updates monitor status and uptime percentage
5. Sends push notifications on status changes

## Security

- Passwords are hashed using bcrypt
- JWT tokens expire after 30 days
- API keys are randomly generated (64 characters)
- SQL injection prevention via parameterized queries
- CORS enabled for web dashboard

## Troubleshooting

### Database Connection Failed

Check that PostgreSQL is running:
```bash
docker-compose logs postgres
```

### Monitoring Not Working

Check the monitoring service logs:
```bash
docker-compose logs app
```

### Push Notifications Not Sending

1. Verify APNs credentials are correct
2. Check that the `.p8` file exists
3. Ensure the iOS app is using the correct bundle ID

## Support

For issues and feature requests, please create an issue on GitHub.

## License

MIT License - See LICENSE file for details

## Future Features (Roadmap)

- [ ] OIDC Authentication (Authentik integration)
- [ ] Email notifications
- [ ] Slack/Discord webhooks
- [ ] Status pages
- [ ] SSL certificate monitoring
- [ ] Multi-region monitoring
- [ ] Incident management
