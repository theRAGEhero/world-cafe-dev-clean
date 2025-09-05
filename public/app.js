// Mobile-First World Café Platform JavaScript

// Global variables
let socket;
let currentSession = null;
let currentTable = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let activeSessions = [];
let isMobile = false;
let isTouch = false;
let mobileMenuOpen = false;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    detectMobileAndTouch();
    initializeMobileOptimizations();
    initializeSocket();
    setupEventListeners();
    loadActiveSessions();
    handleURLParams();
    setupMobileNavigation();
});

// Mobile and touch detection
function detectMobileAndTouch() {
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
    
    if (isMobile) {
        document.body.classList.add('mobile');
    }
    if (isTouch) {
        document.body.classList.add('touch');
    }
    
    // Set CSS custom property for viewport height (mobile address bar fix)
    function setVH() {
        let vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
    }
    setVH();
    window.addEventListener('resize', setVH);
}

// Mobile optimizations
function initializeMobileOptimizations() {
    if (isMobile || isTouch) {
        addTouchFeedback();
        optimizeScrolling();
        handleMobileKeyboard();
        preventZoom();
        setupSwipeGestures();
    }
}

// Add touch feedback to all interactive elements
function addTouchFeedback() {
    const interactiveElements = document.querySelectorAll('.btn, .card, .table-card, .session-item, .admin-session-item');
    
    interactiveElements.forEach(element => {
        element.addEventListener('touchstart', function() {
            this.style.transform = 'translateY(1px)';
            this.style.filter = 'brightness(0.95)';
            
            // Haptic feedback if supported
            if (navigator.vibrate) {
                navigator.vibrate(10);
            }
        }, { passive: true });
        
        element.addEventListener('touchend', function() {
            this.style.transform = '';
            this.style.filter = '';
        }, { passive: true });
    });
}

// Optimize scrolling for mobile
function optimizeScrolling() {
    // Enable momentum scrolling
    document.body.style.webkitOverflowScrolling = 'touch';
    
    // Prevent rubber band scrolling on document level
    document.addEventListener('touchmove', function(e) {
        if (document.body.scrollTop === 0 || 
            document.body.scrollTop === document.body.scrollHeight - document.body.clientHeight) {
            e.preventDefault();
        }
    }, { passive: false });
}

// Handle mobile keyboard
function handleMobileKeyboard() {
    const inputs = document.querySelectorAll('input, textarea');
    
    inputs.forEach(input => {
        input.addEventListener('focus', function() {
            // Scroll to input when keyboard appears
            setTimeout(() => {
                this.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
        });
        
        input.addEventListener('blur', function() {
            // Restore viewport
            window.scrollTo(0, 0);
        });
    });
}

// Prevent zoom on double tap
function preventZoom() {
    let lastTouchEnd = 0;
    document.addEventListener('touchend', function(event) {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            event.preventDefault();
        }
        lastTouchEnd = now;
    }, false);
}

// Setup swipe gestures
function setupSwipeGestures() {
    let startX = 0;
    let startY = 0;
    let startTime = 0;
    
    document.addEventListener('touchstart', function(e) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        startTime = Date.now();
    }, { passive: true });
    
    document.addEventListener('touchend', function(e) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const endTime = Date.now();
        
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        const deltaTime = endTime - startTime;
        
        // Detect swipe (minimum distance and speed)
        if (Math.abs(deltaX) > 50 && deltaTime < 300 && Math.abs(deltaY) < 100) {
            if (deltaX > 0) {
                // Swipe right - go back
                handleSwipeBack();
            }
        }
    }, { passive: true });
}

// Handle swipe back gesture
function handleSwipeBack() {
    const currentScreen = document.querySelector('.screen.active');
    if (currentScreen && currentScreen.id !== 'welcomeScreen') {
        showWelcome();
    }
}

// Setup mobile navigation
function setupMobileNavigation() {
    // Close menu when clicking outside
    document.addEventListener('click', function(e) {
        const navMenu = document.querySelector('.nav-menu');
        const menuToggle = document.getElementById('mobileMenuToggle');
        
        if (mobileMenuOpen && navMenu && menuToggle) {
            // Check if click is outside the menu and toggle button
            if (!navMenu.contains(e.target) && !menuToggle.contains(e.target)) {
                mobileMenuOpen = false;
                navMenu.classList.remove('menu-open');
                menuToggle.textContent = '☰';
            }
        }
    });
}

// Consolidate consecutive speaker segments
function consolidateSpeakerSegments(speakers) {
    if (!speakers || speakers.length === 0) return [];
    
    const consolidated = [];
    let currentSpeaker = null;
    let currentText = '';
    let startTime = null;
    let endTime = null;
    
    speakers.forEach((segment, index) => {
        const speakerNum = segment.speaker !== undefined ? segment.speaker : 0;
        // Ensure we extract text properly, not objects
        let segmentText = '';
        if (typeof segment.transcript === 'string') {
            segmentText = segment.transcript;
        } else if (typeof segment.text === 'string') {
            segmentText = segment.text;
        } else if (typeof segment.consolidatedText === 'string') {
            segmentText = segment.consolidatedText;
        }
        
        if (currentSpeaker === null || currentSpeaker !== speakerNum) {
            // Save previous speaker's consolidated text
            if (currentSpeaker !== null && currentText.trim()) {
                consolidated.push({
                    speaker: currentSpeaker,
                    consolidatedText: currentText.trim(),
                    startTime: startTime,
                    endTime: endTime
                });
            }
            
            // Start new speaker segment
            currentSpeaker = speakerNum;
            currentText = segmentText;
            startTime = segment.start;
            endTime = segment.end;
        } else {
            // Same speaker, consolidate text
            currentText += ' ' + segmentText;
            endTime = segment.end; // Update end time to latest segment
        }
    });
    
    // Don't forget the last speaker
    if (currentSpeaker !== null && currentText.trim()) {
        consolidated.push({
            speaker: currentSpeaker,
            consolidatedText: currentText.trim(),
            startTime: startTime,
            endTime: endTime
        });
    }
    
    return consolidated;
}

// Connection status indicator
function updateConnectionStatus(status) {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.className = `status-circle ${status}`;
        
        const statusTexts = {
            connected: 'Connected to server',
            disconnected: 'Disconnected from server',
            connecting: 'Connecting to server...'
        };
        
        statusElement.title = statusTexts[status] || 'Unknown status';
    }
}

