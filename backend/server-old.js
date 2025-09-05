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

const SessionManager = require('./sessionManager');
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
const sessionManager = new SessionManager();
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

// Store active sessions
const activeSessions = new Map();

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
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Session management
app.post('/api/sessions', (req, res) => {
  try {
    const { title, description, tableCount = 20, maxParticipants = 100 } = req.body;
    const session = sessionManager.createSession({
      title,
      description, 
      tableCount,
      maxParticipants
    });
    
    activeSessions.set(session.id, session);
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions', (req, res) => {
  const sessions = Array.from(activeSessions.values());
  res.json(sessions);
});

app.get('/api/sessions/:id', (req, res) => {
  const session = activeSessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  res.json(session);
});

app.put('/api/sessions/:id', (req, res) => {
  const session = activeSessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const updates = req.body;
  Object.assign(session, updates, { updatedAt: new Date().toISOString() });
  res.json(session);
});

app.delete('/api/sessions/:id', (req, res) => {
  if (activeSessions.delete(req.params.id)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Table management
app.post('/api/sessions/:sessionId/tables/:tableId/join', (req, res) => {
  const { sessionId, tableId } = req.params;
  const { participantName } = req.body;
  
  const session = activeSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  try {
    const table = sessionManager.joinTable(session, parseInt(tableId), participantName);
    io.to(sessionId).emit('table-updated', { tableId, table });
    res.json(table);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Audio upload and transcription
app.post('/api/sessions/:sessionId/tables/:tableId/upload-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }
    
    const { sessionId, tableId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    const audioPath = req.file.path;
    const recordingId = uuidv4();
    
    // Start transcription
    console.log(`Starting transcription for table ${tableId}, file: ${audioPath}`);
    const transcriptionResult = await transcriptionService.transcribeFile(audioPath);
    
    const transcription = {
      id: recordingId,
      sessionId,
      tableId: parseInt(tableId),
      audioPath,
      transcript: transcriptionService.extractTranscript(transcriptionResult),
      speakers: transcriptionService.extractSpeakerSegments(transcriptionResult),
      timestamp: new Date().toISOString(),
      duration: transcriptionResult.results?.channels?.[0]?.alternatives?.[0]?.words?.slice(-1)?.[0]?.end || 0
    };
    
    // Save transcription
    const transcriptionPath = path.join(__dirname, '../transcriptions', `${recordingId}.json`);
    const transcriptionsDir = path.dirname(transcriptionPath);
    if (!fs.existsSync(transcriptionsDir)) {
      fs.mkdirSync(transcriptionsDir, { recursive: true });
    }
    fs.writeFileSync(transcriptionPath, JSON.stringify(transcription, null, 2));
    
    // Update session with transcription
    if (!session.transcriptions) session.transcriptions = [];
    session.transcriptions.push(transcription);
    
    // Notify connected clients
    io.to(sessionId).emit('transcription-completed', {
      tableId: parseInt(tableId),
      transcription
    });
    
    res.json({
      success: true,
      recordingId,
      transcription: transcription.transcript,
      speakers: transcription.speakers.length
    });
    
  } catch (error) {
    console.error('Error processing audio:', error);
    res.status(500).json({ error: 'Failed to process audio: ' + error.message });
  }
});

// Analysis endpoints
app.get('/api/sessions/:sessionId/analysis', async (req, res) => {
  try {
    const session = activeSessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!session.transcriptions || session.transcriptions.length === 0) {
      return res.json({ 
        message: 'No transcriptions available for analysis',
        conflicts: [],
        agreements: [],
        themes: [],
        llmPowered: false
      });
    }
    
    // Use LLM analysis service if available, otherwise fall back to basic analysis
    const activeAnalysisService = llmAnalysisService || analysisService;
    const analysis = await activeAnalysisService.analyzeSession(session);
    res.json(analysis);
    
  } catch (error) {
    console.error('Error generating analysis:', error);
    res.status(500).json({ error: 'Failed to generate analysis: ' + error.message });
  }
});

// Generate final report
app.post('/api/sessions/:sessionId/report', async (req, res) => {
  try {
    const session = activeSessions.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    // Use LLM analysis service if available, otherwise fall back to basic analysis
    const activeAnalysisService = llmAnalysisService || analysisService;
    const report = await activeAnalysisService.generateFinalReport(session);
    
    // Save report
    const reportPath = path.join(__dirname, '../reports', `${session.id}-report.json`);
    const reportsDir = path.dirname(reportPath);
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
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
    
    if (password !== 'admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const activeAnalysisService = llmAnalysisService || analysisService;
    activeAnalysisService.updatePrompts(prompts);
    res.json({ success: true });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`World Café Platform running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});