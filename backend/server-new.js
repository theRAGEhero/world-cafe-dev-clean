const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// Database
const db = require('./database/connection');
const { Session, Table, Participant, Recording, Transcription, QRCode } = require('./database/models');

// Services
const TranscriptionService = require('./transcription');
const AnalysisService = require('./analysis');
const LLMAnalysisService = require('./llmAnalysis');

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
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/qr-codes', express.static(path.join(__dirname, 'qr-codes')));

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
    const allowedTypes = /wav|mp3|mp4|m4a|webm|ogg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only audio files are allowed'));
    }
  },
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// Initialize services
const transcriptionService = new TranscriptionService();
const analysisService = new AnalysisService();
let llmAnalysisService = null;

// Initialize LLM service if API key is available
try {
  llmAnalysisService = new LLMAnalysisService();
  console.log('LLM Analysis Service initialized with Groq');
} catch (error) {
  console.log('LLM Analysis Service not available:', error.message);
  console.log('Falling back to basic analysis service');
}

// Initialize database connection
async function initializeDatabase() {
  try {
    const success = await db.connect();
    if (success) {
      console.log('Database connected successfully');
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('join-session', (sessionId) => {
    socket.join(sessionId);
    console.log(`Client ${socket.id} joined session ${sessionId}`);
  });
  
  socket.on('table-status-update', (data) => {
    socket.to(data.sessionId).emit('table-status-changed', data);
  });
  
  socket.on('recording-started', (data) => {
    socket.to(data.sessionId).emit('recording-status', { 
      tableId: data.tableId, 
      status: 'recording',
      timestamp: new Date()
    });
  });
  
  socket.on('recording-stopped', (data) => {
    socket.to(data.sessionId).emit('recording-status', { 
      tableId: data.tableId, 
      status: 'stopped',
      timestamp: new Date()
    });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Routes

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
    const { title, description, tableCount = 20, maxParticipants = 100 } = req.body;
    
    // Create session
    const session = await Session.create({
      title,
      description, 
      tableCount,
      maxParticipants
    });
    
    // Create tables for the session
    await Table.createTablesForSession(session.id, tableCount);
    
    // Generate QR codes
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3002}`;
    await QRCode.generateSessionQRs(session.id, tableCount, baseUrl);
    
    // Get session with stats
    const sessionWithStats = await Session.findWithStats(session.id);
    
    res.json(sessionWithStats);
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await Session.findActive();
    res.json(sessions);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:id', async (req, res) => {
  try {
    const session = await Session.findWithStats(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get tables with participants
    const tables = await Table.findSessionTablesWithStats(session.id);
    session.tables = tables;
    
    res.json(session);
  } catch (error) {
    console.error('Error fetching session:', error);
    res.status(500).json({ error: error.message });
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

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const success = await Session.delete(req.params.id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Table management
app.post('/api/sessions/:sessionId/tables/:tableNumber/join', async (req, res) => {
  try {
    const { sessionId, tableNumber } = req.params;
    const { participantName, email, phone } = req.body;
    
    // Find the table
    const table = await Table.findBySessionAndNumber(sessionId, parseInt(tableNumber));
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
    }
    
    // Join the table
    const participant = await Participant.joinTable(
      sessionId, 
      table.id, 
      participantName, 
      email, 
      phone
    );
    
    // Update table status if this is the first participant
    const participantCount = await Participant.getTableParticipantCount(table.id);
    if (participantCount === 1) {
      await Table.updateStatus(table.id, 'waiting');
    }
    
    // Get updated table info
    const updatedTable = await Table.findWithParticipants(table.id);
    
    io.to(sessionId).emit('table-updated', { tableId: table.id, table: updatedTable });
    res.json({ participant, table: updatedTable });
    
  } catch (error) {
    console.error('Error joining table:', error);
    res.status(400).json({ error: error.message });
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

app.get('/join/:sessionId', async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).send('Session not found');
    }
    // Redirect to main app with session pre-selected
    res.redirect(`/?session=${session.id}`);
  } catch (error) {
    console.error('Error handling QR join:', error);
    res.status(500).send('Error joining session');
  }
});

app.get('/join/:sessionId/table/:tableId', async (req, res) => {
  try {
    const { sessionId, tableId } = req.params;
    const session = await Session.findById(sessionId);
    const table = await Table.findById(parseInt(tableId));
    
    if (!session || !table) {
      return res.status(404).send('Session or table not found');
    }
    
    // Redirect to main app with session and table pre-selected
    res.redirect(`/?session=${sessionId}&table=${tableId}`);
  } catch (error) {
    console.error('Error handling table QR join:', error);
    res.status(500).send('Error joining table');
  }
});

// Audio upload and transcription - FIXED for table-specific storage
app.post('/api/sessions/:sessionId/tables/:tableNumber/upload-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const { sessionId, tableNumber } = req.params;
    
    // Find the table
    const table = await Table.findBySessionAndNumber(sessionId, parseInt(tableNumber));
    if (!table) {
      return res.status(404).json({ error: 'Table not found' });
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
    
    // Update recording status to processing
    await Recording.markProcessing(recording.id);
    
    // Start transcription
    console.log(`Starting transcription for table ${tableNumber} (ID: ${table.id}), file: ${audioPath}`);
    
    try {
      const transcriptionResult = await transcriptionService.transcribeFile(audioPath);
      
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
        confidenceScore: transcriptionResult.results?.channels?.[0]?.alternatives?.[0]?.confidence || 0.0
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
          speakers: JSON.parse(transcription.speaker_segments || '[]').length,
          wordCount: transcription.word_count,
          confidence: transcription.confidence_score
        }
      });
      
      res.json({
        success: true,
        recordingId: recording.id,
        transcriptionId: transcription.id,
        transcription: transcription.transcript_text,
        speakers: JSON.parse(transcription.speaker_segments || '[]').length,
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

// Analysis endpoints - Updated to work with database
app.get('/api/sessions/:sessionId/analysis', async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get all transcriptions for the session
    const transcriptions = await Transcription.findBySessionId(req.params.sessionId);
    
    if (transcriptions.length === 0) {
      return res.json({ 
        message: 'No transcriptions available for analysis',
        conflicts: [],
        agreements: [],
        themes: [],
        llmPowered: false
      });
    }
    
    // Transform transcriptions to expected format
    const transformedTranscriptions = transcriptions.map(tr => ({
      id: tr.id,
      tableId: tr.table_id,
      transcript: tr.transcript_text,
      speakers: JSON.parse(tr.speaker_segments || '[]'),
      timestamp: tr.created_at
    }));
    
    // Create a session object with transcriptions for analysis
    const sessionForAnalysis = {
      ...session,
      transcriptions: transformedTranscriptions
    };
    
    // Use LLM analysis service if available, otherwise fall back to basic analysis
    const activeAnalysisService = llmAnalysisService || analysisService;
    const analysis = await activeAnalysisService.analyzeSession(sessionForAnalysis);
    
    res.json(analysis);
    
  } catch (error) {
    console.error('Error generating analysis:', error);
    res.status(500).json({ error: 'Failed to generate analysis: ' + error.message });
  }
});

// Generate final report
app.post('/api/sessions/:sessionId/report', async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Get all transcriptions for the session
    const transcriptions = await Transcription.findBySessionId(req.params.sessionId);
    
    // Transform transcriptions to expected format
    const transformedTranscriptions = transcriptions.map(tr => ({
      id: tr.id,
      tableId: tr.table_id,
      transcript: tr.transcript_text,
      speakers: JSON.parse(tr.speaker_segments || '[]'),
      timestamp: tr.created_at
    }));
    
    // Create session object with transcriptions and tables
    const tables = await Table.findBySessionId(session.id);
    const sessionForReport = {
      ...session,
      transcriptions: transformedTranscriptions,
      tables: tables
    };
    
    // Use LLM analysis service if available, otherwise fall back to basic analysis
    const activeAnalysisService = llmAnalysisService || analysisService;
    const report = await activeAnalysisService.generateFinalReport(sessionForReport);
    
    // Save report to database could be implemented here
    
    res.json(report);
    
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ error: 'Failed to generate report: ' + error.message });
  }
});

// Admin routes
app.get('/api/admin/prompts', (req, res) => {
  const activeAnalysisService = llmAnalysisService || analysisService;
  const prompts = activeAnalysisService.getPrompts();
  res.json(prompts);
});

app.put('/api/admin/prompts', (req, res) => {
  try {
    const { password, prompts } = req.body;
    
    if (password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const activeAnalysisService = llmAnalysisService || analysisService;
    activeAnalysisService.updatePrompts(prompts);
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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

// Serve frontend
app.get('*', (req, res) => {
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
  server.listen(PORT, () => {
    console.log(`World Café Platform running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database: ${dbConnected ? 'Connected' : 'Disconnected'}`);
    console.log(`LLM Analysis: ${llmAnalysisService ? 'Enabled' : 'Disabled'}`);
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