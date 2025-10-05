const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Database
const db = require('./database/connection');
const { Session, Table, Recording, Transcription, QRCode, Settings } = require('./database/models');

// Services
const TranscriptionService = require('./transcription');
const logger = require('./utils/logger');
const SessionChatService = require('./sessionChatService');
const PasswordUtils = require('./passwordUtils');
const { checkTableStructure } = require('./migrate');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '1gb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '1gb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'worldcafe-session-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/recordings', express.static(path.join(__dirname, '../uploads')));
app.use('/qr-codes', express.static(path.join(__dirname, 'public/qr-codes')));

// Platform password protection middleware  
async function platformPasswordMiddleware(req, res, next) {
  try {
    const settings = new Settings(db);
    const passwordEnabled = await settings.getPlatformPasswordEnabled();
    
    // Skip protection for admin login, platform password check, and static files
    const skipRoutes = [
      '/api/admin/login',
      '/api/platform/check-password', 
      '/api/platform/verify-password',
      '/styles.css',
      '/app.js'
    ];
    
    // Skip protection if disabled or for excluded routes
    if (!passwordEnabled || skipRoutes.some(route => req.path.startsWith(route))) {
      return next();
    }
    
    // For API routes, check session
    if (req.path.startsWith('/api')) {
      if (!req.session?.platformPasswordVerified) {
        return res.status(401).json({ error: 'Platform password required', requiresPassword: true });
      }
    } else {
      // For HTML routes, serve password prompt if not verified
      if (!req.session?.platformPasswordVerified) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Platform Access</title>
            <link rel="stylesheet" href="/styles.css">
          </head>
          <body style="display: flex; justify-content: center; align-items: center; min-height: 100vh; background: var(--white);">
            <div style="max-width: 400px; padding: 2rem; border: 1px solid var(--medium-gray); border-radius: var(--border-radius); background: var(--white);">
              <h2 style="text-align: center; margin-bottom: 1rem; color: var(--black);">Platform Access Required</h2>
              <form id="passwordForm" style="display: flex; flex-direction: column; gap: 1rem;">
                <input type="password" id="platformPasswordInput" placeholder="Enter platform password" style="padding: 0.75rem; border: 1px solid var(--medium-gray); border-radius: 8px; font-size: 1rem;">
                <button type="submit" style="padding: 0.75rem; background: var(--black); color: var(--white); border: none; border-radius: 8px; font-size: 1rem; cursor: pointer;">Access Platform</button>
              </form>
              <script>
                document.getElementById('passwordForm').onsubmit = async (e) => {
                  e.preventDefault();
                  const password = document.getElementById('platformPasswordInput').value;
                  const response = await fetch('/api/platform/verify-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password })
                  });
                  if (response.ok) {
                    window.location.reload();
                  } else {
                    alert('Invalid password');
                  }
                };
              </script>
            </div>
          </body>
          </html>
        `);
      }
    }
    
    next();
  } catch (error) {
    console.error('Error in platform password middleware:', error);
    next();
  }
}

app.use(platformPasswordMiddleware);

// Storage configuration for audio uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    const allowedTypes = /wav|mp3|mp4|m4a|webm|ogg|mov|avi/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('audio/') || file.mimetype.startsWith('video/');
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only audio and video files are allowed (WAV, MP3, MP4, M4A, WebM, OGG, MOV, AVI)'));
    }
  },
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB limit
});

// Initialize services
const transcriptionService = new TranscriptionService();
// Chat service disabled - requires AI services

// Initialize database connection
async function initializeDatabase() {
  try {
    const success = await db.connect();
    if (success) {
      console.log('Database connected successfully');
      
      // Initialize logger with database connection
      logger.initialize(db);
      logger.info('Server starting up', { timestamp: new Date() });
      
      // Run database migrations/checks (can be disabled with SKIP_DB_CHECKS=true)
      if (process.env.SKIP_DB_CHECKS !== 'true') {
        try {
          await checkTableStructure();
          console.log('Database schema verified');
          logger.info('Database schema verified');
        } catch (migrationError) {
          console.error('Database migration failed:', migrationError.message);
          console.warn('Some database features may not work properly');
          logger.error('Database migration failed', { error: migrationError.message });
        }
        
        // Run pending migrations
        try {
          const { runMigrations } = require('./migrate');
          await runMigrations();
          console.log('Database migrations completed');
        } catch (migrationError) {
          console.error('Migration execution failed:', migrationError.message);
          console.warn('Some database features may not work properly');
        }
      } else {
        console.log('⏭️  Skipping database checks (SKIP_DB_CHECKS=true)');
      }
      
      // Initialize and load global settings
      try {
        const settings = new Settings(db);
        await settings.loadIntoEnvironment();
        console.log('Global settings loaded into environment');
      } catch (settingsError) {
        console.error('Failed to load settings:', settingsError.message);
        console.warn('Using default/environment variable settings');
      }
      
      return true;
    } else {
      console.error('Database connection failed');
      return false;
    }
  } catch (error) {
    console.error('Database initialization error:', error);
    return false;
  }
}

// Client and recording tracking for real-time table status
const tableClients = new Map(); // tableId -> Set of {socketId, sessionId}
const clientToTable = new Map(); // socketId -> {tableId, sessionId}
const tableRecordingStatus = new Map(); // tableId -> {isRecording, isStreaming, status, startTime}

// Helper function to get connected clients in a session
function getConnectedClientsInSession(sessionId) {
  const clients = [];
  const room = io.sockets.adapter.rooms.get(sessionId);
  if (room) {
    for (const socketId of room) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        clients.push(socket);
      }
    }
  }
  return clients;
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Add a heartbeat to help detect dead connections
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} joined session ${sessionId}`);
  });
  
  socket.on('join-table', (data) => {
    // Handle both formats: join-table(tableId) and join-table({tableId, sessionId})
    let tableId, sessionId;
    
    if (typeof data === 'object' && data.tableId) {
      // New format: {tableId, sessionId}
      tableId = data.tableId;
      sessionId = data.sessionId;
    } else {
      // Legacy format: just tableId
      tableId = data;
      // We'll skip session-specific tracking for legacy calls
      console.log(`Client ${socket.id} joined table ${tableId} (legacy format)`);
      return;
    }
    
    // Clean up any existing mapping for this socket to prevent duplicates
    const existingMapping = clientToTable.get(socket.id);
    if (existingMapping) {
      const oldTableId = existingMapping.tableId;
      if (tableClients.has(oldTableId)) {
        tableClients.get(oldTableId).delete(socket.id);
        
        // Update old table's client count
        const oldSessionId = existingMapping.sessionId;
        if (oldSessionId && tableClients.get(oldTableId).size >= 0) {
          io.to(oldSessionId).emit('table-client-update', {
            tableId: oldTableId,
            clientCount: tableClients.get(oldTableId).size,
            hasClients: tableClients.get(oldTableId).size > 0,
            timestamp: new Date()
          });
        }
      }
    }
    
    // Track client for this table
    if (!tableClients.has(tableId)) {
      tableClients.set(tableId, new Set());
    }
    tableClients.get(tableId).add(socket.id);
    clientToTable.set(socket.id, { tableId, sessionId });
    
    console.log(`Client ${socket.id} joined table ${tableId} in session ${sessionId} (${tableClients.get(tableId).size} total clients)`);
    
    // Broadcast updated client count to session
    if (sessionId) {
      io.to(sessionId).emit('table-client-update', {
        tableId,
        clientCount: tableClients.get(tableId).size,
        hasClients: true,
        timestamp: new Date()
      });
    }
  });

  // Handle explicit table leaving (for table switching)
  socket.on('leave-table', (data) => {
    if (typeof data === 'object' && data.tableId && data.sessionId) {
      const { tableId, sessionId } = data;
      
      console.log(`Client ${socket.id} explicitly leaving table ${tableId} in session ${sessionId}`);
      
      // Remove from table tracking
      if (tableClients.has(tableId)) {
        tableClients.get(tableId).delete(socket.id);
        
        // Broadcast updated client count
        const remainingClients = tableClients.get(tableId).size;
        io.to(sessionId).emit('table-client-update', {
          tableId,
          clientCount: remainingClients,
          hasClients: remainingClients > 0,
          timestamp: new Date()
        });
        
        // Clean up empty sets
        if (remainingClients === 0) {
          tableClients.delete(tableId);
        }
        
        console.log(`Client ${socket.id} left table ${tableId}, ${remainingClients} clients remaining`);
      }
      
      // Remove from clientToTable mapping only if it matches this table
      const currentMapping = clientToTable.get(socket.id);
      if (currentMapping && currentMapping.tableId === tableId) {
        clientToTable.delete(socket.id);
        console.log(`Removed client ${socket.id} from clientToTable mapping`);
      }
    }
  });
  
  socket.on('table-status-update', (data) => {
    socket.to(data.sessionId).emit('table-status-changed', data);
  });
  
  socket.on('recording-started', (data) => {
    // Track recording status
    tableRecordingStatus.set(data.tableId, {
      isRecording: true,
      isStreaming: false,
      status: 'recording',
      startTime: new Date()
    });
    
    // Broadcast recording status to session and table clients
    socket.to(data.sessionId).emit('recording-status', { 
      tableId: data.tableId, 
      status: 'recording',
      timestamp: new Date()
    });
    
    // Broadcast to session dashboard for real-time indicators
    io.to(data.sessionId).emit('table-recording-update', {
      tableId: data.tableId,
      status: 'recording',
      timestamp: new Date()
    });
  });
  
  socket.on('recording-stopped', (data) => {
    // Update recording status
    if (tableRecordingStatus.has(data.tableId)) {
      const currentStatus = tableRecordingStatus.get(data.tableId);
      tableRecordingStatus.set(data.tableId, {
        ...currentStatus,
        isRecording: false,
        status: 'stopped'
      });
    }
    
    // Broadcast recording status to session and table clients
    socket.to(data.sessionId).emit('recording-status', { 
      tableId: data.tableId, 
      status: 'stopped',
      timestamp: new Date()
    });
    
    // Broadcast to session dashboard for real-time indicators
    io.to(data.sessionId).emit('table-recording-update', {
      tableId: data.tableId,
      status: 'idle',
      timestamp: new Date()
    });
  });
  
  // Live transcription WebSocket handlers
  socket.on('start-live-transcription', async (data) => {
    try {
      console.log(`🎤 Starting live transcription for table ${data.tableId} in session ${data.sessionId}`);
      console.log(`🔑 Deepgram API Key configured: ${!!process.env.DEEPGRAM_API_KEY}`);
      console.log(`🔑 API Key starts with: ${process.env.DEEPGRAM_API_KEY ? process.env.DEEPGRAM_API_KEY.substring(0, 10) + '...' : 'NOT SET'}`);
      
      const DeepgramSTT = require('./transcription');
      const deepgram = new DeepgramSTT();
      
      // Start Deepgram live transcription
      console.log(`🚀 Creating Deepgram live connection with options:`, {
        language: data.language || 'en-US'
      });
      
      const connection = await deepgram.startLiveTranscription({
        language: data.language || 'en-US'
      });
      
      console.log(`🔗 Deepgram connection created:`, !!connection);
      console.log(`🔗 Connection type:`, typeof connection);
      
      // Store connection for this socket
      socket.deepgramConnection = connection;
      
      // Handle Deepgram results (note: lowercase 'results' for live API)
      connection.on('results', (data) => {
        try {
          console.log('🔍 Raw Deepgram response length:', data.length);
          const result = JSON.parse(data);
          console.log('🔍 Parsed Deepgram result type:', result.type || 'unknown');
          
          let transcript = '';
          let isFinal = false;
          
          // Try multiple possible Deepgram response formats for live streaming
          if (result && result.channel && result.channel.alternatives && result.channel.alternatives[0]) {
            // Format 1: result.channel.alternatives[0].transcript (Deepgram Live API)
            transcript = result.channel.alternatives[0].transcript;
            isFinal = result.is_final || false;
            console.log('📝 Using format 1: channel.alternatives[0]');
          } else if (result && result.results && result.results.channels && result.results.channels[0] && result.results.channels[0].alternatives && result.results.channels[0].alternatives[0]) {
            // Format 2: result.results.channels[0].alternatives[0].transcript (Deepgram File API format)
            transcript = result.results.channels[0].alternatives[0].transcript;
            isFinal = result.results.is_final || result.is_final || false;
            console.log('📝 Using format 2: results.channels[0].alternatives[0]');
          } else if (result && result.alternatives && result.alternatives[0]) {
            // Format 3: result.alternatives[0].transcript (Alternative format)
            transcript = result.alternatives[0].transcript;
            isFinal = result.is_final || false;
            console.log('📝 Using format 3: alternatives[0]');
          }
          
          console.log(`📝 Extracted transcript: "${transcript}", isFinal: ${isFinal}`);
          
          if (transcript && transcript.trim()) {
            // Send real-time transcription to client
            console.log(`📤 Sending to client: "${transcript}" (${isFinal ? 'final' : 'interim'})`);
            socket.emit('live-transcription-result', {
              transcript: transcript,
              is_final: isFinal,
              timestamp: new Date()
            });
          } else if (transcript === '') {
            console.log('📝 Empty transcript - likely silence or processing');
          } else {
            console.log('⚠️ Unexpected Deepgram response format:', JSON.stringify(result, null, 2));
          }
        } catch (error) {
          console.error('❌ Error processing Deepgram response:', error);
          console.error('❌ Raw data:', data);
        }
      });
      
      connection.on('error', (error) => {
        console.error('❌ Deepgram live transcription error:', error);
        socket.emit('live-transcription-error', { error: error.message || error });
      });
      
      connection.on('close', (event) => {
        console.log('🔌 Deepgram live transcription connection closed');
        console.log('🔌 Close event details:', event);
        socket.emit('live-transcription-ended');
      });
      
      connection.on('open', () => {
        console.log('✅ Deepgram live transcription connection opened successfully');
        socket.emit('live-transcription-started');
      });
      
      // Add metadata event listener for connection status
      connection.on('metadata', (data) => {
        console.log('📊 Deepgram metadata:', data);
      });
      
      // Add warning event listener
      connection.on('warning', (warning) => {
        console.warn('⚠️ Deepgram warning:', warning);
      });
      
      socket.emit('live-transcription-started');
      
    } catch (error) {
      console.error('❌ Error starting live transcription:', error);
      socket.emit('live-transcription-error', { error: error.message });
    }
  });
  
  socket.on('live-audio-chunk', (audioData) => {
    // Forward audio chunk to Deepgram
    if (socket.deepgramConnection) {
      console.log(`🎵 Forwarding audio chunk to Deepgram: ${audioData.byteLength} bytes`);
      socket.deepgramConnection.send(audioData);
    } else {
      console.log('⚠️ No Deepgram connection available for audio chunk');
    }
  });
  
  socket.on('stop-live-transcription', () => {
    console.log(`🛑 Stopping live transcription for socket ${socket.id}`);
    
    if (socket.deepgramConnection) {
      socket.deepgramConnection.finish();
      socket.deepgramConnection = null;
    }
    
    socket.emit('live-transcription-stopped');
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Clean up live transcription connection
    if (socket.deepgramConnection) {
      socket.deepgramConnection.finish();
      socket.deepgramConnection = null;
    }
    
    // Remove from table tracking
    const clientInfo = clientToTable.get(socket.id);
    if (clientInfo) {
      const { tableId, sessionId } = clientInfo;
      
      if (tableClients.has(tableId)) {
        tableClients.get(tableId).delete(socket.id);
        
        // Broadcast updated client count
        const remainingClients = tableClients.get(tableId).size;
        io.to(sessionId).emit('table-client-update', {
          tableId,
          clientCount: remainingClients,
          hasClients: remainingClients > 0,
          timestamp: new Date()
        });
        
        // Clean up empty sets
        if (remainingClients === 0) {
          tableClients.delete(tableId);
        }
      }
      
      clientToTable.delete(socket.id);
    }
  });
});

