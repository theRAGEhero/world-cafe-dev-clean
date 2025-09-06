# World Café Platform

A digital platform for World Café discussion sessions with real-time recording, transcription, and AI-powered analysis.

## ✨ Features

- 🎤 **Audio Recording & Transcription** - Real-time speech-to-text with speaker diarization
- 🔄 **Session Management** - Create and manage multi-table discussion sessions
- 📊 **AI Analysis** - Automated conversation analysis and insights
- 📱 **QR Code Integration** - Easy mobile access for participants
- 🔐 **Password Protection** - Secure admin and table-level access
- 💬 **Session Chat** - Built-in chat system for session coordination
- 🐳 **Docker Ready** - Complete containerized deployment

## 🚀 Quick Start (Docker - Recommended)

### Prerequisites
- Docker & Docker Compose
- 2GB+ free disk space

### 1. Clone & Configure
```bash
git clone <repository-url>
cd world-cafe-platform

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys and settings
```

### 2. Deploy with Docker
```bash
# Start the platform (MySQL + App)
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f app
```

### 3. Access the Platform
- **Web Interface**: http://localhost:3005
- **Admin Panel**: Use the admin password from your .env file
- **API Health**: http://localhost:3005/api/admin/settings/status

## 🔧 Configuration

### Required Environment Variables

```bash
# API Keys (Required for transcription/analysis)
DEEPGRAM_API_KEY=your_deepgram_api_key
GROQ_API_KEY=your_groq_api_key

# Database (Auto-configured for Docker)
DB_HOST=mysql
DB_USER=worldcafe
DB_PASSWORD=secure_password_123
DB_NAME=worldcafe_db

# Server Settings
BASE_URL=http://localhost:3005  # Change for production
ADMIN_PASSWORD=your_secure_password
SESSION_SECRET=your_session_secret
```

### Production Deployment

```bash
# Update BASE_URL for your domain
BASE_URL=https://your-domain.com

# Use secure passwords
ADMIN_PASSWORD=your_very_secure_password
DB_PASSWORD=your_very_secure_db_password

# Deploy
docker-compose up -d
```

## 📚 API Keys Setup

### Deepgram (Speech-to-Text)
1. Sign up at https://deepgram.com
2. Get your API key from the dashboard
3. Add to `.env`: `DEEPGRAM_API_KEY=your_key`

### Groq (AI Analysis) 
1. Sign up at https://console.groq.com
2. Create an API key
3. Add to `.env`: `GROQ_API_KEY=your_key`

## 🔧 Development Setup

### Local Development (Alternative)
```bash
# Install dependencies
npm install

# Configure local MySQL database
# Create database: world_cafe_platform

# Start development server
npm run dev

# Access at http://localhost:3000
```

## 📱 Mobile Access & QR Codes

The platform generates QR codes for easy mobile access:
- **Session QR**: Join the session overview
- **Table QR**: Direct access to specific tables

Configure `BASE_URL` for proper mobile redirection:
```bash
# Local development
BASE_URL=http://192.168.1.100:3005

# Production
BASE_URL=https://your-domain.com
```

## 🗄️ Database

- **Auto-Migration**: Database schema automatically created on first run
- **Backup**: Use `docker-compose exec mysql mysqldump...`
- **Reset**: `docker-compose down -v` (⚠️ destroys all data)

## 📋 Usage

1. **Create Session**: Set title, table count, and configuration
2. **Share QR Codes**: Print or share generated QR codes
3. **Record Discussions**: Participants join tables and record conversations
4. **View Analysis**: Real-time transcription and AI insights
5. **Export Data**: Download transcripts and analysis reports

## 🛠️ Troubleshooting

### Common Issues

**Docker containers won't start:**
```bash
# Check logs
docker-compose logs

# Restart services
docker-compose restart
```

**Database connection errors:**
```bash
# Wait for MySQL to fully initialize
docker-compose logs mysql

# Reset database (⚠️ destroys data)
docker-compose down -v && docker-compose up -d
```

**QR codes not working:**
```bash
# Check BASE_URL in .env
# Ensure port 3005 is accessible
# Verify QR code files are generated
```

## 📄 License

This project is licensed under the ISC License.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Docker
5. Submit a pull request

---

**Made with ❤️ for meaningful conversations**