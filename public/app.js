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
            
            // Always display with speaker diarization (even for single speaker)
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
    console.log('[DEBUG] handleURLParams called');
    console.log('[DEBUG] Current URL:', window.location.href);
    console.log('[DEBUG] Search string:', window.location.search);
    
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session');
    const tableId = urlParams.get('table');
    
    console.log('[DEBUG] Parsed URL params:', { sessionId, tableId });

    if (sessionId) {
        console.log('[DEBUG] Session ID found, proceeding with auto-join');
        // Auto-load session from QR code
        setTimeout(async () => {
            try {
                if (tableId) {
                    console.log(`[DEBUG] Attempting to join table ${tableId} in session ${sessionId}`);
                    await joinSpecificTable(sessionId, tableId);
                } else {
                    console.log(`[DEBUG] Attempting to load session ${sessionId}`);
                    await loadSpecificSession(sessionId);
                }
                console.log('[DEBUG] URL param handling completed successfully');
            } catch (error) {
                console.error('[DEBUG] Error handling URL params:', error);
                console.error('[DEBUG] Error stack:', error.stack);
                alert(`Unable to join session/table. The session may not exist or may have expired.\nError: ${error.message}`);
                showWelcome();
            }
        }, 1000);
    } else {
        console.log('[DEBUG] No session ID in URL params');
    }
}

// Socket.IO initialization
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        if (window.logger) {
            logger.logUserAction('socket_connected', { timestamp: new Date() });
        }
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
        console.log('📝 Received transcription-completed event:', data);
        displayTranscription(data);
        updateTableTranscriptionCount(data.tableId);
    });
}

// Enhanced Event listeners
function setupEventListeners() {
    // Helper function to safely set event listeners
    function safeSetEventListener(elementId, event, handler) {
        const element = document.getElementById(elementId);
        if (element) {
            if (event === 'onclick') {
                element.onclick = handler;
            } else if (event === 'onsubmit') {
                element.onsubmit = handler;
            } else if (event === 'onchange') {
                element.onchange = handler;
            } else {
                element.addEventListener(event.replace('on', ''), handler);
            }
        } else {
            console.warn(`Element with ID '${elementId}' not found, skipping event listener setup`);
        }
    }
    
    // Navigation
    safeSetEventListener('homeBtn', 'onclick', function() { closeMobileMenu(); showWelcome(); });
    safeSetEventListener('createSessionBtn', 'onclick', function() { closeMobileMenu(); showCreateSession(); });
    safeSetEventListener('adminBtn', 'onclick', function() { closeMobileMenu(); showAdminDashboard(); });
    safeSetEventListener('mobileMenuToggle', 'onclick', toggleMobileMenu);
    
    // Forms
    safeSetEventListener('createSessionForm', 'onsubmit', createSession);
    safeSetEventListener('sessionSelect', 'onchange', loadSessionTables);
    
    // Join Wizard functionality
    setupJoinWizard();
    
    // Enhanced form interactions
    setupFormValidation();
    
    // Table joining
    safeSetEventListener('joinTableBtn', 'onclick', joinTable);
    safeSetEventListener('joinThisTableBtn', 'onclick', joinCurrentTable);
    
    // Recording controls
    safeSetEventListener('startRecordingBtn', 'onclick', startRecording);
    safeSetEventListener('stopRecordingBtn', 'onclick', stopRecording);
    safeSetEventListener('uploadMediaBtn', 'onclick', openMediaUpload);
    safeSetEventListener('mediaFileInput', 'onchange', handleMediaFileUpload);
    safeSetEventListener('generateReportBtn', 'onclick', generateAnalysis);
    
    // QR Code functionality
    safeSetEventListener('showQRCodesBtn', 'onclick', showQRCodes);
    safeSetEventListener('hideQRCodesBtn', 'onclick', hideQRCodes);
    safeSetEventListener('downloadAllQRBtn', 'onclick', downloadAllQRCodes);
    safeSetEventListener('printQRBtn', 'onclick', printQRCodes);
    
    // Mobile QR Scanner
    safeSetEventListener('closeScannerBtn', 'onclick', closeQRScanner);
    safeSetEventListener('manualJoinBtn', 'onclick', showManualJoin);
    safeSetEventListener('closeManualJoinBtn', 'onclick', closeManualJoin);
    safeSetEventListener('submitManualJoinBtn', 'onclick', submitManualJoin);
    
    // Handle manual code input with keypress
    const manualCodeInput = document.getElementById('manualCode');
    if (manualCodeInput) {
        manualCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                submitManualJoin();
            }
        });
    }
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
    console.log('showScreen called with:', screenId);
    
    const targetScreen = document.getElementById(screenId);
    if (!targetScreen) {
        console.error('Screen element not found:', screenId);
        throw new Error(`Screen element not found: ${screenId}`);
    }
    
    console.log('Target screen found:', targetScreen);
    
    // Hide all screens including our isolated join screen
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });
    
    // Also hide isolated screens specifically
    const joinScreen = document.getElementById('joinSessionScreen');
    if (joinScreen) {
        joinScreen.style.display = 'none';
    }
    const transcriptionsScreen = document.getElementById('allTranscriptionsScreen');
    if (transcriptionsScreen) {
        transcriptionsScreen.style.display = 'none';
    }
    const sessionDashboardScreen = document.getElementById('sessionDashboard');
    if (sessionDashboardScreen) {
        sessionDashboardScreen.style.display = 'none';
    }
    
    targetScreen.classList.add('active');
    targetScreen.style.display = 'block';
    
    console.log(`Screen activated: ${screenId}`);
    
    console.log('Screen activated:', screenId, 'has active class:', targetScreen.classList.contains('active'));
    
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
    
    // Hide isolated screens if they're showing
    const joinScreen = document.getElementById('joinSessionScreen');
    if (joinScreen) {
        joinScreen.style.display = 'none';
    }
    const transcriptionsScreen = document.getElementById('allTranscriptionsScreen');
    if (transcriptionsScreen) {
        transcriptionsScreen.style.display = 'none';
    }
    const sessionDashboardScreen = document.getElementById('sessionDashboard');
    if (sessionDashboardScreen) {
        sessionDashboardScreen.style.display = 'none';
    }
    
    showScreen('welcomeScreen');
}

function showCreateSession() {
    showScreen('createSessionScreen');
}

function showJoinSession() {
    loadActiveSessions();
    
    // Hide all other screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
        screen.style.display = 'none';
    });
    
    // Show the completely isolated join screen
    const joinScreen = document.getElementById('joinSessionScreen');
    if (joinScreen) {
        joinScreen.style.display = 'block';
        console.log('Join session screen activated with isolated styles');
    }
    
    // Reset to step 1
    goToStep(1);
}

function showSessionList() {
    loadActiveSessions();
    
    // Hide isolated screens
    const joinScreen = document.getElementById('joinSessionScreen');
    if (joinScreen) {
        joinScreen.style.display = 'none';
    }
    const transcriptionsScreen = document.getElementById('allTranscriptionsScreen');
    if (transcriptionsScreen) {
        transcriptionsScreen.style.display = 'none';
    }
    const sessionDashboardScreen = document.getElementById('sessionDashboard');
    if (sessionDashboardScreen) {
        sessionDashboardScreen.style.display = 'none';
    }
    
    showScreen('sessionListScreen');
}

function showSessionDashboard() {
    if (currentSession) {
        loadSessionDashboard(currentSession.id);
        
        console.log('Showing isolated session dashboard...');
        // Hide all other screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
            screen.style.display = 'none';
        });
        
        // Hide isolated screens
        const joinScreen = document.getElementById('joinSessionScreen');
        if (joinScreen) {
            joinScreen.style.display = 'none';
        }
        const transcriptionsScreen = document.getElementById('allTranscriptionsScreen');
        if (transcriptionsScreen) {
            transcriptionsScreen.style.display = 'none';
        }
        
        // Show the completely isolated session dashboard screen
        const dashboardScreen = document.getElementById('sessionDashboard');
        if (dashboardScreen) {
            dashboardScreen.style.display = 'block';
            console.log('Session dashboard activated with isolated styles');
        }
    } else {
        alert('No session selected');
    }
}

function showTableInterface(tableId) {
    if (currentSession && currentSession.tables) {
        currentTable = currentSession.tables.find(t => t.id === tableId || t.table_number === tableId);
        if (currentTable) {
            setupTableInterface();
            
            // Nuclear isolation approach - hide all other screens
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
                screen.style.display = 'none';
            });
            
            // Hide isolated screens
            const sessionDashboard = document.getElementById('sessionDashboard');
            if (sessionDashboard) {
                sessionDashboard.style.display = 'none';
            }
            const joinScreen = document.getElementById('joinSessionScreen');
            if (joinScreen) {
                joinScreen.style.display = 'none';
            }
            
            // Show table interface
            const tableInterface = document.getElementById('tableInterface');
            if (tableInterface) {
                tableInterface.style.display = 'block';
            }
        }
    }
}

function backToSession() {
    if (currentSession) {
        // Hide table interface
        const tableInterface = document.getElementById('tableInterface');
        if (tableInterface) {
            tableInterface.style.display = 'none';
        }
        
        // Show session dashboard
        const sessionDashboard = document.getElementById('sessionDashboard');
        if (sessionDashboard) {
            sessionDashboard.style.display = 'block';
        }
        
        loadSessionDashboard(currentSession.id);
    } else {
        showWelcome();
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

// Join Session QR Scanner - enhanced version for join session context
function showJoinQRScanner() {
    console.log('QR scanning works best on mobile devices');
    const scanner = document.getElementById('mobileScanner');
    if (scanner) {
        // Update scanner title for join session context
        const scannerTitle = scanner.querySelector('h3');
        const scannerDescription = scanner.querySelector('p');
        if (scannerTitle) scannerTitle.textContent = 'Scan QR Code';
        if (scannerDescription) scannerDescription.textContent = 'Point camera at session QR code';
        
        scanner.style.display = 'flex';
        initializeQRScanner();
    }
}

// Duplicate quickJoinSession function removed - using quickJoinWithCode from Step 1 instead

// Old duplicate function removed - using proper backend API now

// Join Wizard Management
let currentJoinMethod = null;
let currentWizardStep = 1;
let selectedSessionData = null;
let selectedTableId = null;

function setupJoinWizard() {
    // Reset wizard on join session screen show
    const joinScreen = document.getElementById('joinSessionScreen');
    if (joinScreen) {
        const observer = new MutationObserver(function(mutations) {
            mutations.forEach(function(mutation) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (joinScreen.classList.contains('active')) {
                        resetWizard();
                    }
                }
            });
        });
        observer.observe(joinScreen, { attributes: true });
    }
}

function resetWizard() {
    currentJoinMethod = null;
    currentWizardStep = 1;
    selectedSessionData = null;
    selectedTableId = null;
    
    // Reset progress steps - with null checks
    document.querySelectorAll('.progress-step').forEach(step => {
        if (step) step.classList.remove('active', 'completed');
    });
    const firstProgressStep = document.querySelector('.progress-step[data-step="1"]');
    if (firstProgressStep) firstProgressStep.classList.add('active');
    
    // Reset wizard steps - with null checks
    document.querySelectorAll('.wizard-step').forEach(step => {
        if (step) step.classList.remove('active');
    });
    const joinStep1 = document.getElementById('joinStep1');
    if (joinStep1) joinStep1.classList.add('active');
    
    // Reset method cards - with null checks
    document.querySelectorAll('.method-card').forEach(card => {
        if (card) card.classList.remove('selected');
    });
    
    // Clear form inputs - with null checks
    const inputs = ['sessionCodeInput'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });
}