// Routes

// Logs endpoint for frontend logging
app.post('/api/logs', (req, res) => {
  try {
    const { logs } = req.body;
    
    if (!logs || !Array.isArray(logs)) {
      return res.status(400).json({ error: 'Invalid logs format' });
    }

    // Process each log entry
    logs.forEach(logEntry => {
      const { level, message, action, userId, sessionId, error, ...meta } = logEntry;
      
      // Extract request info
      const requestInfo = {
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent'),
        ...meta
      };

      // Log using appropriate method based on level
      switch (level) {
        case 'error':
          logger.error(message, { action, userId, sessionId, error, ...requestInfo });
          break;
        case 'warn':
          logger.warn(message, { action, userId, sessionId, ...requestInfo });
          break;
        case 'info':
          if (action) {
            logger.logUserAction(action, userId, { sessionId, ...requestInfo });
          } else {
            logger.info(message, { userId, sessionId, ...requestInfo });
          }
          break;
        case 'debug':
          logger.debug(message, { userId, sessionId, ...requestInfo });
          break;
        default:
          logger.info(message, { userId, sessionId, ...requestInfo });
      }
    });

    res.json({ success: true, processed: logs.length });
  } catch (error) {
    logger.error('Failed to process frontend logs', { error: error.message });
    res.status(500).json({ error: 'Failed to process logs' });
  }
});