// Load existing transcriptions with diarization
async function loadExistingTranscriptions() {
    if (!currentSession || !currentTable) return;
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/tables/${currentTable.table_number}/transcriptions`);
        if (response.ok) {
            const transcriptions = await response.json();
            displayExistingTranscriptions(transcriptions);
        }
    } catch (error) {
        console.error('Error loading existing transcriptions:', error);
    }
}

// Display existing transcriptions with speaker diarization
function displayExistingTranscriptions(transcriptions) {
    const transcriptDisplay = document.getElementById('liveTranscript');
    transcriptDisplay.innerHTML = ''; // Clear existing content
    
    transcriptions.forEach((transcription, index) => {
        const transcriptItem = document.createElement('div');
        transcriptItem.className = 'transcript-item';
        
        // Parse speaker segments
        let speakers = [];
        try {
            // Check for speaker_segments first (from API)
            if (transcription.speaker_segments) {
                if (typeof transcription.speaker_segments === 'string') {
                    speakers = JSON.parse(transcription.speaker_segments);
                } else if (Array.isArray(transcription.speaker_segments)) {
                    speakers = transcription.speaker_segments;
                }
            }
            // Fallback to speakers field (legacy)
            else if (transcription.speakers) {
                if (typeof transcription.speakers === 'string') {
                    speakers = JSON.parse(transcription.speakers);
                } else if (Array.isArray(transcription.speakers)) {
                    speakers = transcription.speakers;
                }
            }
        } catch (e) {
            console.error('Error parsing speaker segments:', e);
            speakers = [];
        }
        
        const createdAt = new Date(transcription.created_at).toLocaleString();
        const confidence = transcription.confidence ? `${(transcription.confidence * 100).toFixed(1)}% confidence` : '';
        
        let transcriptContent = '';
        
        if (speakers && speakers.length > 0) {
            // Consolidate consecutive speaker segments
            const consolidatedSpeakers = consolidateSpeakerSegments(speakers);
            
            // Check if there's actually multiple speakers
            const uniqueSpeakers = new Set(consolidatedSpeakers.map(s => s.speaker));
            const hasMultipleSpeakers = uniqueSpeakers.size > 1;
            
            // Display with speaker diarization only if multiple speakers detected
            if (hasMultipleSpeakers) {
                transcriptContent = consolidatedSpeakers.map(segment => {
                    const speakerNum = (segment.speaker !== undefined ? segment.speaker : 0) + 1;
                    const speakerClass = `speaker-${speakerNum % 5}`;
                    const startTime = segment.startTime ? `${Math.floor(segment.startTime)}s` : '';
                    const endTime = segment.endTime ? `${Math.floor(segment.endTime)}s` : '';
                    const timeRange = startTime && endTime ? `${startTime}-${endTime}` : '';
                    
                    return `
                    <div class="speaker-segment ${speakerClass}">
                        <div class="speaker-label">
                            <strong>Speaker ${speakerNum}</strong>
                            ${timeRange ? `<span class="speaker-timestamp">${timeRange}</span>` : ''}
                        </div>
                        <div class="speaker-text">${segment.consolidatedText}</div>
                    </div>
                `;
                }).join('');
            } else {
                // Single speaker - show without speaker labels
                const allText = consolidatedSpeakers.map(s => s.consolidatedText).join(' ');
                transcriptContent = `<div class="transcript-text">${allText}</div>`;
            }
        } else {
            // Display without diarization - ensure we get text, not object
            const transcriptText = (typeof transcription.transcript === 'string' ? transcription.transcript : null) ||
                                 (typeof transcription.transcript_text === 'string' ? transcription.transcript_text : null) ||
                                 'No transcript available';
            
            // Debug logging for [object Object] issues
            if (transcriptText === 'No transcript available') {
                console.warn('No valid transcript text found:', {
                    transcript: transcription.transcript,
                    transcript_text: transcription.transcript_text,
                    transcriptType: typeof transcription.transcript,
                    transcriptTextType: typeof transcription.transcript_text,
                    keys: Object.keys(transcription)
                });
            }
                                 
            transcriptContent = `<div class="transcript-text">${transcriptText}</div>`;
        }
        
        transcriptItem.innerHTML = `
            <div class="transcript-meta">
                <span><strong>Recording ${transcriptions.length - index}</strong></span>
                <span>${createdAt}</span>
                <span>${confidence}</span>
            </div>
            ${transcriptContent}
        `;
        
        transcriptDisplay.appendChild(transcriptItem);
    });
    
    if (transcriptions.length === 0) {
        transcriptDisplay.innerHTML = '<p style="color: #666; font-style: italic; text-align: center; padding: 2rem;">No transcriptions available yet. Start recording to create your first transcription.</p>';
    }
}

// Handle URL parameters for QR code navigation
function handleURLParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    const tableId = urlParams.get('table');
    const isMobileJoin = urlParams.get('mobile');

    if (sessionId) {
        // Auto-load session from QR code
        setTimeout(() => {
            if (tableId) {
                joinSpecificTable(sessionId, tableId);
            } else {
                loadSpecificSession(sessionId);
            }
        }, 1000);
    }
}

// Socket.IO initialization
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus('connected');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus('disconnected');
    });
    
    socket.on('connecting', () => {
        console.log('Connecting to server...');
        updateConnectionStatus('connecting');
    });
    
    socket.on('table-updated', (data) => {
        updateTableDisplay(data.tableId, data.table);
    });
    
    socket.on('recording-status', (data) => {
        updateRecordingStatus(data);
    });
    
    socket.on('transcription-completed', (data) => {
        displayTranscription(data);
        updateTableTranscriptionCount(data.tableId);
    });
}

// Enhanced Event listeners
function setupEventListeners() {
    // Navigation
    document.getElementById('homeBtn').onclick = function() { closeMobileMenu(); showWelcome(); };
    document.getElementById('createSessionBtn').onclick = function() { closeMobileMenu(); showCreateSession(); };
    document.getElementById('adminBtn').onclick = function() { closeMobileMenu(); showAdminDashboard(); };
    document.getElementById('mobileMenuToggle').onclick = toggleMobileMenu;
    document.getElementById('qrScanBtn').onclick = function() { closeMobileMenu(); showQRScanner(); };
    
    // Forms
    document.getElementById('createSessionForm').onsubmit = createSession;
    document.getElementById('sessionSelect').onchange = loadSessionTables;
    document.getElementById('joinTableBtn').onclick = joinTable;
    document.getElementById('joinThisTableBtn').onclick = joinCurrentTable;
    
    // Recording controls
    document.getElementById('startRecordingBtn').onclick = startRecording;
    document.getElementById('stopRecordingBtn').onclick = stopRecording;
    document.getElementById('uploadMediaBtn').onclick = openMediaUpload;
    document.getElementById('mediaFileInput').onchange = handleMediaFileUpload;
    document.getElementById('generateReportBtn').onclick = generateAnalysis;
    
    // QR Code functionality
    document.getElementById('showQRCodesBtn').onclick = showQRCodes;
    document.getElementById('hideQRCodesBtn').onclick = hideQRCodes;
    document.getElementById('downloadAllQRBtn').onclick = downloadAllQRCodes;
    document.getElementById('printQRBtn').onclick = printQRCodes;
    
    // Mobile QR Scanner
    document.getElementById('closeScannerBtn').onclick = closeQRScanner;
    document.getElementById('manualJoinBtn').onclick = showManualJoin;
    document.getElementById('closeManualJoinBtn').onclick = closeManualJoin;
    document.getElementById('submitManualJoinBtn').onclick = submitManualJoin;
    
    // Handle manual code input
    document.getElementById('manualCode').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            submitManualJoin();
        }
    });
}

// Navigation history for back button
let navigationHistory = ['welcomeScreen'];

function goBack() {
    if (navigationHistory.length > 1) {
        navigationHistory.pop(); // Remove current screen
        const previousScreen = navigationHistory[navigationHistory.length - 1];
        showScreen(previousScreen);
    } else {
        showWelcome();
    }
}

function updateNavigationHistory(screenId) {
    // Don't add duplicate consecutive entries
    if (navigationHistory[navigationHistory.length - 1] !== screenId) {
        navigationHistory.push(screenId);
    }
    
    // Show/hide back button based on history
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
        if (screenId === 'welcomeScreen' || navigationHistory.length <= 1) {
            backBtn.style.display = 'none';
        } else {
            backBtn.style.display = 'flex';
        }
    }
}

// Navigation functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    
    // Update navigation history
    updateNavigationHistory(screenId);
    
    // Close mobile menu if open
    if (mobileMenuOpen) {
        const navMenu = document.querySelector('.nav-menu');
        const menuToggle = document.getElementById('mobileMenuToggle');
        if (navMenu && menuToggle) {
            mobileMenuOpen = false;
            navMenu.classList.remove('menu-open');
            menuToggle.textContent = '☰';
        }
    }
    
    // Update page title
    const titles = {
        'welcomeScreen': 'World Café Platform',
        'createSessionScreen': 'Create New Session',
        'joinSessionScreen': 'Join Session',
        'sessionDashboard': 'Session Dashboard',
        'tableInterface': 'Table Interface',
        'sessionListScreen': 'Active Sessions',
        'adminDashboard': 'Admin Dashboard',
        'analysisReport': 'Analysis Report'
    };
    
    document.title = titles[screenId] || 'World Café Platform';
}

function showWelcome() {
    navigationHistory = ['welcomeScreen']; // Reset history
    showScreen('welcomeScreen');
}

function showCreateSession() {
    showScreen('createSessionScreen');
}

function showJoinSession() {
    loadActiveSessions();
    showScreen('joinSessionScreen');
}

function showSessionList() {
    loadActiveSessions();
    showScreen('sessionListScreen');
}

function showSessionDashboard() {
    if (currentSession) {
        loadSessionDashboard(currentSession.id);
        showScreen('sessionDashboard');
    }
}

function showTableInterface(tableId) {
    if (currentSession && currentSession.tables) {
        currentTable = currentSession.tables.find(t => t.id === tableId || t.table_number === tableId);
        if (currentTable) {
            setupTableInterface();
            showScreen('tableInterface');
        }
    }
}

function showAdminDashboard() {
    loadAdminPrompts();
    showScreen('adminDashboard');
}

// Mobile Navigation Functions  
function toggleMobileMenu() {
    const navMenu = document.querySelector('.nav-menu');
    const menuToggle = document.getElementById('mobileMenuToggle');
    
    mobileMenuOpen = !mobileMenuOpen;
    
    if (navMenu) {
        navMenu.classList.toggle('menu-open', mobileMenuOpen);
    }
    
    if (menuToggle) {
        menuToggle.textContent = mobileMenuOpen ? '✕' : '☰';
    }
}

function closeMobileMenu() {
    const navMenu = document.querySelector('.nav-menu');
    const menuToggle = document.getElementById('mobileMenuToggle');
    
    if (mobileMenuOpen && navMenu && menuToggle) {
        mobileMenuOpen = false;
        navMenu.classList.remove('menu-open');
        menuToggle.textContent = '☰';
    }
}

// Mobile QR Scanner
function showQRScanner() {
    const scanner = document.getElementById('mobileScanner');
    if (scanner) {
        scanner.style.display = 'flex';
        initializeQRScanner();
    }
}

function hideQRScanner() {
    const scanner = document.getElementById('mobileScanner');
    if (scanner) {
        scanner.style.display = 'none';
        stopQRScanner();
    }
}

function initializeQRScanner() {
    // QR scanner implementation would go here
    // For now, just show the manual input option
    console.log('QR Scanner not yet implemented. Use manual entry.');
}

function stopQRScanner() {
    // Stop camera and cleanup
}

function closeQRScanner() {
    hideQRScanner();
}

function showManualJoin() {
    hideQRScanner();
    const modal = document.getElementById('manualJoinModal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function closeManualJoin() {
    const modal = document.getElementById('manualJoinModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function submitManualJoin() {
    const code = document.getElementById('manualCode').value.trim();
    if (code) {
        // Try to parse the code as a session ID or URL
        if (code.includes('session=')) {
            const urlParams = new URLSearchParams(code.split('?')[1]);
            const sessionId = urlParams.get('session');
            const tableId = urlParams.get('table');
            
            if (sessionId) {
                closeManualJoin();
                if (tableId) {
                    joinSpecificTable(sessionId, tableId);
                } else {
                    loadSpecificSession(sessionId);
                }
            }
        } else {
            // Assume it's a session ID
            closeManualJoin();
            loadSpecificSession(code);
        }
    } else {
        console.log('Please enter a valid code');
    }
}

// Session Management
async function createSession(event) {
    event.preventDefault();
    
    const title = document.getElementById('sessionTitle').value;
    const description = document.getElementById('sessionDescription').value;
    const language = document.getElementById('sessionLanguage').value;
    const tableCount = parseInt(document.getElementById('tableCount').value);
    const maxParticipants = parseInt(document.getElementById('maxParticipants').value);
    
    if (!title.trim()) {
        console.log('Please enter a session title');
        return;
    }
    
    showLoading('Creating session and generating QR codes...');
    
    try {
        const response = await fetch('/api/sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                title,
                description,
                language,
                tableCount,
                maxParticipants
            }),
        });
        
        if (response.ok) {
            const session = await response.json();
            currentSession = session;
            
            // Add to local sessions array
            activeSessions.push(session);
            
            console.log(`Session "${title}" created successfully!`);
            
            // Join the socket room
            socket.emit('join-session', session.id);
            
            // Show dashboard
            loadSessionDashboard(session.id);
            showScreen('sessionDashboard');
        } else {
            const error = await response.json();
            console.error(`Error creating session: ${error.error}`);
        }
    } catch (error) {
        console.error('Error creating session:', error);
        console.error('Failed to create session. Please try again.');
    } finally {
        hideLoading();
    }
}

async function loadActiveSessions() {
    try {
        const response = await fetch('/api/sessions');
        if (response.ok) {
            const sessions = await response.json();
            activeSessions = Array.isArray(sessions) ? sessions : [];
            populateSessionSelects();
            populateSessionsList();
        } else {
            console.error('Error loading sessions');
            activeSessions = [];
            populateSessionSelects();
            populateSessionsList();
        }
    } catch (error) {
        console.error('Error loading sessions:', error);
        activeSessions = [];
        populateSessionSelects();
        populateSessionsList();
    }
}

function populateSessionSelects() {
    const sessionSelect = document.getElementById('sessionSelect');
    sessionSelect.innerHTML = '<option value="">Select a session...</option>';
    
    if (activeSessions.length === 0) {
        sessionSelect.innerHTML += '<option value="" disabled>No active sessions found</option>';
        return;
    }
    
    activeSessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = `${session.title} (${session.tableCount || session.table_count || 0} tables)`;
        sessionSelect.appendChild(option);
    });
}

function populateSessionsList() {
    const sessionsList = document.getElementById('sessionsList');
    
    if (activeSessions.length === 0) {
        sessionsList.innerHTML = `
            <div class="card">
                <h3>No Active Sessions</h3>
                <p>Create a new session to get started!</p>
                <button onclick="showCreateSession()" class="btn btn-primary">Create Session</button>
            </div>
        `;
        return;
    }
    
    sessionsList.innerHTML = activeSessions.map(session => `
        <div class="card session-card">
            <div onclick="loadSpecificSession('${session.id}')" style="cursor: pointer;">
                <h3>${session.title}</h3>
                <p>${session.description || 'No description'}</p>
                <div class="session-stats">
                    <span>📊 ${session.table_count || session.tableCount || 0} tables</span>
                    <span>👥 ${session.total_participants || 0} participants</span>
                    <span>🎤 ${session.total_recordings || 0} recordings</span>
                </div>
                <small>Created: ${new Date(session.created_at || session.createdAt).toLocaleString()}</small>
            </div>
            <div class="session-actions" style="margin-top: 8px; display: flex; gap: 8px;">
                <button onclick="loadSpecificSession('${session.id}')" class="btn btn-primary btn-small">Open Dashboard</button>
                <button onclick="viewAllTranscriptions('${session.id}')" class="btn btn-secondary btn-small">📝 All Transcriptions</button>
            </div>
        </div>
    `).join('');
}

async function loadSpecificSession(sessionId) {
    showLoading('Loading session...');
    
    try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (response.ok) {
            const session = await response.json();
            currentSession = session;
            socket.emit('join-session', sessionId);
            
            loadSessionDashboard(sessionId);
            showScreen('sessionDashboard');
            console.log(`Joined session: ${session.title}`);
        } else {
            console.error('Session not found or expired');
        }
    } catch (error) {
        console.error('Error loading session:', error);
        console.error('Error loading session');
    } finally {
        hideLoading();
    }
}

async function viewAllTranscriptions(sessionId) {
    showLoading('Loading all transcriptions...');
    
    try {
        // Get session details
        const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
        if (!sessionResponse.ok) {
            throw new Error('Session not found');
        }
        const session = await sessionResponse.json();
        
        // Get all transcriptions for the session
        const transcriptionsResponse = await fetch(`/api/sessions/${sessionId}/all-transcriptions`);
        if (!transcriptionsResponse.ok) {
            throw new Error('Failed to load transcriptions');
        }
        const transcriptions = await transcriptionsResponse.json();
        
        // Update UI
        document.getElementById('allTranscriptionsTitle').textContent = `📝 All Transcriptions`;
        document.getElementById('allTranscriptionsSubtitle').textContent = `${session.title} - Session Overview`;
        
        // Store current session for filtering
        currentSession = session;
        
        // Display transcriptions
        displayAwesomeTranscriptions(transcriptions, session);
        showScreen('allTranscriptionsScreen');
        
    } catch (error) {
        console.error('Error loading transcriptions:', error);
        console.error('Error loading transcriptions');
    } finally {
        hideLoading();
    }
}

function displayAwesomeTranscriptions(transcriptions, session) {
    // Update statistics
    updateDashboardStats(transcriptions);
    
    // Setup filters
    setupAwesomeFilters(transcriptions);
    
    // Display transcriptions with awesome design
    renderAwesomeTranscriptions(transcriptions);
    
    // Load existing AI analysis
    loadExistingAIAnalysis(session.id);
}

function updateDashboardStats(transcriptions) {
    const totalTranscriptions = transcriptions.length;
    const activeTables = [...new Set(transcriptions.map(t => t.table_number))].length;
    const totalDuration = transcriptions.reduce((sum, t) => sum + (parseFloat(t.duration_seconds) || 0), 0);
    const totalSpeakers = transcriptions.reduce((sum, t) => {
        const segments = t.speaker_segments ? 
            (typeof t.speaker_segments === 'string' ? JSON.parse(t.speaker_segments) : t.speaker_segments) : [];
        const speakers = [...new Set(segments.map(s => s.speaker || 0))];
        return Math.max(sum, speakers.length);
    }, 0);
    
    document.getElementById('totalTranscriptions').textContent = totalTranscriptions;
    document.getElementById('activeTables').textContent = activeTables;
    document.getElementById('totalDuration').textContent = `${Math.round(totalDuration / 60)}min`;
    document.getElementById('totalSpeakers').textContent = totalSpeakers;
}

function setupAwesomeFilters(transcriptions) {
    const tableFilter = document.getElementById('tableFilter');
    const sortFilter = document.getElementById('sortFilter');
    
    // Populate table filter
    const tables = [...new Set(transcriptions.map(t => t.table_number))].sort((a, b) => a - b);
    tableFilter.innerHTML = '<option value="">🌐 All Tables</option>' +
        tables.map(tableNum => `<option value="${tableNum}">🏓 Table ${tableNum}</option>`).join('');
    
    // Add event listeners
    tableFilter.onchange = () => renderAwesomeTranscriptions(transcriptions);
    sortFilter.onchange = () => renderAwesomeTranscriptions(transcriptions);
}

function renderAwesomeTranscriptions(transcriptions) {
    const allTranscriptionsList = document.getElementById('allTranscriptionsList');
    const tableFilter = document.getElementById('tableFilter');
    const sortFilter = document.getElementById('sortFilter');
    
    // Apply filters
    let filteredTranscriptions = transcriptions;
    
    if (tableFilter.value) {
        filteredTranscriptions = filteredTranscriptions.filter(t => t.table_number.toString() === tableFilter.value);
    }
    
    // Apply sorting
    const sortOption = sortFilter.value;
    switch (sortOption) {
        case 'oldest':
            filteredTranscriptions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            break;
        case 'table':
            filteredTranscriptions.sort((a, b) => a.table_number - b.table_number);
            break;
        case 'duration':
            filteredTranscriptions.sort((a, b) => (parseFloat(b.duration_seconds) || 0) - (parseFloat(a.duration_seconds) || 0));
            break;
        case 'newest':
        default:
            filteredTranscriptions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            break;
    }
    
    if (filteredTranscriptions.length === 0) {
        allTranscriptionsList.innerHTML = `
            <div class="no-transcriptions-message">
                <h3>🔍 No Transcriptions Found</h3>
                <p>No recordings match the current filter criteria.</p>
            </div>
        `;
        return;
    }
    
    // Group by table for better organization
    const groupedTranscriptions = {};
    filteredTranscriptions.forEach(transcription => {
        const tableKey = `table_${transcription.table_number}`;
        if (!groupedTranscriptions[tableKey]) {
            groupedTranscriptions[tableKey] = [];
        }
        groupedTranscriptions[tableKey].push(transcription);
    });
    
    let html = '';
    Object.keys(groupedTranscriptions).sort((a, b) => {
        const tableA = parseInt(a.split('_')[1]);
        const tableB = parseInt(b.split('_')[1]);
        return tableA - tableB;
    }).forEach(tableKey => {
        const tableNumber = tableKey.split('_')[1];
        const tableTranscriptions = groupedTranscriptions[tableKey];
        
        html += `
            <div class="awesome-table-group">
                <div class="table-group-header">
                    <h3 class="table-group-title">
                        🏓 Table ${tableNumber}
                    </h3>
                    <span class="table-group-badge">${tableTranscriptions.length} recording${tableTranscriptions.length !== 1 ? 's' : ''}</span>
                </div>
        `;
        
        tableTranscriptions.forEach((transcription, index) => {
            const speakerSegments = transcription.speaker_segments ? 
                (typeof transcription.speaker_segments === 'string' ? 
                    JSON.parse(transcription.speaker_segments) : 
                    transcription.speaker_segments) : [];
            
            const consolidatedSegments = consolidateSpeakerSegments(speakerSegments);
            const uniqueSpeakers = new Set(consolidatedSegments.map(s => s.speaker));
            const hasMultipleSpeakers = uniqueSpeakers.size > 1;
            const recordingDate = new Date(transcription.created_at).toLocaleDateString();
            const recordingTime = new Date(transcription.created_at).toLocaleTimeString();
            const duration = Math.round(parseFloat(transcription.duration_seconds) || 0);
            
            html += `
                <div class="awesome-transcription-card">
                    <div class="transcription-card-header">
                        <div class="recording-title">🎤 Recording ${index + 1}</div>
                        <div class="recording-meta">
                            <div>${recordingDate} ${recordingTime}</div>
                            ${duration > 0 ? `<span class="duration-badge">${duration}s</span>` : ''}
                        </div>
                    </div>
                    <div class="awesome-speaker-segments">
                        ${consolidatedSegments.length > 0 ? 
                            (hasMultipleSpeakers ? 
                                consolidatedSegments.map(segment => `
                                    <div class="awesome-speaker-segment">
                                        <div class="awesome-speaker-label">Speaker ${(segment.speaker || 0) + 1}</div>
                                        <div class="awesome-speaker-text">${
                                            (typeof segment.consolidatedText === 'string' ? segment.consolidatedText : null) ||
                                            (typeof segment.transcript === 'string' ? segment.transcript : null) ||
                                            (typeof segment.text === 'string' ? segment.text : null) ||
                                            'No text available'
                                        }</div>
                                    </div>
                                `).join('') :
                                `<div class="awesome-speaker-segment">
                                    <div class="awesome-speaker-text">${
                                        consolidatedSegments.map(segment => 
                                            (typeof segment.consolidatedText === 'string' ? segment.consolidatedText : null) ||
                                            (typeof segment.transcript === 'string' ? segment.transcript : null) ||
                                            (typeof segment.text === 'string' ? segment.text : null) ||
                                            'No text available'
                                        ).join(' ')
                                    }</div>
                                </div>`
                            ) : 
                            `<div class="awesome-speaker-segment">
                                <div class="awesome-speaker-label">No Audio</div>
                                <div class="awesome-speaker-text" style="font-style: italic; color: #999;">No transcription available for this recording</div>
                            </div>`
                        }
                    </div>
                </div>
            `;
        });
        
        html += `</div>`;
    });
    
    allTranscriptionsList.innerHTML = html;
}

// Refresh transcriptions by reloading the data
async function refreshTranscriptions() {
    if (!currentSession) return;
    
    showLoading('Refreshing transcriptions...');
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/all-transcriptions`);
        if (!response.ok) {
            throw new Error('Failed to refresh transcriptions');
        }
        const transcriptions = await response.json();
        displayAwesomeTranscriptions(transcriptions, currentSession);
    } catch (error) {
        console.error('Error refreshing transcriptions:', error);
        alert('Failed to refresh transcriptions. Please try again.');
    } finally {
        hideLoading();
    }
}

