# Quick Production Deployment Guide

## 🚀 One-Command Production Deployment

### Prerequisites
- Docker and Docker Compose installed
- Internet connection to pull images

### 1. Clone and Setup (2 minutes)
```bash
# Clone the repository
git clone https://github.com/alexdoit/world-cafe-dev-clean.git
cd world-cafe-dev-clean

# Create environment file
cp .env.example .env
```

### 2. Configure Environment (1 minute)
Edit `.env` file with your settings:
```bash
nano .env
```

**Required changes:**
```bash
# API Keys (Get from Deepgram and Groq)
DEEPGRAM_API_KEY=your_deepgram_api_key_here
GROQ_API_KEY=your_groq_api_key_here

# Security (Use strong passwords)
DB_PASSWORD=your_secure_database_password
DB_ROOT_PASSWORD=your_secure_root_password
ADMIN_PASSWORD=your_secure_admin_password
SESSION_SECRET=your_random_session_secret

# Public URL (Change to your domain/IP)
BASE_URL=http://your-server-ip-or-domain
```

### 3. Deploy (30 seconds)
```bash
# Production deployment (port 80)
docker-compose -f docker-compose.hub.prod.yml up -d
```

### 4. Verify (10 seconds)
```bash
# Check all containers are running
docker ps

# Test the application
curl http://localhost/api/admin/settings/status
```

## 🎯 Access Your Platform

- **Web Interface**: http://your-server-ip
- **Admin Panel**: Login with your `ADMIN_PASSWORD`
- **Database**: Port 3307 (for backups)

## 🔧 Post-Deployment

### SSL/HTTPS Setup (Optional but Recommended)
```bash
# Install nginx and certbot
sudo apt install nginx certbot python3-certbot-nginx

# Create nginx config
sudo nano /etc/nginx/sites-available/world-cafe
```

Add this nginx configuration:
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

```bash
# Enable the site
sudo ln -s /etc/nginx/sites-available/world-cafe /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Get SSL certificate
sudo certbot --nginx -d your-domain.com

# Update BASE_URL in .env
nano .env
# Change: BASE_URL=https://your-domain.com

# Restart the application
docker-compose -f docker-compose.hub.prod.yml restart app
```

## 🛠️ Maintenance Commands

```bash
# View logs
docker-compose -f docker-compose.hub.prod.yml logs -f app

# Restart application
docker-compose -f docker-compose.hub.prod.yml restart app

# Stop everything
docker-compose -f docker-compose.hub.prod.yml down

# Backup database
docker exec world-cafe-mysql mysqldump -u root -p${DB_ROOT_PASSWORD} world_cafe_platform > backup.sql

# Update to latest version
git pull
docker-compose -f docker-compose.hub.prod.yml pull
docker-compose -f docker-compose.hub.prod.yml up -d
```

## 🆘 Troubleshooting

**Cannot access on port 80:**
```bash
# Check if port 80 is available
sudo netstat -tlnp | grep :80

# Stop other services using port 80
sudo systemctl stop apache2  # If Apache is running
```

**Database connection errors:**
```bash
# Check MySQL container
docker logs world-cafe-mysql

# Wait for MySQL to fully start
docker-compose -f docker-compose.hub.prod.yml restart mysql
sleep 30
docker-compose -f docker-compose.hub.prod.yml restart app
```

**Recording not working:**
- Ensure HTTPS is configured (browsers require secure context)
- Check that `BASE_URL` in `.env` matches your domain
- Verify Deepgram API key is valid

## 📞 Support

For issues:
1. Check logs: `docker-compose logs -f app`
2. Verify configuration: `curl http://localhost/api/admin/settings/status`
3. Review this guide
4. Open an issue on GitHub

---
**Total deployment time: ~5 minutes**