function selectJoinMethod(method) {
    currentJoinMethod = method;
    
    // Update method card selection
    document.querySelectorAll('.method-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`[data-method="${method}"]`).classList.add('selected');
    
    // Proceed to step 2 after a short delay for visual feedback
    setTimeout(() => {
        if (method === 'code') {
            goToStep(2, 'code');
        } else if (method === 'browse') {
            goToStep(2, 'browse');
        }
    }, 300);
}

function goToStep(step, method = null) {
    if (method) currentJoinMethod = method;
    currentWizardStep = step;
    
    // Hide all steps
    const steps = ['joinStep1', 'joinStep2Browse', 'joinStep3'];
    steps.forEach(stepId => {
        const stepElement = document.getElementById(stepId);
        if (stepElement) {
            stepElement.style.display = 'none';
        }
    });
    
    // Show appropriate step
    let targetStepId;
    if (step === 1) {
        targetStepId = 'joinStep1';
    } else if (step === 2) {
        targetStepId = 'joinStep2Browse'; // Code input is now handled directly in Step 1
        
        // Load sessions for browse method
        if (currentJoinMethod === 'browse') {
            loadSessionsForBrowse();
        }
    } else if (step === 3) {
        targetStepId = 'joinStep3';
        loadTablesForStep3();
    }
    
    // Show the target step
    const targetStep = document.getElementById(targetStepId);
    if (targetStep) {
        targetStep.style.display = 'block';
        console.log(`Showing step: ${targetStepId}`);
    }
}

function updateProgressSteps(activeStep) {
    // Only update if progress steps exist (they were removed from HTML)
    const progressSteps = document.querySelectorAll('.progress-step');
    if (progressSteps.length > 0) {
        progressSteps.forEach((step, index) => {
            const stepNumber = index + 1;
            if (step) {
                step.classList.remove('active', 'completed');
                
                if (stepNumber < activeStep) {
                    step.classList.add('completed');
                } else if (stepNumber === activeStep) {
                    step.classList.add('active');
                }
            }
        });
    }
}

async function loadSessionsForBrowse() {
    const sessionSelect = document.getElementById('sessionSelect');
    try {
        const response = await fetch('/api/sessions');
        if (!response.ok) throw new Error('Failed to load sessions');
        
        const sessions = await response.json();
        const activeSessions = sessions.filter(session => session.status === 'active');
        
        sessionSelect.innerHTML = activeSessions.length > 0 
            ? '<option value="">Select a session...</option>' + 
              activeSessions.map(session => 
                `<option value="${session.id}">${session.title}</option>`
              ).join('')
            : '<option value="">No active sessions available</option>';
            
    } catch (error) {
        console.error('Error loading sessions:', error);
        sessionSelect.innerHTML = '<option value="">Error loading sessions</option>';
    }
}

function handleSessionSelection() {
    const sessionSelect = document.getElementById('sessionSelect');
    
    console.log('Session selection changed:', sessionSelect.value);
    
    if (sessionSelect.value) {
        // Store selected session data
        const selectedOption = sessionSelect.options[sessionSelect.selectedIndex];
        selectedSessionData = {
            id: sessionSelect.value,
            title: selectedOption.textContent
        };
        
        console.log('Selected session data set:', selectedSessionData);
        
        // Auto-advance to table selection step after short delay for visual feedback
        setTimeout(() => {
            goToStep(3);
        }, 500);
    } else {
        selectedSessionData = null;
    }
}

async function loadTablesForStep3() {
    console.log('loadTablesForStep3 called, selectedSessionData:', selectedSessionData);
    
    if (!selectedSessionData) {
        console.error('selectedSessionData is null');
        document.getElementById('tableSelection').innerHTML = '<p>No session selected. Please go back and select a session.</p>';
        return;
    }
    
    // Update session info card
    const sessionInfoCard = document.getElementById('selectedSessionInfo');
    sessionInfoCard.innerHTML = `
        <h4>${selectedSessionData.title}</h4>
        <p>Select an available table to join</p>
    `;
    
    // Load tables
    const tableSelection = document.getElementById('tableSelection');
    tableSelection.innerHTML = '<p>Loading tables...</p>';
    
    try {
        console.log('Fetching session with tables:', selectedSessionData.id);
        const response = await fetch(`/api/sessions/${selectedSessionData.id}`);
        console.log('Session response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Session response error:', errorText);
            throw new Error(`Failed to load session: ${response.status} ${response.statusText}`);
        }
        
        const sessionData = await response.json();
        const tables = sessionData.tables || [];
        console.log('Tables loaded:', tables);
        
        if (!tables || tables.length === 0) {
            tableSelection.innerHTML = '<p>No tables available for this session.</p>';
            return;
        }
        
        tableSelection.innerHTML = tables.map(table => {
            const currentParticipants = table.current_participants || 0;
            const maxSize = table.max_size || 10;
            const isFull = currentParticipants >= maxSize;
            
            return `
                <div class="table-card" 
                     onclick="${isFull ? '' : `selectTable(${table.id})`}" 
                     data-table-id="${table.id}"
                     style="
                         display: inline-block;
                         width: 140px;
                         height: 100px;
                         margin: 8px;
                         padding: 16px;
                         background: ${isFull ? '#f5f5f5' : 'white'};
                         border: 2px solid ${isFull ? '#ccc' : '#e0e0e0'};
                         border-radius: 8px;
                         cursor: ${isFull ? 'not-allowed' : 'pointer'};
                         text-align: center;
                         box-sizing: border-box;
                         opacity: ${isFull ? '0.6' : '1'};
                         transition: all 0.2s ease;
                     "
                     ${!isFull ? `onmouseover="this.style.borderColor='#007bff'; this.style.transform='translateY(-2px)'" onmouseout="if(!this.classList.contains('selected')) { this.style.borderColor='#e0e0e0'; this.style.transform='translateY(0)'; }"` : ''}>
                    <h5 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600; color: ${isFull ? '#999' : '#333'};">Table ${table.table_number}</h5>
                    <p style="margin: 0 0 4px 0; font-size: 12px; color: ${isFull ? '#999' : '#666'};">${currentParticipants}/${maxSize} participants</p>
                    ${table.name ? `<p style="margin: 0; font-size: 11px; color: ${isFull ? '#999' : '#888'};">${table.name}</p>` : ''}
                    ${isFull ? '<p style="margin: 4px 0 0 0; font-size: 10px; color: #ff6b6b; font-weight: 600;">FULL</p>' : ''}
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Error loading tables:', error);
        tableSelection.innerHTML = `<p>Error loading tables: ${error.message}</p>`;
    }
}

function selectTable(tableId) {
    // Check if clicking the same table to unselect it
    if (selectedTableId === tableId) {
        // Unselect the table
        selectedTableId = null;
        
        // Reset all table cards to unselected state
        document.querySelectorAll('.table-card').forEach(card => {
            card.classList.remove('selected');
            card.style.borderColor = '#e0e0e0';
            card.style.background = 'white';
            card.style.transform = 'translateY(0)';
        });
        
        // Disable final join button
        const finalJoinBtn = document.getElementById('finalJoinBtn');
        if (finalJoinBtn) {
            finalJoinBtn.disabled = true;
            finalJoinBtn.style.opacity = '0.5';
            finalJoinBtn.style.cursor = 'not-allowed';
        }
        return;
    }
    
    // Select new table
    selectedTableId = tableId;
    
    // Update table selection visuals
    document.querySelectorAll('.table-card').forEach(card => {
        card.classList.remove('selected');
        // Reset all cards to normal state first
        card.style.borderColor = '#e0e0e0';
        card.style.background = 'white';
        card.style.transform = 'translateY(0)';
    });
    
    // Highlight selected card
    const selectedCard = document.querySelector(`[data-table-id="${tableId}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
        selectedCard.style.borderColor = '#007bff';
        selectedCard.style.background = '#f0f8ff';
        selectedCard.style.transform = 'translateY(-2px)';
    }
    
    // Enable final join button
    const finalJoinBtn = document.getElementById('finalJoinBtn');
    if (finalJoinBtn) {
        finalJoinBtn.disabled = false;
        finalJoinBtn.style.opacity = '1';
        finalJoinBtn.style.cursor = 'pointer';
    }
}

async function finalJoinTable() {
    if (!selectedSessionData || !selectedTableId) return;
    
    const participantName = 'Anonymous'; // Name form removed
    
    const finalJoinBtn = document.getElementById('finalJoinBtn');
    const originalText = finalJoinBtn.innerHTML;
    finalJoinBtn.innerHTML = '<span>Joining...</span>';
    finalJoinBtn.disabled = true;
    
    try {
        console.log('Starting join process...', {sessionId: selectedSessionData.id, tableId: selectedTableId, participantName});
        await joinTableWithDetails(selectedSessionData.id, selectedTableId, participantName);
        console.log('Join successful, showing success message');
        showToast('Successfully joined the session!', 'success');
        
        // Log successful table join
        if (window.logger) {
            logger.logTableEvent('table_joined', selectedTableId, selectedSessionData.id, {
                sessionTitle: selectedSessionData.title,
                participantName
            });
        }
        // Reset button state in case the screen transition fails
        finalJoinBtn.innerHTML = originalText;
        finalJoinBtn.disabled = false;
    } catch (error) {
        console.error('Error joining table:', error);
        showToast(error.message || 'Failed to join table', 'error');
        
        // Log join error
        if (window.logger) {
            logger.logError(error, {
                action: 'table_join_failed',
                sessionId: selectedSessionData?.id,
                tableId: selectedTableId
            });
        }
        finalJoinBtn.innerHTML = originalText;
        finalJoinBtn.disabled = false;
    }
}

async function joinTableWithDetails(sessionId, tableId, participantName) {
    console.log(`[DEBUG] joinTableWithDetails called with sessionId: ${sessionId}, tableId: ${tableId}, participantName: ${participantName}`);
    
    try {
        // Load session data
        console.log(`[DEBUG] Loading session data for ${sessionId}...`);
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
            throw new Error('Session not found or unavailable');
        }
        
        const session = await response.json();
        console.log(`[DEBUG] Session loaded:`, session);
        
        // Find the specific table
        const table = session.tables?.find(t => t.id == tableId || t.table_number == tableId);
        if (!table) {
            throw new Error(`Table ${tableId} not found in session`);
        }
        
        // Join the table
        console.log(`[DEBUG] Joining table ${table.table_number}...`);
        const joinResponse = await fetch(`/api/sessions/${sessionId}/tables/${table.table_number}/join`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                participantName: participantName || 'Anonymous'
            })
        });
        
        if (!joinResponse.ok) {
            const error = await joinResponse.json();
            throw new Error(error.error || 'Failed to join table');
        }
        
        const joinResult = await joinResponse.json();
        console.log(`[DEBUG] Join successful:`, joinResult);
        
        // Set current session and table data
        currentSession = session;
        currentTable = table;
        
        // Navigate to the table view
        console.log(`[DEBUG] Navigating to table view...`);
        showScreen('tableInterface');
        
        return joinResult;
        
    } catch (error) {
        console.error('[DEBUG] Join table error:', error);
        throw error;
    }
}

// Join with session code (new unified function) - now supports both session and table codes
async function joinWithSessionCode() {
    const sessionCodeInput = document.getElementById('sessionCodeInput');
    const code = sessionCodeInput.value.trim();
    
    if (!code) {
        showToast('Please enter a session or table code', 'error');
        sessionCodeInput.focus();
        return;
    }
    
    const joinButton = sessionCodeInput.parentElement.querySelector('button');
    const originalText = joinButton.textContent;
    joinButton.textContent = 'Joining...';
    joinButton.disabled = true;
    
    try {
        const response = await fetch('/api/entry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code })
        });
        
        const result = await response.json();
        
        if (result.success) {
            sessionCodeInput.value = ''; // Clear on success
            
            // Handle different entry types with appropriate feedback and redirection
            switch (result.type) {
                case 'session':
                    showToast('Joining session...', 'success');
                    await loadSpecificSession(result.sessionId);
                    break;
                    
                case 'session_admin':
                    showToast('Joining session as admin...', 'success');
                    await loadSpecificSession(result.sessionId, true);
                    break;
                    
                case 'table':
                    showToast(`Joining Table ${result.tableNumber}...`, 'success');
                    await joinSpecificTable(result.sessionId, result.tableNumber);
                    break;
                    
                case 'table_password':
                    showToast(`Joining Table ${result.tableNumber}...`, 'success');
                    await joinSpecificTable(result.sessionId, result.tableNumber);
                    break;
                    
                default:
                    console.error('Unknown entry type:', result.type);
                    showToast('Unknown entry type. Please contact support.', 'error');
            }
        } else {
            showToast(result.error || 'Unable to join. Please check your code and try again.', 'error');
            sessionCodeInput.focus();
        }
    } catch (error) {
        console.error('Join error:', error);
        showToast('Connection error. Please check your internet connection and try again.', 'error');
        sessionCodeInput.focus();
    } finally {
        joinButton.textContent = originalText;
        joinButton.disabled = false;
    }
}

// QR Scanner functionality
function showJoinQRScanner() {
    // Check if camera is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera not available on this device', 'error');
        return;
    }
    
    // Check if HTTPS (required for camera access)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        showToast('QR scanning requires HTTPS for camera access', 'error');
        return;
    }
    
    // Create QR scanner modal
    const qrModal = document.createElement('div');
    qrModal.id = 'qrScannerModal';
    qrModal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.95);
        z-index: 15000;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;
    
    qrModal.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 20px;
            max-width: 400px;
            width: 90%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
        ">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3 style="margin: 0; color: #333; font-size: 18px;">Scan QR Code</h3>
                <button onclick="closeQRScanner()" style="
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                " onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='none'">×</button>
            </div>
            
            <div id="qrVideoContainer" style="
                position: relative;
                width: 100%;
                height: 250px;
                background: #f0f0f0;
                border-radius: 12px;
                overflow: hidden;
                margin-bottom: 16px;
            ">
                <video id="qrVideo" style="
                    width: 100%;
                    height: 100%;
                    object-fit: cover;
                "></video>
                <div id="qrOverlay" style="
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 200px;
                    height: 200px;
                    border: 3px solid #4A90E2;
                    border-radius: 12px;
                    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.3);
                "></div>
            </div>
            
            <p style="margin: 0 0 16px 0; color: #666; font-size: 14px;">
                Point your camera at a World Café QR code
            </p>
            
            <div style="display: flex; gap: 12px; justify-content: center;">
                <button onclick="closeQRScanner()" style="
                    background: #6c757d;
                    color: white;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                " onmouseover="this.style.background='#5a6268'" onmouseout="this.style.background='#6c757d'">
                    Cancel
                </button>
                
                <button onclick="closeQRScanner(); showBrowseJoin();" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                " onmouseover="this.style.transform='translateY(-1px)'" onmouseout="this.style.transform='translateY(0)'">
                    Browse Instead
                </button>
            </div>
        </div>
    `;
    
    document.body.appendChild(qrModal);
    
    // Start camera
    startQRCamera();
}

function closeQRScanner() {
    // Stop camera stream
    const video = document.getElementById('qrVideo');
    if (video && video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    
    // Remove modal
    const modal = document.getElementById('qrScannerModal');
    if (modal) {
        modal.remove();
    }
}

async function startQRCamera() {
    const video = document.getElementById('qrVideo');
    if (!video) return;
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment', // Use back camera if available
                width: { ideal: 1280 },
                height: { ideal: 720 }
            } 
        });
        
        video.srcObject = stream;
        video.play();
        
        // Start scanning
        startQRDetection();
        showToast('Camera started - point at QR code', 'info');
        
    } catch (error) {
        console.error('Camera access error:', error);
        
        if (error.name === 'NotAllowedError') {
            showToast('Camera access denied. Please allow camera permissions and try again.', 'error');
        } else if (error.name === 'NotFoundError') {
            showToast('No camera found on this device', 'error');
        } else {
            showToast('Failed to start camera. Make sure you\'re on HTTPS and have camera permissions.', 'error');
        }
        
        // Close scanner on error
        setTimeout(closeQRScanner, 3000);
    }
}

function startQRDetection() {
    const video = document.getElementById('qrVideo');
    if (!video) return;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    let scanning = true;
    
    const scanFrame = () => {
        if (!scanning || !video.videoWidth || !video.videoHeight) {
            if (scanning) {
                setTimeout(scanFrame, 100);
            }
            return;
        }
        
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const qrResult = detectQRPattern(imageData);
        
        if (qrResult) {
            scanning = false;
            closeQRScanner();
            processQRCode(qrResult);
            return;
        }
        
        // Continue scanning
        setTimeout(scanFrame, 100);
    };
    
    // Stop scanning when modal is closed
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.removedNodes.forEach((node) => {
                if (node.id === 'qrScannerModal') {
                    scanning = false;
                    observer.disconnect();
                }
            });
        });
    });
    
    observer.observe(document.body, { childList: true });
    
    scanFrame();
}

// Removed duplicate quickJoinSession function - using quickJoinWithCode instead

// Enhanced find and join by code with participant name - uses proper backend API
async function findAndJoinSessionByCode(sessionCode, participantName) {
    try {
        console.log('Attempting to join with code:', sessionCode);
        
        // Use the proper backend API that handles session codes correctly
        const response = await fetch(`/api/join/${encodeURIComponent(sessionCode)}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                participantName: participantName || 'Anonymous'
            })
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to join session');
        }
        
        const result = await response.json();
        console.log('Join result:', result);
        
        if (result.type === 'session_selection') {
            // Session found, load the session dashboard
            currentSession = result.session;
            socket.emit('join-session', result.session.id);
            
            // Hide join screen and show session dashboard
            const joinScreen = document.getElementById('joinSessionScreen');
            if (joinScreen) {
                joinScreen.style.display = 'none';
            }
            
            loadSessionDashboard(result.session.id);
            const sessionDashboard = document.getElementById('sessionDashboard');
            if (sessionDashboard) {
                sessionDashboard.style.display = 'block';
            }
        } else if (result.type === 'table_joined') {
            // Directly joined a table
            currentSession = result.session;
            currentTable = result.table;
            socket.emit('join-session', result.session.id);
            socket.emit('join-table', result.table.id);
            setupTableInterface();
            showScreen('tableInterface');
        }
        
    } catch (error) {
        console.error('Error in findAndJoinSessionByCode:', error);
        throw error;
    }
}

// Enhanced Form Validation and Interactions
function setupFormValidation() {
    // Session code input enhancements
    const sessionCodeInput = document.getElementById('sessionCodeInput');
    if (sessionCodeInput) {
        sessionCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                joinWithSessionCode();
            }
        });
        
        sessionCodeInput.addEventListener('input', function(e) {
            // Allow alphanumeric, hyphens, and forward slashes for table codes (sessionId/table/N)
            this.value = this.value.toLowerCase().replace(/[^a-z0-9-/]/g, '');
        });
        
        sessionCodeInput.addEventListener('paste', function(e) {
            setTimeout(() => {
                // Allow alphanumeric, hyphens, and forward slashes for table codes (sessionId/table/N)
                this.value = this.value.toLowerCase().replace(/[^a-z0-9-/]/g, '');
            }, 10);
        });
    }
    
    // Participant name inputs
    const participantInputs = []; // participantNameBrowse removed
    participantInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('input', function() {
                if (id === 'participantNameCode') {
                    validateSessionCodeStep();
                } else {
                    handleSessionSelection();
                }
            });
            
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    if (id === 'participantNameCode') {
                        quickJoinSession();
                    } else {
                        const continueBtn = document.getElementById('continueToTables');
                        if (!continueBtn.disabled) {
                            goToStep(3);
                        }
                    }
                }
            });
        }
    });
    
    // Session select for browse method
    const sessionSelect = document.getElementById('sessionSelect');
    if (sessionSelect) {
        sessionSelect.addEventListener('change', handleSessionSelection);
    }
}