function exportAllTranscriptions() {
    if (!currentSession) return;
    
    const allTranscriptionsList = document.getElementById('allTranscriptionsList');
    const transcriptionsText = allTranscriptionsList.innerText;
    
    const blob = new Blob([transcriptionsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSession.title}_all_transcriptions.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// AI Analysis Functions
async function loadExistingAIAnalysis(sessionId) {
    if (!sessionId) return;
    
    try {
        const response = await fetch(`/api/sessions/${sessionId}/analysis`);
        if (response.ok) {
            const analyses = await response.json();
            if (analyses.length > 0) {
                // Show existing analysis
                displayAIAnalysisResults(analyses);
                document.getElementById('aiAnalysisSection').style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error loading existing AI analysis:', error);
    }
}

async function generateAIAnalysis() {
    if (!currentSession) {
        alert('No session selected');
        return;
    }
    
    const analysisBtn = document.getElementById('aiAnalysisBtn');
    const aiAnalysisSection = document.getElementById('aiAnalysisSection');
    const aiAnalysisResults = document.getElementById('aiAnalysisResults');
    
    // Disable button and show loading
    analysisBtn.disabled = true;
    analysisBtn.textContent = '🤖 Generating...';
    
    // Show analysis section with loading
    aiAnalysisSection.style.display = 'block';
    aiAnalysisResults.innerHTML = `
        <div class="analysis-loading">
            <div class="spinner"></div>
            <p>AI is analyzing all transcriptions...</p>
            <small>This may take a few minutes depending on the amount of content.</small>
        </div>
    `;
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/analysis/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                types: ['summary', 'themes', 'sentiment', 'conflicts', 'agreements']
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to generate AI analysis');
        }
        
        const result = await response.json();
        
        // Convert result format to array for display
        const analyses = Object.keys(result.analyses).map(type => ({
            analysis_type: type,
            analysis_data: result.analyses[type].analysis_data,
            created_at: new Date().toISOString(),
            metadata: result.analyses[type].metadata
        }));
        
        displayAIAnalysisResults(analyses);
        
        // Show success message
        const successDiv = document.createElement('div');
        successDiv.className = 'analysis-success';
        successDiv.innerHTML = '✅ AI analysis completed successfully!';
        aiAnalysisResults.insertBefore(successDiv, aiAnalysisResults.firstChild);
        
        // Remove success message after 3 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 3000);
        
    } catch (error) {
        console.error('Error generating AI analysis:', error);
        aiAnalysisResults.innerHTML = `
            <div class="analysis-error">
                <h3>❌ Analysis Failed</h3>
                <p>${error.message}</p>
                <small>Please try again or check if the AI service is available.</small>
            </div>
        `;
    } finally {
        // Re-enable button
        analysisBtn.disabled = false;
        analysisBtn.textContent = '🤖 AI Analysis';
    }
}

function displayAIAnalysisResults(analyses) {
    const aiAnalysisResults = document.getElementById('aiAnalysisResults');
    
    if (!analyses || analyses.length === 0) {
        aiAnalysisResults.innerHTML = `
            <div class="analysis-error">
                <h3>No Analysis Available</h3>
                <p>Click "AI Analysis" to generate insights for this session.</p>
            </div>
        `;
        return;
    }
    
    const analysisTypeConfig = {
        summary: {
            icon: '📝',
            title: 'Session Summary',
            description: 'AI-generated overview of the discussion'
        },
        themes: {
            icon: '🎯',
            title: 'Key Themes',
            description: 'Main topics and themes discussed'
        },
        sentiment: {
            icon: '😊',
            title: 'Sentiment Analysis',
            description: 'Overall emotional tone of the conversation'
        },
        conflicts: {
            icon: '⚡',
            title: 'Conflicts & Tensions',
            description: 'Areas of disagreement or tension'
        },
        agreements: {
            icon: '🤝',
            title: 'Agreements & Consensus',
            description: 'Points where participants found common ground'
        }
    };
    
    let html = '';
    
    // Sort analyses by a preferred order
    const sortedAnalyses = analyses.sort((a, b) => {
        const order = ['summary', 'themes', 'sentiment', 'agreements', 'conflicts'];
        return order.indexOf(a.analysis_type) - order.indexOf(b.analysis_type);
    });
    
    sortedAnalyses.forEach(analysis => {
        const config = analysisTypeConfig[analysis.analysis_type] || {
            icon: '🤖',
            title: analysis.analysis_type.charAt(0).toUpperCase() + analysis.analysis_type.slice(1),
            description: 'AI analysis result'
        };
        
        html += `
            <div class="analysis-card">
                <div class="analysis-card-header">
                    <span class="analysis-icon">${config.icon}</span>
                    <div>
                        <h3 class="analysis-title">${config.title}</h3>
                        <p style="color: #666; font-size: 0.9rem; margin: 0;">${config.description}</p>
                    </div>
                </div>
                <div class="analysis-content">
                    ${formatAnalysisContent(analysis.analysis_data, analysis.analysis_type)}
                </div>
            </div>
        `;
    });
    
    aiAnalysisResults.innerHTML = html;
}

function formatAnalysisContent(data, type) {
    if (!data) return '<p>No data available</p>';
    
    // Handle different data formats
    if (typeof data === 'string') {
        return `<p>${data}</p>`;
    }
    
    if (typeof data === 'object') {
        let html = '';
        
        // Handle common AI analysis structures
        if (data.summary) {
            html += `<p><strong>Summary:</strong> ${data.summary}</p>`;
        }
        
        if (data.themes && Array.isArray(data.themes)) {
            html += '<h3>Main Themes:</h3><ul>';
            data.themes.forEach(theme => {
                if (typeof theme === 'object') {
                    html += `<li><strong>${theme.name || theme.title}:</strong> ${theme.description || theme.content}</li>`;
                } else {
                    html += `<li>${theme}</li>`;
                }
            });
            html += '</ul>';
        }
        
        if (data.sentiment) {
            html += `<h3>Overall Sentiment:</h3><p>${data.sentiment}</p>`;
        }
        
        if (data.score !== undefined) {
            html += `<p><strong>Confidence Score:</strong> ${(data.score * 100).toFixed(1)}%</p>`;
        }
        
        if (data.insights && Array.isArray(data.insights)) {
            html += '<h3>Key Insights:</h3><ul>';
            data.insights.forEach(insight => {
                html += `<li>${insight}</li>`;
            });
            html += '</ul>';
        }
        
        if (data.conflicts && Array.isArray(data.conflicts)) {
            html += '<h3>Areas of Disagreement:</h3><ul>';
            data.conflicts.forEach(conflict => {
                html += `<li>${conflict}</li>`;
            });
            html += '</ul>';
        }
        
        if (data.agreements && Array.isArray(data.agreements)) {
            html += '<h3>Points of Agreement:</h3><ul>';
            data.agreements.forEach(agreement => {
                html += `<li>${agreement}</li>`;
            });
            html += '</ul>';
        }
        
        // Fallback: display as JSON if no specific structure matches
        if (!html) {
            html = `<pre style="background: #f5f5f5; padding: 12px; border-radius: 8px; overflow-x: auto;">${JSON.stringify(data, null, 2)}</pre>`;
        }
        
        return html;
    }
    
    return `<p>${String(data)}</p>`;
}

function toggleAIAnalysis() {
    const aiAnalysisSection = document.getElementById('aiAnalysisSection');
    aiAnalysisSection.style.display = 'none';
}

async function loadSessionDashboard(sessionId) {
    const session = currentSession || activeSessions.find(s => s.id === sessionId);
    if (!session) return;
    
    // Update dashboard title and stats
    document.getElementById('dashboardTitle').textContent = session.title;
    document.getElementById('participantCount').textContent = session.total_participants || 0;
    document.getElementById('activeTableCount').textContent = session.active_tables || session.tableCount || 0;
    document.getElementById('recordingCount').textContent = session.total_recordings || 0;
    
    // Load tables if available
    if (session.tables && session.tables.length > 0) {
        displayTables(session.tables);
    } else {
        // Generate mock tables for display
        const mockTables = [];
        const tableCount = session.tableCount || session.table_count || 20;
        for (let i = 1; i <= tableCount; i++) {
            mockTables.push({
                id: i,
                table_number: i,
                name: `Table ${i}`,
                status: 'waiting',
                participant_count: 0,
                recording_count: 0,
                transcription_count: 0,
                participants: null
            });
        }
        session.tables = mockTables;
        displayTables(mockTables);
    }
    
    // Setup QR codes section
    setupQRCodesSection(session);
}

function displayTables(tables) {
    const tablesGrid = document.getElementById('tablesGrid');
    
    tablesGrid.innerHTML = tables.map(table => {
        const participantCount = table.participant_count || (table.participants ? table.participants.length : 0);
        const statusClass = table.status || 'waiting';
        const recordingCount = table.recording_count || 0;
        const transcriptionCount = table.transcription_count || 0;
        
        return `
            <div class="table-card ${statusClass}" onclick="showTableInterface(${table.id || table.table_number})">
                <div class="table-header">
                    <h4 class="table-title">${table.name || `Table ${table.table_number}`}</h4>
                    <span class="status-badge ${statusClass}">${statusClass}</span>
                </div>
                <div class="table-stats">
                    <div class="stat-item">
                        <span class="stat-icon">👥</span>
                        <span>${participantCount}/5</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">🎤</span>
                        <span>${recordingCount}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-icon">📝</span>
                        <span>${transcriptionCount}</span>
                    </div>
                </div>
                <div class="table-qr">
                    <button onclick="event.stopPropagation(); showTableQR(${table.id || table.table_number})" class="btn btn-sm btn-secondary">
                        📱 QR Code
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// QR Code functionality
function setupQRCodesSection(session) {
    if (!session.qrCodes) {
        // Mock QR codes for sessions without database
        session.qrCodes = {
            session: `/qr-codes/session-${session.id}.png`,
            tables: {}
        };
        
        const tableCount = session.tableCount || session.table_count || 20;
        for (let i = 1; i <= tableCount; i++) {
            session.qrCodes.tables[i] = `/qr-codes/table-${session.id}-${i}.png`;
        }
    }
}

function showQRCodes() {
    document.getElementById('qrCodesSection').style.display = 'block';
    populateQRCodesGrid();
    document.getElementById('showQRCodesBtn').textContent = '✅ QR Codes Shown';
    
    // Scroll to QR section
    document.getElementById('qrCodesSection').scrollIntoView({ behavior: 'smooth' });
}

function hideQRCodes() {
    document.getElementById('qrCodesSection').style.display = 'none';
    document.getElementById('showQRCodesBtn').textContent = '📱 QR Codes';
}

function populateQRCodesGrid() {
    if (!currentSession) return;
    
    const qrCodesGrid = document.getElementById('qrCodesGrid');
    let qrHTML = '';
    
    // Session QR Code
    qrHTML += `
        <div class="qr-card">
            <h4>Session QR Code</h4>
            <p>Join this World Café session</p>
            <div class="qr-code-image">
                <img src="/api/qr/session/${currentSession.id}" 
                     alt="Session QR Code" 
                     onerror="this.parentElement.innerHTML='<div style=&quot;color: #666; padding: 2rem;&quot;>QR Code<br/>Not Available</div>'">
            </div>
            <div class="qr-actions">
                <button onclick="downloadQR('session', '${currentSession.id}')" class="btn btn-sm btn-secondary">📥 Download</button>
                <button onclick="copyQRLink('session', '${currentSession.id}')" class="btn btn-sm btn-secondary">🔗 Copy Link</button>
            </div>
        </div>
    `;
    
    // Table QR Codes
    if (currentSession.tables) {
        currentSession.tables.slice(0, 8).forEach(table => { // Show first 8 tables
            const tableNumber = table.table_number || table.id;
            qrHTML += `
                <div class="qr-card">
                    <h4>Table ${tableNumber}</h4>
                    <p>Join Table ${tableNumber} directly</p>
                    <div class="qr-code-image">
                        <img src="/api/qr/table/${currentSession.id}/${tableNumber}" 
                             alt="Table ${tableNumber} QR Code"
                             onerror="this.parentElement.innerHTML='<div style=&quot;color: #666; padding: 2rem;&quot;>QR Code<br/>Not Available</div>'">
                    </div>
                    <div class="qr-actions">
                        <button onclick="downloadQR('table', '${currentSession.id}', '${tableNumber}')" class="btn btn-sm btn-secondary">📥 Download</button>
                        <button onclick="copyQRLink('table', '${currentSession.id}', '${tableNumber}')" class="btn btn-sm btn-secondary">🔗 Copy Link</button>
                    </div>
                </div>
            `;
        });
        
        if (currentSession.tables.length > 8) {
            qrHTML += `
                <div class="qr-card">
                    <h4>More Tables</h4>
                    <p>${currentSession.tables.length - 8} more table QR codes available</p>
                    <button onclick="showAllTableQRs()" class="btn btn-primary">View All</button>
                </div>
            `;
        }
    }
    
    qrCodesGrid.innerHTML = qrHTML;
}

function downloadQR(type, sessionId, tableNumber = null) {
    const url = tableNumber 
        ? `/api/qr/table/${sessionId}/${tableNumber}`
        : `/api/qr/session/${sessionId}`;
    
    const filename = tableNumber 
        ? `table-${tableNumber}-qr-code.png`
        : `session-qr-code.png`;
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log(`Downloading ${type} QR code...`);
}

function copyQRLink(type, sessionId, tableNumber = null) {
    const baseUrl = window.location.origin;
    const url = tableNumber 
        ? `${baseUrl}/join/${sessionId}/table/${tableNumber}`
        : `${baseUrl}/join/${sessionId}`;
    
    navigator.clipboard.writeText(url).then(() => {
        console.log('QR code link copied to clipboard!');
    }).catch(() => {
        console.warn('Could not copy link. Please copy manually: ' + url);
    });
}

function downloadAllQRCodes() {
    if (!currentSession) return;
    
    console.log('Downloading all QR codes...');
    
    // Download session QR
    downloadQR('session', currentSession.id);
    
    // Download table QRs with delay to prevent browser blocking
    if (currentSession.tables) {
        currentSession.tables.forEach((table, index) => {
            setTimeout(() => {
                const tableNumber = table.table_number || table.id;
                downloadQR('table', currentSession.id, tableNumber);
            }, (index + 1) * 500); // 500ms delay between downloads
        });
    }
}

function printQRCodes() {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>QR Codes - ${currentSession.title}</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                .qr-page { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
                .qr-item { text-align: center; page-break-inside: avoid; margin-bottom: 30px; }
                .qr-item img { max-width: 200px; height: 200px; }
                .qr-item h3 { margin: 10px 0 5px 0; }
                .qr-item p { margin: 0; color: #666; }
                @media print { .qr-page { grid-template-columns: 1fr 1fr; } }
            </style>
        </head>
        <body>
            <h1>${currentSession.title} - QR Codes</h1>
            <div class="qr-page">
                <div class="qr-item">
                    <h3>Session QR Code</h3>
                    <img src="/api/qr/session/${currentSession.id}" alt="Session QR">
                    <p>Join this World Café session</p>
                </div>
                ${currentSession.tables ? currentSession.tables.map(table => {
                    const tableNumber = table.table_number || table.id;
                    return `
                        <div class="qr-item">
                            <h3>Table ${tableNumber}</h3>
                            <img src="/api/qr/table/${currentSession.id}/${tableNumber}" alt="Table ${tableNumber} QR">
                            <p>Join Table ${tableNumber} directly</p>
                        </div>
                    `;
                }).join('') : ''}
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    // Wait for images to load then print
    setTimeout(() => {
        printWindow.print();
    }, 1000);
}

// Mobile QR Scanner functionality
function showQRScanner() {
    if (!isMobile) {
        console.log('QR scanning works best on mobile devices');
    }
    
    document.getElementById('mobileScanner').style.display = 'flex';
    startCamera();
}

function closeQRScanner() {
    document.getElementById('mobileScanner').style.display = 'none';
    stopCamera();
}

function showManualJoin() {
    document.getElementById('mobileScanner').style.display = 'none';
    document.getElementById('manualJoinModal').style.display = 'flex';
    document.getElementById('manualCode').focus();
}

function closeManualJoin() {
    document.getElementById('manualJoinModal').style.display = 'none';
    document.getElementById('manualCode').value = '';
}

function submitManualJoin() {
    const code = document.getElementById('manualCode').value.trim();
    if (!code) {
        console.error('Please enter a session or table code');
        return;
    }
    
    closeManualJoin();
    processQRCode(code);
}

async function startCamera() {
    try {
        const video = document.getElementById('qrVideo');
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } // Use back camera if available
        });
        video.srcObject = stream;
        video.play();
        
        // Start QR code detection (simplified - in production use a QR code library)
        detectQRCode(video);
    } catch (error) {
        console.error('Camera access denied:', error);
        console.error('Camera access is required for QR scanning');
        showManualJoin();
    }
}

function stopCamera() {
    const video = document.getElementById('qrVideo');
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
}

function detectQRCode(video) {
    // Simplified QR detection - in production, use jsQR or similar library
    // This is a placeholder that would integrate with a QR code scanning library
    setTimeout(() => {
        if (document.getElementById('mobileScanner').style.display !== 'none') {
            detectQRCode(video);
        }
    }, 1000);
}

function processQRCode(data) {
    console.log('Processing QR code:', data);
    
    // Extract session ID and table ID from QR code data
    let sessionId = null;
    let tableId = null;
    
    // Handle URLs like: http://localhost:3002/join/sessionId or /join/sessionId/table/tableId
    if (data.includes('/join/')) {
        const parts = data.split('/join/')[1].split('/');
        sessionId = parts[0];
        if (parts.length > 2 && parts[1] === 'table') {
            tableId = parts[2];
        }
    } else if (data.match(/^[a-f0-9-]{36}$/i)) {
        // Direct UUID session ID
        sessionId = data;
    }
    
    if (sessionId) {
        if (tableId) {
            joinSpecificTable(sessionId, tableId);
        } else {
            loadSpecificSession(sessionId);
        }
    } else {
        console.error('Invalid QR code. Please try again.');
    }
}

async function joinSpecificTable(sessionId, tableId) {
    showLoading(`Joining Table ${tableId}...`);
    
    try {
        // First load the session
        await loadSpecificSession(sessionId);
        
        // Then navigate to the specific table
        if (currentSession) {
            showTableInterface(tableId);
            console.log(`Joined Table ${tableId}!`);
        }
    } catch (error) {
        console.error('Error joining table:', error);
        console.error(`Error joining Table ${tableId}`);
    } finally {
        hideLoading();
    }
}

// Table Management
async function loadSessionTables() {
    const sessionSelect = document.getElementById('sessionSelect');
    const tableSelect = document.getElementById('tableSelect');
    const joinBtn = document.getElementById('joinTableBtn');
    
    if (!sessionSelect.value) {
        tableSelect.innerHTML = '<option value="">First select a session</option>';
        joinBtn.disabled = true;
        return;
    }
    
    const session = activeSessions.find(s => s.id === sessionSelect.value);
    if (!session) {
        tableSelect.innerHTML = '<option value="">Session not found</option>';
        return;
    }
    
    // Generate table options
    tableSelect.innerHTML = '<option value="">Select a table...</option>';
    const tableCount = session.tableCount || session.table_count || 20;
    
    for (let i = 1; i <= tableCount; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Table ${i}`;
        tableSelect.appendChild(option);
    }
    
    tableSelect.onchange = function() {
        joinBtn.disabled = !this.value;
    };
}

async function joinTable() {
    const sessionId = document.getElementById('sessionSelect').value;
    const tableNumber = document.getElementById('tableSelect').value;
    const participantName = document.getElementById('participantName').value.trim();
    
    if (!sessionId || !tableNumber || !participantName) {
        console.error('Please fill in all fields');
        return;
    }
    
    showLoading('Joining table...');
    
    try {
        const response = await fetch(`/api/sessions/${sessionId}/tables/${tableNumber}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                participantName: participantName
            }),
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Load the session and go to table interface
            await loadSpecificSession(sessionId);
            showTableInterface(tableNumber);
            
            console.log(`Successfully joined Table ${tableNumber}!`);
        } else {
            const error = await response.json();
            console.error(`Error joining table: ${error.error}`);
        }
    } catch (error) {
        console.error('Error joining table:', error);
        console.error('Error joining table. Please try again.');
    } finally {
        hideLoading();
    }
}

async function joinCurrentTable() {
    if (!currentTable) {
        console.error('No table selected');
        return;
    }
    
    const participantName = document.getElementById('participantNameInput').value.trim();
    const participantEmail = document.getElementById('participantEmailInput').value.trim();
    
    if (!participantName) {
        alert('Please enter your name');
        return;
    }
    
    showLoading('Joining table...');
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/tables/${currentTable.table_number}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                participantName: participantName,
                email: participantEmail || null
            }),
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // Store participant ID
            localStorage.setItem('currentParticipantId', result.participant.id);
            
            // Reload session and table data
            await loadSpecificSession(currentSession.id);
            showTableInterface(currentTable.id || currentTable.table_number);
            
            console.log(`Successfully joined ${currentTable.name || `Table ${currentTable.table_number}`}!`);
        } else {
            const error = await response.json();
            alert(`Error joining table: ${error.error}`);
        }
    } catch (error) {
        console.error('Error joining table:', error);
        alert('Error joining table. Please try again.');
    } finally {
        hideLoading();
    }
}

function setupTableInterface() {
    if (!currentTable) return;
    
    document.getElementById('tableTitle').textContent = currentTable.name || `Table ${currentTable.table_number}`;
    document.getElementById('tableStatus').textContent = currentTable.status || 'waiting';
    document.getElementById('tableStatus').className = `status-badge ${currentTable.status || 'waiting'}`;
    
    // Check if current user is already in this table
    const currentParticipantId = localStorage.getItem('currentParticipantId');
    const isAlreadyJoined = currentTable.participants && currentTable.participants.some(p => p.id === currentParticipantId);
    
    // Show/hide join section
    const joinSection = document.getElementById('joinTableSection');
    if (isAlreadyJoined) {
        joinSection.style.display = 'none';
    } else {
        joinSection.style.display = 'block';
    }
    
    // Update participants list
    const participantsList = document.getElementById('participantsList');
    if (currentTable.participants && currentTable.participants.length > 0) {
        participantsList.innerHTML = currentTable.participants.map(p => 
            `<li>${p.name} ${p.is_facilitator ? '(Facilitator)' : ''}</li>`
        ).join('');
    } else {
        participantsList.innerHTML = '<li>No participants yet</li>';
    }
    
    // Load existing transcriptions
    loadExistingTranscriptions();
}

// Recording functionality
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
            await uploadAudio(audioBlob);
            stream.getTracks().forEach(track => track.stop());
        };
        
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();
        
        // Update UI
        document.getElementById('startRecordingBtn').style.display = 'none';
        document.getElementById('stopRecordingBtn').style.display = 'block';
        document.getElementById('audioVisualization').style.display = 'block';
        
        // Update status
        updateRecordingStatus({ status: 'recording', timestamp: new Date() });
        
        // Notify other clients
        socket.emit('recording-started', {
            sessionId: currentSession.id,
            tableId: currentTable.id || currentTable.table_number
        });
        
        console.log('Recording started');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        console.error('Error accessing microphone. Please check permissions.');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Update UI
        document.getElementById('startRecordingBtn').style.display = 'block';
        document.getElementById('stopRecordingBtn').style.display = 'none';
        document.getElementById('audioVisualization').style.display = 'none';
        
        // Notify other clients
        socket.emit('recording-stopped', {
            sessionId: currentSession.id,
            tableId: currentTable.id || currentTable.table_number
        });
        
        console.log('Recording stopped, processing...');
    }
}

async function uploadAudio(audioBlob) {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    
    const tableNumber = currentTable.table_number || currentTable.id;
    
    showLoading('Uploading and transcribing audio...');
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/tables/${tableNumber}/upload-audio`, {
            method: 'POST',
            body: formData,
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('Audio uploaded and transcription started!');
            
            // Update recording status
            updateRecordingStatus({ status: 'processing', timestamp: new Date() });
        } else {
            const error = await response.json();
            console.error(`Upload failed: ${error.error}`);
        }
    } catch (error) {
        console.error('Error uploading audio:', error);
        console.error('Error uploading audio. Please try again.');
    } finally {
        hideLoading();
    }
}

function updateRecordingStatus(data) {
    const statusElement = document.getElementById('recordingStatus');
    const timestamp = new Date(data.timestamp).toLocaleTimeString();
    
    switch (data.status) {
        case 'recording':
            statusElement.innerHTML = `🔴 Recording in progress... (${timestamp})`;
            statusElement.className = 'recording-status recording';
            break;
        case 'processing':
            statusElement.innerHTML = `⏳ Processing audio and generating transcription... (${timestamp})`;
            statusElement.className = 'recording-status processing';
            break;
        case 'completed':
            statusElement.innerHTML = `✅ Transcription completed (${timestamp})`;
            statusElement.className = 'recording-status completed';
            break;
        default:
            statusElement.innerHTML = `⏹️ Recording stopped (${timestamp})`;
            statusElement.className = 'recording-status';
    }
}

function displayTranscription(data) {
    const transcriptDisplay = document.getElementById('liveTranscript');
    
    // Debug logging
    console.log('🎤 Live transcription received:', {
        hasTranscription: !!data.transcription,
        speakers: data.transcription?.speakers,
        speakersType: typeof data.transcription?.speakers,
        speakersLength: Array.isArray(data.transcription?.speakers) ? data.transcription.speakers.length : 'not array',
        transcript: data.transcription?.transcript
    });
    
    if (data.transcription) {
        const transcriptItem = document.createElement('div');
        transcriptItem.className = 'transcript-item';
        
        // Parse speakers for real-time transcription
        let speakers = [];
        try {
            if (data.transcription.speakers && Array.isArray(data.transcription.speakers)) {
                speakers = data.transcription.speakers;
                console.log('✅ Found speaker segments:', speakers.length);
            } else {
                console.log('❌ No valid speaker segments found');
            }
        } catch (e) {
            console.error('Error parsing real-time speakers:', e);
        }
        
        const currentTime = new Date().toLocaleTimeString();
        const confidence = data.transcription.confidence ? `${(data.transcription.confidence * 100).toFixed(1)}% confidence` : '';
        
        let transcriptContent = '';
        
        if (speakers && speakers.length > 0) {
            // Consolidate consecutive speaker segments for real-time display
            const consolidatedSpeakers = consolidateSpeakerSegments(speakers);
            const uniqueSpeakers = new Set(consolidatedSpeakers.map(s => s.speaker));
            const hasMultipleSpeakers = uniqueSpeakers.size > 1;
            
            if (hasMultipleSpeakers) {
                transcriptContent = consolidatedSpeakers.map(segment => {
                    const speakerNum = (segment.speaker !== undefined ? segment.speaker : 0) + 1;
                    const speakerClass = `speaker-${speakerNum % 5}`;
                    return `
                        <div class="speaker-segment ${speakerClass}">
                            <div class="speaker-label">
                                <strong>Speaker ${speakerNum}</strong>
                            </div>
                            <div class="speaker-text">${segment.consolidatedText}</div>
                        </div>
                    `;
                }).join('');
            } else {
                // Single speaker - no speaker labels
                const allText = consolidatedSpeakers.map(s => s.consolidatedText).join(' ');
                transcriptContent = `<div class="speaker-text">${allText}</div>`;
            }
        } else {
            // Handle different transcript field names and ensure we display text, not object
            const transcriptText = data.transcription.transcript || 
                                 data.transcription.transcript_text || 
                                 data.transcription.transcriptText ||
                                 (typeof data.transcription === 'string' ? data.transcription : 'No transcript available');
            transcriptContent = `<div class="transcript-text">${transcriptText}</div>`;
        }
        
        transcriptItem.innerHTML = `
            <div class="transcript-meta">
                <span><strong>Table ${data.tableNumber} - New</strong></span>
                <span>${currentTime}</span>
                <span>${confidence}</span>
            </div>
            ${transcriptContent}
        `;
        
        transcriptDisplay.insertBefore(transcriptItem, transcriptDisplay.firstChild);
        
        // Limit to 10 most recent transcriptions
        while (transcriptDisplay.children.length > 10) {
            transcriptDisplay.removeChild(transcriptDisplay.lastChild);
        }
    }
}

function updateTableTranscriptionCount(tableId) {
    // Update the table card's transcription count
    const tableCards = document.querySelectorAll('.table-card');
    tableCards.forEach(card => {
        if (card.onclick.toString().includes(tableId)) {
            const transcriptStat = card.querySelector('.stat-item:last-child span:last-child');
            if (transcriptStat) {
                const currentCount = parseInt(transcriptStat.textContent) || 0;
                transcriptStat.textContent = currentCount + 1;
            }
        }
    });
}

// Analysis and reporting
async function generateAnalysis() {
    if (!currentSession) {
        console.error('No session selected');
        return;
    }
    
    showLoading('Generating AI-powered analysis...');
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/analysis`);
        
        if (response.ok) {
            const analysis = await response.json();
            displayAnalysisReport(analysis);
            showScreen('analysisReport');
            console.log('Analysis completed!');
        } else {
            const error = await response.json();
            console.error(`Analysis failed: ${error.error}`);
        }
    } catch (error) {
        console.error('Error generating analysis:', error);
        console.error('Error generating analysis');
    } finally {
        hideLoading();
    }
}

function displayAnalysisReport(analysis) {
    const reportContent = document.getElementById('reportContent');
    
    reportContent.innerHTML = `
        <div class="analysis-summary">
            <h3>Analysis Summary</h3>
            <div class="summary-stats">
                <div class="stat-card">
                    <span class="stat-value">${analysis.conflicts ? analysis.conflicts.length : 0}</span>
                    <span class="stat-label">Conflicts Detected</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${analysis.agreements ? analysis.agreements.length : 0}</span>
                    <span class="stat-label">Agreements Found</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${analysis.themes ? analysis.themes.length : 0}</span>
                    <span class="stat-label">Main Themes</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${analysis.llmPowered ? '🤖 AI' : '📊 Basic'}</span>
                    <span class="stat-label">Analysis Type</span>
                </div>
            </div>
        </div>
        
        ${analysis.themes && analysis.themes.length > 0 ? `
            <div class="analysis-section">
                <h4>Main Themes</h4>
                <div class="themes-list">
                    ${analysis.themes.map(theme => `
                        <div class="theme-item">
                            <h5>${theme.theme}</h5>
                            <p>${theme.description}</p>
                            <small>Mentioned ${theme.frequency || 0} times</small>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${analysis.conflicts && analysis.conflicts.length > 0 ? `
            <div class="analysis-section">
                <h4>Conflicts & Disagreements</h4>
                <div class="conflicts-list">
                    ${analysis.conflicts.map(conflict => `
                        <div class="conflict-item">
                            <div class="conflict-severity">Severity: ${(conflict.severity * 100).toFixed(0)}%</div>
                            <p>"${conflict.text}"</p>
                            <small>${conflict.description}</small>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${analysis.agreements && analysis.agreements.length > 0 ? `
            <div class="analysis-section">
                <h4>Agreements & Consensus</h4>
                <div class="agreements-list">
                    ${analysis.agreements.map(agreement => `
                        <div class="agreement-item">
                            <div class="agreement-strength">Strength: ${(agreement.strength * 100).toFixed(0)}%</div>
                            <p>"${agreement.text}"</p>
                            <small>${agreement.description}</small>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${!analysis.llmPowered ? `
            <div class="analysis-notice">
                <p><strong>Note:</strong> This is a basic analysis. Connect to a database and configure LLM services for enhanced AI-powered insights.</p>
            </div>
        ` : ''}
    `;
}

// Admin functionality
async function loadAdminPrompts() {
    try {
        const response = await fetch('/api/admin/prompts');
        if (response.ok) {
            const prompts = await response.json();
            
            document.getElementById('conflictPrompt').value = prompts.conflictDetection?.prompt || '';
            document.getElementById('agreementPrompt').value = prompts.agreementDetection?.prompt || '';
            document.getElementById('themePrompt').value = prompts.themeExtraction?.prompt || '';
            document.getElementById('sentimentPrompt').value = prompts.sentimentAnalysis?.prompt || '';
        }
    } catch (error) {
        console.error('Error loading prompts:', error);
    }
}

async function adminLogin() {
    const password = document.getElementById('adminPassword').value;
    
    if (!password) {
        alert('Please enter admin password');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ password })
        });
        
        if (response.ok) {
            document.getElementById('adminLogin').style.display = 'none';
            document.getElementById('adminPanel').style.display = 'block';
            console.log('Admin access granted');
        } else {
            const error = await response.json();
            alert(`Login failed: ${error.error}`);
        }
    } catch (error) {
        console.error('Error during admin login:', error);
        alert('Error during login. Please try again.');
    }
}

async function savePrompts() {
    const password = document.getElementById('adminPassword').value;
    const prompts = {
        conflictDetection: { prompt: document.getElementById('conflictPrompt').value },
        agreementDetection: { prompt: document.getElementById('agreementPrompt').value },
        themeExtraction: { prompt: document.getElementById('themePrompt').value },
        sentimentAnalysis: { prompt: document.getElementById('sentimentPrompt').value }
    };
    
    try {
        const response = await fetch('/api/admin/prompts', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password, prompts }),
        });
        
        if (response.ok) {
            console.log('Prompts saved successfully');
        } else {
            console.error('Error saving prompts');
        }
    } catch (error) {
        console.error('Error saving prompts:', error);
        console.error('Error saving prompts');
    }
}

// Admin Session Management Functions
let currentAdminSessions = [];
let pendingSessionAction = null;

function showAdminTab(tabName) {
    // Hide all modern tabs
    document.querySelectorAll('.modern-admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected modern tab
    document.getElementById(`admin${tabName.charAt(0).toUpperCase() + tabName.slice(1)}Tab`).classList.add('active');
    
    // Update navigation cards
    document.querySelectorAll('.admin-nav-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // Activate clicked navigation card
    document.getElementById(`${tabName}NavCard`).classList.add('active');
    
    // Load tab-specific content
    if (tabName === 'sessions') {
        loadAdminSessions();
        loadAdminStats();
    } else if (tabName === 'stats') {
        loadPlatformStats();
    } else if (tabName === 'prompts') {
        loadPrompts();
    }
}

async function loadAdminSessions() {
    try {
        const includeDeleted = document.getElementById('includeDeleted')?.checked || false;
        const status = document.getElementById('statusFilter')?.value || '';
        
        let url = '/api/admin/sessions?';
        if (includeDeleted) url += 'includeDeleted=true&';
        if (status) url += `status=${status}&`;
        
        const response = await fetch(url);
        currentAdminSessions = await response.json();
        renderAdminSessions(currentAdminSessions);
    } catch (error) {
        console.error('Error loading admin sessions:', error);
        console.error('Error loading sessions');
    }
}

async function loadAdminStats() {
    try {
        const response = await fetch('/api/admin/dashboard/stats');
        const stats = await response.json();
        
        document.getElementById('adminActiveCount').textContent = stats.active_sessions || 0;
        document.getElementById('adminClosedCount').textContent = stats.closed_sessions || 0;
        document.getElementById('adminDeletedCount').textContent = stats.deleted_sessions || 0;
        document.getElementById('adminRecentCount').textContent = stats.recent_sessions || 0;
    } catch (error) {
        console.error('Error loading admin stats:', error);
    }
}

function renderAdminSessions(sessions) {
    const container = document.getElementById('adminSessionsList');
    
    if (sessions.length === 0) {
        container.innerHTML = '<p class="text-center">No sessions found matching the current filters.</p>';
        return;
    }
    
    container.innerHTML = sessions.map(session => {
        const createdDate = new Date(session.created_at).toLocaleDateString();
        const statusClass = session.status.toLowerCase();
        
        let actions = [];
        
        if (session.status === 'active') {
            actions.push(`<button onclick="promptSessionAction('close', '${session.id}')" class="btn btn-action">Close</button>`);
        } else if (session.status === 'closed') {
            actions.push(`<button onclick="promptSessionAction('reopen', '${session.id}')" class="btn btn-action success">Reopen</button>`);
        }
        
        if (session.deleted_at) {
            actions.push(`<button onclick="promptSessionAction('restore', '${session.id}')" class="btn btn-action success">Restore</button>`);
        } else {
            actions.push(`<button onclick="promptSessionAction('delete', '${session.id}')" class="btn btn-action danger">Delete</button>`);
        }
        
        actions.push(`<button onclick="viewSessionHistory('${session.id}')" class="btn btn-action">History</button>`);
        
        return `
            <div class="admin-session-card">
                <div class="admin-session-header">
                    <div class="admin-session-info">
                        <h4>${session.title}</h4>
                        <div class="session-meta">
                            Created: ${createdDate} | Tables: ${session.table_count} | ID: ${session.id.substr(0, 8)}...
                        </div>
                        ${session.description ? `<p>${session.description}</p>` : ''}
                    </div>
                    <span class="session-status-badge ${statusClass}">${session.status}</span>
                </div>
                <div class="admin-session-actions">
                    ${actions.join('')}
                </div>
            </div>
        `;
    }).join('');
}

function filterAdminSessions() {
    loadAdminSessions();
}

function refreshAdminSessions() {
    loadAdminSessions();
    loadAdminStats();
    console.log('Sessions refreshed');
}

function promptSessionAction(action, sessionId) {
    pendingSessionAction = { action, sessionId };
    
    const titles = {
        close: 'Close Session',
        reopen: 'Reopen Session', 
        delete: 'Delete Session',
        restore: 'Restore Session'
    };
    
    const confirmBtnClasses = {
        close: 'btn-danger',
        reopen: 'btn-success',
        delete: 'btn-danger',
        restore: 'btn-success'
    };
    
    document.getElementById('actionModalTitle').textContent = titles[action];
    document.getElementById('actionReason').value = '';
    document.getElementById('adminUser').value = 'admin';
    
    const confirmBtn = document.getElementById('confirmActionBtn');
    confirmBtn.className = `btn ${confirmBtnClasses[action]}`;
    confirmBtn.textContent = `${action.charAt(0).toUpperCase() + action.slice(1)} Session`;
    
    document.getElementById('sessionActionModal').style.display = 'flex';
}

async function confirmSessionAction() {
    if (!pendingSessionAction) return;
    
    const { action, sessionId } = pendingSessionAction;
    const reason = document.getElementById('actionReason').value;
    const adminUser = document.getElementById('adminUser').value || 'admin';
    
    try {
        let url, method;
        
        switch (action) {
            case 'close':
                url = `/api/admin/sessions/${sessionId}/close`;
                method = 'POST';
                break;
            case 'reopen':
                url = `/api/admin/sessions/${sessionId}/reopen`;
                method = 'POST';
                break;
            case 'delete':
                url = `/api/admin/sessions/${sessionId}`;
                method = 'DELETE';
                break;
            case 'restore':
                url = `/api/admin/sessions/${sessionId}/restore`;
                method = 'POST';
                break;
        }
        
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ reason, adminUser })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log(result.message);
            closeSessionActionModal();
            loadAdminSessions();
            loadAdminStats();
        } else {
            console.error(result.error);
        }
    } catch (error) {
        console.error('Error performing session action:', error);
        console.error('Error performing action');
    }
}

function closeSessionActionModal() {
    document.getElementById('sessionActionModal').style.display = 'none';
    pendingSessionAction = null;
}

async function viewSessionHistory(sessionId) {
    try {
        const response = await fetch(`/api/admin/sessions/${sessionId}/history`);
        const history = await response.json();
        
        const content = document.getElementById('sessionHistoryContent');
        
        if (history.length === 0) {
            content.innerHTML = '<p>No history available for this session.</p>';
        } else {
            content.innerHTML = history.map(item => {
                const date = new Date(item.created_at).toLocaleString();
                return `
                    <div class="history-item">
                        <span class="history-action ${item.action}">${item.action}</span>
                        <div class="history-details">
                            <div class="history-admin">By: ${item.admin_user}</div>
                            <div class="history-time">${date}</div>
                            ${item.reason ? `<div class="history-reason">"${item.reason}"</div>` : ''}
                            ${item.previous_status && item.new_status ? `<div class="history-transition">${item.previous_status} → ${item.new_status}</div>` : ''}
                        </div>
                    </div>
                `;
            }).join('');
        }
        
        document.getElementById('sessionHistoryModal').style.display = 'flex';
    } catch (error) {
        console.error('Error loading session history:', error);
        console.error('Error loading history');
    }
}

function closeSessionHistory() {
    document.getElementById('sessionHistoryModal').style.display = 'none';
}

async function loadPlatformStats() {
    try {
        const response = await fetch('/api/admin/dashboard/stats');
        const stats = await response.json();
        
        document.getElementById('platformStats').innerHTML = `
            <div class="stats-section">
                <h4>Session Overview</h4>
                <p>Total Sessions: ${stats.total_sessions || 0}</p>
                <p>Active: ${stats.active_sessions || 0}</p>
                <p>Closed: ${stats.closed_sessions || 0}</p>
                <p>Deleted: ${stats.deleted_sessions || 0}</p>
                <p>Recent (7 days): ${stats.recent_sessions || 0}</p>
            </div>
        `;
    } catch (error) {
        console.error('Error loading platform stats:', error);
    }
}

// Event Listeners for modals
document.getElementById('cancelActionBtn').addEventListener('click', closeSessionActionModal);
document.getElementById('confirmActionBtn').addEventListener('click', confirmSessionAction);
document.getElementById('closeHistoryBtn').addEventListener('click', closeSessionHistory);

// Utility functions
// Toast notifications removed - using console logging instead

function showLoading(message = 'Loading...') {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingMessage = document.getElementById('loadingMessage');
    
    loadingMessage.textContent = message;
    loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function downloadReport() {
    const reportContent = document.getElementById('reportContent');
    const sessionTitle = currentSession ? currentSession.title : 'Session';
    
    // Simple HTML export - in production you might want PDF generation
    const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>${sessionTitle} - Analysis Report</title>
            <style>
                body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
                .stat-card { display: inline-block; margin: 10px; padding: 15px; border: 1px solid #ddd; border-radius: 8px; }
                .analysis-section { margin: 20px 0; }
                .theme-item, .conflict-item, .agreement-item { margin: 10px 0; padding: 10px; border-left: 3px solid #667eea; background: #f8f9fa; }
            </style>
        </head>
        <body>
            <h1>${sessionTitle} - Analysis Report</h1>
            <p>Generated on ${new Date().toLocaleString()}</p>
            ${reportContent.innerHTML}
        </body>
        </html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${sessionTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_analysis_report.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('Report downloaded successfully');
}

// Mobile-specific optimizations
function initializeMobileOptimizations() {
    // Detect mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isTouch = 'ontouchstart' in window;
    
    if (isMobile || isTouch) {
        document.body.classList.add('mobile-device');
        
        // Add touch feedback for all buttons
        addTouchFeedback();
        
        // Optimize scrolling
        optimizeScrolling();
        
        // Handle mobile keyboard
        handleMobileKeyboard();
        
        // Optimize mobile navigation
        optimizeMobileNavigation();
        
        // Enhance QR scanner
        enhanceMobileQRScanner();
    }
}

function addTouchFeedback() {
    // Add touch feedback to all interactive elements
    const interactiveElements = document.querySelectorAll('.btn, .card, .table-card, .admin-session-card, .qr-code-card');
    
    interactiveElements.forEach(element => {
        element.addEventListener('touchstart', function() {
            this.style.transform = 'scale(0.98)';
            this.style.transition = 'transform 0.1s ease';
        });
        
        element.addEventListener('touchend', function() {
            setTimeout(() => {
                this.style.transform = '';
                this.style.transition = 'all var(--transition-fast)';
            }, 100);
        });
        
        element.addEventListener('touchcancel', function() {
            this.style.transform = '';
            this.style.transition = 'all var(--transition-fast)';
        });
    });
}

function optimizeScrolling() {
    // Smooth scrolling for mobile
    document.documentElement.style.scrollBehavior = 'smooth';
    
    // Optimize scroll performance
    const scrollElements = document.querySelectorAll('.admin-sessions-list, .session-history');
    scrollElements.forEach(element => {
        element.style.webkitOverflowScrolling = 'touch';
        element.style.overscrollBehavior = 'contain';
    });
}

function handleMobileKeyboard() {
    // Handle viewport changes when mobile keyboard appears
    const viewport = document.querySelector('meta[name=viewport]');
    
    // Detect if keyboard is open
    function handleViewportChange() {
        if (window.visualViewport) {
            const { height } = window.visualViewport;
            const screenHeight = window.screen.height;
            
            if (height < screenHeight * 0.75) {
                document.body.classList.add('keyboard-open');
            } else {
                document.body.classList.remove('keyboard-open');
            }
        }
    }
    
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', handleViewportChange);
    }
    
    // Prevent zoom on input focus
    const inputs = document.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.addEventListener('focus', () => {
            if (viewport) {
                viewport.setAttribute('content', 
                    'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=0');
            }
        });
        
        input.addEventListener('blur', () => {
            if (viewport) {
                viewport.setAttribute('content', 
                    'width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=1');
            }
        });
    });
}

function optimizeMobileNavigation() {
    // Add swipe gestures for navigation
    let startX = 0;
    let startY = 0;
    const threshold = 100;
    
    document.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    });
    
    document.addEventListener('touchend', (e) => {
        if (!startX || !startY) return;
        
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        
        const deltaX = endX - startX;
        const deltaY = endY - startY;
        
        // Only process horizontal swipes
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > threshold) {
            // Swipe right - go back
            if (deltaX > 0 && document.querySelectorAll('.screen.active .btn-secondary').length > 0) {
                const backButton = document.querySelector('.screen.active .btn-secondary');
                if (backButton && backButton.textContent.toLowerCase().includes('back')) {
                    backButton.click();
                }
            }
        }
        
        startX = 0;
        startY = 0;
    });
}

// Enhanced mobile QR scanner with better camera handling
function enhanceMobileQRScanner() {
    const qrScanBtn = document.getElementById('qrScanBtn');
    const mobileScanner = document.getElementById('mobileScanner');
    const qrVideo = document.getElementById('qrVideo');
    
    if (qrScanBtn && mobileScanner && qrVideo) {
        qrScanBtn.addEventListener('click', async () => {
            try {
                // Request camera permission with mobile-optimized constraints
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        facingMode: 'environment', // Back camera
                        width: { ideal: 640 },
                        height: { ideal: 480 }
                    }
                });
                
                qrVideo.srcObject = stream;
                mobileScanner.style.display = 'flex';
                
                // Add scanner overlay
                addScannerOverlay();
                
                // Add haptic feedback if available
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
                
            } catch (error) {
                console.error('Camera access failed:', error);
                console.error('Camera access denied. Please enable camera permissions.');
            }
        });
    }
}

function addScannerOverlay() {
    const scannerViewfinder = document.querySelector('.scanner-viewfinder');
    if (!scannerViewfinder || scannerViewfinder.querySelector('.scan-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.className = 'scan-overlay';
    overlay.innerHTML = `
        <div class="scan-line"></div>
        <div class="scan-corners">
            <div class="corner top-left"></div>
            <div class="corner top-right"></div>
            <div class="corner bottom-left"></div>
            <div class="corner bottom-right"></div>
        </div>
    `;
    
    // Add overlay styles
    const style = document.createElement('style');
    style.textContent = `
        .scan-overlay {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
        }
        
        .scan-line {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, var(--primary-color), transparent);
            animation: scan 2s linear infinite;
        }
        
        @keyframes scan {
            0% { top: 0; }
            100% { top: 100%; }
        }
        
        .scan-corners {
            position: absolute;
            top: 20px;
            left: 20px;
            right: 20px;
            bottom: 20px;
        }
        
        .corner {
            position: absolute;
            width: 30px;
            height: 30px;
            border: 3px solid var(--primary-color);
        }
        
        .corner.top-left {
            top: 0;
            left: 0;
            border-right: none;
            border-bottom: none;
        }
        
        .corner.top-right {
            top: 0;
            right: 0;
            border-left: none;
            border-bottom: none;
        }
        
        .corner.bottom-left {
            bottom: 0;
            left: 0;
            border-right: none;
            border-top: none;
        }
        
        .corner.bottom-right {
            bottom: 0;
            right: 0;
            border-left: none;
            border-top: none;
        }
    `;
    document.head.appendChild(style);
    
    scannerViewfinder.style.position = 'relative';
    scannerViewfinder.appendChild(overlay);
}

// Media Upload Functions
function openMediaUpload() {
    if (!currentSession || !currentTable) {
        alert('Please join a table first before uploading media.');
        return;
    }
    
    document.getElementById('mediaFileInput').click();
}

async function handleMediaFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file type
    const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/ogg', 'audio/webm',
                       'video/mp4', 'video/webm', 'video/ogg', 'video/mov', 'video/avi'];
    const validExtensions = ['.mp3', '.wav', '.mp4', '.m4a', '.webm', '.ogg', '.mov', '.avi'];
    
    const isValidType = validTypes.some(type => file.type.startsWith(type)) || 
                       validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
    
    if (!isValidType) {
        alert('Please select a valid audio or video file (MP3, WAV, MP4, M4A, WebM, OGG, MOV, AVI).');
        return;
    }
    
    // Check file size (limit to 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
        alert('File size too large. Please select a file smaller than 100MB.');
        return;
    }
    
    await uploadMediaFile(file);
    
    // Clear the input
    event.target.value = '';
}

async function uploadMediaFile(file) {
    const formData = new FormData();
    formData.append('audio', file, file.name); // Using 'audio' field name to match existing endpoint
    
    const tableNumber = currentTable.table_number || currentTable.id;
    
    // Show upload progress
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadFileName = document.getElementById('uploadFileName');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    
    uploadFileName.textContent = file.name;
    uploadStatus.textContent = 'Preparing...';
    uploadProgressBar.style.width = '0%';
    uploadProgress.style.display = 'block';
    
    try {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                uploadProgressBar.style.width = percentComplete + '%';
                uploadStatus.textContent = `Uploading... ${Math.round(percentComplete)}%`;
            }
        });
        
        // Handle completion
        const uploadPromise = new Promise((resolve, reject) => {
            xhr.onload = () => {
                if (xhr.status === 200) {
                    resolve(JSON.parse(xhr.responseText));
                } else {
                    reject(new Error(`Upload failed: ${xhr.statusText}`));
                }
            };
            
            xhr.onerror = () => reject(new Error('Network error during upload'));
        });
        
        // Start upload
        xhr.open('POST', `/api/sessions/${currentSession.id}/tables/${tableNumber}/upload-audio`);
        xhr.send(formData);
        
        uploadStatus.textContent = 'Processing...';
        
        const result = await uploadPromise;
        
        uploadProgressBar.style.width = '100%';
        uploadStatus.textContent = 'Upload complete! Processing transcription...';
        
        console.log('Media uploaded successfully!');
        
        // Update recording status
        updateRecordingStatus({ status: 'processing', timestamp: new Date() });
        
        // Hide upload progress after 3 seconds
        setTimeout(() => {
            uploadProgress.style.display = 'none';
        }, 3000);
        
    } catch (error) {
        console.error('Error uploading media:', error);
        uploadStatus.textContent = 'Upload failed. Please try again.';
        uploadProgressBar.style.width = '0%';
        
        // Hide upload progress after 5 seconds
        setTimeout(() => {
            uploadProgress.style.display = 'none';
        }, 5000);
    }
}

// Settings Functions
function toggleApiKeyVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁️';
    }
}

async function updateApiKeys() {
    const deepgramKey = document.getElementById('deepgramApiKey').value;
    const groqKey = document.getElementById('groqApiKey').value;
    
    if (!deepgramKey && !groqKey) {
        alert('Please enter at least one API key.');
        return;
    }
    
    showLoading('Updating API keys...');
    
    try {
        const response = await fetch('/api/admin/settings/api-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                deepgram_api_key: deepgramKey || null,
                groq_api_key: groqKey || null
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('API keys updated successfully!');
            
            // Update configuration status
            updateConfigurationStatus();
            
            // Clear form
            document.getElementById('deepgramApiKey').value = '';
            document.getElementById('groqApiKey').value = '';
            
        } else {
            const error = await response.json();
            alert(`Failed to update API keys: ${error.error}`);
        }
    } catch (error) {
        console.error('Error updating API keys:', error);
        alert('Error updating API keys. Please try again.');
    } finally {
        hideLoading();
    }
}

async function testApiKeys() {
    showLoading('Testing API connections...');
    
    try {
        const response = await fetch('/api/admin/settings/test-apis');
        const result = await response.json();
        
        let message = 'API Test Results:\n\n';
        
        if (result.deepgram) {
            message += `Deepgram: ${result.deepgram.status === 'success' ? '✅ Connected' : '❌ Failed'}\n`;
            if (result.deepgram.error) {
                message += `  Error: ${result.deepgram.error}\n`;
            }
        }
        
        if (result.groq) {
            message += `Groq: ${result.groq.status === 'success' ? '✅ Connected' : '❌ Failed'}\n`;
            if (result.groq.error) {
                message += `  Error: ${result.groq.error}\n`;
            }
        }
        
        alert(message);
        
        // Update system health indicators
        updateSystemHealthStatus(result);
        
    } catch (error) {
        console.error('Error testing APIs:', error);
        alert('Error testing API connections. Please try again.');
    } finally {
        hideLoading();
    }
}

async function changeAdminPassword() {
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        alert('Please fill in all password fields.');
        return;
    }
    
    if (newPassword !== confirmPassword) {
        alert('New passwords do not match.');
        return;
    }
    
    if (newPassword.length < 8) {
        alert('New password must be at least 8 characters long.');
        return;
    }
    
    if (!/(?=.*[a-zA-Z])(?=.*\d)/.test(newPassword)) {
        alert('New password must contain both letters and numbers.');
        return;
    }
    
    showLoading('Changing admin password...');
    
    try {
        const response = await fetch('/api/admin/settings/change-password', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                currentPassword: currentPassword,
                newPassword: newPassword
            })
        });
        
        if (response.ok) {
            alert('Admin password changed successfully!');
            
            // Clear form
            document.getElementById('currentPassword').value = '';
            document.getElementById('newPassword').value = '';
            document.getElementById('confirmPassword').value = '';
            
        } else {
            const error = await response.json();
            alert(`Failed to change password: ${error.error}`);
        }
    } catch (error) {
        console.error('Error changing password:', error);
        alert('Error changing password. Please try again.');
    } finally {
        hideLoading();
    }
}

async function loadPlatformProtectionSettings() {
    try {
        const response = await fetch('/api/admin/settings/platform-protection');
        if (response.ok) {
            const settings = await response.json();
            
            const enabledCheckbox = document.getElementById('platformPasswordEnabled');
            const passwordInput = document.getElementById('platformPassword');
            const passwordRow = document.getElementById('platformPasswordRow');
            
            enabledCheckbox.checked = settings.enabled;
            passwordInput.value = settings.password || 'testtesttest';
            passwordRow.style.display = settings.enabled ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Error loading platform protection settings:', error);
    }
}

async function savePlatformProtection() {
    const enabled = document.getElementById('platformPasswordEnabled').checked;
    let password = document.getElementById('platformPassword').value.trim();
    
    // Use default password if none provided and protection is enabled
    if (enabled && !password) {
        password = 'testtesttest';
        document.getElementById('platformPassword').value = password;
    }
    
    if (enabled && password.length < 6) {
        alert('Platform password must be at least 6 characters long.');
        return;
    }
    
    showLoading('Saving platform protection settings...');
    
    try {
        const response = await fetch('/api/admin/settings/platform-protection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                enabled: enabled,
                password: password || 'testtesttest'
            })
        });
        
        if (response.ok) {
            alert('Platform protection settings saved successfully!');
        } else {
            const error = await response.json();
            alert(`Failed to save settings: ${error.error}`);
        }
    } catch (error) {
        console.error('Error saving platform protection:', error);
        alert('Error saving settings. Please try again.');
    } finally {
        hideLoading();
    }
}

async function loadSettingsData() {
    try {
        // Load current configuration status
        updateConfigurationStatus();
        
        // Load platform protection settings
        loadPlatformProtectionSettings();
        
        // Setup platform protection toggle
        const platformToggle = document.getElementById('platformPasswordEnabled');
        if (platformToggle) {
            platformToggle.addEventListener('change', function() {
                const passwordRow = document.getElementById('platformPasswordRow');
                const passwordInput = document.getElementById('platformPassword');
                if (this.checked) {
                    passwordRow.style.display = 'block';
                    // Set default password if empty
                    if (!passwordInput.value.trim()) {
                        passwordInput.value = 'testtesttest';
                    }
                } else {
                    passwordRow.style.display = 'none';
                }
            });
        }
        
        // Test current API status
        const response = await fetch('/api/admin/settings/status');
        if (response.ok) {
            const status = await response.json();
            updateSystemHealthStatus(status);
        }
    } catch (error) {
        console.error('Error loading settings data:', error);
    }
}

function updateConfigurationStatus() {
    // This would typically check if API keys are configured
    // For now, we'll check if the services are working
    fetch('/api/admin/settings/status')
        .then(response => response.json())
        .then(status => {
            const deepgramStatus = document.getElementById('deepgramConfigStatus');
            const groqStatus = document.getElementById('groqConfigStatus');
            
            if (status.apis && status.apis.deepgram && status.apis.deepgram.configured) {
                deepgramStatus.textContent = 'Configured';
                deepgramStatus.className = 'config-status-badge configured';
            } else {
                deepgramStatus.textContent = 'Not Configured';
                deepgramStatus.className = 'config-status-badge';
            }
            
            if (status.apis && status.apis.groq && status.apis.groq.configured) {
                groqStatus.textContent = 'Configured';
                groqStatus.className = 'config-status-badge configured';
            } else {
                groqStatus.textContent = 'Not Configured';
                groqStatus.className = 'config-status-badge';
            }
        })
        .catch(error => {
            console.error('Error updating configuration status:', error);
        });
}

function updateSystemHealthStatus(status) {
    const deepgramHealth = document.getElementById('deepgramStatus');
    const groqHealth = document.getElementById('groqStatus');
    
    if (status.deepgram) {
        if (status.deepgram.status === 'success') {
            deepgramHealth.textContent = '✓ Available';
            deepgramHealth.className = 'health-status connected';
        } else {
            deepgramHealth.textContent = '✗ Unavailable';
            deepgramHealth.className = 'health-status error';
        }
    }
    
    if (status.groq) {
        if (status.groq.status === 'success') {
            groqHealth.textContent = '✓ Available';
            groqHealth.className = 'health-status connected';
        } else {
            groqHealth.textContent = '✗ Unavailable';
            groqHealth.className = 'health-status error';
        }
    }
}

// Note: Initialization already handled by the main DOMContentLoaded listener above