# Docker Deployment Usage

## Quick Start

The World Café Platform is ready for Docker deployment with all database components included.

### Starting the Application

```bash
# Build and start all services
docker-compose up -d

# Check status
docker-compose ps
```

### Accessing the Application

- **Application**: http://localhost:3005
- **MySQL Database**: localhost:3307 (external access)

### Environment Configuration

The application uses environment variables from `.env` file:

- **Database**: Automatically configured MySQL 8.0 container
- **API Keys**: Deepgram and Groq APIs for transcription and analysis
- **Admin**: Default admin password configured

### Database Features

✅ **Automatic Migration**: All database migrations applied on startup
✅ **Activity Logging**: Complete activity_logs table for audit trail
✅ **Persistent Storage**: MySQL data persisted in Docker volumes
✅ **Health Checks**: Database health checks ensure app starts after DB is ready

### Container Management

```bash
# Stop all services
docker-compose down

# Stop and remove volumes (complete reset)
docker-compose down --volumes

# View logs
docker logs world-cafe-app
docker logs world-cafe-mysql

# Restart specific service
docker restart world-cafe-app
```

### Production Notes

- All database schemas and migrations are automatically applied
- QR codes and uploads are persisted in Docker volumes
- Application runs on port 3005 externally
- MySQL runs on port 3307 externally
- Environment variables are configured for production use

**The application is ready to work at first shot!** 🎉