// Admin endpoint to view activity logs
app.get('/api/admin/logs', async (req, res) => {
  try {
    const { action, userId, sessionId, since, limit } = req.query;
    
    const filters = {};
    if (action) filters.action = action;
    if (userId) filters.userId = userId;
    if (sessionId) filters.sessionId = sessionId;
    if (since) filters.since = since;
    if (limit) filters.limit = parseInt(limit);

    const logs = await logger.getActivityLogs(filters);
    res.json({ logs, total: logs.length });
  } catch (error) {
    logger.error('Failed to retrieve admin logs', { error: error.message });
    res.status(500).json({ error: 'Failed to retrieve logs' });
  }
});

// Health check
app.get('/api/health', async (req, res) => {
  const dbHealth = await db.isHealthy();
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: dbHealth ? 'connected' : 'disconnected'
  });
});

// Session management
app.post('/api/sessions', async (req, res) => {
  try {
    const { title, description, language = 'en-US', tableCount = 10 } = req.body;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`;
    
    let session;
    let sessionWithStats = null;
    
    // Try database first, fall back to memory
    if (await db.isHealthy()) {
      try {
        // Generate admin password
        const adminPassword = PasswordUtils.generatePassword(8);
        const adminPasswordHash = PasswordUtils.hashPassword(adminPassword);
        
        // Create session in database
        session = await Session.create({
          title,
          description,
          language,
          tableCount,
          admin_password: adminPassword,
          admin_password_hash: adminPasswordHash
        });
        
        // Create tables for the session
        await Table.createTablesForSession(session.id, tableCount);
        
        // Generate QR codes in database
        await QRCode.generateSessionQRs(session.id, tableCount, baseUrl);
        
        sessionWithStats = await Session.findWithStats(session.id);
      } catch (dbError) {
        console.error('Database session creation failed:', dbError);
        throw dbError;
      }
    } else {
      // Fallback to in-memory session (for backward compatibility)
      session = {
        id: uuidv4(),
        title,
        description,
        language,
        tableCount,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      // This fallback path should not be used since database should always be available
      throw new Error('Database unavailable - cannot create session');
      
      sessionWithStats = session;
    }
    
    // Add QR code paths to response
    sessionWithStats.qrCodes = {
      session: `/qr-codes/session-${session.id}.png`,
      tables: {}
    };
    
    for (let i = 1; i <= tableCount; i++) {
      sessionWithStats.qrCodes.tables[i] = `/qr-codes/table-${session.id}-${i}.png`;
    }
    
    res.json(sessionWithStats);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Session import endpoint
app.post('/api/sessions/import', async (req, res) => {
  try {
    const importData = req.body;
    
    // Validate import data
    if (!importData.exportVersion || !importData.session || !importData.transcriptions) {
      return res.status(400).json({ error: 'Invalid import data format' });
    }
    
    if (!await db.isHealthy()) {
      return res.status(503).json({ error: 'Database unavailable' });
    }
    
    const originalSession = importData.session;
    const transcriptions = importData.transcriptions;
    
    // Generate new session ID to avoid conflicts
    const newSessionId = uuidv4();
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`;
    
    // Create new session with imported data
    const adminPassword = PasswordUtils.generatePassword(8);
    const adminPasswordHash = PasswordUtils.hashPassword(adminPassword);
    
    const sessionData = {
      title: `${originalSession.title} (Imported)`,
      description: originalSession.description || `Imported session from ${importData.exportDate}`,
      language: originalSession.language || 'en-US',
      tableCount: originalSession.table_count || 10,
      admin_password: adminPassword,
      admin_password_hash: adminPasswordHash,
      session_duration: originalSession.session_duration || 120,
      rotation_enabled: originalSession.rotation_enabled || 0,
      recording_enabled: originalSession.recording_enabled || 1,
      max_participants: originalSession.max_participants || 100
    };
    
    try {
      // Create the session
      const newSession = await Session.create(sessionData);
      
      // Create tables for the session
      await Table.createTablesForSession(newSession.id, sessionData.tableCount);
      
      // Participant import removed (participants functionality disabled)
      
      // Import transcriptions
      const Transcription = require('./database/models/Transcription');
      const Recording = require('./database/models/Recording');
      
      for (const transcription of transcriptions) {
        try {
          // Create mock recording entry first using proper Recording.create method
          const recording = await Recording.create({
            sessionId: newSession.id,
            tableId: transcription.table_id || 1,
            participantId: null,
            filename: transcription.filename || `imported_${Date.now()}.wav`,
            filePath: 'imported',
            fileSize: 0,
            duration: parseFloat(transcription.duration_seconds) || 0,
            mimeType: 'audio/wav'
          });
          
          // Update status to processed
          await recordingInstance.updateStatus(recording.id, 'processed');
          
          // Create transcription
          const transcriptionInstance = new Transcription();
          await transcriptionInstance.create({
            id: uuidv4(),
            session_id: newSession.id,
            table_id: transcription.table_id || 1,
            recording_id: recording.id,
            transcript_text: transcription.transcript_text || '',
            confidence_score: parseFloat(transcription.confidence_score) || 0.9,
            language: transcription.language || sessionData.language || 'en-US',
            word_count: parseInt(transcription.word_count) || 0,
            speaker_segments: JSON.stringify(transcription.speaker_segments || []),
            timestamps: JSON.stringify(transcription.timestamps || [])
          });
        } catch (transcriptionError) {
          console.warn('Failed to import transcription:', transcriptionError.message);
        }
      }
      
      // Generate QR codes for new session
      await QRCode.generateSessionQRs(newSession.id, sessionData.tableCount, baseUrl);
      
      // Get complete session with stats
      const importedSession = await Session.findWithStats(newSession.id);
      
      res.json({
        sessionId: newSession.id,
        title: importedSession.title,
        success: true,
        imported: {
          transcriptions: transcriptions.length,
          tables: sessionData.tableCount,
          originalExportDate: importData.exportDate
        },
        ...importedSession
      });
      
    } catch (error) {
      throw error;
    }
    
  } catch (error) {
    console.error('Import error:', error);
    res.status(500).json({ error: `Import failed: ${error.message}` });
  }
});

