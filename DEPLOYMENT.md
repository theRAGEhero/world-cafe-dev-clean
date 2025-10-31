# World Café Platform - Deployment Guide

## Overview
This guide explains how to deploy the World Café Platform using Docker on a production server.

## Prerequisites
- Docker and Docker Compose installed on your server
- A Deepgram API key for speech transcription
- A Groq API key for LLM analysis
- At least 2GB RAM and 5GB disk space

## Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/world-cafe-platform.git
cd world-cafe-platform
```

### 2. Configure Environment Variables
```bash
# Copy the example environment file
cp .env.example .env

# Edit the environment file with your settings
nano .env
```

**Required Configuration:**
- `DEEPGRAM_API_KEY`: Your Deepgram API key for speech-to-text
- `GROQ_API_KEY`: Your Groq API key for LLM analysis
- `DB_PASSWORD`: Secure database password
- `DB_ROOT_PASSWORD`: Secure database root password
- `ADMIN_PASSWORD`: Admin panel password
- `SESSION_SECRET`: Random string for session security
- `BASE_URL`: Your server's public URL (e.g., `https://your-domain.com`)

### 3. Deploy with Docker

#### Option A: Build from Source (Development)
```bash
docker-compose up -d
```
Access at: http://localhost:3005

#### Option B: Use Pre-built Images (Recommended for Production)
```bash
# Using Docker Hub (Development - port 3005)
docker-compose -f docker-compose.hub.yml up -d

# Using Docker Hub (Production - port 80)
docker-compose -f docker-compose.hub.prod.yml up -d

# Using GitHub Container Registry
docker-compose -f docker-compose.ghcr.yml up -d
```

#### Option C: Import Pre-built Image
```bash
# On development server - export the image
./scripts/export-image.sh

# Copy exports/world-cafe-platform.tar.gz to production server
# On production server - import and deploy
docker load < world-cafe-platform.tar.gz
docker tag world-cafe-dev-clean-app:latest world-cafe-platform:latest
docker-compose -f docker-compose.exported.yml up -d
```

### 4. Verify Deployment
```bash
# Check container status
docker ps

# Check application health
curl http://localhost/api/admin/settings/status
```

## Docker Image Consistency

### Why Images Differ Between Environments

When you clone the repository and run `docker-compose build`, each server creates a **different Docker image** because:

- **Build timestamps** create unique layer IDs
- **Node.js dependencies** may have different versions
- **Build context** includes different files or states

### Solution: Use Identical Images

**Option 1: GitHub Container Registry (Automated)**
- Push code to GitHub → Automatic image build → Pull same image everywhere
- Uses `.github/workflows/docker-publish.yml`

**Option 2: Docker Hub (Manual)**
- Build once, push to Docker Hub, pull everywhere
- Requires Docker Hub account

**Option 3: Export/Import (Simple)**
- Export image from dev server: `./scripts/export-image.sh`
- Copy tar.gz file to production server
- Import and deploy with identical image

## Detailed Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DEEPGRAM_API_KEY` | Deepgram API key for transcription | `your_deepgram_api_key` |
| `GROQ_API_KEY` | Groq API key for analysis | `gsk_01IRhVHASIJix5...` |
| `DB_HOST` | Database host (use `mysql` for Docker) | `mysql` |
| `DB_USER` | Database username | `world_cafe_user` |
| `DB_PASSWORD` | Database password | `SecurePassword123!` |
| `DB_ROOT_PASSWORD` | Database root password | `RootPassword456!` |
| `DB_NAME` | Database name | `world_cafe_platform` |
| `ADMIN_PASSWORD` | Admin panel password | `AdminPass789!` |
| `BASE_URL` | Public URL for QR codes | `https://your-domain.com` |
| `SESSION_SECRET` | Session encryption secret | `random-secret-string` |
| `NODE_ENV` | Environment mode | `production` |

### Port Configuration

| Service | Development Port | Production Port |
|---------|------------------|-----------------|
| Web Application | 3005 | 80 |
| MySQL Database | 3307 | 3307 |

### SSL/HTTPS Setup

For production deployments with HTTPS, you can:

1. **Use a reverse proxy (recommended):**
   ```nginx
   # nginx configuration
   server {
       listen 443 ssl;
       server_name your-domain.com;
       
       ssl_certificate /path/to/cert.pem;
       ssl_certificate_key /path/to/key.pem;
       
       location / {
           proxy_pass http://localhost:80;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }
   }
   ```

2. **Update BASE_URL in .env:**
   ```
   BASE_URL=https://your-domain.com
   ```

## Maintenance

### Backup Database
```bash
# Create backup
docker exec world-cafe-mysql mysqldump -u root -p${DB_ROOT_PASSWORD} world_cafe_platform > backup.sql

# Restore backup
docker exec -i world-cafe-mysql mysql -u root -p${DB_ROOT_PASSWORD} world_cafe_platform < backup.sql
```

### View Logs
```bash
# Application logs
docker logs world-cafe-app

# Database logs
docker logs world-cafe-mysql

# Follow logs in real-time
docker logs -f world-cafe-app
```

### Update Application
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Scaling
To handle more concurrent users, you can scale the application:
```bash
docker-compose up -d --scale app=3
```

## Troubleshooting

### Common Issues

1. **Recording not working:**
   - Ensure HTTPS is configured (browsers require secure context for microphone access)
   - Check Deepgram API key is valid
   - Verify BASE_URL matches your domain

2. **Database connection errors:**
   - Check database credentials in .env
   - Ensure MySQL container is healthy: `docker ps`
   - Check database logs: `docker logs world-cafe-mysql`

3. **Transcription failures:**
   - Verify Deepgram API key
   - Check account credits/quota
   - Review application logs

4. **Memory issues:**
   - Ensure server has at least 2GB RAM
   - Monitor usage: `docker stats`

### Debug Mode
For debugging, you can run in development mode:
```bash
# Set environment to development
NODE_ENV=development

# View detailed logs
docker logs -f world-cafe-app
```

## Security Considerations

1. **Change default passwords:** Update all passwords in .env file
2. **Use HTTPS:** Configure SSL/TLS for production
3. **Firewall:** Only expose necessary ports (80, 443)
4. **Updates:** Regularly update Docker images and application
5. **Backups:** Schedule regular database backups
6. **API Keys:** Keep API keys secure and rotate periodically

## Performance Optimization

1. **Database:** Consider using external MySQL with SSD storage
2. **File Storage:** Use external storage for uploads in high-volume deployments
3. **CDN:** Serve static assets through a CDN
4. **Monitoring:** Set up monitoring for containers and database

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review application logs
3. Check Docker container health
4. Open an issue on the GitHub repository

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Browser  │    │  Docker Host    │    │   External APIs │
│                 │    │                 │    │                 │
│  Frontend JS    │◄──►│  world-cafe-app │◄──►│  Deepgram API   │
│  Socket.IO      │    │  Node.js Server │    │  Groq API       │
└─────────────────┘    │                 │    └─────────────────┘
                       │                 │
                       │ world-cafe-mysql│
                       │   MySQL 8.0     │
                       └─────────────────┘
```

## License
[Your License Here]
