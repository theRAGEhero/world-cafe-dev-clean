# World Café Platform - Docker Setup

Quick deployment using Docker Compose.

## Prerequisites

- Docker and Docker Compose installed
- At least 2GB RAM available
- Ports 3005 and 3307 available

## Quick Start

1. **Clone or extract the project:**
   ```bash
   cd world-cafe-dev-clean
   ```

2. **Start the platform:**
   ```bash
   docker-compose up -d
   ```

3. **Access the platform:**
   - Web Interface: http://localhost:3005
   - Admin Panel: Click "Admin" and use password from settings
   - Database: MySQL on localhost:3307

## Configuration

### Environment Variables

Edit `docker-compose.yml` to customize:

```yaml
environment:
  # Change to your domain for QR codes
  BASE_URL: https://your-domain.com
  
  # Update API keys (optional)
  DEEPGRAM_API_KEY: your_deepgram_key
  GROQ_API_KEY: your_groq_key
  
  # Change admin password
  ADMIN_PASSWORD: your_admin_password
```

### Platform Password Protection

1. Access admin panel at http://localhost:3005
2. Go to "Platform Protection" section
3. Enable password protection
4. Set custom password (default: testtesttest)

## Services

- **app**: World Café Platform (Node.js)
- **mysql**: MySQL 8.0 Database

## Data Persistence

All data is persisted in Docker volumes:
- `mysql_data`: Database files
- `uploads_data`: Audio recordings
- `qr_data`: Generated QR codes

## Management Commands

```bash
# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up -d --build

# Access database
docker exec -it world-cafe-mysql mysql -u world_cafe_user -p
```

## Production Deployment

1. Update `BASE_URL` to your domain
2. Change default passwords
3. Configure SSL/HTTPS proxy (nginx/traefik)
4. Set up backup strategy for volumes

## Troubleshooting

- **Port conflicts**: Change ports in docker-compose.yml
- **Database issues**: Check `docker-compose logs mysql`
- **App issues**: Check `docker-compose logs app`