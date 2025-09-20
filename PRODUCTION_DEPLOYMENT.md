# Production Deployment Guide

## Quick Start

1. **Download the production files to your server:**
   ```bash
   wget https://raw.githubusercontent.com/your-repo/world-cafe-dev-clean/master/docker-compose.production.yml
   wget https://raw.githubusercontent.com/your-repo/world-cafe-dev-clean/master/.env.production
   wget https://raw.githubusercontent.com/your-repo/world-cafe-dev-clean/master/database_schema.sql
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.production .env
   # Edit .env with your actual values
   nano .env
   ```

3. **Deploy the application:**
   ```bash
   docker-compose -f docker-compose.production.yml up -d
   ```

## Detailed Setup

### 1. Environment Configuration

Copy `.env.production` to `.env` and update these values:

```bash
# REQUIRED: Update these with your actual API keys
DEEPGRAM_API_KEY=your_deepgram_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# REQUIRED: Set a secure admin password
ADMIN_PASSWORD=your_secure_admin_password_here

# REQUIRED: Update with your domain
BASE_URL=https://your-domain.com

# REQUIRED: Generate a secure random session secret
SESSION_SECRET=generate-a-long-random-string-here
```

### 2. Database Configuration

The production setup uses these database credentials:
- **Database**: `world_cafe_platform`
- **User**: `world_cafe_user`
- **Password**: `WorldCafe2024!`

These are pre-configured in the docker-compose file.

### 3. Deployment Commands

```bash
# Start the services
docker-compose -f docker-compose.production.yml up -d

# Check status
docker-compose -f docker-compose.production.yml ps

# View logs
docker-compose -f docker-compose.production.yml logs -f app

# Stop services
docker-compose -f docker-compose.production.yml down
```

### 4. Verification

After deployment, verify the application is working:

```bash
# Check if containers are running
docker ps

# Test database connection
curl http://localhost/api/admin/settings/status

# Expected response should show "connected": true
```

### 5. Troubleshooting

**Database Connection Issues:**
```bash
# Check MySQL container logs
docker logs world-cafe-mysql

# Check app container logs
docker logs world-cafe-app

# Verify network connectivity
docker exec world-cafe-app ping mysql
```

**Common Issues:**
1. **Wrong image**: Make sure you're using `alexdoit/world-cafe-platform:latest`
2. **Environment variables**: Ensure `.env` file has correct values
3. **Port conflicts**: Check if port 80 and 3307 are available
4. **Database credentials**: Verify the exact credentials match

### 6. Production Security

- Change default passwords
- Use strong API keys
- Set up SSL/TLS with reverse proxy (nginx/traefik)
- Regular backups of MySQL data volume
- Monitor logs for security issues

## Support

If you encounter issues:
1. Check container logs: `docker logs world-cafe-app`
2. Verify environment variables: `docker exec world-cafe-app env | grep DB`
3. Test database connectivity: `docker exec world-cafe-app ping mysql`