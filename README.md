# World Café Platform - Development Environment

Clean development environment extracted from the working Docker container.

## Quick Start

### Local Development (with external MySQL)
```bash
# Install dependencies
npm install

# Start local MySQL and create database
# Use password: SO6mpssfLOrH5Nr^NuB%&SboZs

# Start platform
npm start
```

### Docker Development
```bash
# Load the production image
docker load -i world-cafe-embedded.tar

# Run container
docker run -d -p 3000:3000 --name world-cafe-dev world-cafe-embedded
```

## Environment

- **Development Mode**: NODE_ENV=development
- **Database**: Configured for localhost (switch to 127.0.0.1 for Docker)
- **APIs**: Pre-configured with working keys
- **Port**: 3000
- **QR Codes**: Configure BASE_URL for proper mobile redirection

### QR Code Configuration

For QR codes to work correctly on mobile devices, update the BASE_URL:

**Local Development:**
```
BASE_URL=http://localhost:3000
```

**Network Access (LAN):**
```
BASE_URL=http://192.168.1.100:3000
```

**Production Domain:**
```
BASE_URL=https://your-domain.com
```

**Docker Deployment:**
```bash
docker run -d -p 3000:3000 -e BASE_URL=https://your-domain.com --name world-cafe-platform world-cafe-embedded
```

## Files Included

- Complete backend application
- Frontend public files
- All uploads and transcriptions
- Database schema and migrations
- Working Docker image
- All dependencies

This is a complete working environment ready for continued development.