// Health check endpoint for Docker
app.get('/health', async (req, res) => {
  try {
    // Check database connection
    const isDbHealthy = await db.isHealthy();
    
    if (isDbHealthy) {
      res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        uptime: process.uptime()
      });
    } else {
      res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected'
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    if (await db.isHealthy()) {
      const sessions = await Session.findActive();
      res.json(sessions);
    } else {
      // Fallback to empty array for now - in production you might want in-memory storage
      res.json([]);
    }
  } catch (error) {
    console.error('Error fetching sessions:', error);
    // Fallback response
    res.json([]);
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    if (await db.isHealthy()) {
      const session = await Session.findWithStats(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Get tables (without participants)
      const tables = await Table.findBySessionId(session.id);
      session.tables = tables;
      
      res.json(session);
    } else {
      // Fallback - session not found in memory mode
      res.status(404).json({ error: 'Session not found - database not available' });
    }
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(404).json({ error: 'Session not found' });
  }
});

app.put('/api/sessions/:id', async (req, res) => {
  try {
    const updates = req.body;
    const session = await Session.update(req.params.id, updates);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    console.error('Error updating session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin session management endpoints
app.post('/api/admin/sessions/:id/close', async (req, res) => {
  try {
    const { reason } = req.body;
    const adminUser = req.body.adminUser || 'admin';
    
    const session = await Session.closeSession(req.params.id, adminUser, reason);
    res.json({ 
      success: true, 
      message: 'Session closed successfully',
      session: session
    });
  } catch (error) {
    console.error('Error closing session:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/sessions/:id/reopen', async (req, res) => {
  try {
    const { reason } = req.body;
    const adminUser = req.body.adminUser || 'admin';
    
    const session = await Session.reopenSession(req.params.id, adminUser, reason);
    res.json({ 
      success: true, 
      message: 'Session reopened successfully',
      session: session
    });
  } catch (error) {
    console.error('Error reopening session:', error);
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/admin/sessions/:id', async (req, res) => {
  try {
    const { reason } = req.body;
    const adminUser = req.body.adminUser || 'admin';
    
    const result = await Session.deleteSession(req.params.id, adminUser, reason);
    res.json(result);
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/admin/sessions/:id/restore', async (req, res) => {
  try {
    const { reason } = req.body;
    const adminUser = req.body.adminUser || 'admin';
    
    const session = await Session.restoreSession(req.params.id, adminUser, reason);
    res.json({ 
      success: true, 
      message: 'Session restored successfully',
      session: session
    });
  } catch (error) {
    console.error('Error restoring session:', error);
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/sessions', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const status = req.query.status;
    
    let sessions;
    if (status) {
      sessions = await Session.findByStatus(status, includeDeleted);
    } else {
      sessions = await Session.findAll(includeDeleted);
    }
    
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching admin sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/sessions/:id/history', async (req, res) => {
  try {
    const history = await Session.getSessionHistory(req.params.id);
    res.json(history);
  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/dashboard/stats', async (req, res) => {
  try {
    const stats = await Session.getAdminDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching admin dashboard stats:', error);
    res.status(500).json({ error: error.message });
  }
});

// Table management
app.post('/api/sessions/:sessionId/tables/:tableNumber/join', async (req, res) => {
  try {
    const { sessionId, tableNumber } = req.params;
    const { participantName } = req.body;
    
    // Find the table
    const table = await Table.findBySessionAndNumber(sessionId, parseInt(tableNumber));
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // Simple join - no participant records created, just return table info
    await Table.updateStatus(table.id, 'active');
    
    // Get updated table info without participants
    const updatedTable = await Table.findById(table.id);
    
    io.to(sessionId).emit('table-updated', { tableId: table.id, table: updatedTable });
    res.json({ table: updatedTable, participantName });
    
  } catch (error) {
    console.error('Error joining table:', error);
    res.status(400).json({ error: error.message });
  }
});

// Regenerate QR codes for a session (admin function)
app.post('/api/sessions/:sessionId/regenerate-qr', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
    
    // Delete existing QR codes for this session
    await db.query('DELETE FROM qr_codes WHERE entity_id = ? OR entity_id IN (SELECT id FROM tables WHERE session_id = ?)', [sessionId, sessionId]);
    
    // Find session and table count
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Generate new QR codes
    await QRCode.generateSessionQRs(sessionId, session.table_count, baseUrl);
    
    res.json({ success: true, message: 'QR codes regenerated successfully' });
  } catch (error) {
    console.error('Error regenerating QR codes:', error);
    res.status(500).json({ error: error.message });
  }
});

// QR Code routes
app.get('/api/qr/:entityType/:entityId', async (req, res) => {
  try {
    const { entityType, entityId } = req.params;
    const qrCode = await QRCode.findActiveByEntity(entityType, entityId);
    
    if (!qrCode) {
      return res.status(404).json({ error: 'QR code not found' });
    }
    
    const imageBuffer = await QRCode.getImageBuffer(qrCode.id);
    if (imageBuffer) {
      res.contentType('image/png');
      res.send(imageBuffer);
    } else {
      res.status(404).json({ error: 'QR code image not found' });
    }
  } catch (error) {
    console.error('Error serving QR code:', error);
    res.status(500).json({ error: error.message });
  }
});

// QR Code API endpoints
app.get('/api/qr/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Find QR code for this session
    const qrCode = await QRCode.findActiveByEntity('session', sessionId);
    
    if (qrCode) {
      const filename = `session-${sessionId}.png`;
      res.redirect(`/qr-codes/${filename}`);
    } else {
      res.status(404).json({ error: 'QR code not found' });
    }
  } catch (error) {
    console.error('Error serving session QR:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/qr/table/:sessionId/:tableNumber', async (req, res) => {
  try {
    const { sessionId, tableNumber } = req.params;
    
    // Find table by session and table number
    const table = await db.queryOne(
      'SELECT id FROM tables WHERE session_id = ? AND table_number = ?',
      [sessionId, parseInt(tableNumber)]
    );
    
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // Find QR code for this table
    const qrCode = await QRCode.findActiveByEntity('table', table.id.toString());
    
    if (qrCode) {
      const filename = `table-${sessionId}-${tableNumber}.png`;
      res.redirect(`/qr-codes/${filename}`);
    } else {
      res.status(404).json({ error: 'QR code not found' });
    }
  } catch (error) {
    console.error('Error serving table QR:', error);
    res.status(500).json({ error: error.message });
  }
});

// Enhanced join routes with mobile-friendly interface
app.get('/join/:sessionId', async (req, res) => {
  try {
    // Check if session exists (database or fallback)
    let session = null;
    if (await db.isHealthy()) {
      session = await Session.findById(req.params.sessionId);
    }
    
    if (!session) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Session Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
            .error { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1 class="error">Session Not Found</h1>
          <p>The session you're trying to join doesn't exist or has expired.</p>
          <a href="/">Return to Home</a>
        </body>
        </html>
      `);
    }
    
    // Redirect to main app with session pre-selected
    res.redirect(`/?session=${session.id}`);
  } catch (error) {
    console.error('Error handling QR join:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Join Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
          .error { color: #e74c3c; }
        </style>
      </head>
      <body>
        <h1 class="error">Unable to Join Session</h1>
        <p>There was an error joining the session. Please try again.</p>
        <a href="/">Return to Home</a>
      </body>
      </html>
    `);
  }
});

app.get('/join/:sessionId/table/:tableNumber', async (req, res) => {
  try {
    const { sessionId, tableNumber } = req.params;
    
    // Check if session exists
    let session = null;
    if (await db.isHealthy()) {
      session = await Session.findById(sessionId);
    }
    
    if (!session) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Session Not Found</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
            .error { color: #e74c3c; }
          </style>
        </head>
        <body>
          <h1 class="error">Session Not Found</h1>
          <p>The session you're trying to join doesn't exist or has expired.</p>
          <a href="/">Return to Home</a>
        </body>
        </html>
      `);
    }
    
    // Redirect to main app with session and table pre-selected
    res.redirect(`/?session=${sessionId}&table=${tableNumber}`);
  } catch (error) {
    console.error('Error handling table QR join:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Join Error</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; margin: 50px; }
          .error { color: #e74c3c; }
        </style>
      </head>
      <body>
        <h1 class="error">Unable to Join Table</h1>
        <p>There was an error joining the table. Please try again.</p>
        <a href="/">Return to Home</a>
      </body>
      </html>
    `);
  }
});

// Unified Entry Endpoint - Auto-detect code/password type and route accordingly
app.post('/api/entry', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code or password is required' });
    }

    // Detect what type of input this is
    const detection = PasswordUtils.detectInputType(code);
    
    switch (detection.type) {
      case 'session_code':
        // Direct session code - check if session exists
        const session = await Session.findById(detection.input);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        return res.json({
          success: true,
          type: 'session',
          sessionId: session.id,
          redirect: `/?session=${session.id}`
        });

      case 'table_code':
        // Table code format: sessionId/table/N
        const [sessionId, , tableNumber] = detection.input.split('/');
        const tableSession = await Session.findById(sessionId);
        if (!tableSession) {
          return res.status(404).json({ error: 'Session not found' });
        }
        return res.json({
          success: true,
          type: 'table',
          sessionId: sessionId,
          tableNumber: parseInt(tableNumber),
          redirect: `/?session=${sessionId}&table=${tableNumber}`
        });

      case 'password':
        // Check if it's a session admin password
        const sessionByPassword = await Session.findByAdminPassword(detection.input);
        if (sessionByPassword) {
          return res.json({
            success: true,
            type: 'session_admin',
            sessionId: sessionByPassword.id,
            isAdmin: true,
            redirect: `/?session=${sessionByPassword.id}&admin=1`
          });
        }

        // Check if it's a table password
        const tableByPassword = await Table.findByPassword(detection.input);
        if (tableByPassword) {
          return res.json({
            success: true,
            type: 'table_password',
            sessionId: tableByPassword.session_id,
            tableNumber: tableByPassword.table_number,
            redirect: `/?session=${tableByPassword.session_id}&table=${tableByPassword.table_number}`
          });
        }

        // Password not found
        return res.status(401).json({ error: 'Invalid password or code' });

      default:
        return res.status(400).json({ error: 'Invalid code format' });
    }
  } catch (error) {
    console.error('Error in unified entry:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get specific table data
app.get('/api/sessions/:sessionId/tables/:tableNumber', async (req, res) => {
  try {
    const { sessionId, tableNumber } = req.params;
    
    // Find the table
    const table = await Table.findBySessionAndNumber(sessionId, parseInt(tableNumber));
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // Get table with stats
    const tableWithStats = await Table.getTableStats(table.id);
    res.json(tableWithStats);
    
  } catch (error) {
    console.error('Error fetching table:', error);
    res.status(500).json({ error: 'Failed to fetch table data' });
  }
});

// Get recordings for a specific table
app.get('/api/sessions/:sessionId/tables/:tableNumber/recordings', async (req, res) => {
  try {
    const { sessionId, tableNumber } = req.params;
    
    // Find the table
    const table = await Table.findBySessionAndNumber(sessionId, parseInt(tableNumber));
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // Get recordings for this table
    const recordings = await Recording.findByTableId(table.id);
    
    res.json(recordings);
  } catch (error) {
    console.error('Error fetching table recordings:', error);
    res.status(500).json({ error: 'Failed to fetch recordings' });
  }
});

// Live Transcription audio save endpoint
app.post('/api/recordings/live-transcription', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const { sessionId, tableId, tableNumber, duration, source } = req.body;
    
    if (!sessionId || !tableId || !tableNumber) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    const audioPath = req.file.path;
    const fileStats = fs.statSync(audioPath);
    
    console.log(`💾 Saving live transcription audio: ${req.file.filename}, ${fileStats.size} bytes, ${duration}s`);
    
    // Create recording record with live-transcription source
    const recording = await Recording.create({
      sessionId,
      tableId,
      filename: req.file.filename,
      filePath: audioPath,
      fileSize: fileStats.size,
      duration: parseFloat(duration) || null,
      mimeType: req.file.mimetype || 'audio/webm'
    });
    
    console.log(`💾 Live transcription recording saved with ID: ${recording.id}`);
    
    res.json({
      success: true,
      recordingId: recording.id,
      filename: req.file.filename,
      fileSize: fileStats.size,
      duration: parseFloat(duration) || null,
      message: 'Live transcription audio saved successfully'
    });
    
  } catch (error) {
    console.error('Error saving live transcription audio:', error);
    res.status(500).json({ 
      error: 'Failed to save live transcription audio',
      details: error.message
    });
  }
});

// Create transcription record endpoint (for Live Transcription)
app.post('/api/transcriptions', async (req, res) => {
  try {
    const { recordingId, sessionId, tableId, transcriptText, speakerSegments, confidenceScore, source } = req.body;
    
    if (!sessionId || !tableId || !transcriptText) {
      return res.status(400).json({ error: 'Missing required transcription parameters' });
    }
    
    // For live transcriptions, recordingId might be null/undefined
    if (!recordingId && source !== 'live-transcription') {
      return res.status(400).json({ error: 'Recording ID is required for non-live transcriptions' });
    }
    
    console.log(`📝 Creating transcription record for recording ${recordingId}, ${transcriptText.length} chars, ${speakerSegments?.length || 0} segments`);
    
    // Create transcription record
    const transcription = await Transcription.create({
      recordingId: recordingId || null, // Allow null for live transcriptions
      sessionId: sessionId,
      tableId: tableId,
      transcriptText: transcriptText,
      speakerSegments: speakerSegments || [],
      confidenceScore: parseFloat(confidenceScore) || 0.9,
      source: source || 'live-transcription'
    });
    
    console.log(`📝 Transcription record created with ID: ${transcription.id}`);
    
    res.json({
      success: true,
      transcriptionId: transcription.id,
      recordingId: recordingId,
      wordCount: transcription.word_count,
      message: 'Transcription saved successfully'
    });
    
  } catch (error) {
    console.error('Error creating transcription record:', error);
    res.status(500).json({ 
      error: 'Failed to create transcription record',
      details: error.message
    });
  }
});

// Reprocess Live Transcription audio endpoint (for failed transcriptions)
app.post('/api/recordings/:recordingId/reprocess', async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    // Find the recording
    const recording = await Recording.findWithTranscription(recordingId);
    
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    // Check if file exists
    if (!fs.existsSync(recording.file_path)) {
      return res.status(404).json({ error: 'Audio file not found on disk' });
    }
    
    // Find the session to get language setting
    const session = await Session.findById(recording.session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    console.log(`🔄 Reprocessing audio for recording ${recordingId}: ${recording.filename}`);
    console.log(`📂 File path: ${recording.file_path}`);
    console.log(`🎯 Session language: ${session.language || 'en-US'}`);
    
    // Mark as processing
    await Recording.markProcessing(recordingId);
    
    // Emit status update to connected clients
    const connectedClients = getConnectedClientsInSession(recording.session_id);
    connectedClients.forEach(client => {
      client.emit('reprocess-status', {
        recordingId: recordingId,
        status: 'processing',
        message: 'Starting reprocessing...'
      });
    });
    
    try {
      // Reprocess transcription
      const transcriptionOptions = { language: session.language || 'en-US' };
      const transcriptionResult = await transcriptionService.transcribeFile(recording.file_path, transcriptionOptions);
      
      // Extract duration if available
      const duration = transcriptionResult.results?.channels?.[0]?.alternatives?.[0]?.words?.slice(-1)?.[0]?.end || 0;
      if (duration > 0) {
        await Recording.updateDuration(recordingId, duration);
      }
      
      // Create new transcription record (if none exists) or update existing
      // Use static methods instead of constructor
      let transcription;
      
      if (recording.transcription_id) {
        // Update existing transcription
        transcription = await Transcription.update(recording.transcription_id, {
          transcript_text: transcriptionService.extractTranscript(transcriptionResult),
          speaker_segments: JSON.stringify(transcriptionService.extractSpeakerSegments(transcriptionResult)),
          confidence_score: transcriptionResult.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0.0,
          updated_at: new Date()
        });
      } else {
        // Create new transcription
        transcription = await Transcription.create({
          recordingId: recordingId,
          sessionId: recording.session_id,
          tableId: recording.table_id,
          transcriptText: transcriptionService.extractTranscript(transcriptionResult),
          speakerSegments: transcriptionService.extractSpeakerSegments(transcriptionResult),
          confidenceScore: transcriptionResult.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0.0,
          source: 'reprocess'
        });
      }
      
      // Mark recording as completed
      await Recording.markCompleted(recordingId);
      
      console.log(`🔄 Reprocessing completed for recording ${recordingId}`);
      
      // Emit completion status to connected clients
      connectedClients.forEach(client => {
        client.emit('reprocess-status', {
          recordingId: recordingId,
          status: 'completed',
          message: 'Reprocessing completed successfully!',
          transcriptionId: transcription.id
        });
        
        // Also emit transcription-completed event for real-time display
        client.emit('transcription-completed', {
          transcription: {
            id: transcription.id,
            transcript: transcriptionService.extractTranscript(transcriptionResult),
            confidence: transcriptionResult.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0.0,
            speakers: transcriptionService.extractSpeakerSegments(transcriptionResult),
            source: 'reprocess'
          },
          sessionId: recording.session_id,
          tableId: recording.table_id
        });
      });
      
      res.json({
        success: true,
        recordingId: recordingId,
        transcriptionId: transcription.id,
        message: 'Recording reprocessed successfully'
      });
      
    } catch (transcriptionError) {
      console.error('Transcription reprocessing failed:', transcriptionError);
      await Recording.markFailed(recordingId);
      
      // Emit error status to connected clients
      const connectedClients = getConnectedClientsInSession(recording.session_id);
      connectedClients.forEach(client => {
        client.emit('reprocess-status', {
          recordingId: recordingId,
          status: 'failed',
          message: `Reprocessing failed: ${transcriptionError.message}`,
          error: transcriptionError.message
        });
      });
      
      throw transcriptionError;
    }
    
  } catch (error) {
    console.error('Error reprocessing recording:', error);
    res.status(500).json({ 
      error: 'Failed to reprocess recording',
      details: error.message
    });
  }
});

// Delete recording media file only (keep transcription for reference)
app.delete('/api/recordings/:recordingId/media', async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    // Find the recording
    const recording = await Recording.findById(recordingId);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    // Delete the physical file if it exists
    if (recording.file_path && fs.existsSync(recording.file_path)) {
      fs.unlinkSync(recording.file_path);
      console.log(`🗑️ Deleted media file: ${recording.file_path}`);
    }
    
    // Update recording status to indicate file is deleted but keep record
    await Recording.update(recordingId, {
      status: 'file_deleted',
      file_path: null,
      file_size: null,
      updated_at: new Date()
    });
    
    console.log(`🗑️ Media file deleted for recording ${recordingId}, transcription preserved`);
    
    res.json({
      success: true,
      message: 'Media file deleted successfully, transcription preserved'
    });
    
  } catch (error) {
    console.error('Error deleting media file:', error);
    res.status(500).json({ 
      error: 'Failed to delete media file',
      details: error.message
    });
  }
});

// Delete recording and all associated transcriptions
app.delete('/api/recordings/:recordingId', async (req, res) => {
  try {
    const { recordingId } = req.params;
    
    // Find the recording with transcription info
    const recording = await Recording.findWithTranscription(recordingId);
    if (!recording) {
      return res.status(404).json({ error: 'Recording not found' });
    }
    
    // Delete the physical file if it exists
    if (recording.file_path && fs.existsSync(recording.file_path)) {
      fs.unlinkSync(recording.file_path);
      console.log(`🗑️ Deleted media file: ${recording.file_path}`);
    }
    
    // Delete all transcriptions associated with this recording
    const transcriptions = await db.query('SELECT id FROM transcriptions WHERE recording_id = ?', [recordingId]);
    for (const transcription of transcriptions) {
      await Transcription.delete(transcription.id);
      console.log(`🗑️ Deleted transcription: ${transcription.id}`);
    }
    
    // Delete the recording record
    await Recording.delete(recordingId);
    
    console.log(`🗑️ Completely deleted recording ${recordingId} and associated transcriptions`);
    
    res.json({
      success: true,
      message: 'Recording and transcriptions deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting recording:', error);
    res.status(500).json({ 
      error: 'Failed to delete recording',
      details: error.message
    });
  }
});

// Audio upload and transcription - FIXED for table-specific storage
app.post('/api/sessions/:sessionId/tables/:tableNumber/upload-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const { sessionId, tableNumber } = req.params;
    const { source, skipTranscription } = req.body; // Extract source and skipTranscription flag from request body
    
    // Find the table
    const table = await Table.findBySessionAndNumber(sessionId, parseInt(tableNumber));
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // Find the session to get language setting
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const audioPath = req.file.path;
    const fileStats = fs.statSync(audioPath);
    
    // Create recording record
    const recording = await Recording.create({
      sessionId,
      tableId: table.id,
      filename: req.file.filename,
      filePath: audioPath,
      fileSize: fileStats.size,
      mimeType: req.file.mimetype
    });
    
    // If skipTranscription is true, just save the recording without processing
    if (skipTranscription === 'true' || skipTranscription === true) {
      console.log(`Skipping transcription for table ${tableNumber} (ID: ${table.id}), file: ${audioPath} - live transcription active`);
      
      // Mark recording as completed (no processing needed)
      await Recording.markCompleted(recording.id);
      
      return res.json({
        success: true,
        recording: {
          id: recording.id,
          filename: req.file.filename,
          status: 'completed'
        },
        message: 'Audio file saved without transcription processing'
      });
    }
    
    // Update recording status to processing
    await Recording.markProcessing(recording.id);
    
    // Start transcription
    console.log(`Starting transcription for table ${tableNumber} (ID: ${table.id}), file: ${audioPath}, language: ${session.language || 'en-US'}`);
    
    // Broadcast processing status to session dashboard
    io.to(sessionId).emit('table-recording-update', {
      tableId: table.id,
      status: 'processing',
      timestamp: new Date()
    });
    
    try {
      // Use session language for transcription
      const transcriptionOptions = { language: session.language || 'en-US' };
      const transcriptionResult = await transcriptionService.transcribeFile(audioPath, transcriptionOptions);
      
      // Debug: Log the structure of transcription result
      console.log('Deepgram transcription result structure:', JSON.stringify({
        hasResults: !!transcriptionResult?.results,
        hasChannels: !!transcriptionResult?.results?.channels,
        hasUtterances: !!transcriptionResult?.results?.utterances,
        utteranceCount: transcriptionResult?.results?.utterances?.length || 0,
        sampleUtterance: transcriptionResult?.results?.utterances?.[0],
        extractedSegments: transcriptionService.extractSpeakerSegments(transcriptionResult)
      }, null, 2));
      
      // Extract duration if available
      const duration = transcriptionResult.results?.channels?.[0]?.alternatives?.[0]?.words?.slice(-1)?.[0]?.end || 0;
      if (duration > 0) {
        await Recording.updateDuration(recording.id, duration);
      }
      
      // Create transcription record - TABLE-SPECIFIC
      const transcription = await Transcription.create({
        recordingId: recording.id,
        sessionId,
        tableId: table.id, // This ensures each table has its own transcriptions
        transcriptText: transcriptionService.extractTranscript(transcriptionResult),
        speakerSegments: transcriptionService.extractSpeakerSegments(transcriptionResult),
        confidenceScore: transcriptionResult.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0.0,
        source: source || 'start-recording' // Use provided source or default to start-recording
      });
      
      // Mark recording as completed
      await Recording.markCompleted(recording.id);
      
      // Notify connected clients - TABLE-SPECIFIC UPDATE
      io.to(sessionId).emit('transcription-completed', {
        tableId: table.id,
        tableNumber: parseInt(tableNumber),
        transcription: {
          id: transcription.id,
          transcript: transcription.transcript_text,
          speakers: (() => {
            try {
              const segments = transcription.speaker_segments;
              if (typeof segments === 'string') {
                return JSON.parse(segments);
              } else if (Array.isArray(segments)) {
                return segments;
              }
              return [];
            } catch (e) {
              console.error('Error parsing speaker_segments:', segments, e);
              return [];
            }
          })(),
          wordCount: transcription.word_count,
          confidence: transcription.confidence_score
        },
        source: source || 'start-recording' // Use provided source or default to start-recording
      });
      
      // Broadcast completion status to session dashboard
      io.to(sessionId).emit('table-recording-update', {
        tableId: table.id,
        status: 'completed',
        timestamp: new Date()
      });
      
      res.json({
        success: true,
        recordingId: recording.id,
        transcriptionId: transcription.id,
        transcription: transcription.transcript_text,
        speakers: (() => {
          try {
            const segments = transcription.speaker_segments;
            if (typeof segments === 'string') {
              return JSON.parse(segments).length;
            } else if (Array.isArray(segments)) {
              return segments.length;
            }
            return 0;
          } catch (e) {
            console.error('Error parsing speaker_segments in response:', segments, e);
            return 0;
          }
        })(),
        wordCount: transcription.word_count,
        confidence: transcription.confidence_score
      });
      
    } catch (transcriptionError) {
      console.error('Transcription failed:', transcriptionError);
      await Recording.markFailed(recording.id);
      throw transcriptionError;
    }
    
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({ error: 'Failed to process audio: ' + error.message });
  }
});

// Get transcriptions for a specific table
app.get('/api/sessions/:sessionId/tables/:tableNumber/transcriptions', async (req, res) => {
  try {
    const { sessionId, tableNumber } = req.params;
    
    // Find the table
    const table = await Table.findBySessionAndNumber(sessionId, parseInt(tableNumber));
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // Get table-specific transcriptions
    const transcriptions = await Transcription.findByTableId(table.id);
    
    res.json(transcriptions);
  } catch (error) {
    console.error('Error fetching transcriptions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all transcriptions for a session (across all tables)
app.get('/api/sessions/:sessionId/all-transcriptions', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verify session exists
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get all tables for this session
    const tables = await Table.findBySessionId(sessionId);
    
    // Get all transcriptions for all tables, including table numbers
    const allTranscriptions = [];
    for (const table of tables) {
      const tableTranscriptions = await Transcription.findByTableId(table.id);
      // Add table information to each transcription
      tableTranscriptions.forEach(transcription => {
        transcription.table_number = table.table_number;
        transcription.table_name = table.name;
      });
      allTranscriptions.push(...tableTranscriptions);
    }
    
    // Sort by creation date (newest first)
    allTranscriptions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json(allTranscriptions);
  } catch (error) {
    console.error('Error fetching all transcriptions:', error);
    res.status(500).json({ error: error.message });
  }
});



// Admin settings routes
app.post('/api/admin/settings/api-keys', async (req, res) => {
  try {
    const { deepgram_api_key } = req.body;
    
    // Save to database (only Deepgram key)
    const settings = new Settings(db);
    const success = await settings.setApiKeys(deepgram_api_key, null);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to save API keys to database' });
    }
    
    // Update environment variables
    if (deepgram_api_key) {
      process.env.DEEPGRAM_API_KEY = deepgram_api_key;
    }
    
    res.json({ 
      success: true, 
      message: 'API keys updated and saved to database successfully',
      deepgram_configured: !!process.env.DEEPGRAM_API_KEY
    });
    
  } catch (error) {
    console.error('Error updating API keys:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/settings/change-password', async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Get current password from database
    const settings = new Settings(db);
    const currentDbPassword = await settings.getAdminPassword();
    
    // Check current password
    if (currentPassword !== currentDbPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }
    
    // Validate new password (basic validation)
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }
    
    // Save to database
    const success = await settings.setAdminPassword(newPassword);
    
    if (!success) {
      return res.status(500).json({ error: 'Failed to save password to database' });
    }
    
    // Update environment variable
    process.env.ADMIN_PASSWORD = newPassword;
    
    res.json({ 
      success: true, 
      message: 'Admin password changed and saved to database successfully' 
    });
    
  } catch (error) {
    console.error('Error changing admin password:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/settings/platform-protection', async (req, res) => {
  try {
    const settings = new Settings(db);
    const enabled = await settings.getPlatformPasswordEnabled();
    const password = await settings.getPlatformPassword();
    
    res.json({ 
      enabled: enabled,
      password: password 
    });
  } catch (error) {
    console.error('Error getting platform protection settings:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/settings/platform-protection', async (req, res) => {
  try {
    const { enabled, password } = req.body;
    
    if (enabled && (!password || password.trim().length < 6)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }
    
    const settings = new Settings(db);
    const enabledSuccess = await settings.setPlatformPasswordEnabled(enabled);
    const passwordSuccess = await settings.setPlatformPassword(password.trim());
    
    if (!enabledSuccess || !passwordSuccess) {
      return res.status(500).json({ error: 'Failed to save platform protection settings' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving platform protection settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// Platform password verification endpoint
app.post('/api/platform/verify-password', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    const settings = new Settings(db);
    const correctPassword = await settings.getPlatformPassword();
    
    if (password === correctPassword) {
      req.session.platformPasswordVerified = true;
      res.json({ success: true, message: 'Password verified' });
    } else {
      res.status(401).json({ error: 'Invalid password' });
    }
  } catch (error) {
    console.error('Error verifying platform password:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/admin/settings/test-apis', async (req, res) => {
  try {
    const results = {
      deepgram: { configured: false, working: false, error: null },
      groq: { configured: false, working: false, error: null }
    };
    
    // Test Deepgram API
    if (process.env.DEEPGRAM_API_KEY) {
      results.deepgram.configured = true;
      try {
        // Simple test - just check if the API key format is valid
        // In a real implementation, you'd make a small test request
        if (process.env.DEEPGRAM_API_KEY.length > 20) {
          results.deepgram.working = true;
        } else {
          results.deepgram.error = 'API key appears to be invalid format';
        }
      } catch (error) {
        results.deepgram.error = error.message;
      }
    } else {
      results.deepgram.error = 'API key not configured';
    }
    
    // Groq API removed (AI analysis disabled)
    results.groq.configured = false;
    results.groq.error = 'AI analysis features disabled';
    
    res.json(results);
    
  } catch (error) {
    console.error('Error testing APIs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin login endpoint
app.post('/api/admin/login', async (req, res) => {
  try {
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }
    
    // Get current admin password from database
    const settings = new Settings(db);
    const currentAdminPassword = await settings.getAdminPassword();
    
    if (password === currentAdminPassword) {
      res.json({ success: true, message: 'Admin authentication successful' });
    } else {
      res.status(401).json({ error: 'Invalid admin password' });
    }
    
  } catch (error) {
    console.error('Error during admin login:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/admin/settings/status', async (req, res) => {
  try {
    const status = {
      database: {
        connected: await db.isHealthy(),
        status: await db.isHealthy() ? 'Connected' : 'Disconnected'
      },
      apis: {
        deepgram: {
          configured: !!process.env.DEEPGRAM_API_KEY,
          status: process.env.DEEPGRAM_API_KEY ? 'Configured' : 'Not Configured'
        },
        groq: {
          configured: !!process.env.GROQ_API_KEY,
          status: process.env.GROQ_API_KEY ? 'Configured' : 'Not Configured'
        }
      },
      llm_service: {
        available: false,
        status: 'Disabled (AI analysis removed)'
      },
      transcription_service: {
        available: !!transcriptionService,
        status: transcriptionService ? 'Available' : 'Unavailable'
      },
      server: {
        uptime: Math.floor(process.uptime()),
        memory_usage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        node_version: process.version
      }
    };
    
    res.json(status);
    
  } catch (error) {
    console.error('Error getting system status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Admin routes - Analysis prompts removed (AI analysis disabled)

// Database status endpoint
app.get('/api/admin/database/status', async (req, res) => {
  try {
    const DatabaseInitializer = require('./database/init');
    const initializer = new DatabaseInitializer();
    const status = await initializer.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Session Chat API endpoints
app.post('/api/sessions/:sessionId/chat', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Check if chat service is available
    if (!sessionChatService) {
      return res.status(503).json({ 
        error: 'Chat service not available',
        message: 'The chat feature requires an AI service. Please check if the GROQ_API_KEY is configured.'
      });
    }
    
    // Verify session exists
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get all session data for context
    const [transcriptions, tables] = await Promise.all([
      Transcription.findBySessionId(sessionId),
      Table.findBySessionId(sessionId)
    ]);
    
    if (transcriptions.length === 0) {
      return res.json({
        success: true,
        response: "This session doesn't have any transcriptions yet. Once participants start recording conversations, I'll be able to help you explore and analyze the discussions!",
        usage: null
      });
    }
    
    const sessionData = {
      session: session,
      transcriptions,
      tables
    };
    
    // Process the chat request
    const result = await sessionChatService.chatWithSession(sessionId, message, sessionData);
    
    if (result.error) {
      return res.status(400).json({
        error: result.message,
        suggestion: result.suggestion,
        details: result.details
      });
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('Error in session chat:', error);
    res.status(500).json({ 
      error: 'Failed to process chat message',
      details: error.message 
    });
  }
});

// Get chat availability status
app.get('/api/sessions/:sessionId/chat/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    // Verify session exists
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get transcription count
    const transcriptions = await Transcription.findBySessionId(sessionId);
    
    res.json({
      available: !!sessionChatService,
      hasTranscriptions: transcriptions.length > 0,
      transcriptionCount: transcriptions.length,
      sessionTitle: session.title
    });
  } catch (error) {
    console.error('Error checking chat status:', error);
    res.status(500).json({ error: 'Failed to check chat status' });
  }
});

// Serve frontend (only for non-API routes)
app.get('*', (req, res) => {
  // Don't serve HTML for API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Initialize and start server
async function startServer() {
  console.log('Starting World Café Platform...');
  
  // Initialize database
  const dbConnected = await initializeDatabase();
  if (!dbConnected) {
    console.warn('Database connection failed, some features may not work properly');
  }
  
  const PORT = process.env.PORT || 3002;
  const HOST = process.env.HOST || '0.0.0.0';
  
  server.listen(PORT, HOST, () => {
    console.log(`World Café Platform running on http://${HOST}:${PORT}`);
    console.log(`LAN Access: http://192.168.1.140:${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database: ${dbConnected ? 'Connected' : 'Disconnected'}`);
    console.log(`AI Analysis: Disabled`);
  });
}

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await db.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await db.close();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

startServer().catch(console.error);