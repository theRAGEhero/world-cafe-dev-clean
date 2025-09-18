# How to Update the Docker Hub Image

When you make changes to the code and want to update the production deployment:

## 1. Build and Push New Image (Development Server)

```bash
# Build the new image
docker build -t democracyroutes-cafe:latest .

# Tag for Docker Hub
docker tag democracyroutes-cafe:latest alexdoit/democracyroutes-cafe:latest

# Push to Docker Hub (requires docker login)
docker push alexdoit/democracyroutes-cafe:latest
```

## 2. Update Production Servers

On each production server:

```bash
# Pull the latest image
docker-compose -f docker-compose.hub.yml pull

# Restart with the new image
docker-compose -f docker-compose.hub.yml up -d

# Verify the update
curl http://localhost:3005/api/admin/settings/status
```

## Alternative: One-Line Update Script

Create this script on production servers:

```bash
#!/bin/bash
# update.sh
echo "🔄 Updating World Café Platform..."
docker-compose -f docker-compose.hub.yml pull
docker-compose -f docker-compose.hub.yml up -d
echo "✅ Update complete!"
docker ps
```

Make it executable:
```bash
chmod +x update.sh
./update.sh
```

## Version Tags (Optional)

For better version control, you can use version tags:

```bash
# Development server - build with version tag
docker build -t democracyroutes-cafe:v1.2.0 .
docker tag democracyroutes-cafe:v1.2.0 alexdoit/democracyroutes-cafe:v1.2.0
docker tag democracyroutes-cafe:v1.2.0 alexdoit/democracyroutes-cafe:latest
docker push alexdoit/democracyroutes-cafe:v1.2.0
docker push alexdoit/democracyroutes-cafe:latest

# Production server - use specific version
# Change docker-compose.hub.yml to use: alexdoit/democracyroutes-cafe:v1.2.0
```

This ensures you can rollback to previous versions if needed.