// validateSessionCodeStep removed - duplicate functionality eliminated

// Add visual feedback for ready states
const style = document.createElement('style');
style.textContent = `
    .btn-wizard.ready {
        animation: pulse 2s infinite;
        box-shadow: 0 0 20px rgba(0, 0, 0, 0.3) !important;
    }
    
    @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.02); }
        100% { transform: scale(1); }
    }
    
    .floating-input.valid {
        border-color: #28a745 !important;
        box-shadow: 0 0 0 2px rgba(40, 167, 69, 0.2) !important;
    }
    
    .floating-input.invalid {
        border-color: #dc3545 !important;
        box-shadow: 0 0 0 2px rgba(220, 53, 69, 0.2) !important;
    }
`;
document.head.appendChild(style);

// Legacy function removed - now using unified submitManualJoin function later in file

// Session Management
async function createSession(event) {
    event.preventDefault();
    
    const title = document.getElementById('sessionTitle').value;
    const description = document.getElementById('sessionDescription').value;
    const language = document.getElementById('sessionLanguage').value;
    const tableCount = parseInt(document.getElementById('tableCount').value);
    
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
                tableCount
            }),
        });
        
        if (response.ok) {
            const session = await response.json();
            currentSession = session;
            
            // Add to local sessions array
            activeSessions.push(session);
            
            console.log(`Session "${title}" created successfully!`);
            
            // Show admin password to user
            if (session.admin_password) {
                alert(`Session created successfully!\n\nAdmin Password: ${session.admin_password}\n\nSave this password - you'll need it to manage this session. Participants can use this password to access the session with admin privileges.`);
            }
            
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
    // Clear search when repopulating
    const searchInput = document.getElementById('sessionsSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const searchResults = document.getElementById('searchResults');
    
    if (searchInput) {
        searchInput.value = '';
        clearBtn && (clearBtn.style.display = 'none');
        searchResults && (searchResults.style.display = 'none');
    }
    
    // Use the new filtered version
    populateSessionsListFiltered();
}

// Helper function to create language badge for session cards
function getSessionLanguageBadge(languageCode) {
    // Language code to display name mapping
    const languageMap = {
        'en': 'English',
        'es': 'Spanish', 
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'nl': 'Dutch',
        'pl': 'Polish',
        'ru': 'Russian',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'th': 'Thai',
        'vi': 'Vietnamese',
        'tr': 'Turkish',
        'sv': 'Swedish',
        'da': 'Danish',
        'no': 'Norwegian',
        'fi': 'Finnish'
    };
    
    // Language code to flag emoji mapping
    const flagMap = {
        'en': '🇬🇧',
        'es': '🇪🇸',
        'fr': '🇫🇷', 
        'de': '🇩🇪',
        'it': '🇮🇹',
        'pt': '🇵🇹',
        'nl': '🇳🇱',
        'pl': '🇵🇱',
        'ru': '🇷🇺',
        'zh': '🇨🇳',
        'ja': '🇯🇵',
        'ko': '🇰🇷',
        'ar': '🇸🇦',
        'hi': '🇮🇳',
        'th': '🇹🇭',
        'vi': '🇻🇳',
        'tr': '🇹🇷',
        'sv': '🇸🇪',
        'da': '🇩🇰',
        'no': '🇳🇴',
        'fi': '🇫🇮'
    };
    
    const displayName = languageMap[languageCode] || languageCode.toUpperCase();
    const flag = flagMap[languageCode] || '🌍';
    
    return `
        <div style="
            background: linear-gradient(135deg, #ff6b6b, #feca57);
            color: white;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 4px;
            box-shadow: 0 2px 6px rgba(255, 107, 107, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(5px);
            white-space: nowrap;
            flex-shrink: 0;
        " title="Session Language: ${displayName}">
            <span style="font-size: 12px;">${flag}</span>
            <span>${displayName}</span>
        </div>
    `;
}

// Enhanced version with search capability - Compact Design
function populateSessionsListFiltered(sessions = null) {
    const sessionsList = document.getElementById('sessionsList');
    const sessionsToShow = sessions || activeSessions;
    
    if (sessionsToShow.length === 0) {
        const searchValue = document.getElementById('sessionsSearchInput')?.value || '';
        if (searchValue.trim()) {
            sessionsList.innerHTML = `
                <div style="
                    grid-column: 1 / -1;
                    background: white;
                    border: 2px dashed #e0e0e0;
                    border-radius: 16px;
                    padding: 40px;
                    text-align: center;
                    color: #666;
                ">
                    <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                    <h3 style="margin: 0 0 12px 0; color: #333; font-size: 20px;">No Results Found</h3>
                    <p style="margin: 0 0 20px 0; font-size: 16px;">No sessions match "${searchValue}"</p>
                    <button onclick="clearSearch()" style="
                        background: #667eea;
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='#5a67d8'" onmouseout="this.style.background='#667eea'">
                        Clear Search
                    </button>
                </div>
            `;
        } else {
            sessionsList.innerHTML = `
                <div style="
                    grid-column: 1 / -1;
                    background: linear-gradient(135deg, #f8f9fa, #fff);
                    border: 2px dashed #e0e0e0;
                    border-radius: 16px;
                    padding: 40px;
                    text-align: center;
                    color: #666;
                ">
                    <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
                    <h3 style="margin: 0 0 12px 0; color: #333; font-size: 20px;">No Active Sessions</h3>
                    <p style="margin: 0 0 20px 0; font-size: 16px;">Create your first World Café session!</p>
                    <button onclick="showCreateSession()" style="
                        background: linear-gradient(135deg, #667eea, #764ba2);
                        color: white;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 8px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                    " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                        + Create Session
                    </button>
                </div>
            `;
        }
        return;
    }
    
    sessionsList.innerHTML = sessionsToShow.map(session => `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            transition: all 0.3s ease;
            cursor: pointer;
            border: 2px solid transparent;
        " 
        onclick="loadSpecificSession('${session.id}')"
        onmouseover="
            this.style.transform='translateY(-4px)'; 
            this.style.boxShadow='0 8px 24px rgba(0,0,0,0.15)'; 
            this.style.borderColor='#667eea';
        " 
        onmouseout="
            this.style.transform='translateY(0)'; 
            this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'; 
            this.style.borderColor='transparent';
        ">
            <!-- Session Header -->
            <div style="margin-bottom: 16px;">
                <h3 style="
                    margin: 0 0 8px 0; 
                    font-size: 18px; 
                    font-weight: 700; 
                    color: #333;
                    display: -webkit-box;
                    -webkit-line-clamp: 2;
                    -webkit-box-orient: vertical;
                    overflow: hidden;
                ">${session.title}</h3>
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 8px;
                ">
                    <p style="
                        margin: 0; 
                        color: #666; 
                        font-size: 14px; 
                        line-height: 1.5;
                        display: -webkit-box;
                        -webkit-line-clamp: 2;
                        -webkit-box-orient: vertical;
                        overflow: hidden;
                        flex: 1;
                        margin-right: 12px;
                    ">${session.description || 'No description provided'}</p>
                    ${getSessionLanguageBadge(session.language || 'en')}
                </div>
            </div>
            
            <!-- Session ID -->
            <div style="
                margin-bottom: 16px;
                background: #f0f8ff;
                border: 1px solid #b3d9ff;
                border-radius: 6px;
                overflow: hidden;
            ">
                <div style="font-size: 11px; color: #666; margin-bottom: 8px; padding: 8px 12px 0; text-align: center;">Session ID</div>
                <div onclick="copySessionCode('${session.id}', event)" style="
                    font-family: monospace;
                    font-size: 12px;
                    font-weight: 600;
                    color: #333;
                    letter-spacing: 0.5px;
                    word-break: break-all;
                    padding: 8px 12px;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    background: transparent;
                    text-align: center;
                " 
                onmouseover="this.style.background='#e3f2fd'"
                onmouseout="this.style.background='transparent'"
                title="Click to copy session ID"
                >${session.id}</div>
                
                <!-- Copy Buttons Row -->
                <div style="
                    display: flex;
                    border-top: 1px solid #b3d9ff;
                    background: #e8f4ff;
                ">
                    <button onclick="copySessionCode('${session.id}', event)" style="
                        flex: 1;
                        padding: 6px 8px;
                        font-size: 10px;
                        font-weight: 600;
                        color: #0056b3;
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        transition: all 0.2s ease;
                        border-right: 1px solid #b3d9ff;
                    "
                    onmouseover="this.style.background='#d1ecf1'"
                    onmouseout="this.style.background='transparent'"
                    >📋 Copy Code</button>
                    
                    <button onclick="copySessionLink('${session.id}', event)" style="
                        flex: 1;
                        padding: 6px 8px;
                        font-size: 10px;
                        font-weight: 600;
                        color: #0056b3;
                        background: transparent;
                        border: none;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    "
                    onmouseover="this.style.background='#d1ecf1'"
                    onmouseout="this.style.background='transparent'"
                    >🔗 Copy Link</button>
                </div>
            </div>
            
            <!-- Stats Grid -->
            <div style="
                display: grid;
                grid-template-columns: 1fr 1fr 1fr;
                gap: 12px;
                margin-bottom: 16px;
            ">
                <div style="text-align: center; padding: 8px; background: #f8f9fa; border-radius: 8px;">
                    <div style="font-size: 20px; font-weight: 700; color: #667eea; margin-bottom: 2px;">
                        ${session.table_count || session.tableCount || 0}
                    </div>
                    <div style="font-size: 11px; color: #666; font-weight: 600;">Tables</div>
                </div>
                <div style="text-align: center; padding: 8px; background: #f8f9fa; border-radius: 8px;">
                    <div style="font-size: 20px; font-weight: 700; color: #28a745; margin-bottom: 2px;">
                        ${session.total_participants || 0}
                    </div>
                    <div style="font-size: 11px; color: #666; font-weight: 600;">Participants</div>
                </div>
                <div style="text-align: center; padding: 8px; background: #f8f9fa; border-radius: 8px;">
                    <div style="font-size: 20px; font-weight: 700; color: #17a2b8; margin-bottom: 2px;">
                        ${session.total_recordings || 0}
                    </div>
                    <div style="font-size: 11px; color: #666; font-weight: 600;">Recordings</div>
                </div>
            </div>
            
            <!-- Footer -->
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding-top: 12px;
                border-top: 1px solid #f0f0f0;
                font-size: 12px;
                color: #888;
            ">
                <span>Created ${new Date(session.created_at || session.createdAt).toLocaleDateString()}</span>
                <div style="display: flex; gap: 6px;">
                    <span onclick="event.stopPropagation(); loadSpecificSession('${session.id}')" style="
                        background: #667eea;
                        color: white;
                        padding: 4px 8px;
                        border-radius: 6px;
                        font-size: 10px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='#5a67d8'" onmouseout="this.style.background='#667eea'">
                        📊 Dashboard
                    </span>
                    <span onclick="event.stopPropagation(); viewAllTranscriptions('${session.id}')" style="
                        background: #28a745;
                        color: white;
                        padding: 4px 8px;
                        border-radius: 6px;
                        font-size: 10px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='#218838'" onmouseout="this.style.background='#28a745'">
                        📝 Transcriptions
                    </span>
                </div>
            </div>
        </div>
    `).join('');
}

// Search functionality for sessions
function filterSessions() {
    const searchInput = document.getElementById('sessionsSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const searchResults = document.getElementById('searchResults');
    const searchValue = searchInput.value.toLowerCase().trim();
    
    // Show/hide clear button
    if (searchValue) {
        clearBtn.style.display = 'block';
    } else {
        clearBtn.style.display = 'none';
        searchResults.style.display = 'none';
        populateSessionsListFiltered(); // Show all sessions
        return;
    }
    
    // Filter sessions based on title and description
    const filteredSessions = activeSessions.filter(session => {
        const titleMatch = session.title.toLowerCase().includes(searchValue);
        const descriptionMatch = (session.description || '').toLowerCase().includes(searchValue);
        return titleMatch || descriptionMatch;
    });
    
    // Update search results info
    searchResults.style.display = 'block';
    if (filteredSessions.length === 0) {
        searchResults.textContent = `No results found for "${searchInput.value}"`;
        searchResults.style.color = '#dc3545';
    } else if (filteredSessions.length === 1) {
        searchResults.textContent = `Found 1 session`;
        searchResults.style.color = '#28a745';
    } else {
        searchResults.textContent = `Found ${filteredSessions.length} sessions`;
        searchResults.style.color = '#28a745';
    }
    
    // Display filtered sessions
    populateSessionsListFiltered(filteredSessions);
}

// Clear search functionality
function clearSearch() {
    const searchInput = document.getElementById('sessionsSearchInput');
    const clearBtn = document.getElementById('clearSearchBtn');
    const searchResults = document.getElementById('searchResults');
    
    searchInput.value = '';
    clearBtn.style.display = 'none';
    searchResults.style.display = 'none';
    
    // Reset to show all sessions
    populateSessionsListFiltered();
}

// Search input focus/blur handlers
function handleSearchFocus() {
    const container = document.getElementById('searchInputContainer');
    if (container) {
        container.style.borderColor = '#007bff';
        container.style.boxShadow = '0 0 0 3px rgba(0,123,255,0.1)';
    }
}

function handleSearchBlur() {
    const container = document.getElementById('searchInputContainer');
    if (container) {
        container.style.borderColor = '#ddd';
        container.style.boxShadow = 'none';
    }
}

async function loadSpecificSession(sessionId, isAdmin = false) {
    console.log(`[DEBUG] loadSpecificSession called with sessionId: ${sessionId}, isAdmin: ${isAdmin}`);
    showLoading('Loading session...');
    
    try {
        console.log(`[DEBUG] Fetching session data from /api/sessions/${sessionId}`);
        const response = await fetch(`/api/sessions/${sessionId}`);
        
        if (response.ok) {
            const session = await response.json();
            console.log(`[DEBUG] Session data received:`, session.title);
            currentSession = session;
            socket.emit('join-session', sessionId);
            
            console.log(`[DEBUG] Loading session dashboard...`);
            loadSessionDashboard(sessionId);
            
            console.log('[DEBUG] Showing session dashboard...');
            // Hide all other screens using the same approach as showSessionDashboard
            document.querySelectorAll('.screen').forEach(screen => {
                screen.classList.remove('active');
                screen.style.display = 'none';
            });
            
            // Hide isolated screens
            const joinScreen = document.getElementById('joinSessionScreen');
            if (joinScreen) {
                joinScreen.style.display = 'none';
                console.log('[DEBUG] Join screen hidden');
            }
            const transcriptionsScreen = document.getElementById('allTranscriptionsScreen');
            if (transcriptionsScreen) {
                transcriptionsScreen.style.display = 'none';
            }
            
            // Show the completely isolated session dashboard screen
            const dashboardScreen = document.getElementById('sessionDashboard');
            if (dashboardScreen) {
                dashboardScreen.style.display = 'block';
                console.log('[DEBUG] Session dashboard screen shown');
            } else {
                console.error('[DEBUG] Session dashboard screen not found!');
            }
            
            console.log(`[DEBUG] Successfully joined session: ${session.title}`);
        } else {
            const error = response.status === 404 ? 'Session not found or expired' : 'Failed to load session';
            console.error(`[DEBUG] Session loading failed: ${error} (Status: ${response.status})`);
            throw new Error(error);
        }
    } catch (error) {
        console.error('[DEBUG] Error in loadSpecificSession:', error);
        console.error('[DEBUG] Error stack:', error.stack);
        showToast(`Failed to load session: ${error.message}`, 'error');
        throw error; // Re-throw so caller can handle it
    } finally {
        console.log('[DEBUG] Hiding loading overlay');
        hideLoading();
    }
}

async function viewAllTranscriptions(sessionId) {
    console.log('viewAllTranscriptions called with sessionId:', sessionId);
    showLoading('Loading all transcriptions...');
    
    try {
        // Get session details
        console.log('Fetching session details...');
        const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
        if (!sessionResponse.ok) {
            console.error('Session response not OK:', sessionResponse.status, sessionResponse.statusText);
            throw new Error('Session not found');
        }
        const session = await sessionResponse.json();
        console.log('Session loaded:', session);
        
        // Get all transcriptions for the session
        console.log('Fetching transcriptions...');
        const transcriptionsResponse = await fetch(`/api/sessions/${sessionId}/all-transcriptions`);
        if (!transcriptionsResponse.ok) {
            console.error('Transcriptions response not OK:', transcriptionsResponse.status, transcriptionsResponse.statusText);
            throw new Error('Failed to load transcriptions');
        }
        const transcriptions = await transcriptionsResponse.json();
        console.log('Transcriptions loaded:', transcriptions.length, 'records');
        
        // Check if required DOM elements exist
        const titleElement = document.getElementById('allTranscriptionsTitle');
        const subtitleElement = document.getElementById('allTranscriptionsSubtitle');
        
        if (!titleElement) {
            console.error('allTranscriptionsTitle element not found');
            throw new Error('Required DOM element missing: allTranscriptionsTitle');
        }
        
        if (!subtitleElement) {
            console.error('allTranscriptionsSubtitle element not found');
            throw new Error('Required DOM element missing: allTranscriptionsSubtitle');
        }
        
        // Update UI
        console.log('Updating UI elements...');
        titleElement.textContent = `📝 All Transcriptions`;
        subtitleElement.textContent = `${session.title} - Session Overview`;
        
        // Store current session for filtering
        currentSession = session;
        
        // Display transcriptions
        console.log('Calling displayAwesomeTranscriptions...');
        displayAwesomeTranscriptions(transcriptions, session);
        
        console.log('Showing isolated transcriptions screen...');
        // Hide all other screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
            screen.style.display = 'none';
        });
        
        // Hide isolated join screen if it's showing
        const joinScreen = document.getElementById('joinSessionScreen');
        if (joinScreen) {
            joinScreen.style.display = 'none';
        }
        
        // Show the completely isolated transcriptions screen
        const transcriptionsScreen = document.getElementById('allTranscriptionsScreen');
        if (transcriptionsScreen) {
            transcriptionsScreen.style.display = 'block';
            console.log('Transcriptions screen activated with isolated styles');
        }
        
        console.log('viewAllTranscriptions completed successfully');
        
    } catch (error) {
        console.error('Error in viewAllTranscriptions:', error);
        alert('Failed to load transcriptions: ' + error.message);
    } finally {
        hideLoading();
    }
}

function displayAwesomeTranscriptions(transcriptions, session) {
    console.log('displayAwesomeTranscriptions called with:', transcriptions.length, 'transcriptions');
    
    try {
        // Update statistics
        console.log('Updating dashboard stats...');
        updateDashboardStats(transcriptions);
        
        // Setup filters
        console.log('Setting up filters...');
        setupAwesomeFilters(transcriptions);
        
        // Display transcriptions with awesome design
        console.log('Rendering transcriptions...');
        renderAwesomeTranscriptions(transcriptions);
        
        // Load existing AI analysis
        console.log('Loading existing AI analysis...');
        loadExistingAIAnalysis(session.id);
        
        console.log('displayAwesomeTranscriptions completed successfully');
    } catch (error) {
        console.error('Error in displayAwesomeTranscriptions:', error);
        alert('Error displaying transcriptions: ' + error.message);
    }
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
    console.log('renderAwesomeTranscriptions called with:', transcriptions.length, 'transcriptions');
    
    const allTranscriptionsList = document.getElementById('allTranscriptionsList');
    const tableFilter = document.getElementById('tableFilter');
    const sortFilter = document.getElementById('sortFilter');
    
    if (!allTranscriptionsList) {
        console.error('allTranscriptionsList element not found');
        throw new Error('Required DOM element missing: allTranscriptionsList');
    }
    
    if (!tableFilter) {
        console.error('tableFilter element not found');
        throw new Error('Required DOM element missing: tableFilter');
    }
    
    if (!sortFilter) {
        console.error('sortFilter element not found');
        throw new Error('Required DOM element missing: sortFilter');
    }
    
    console.log('All required DOM elements found');
    
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
            <div style="margin-bottom: 24px;">
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    padding: 16px 20px;
                    background: linear-gradient(135deg, #f8f9fa, #e9ecef);
                    border-radius: 12px;
                    border-left: 4px solid #007bff;
                ">
                    <h3 style="
                        margin: 0;
                        font-size: 20px;
                        font-weight: 600;
                        color: #333;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <span style="font-size: 24px;">🏓</span>
                        Table ${tableNumber}
                    </h3>
                    <span style="
                        background: #007bff;
                        color: white;
                        padding: 4px 12px;
                        border-radius: 16px;
                        font-size: 12px;
                        font-weight: 600;
                    ">${tableTranscriptions.length} recording${tableTranscriptions.length !== 1 ? 's' : ''}</span>
                </div>
        `;
        
        tableTranscriptions.forEach((transcription, index) => {
            const speakerSegments = transcription.speaker_segments ? 
                (typeof transcription.speaker_segments === 'string' ? 
                    JSON.parse(transcription.speaker_segments) : 
                    transcription.speaker_segments) : [];
            
            const consolidatedSegments = consolidateSpeakerSegments(speakerSegments);
            const uniqueSpeakers = new Set(consolidatedSegments.map(s => s.speaker));
            const recordingDate = new Date(transcription.created_at).toLocaleDateString();
            const recordingTime = new Date(transcription.created_at).toLocaleTimeString();
            const duration = Math.round(parseFloat(transcription.duration_seconds) || 0);
            
            html += `
                <div class="awesome-transcription-card" 
                     data-transcription-id="${transcription.id || index}"
                     style="
                         background: white;
                         border: 2px solid #e0e0e0;
                         border-radius: 12px;
                         padding: 20px;
                         margin-bottom: 16px;
                         cursor: pointer;
                         transition: all 0.2s ease;
                         box-sizing: border-box;
                         box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                     "
                     onmouseover="this.style.borderColor='#007bff'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 16px rgba(0,123,255,0.15)'"
                     onmouseout="this.style.borderColor='#e0e0e0'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'"
                     onclick="selectTranscription('${transcription.id || index}')">
                    <div style="
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 16px;
                        padding-bottom: 12px;
                        border-bottom: 1px solid #f0f0f0;
                    ">
                        <div style="
                            font-size: 16px;
                            font-weight: 600;
                            color: #333;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                        ">
                            <span style="font-size: 20px;">🎤</span>
                            Recording ${index + 1}
                        </div>
                        <div style="
                            display: flex;
                            flex-direction: column;
                            align-items: flex-end;
                            gap: 4px;
                            color: #666;
                            font-size: 12px;
                        ">
                            <div>${recordingDate} ${recordingTime}</div>
                            ${duration > 0 ? `<span style="
                                background: #007bff;
                                color: white;
                                padding: 2px 8px;
                                border-radius: 4px;
                                font-size: 11px;
                                font-weight: 500;
                            ">${duration}s</span>` : ''}
                        </div>
                    </div>
                    <div style="max-height: 200px; overflow-y: auto;">
                        ${consolidatedSegments.length > 0 ? 
                                consolidatedSegments.map(segment => `
                                    <div style="
                                        margin-bottom: 12px;
                                        padding: 12px;
                                        background: #f8f9fa;
                                        border-radius: 8px;
                                        border-left: 3px solid #007bff;
                                    ">
                                        <div style="
                                            font-size: 12px;
                                            font-weight: 600;
                                            color: #007bff;
                                            margin-bottom: 6px;
                                        ">Speaker ${(segment.speaker || 0) + 1}</div>
                                        <div style="
                                            font-size: 14px;
                                            line-height: 1.4;
                                            color: #333;
                                        ">${
                                            (typeof segment.consolidatedText === 'string' ? segment.consolidatedText : null) ||
                                            (typeof segment.transcript === 'string' ? segment.transcript : null) ||
                                            (typeof segment.text === 'string' ? segment.text : null) ||
                                            'No text available'
                                        }</div>
                                    </div>
                                `).join('') : 
                            `<div class="awesome-speaker-segment">
                                <div class="awesome-speaker-label">No Audio</div>
                                <div class="awesome-speaker-text" style="font-style: italic; color: #999;">No transcription available for this recording</div>
                            </div>`
                        }
                    </div>
                </div>
            `;
        });
        
        html += `</div>`; // Close the table group div
    });
    
    allTranscriptionsList.innerHTML = html;
}

// Transcription selection function with beautiful effects like Join Session
function selectTranscription(transcriptionId) {
    console.log('Transcription selected:', transcriptionId);
    
    // Update visual selection
    document.querySelectorAll('.awesome-transcription-card').forEach(card => {
        // Reset all cards to default state
        if (card.getAttribute('data-transcription-id') != transcriptionId) {
            card.style.borderColor = '#e0e0e0';
            card.style.background = 'white';
            card.style.transform = 'translateY(0)';
            card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.05)';
        }
    });
    
    // Highlight selected card
    const selectedCard = document.querySelector(`[data-transcription-id="${transcriptionId}"]`);
    if (selectedCard) {
        selectedCard.style.borderColor = '#007bff';
        selectedCard.style.background = 'linear-gradient(135deg, #f0f8ff, #e6f3ff)';
        selectedCard.style.transform = 'translateY(-4px)';
        selectedCard.style.boxShadow = '0 8px 24px rgba(0,123,255,0.2)';
        
        // Optional: scroll into view smoothly
        selectedCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        
        // Add a subtle pulse effect
        selectedCard.style.animation = 'pulse 0.6s ease-in-out';
        setTimeout(() => {
            if (selectedCard.style) {
                selectedCard.style.animation = '';
            }
        }, 600);
    }
    
    // Here you could add additional functionality like:
    // - Show detailed view
    // - Enable export for this specific transcription
    // - Show analysis options
    console.log('Transcription selection completed');
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
    console.log('formatAnalysisContent called with:', { data, type });
    
    if (!data) return '<p>No data available</p>';
    
    // Parse JSON string if needed
    let parsedData = data;
    if (typeof data === 'string') {
        try {
            parsedData = JSON.parse(data);
        } catch (e) {
            return `<p>${data}</p>`;
        }
    }
    
    if (typeof parsedData === 'object') {
        let html = '';
        
        // Handle summary type
        if (type === 'summary') {
            if (parsedData.summary) {
                html += `<p><strong>Summary:</strong> ${parsedData.summary}</p>`;
            } else if (parsedData.content) {
                html += `<p>${parsedData.content}</p>`;
            } else {
                // Try to extract any meaningful text
                html += `<p>${JSON.stringify(parsedData, null, 2).replace(/[{}"]/g, '').replace(/,/g, '<br>')}</p>`;
            }
        }
        
        // Handle themes type
        else if (type === 'themes') {
            if (parsedData.themes && Array.isArray(parsedData.themes)) {
                html += '<p><strong>Main Themes:</strong></p><ul>';
                parsedData.themes.forEach(theme => {
                    if (typeof theme === 'object') {
                        const title = theme.name || theme.title || theme.theme || 'Theme';
                        const desc = theme.description || theme.content || theme.summary || JSON.stringify(theme);
                        html += `<li><strong>${title}:</strong> ${desc}</li>`;
                    } else {
                        html += `<li>${theme}</li>`;
                    }
                });
                html += '</ul>';
            } else if (parsedData.content) {
                html += `<p>${parsedData.content}</p>`;
            } else {
                html += '<p><strong>Themes identified:</strong></p>';
                Object.entries(parsedData).forEach(([key, value]) => {
                    if (key !== 'type' && key !== 'analysis_type') {
                        html += `<p><strong>${key}:</strong> ${typeof value === 'object' ? JSON.stringify(value) : value}</p>`;
                    }
                });
            }
        }
        
        // Handle sentiment type
        else if (type === 'sentiment') {
            if (parsedData.insights && Array.isArray(parsedData.insights)) {
                html += '<p><strong>Key Insights:</strong></p><ul>';
                parsedData.insights.forEach(insight => {
                    if (typeof insight === 'object') {
                        const text = insight.text || insight.description || insight.content || JSON.stringify(insight);
                        html += `<li>${text}</li>`;
                    } else {
                        html += `<li>${insight}</li>`;
                    }
                });
                html += '</ul>';
            } else if (parsedData.sentiment) {
                html += `<p><strong>Overall Sentiment:</strong> ${parsedData.sentiment}</p>`;
            } else {
                Object.entries(parsedData).forEach(([key, value]) => {
                    if (key !== 'type' && key !== 'analysis_type') {
                        html += `<p><strong>${key}:</strong> ${typeof value === 'object' ? JSON.stringify(value) : value}</p>`;
                    }
                });
            }
        }
        
        // Handle agreements type
        else if (type === 'agreements') {
            if (parsedData.agreements && Array.isArray(parsedData.agreements)) {
                html += '<p><strong>Points of Agreement:</strong></p><ul>';
                parsedData.agreements.forEach(agreement => {
                    if (typeof agreement === 'object') {
                        const text = agreement.point || agreement.description || agreement.content || agreement.text || JSON.stringify(agreement);
                        html += `<li>${text}</li>`;
                    } else {
                        html += `<li>${agreement}</li>`;
                    }
                });
                html += '</ul>';
            } else {
                html += '<p><strong>Points of Agreement:</strong></p>';
                Object.entries(parsedData).forEach(([key, value]) => {
                    if (key !== 'type' && key !== 'analysis_type') {
                        if (Array.isArray(value)) {
                            html += `<ul>`;
                            value.forEach(item => {
                                const text = typeof item === 'object' ? 
                                    (item.point || item.description || item.text || JSON.stringify(item)) : 
                                    item;
                                html += `<li>${text}</li>`;
                            });
                            html += `</ul>`;
                        } else {
                            html += `<p>${typeof value === 'object' ? JSON.stringify(value) : value}</p>`;
                        }
                    }
                });
            }
        }
        
        // Handle conflicts type
        else if (type === 'conflicts') {
            if (parsedData.conflicts && Array.isArray(parsedData.conflicts)) {
                html += '<p><strong>Areas of Disagreement:</strong></p><ul>';
                parsedData.conflicts.forEach(conflict => {
                    if (typeof conflict === 'object') {
                        const text = conflict.point || conflict.description || conflict.content || conflict.text || JSON.stringify(conflict);
                        html += `<li>${text}</li>`;
                    } else {
                        html += `<li>${conflict}</li>`;
                    }
                });
                html += '</ul>';
            } else {
                html += '<p><strong>Areas of Disagreement:</strong></p>';
                Object.entries(parsedData).forEach(([key, value]) => {
                    if (key !== 'type' && key !== 'analysis_type') {
                        if (Array.isArray(value)) {
                            html += `<ul>`;
                            value.forEach(item => {
                                const text = typeof item === 'object' ? 
                                    (item.point || item.description || item.text || JSON.stringify(item)) : 
                                    item;
                                html += `<li>${text}</li>`;
                            });
                            html += `</ul>`;
                        } else {
                            html += `<p>${typeof value === 'object' ? JSON.stringify(value) : value}</p>`;
                        }
                    }
                });
            }
        }
        
        // Default handling for any other type
        else {
            Object.entries(parsedData).forEach(([key, value]) => {
                if (key !== 'type' && key !== 'analysis_type') {
                    html += `<p><strong>${key}:</strong> `;
                    if (Array.isArray(value)) {
                        html += `<ul>`;
                        value.forEach(item => {
                            html += `<li>${typeof item === 'object' ? JSON.stringify(item) : item}</li>`;
                        });
                        html += `</ul>`;
                    } else {
                        html += `${typeof value === 'object' ? JSON.stringify(value) : value}</p>`;
                    }
                }
            });
        }
        
        if (!html) {
            html = `<pre style="background: #f8f9fa; padding: 12px; border-radius: 4px; font-size: 12px; overflow-x: auto;">${JSON.stringify(parsedData, null, 2)}</pre>`;
        }
        
        return html;
    }
    
    return `<p>${String(parsedData)}</p>`;
}

function toggleAIAnalysis() {
    const aiAnalysisSection = document.getElementById('aiAnalysisSection');
    aiAnalysisSection.style.display = 'none';
}

function updateSessionLanguageIndicator(languageCode) {
    const languageIndicator = document.getElementById('sessionLanguageIndicator');
    const languageText = document.getElementById('sessionLanguageText');
    
    if (!languageIndicator || !languageText) return;
    
    // Language code to display name mapping
    const languageMap = {
        'en': 'English',
        'es': 'Spanish', 
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'nl': 'Dutch',
        'pl': 'Polish',
        'ru': 'Russian',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'th': 'Thai',
        'vi': 'Vietnamese',
        'tr': 'Turkish',
        'sv': 'Swedish',
        'da': 'Danish',
        'no': 'Norwegian',
        'fi': 'Finnish'
    };
    
    // Language code to flag emoji mapping
    const flagMap = {
        'en': '🇬🇧',
        'es': '🇪🇸',
        'fr': '🇫🇷', 
        'de': '🇩🇪',
        'it': '🇮🇹',
        'pt': '🇵🇹',
        'nl': '🇳🇱',
        'pl': '🇵🇱',
        'ru': '🇷🇺',
        'zh': '🇨🇳',
        'ja': '🇯🇵',
        'ko': '🇰🇷',
        'ar': '🇸🇦',
        'hi': '🇮🇳',
        'th': '🇹🇭',
        'vi': '🇻🇳',
        'tr': '🇹🇷',
        'sv': '🇸🇪',
        'da': '🇩🇰',
        'no': '🇳🇴',
        'fi': '🇫🇮'
    };
    
    const displayName = languageMap[languageCode] || languageCode.toUpperCase();
    const flag = flagMap[languageCode] || '🌍';
    
    // Update the language text
    languageText.textContent = displayName;
    
    // Update the flag
    const flagElement = languageIndicator.querySelector('span:first-child');
    if (flagElement) {
        flagElement.textContent = flag;
    }
}

async function loadSessionDashboard(sessionId) {
    const session = currentSession || activeSessions.find(s => s.id === sessionId);
    if (!session) return;
    
    // Update dashboard title and stats
    document.getElementById('dashboardTitle').textContent = session.title;
    document.getElementById('sessionCodeValue').textContent = session.id; // Session code is the session ID
    document.getElementById('participantCount').textContent = session.total_participants || 0;
    document.getElementById('activeTableCount').textContent = session.active_tables || session.tableCount || 0;
    
    // Get actual recording count from transcriptions
    try {
        const transcriptionsResponse = await fetch(`/api/sessions/${sessionId}/all-transcriptions`);
        if (transcriptionsResponse.ok) {
            const transcriptions = await transcriptionsResponse.json();
            document.getElementById('recordingCount').textContent = transcriptions.length;
        } else {
            document.getElementById('recordingCount').textContent = session.total_recordings || 0;
        }
    } catch (error) {
        console.warn('Failed to load transcriptions for count:', error);
        document.getElementById('recordingCount').textContent = session.total_recordings || 0;
    }
    
    // Update language indicator
    updateSessionLanguageIndicator(session.language || 'en');
    
    // Load tables if available
    if (session.tables && session.tables.length > 0) {
        displayTables(session.tables);
    } else {
        // Generate mock tables for display
        const mockTables = [];
        const tableCount = session.tableCount || session.table_count || 10;
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
    
    // Initialize simple chat
    initializeSimpleChat();
}

function displayTables(tables) {
    const tablesGrid = document.getElementById('tablesGrid');
    
    if (!tablesGrid) {
        console.error('Tables grid container not found');
        return;
    }
    
    if (!tables || tables.length === 0) {
        tablesGrid.innerHTML = `
            <div style="
                grid-column: 1 / -1;
                text-align: center;
                padding: 60px 20px;
                color: #666;
                background: #f8f9fa;
                border-radius: 12px;
                border: 2px dashed #ddd;
            ">
                <div style="font-size: 48px; margin-bottom: 16px;">🏓</div>
                <h3 style="margin: 0 0 12px 0; color: #333; font-size: 20px;">No Tables Yet</h3>
                <p style="margin: 0 0 24px 0; font-size: 14px;">Create your first table to start the World Café session</p>
                <button onclick="showCreateTable()" style="
                    padding: 12px 24px;
                    background: #007bff;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                ">
                    <span style="font-size: 16px;">➕</span>
                    Create Table
                </button>
            </div>
        `;
        return;
    }
    
    tablesGrid.innerHTML = tables.map(table => {
        const participantCount = table.participant_count || (table.participants ? table.participants.length : 0);
        const status = table.status || 'waiting';
        const recordingCount = table.recording_count || 0;
        const transcriptionCount = table.transcription_count || 0;
        const maxSize = table.max_size || 5;
        
        // Status-based styling
        const statusColors = {
            active: { bg: '#28a745', text: 'Active' },
            waiting: { bg: '#ffc107', text: 'Waiting' },
            closed: { bg: '#6c757d', text: 'Closed' },
            full: { bg: '#dc3545', text: 'Full' }
        };
        const statusStyle = statusColors[status] || statusColors.waiting;
        
        return `
            <div onclick="showTableInterface(${table.id || table.table_number})" style="
                background: white;
                border: 2px solid #e0e0e0;
                border-radius: 12px;
                padding: 24px;
                cursor: pointer;
                transition: all 0.2s ease;
                box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                position: relative;
            " 
            onmouseover="this.style.borderColor='#007bff'; this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(0,123,255,0.15)'"
            onmouseout="this.style.borderColor='#e0e0e0'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.05)'">
                
                <!-- Table Header -->
                <div style="
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                    padding-bottom: 16px;
                    border-bottom: 1px solid #f0f0f0;
                ">
                    <h4 style="
                        margin: 0;
                        font-size: 18px;
                        font-weight: 600;
                        color: #333;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <span style="font-size: 20px;">🏓</span>
                        ${table.name || `Table ${table.table_number}`}
                    </h4>
                    <span style="
                        background: ${statusStyle.bg};
                        color: white;
                        padding: 4px 12px;
                        border-radius: 16px;
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: uppercase;
                    ">${statusStyle.text}</span>
                </div>
                
                <!-- Table Actions -->
                <div style="
                    margin-bottom: 20px;
                    background: #f0f8ff;
                    border: 1px solid #b3d9ff;
                    border-radius: 6px;
                    overflow: hidden;
                ">
                    <div style="font-size: 11px; color: #666; padding: 8px 12px 4px; text-align: center;">Table Actions</div>
                    
                    <!-- Action Buttons Row -->
                    <div style="
                        display: flex;
                        background: #e8f4ff;
                    ">
                        <button onclick="copyTableCode('${currentSession ? currentSession.id : 'session-id'}/table/${table.table_number}', event)" style="
                            flex: 1;
                            padding: 8px 6px;
                            font-size: 10px;
                            font-weight: 600;
                            color: #0056b3;
                            background: transparent;
                            border: none;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            border-right: 1px solid #b3d9ff;
                        "
                        onmouseover="this.style.background='#d1ecf1'"
                        onmouseout="this.style.background='transparent'"
                        title="Copy table code"
                        >📋 Copy Code</button>
                        
                        <button onclick="copyTableLink('${currentSession ? currentSession.id : 'session-id'}', '${table.table_number}', event)" style="
                            flex: 1;
                            padding: 8px 6px;
                            font-size: 10px;
                            font-weight: 600;
                            color: #0056b3;
                            background: transparent;
                            border: none;
                            cursor: pointer;
                            transition: all 0.2s ease;
                            border-right: 1px solid #b3d9ff;
                        "
                        onmouseover="this.style.background='#d1ecf1'"
                        onmouseout="this.style.background='transparent'"
                        title="Copy table link"
                        >🔗 Copy Link</button>
                        
                        <button onclick="showTableQR('${currentSession ? currentSession.id : 'session-id'}', '${table.table_number}', event)" style="
                            flex: 1;
                            padding: 8px 6px;
                            font-size: 10px;
                            font-weight: 600;
                            color: #0056b3;
                            background: transparent;
                            border: none;
                            cursor: pointer;
                            transition: all 0.2s ease;
                        "
                        onmouseover="this.style.background='#d1ecf1'"
                        onmouseout="this.style.background='transparent'"
                        title="Show QR code for this table"
                        >📱 QR Code</button>
                    </div>
                </div>
                
                <!-- Table Stats -->
                <div style="
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 16px;
                    text-align: center;
                ">
                    <div style="
                        padding: 12px;
                        background: #f8f9fa;
                        border-radius: 8px;
                    ">
                        <div style="font-size: 20px; margin-bottom: 4px;">👥</div>
                        <div style="font-size: 16px; font-weight: 600; color: #333;">${participantCount}</div>
                        <div style="font-size: 11px; color: #666;">/${maxSize} seats</div>
                    </div>
                    
                    <div style="
                        padding: 12px;
                        background: #f8f9fa;
                        border-radius: 8px;
                    ">
                        <div style="font-size: 20px; margin-bottom: 4px;">🎤</div>
                        <div style="font-size: 16px; font-weight: 600; color: #333;">${recordingCount}</div>
                        <div style="font-size: 11px; color: #666;">recordings</div>
                    </div>
                    
                    <div style="
                        padding: 12px;
                        background: #f8f9fa;
                        border-radius: 8px;
                    ">
                        <div style="font-size: 20px; margin-bottom: 4px;">📝</div>
                        <div style="font-size: 16px; font-weight: 600; color: #333;">${transcriptionCount}</div>
                        <div style="font-size: 11px; color: #666;">transcripts</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Toggle functions for isolated sections
function toggleQRCodesSection() {
    const qrSection = document.getElementById('qrCodesSection');
    if (qrSection.style.display === 'none' || !qrSection.style.display) {
        qrSection.style.display = 'block';
    } else {
        qrSection.style.display = 'none';
    }
}

function toggleSessionAIAnalysis() {
    const aiSection = document.getElementById('sessionAIAnalysisSection');
    if (aiSection) {
        aiSection.style.display = 'none';
    }
}

// QR Code functionality
function setupQRCodesSection(session) {
    if (!session.qrCodes) {
        // Mock QR codes for sessions without database
        session.qrCodes = {
            session: `/qr-codes/session-${session.id}.png`,
            tables: {}
        };
        
        const tableCount = session.tableCount || session.table_count || 10;
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

function showTableQR(sessionId, tableNumber, event) {
    event.stopPropagation();
    
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
        backdrop-filter: blur(5px);
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 16px;
            padding: 24px;
            max-width: 400px;
            width: 90%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        ">
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            ">
                <h3 style="margin: 0; color: #333; font-size: 18px;">Table ${tableNumber} QR Code</h3>
                <button onclick="this.closest('[style*=position]').remove()" style="
                    background: none;
                    border: none;
                    font-size: 24px;
                    cursor: pointer;
                    color: #666;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                " onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='none'">×</button>
            </div>
            
            <div style="
                background: #f8f9fa;
                border-radius: 12px;
                padding: 20px;
                margin-bottom: 20px;
            ">
                <img src="/api/qr/table/${sessionId}/${tableNumber}" 
                     alt="Table ${tableNumber} QR Code"
                     style="max-width: 200px; width: 100%; height: auto;"
                     onerror="this.parentElement.innerHTML='<div style=&quot;color: #666; padding: 2rem;&quot;>QR Code<br/>Not Available</div>'">
            </div>
            
            <div style="
                display: flex;
                gap: 12px;
                justify-content: center;
            ">
                <button onclick="downloadQR('table', '${sessionId}', '${tableNumber}')" style="
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    📥 Download
                </button>
                
                <button onclick="copyQRLink('table', '${sessionId}', '${tableNumber}')" style="
                    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                    color: white;
                    border: none;
                    padding: 10px 16px;
                    border-radius: 8px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                " onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    🔗 Copy Link
                </button>
            </div>
        </div>
    `;
    
    modal.onclick = function(e) {
        if (e.target === modal) {
            modal.remove();
        }
    };
    
    document.body.appendChild(modal);
}

function copyTableCode(tableCode, event) {
    // Prevent card click when copying
    event.stopPropagation();
    
    navigator.clipboard.writeText(tableCode).then(() => {
        showToast('Table code copied to clipboard!', 'success');
        console.log('Table code copied:', tableCode);
    }).catch(err => {
        console.error('Failed to copy table code:', err);
        showToast('Failed to copy table code. Please copy manually.', 'error');
        
        // Fallback - select text for manual copy
        try {
            const textArea = document.createElement('textarea');
            textArea.value = tableCode;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Table code selected for copying', 'info');
        } catch (fallbackErr) {
            console.error('Fallback copy also failed:', fallbackErr);
        }
    });
}

function copyTableLink(sessionId, tableNumber, event) {
    // Prevent card click when copying
    event.stopPropagation();
    
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/?session=${sessionId}&table=${tableNumber}`;
    
    navigator.clipboard.writeText(link).then(() => {
        showToast('Table join link copied to clipboard!', 'success');
        console.log('Table link copied:', link);
    }).catch(err => {
        console.error('Failed to copy table link:', err);
        showToast('Failed to copy table link. Please copy manually.', 'error');
        
        // Fallback - select text for manual copy
        try {
            const textArea = document.createElement('textarea');
            textArea.value = link;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Table link selected for copying', 'info');
        } catch (fallbackErr) {
            console.error('Fallback copy also failed:', fallbackErr);
        }
    });
}

function copySessionCode(sessionId, event) {
    // Prevent card click when copying
    event.stopPropagation();
    
    navigator.clipboard.writeText(sessionId).then(() => {
        showToast('Session ID copied to clipboard!', 'success');
        console.log('Session ID copied:', sessionId);
    }).catch(err => {
        console.error('Failed to copy session ID:', err);
        showToast('Failed to copy session ID. Please copy manually.', 'error');
        
        // Fallback - select text for manual copy
        try {
            const textArea = document.createElement('textarea');
            textArea.value = sessionId;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Session ID selected for copying', 'info');
        } catch (fallbackErr) {
            console.error('Fallback copy also failed:', fallbackErr);
        }
    });
}

function copySessionLink(sessionId, event) {
    // Prevent card click when copying
    event.stopPropagation();
    
    const baseUrl = window.location.origin;
    const link = `${baseUrl}/?session=${sessionId}`;
    
    navigator.clipboard.writeText(link).then(() => {
        showToast('Session join link copied to clipboard!', 'success');
        console.log('Session link copied:', link);
    }).catch(err => {
        console.error('Failed to copy session link:', err);
        showToast('Failed to copy session link. Please copy manually.', 'error');
        
        // Fallback - select text for manual copy
        try {
            const textArea = document.createElement('textarea');
            textArea.value = link;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            showToast('Session link selected for copying', 'info');
        } catch (fallbackErr) {
            console.error('Fallback copy also failed:', fallbackErr);
        }
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

async function submitManualJoin() {
    console.log('[DEBUG] submitManualJoin called');
    const codeInput = document.getElementById('manualCode');
    const code = codeInput.value.trim();
    const submitBtn = document.getElementById('submitManualJoinBtn');
    
    console.log('[DEBUG] Code entered:', code);
    
    if (!code) {
        console.log('[DEBUG] No code entered');
        showToast('Please enter a session code, table code, or password', 'error');
        codeInput.focus();
        return;
    }
    
    // Show loading state
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Joining...';
    submitBtn.disabled = true;
    
    try {
        console.log('[DEBUG] Sending request to /api/entry with code:', code);
        const response = await fetch('/api/entry', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ code })
        });
        
        const result = await response.json();
        console.log('[DEBUG] /api/entry response:', result);
        
        if (result.success) {
            console.log('[DEBUG] Entry successful, closing manual join modal');
            closeManualJoin();
            
            // Handle different entry types with appropriate feedback
            switch (result.type) {
                case 'session':
                    console.log('[DEBUG] Handling session entry');
                    showToast('Joining session...', 'success');
                    await loadSpecificSession(result.sessionId);
                    console.log('[DEBUG] Session loading completed');
                    break;
                    
                case 'session_admin':
                    console.log('[DEBUG] Handling admin session entry');
                    showToast('Joining session as admin...', 'success');
                    await loadSpecificSession(result.sessionId, true);
                    console.log('[DEBUG] Admin session loading completed');
                    break;
                    
                case 'table':
                    showToast(`Joining Table ${result.tableNumber}...`, 'success');
                    await joinSpecificTable(result.sessionId, result.tableNumber);
                    break;
                    
                case 'table_password':
                    showToast(`Joining Table ${result.tableNumber}...`, 'success');
                    await joinSpecificTable(result.sessionId, result.tableNumber);
                    break;
                    
                default:
                    console.error('Unknown entry type:', result.type);
                    showToast('Unknown entry type. Please contact support.', 'error');
            }
        } else {
            showToast(result.error || 'Unable to join. Please check your code and try again.', 'error');
            codeInput.focus();
        }
    } catch (error) {
        console.error('Error joining session/table:', error);
        showToast('Connection error. Please check your internet connection and try again.', 'error');
    } finally {
        // Restore button state
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
    }
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
    // Create a canvas to capture video frames
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    const scanFrame = () => {
        if (document.getElementById('mobileScanner').style.display === 'none') {
            return; // Stop scanning if scanner is closed
        }
        
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Simple QR code detection using pattern recognition
            // This looks for QR code-like patterns in the video frame
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const qrResult = detectQRPattern(imageData);
            
            if (qrResult) {
                handleQRCodeDetected(qrResult);
                return;
            }
        }
        
        // Continue scanning
        setTimeout(scanFrame, 300); // Scan every 300ms for better performance
    };
    
    scanFrame();
}

// Real QR code detection using jsQR library
function detectQRPattern(imageData) {
    if (typeof jsQR !== 'undefined') {
        try {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
                console.log('QR Code detected:', code.data);
                return code.data;
            }
        } catch (error) {
            console.warn('QR detection error:', error);
        }
    } else {
        console.warn('jsQR library not loaded');
    }
    return null;
}

// Handle detected QR code
async function handleQRCodeDetected(qrData) {
    console.log('QR Code detected:', qrData);
    
    // Close scanner
    closeQRScanner();
    
    try {
        // Parse QR code URL
        const url = new URL(qrData);
        const pathParts = url.pathname.split('/');
        
        if (pathParts[1] === 'join' && pathParts[2]) {
            const sessionId = pathParts[2];
            const tableNumber = pathParts[4]; // Optional table number
            
            showToast('QR Code detected! Joining session...', 'success');
            
            if (tableNumber) {
                // Direct table join
                await joinSpecificTable(sessionId, tableNumber);
            } else {
                // Session join - redirect to session
                window.location.href = `/?session=${sessionId}`;
            }
        } else {
            throw new Error('Invalid QR code format');
        }
    } catch (error) {
        console.error('Error processing QR code:', error);
        showToast('Invalid QR code. Please try again.', 'error');
    }
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
    console.log(`[DEBUG] joinSpecificTable called with sessionId: ${sessionId}, tableId: ${tableId}`);
    showLoading(`Joining Table ${tableId}...`);
    
    try {
        // Load session data without showing session dashboard
        console.log(`[DEBUG] Loading session data for ${sessionId}...`);
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
            console.error(`[DEBUG] Session API failed with status: ${response.status}`);
            throw new Error('Session not found or expired');
        }
        
        const session = await response.json();
        currentSession = session;
        console.log(`[DEBUG] Session loaded: ${session.title}`);
        
        // Join the socket room
        console.log(`[DEBUG] Joining socket room for session ${sessionId}...`);
        socket.emit('join-session', sessionId);
        
        // Load table-specific data
        console.log(`[DEBUG] Loading table data for table ${tableId}...`);
        const tableResponse = await fetch(`/api/sessions/${sessionId}/tables/${tableId}`);
        if (tableResponse.ok) {
            currentTable = await tableResponse.json();
            console.log(`[DEBUG] Table loaded: ${currentTable.name} (ID: ${currentTable.id})`);
        } else {
            console.log(`[DEBUG] Table API failed, using fallback table object`);
            // Fallback: create basic table object
            currentTable = {
                id: tableId,
                table_number: parseInt(tableId),
                session_id: sessionId,
                name: `Table ${tableId}`,
                status: 'waiting'
            };
        }
        
        // Setup and show table interface directly
        console.log(`[DEBUG] Setting up table interface...`);
        setupTableInterface();
        console.log(`[DEBUG] Showing tableInterface screen...`);
        showScreen('tableInterface');
        console.log(`[DEBUG] Successfully joined Table ${tableId} in session: ${session.title}`);
        
    } catch (error) {
        console.error('[DEBUG] Error in joinSpecificTable:', error);
        console.error('[DEBUG] Error stack:', error.stack);
        showToast(`Error joining table: ${error.message}`, 'error');
        throw new Error(`Unable to join Table ${tableId}. ${error.message}`);
    } finally {
        console.log(`[DEBUG] Hiding loading...`);
        hideLoading();
    }
}

// Table Management
async function loadSessionTables() {
    const sessionSelect = document.getElementById('sessionSelect');
    const tableSelect = document.getElementById('tableSelect');
    const joinBtn = document.getElementById('joinTableBtn');
    
    // Check if required elements exist
    if (!sessionSelect || !tableSelect || !joinBtn) {
        console.log('Session selection elements not found, skipping loadSessionTables');
        return;
    }
    
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
            
            // Go directly to the table interface (streamlined!)
            await joinSpecificTable(sessionId, tableNumber);
            
            console.log(`Successfully joined Table ${tableNumber}!`);
        } else {
            const error = await response.json();
            console.error(`Error joining table: ${error.error}`);
            alert(`Unable to join table: ${error.error}`);
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
    
    const participantName = 'Anonymous'; // Name form removed as requested
    const participantEmail = document.getElementById('participantEmailInput').value.trim();
    
    // Name validation removed since form was removed
    
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
            
            // Simply refresh the current table interface (no redirect needed)
            setupTableInterface();
            
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
    
    // Update session info in header
    if (currentSession) {
        const sessionTitleHeader = document.getElementById('sessionTitleHeader');
        const sessionDescriptionHeader = document.getElementById('sessionDescriptionHeader');
        
        if (sessionTitleHeader) {
            sessionTitleHeader.textContent = currentSession.title || 'Session';
        }
        
        if (sessionDescriptionHeader) {
            if (currentSession.description && currentSession.description.trim()) {
                sessionDescriptionHeader.textContent = currentSession.description;
                sessionDescriptionHeader.style.display = 'block';
            } else {
                sessionDescriptionHeader.style.display = 'none';
            }
        }
    }
    
    document.getElementById('tableTitle').textContent = currentTable.name || `Table ${currentTable.table_number}`;
    document.getElementById('tableStatus').textContent = currentTable.status || 'waiting';
    document.getElementById('tableStatus').className = `status-badge ${currentTable.status || 'waiting'}`;
    
    // Update table code display
    if (currentSession && currentTable) {
        const tableCodeValue = document.getElementById('tableCodeValue');
        if (tableCodeValue) {
            tableCodeValue.textContent = `${currentSession.id}/table/${currentTable.table_number}`;
        }
    }
    
    // Check if current user is already in this table
    const currentParticipantId = localStorage.getItem('currentParticipantId');
    const isAlreadyJoined = currentTable.participants && currentTable.participants.some(p => p && p.id === currentParticipantId);
    
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
            
            // Refresh the dashboard to update the recording count
            if (currentSession) {
                loadSessionDashboard(currentSession.id);
            }
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
    
    if (!transcriptDisplay) {
        console.warn('liveTranscript element not found');
        return;
    }
    
    // Clear initial placeholder message on first transcription
    if (transcriptDisplay.children.length === 1 && transcriptDisplay.children[0].style.textAlign === 'center') {
        transcriptDisplay.innerHTML = '';
        transcriptDisplay.style.border = 'none';
        transcriptDisplay.style.background = '#ffffff';
    }
    
    // Debug logging
    console.log('🎤 displayTranscription called:', {
        hasTranscription: !!data.transcription,
        speakers: data.transcription?.speakers,
        speakersLength: Array.isArray(data.transcription?.speakers) ? data.transcription.speakers.length : 'not array',
        transcript: data.transcription?.transcript,
        source: data.source
    });
    
    if (data.transcription) {
        let speakers = [];
        
        // Parse speakers from different sources
        if (data.transcription.speakers && Array.isArray(data.transcription.speakers)) {
            speakers = data.transcription.speakers;
        } else if (data.transcription.transcript) {
            // Fallback: create single speaker segment
            speakers = [{
                speaker: 0,
                text: data.transcription.transcript,
                start: 0,
                end: 0
            }];
        }
        
        if (speakers.length > 0) {
            // Consolidate consecutive speaker segments
            const consolidatedSpeakers = consolidateSpeakerSegments(speakers);
            
            // Create chat bubbles for each speaker segment
            consolidatedSpeakers.forEach(segment => {
                createChatBubble(segment.speaker, segment.consolidatedText, data.source);
            });
            
            // Auto-scroll to bottom
            transcriptDisplay.scrollTop = transcriptDisplay.scrollHeight;
        }
    }
}

function createChatBubble(speakerIndex, text, source = '') {
    const transcriptDisplay = document.getElementById('liveTranscript');
    if (!transcriptDisplay || !text || text.trim() === '') return;
    
    const speakerNum = (speakerIndex || 0) + 1;
    
    // Check if we can consolidate with the last bubble (same speaker)
    const lastBubble = transcriptDisplay.lastElementChild;
    const canConsolidate = lastBubble && 
                          lastBubble.classList.contains('chat-bubble') &&
                          lastBubble.dataset.speaker === speakerIndex.toString();
    
    if (canConsolidate && source === 'live-transcription') {
        // Append to existing bubble for live transcription
        const textElement = lastBubble.querySelector('.bubble-text');
        if (textElement) {
            textElement.textContent += ' ' + text.trim();
            return;
        }
    }
    
    // Create new chat bubble
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.dataset.speaker = speakerIndex.toString();
    
    // Speaker colors - modern, accessible palette
    const speakerColors = [
        { bg: '#e3f2fd', border: '#2196F3', text: '#1565C0' },  // Blue
        { bg: '#fff3e0', border: '#FF9800', text: '#E65100' },  // Orange
        { bg: '#e8f5e9', border: '#4CAF50', text: '#2E7D32' },  // Green
        { bg: '#fce4ec', border: '#E91E63', text: '#AD1457' },  // Pink
        { bg: '#f3e5f5', border: '#9C27B0', text: '#6A1B9A' }   // Purple
    ];
    
    const colorIndex = (speakerIndex || 0) % speakerColors.length;
    const colors = speakerColors[colorIndex];
    
    bubble.style.cssText = `
        margin: 12px 0;
        padding: 12px 16px;
        border-radius: 12px;
        background: ${colors.bg};
        border-left: 4px solid ${colors.border};
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        position: relative;
        animation: fadeInUp 0.3s ease-out;
        max-width: 85%;
        margin-left: ${speakerIndex % 2 === 0 ? '0' : '15%'};
        margin-right: ${speakerIndex % 2 === 0 ? '15%' : '0'};
    `;
    
    const currentTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const sourceIndicator = source === 'live-transcription' ? '🎙️' : 
                           source === 'upload' ? '📁' : '🎤';
    
    bubble.innerHTML = `
        <div style="font-weight: 600; color: ${colors.text}; margin-bottom: 6px; font-size: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span>Speaker ${speakerNum}</span>
            <span style="font-weight: 400; opacity: 0.7; font-size: 10px;">${sourceIndicator} ${currentTime}</span>
        </div>
        <div class="bubble-text" style="color: #333; line-height: 1.4; word-wrap: break-word;">${text.trim()}</div>
    `;
    
    // Add animation styles if not already present
    if (!document.getElementById('chat-bubble-styles')) {
        const styles = document.createElement('style');
        styles.id = 'chat-bubble-styles';
        styles.textContent = `
            @keyframes fadeInUp {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .chat-bubble:hover {
                transform: translateY(-1px);
                box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                transition: all 0.2s ease;
            }
        `;
        document.head.appendChild(styles);
    }
    
    transcriptDisplay.appendChild(bubble);
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
    
    // Detect context: are we in table view or session view?
    const currentScreen = document.querySelector('.screen.active');
    const isTableInterface = currentScreen && currentScreen.id === 'tableInterface';
    
    if (isTableInterface && currentTable) {
        // Generate table-level analysis
        await generateTableAnalysis();
    } else {
        // Generate session-level analysis
        await generateSessionAnalysis();
    }
}

async function generateTableAnalysis() {
    if (!currentTable) {
        console.error('No table selected');
        return;
    }
    
    showLoading(`Generating analysis for ${currentTable.name}...`);
    
    try {
        const response = await fetch(`/api/tables/${currentTable.id}/analysis/generate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                types: ['summary', 'themes', 'sentiment', 'conflicts', 'agreements']
            })
        });
        
        if (response.ok) {
            const analysisResult = await response.json();
            displayTableAnalysisReport(analysisResult);
            showScreen('analysisReport');
            console.log('Table analysis completed!');
        } else {
            const error = await response.json();
            console.error(`Table analysis failed: ${error.error}`);
            alert(`Analysis failed: ${error.error}`);
        }
    } catch (error) {
        console.error('Error generating table analysis:', error);
        alert('Error generating table analysis. Please check console for details.');
    } finally {
        hideLoading();
    }
}

async function generateSessionAnalysis() {
    showLoading('Generating session-wide analysis...');
    
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
        
        if (response.ok) {
            const analysisResult = await response.json();
            displaySessionAnalysisReport(analysisResult);
            showScreen('analysisReport');
            console.log('Session analysis completed!');
            return analysisResult; // Return the result so it can be used by calling function
        } else {
            const error = await response.json();
            console.error(`Session analysis failed: ${error.error}`);
            alert(`Analysis failed: ${error.error}`);
            return null; // Return null on error
        }
    } catch (error) {
        console.error('Error generating session analysis:', error);
        alert('Error generating session analysis. Please check console for details.');
        return null; // Return null on error
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

function displayTableAnalysisReport(analysisResult) {
    const reportContent = document.getElementById('reportContent');
    const { analyses, table_id, table_number } = analysisResult;
    
    // Extract analysis data from the response structure
    const summary = analyses.summary?.analysis_data || {};
    const themes = analyses.themes?.analysis_data?.themes || [];
    const conflicts = analyses.conflicts?.analysis_data?.conflicts || [];
    const agreements = analyses.agreements?.analysis_data?.agreements || [];
    const sentiment = analyses.sentiment?.analysis_data || {};
    
    reportContent.innerHTML = `
        <div class="analysis-header">
            <h2>Table ${table_number} Analysis Report</h2>
            <p class="analysis-scope">🏓 Table-Level Analysis</p>
            <div class="analysis-meta">
                <span>Table ID: ${table_id}</span>
                <span>Generated: ${new Date().toLocaleString()}</span>
                <span>🤖 AI-Powered Analysis</span>
            </div>
        </div>
        
        <div class="analysis-summary">
            <h3>Analysis Summary</h3>
            <div class="summary-stats">
                <div class="stat-card">
                    <span class="stat-value">${conflicts.length || 0}</span>
                    <span class="stat-label">Conflicts Detected</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${agreements.length || 0}</span>
                    <span class="stat-label">Agreements Found</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${themes.length || 0}</span>
                    <span class="stat-label">Main Themes</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">${summary.recording_stats?.total_recordings || 0}</span>
                    <span class="stat-label">Recordings Analyzed</span>
                </div>
            </div>
        </div>
        
        ${summary.key_insights ? `
            <div class="analysis-section">
                <h4>📋 Key Insights</h4>
                <ul class="insights-list">
                    ${summary.key_insights.map(insight => `<li>${insight}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        
        ${sentiment.overall !== undefined ? `
            <div class="analysis-section">
                <h4>😊 Sentiment Analysis</h4>
                <div class="sentiment-display">
                    <div class="sentiment-score">
                        <span class="score-value">${sentiment.overall > 0 ? '+' : ''}${(sentiment.overall * 100).toFixed(0)}%</span>
                        <span class="score-label">${sentiment.interpretation || 'Mixed'}</span>
                    </div>
                    ${sentiment.insights ? `
                        <div class="sentiment-insights">
                            <h5>Sentiment Insights:</h5>
                            <ul>${sentiment.insights.map(insight => `<li>${insight}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                </div>
            </div>
        ` : ''}
        
        ${themes.length > 0 ? `
            <div class="analysis-section">
                <h4>🎨 Main Themes</h4>
                <div class="themes-list">
                    ${themes.map(theme => `
                        <div class="theme-item">
                            <h5>${theme.theme}</h5>
                            <p>${theme.description || 'No description available'}</p>
                            <div class="theme-meta">
                                <small>Mentioned ${theme.frequency || 0} times</small>
                                ${theme.sentiment ? `<span class="theme-sentiment ${theme.sentiment > 0 ? 'positive' : theme.sentiment < 0 ? 'negative' : 'neutral'}">${theme.sentiment > 0 ? '😊' : theme.sentiment < 0 ? '😔' : '😐'}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${conflicts.length > 0 ? `
            <div class="analysis-section">
                <h4>⚡ Conflicts & Disagreements</h4>
                <div class="conflicts-list">
                    ${conflicts.map(conflict => `
                        <div class="conflict-item">
                            <div class="conflict-header">
                                <span class="conflict-severity">Severity: ${((conflict.severity || 0) * 100).toFixed(0)}%</span>
                                <span class="table-ref">Table ${table_number}</span>
                            </div>
                            <p class="conflict-text">"${conflict.text || 'No text available'}"</p>
                            <p class="conflict-description">${conflict.description || 'No description available'}</p>
                            ${conflict.context ? `<small class="conflict-context">Context: ${conflict.context}</small>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        ${agreements.length > 0 ? `
            <div class="analysis-section">
                <h4>🤝 Agreements & Consensus</h4>
                <div class="agreements-list">
                    ${agreements.map(agreement => `
                        <div class="agreement-item">
                            <div class="agreement-header">
                                <span class="agreement-strength">Strength: ${((agreement.strength || 0) * 100).toFixed(0)}%</span>
                                <span class="table-ref">Table ${table_number}</span>
                            </div>
                            <p class="agreement-text">"${agreement.text || 'No text available'}"</p>
                            <p class="agreement-description">${agreement.description || 'No description available'}</p>
                            ${agreement.context ? `<small class="agreement-context">Context: ${agreement.context}</small>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        <div class="analysis-actions">
            <button onclick="viewSessionAnalysis()" class="btn btn-secondary">📊 View Session Analysis</button>
            <button onclick="compareWithOtherTables()" class="btn btn-secondary">🏓 Compare Tables</button>
        </div>
    `;
}

function displaySessionAnalysisReport(analysisResult) {
    // Helper function to get proper table number from table ID
    function getTableNumber(tableId) {
        // Convert to number if it's a string
        const numericTableId = typeof tableId === 'string' ? parseInt(tableId) : tableId;
        
        // Always try to find the table in currentSession first to get the correct table_number
        if (currentSession && currentSession.tables && currentSession.tables.length > 0) {
            const table = currentSession.tables.find(t => {
                // Match by database ID (t.id) which maps to the large numbers like 384, 385
                return t.id == numericTableId;
            });
            
            if (table && table.table_number) {
                return table.table_number;
            }
            
            // If no match by ID, check if the input is already a table_number
            const tableByNumber = currentSession.tables.find(t => t.table_number == numericTableId);
            if (tableByNumber) {
                return tableByNumber.table_number;
            }
        }
        
        // If it's a small number (1-20), it might already be a table number
        if (typeof numericTableId === 'number' && numericTableId >= 1 && numericTableId <= 20) {
            return numericTableId;
        }
        
        // Return original value as fallback
        return tableId;
    }
    
    const reportContent = document.getElementById('reportContent');
    const reportTitle = document.getElementById('reportTitle');
    const reportSubtitle = document.getElementById('reportSubtitle');
    const reportMeta = document.getElementById('reportMeta');
    
    const { analyses, session_title } = analysisResult;
    
    // Extract analysis data from the response structure
    const summary = analyses.summary?.analysis_data || {};
    const themes = analyses.themes?.analysis_data?.themes || [];
    const conflicts = analyses.conflicts?.analysis_data?.conflicts || [];
    const agreements = analyses.agreements?.analysis_data?.agreements || [];
    const sentiment = analyses.sentiment?.analysis_data || {};
    
    // Update header
    reportTitle.textContent = `${session_title} - Analysis Report`;
    reportSubtitle.textContent = `Comprehensive insights from your World Café session`;
    
    reportMeta.innerHTML = `
        <span style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">📊</span>
            Generated: ${new Date().toLocaleString()}
        </span>
        <span style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">🤖</span>
            AI-Powered Analysis
        </span>
        <span style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 16px;">🌐</span>
            Session-Wide Scope
        </span>
    `;
    
    reportContent.innerHTML = `
        <!-- Key Metrics Overview -->
        <div style="
            background: linear-gradient(135deg, #f8f9fa, #fff);
            border-radius: 16px;
            padding: 30px;
            border: 1px solid #e0e0e0;
        ">
            <h3 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: #333; display: flex; align-items: center; gap: 12px;">
                <span style="font-size: 28px;">📈</span>
                Key Metrics Overview
            </h3>
            <div style="
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 24px;
            ">
                <div style="
                    background: linear-gradient(135deg, #667eea, #764ba2);
                    color: white;
                    padding: 24px;
                    border-radius: 12px;
                    text-align: center;
                    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
                ">
                    <div style="font-size: 36px; font-weight: 700; margin-bottom: 8px;">${themes.length || 0}</div>
                    <div style="font-size: 14px; opacity: 0.9;">Main Themes</div>
                </div>
                <div style="
                    background: linear-gradient(135deg, #f093fb, #f5576c);
                    color: white;
                    padding: 24px;
                    border-radius: 12px;
                    text-align: center;
                    box-shadow: 0 4px 12px rgba(240, 147, 251, 0.3);
                ">
                    <div style="font-size: 36px; font-weight: 700; margin-bottom: 8px;">${agreements.length || 0}</div>
                    <div style="font-size: 14px; opacity: 0.9;">Agreements Found</div>
                </div>
                <div style="
                    background: linear-gradient(135deg, #4facfe, #00f2fe);
                    color: white;
                    padding: 24px;
                    border-radius: 12px;
                    text-align: center;
                    box-shadow: 0 4px 12px rgba(79, 172, 254, 0.3);
                ">
                    <div style="font-size: 36px; font-weight: 700; margin-bottom: 8px;">${conflicts.length || 0}</div>
                    <div style="font-size: 14px; opacity: 0.9;">Conflicts Identified</div>
                </div>
                <div style="
                    background: linear-gradient(135deg, #fa709a, #fee140);
                    color: white;
                    padding: 24px;
                    border-radius: 12px;
                    text-align: center;
                    box-shadow: 0 4px 12px rgba(250, 112, 154, 0.3);
                ">
                    <div style="font-size: 36px; font-weight: 700; margin-bottom: 8px;">${Object.keys(sentiment.byTable || {}).length}</div>
                    <div style="font-size: 14px; opacity: 0.9;">Tables Analyzed</div>
                </div>
            </div>
        </div>

        ${summary.key_insights ? `
            <div style="
                background: white;
                border-radius: 16px;
                padding: 30px;
                border: 1px solid #e0e0e0;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <h3 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: #333; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 28px;">💡</span>
                    Key Session Insights
                </h3>
                <div style="display: flex; flex-direction: column; gap: 16px;">
                    ${summary.key_insights.map(insight => `
                        <div style="
                            background: #f8f9fa;
                            padding: 20px;
                            border-radius: 12px;
                            border-left: 4px solid #667eea;
                            font-size: 16px;
                            line-height: 1.6;
                        ">${insight}</div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${sentiment.overall !== undefined ? `
            <div style="
                background: white;
                border-radius: 16px;
                padding: 30px;
                border: 1px solid #e0e0e0;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <h3 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: #333; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 28px;">${sentiment.overall > 0.1 ? '😊' : sentiment.overall < -0.1 ? '😔' : '😐'}</span>
                    Session Sentiment Analysis
                </h3>
                <div style="margin-bottom: 24px; text-align: center;">
                    <div style="
                        display: inline-block;
                        padding: 16px 32px;
                        border-radius: 50px;
                        background: linear-gradient(135deg, ${sentiment.overall > 0.1 ? '#28a745, #20c997' : sentiment.overall < -0.1 ? '#dc3545, #fd7e14' : '#6c757d, #adb5bd'});
                        color: white;
                        font-size: 24px;
                        font-weight: 700;
                        margin-bottom: 8px;
                    ">
                        ${sentiment.overall > 0 ? '+' : ''}${(sentiment.overall * 100).toFixed(0)}%
                    </div>
                    <div style="font-size: 18px; color: #666; font-weight: 500;">
                        ${sentiment.interpretation || 'Mixed Sentiment'}
                    </div>
                </div>
                ${sentiment.byTable ? `
                    <h4 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 600; color: #333;">Sentiment by Table:</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
                        ${Object.entries(sentiment.byTable).map(([tableId, score]) => `
                            <div style="
                                background: #f8f9fa;
                                padding: 20px;
                                border-radius: 12px;
                                text-align: center;
                                border: 2px solid ${score > 0.1 ? '#28a745' : score < -0.1 ? '#dc3545' : '#6c757d'};
                            ">
                                <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px; color: #333;">
                                    Table ${getTableNumber(tableId)}
                                </div>
                                <div style="
                                    font-size: 20px; 
                                    font-weight: 700; 
                                    color: ${score > 0.1 ? '#28a745' : score < -0.1 ? '#dc3545' : '#6c757d'};
                                ">
                                    ${score > 0 ? '+' : ''}${(score * 100).toFixed(0)}%
                                </div>
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
            </div>
        ` : ''}

        ${themes.length > 0 ? `
            <div style="
                background: white;
                border-radius: 16px;
                padding: 30px;
                border: 1px solid #e0e0e0;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <h3 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: #333; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 28px;">🎨</span>
                    Cross-Table Themes
                </h3>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
                    ${themes.map(theme => `
                        <div style="
                            background: linear-gradient(135deg, #f8f9fa, #fff);
                            border: 1px solid #e0e0e0;
                            border-radius: 12px;
                            padding: 24px;
                            transition: all 0.2s ease;
                        " onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='none'">
                            <h4 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 600; color: #333;">${theme.theme}</h4>
                            <p style="margin: 0 0 16px 0; color: #666; line-height: 1.6; font-size: 14px;">${theme.description || 'No description available'}</p>
                            <div style="display: flex; justify-content: space-between; align-items: center; gap: 16px;">
                                <div style="display: flex; gap: 16px; font-size: 12px; color: #888;">
                                    <span>🔄 ${theme.frequency || 0}x mentioned</span>
                                    ${theme.tables ? `<span>📍 Tables: ${Object.keys(theme.tables).map(getTableNumber).join(', ')}</span>` : ''}
                                </div>
                                ${theme.sentiment ? `<span style="font-size: 20px;">${theme.sentiment > 0 ? '😊' : theme.sentiment < 0 ? '😔' : '😐'}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${agreements.length > 0 ? `
            <div style="
                background: white;
                border-radius: 16px;
                padding: 30px;
                border: 1px solid #e0e0e0;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <h3 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: #333; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 28px;">🤝</span>
                    Session-Wide Agreements
                </h3>
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    ${agreements.map(agreement => `
                        <div style="
                            background: linear-gradient(135deg, #e8f5e8, #f0fdf0);
                            border: 1px solid #28a745;
                            border-left: 6px solid #28a745;
                            border-radius: 12px;
                            padding: 24px;
                        ">
                            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 12px; gap: 16px;">
                                <span style="
                                    background: #28a745;
                                    color: white;
                                    padding: 6px 12px;
                                    border-radius: 20px;
                                    font-size: 12px;
                                    font-weight: 600;
                                ">
                                    Strength: ${((agreement.strength || 0) * 100).toFixed(0)}%
                                </span>
                                ${agreement.tableId ? `<span style="
                                    background: #17a2b8;
                                    color: white;
                                    padding: 6px 12px;
                                    border-radius: 20px;
                                    font-size: 12px;
                                    font-weight: 600;
                                ">Table ${getTableNumber(agreement.tableId)}</span>` : ''}
                            </div>
                            <blockquote style="
                                margin: 0 0 16px 0;
                                font-size: 16px;
                                font-style: italic;
                                color: #2d5a2d;
                                border-left: 3px solid #28a745;
                                padding-left: 16px;
                            ">"${agreement.text || 'No text available'}"</blockquote>
                            <p style="margin: 0 0 8px 0; color: #495057; font-size: 15px; line-height: 1.5;">${agreement.description || 'No description available'}</p>
                            ${agreement.context ? `<small style="color: #6c757d; font-style: italic;">Context: ${agreement.context}</small>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${conflicts.length > 0 ? `
            <div style="
                background: white;
                border-radius: 16px;
                padding: 30px;
                border: 1px solid #e0e0e0;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            ">
                <h3 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 700; color: #333; display: flex; align-items: center; gap: 12px;">
                    <span style="font-size: 28px;">⚡</span>
                    Session-Wide Conflicts
                </h3>
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    ${conflicts.map(conflict => `
                        <div style="
                            background: linear-gradient(135deg, #ffeaa7, #fab1a0);
                            border: 1px solid #e17055;
                            border-left: 6px solid #e17055;
                            border-radius: 12px;
                            padding: 24px;
                        ">
                            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 12px; gap: 16px;">
                                <span style="
                                    background: #e17055;
                                    color: white;
                                    padding: 6px 12px;
                                    border-radius: 20px;
                                    font-size: 12px;
                                    font-weight: 600;
                                ">
                                    Severity: ${((conflict.severity || 0) * 100).toFixed(0)}%
                                </span>
                                ${conflict.tableId ? `<span style="
                                    background: #6c757d;
                                    color: white;
                                    padding: 6px 12px;
                                    border-radius: 20px;
                                    font-size: 12px;
                                    font-weight: 600;
                                ">Table ${getTableNumber(conflict.tableId)}</span>` : ''}
                            </div>
                            <blockquote style="
                                margin: 0 0 16px 0;
                                font-size: 16px;
                                font-style: italic;
                                color: #8b4513;
                                border-left: 3px solid #e17055;
                                padding-left: 16px;
                            ">"${conflict.text || 'No text available'}"</blockquote>
                            <p style="margin: 0 0 8px 0; color: #495057; font-size: 15px; line-height: 1.5;">${conflict.description || 'No description available'}</p>
                            ${conflict.context ? `<small style="color: #6c757d; font-style: italic;">Context: ${conflict.context}</small>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
    `;
}

async function viewSessionAnalysis() {
    if (!currentSession) return;
    
    showLoading('Loading session analysis...');
    try {
        await generateSessionAnalysis();
    } catch (error) {
        console.error('Error loading session analysis:', error);
    }
}

async function viewTableAnalyses() {
    // This would show a list of all table analyses for the session
    alert('Table analyses view - to be implemented');
}

async function compareWithOtherTables() {
    // This would show a comparison view between different tables
    alert('Table comparison view - to be implemented');
}

async function exportAnalysisData() {
    // This would export the analysis data
    alert('Export functionality - to be implemented');
}

// Session Dashboard AI Analysis Functions
async function generateSessionAnalysisFromDashboard() {
    if (!currentSession) {
        alert('No session selected');
        return;
    }
    
    const analysisBtn = document.getElementById('sessionAIAnalysisBtn');
    const sessionAIAnalysisSection = document.getElementById('sessionAIAnalysisSection');
    const sessionAIAnalysisResults = document.getElementById('sessionAIAnalysisResults');
    
    // Disable button and show loading
    analysisBtn.disabled = true;
    analysisBtn.textContent = '🤖 Generating...';
    
    // Show analysis section with loading
    sessionAIAnalysisSection.style.display = 'block';
    sessionAIAnalysisResults.innerHTML = `
        <div class="analysis-loading">
            <div class="spinner"></div>
            <p>AI is analyzing all session transcriptions...</p>
            <small>This may take a few minutes depending on the amount of content.</small>
        </div>
    `;
    
    try {
        const analysisResult = await generateSessionAnalysis();
        
        // Display the result in the session dashboard section
        displaySessionAnalysisInDashboard(analysisResult);
        
        // Add success message
        const successDiv = document.createElement('div');
        successDiv.className = 'analysis-success';
        successDiv.innerHTML = '✅ Session AI analysis completed successfully!';
        sessionAIAnalysisResults.insertBefore(successDiv, sessionAIAnalysisResults.firstChild);
        
        // Remove success message after 3 seconds
        setTimeout(() => {
            if (successDiv.parentNode) {
                successDiv.parentNode.removeChild(successDiv);
            }
        }, 3000);
        
    } catch (error) {
        console.error('Error generating session AI analysis:', error);
        sessionAIAnalysisResults.innerHTML = `
            <div class="analysis-error">
                <h3>❌ Session Analysis Failed</h3>
                <p>${error.message || 'An error occurred while generating the analysis.'}</p>
                <small>Please try again or check if the AI service is available.</small>
            </div>
        `;
    } finally {
        // Re-enable button
        analysisBtn.disabled = false;
        analysisBtn.textContent = '🤖 AI Analysis';
    }
}

function displaySessionAnalysisInDashboard(analysisResult) {
    const sessionAIAnalysisResults = document.getElementById('sessionAIAnalysisResults');
    
    // Check if analysisResult is valid
    if (!analysisResult) {
        sessionAIAnalysisResults.innerHTML = `
            <div class="analysis-error">
                <h3>❌ Session Analysis Failed</h3>
                <p>analysisResult is undefined</p>
                <small>Please try again or check if the AI service is available.</small>
            </div>
        `;
        return;
    }
    
    const { analyses, session_title } = analysisResult;
    
    // Extract analysis data from the response structure
    const summary = analyses.summary?.analysis_data || {};
    const themes = analyses.themes?.analysis_data?.themes || [];
    const conflicts = analyses.conflicts?.analysis_data?.conflicts || [];
    const agreements = analyses.agreements?.analysis_data?.agreements || [];
    const sentiment = analyses.sentiment?.analysis_data || {};
    
    sessionAIAnalysisResults.innerHTML = `
        <div class="analysis-summary-dashboard">
            <h3>📊 Session Analysis Summary</h3>
            <div class="summary-stats-grid">
                <div class="stat-card-mini">
                    <span class="stat-value">${themes.length || 0}</span>
                    <span class="stat-label">Main Themes</span>
                </div>
                <div class="stat-card-mini">
                    <span class="stat-value">${conflicts.length || 0}</span>
                    <span class="stat-label">Conflicts</span>
                </div>
                <div class="stat-card-mini">
                    <span class="stat-value">${agreements.length || 0}</span>
                    <span class="stat-label">Agreements</span>
                </div>
                <div class="stat-card-mini ${sentiment.overall > 0.1 ? 'positive' : sentiment.overall < -0.1 ? 'negative' : 'neutral'}">
                    <span class="stat-value">${sentiment.overall ? (sentiment.overall * 100).toFixed(0) + '%' : 'N/A'}</span>
                    <span class="stat-label">Sentiment</span>
                </div>
            </div>
        </div>
        
        ${themes.length > 0 ? `
            <div class="analysis-section-compact">
                <h4>🎨 Top Session Themes</h4>
                <div class="themes-compact">
                    ${themes.slice(0, 3).map(theme => `
                        <div class="theme-tag">
                            <span class="theme-name">${theme.theme}</span>
                            <span class="theme-frequency">${theme.frequency || 0}×</span>
                        </div>
                    `).join('')}
                    ${themes.length > 3 ? `<div class="theme-tag more">+${themes.length - 3} more</div>` : ''}
                </div>
            </div>
        ` : ''}
        
        ${sentiment.byTable ? `
            <div class="analysis-section-compact">
                <h4>😊 Table Sentiments</h4>
                <div class="table-sentiments-compact">
                    ${Object.entries(sentiment.byTable).slice(0, 6).map(([tableId, score]) => `
                        <div class="table-sentiment-compact">
                            <span class="table-label">Table ${tableId}</span>
                            <span class="sentiment-indicator ${score > 0.1 ? 'positive' : score < -0.1 ? 'negative' : 'neutral'}">
                                ${score > 0.1 ? '😊' : score < -0.1 ? '😔' : '😐'}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        
        <div class="analysis-actions-dashboard">
            <button onclick="viewFullSessionAnalysisReport()" class="btn btn-primary">📋 View Full Report</button>
            <button onclick="viewTableAnalyses()" class="btn btn-secondary">🏓 Table Breakdown</button>
        </div>
    `;
}

async function viewFullSessionAnalysisReport() {
    // Navigate to the full analysis report
    await generateSessionAnalysis();
}

function toggleSessionAIAnalysis() {
    const sessionAIAnalysisSection = document.getElementById('sessionAIAnalysisSection');
    sessionAIAnalysisSection.style.display = sessionAIAnalysisSection.style.display === 'none' ? 'block' : 'none';
}

// Make sure the session dashboard analysis button calls the right function
if (typeof window !== 'undefined') {
    // Override the inline onclick for the session dashboard button
    document.addEventListener('DOMContentLoaded', function() {
        const sessionAnalysisBtn = document.getElementById('sessionAIAnalysisBtn');
        if (sessionAnalysisBtn) {
            sessionAnalysisBtn.onclick = generateSessionAnalysisFromDashboard;
        }
    });
}

// Simple Session Chat Functions
let simpleChatAvailable = false;

function initializeSimpleChat() {
    if (currentSession) {
        checkSimpleChatStatus();
        
        // Add Enter key handler
        const input = document.getElementById('simpleChatInput');
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendSimpleChatMessage();
                }
            });
        }
    }
}

async function checkSimpleChatStatus() {
    if (!currentSession) {
        updateSimpleChatStatus('No session selected', false);
        return;
    }
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/chat/status`);
        const status = await response.json();
        
        if (response.ok) {
            simpleChatAvailable = status.available && status.hasTranscriptions;
            
            if (!status.available) {
                updateSimpleChatStatus('Service unavailable', false);
            } else if (!status.hasTranscriptions) {
                updateSimpleChatStatus('No transcriptions yet', false);
                updateSimpleTranscriptCount(0);
            } else {
                updateSimpleChatStatus('Ready to chat!', true);
                updateSimpleTranscriptCount(status.transcriptionCount);
            }
        } else {
            updateSimpleChatStatus('Connection error', false);
        }
    } catch (error) {
        console.error('Error checking simple chat status:', error);
        updateSimpleChatStatus('Connection error', false);
    }
}

function updateSimpleChatStatus(message, available) {
    // Update chatbot elements
    const statusText = document.getElementById('simpleChatStatus');
    const chatInput = document.getElementById('simpleChatInput');
    const sendBtn = document.getElementById('simpleSendBtn');
    
    if (statusText) statusText.textContent = message;
    if (chatInput) {
        chatInput.disabled = !available;
        // Update placeholder based on availability
        if (available) {
            chatInput.placeholder = "Ask about the discussions, insights, themes...";
        } else {
            chatInput.placeholder = "Chat unavailable - " + message.toLowerCase();
        }
    }
    if (sendBtn) {
        sendBtn.disabled = !available;
        sendBtn.textContent = available ? 'Send' : 'Unavailable';
    }
    
    simpleChatAvailable = available;
}

function updateSimpleTranscriptCount(count) {
    const countSpan = document.getElementById('simpleTranscriptCount');
    if (countSpan) {
        countSpan.textContent = `${count} transcription${count !== 1 ? 's' : ''}`;
    }
}

async function sendSimpleChatMessage() {
    const chatInput = document.getElementById('simpleChatInput');
    const sendBtn = document.getElementById('simpleSendBtn');
    const message = chatInput.value.trim();
    
    if (!message || !simpleChatAvailable || !currentSession) {
        return;
    }
    
    // Add user message
    addSimpleMessage('user', message);
    
    // Clear input and disable controls
    chatInput.value = '';
    chatInput.disabled = true;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Thinking...';
    
    // Add loading message
    const loadingId = addSimpleMessage('ai', '🤔 Analyzing...');
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message })
        });
        
        const result = await response.json();
        
        // Remove loading message
        removeSimpleMessage(loadingId);
        
        if (response.ok && result.success) {
            addSimpleMessage('ai', result.response);
        } else {
            let errorMsg = result.error || 'Failed to get response';
            if (result.suggestion) {
                errorMsg += '\n\n💡 ' + result.suggestion;
            }
            addSimpleMessage('error', errorMsg);
        }
        
    } catch (error) {
        console.error('Chat error:', error);
        removeSimpleMessage(loadingId);
        addSimpleMessage('error', 'Network error - please try again');
    } finally {
        // Re-enable controls
        chatInput.disabled = !simpleChatAvailable;
        sendBtn.disabled = !simpleChatAvailable;
        sendBtn.textContent = 'Send';
        if (simpleChatAvailable) {
            chatInput.focus();
        }
    }
}


function addSimpleMessage(type, content) {
    const messagesDiv = document.getElementById('simpleChatMessages');
    const messageId = 'simple-msg-' + Date.now();
    
    // Clear welcome message if this is the first real message
    const welcomeMsg = messagesDiv.querySelector('[style*="text-align: center"]');
    if (welcomeMsg && (type === 'user' || type === 'ai')) {
        welcomeMsg.remove();
    }
    
    const messageDiv = document.createElement('div');
    messageDiv.id = messageId;
    messageDiv.style.cssText = `
        margin-bottom: 16px;
        padding: 16px 20px;
        border-radius: 12px;
        animation: fadeIn 0.3s ease;
        max-width: 100%;
        word-wrap: break-word;
        line-height: 1.5;
    `;
    
    // Style based on message type
    if (type === 'user') {
        messageDiv.style.cssText += `
            background: rgba(255,255,255,0.9);
            color: #333;
            margin-left: 20%;
            border-bottom-right-radius: 4px;
        `;
        messageDiv.innerHTML = `<div style="font-weight: 500; margin-bottom: 4px; color: #666; font-size: 12px;">You</div>${content.replace(/\n/g, '<br>')}`;
    } else if (type === 'ai') {
        messageDiv.style.cssText += `
            background: rgba(255,255,255,0.2);
            color: white;
            margin-right: 20%;
            border-bottom-left-radius: 4px;
            border: 1px solid rgba(255,255,255,0.3);
        `;
        messageDiv.innerHTML = `<div style="font-weight: 500; margin-bottom: 4px; color: rgba(255,255,255,0.8); font-size: 12px; display: flex; align-items: center; gap: 6px;"><span>🤖</span> AI Assistant</div>${content.replace(/\n/g, '<br>')}`;
    } else if (type === 'error') {
        messageDiv.style.cssText += `
            background: rgba(220, 53, 69, 0.2);
            color: #ff6b6b;
            border: 1px solid rgba(220, 53, 69, 0.3);
        `;
        messageDiv.innerHTML = `<div style="font-weight: 500; margin-bottom: 4px; font-size: 12px;">❌ Error</div>${content.replace(/\n/g, '<br>')}`;
    }
    
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    return messageId;
}

function removeSimpleMessage(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
        message.remove();
    }
}

function addMessageToChat(type, content, isLoading = false) {
    const chatMessages = document.getElementById('chatMessages');
    const messageId = 'msg-' + Date.now();
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;
    messageDiv.id = messageId;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (type === 'error') {
        contentDiv.innerHTML = `<div class="error-message">❌ ${content.replace(/\n/g, '<br>')}</div>`;
    } else if (isLoading) {
        contentDiv.innerHTML = `<div class="loading-message">${content}</div>`;
    } else {
        // Format the content with basic markdown-like formatting
        const formattedContent = content
            .replace(/\n/g, '<br>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>');
        contentDiv.innerHTML = formattedContent;
    }
    
    messageDiv.appendChild(contentDiv);
    chatMessages.appendChild(messageDiv);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return messageId;
}

function removeMessageFromChat(messageId) {
    const message = document.getElementById(messageId);
    if (message) {
        message.remove();
    }
}

// Handle Enter key in chat input
document.addEventListener('DOMContentLoaded', function() {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }
});

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

function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) {
        console.warn('Toast container not found, falling back to console log');
        console.log(`[${type.toUpperCase()}] ${message}`);
        return;
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <div class="toast-content">
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span class="toast-message">${message}</span>
            <button class="toast-close" onclick="this.parentElement.parentElement.remove()">✕</button>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, 5000);
}

function showLoading(message = 'Loading...') {
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingMessage = document.getElementById('loadingMessage');
    
    if (loadingMessage) {
        loadingMessage.textContent = message;
    }
    if (loadingOverlay) {
        loadingOverlay.style.display = 'flex';
    }
}

function hideLoading() {
    const loadingOverlay = document.getElementById('loadingOverlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = 'none';
    }
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
    // Note: qrScanBtn moved to Join Session page as joinSessionQRBtn
    const mobileScanner = document.getElementById('mobileScanner');
    const qrVideo = document.getElementById('qrVideo');
    
    if (mobileScanner && qrVideo) {
        // Enhanced scanner functionality can be added here if needed
        // The scanner is now triggered from showJoinQRScanner() function
        console.log('Enhanced QR scanner initialized for join session context');
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