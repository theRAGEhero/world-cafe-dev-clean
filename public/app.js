// Mobile-First World Café Platform JavaScript

// Global variables
let socket;
let currentSession = null;
let currentTable = null;
let previousTable = null;
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

function showElement(element) {
    if (!element) return;
    element.classList.remove('is-hidden');
    element.removeAttribute('hidden');
    element.style.removeProperty('display');
}

function hideElement(element) {
    if (!element) return;
    element.classList.add('is-hidden');
    element.setAttribute('hidden', '');
    element.style.removeProperty('display');
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
        const navMenu = document.getElementById('navMenu');
        const menuToggle = document.getElementById('mobileMenuToggle');
        
        if (mobileMenuOpen && navMenu && menuToggle) {
            // Check if click is outside the menu and toggle button
            if (!navMenu.contains(e.target) && !menuToggle.contains(e.target)) {
                mobileMenuOpen = false;
                navMenu.classList.remove('show');
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

// Get user-friendly source label
function getSourceLabel(source) {
    switch (source) {
        case 'live-transcription':
            return 'Live Transcription';
        case 'live-audio':
            return 'Live Audio Recording';
        case 'start-recording':
        case 'recording':
            return 'Browser Recording';
        case 'upload-media':
        case 'upload':
            return 'Uploaded Media';
        case 'reprocess':
            return 'Reprocessed Audio';
        default:
            return source || 'Unknown';
    }
}

// Display existing transcriptions with speaker diarization
function displayExistingTranscriptions(transcriptions) {
    // Get the single transcription container
    const liveTranscriptionContent = document.getElementById('liveTranscriptionContent');
    
    // Clear transcription content when switching tables to show only current table's transcriptions
    if (liveTranscriptionContent) {
        liveTranscriptionContent.innerHTML = '';
        console.log('📝 Cleared transcription content for table switch');
    }
    
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
                console.log('📝 Upload Media - Parsed speaker segments:', speakers.length, 'segments for transcription:', transcription.id);
                console.log('📝 First segment example:', speakers[0]);
            }
            // Fallback to speakers field (legacy)
            else if (transcription.speakers) {
                if (typeof transcription.speakers === 'string') {
                    speakers = JSON.parse(transcription.speakers);
                } else if (Array.isArray(transcription.speakers)) {
                    speakers = transcription.speakers;
                }
                console.log('📝 Upload Media - Using legacy speakers field:', speakers.length, 'segments');
            }
            else {
                console.log('📝 Upload Media - No speaker segments found for transcription:', transcription.id);
            }
        } catch (e) {
            console.error('Error parsing speaker segments:', e);
            speakers = [];
        }
        
        const createdAt = new Date(transcription.created_at).toLocaleString();
        const confidence = transcription.confidence ? `${(transcription.confidence * 100).toFixed(1)}% confidence` : '';
        
        if (speakers && speakers.length > 0) {
            // Consolidate consecutive speaker segments
            console.log('📝 Consolidating', speakers.length, 'speaker segments');
            const consolidatedSpeakers = consolidateSpeakerSegments(speakers);
            console.log('📝 After consolidation:', consolidatedSpeakers.length, 'segments');
            
            // Add metadata header with source information
            const metaDiv = document.createElement('div');
            metaDiv.className = 'transcript-meta';
            metaDiv.style.cssText = 'margin-bottom: 8px; padding: 8px; background: #f5f5f5; border-radius: 6px; font-size: 12px; color: #666; display: flex; gap: 12px; flex-wrap: wrap;';
            
            // Get user-friendly source name
            const sourceLabel = getSourceLabel(transcription.source);
            
            metaDiv.innerHTML = `
                <span><strong>Recording ${transcriptions.length - index}</strong></span>
                <span><strong>Source:</strong> ${sourceLabel}</span>
                <span>${createdAt}</span>
                <span>${confidence}</span>
            `;
            transcriptItem.appendChild(metaDiv);
            
            // Create chat bubbles for each speaker segment  
            consolidatedSpeakers.forEach(segment => {
                createChatBubble(segment.speaker, segment.consolidatedText, transcription.source, transcriptItem);
            });
        } else {
            console.log('📝 No speaker segments found, skipping transcription:', transcription.id);
            // Skip transcriptions without diarization
            return;
        }
        
        // Route all transcriptions to the single live transcription container
        let targetContainer = liveTranscriptionContent;
        
        if (targetContainer) {
            // Check if there are active live chat bubbles to avoid duplication
            const existingBubbles = targetContainer.querySelectorAll('.chat-bubble');
            const isLiveSource = transcription.source === 'live-transcription' || transcription.source === 'live-audio';
            if (existingBubbles.length > 0 && isLiveSource) {
                // Skip saved live transcriptions when there are already live bubbles to avoid duplication
                console.log(`📝 Skipping saved live transcription (${transcription.source}) to avoid duplication with ${existingBubbles.length} live bubbles`);
                return; // Skip this transcription
            } else {
                // Safe to add transcription - either no active bubbles or not a live transcription
                targetContainer.appendChild(transcriptItem);
                console.log(`📝 Added transcription from source "${transcription.source}" to live transcription container`);
            }
        }
    });
    
    // Add empty message if no content is displayed
    if (liveTranscriptionContent) {
        const existingBubbles = liveTranscriptionContent.querySelectorAll('.chat-bubble');
        const existingTranscripts = liveTranscriptionContent.querySelectorAll('.transcript-item');
        if (existingBubbles.length === 0 && existingTranscripts.length === 0 && liveTranscriptionContent.innerHTML.trim() === '') {
            const emptyMessage = '<p style="color: #666; font-style: italic; text-align: center; padding: 2rem;">No transcriptions available yet.</p>';
            liveTranscriptionContent.innerHTML = emptyMessage;
        }
    }
    
    // Update tab counts
    if (typeof updateTranscriptionTabCounts === 'function') {
        updateTranscriptionTabCounts();
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
        if (typeof updateTableDisplay === 'function') {
            updateTableDisplay(data.tableId, data.table);
        } else {
            console.log('Table updated:', data);
        }
    });
    
    socket.on('recording-status', (data) => {
        updateRecordingStatus(data);
    });
    
    socket.on('transcription-completed', (data) => {
        console.log('📝 Received transcription-completed event:', data);
        displayTranscription(data);
        updateTableTranscriptionCount(data.tableId);
        // Refresh recordings list to show new recording
        loadTableRecordings();
    });
    
    // New socket events for table status indicators
    socket.on('table-client-update', (data) => {
        console.log('👥 Table client update:', data);
        updateTableConnectionStatus(data.tableId, data.hasClients, data.clientCount);
    });
    
    socket.on('table-recording-update', (data) => {
        console.log('🎙️ Table recording update:', data);
        updateTableRecordingStatus(data.tableId, data.status, data.timestamp);
    });
    
    // Live transcription WebSocket event handlers
    socket.on('live-transcription-started', () => {
        console.log('🎤 Live transcription started successfully');
    });
    
    socket.on('live-transcription-result', (data) => {
        console.log(`📥 Live transcription result received from server:`, data);
        console.log(`📥 Transcript: "${data.transcript}", isFinal: ${data.is_final}, timestamp: ${data.timestamp}`);
        
        // Ensure we only process non-empty transcripts
        if (data.transcript && data.transcript.trim()) {
            displayLiveTranscriptionResult(data.transcript, data.is_final);
        } else {
            console.log('📥 Skipping empty transcript');
        }
    });
    
    socket.on('live-transcription-error', (data) => {
        console.error('❌ Live transcription error:', data.error);
        showToast(`Live transcription error: ${data.error}`, 'error');
        stopLiveTranscription();
    });
    
    socket.on('live-transcription-ended', () => {
        console.log('🔌 Live transcription connection ended');
        showToast('Live transcription connection ended', 'info');
    });
    
    socket.on('live-transcription-stopped', () => {
        console.log('🛑 Live transcription stopped');
    });

    // Reprocess status event handlers
    socket.on('reprocess-status', (data) => {
        console.log('🔄 Reprocess status update:', data);
        handleReprocessStatus(data);
    });
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (currentTable && currentSession && socket) {
            console.log('[DEBUG] Page unloading, leaving table', currentTable.id);
            socket.emit('leave-table', {
                tableId: currentTable.id,
                sessionId: currentSession.id
            });
        }
    });
}

// Handle reprocess status updates
function handleReprocessStatus(data) {
    const { recordingId, status, message, error } = data;
    
    // Find reprocess button for this recording
    const reprocessBtn = document.querySelector(`[data-recording-id="${recordingId}"]`);
    
    switch (status) {
        case 'processing':
            if (reprocessBtn) {
                reprocessBtn.disabled = true;
                reprocessBtn.innerHTML = '⏳ Processing...';
                reprocessBtn.classList.add('processing');
            }
            showToast(message, 'info');
            break;
            
        case 'completed':
            if (reprocessBtn) {
                reprocessBtn.disabled = false;
                reprocessBtn.innerHTML = '🔄 Reprocess';
                reprocessBtn.classList.remove('processing');
                reprocessBtn.classList.add('success');
                setTimeout(() => {
                    reprocessBtn.classList.remove('success');
                }, 3000);
            }
            showToast(message, 'success');
            // Reload transcriptions to show the new one
            if (currentSession && currentTable) {
                loadExistingTranscriptions();
            }
            break;
            
        case 'failed':
            if (reprocessBtn) {
                reprocessBtn.disabled = false;
                reprocessBtn.innerHTML = '🔄 Reprocess';
                reprocessBtn.classList.remove('processing');
                reprocessBtn.classList.add('error');
                setTimeout(() => {
                    reprocessBtn.classList.remove('error');
                }, 5000);
            }
            showToast(message, 'error');
            break;
    }
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
    
    // Live transcription controls
    safeSetEventListener('liveTranscriptionBtn', 'onclick', startLiveTranscription);
    safeSetEventListener('stopLiveTranscriptionBtn', 'onclick', stopLiveTranscription);
    
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
        hideElement(screen);
    });
    
    // Also hide isolated screens specifically
    const joinScreen = document.getElementById('joinSessionScreen');
    if (joinScreen) {
        hideElement(joinScreen);
    }
    const transcriptionsScreen = document.getElementById('allTranscriptionsScreen');
    if (transcriptionsScreen) {
        hideElement(transcriptionsScreen);
    }
    const sessionDashboardScreen = document.getElementById('sessionDashboard');
    if (sessionDashboardScreen) {
        hideElement(sessionDashboardScreen);
    }
    
    targetScreen.classList.add('active');
    if (targetScreen.classList.contains('table-interface')) {
        showElement(targetScreen);
    } else {
        showElement(targetScreen);
    }
    
    console.log(`Screen activated: ${screenId}`);
    
    console.log('Screen activated:', screenId, 'has active class:', targetScreen.classList.contains('active'));
    
    // Update navigation history
    updateNavigationHistory(screenId);
    
    // Close mobile menu if open
    if (mobileMenuOpen) {
        const navMenu = document.getElementById('navMenu');
        const menuToggle = document.getElementById('mobileMenuToggle');
        if (navMenu && menuToggle) {
            mobileMenuOpen = false;
            navMenu.classList.remove('show');
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
    };
    
    document.title = titles[screenId] || 'World Café Platform';
}

function showWelcome() {
    navigationHistory = ['welcomeScreen'];
    hideElement(document.getElementById('tableInterface'));
    showScreen('welcomeScreen');
}

function showCreateSession() {
    hideElement(document.getElementById('tableInterface'));
    showScreen('createSessionScreen');
}

function showJoinSession() {
    loadActiveSessions();
    hideElement(document.getElementById('tableInterface'));
    showScreen('joinSessionScreen');
    resetWizard();
}

function showSessionList() {
    loadActiveSessions();
    hideElement(document.getElementById('tableInterface'));
    showScreen('sessionListScreen');
}

function showSessionDashboard() {
    if (!currentSession) {
        alert('No session selected');
        return;
    }

    hideElement(document.getElementById('tableInterface'));
    loadSessionDashboard(currentSession.id);
    showScreen('sessionDashboard');
}

function showTableInterface(tableId) {
    console.log('[DEBUG] showTableInterface called with tableId:', tableId);
    console.log('[DEBUG] Current currentTable before override:', currentTable ? {id: currentTable.id, table_number: currentTable.table_number, name: currentTable.name} : 'null');
    
    if (!currentSession || !currentSession.tables) return;

    const foundTable = currentSession.tables.find(t => t.id === tableId || t.table_number === tableId);
    console.log('[DEBUG] Found table in showTableInterface:', foundTable ? {id: foundTable.id, table_number: foundTable.table_number, name: foundTable.name} : 'not found');
    currentTable = foundTable;

    if (!currentTable) return;

    setupTableInterface();
    loadTableRecordings();
    showScreen('tableInterface');
}

function backToSession() {
    const tableInterface = document.getElementById('tableInterface');
    if (tableInterface) {
        hideElement(tableInterface);
    }

    if (currentSession) {
        showScreen('sessionDashboard');
        loadSessionDashboard(currentSession.id);
    } else {
        showWelcome();
    }
}

function showAdminDashboard() {
    loadAdminSessions();
    showScreen('adminDashboard');
}

// Mobile Navigation Functions  
function toggleMobileMenu() {
    const navMenu = document.getElementById('navMenu');
    const menuToggle = document.getElementById('mobileMenuToggle');
    
    mobileMenuOpen = !mobileMenuOpen;
    
    if (navMenu) {
        navMenu.classList.toggle('show', mobileMenuOpen);
    }
    
    if (menuToggle) {
        menuToggle.textContent = mobileMenuOpen ? '✕' : '☰';
    }
}

function closeMobileMenu() {
    const navMenu = document.getElementById('navMenu');
    const menuToggle = document.getElementById('mobileMenuToggle');
    
    if (mobileMenuOpen && navMenu && menuToggle) {
        mobileMenuOpen = false;
        navMenu.classList.remove('show');
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

async function initializeQRScanner() {
    console.log('Initializing QR Scanner...');
    
    const video = document.getElementById('qrVideo');
    if (!video) {
        console.error('QR video element not found');
        showToast('QR scanner setup failed', 'error');
        return;
    }
    
    // Add loading overlay
    const videoContainer = video.parentElement;
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'qrLoading';
    loadingDiv.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(240, 240, 240, 0.9);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        z-index: 10;
        border-radius: 12px;
    `;
    loadingDiv.innerHTML = `
        <div style="font-size: 24px; margin-bottom: 12px;">📷</div>
        <div style="font-size: 14px; font-weight: 500; color: #666;">Starting camera...</div>
        <div style="font-size: 12px; color: #999; margin-top: 4px;">Please allow camera permissions</div>
    `;
    videoContainer.appendChild(loadingDiv);
    
    // Set timeout to prevent infinite loading
    const timeout = setTimeout(() => {
        console.error('Camera startup timeout');
        showToast('Camera timeout. Please try again or use manual entry.', 'error');
        hideQRScanner();
    }, 10000);
    
    try {
        // Check if camera API is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera not supported');
        }
        
        console.log('Requesting camera access...');
        
        // Try to get camera stream with simplified constraints
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        }).catch(async () => {
            // Fallback to basic video
            return await navigator.mediaDevices.getUserMedia({ video: true });
        });
        
        console.log('Camera stream acquired');
        
        // Set video source
        video.srcObject = stream;
        
        // Wait for video to be ready
        video.onloadedmetadata = () => {
            console.log('Video metadata loaded');
            video.play().then(() => {
                console.log('Video playing');
                // Remove loading overlay
                if (loadingDiv.parentElement) {
                    loadingDiv.remove();
                }
                clearTimeout(timeout);
                startQRDetection();
                showToast('Camera ready - point at QR code', 'success');
            }).catch(error => {
                console.error('Video play failed:', error);
                clearTimeout(timeout);
                showToast('Failed to start video', 'error');
                hideQRScanner();
            });
        };
        
        video.onerror = (error) => {
            console.error('Video error:', error);
            clearTimeout(timeout);
            showToast('Camera error occurred', 'error');
            hideQRScanner();
        };
        
    } catch (error) {
        console.error('Camera access failed:', error);
        clearTimeout(timeout);
        
        let message = 'Camera failed: ';
        switch (error.name) {
            case 'NotAllowedError':
                message += 'Permission denied';
                break;
            case 'NotFoundError':
                message += 'No camera found';
                break;
            case 'NotReadableError':
                message += 'Camera in use';
                break;
            default:
                message += 'Not supported';
        }
        
        showToast(message, 'error');
        hideQRScanner();
    }
}

function stopQRScanner() {
    console.log('Stopping QR scanner...');
    
    // Stop camera stream
    const video = document.getElementById('qrVideo');
    if (video && video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => {
            track.stop();
            console.log('Camera track stopped');
        });
        video.srcObject = null;
    }
    
    // Remove loading overlay if it exists
    const loadingDiv = document.getElementById('qrLoading');
    if (loadingDiv) {
        loadingDiv.remove();
    }
    
    // Stop QR detection if running
    if (window.qrDetectionInterval) {
        clearInterval(window.qrDetectionInterval);
        window.qrDetectionInterval = null;
    }
}

function hideQRScanner() {
    console.log('Hiding QR scanner...');
    stopQRScanner();
    
    const scanner = document.getElementById('mobileScanner');
    if (scanner) {
        scanner.style.display = 'none';
    }
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
    document.querySelectorAll('.join-progress__step').forEach(step => {
        if (!step) return;
        step.classList.remove('join-progress__step--active', 'join-progress__step--completed');
    });
    const firstProgressStep = document.querySelector('.join-progress__step[data-step="1"]');
    if (firstProgressStep) {
        firstProgressStep.classList.add('join-progress__step--active');
    }
    
    // Reset wizard steps - with null checks
    document.querySelectorAll('.join-step').forEach(step => {
        if (!step) return;
        step.classList.remove('active', 'join-step--active');
        hideElement(step);
    });
    const joinStep1 = document.getElementById('joinStep1');
    if (joinStep1) {
        joinStep1.classList.add('active', 'join-step--active');
        showElement(joinStep1);
    }
    
    // Reset method cards - with null checks
    document.querySelectorAll('.method-card').forEach(card => {
        if (!card) return;
        card.classList.remove('selected');
    });
    const defaultMethodCard = document.querySelector('.method-card[data-method="code"]');
    if (defaultMethodCard) {
        defaultMethodCard.classList.add('selected');
    }
    
    // Clear form inputs - with null checks
    const inputs = ['sessionCodeInput'];
    inputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });

    const sessionInfo = document.getElementById('selectedSessionInfo');
    if (sessionInfo) {
        sessionInfo.innerHTML = '';
    }

    const tableSelection = document.getElementById('tableSelection');
    if (tableSelection) {
        tableSelection.innerHTML = '';
    }

    const finalJoinBtn = document.getElementById('finalJoinBtn');
    if (finalJoinBtn) {
        finalJoinBtn.disabled = true;
    }
    
    updateProgressSteps(1);
}

function selectJoinMethod(method) {
    currentJoinMethod = method;
    
    // Update method card selection
    document.querySelectorAll('.method-card').forEach(card => {
        card.classList.remove('selected');
    });
    const selectedCard = document.querySelector(`[data-method="${method}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
    }
    
    if (method === 'browse') {
        goToStep(2, 'browse');
    }
}

function goToStep(step, method = null) {
    if (method) currentJoinMethod = method;
    currentWizardStep = step;
    
    // Hide all steps
    ['joinStep1', 'joinStep2Browse', 'joinStep3'].forEach(stepId => {
        const stepElement = document.getElementById(stepId);
        if (!stepElement) return;
        stepElement.classList.remove('join-step--active', 'active');
        hideElement(stepElement);
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
        targetStep.classList.add('join-step--active', 'active');
        showElement(targetStep);
        console.log(`Showing step: ${targetStepId}`);
    }
    
    updateProgressSteps(step);
}

function updateProgressSteps(activeStep) {
    const progressSteps = document.querySelectorAll('.join-progress__step');
    progressSteps.forEach(step => {
        if (!step) return;
        const stepNumber = Number(step.dataset.step);
        step.classList.remove('join-progress__step--active', 'join-progress__step--completed');
        if (stepNumber < activeStep) {
            step.classList.add('join-progress__step--completed');
        } else if (stepNumber === activeStep) {
            step.classList.add('join-progress__step--active');
            step.setAttribute('aria-current', 'step');
        } else {
            step.removeAttribute('aria-current');
        }
    });
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
                     onclick="${isFull ? '' : `selectTable(${table.table_number})`}" 
                     data-table-id="${table.id}"
                     data-table-number="${table.table_number}"
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
    // Ensure tableId is a number for consistent comparison
    tableId = parseInt(tableId);
    
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
    console.log(`[DEBUG] Selected table ID set to: ${selectedTableId}`);
    
    // Update table selection visuals
    document.querySelectorAll('.table-card').forEach(card => {
        card.classList.remove('selected');
        // Reset all cards to normal state first
        card.style.borderColor = '#e0e0e0';
        card.style.background = 'white';
        card.style.transform = 'translateY(0)';
    });
    
    // Highlight selected card  
    const selectedCard = document.querySelector(`[data-table-number="${tableId}"]`);
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
    console.log('[DEBUG] finalJoinTable called');
    console.log('[DEBUG] selectedSessionData:', selectedSessionData);
    console.log('[DEBUG] selectedTableId:', selectedTableId);
    
    if (!selectedSessionData || !selectedTableId) {
        console.log('[DEBUG] Missing data - selectedSessionData:', !!selectedSessionData, 'selectedTableId:', selectedTableId);
        return;
    }
    
    const participantName = 'Anonymous'; // Name form removed
    
    const finalJoinBtn = document.getElementById('finalJoinBtn');
    const originalText = finalJoinBtn.innerHTML;
    finalJoinBtn.innerHTML = '<span>Joining...</span>';
    finalJoinBtn.disabled = true;
    
    try {
        console.log('[DEBUG] Starting join process...', {sessionId: selectedSessionData.id, tableNumber: selectedTableId, participantName});
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

async function joinTableWithDetails(sessionId, tableNumber, participantName) {
    console.log(`[DEBUG] joinTableWithDetails called with sessionId: ${sessionId}, tableNumber: ${tableNumber}, participantName: ${participantName}`);
    
    try {
        // Load session data
        console.log(`[DEBUG] Loading session data for ${sessionId}...`);
        const response = await fetch(`/api/sessions/${sessionId}`);
        if (!response.ok) {
            throw new Error('Session not found or unavailable');
        }
        
        const session = await response.json();
        console.log(`[DEBUG] Session loaded:`, session);
        
        // Find the specific table by table_number
        const tableNum = parseInt(tableNumber);
        const table = session.tables?.find(t => t.table_number === tableNum);
        if (!table) {
            throw new Error(`Table ${tableNumber} not found in session`);
        }
        
        console.log(`[DEBUG] Found table for joining:`, {id: table.id, table_number: table.table_number, name: table.name});
        
        // Join the table
        console.log(`[DEBUG] Making API call to: /api/sessions/${sessionId}/tables/${tableNum}/join`);
        const joinResponse = await fetch(`/api/sessions/${sessionId}/tables/${tableNum}/join`, {
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
        console.log('[DEBUG] Set currentTable to:', {id: currentTable.id, table_number: currentTable.table_number, name: currentTable.name});
        
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
        showToast('Camera not available on this device. Please use a modern browser.', 'error');
        return;
    }
    
    // Check secure context (more comprehensive than just HTTPS)
    if (!window.isSecureContext) {
        const protocol = location.protocol;
        const hostname = location.hostname;
        
        // Allow localhost and 127.0.0.1 for development
        if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') {
            console.log('Development environment detected, proceeding with camera access');
        } else {
            showToast('Camera requires HTTPS for security. Please use the HTTPS version of this site.', 'error');
            return;
        }
    }
    
    // Check if permissions API is available for better permission handling
    if ('permissions' in navigator) {
        navigator.permissions.query({ name: 'camera' }).then((permissionStatus) => {
            console.log('Camera permission status:', permissionStatus.state);
            if (permissionStatus.state === 'denied') {
                showToast('Camera permission denied. Please enable camera access in browser settings.', 'error');
                return;
            }
        }).catch((error) => {
            console.warn('Could not query camera permissions:', error);
        });
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
            
            <div id="qrInstructions" style="
                background: #f8f9fa;
                padding: 12px;
                border-radius: 8px;
                margin-bottom: 16px;
                font-size: 13px;
                color: #555;
                line-height: 1.4;
            ">
                📱 <strong>Tips for better scanning:</strong><br>
                • Hold phone steady<br>
                • Ensure good lighting<br>
                • Keep QR code centered<br>
                • Allow camera permissions when prompted
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
    console.log('Starting QR camera...');
    
    // Wrap everything in a timeout to prevent infinite hanging
    const overallTimeout = setTimeout(() => {
        console.error('Overall camera startup timeout - forcing close');
        showToast('Camera startup failed. Closing scanner...', 'error');
        closeQRScanner();
    }, 8000); // 8 second overall timeout
    
    try {
        const video = document.getElementById('qrVideo');
        if (!video) {
            console.error('Video element not found');
            clearTimeout(overallTimeout);
            closeQRScanner();
            return;
        }
        
        // Check basic requirements
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('Camera API not available');
        }
        
        // Additional security context check for production
        if (!window.isSecureContext) {
            throw new Error('Camera requires secure context (HTTPS)');
        }
        
        console.log('Requesting camera access...');
        
        // Simplified constraints to avoid issues
        const stream = await Promise.race([
            navigator.mediaDevices.getUserMedia({ 
                video: { 
                    facingMode: 'environment',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } 
            }),
            navigator.mediaDevices.getUserMedia({ video: true }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Camera request timeout')), 5000)
            )
        ]);
        
        console.log('Camera stream acquired, setting up video...');
        
        video.srcObject = stream;
        
        // Simplified video setup with timeout
        await Promise.race([
            new Promise((resolve, reject) => {
                video.onloadedmetadata = () => {
                    console.log('Video metadata loaded, starting playback...');
                    video.play().then(() => {
                        console.log('Video playing successfully');
                        resolve();
                    }).catch(reject);
                };
                video.onerror = reject;
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Video setup timeout')), 3000)
            )
        ]);
        
        // Start QR detection
        startQRDetection();
        showToast('Camera ready - scan QR code', 'success');
        
        clearTimeout(overallTimeout);
        
    } catch (error) {
        console.error('Camera startup failed:', error);
        clearTimeout(overallTimeout);
        
        let message = 'Camera failed: ';
        switch (error.name || error.message) {
            case 'NotAllowedError':
                message += 'Permission denied';
                break;
            case 'NotFoundError':
                message += 'No camera found';
                break;
            case 'NotReadableError':
                message += 'Camera in use by another app';
                break;
            case 'Camera request timeout':
            case 'Video setup timeout':
                message += 'Timeout - camera not responding';
                break;
            default:
                message += error.message || 'Unknown error';
        }
        
        showToast(message, 'error');
        closeQRScanner();
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
            socket.emit('join-table', {
                tableId: result.table.id,
                sessionId: result.session.id
            });
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

// Add CSS for real-time table status indicators
const statusIndicatorStyle = document.createElement('style');
statusIndicatorStyle.textContent = `
    .indicator-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        transition: all 0.3s ease;
        flex-shrink: 0;
    }
    
    .indicator-dot.online { 
        background: #28a745; 
        box-shadow: 0 0 8px rgba(40, 167, 69, 0.4);
    }
    
    .indicator-dot.offline { 
        background: #6c757d; 
    }
    
    .indicator-dot.recording { 
        background: #dc3545; 
        box-shadow: 0 0 8px rgba(220, 53, 69, 0.4);
    }
    
    .indicator-dot.processing { 
        background: #ffc107; 
        box-shadow: 0 0 8px rgba(255, 193, 7, 0.4);
    }
    
    .indicator-dot.completed { 
        background: #17a2b8; 
        box-shadow: 0 0 8px rgba(23, 162, 184, 0.4);
    }
    
    .indicator-dot.idle { 
        background: #e9ecef; 
        border: 1px solid #dee2e6;
    }
    
    .indicator-dot.pulsing {
        animation: pulse-indicator 1.5s infinite;
    }
    
    @keyframes pulse-indicator {
        0%, 100% { 
            opacity: 1; 
            transform: scale(1);
        }
        50% { 
            opacity: 0.7; 
            transform: scale(1.1);
        }
    }
    
    .connection-indicator,
    .recording-indicator {
        transition: all 0.3s ease;
    }
    
    .connection-indicator:hover,
    .recording-indicator:hover {
        background: #e9ecef !important;
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
`;
document.head.appendChild(statusIndicatorStyle);

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
        hideElement(clearBtn);
        hideElement(searchResults);
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
        showElement(clearBtn);
    } else {
        hideElement(clearBtn);
        hideElement(searchResults);
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
    showElement(searchResults);
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
    hideElement(clearBtn);
    hideElement(searchResults);
    
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
            hideElement(document.getElementById('tableInterface'));
            showScreen('sessionDashboard');
            
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
        tables.map(tableNum => `<option value="${tableNum}">📢 Table ${tableNum}</option>`).join('');
    
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
                        <span style="font-size: 24px;">📢</span>
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

async function exportAllTranscriptions() {
    if (!currentSession) {
        alert('No session loaded');
        return;
    }
    
    try {
        showLoading();
        
        // Get complete session data with transcriptions
        const response = await fetch(`/api/sessions/${currentSession.id}`);
        if (!response.ok) throw new Error('Failed to fetch session data');
        
        const sessionData = await response.json();
        
        // Get all transcriptions
        const transcriptionsResponse = await fetch(`/api/sessions/${currentSession.id}/all-transcriptions`);
        if (!transcriptionsResponse.ok) throw new Error('Failed to fetch transcriptions');
        
        const transcriptions = await transcriptionsResponse.json();
        
        // Create export object with complete session backup
        const exportData = {
            exportVersion: '1.0',
            exportDate: new Date().toISOString(),
            session: sessionData,
            transcriptions: transcriptions,
            metadata: {
                totalTranscriptions: transcriptions.length,
                totalTables: sessionData.tables?.length || 0,
                totalParticipants: sessionData.total_participants || 0,
                totalRecordings: sessionData.total_recordings || 0
            }
        };
        
        // Create and download JSON file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentSession.title.replace(/[^a-z0-9]/gi, '_')}_complete_export_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        alert(`Session exported successfully!\nIncluded: ${exportData.metadata.totalTranscriptions} transcriptions, ${exportData.metadata.totalTables} tables`);
        
    } catch (error) {
        console.error('Export error:', error);
        alert('Failed to export session data. Please try again.');
    } finally {
        hideLoading();
    }
}

async function importSession(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.name.endsWith('.json')) {
        alert('Please select a valid JSON export file');
        return;
    }
    
    try {
        showLoading();
        
        const text = await file.text();
        const importData = JSON.parse(text);
        
        // Validate export format
        if (!importData.exportVersion || !importData.session || !importData.transcriptions) {
            alert('Invalid export file format. Please select a valid session export.');
            return;
        }
        
        // Confirm import
        const confirmMsg = `Import Session: "${importData.session.title}"?\n\nThis will create a new session with:\n• ${importData.metadata.totalTranscriptions} transcriptions\n• ${importData.metadata.totalTables} tables\n• ${importData.metadata.totalParticipants} participants data\n\nContinue?`;
        
        if (!confirm(confirmMsg)) return;
        
        // Send import request to backend
        const response = await fetch('/api/sessions/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(importData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Import failed');
        }
        
        const result = await response.json();
        
        alert(`Session imported successfully!\nNew Session ID: ${result.sessionId}\nTitle: "${result.title}"\n\nRedirecting to imported session...`);
        
        // Redirect to imported session
        currentSession = result;
        showScreen('sessionDashboard');
        await loadSessionDashboard(result.sessionId);
        await loadActiveSessions(); // Refresh sessions list
        
    } catch (error) {
        console.error('Import error:', error);
        alert(`Import failed: ${error.message}`);
    } finally {
        hideLoading();
        // Clear file input
        event.target.value = '';
    }
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
    document.getElementById('activeTableCount').textContent = session.active_tables || session.tableCount || 0;
    
    // Get actual recording count and duration from recordings
    try {
        // First try to get recordings from each table
        let totalRecordings = 0;
        let totalDuration = 0;
        
        if (session.tables && session.tables.length > 0) {
            // Get recordings from all tables
            const recordingPromises = session.tables.map(async (table) => {
                try {
                    const response = await fetch(`/api/sessions/${sessionId}/tables/${table.table_number}/recordings`);
                    if (response.ok) {
                        return await response.json();
                    }
                    return [];
                } catch (error) {
                    console.warn(`Failed to load recordings for table ${table.table_number}:`, error);
                    return [];
                }
            });
            
            const allTableRecordings = await Promise.all(recordingPromises);
            const allRecordings = allTableRecordings.flat();
            
            totalRecordings = allRecordings.length;
            totalDuration = allRecordings.reduce((sum, recording) => {
                return sum + (parseFloat(recording.duration_seconds) || 0);
            }, 0);
        } else {
            // Fallback to session totals
            totalRecordings = session.total_recordings || 0;
            totalDuration = 0; // No duration available from session totals
        }
        
        // Update recording count
        document.getElementById('recordingCount').textContent = totalRecordings;
        
        // Update total duration with proper formatting
        const durationElement = document.getElementById('totalRecordingDuration');
        if (durationElement) {
            if (totalDuration > 0) {
                const minutes = Math.floor(totalDuration / 60);
                const seconds = Math.floor(totalDuration % 60);
                if (minutes > 0) {
                    durationElement.textContent = `${minutes}m${seconds > 0 ? ` ${seconds}s` : ''}`;
                } else {
                    durationElement.textContent = `${seconds}s`;
                }
            } else {
                durationElement.textContent = '0m';
            }
        }
        
    } catch (error) {
        console.warn('Failed to load recordings for dashboard:', error);
        document.getElementById('recordingCount').textContent = session.total_recordings || 0;
        const durationElement = document.getElementById('totalRecordingDuration');
        if (durationElement) {
            durationElement.textContent = '0m';
        }
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
    
    // Initialize simple chat (if available)
    if (typeof initializeSimpleChat === 'function') {
        initializeSimpleChat();
    }
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
                <div style="font-size: 48px; margin-bottom: 16px;">📢</div>
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
                        <span style="font-size: 20px;">📢</span>
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
                
                <!-- Real-time Status Indicators -->
                <div style="
                    display: flex;
                    gap: 8px;
                    margin-bottom: 16px;
                ">
                    <div class="connection-indicator" id="connection-${table.id}" style="
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 4px 8px;
                        background: #f8f9fa;
                        border-radius: 12px;
                        font-size: 11px;
                        font-weight: 500;
                        border: 1px solid #dee2e6;
                    ">
                        <span class="indicator-dot offline"></span>
                        <span class="indicator-text">No clients</span>
                    </div>
                    <div class="recording-indicator" id="recording-${table.id}" style="
                        display: flex;
                        align-items: center;
                        gap: 4px;
                        padding: 4px 8px;
                        background: #f8f9fa;
                        border-radius: 12px;
                        font-size: 11px;
                        font-weight: 500;
                        border: 1px solid #dee2e6;
                    ">
                        <span class="indicator-dot idle"></span>
                        <span class="indicator-text">Idle</span>
                    </div>
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
                    grid-template-columns: repeat(2, 1fr);
                    gap: 16px;
                    text-align: center;
                ">
                    
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
    if (!qrSection) return;
    if (qrSection.classList.contains('is-hidden') || qrSection.hasAttribute('hidden') || qrSection.style.display === 'none') {
        showElement(qrSection);
    } else {
        hideElement(qrSection);
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
    showElement(document.getElementById('qrCodesSection'));
    populateQRCodesGrid();
    document.getElementById('showQRCodesBtn').textContent = '✅ QR Codes Shown';
    
    // Scroll to QR section
    document.getElementById('qrCodesSection').scrollIntoView({ behavior: 'smooth' });
}

function hideQRCodes() {
    hideElement(document.getElementById('qrCodesSection'));
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
            
            <p style="
                margin: 0;
                color: #666;
                font-size: 14px;
                line-height: 1.4;
            ">
                Scan this QR code to join Table ${tableNumber} directly
            </p>
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
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert", // Faster processing
            });
            if (code && code.data) {
                console.log('QR Code detected:', code.data);
                
                // Validate that it's a World Café QR code
                if (code.data.includes(window.location.origin) || 
                    code.data.includes('session=') || 
                    code.data.includes('table=') ||
                    code.data.match(/^[a-f0-9-]{36}$/)) { // UUID format
                    return code.data;
                } else {
                    console.log('Non-World Café QR code detected, ignoring');
                    return null;
                }
            }
        } catch (error) {
            console.warn('QR detection error:', error);
        }
    } else {
        // Fallback: Check if library loaded yet
        if (document.readyState === 'complete') {
            console.warn('jsQR library not available. QR scanning disabled.');
        }
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
    
    // Name validation removed since form was removed
    
    showLoading('Joining table...');
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/tables/${currentTable.table_number}/join`, {
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

function toggleAdvancedOptions() {
    const advancedPanel = document.getElementById('advancedOptionsPanel');
    const toggleButton = document.querySelector('[onclick="toggleAdvancedOptions()"]');
    
    if (advancedPanel && toggleButton) {
        const isVisible = advancedPanel.style.display !== 'none';
        
        if (isVisible) {
            advancedPanel.style.display = 'none';
            toggleButton.innerHTML = '<span style="font-size: 16px;">▶️</span> Show Advanced Options';
        } else {
            advancedPanel.style.display = 'block';
            toggleButton.innerHTML = '<span style="font-size: 16px;">▼</span> Hide Advanced Options';
        }
    }
}

function switchRecordingMethod(method) {
    // Hide all recording method controls
    const allControls = document.querySelectorAll('.recording-method-controls');
    allControls.forEach(control => {
        control.style.display = 'none';
    });
    
    // Show the selected method's controls
    const targetControl = document.getElementById(method + 'Controls');
    if (targetControl) {
        targetControl.style.display = 'block';
    }
    
    // Update card visual states (optional enhancement)
    const allCards = document.querySelectorAll('#liveTranscriptionCard, #audioRecordingCard, #fileUploadCard');
    allCards.forEach(card => {
        card.style.transform = 'translateY(0)';
        card.style.opacity = '0.8';
    });
    
    // Highlight selected card
    let selectedCard;
    switch(method) {
        case 'live':
            selectedCard = document.getElementById('liveTranscriptionCard');
            break;
        case 'audio':
            selectedCard = document.getElementById('audioRecordingCard');
            break;
        case 'upload':
            selectedCard = document.getElementById('fileUploadCard');
            break;
    }
    
    if (selectedCard) {
        selectedCard.style.transform = 'translateY(-3px)';
        selectedCard.style.opacity = '1';
    }
    
    console.log(`Switched to ${method} recording method`);
}

function setupTableInterface() {
    console.log('[DEBUG] setupTableInterface called with currentTable:', currentTable ? {id: currentTable.id, table_number: currentTable.table_number, name: currentTable.name} : 'null');
    if (!currentTable) return;
    
    // Handle table switching cleanup
    if (previousTable && previousTable.id !== currentTable.id && currentSession) {
        console.log('[DEBUG] Switching from table', previousTable.id, 'to table', currentTable.id);
        // Emit leave-table event for old table cleanup
        socket.emit('leave-table', {
            tableId: previousTable.id,
            sessionId: currentSession.id
        });
    }
    
    // Emit join-table event for client tracking
    if (currentSession && currentTable) {
        socket.emit('join-table', {
            tableId: currentTable.id,
            sessionId: currentSession.id
        });
        console.log(`[DEBUG] Emitted join-table event for table ${currentTable.id} in session ${currentSession.id}`);
        
        // Update previous table reference
        previousTable = { ...currentTable };
    }
    
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
    
    // Join functionality has been removed from the interface
    
    // Participants functionality removed
    
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
        
        // Update UI (if elements exist)
        const startRecordingBtn = document.getElementById('startRecordingBtn');
        const stopRecordingBtn = document.getElementById('stopRecordingBtn');
        const audioWaveContainer = document.getElementById('audioWaveContainer');
        
        hideElement(startRecordingBtn);
        showElement(stopRecordingBtn);
        showElement(audioWaveContainer);
        
        // Update status
        updateRecordingStatus({ status: 'recording', timestamp: new Date() });
        
        // Notify other clients
        socket.emit('recording-started', {
            sessionId: currentSession.id,
            tableId: currentTable.id || currentTable.table_number
        });
        
        console.log('Recording started');
        showToast('Recording started successfully!', 'success');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        
        let errorMessage = 'Error starting recording. ';
        if (error.name === 'NotAllowedError') {
            errorMessage += 'Microphone permission denied. Please allow microphone access and try again.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No microphone found. Please connect a microphone and try again.';
        } else if (error.name === 'NotSupportedError') {
            errorMessage += 'Recording is not supported in this browser.';
        } else {
            errorMessage += 'Please check your microphone and try again.';
        }
        
        showToast(errorMessage, 'error');
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Update UI (if elements exist)
        const startRecordingBtn = document.getElementById('startRecordingBtn');
        const stopRecordingBtn = document.getElementById('stopRecordingBtn');
        const audioWaveContainer = document.getElementById('audioWaveContainer');
        
        showElement(startRecordingBtn);
        hideElement(stopRecordingBtn);
        hideElement(audioWaveContainer);
        
        // Notify other clients
        socket.emit('recording-stopped', {
            sessionId: currentSession.id,
            tableId: currentTable.id || currentTable.table_number
        });
        
        console.log('Recording stopped, processing...');
        showToast('Recording stopped. Processing audio...', 'info');
    } else {
        showToast('No active recording to stop.', 'warning');
    }
}

// Live transcription variables
let liveTranscriptionSegments = [];
let liveChunkCounter = 0;
let currentLiveSpeaker = null;
let currentLiveBubble = null;

function displayLiveTranscriptionWord(speaker, word) {
    console.log(`🎯 displayLiveTranscriptionWord called: speaker=${speaker}, word="${word}"`);
    
    const targetContainer = document.getElementById('liveTranscriptionContent');
    if (!targetContainer) {
        console.error('❌ liveTranscriptionContent container not found!');
        return;
    }
    
    console.log('✅ Found liveTranscriptionContent container');
    
    if (currentLiveSpeaker !== speaker) {
        console.log(`🔄 Switching to speaker ${speaker} (was ${currentLiveSpeaker})`);
        currentLiveSpeaker = speaker;
        currentLiveBubble = createLiveChatBubble(speaker, targetContainer);
    }
    
    if (currentLiveBubble) {
        const textElement = currentLiveBubble.querySelector('.bubble-text');
        if (textElement) {
            const oldText = textElement.textContent;
            textElement.textContent += `${word} `;
            console.log(`📝 Updated bubble text: "${oldText}" → "${textElement.textContent}"`);
            targetContainer.scrollTop = targetContainer.scrollHeight; // Auto-scroll to bottom
            
            // Store word with speaker info for persistence
            if (!window.currentLiveWords) window.currentLiveWords = [];
            console.log(`💾 Adding word to save queue: Speaker ${speaker} - "${word}"`);
            window.currentLiveWords.push({
                speaker: speaker,
                word: word,
                timestamp: Date.now()
            });
        } else {
            console.error('❌ bubble-text element not found in bubble!');
        }
    } else {
        console.error('❌ currentLiveBubble is null!');
    }
}

function createLiveChatBubble(speaker, container) {
    const speakerColor = getSpeakerColor(speaker);
    
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble speaker-${speaker}`;
    bubble.style.cssText = `
        margin-bottom: 12px;
        padding: 12px;
        background: ${speakerColor.background};
        border-radius: 8px;
        border-left: 4px solid ${speakerColor.border};
        transition: all 0.2s ease;
    `;
    
    // Add hover effect
    bubble.addEventListener('mouseenter', () => {
        bubble.style.transform = 'translateX(2px)';
        bubble.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    });
    bubble.addEventListener('mouseleave', () => {
        bubble.style.transform = 'translateX(0px)';
        bubble.style.boxShadow = 'none';
    });
    
    bubble.innerHTML = `
        <div class="speaker-label" style="font-size: 12px; color: ${speakerColor.textColor}; margin-bottom: 4px; font-weight: 600;">
            🎤 Speaker ${speaker}
        </div>
        <div class="bubble-text" style="color: #333; line-height: 1.4;"></div>
    `;
    
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight; // Auto-scroll to bottom
    return bubble;
}

async function startLiveTranscription() {
    try {
        // Reset transcription display
        resetLiveTranscriptionDisplay();
        
        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this environment. Please use HTTPS or a compatible browser.');
        }
        
        // Request microphone access
        window.liveTranscriptionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(window.liveTranscriptionStream, { mimeType: 'audio/webm' });
        
        // Array to store audio chunks for saving
        window.liveAudioChunks = [];

        // Start audio wave visualization
        startAudioWaveVisualization(window.liveTranscriptionStream);

        // Build WebSocket URL with diarization
        const API_KEY = 'c272ec5c15e5a24c6f4fc2d588e5e47ee4954430'; // Use the API key directly
        let wsUrl = `wss://api.deepgram.com/v1/listen?model=nova-2-general&language=${currentSession?.language || 'en-US'}&smart_format=true&punctuate=true&diarize=true&interim_results=true`;

        // Connect directly to Deepgram WebSocket
        window.deepgramSocket = new WebSocket(wsUrl, ['token', API_KEY]);

        window.deepgramSocket.onopen = () => {
            console.log('🎤 Deepgram WebSocket connected directly');
            mediaRecorder.start(250); // Collect 250ms of audio at a time
            isRecording = true;
            recordingStartTime = Date.now();
            
            // Update UI
            const liveTranscriptionBtn = document.getElementById('liveTranscriptionBtn');
            const stopLiveTranscriptionBtn = document.getElementById('stopLiveTranscriptionBtn');
            hideElement(liveTranscriptionBtn);
            showElement(stopLiveTranscriptionBtn);
            
            showToast('Live transcription started - speak now!', 'success');
        };

        window.deepgramSocket.onmessage = (message) => {
            try {
                console.log('🔊 Raw Deepgram message received:', message.data);
                const data = JSON.parse(message.data);
                console.log('📋 Parsed Deepgram data:', data);
                
                if (data.type === 'Results' && data.channel && data.channel.alternatives) {
                    const alternative = data.channel.alternatives[0];
                    const isFinal = data.is_final || false;
                    console.log('🎯 Alternative data:', alternative, 'isFinal:', isFinal);
                    
                    // Only process final results to avoid duplicates from interim results
                    if (isFinal && alternative.words && alternative.words.length > 0) {
                        console.log(`📝 Processing ${alternative.words.length} FINAL words`);
                        for (const wordObj of alternative.words) {
                            const speaker = wordObj.speaker || 0;
                            console.log(`👤 Speaker ${speaker}: "${wordObj.word}"`);
                            displayLiveTranscriptionWord(speaker, wordObj.word);
                        }
                    } else if (!isFinal) {
                        console.log(`🔄 Skipping interim result with ${alternative.words ? alternative.words.length : 0} words`);
                    }
                }
            } catch (error) {
                console.error('❌ Error processing Deepgram message:', error);
                console.error('Raw message data:', message.data);
            }
        };

        window.deepgramSocket.onclose = (event) => {
            console.log('🔌 Deepgram WebSocket closed:', event.code, event.reason);
            cleanup();
        };

        window.deepgramSocket.onerror = (error) => {
            console.error('❌ Deepgram WebSocket error:', error);
            showToast('Live transcription connection failed', 'error');
            cleanup();
        };

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                // Save audio chunk for file storage
                window.liveAudioChunks.push(event.data);
                
                // Send to Deepgram for real-time transcription
                if (window.deepgramSocket.readyState === WebSocket.OPEN) {
                    window.deepgramSocket.send(event.data);
                }
            }
        };

        mediaRecorder.onstop = cleanup;

        function cleanup() {
            if (window.deepgramSocket && window.deepgramSocket.readyState !== WebSocket.CLOSED) {
                window.deepgramSocket.close();
            }
            if (window.liveTranscriptionStream) {
                window.liveTranscriptionStream.getTracks().forEach(track => track.stop());
            }
            isRecording = false;
            
            // Update UI
            const liveTranscriptionBtn = document.getElementById('liveTranscriptionBtn');
            const stopLiveTranscriptionBtn = document.getElementById('stopLiveTranscriptionBtn');
            showElement(liveTranscriptionBtn);
            hideElement(stopLiveTranscriptionBtn);
        }

    } catch (error) {
        console.error('Error starting live transcription:', error);
        const errorMessage = error.name === 'NotAllowedError' 
            ? 'Microphone access denied. Please allow microphone access and try again.'
            : 'Error starting live transcription. Please try again.';
        showToast(errorMessage, 'error');
    }
}

async function stopLiveTranscription() {
    if (isRecording) {
        isRecording = false;
        
        // Stop MediaRecorder
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        
        // Close direct Deepgram connection
        if (window.deepgramSocket && window.deepgramSocket.readyState !== WebSocket.CLOSED) {
            window.deepgramSocket.close();
        }
        
        if (window.liveTranscriptionStream) {
            window.liveTranscriptionStream.getTracks().forEach(track => track.stop());
            window.liveTranscriptionStream = null;
        }
        
        // Stop audio wave visualization
        stopAudioWaveVisualization();
        
        // Save the recorded audio if we have chunks
        // Save live transcription data AND audio for recordings tab
        console.log('🔍 Checking live words for save:', window.currentLiveWords ? window.currentLiveWords.length : 'undefined/null');
        if (window.currentLiveWords && window.currentLiveWords.length > 0) {
            try {
                console.log('📼 Saving live transcription data with', window.currentLiveWords.length, 'words');
                console.log('📼 First few words:', window.currentLiveWords.slice(0, 5));
                await saveLiveTranscriptionData();
                console.log('✅ Live transcription data saved successfully');
            } catch (error) {
                console.error('❌ Error saving live transcription data:', error);
                console.error('❌ Full error details:', error);
                showToast('Warning: Live transcription may not persist on reload', 'warning');
            }
        } else {
            console.warn('⚠️ No live words to save - transcription will not persist on reload');
        }
        
        // Save audio file for recordings tab WITHOUT automatic transcription processing
        if (window.liveAudioChunks && window.liveAudioChunks.length > 0) {
            try {
                console.log('📼 Saving live audio file for recordings tab (no auto-processing)');
                const audioBlob = new Blob(window.liveAudioChunks, { type: 'audio/webm' });
                await saveAudioFileOnly(audioBlob);
                console.log('✅ Live audio file saved for manual reprocessing if needed');
            } catch (error) {
                console.error('❌ Error saving live audio file:', error);
                showToast('Warning: Audio file may not be available in recordings', 'warning');
            }
            window.liveAudioChunks = [];
        }
        
        // Update UI for live transcription interface
        const liveTranscriptionBtn = document.getElementById('liveTranscriptionBtn');
        const stopLiveTranscriptionBtn = document.getElementById('stopLiveTranscriptionBtn');
        
        showElement(liveTranscriptionBtn);
        hideElement(stopLiveTranscriptionBtn);
        
        console.log('Live transcription stopped');
        showToast('Live transcription stopped and audio saved', 'info');
        
        // Refresh recordings list to show the newly saved audio file
        setTimeout(() => {
            loadTableRecordings();
        }, 1000);
    } else {
        showToast('No active live transcription to stop.', 'warning');
    }
}

async function saveLiveTranscriptionData() {
    console.log('🎯 saveLiveTranscriptionData called');
    console.log('🎯 currentLiveWords:', window.currentLiveWords ? window.currentLiveWords.length : 'undefined');
    console.log('🎯 currentSession:', currentSession ? currentSession.id : 'undefined');
    console.log('🎯 currentTable:', currentTable ? currentTable.table_number : 'undefined');
    
    if (!window.currentLiveWords || window.currentLiveWords.length === 0) {
        console.log('No live transcription words to save');
        return;
    }
    
    if (!currentSession || !currentTable) {
        console.error('Missing session or table data for saving live transcription');
        return;
    }
    
    const tableNumber = currentTable.table_number || currentTable.id;
    const fullTranscript = window.currentLiveWords
        .map(wordObj => wordObj.word)
        .join(' ');
    
    // Create speaker segments from word-level data
    const speakerSegments = [];
    let currentSpeaker = null;
    let currentText = '';
    
    // Process words to group by speaker
    window.currentLiveWords.forEach(wordObj => {
        if (wordObj.speaker !== currentSpeaker) {
            // Save previous speaker segment
            if (currentText.trim() && currentSpeaker !== null) {
                speakerSegments.push({
                    speaker: currentSpeaker,
                    text: currentText.trim(),
                    start: 0,
                    end: 0
                });
            }
            // Start new speaker segment
            currentSpeaker = wordObj.speaker;
            currentText = wordObj.word;
        } else {
            // Continue current speaker
            currentText += ' ' + wordObj.word;
        }
    });
    
    // Add final segment
    if (currentText.trim() && currentSpeaker !== null) {
        speakerSegments.push({
            speaker: currentSpeaker,
            text: currentText.trim(),
            start: 0,
            end: 0
        });
    }
    
    const transcriptionData = {
        transcript_text: fullTranscript,
        source: 'live-transcription',
        speaker_segments: speakerSegments,
        confidence: 0.95,
        duration_seconds: (Date.now() - recordingStartTime) / 1000
    };
    
    const response = await fetch(`/api/transcriptions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sessionId: currentSession.id,
            tableId: currentTable.id,
            transcriptText: transcriptionData.transcript_text,
            speakerSegments: transcriptionData.speaker_segments,
            confidenceScore: transcriptionData.confidence,
            source: transcriptionData.source
        })
    });
    
    if (!response.ok) {
        throw new Error('Failed to save live transcription data');
    }
    
    const result = await response.json();
    console.log('Live transcription data saved:', result);
    
    // Clear the data after saving
    liveTranscriptionSegments = [];
    window.currentLiveWords = [];
}

async function saveAudioFileOnly(audioBlob) {
    if (!currentSession || !currentTable) {
        throw new Error('Missing session or table data for saving audio');
    }
    
    const formData = new FormData();
    formData.append('audio', audioBlob, 'live-recording.wav');
    formData.append('skipTranscription', 'true'); // Tell backend not to process transcription
    
    const tableNumber = currentTable.table_number || currentTable.id;
    
    const response = await fetch(`/api/sessions/${currentSession.id}/tables/${tableNumber}/upload-audio`, {
        method: 'POST',
        body: formData
    });
    
    if (!response.ok) {
        throw new Error('Failed to save audio file');
    }
    
    const result = await response.json();
    console.log('Audio file saved without transcription processing:', result);
    return result;
}

async function uploadAudio(audioBlob, source = 'start-recording') {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.wav');
    formData.append('source', source);
    
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
            
            // Update recording counter immediately
            if (currentTable) {
                updateTableRecordingCount(currentTable.id);
            }
            
            // Refresh the dashboard to update the recording count
            if (currentSession) {
                loadSessionDashboard(currentSession.id);
            }
            
            // Refresh recordings list after a delay
            setTimeout(() => {
                loadTableRecordings();
            }, 2000);
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
    if (!statusElement) {
        console.log('Recording status element not found, skipping status update');
        return;
    }
    
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

// Table status indicator functions for session dashboard
function updateTableConnectionStatus(tableId, hasClients, clientCount) {
    const indicator = document.getElementById(`connection-${tableId}`);
    if (indicator) {
        const dot = indicator.querySelector('.indicator-dot');
        const text = indicator.querySelector('.indicator-text');
        
        if (hasClients) {
            dot.className = 'indicator-dot online';
            text.textContent = `${clientCount} client${clientCount > 1 ? 's' : ''} connected`;
        } else {
            dot.className = 'indicator-dot offline';
            text.textContent = 'No clients';
        }
    }
}

function updateTableRecordingStatus(tableId, status, timestamp) {
    const indicator = document.getElementById(`recording-${tableId}`);
    if (indicator) {
        const dot = indicator.querySelector('.indicator-dot');
        const text = indicator.querySelector('.indicator-text');
        
        switch (status) {
            case 'recording':
                dot.className = 'indicator-dot recording pulsing';
                text.textContent = 'Recording';
                break;
            case 'processing':
                dot.className = 'indicator-dot processing pulsing';
                text.textContent = 'Processing';
                break;
            case 'completed':
                dot.className = 'indicator-dot completed';
                text.textContent = 'Completed';
                // Auto-revert to idle after 3 seconds
                setTimeout(() => {
                    if (dot.className === 'indicator-dot completed') {
                        dot.className = 'indicator-dot idle';
                        text.textContent = 'Idle';
                    }
                }, 3000);
                break;
            default:
                dot.className = 'indicator-dot idle';
                text.textContent = 'Idle';
        }
    }
}

function displayTranscription(data) {
    // Skip audio-only uploads that are just for recordings tab
    if (data.source === 'live-audio') {
        console.log('📼 Skipping transcription display for live-audio source (audio-only upload)');
        return;
    }
    
    
    // Determine target container based on source
    let targetContainer;
    let targetTab;
    
    switch (data.source) {
        case 'start-recording':
        case 'recording':
            targetContainer = document.getElementById('startRecordingContent');
            targetTab = 'start-recording';
            break;
        case 'upload-media':
        case 'upload':
            targetContainer = document.getElementById('uploadMediaContent');
            targetTab = 'upload-media';
            break;
        case 'live-transcription':
        default:
            targetContainer = document.getElementById('liveTranscriptionContent');
            targetTab = 'live-transcription';
            break;
    }
    
    // Fallback to original element if tabbed container not found
    if (!targetContainer) {
        targetContainer = document.getElementById('liveTranscript');
        if (!targetContainer) {
            console.warn('No transcription display element found');
            return;
        }
    }
    
    console.log(`📝 Displaying transcription in ${targetTab} tab from source: ${data.source}`);
    
    // Auto-switch to the appropriate tab when transcription is received
    if (targetTab) {
        try {
            if (typeof window.switchTranscriptionTab === 'function') {
                window.switchTranscriptionTab(targetTab);
                console.log(`🎯 Auto-switched to ${targetTab} tab for new transcription`);
            } else {
                // Fallback: manually show/hide tabs
                console.log(`📋 Using fallback tab switching for ${targetTab}`);
                
                // Hide all tab contents first
                document.querySelectorAll('.transcription-tab-content').forEach(content => {
                    content.style.display = 'none';
                });
                
                // Show the target container
                targetContainer.style.display = 'block';
                
                // Update tab button states
                document.querySelectorAll('button[onclick*="switchTranscriptionTab"]').forEach(tab => {
                    tab.classList.remove('active');
                });
                
                const targetTabButton = document.querySelector(`button[onclick*="'${targetTab}'"]`);
                if (targetTabButton) {
                    targetTabButton.classList.add('active');
                }
            }
        } catch (error) {
            console.warn('Error switching tabs:', error);
            // Ensure the target container is at least visible
            targetContainer.style.display = 'block';
        }
    }
    
    // Clear initial placeholder message on first transcription
    const emptyState = targetContainer.querySelector('.empty-state');
    if (emptyState) {
        emptyState.style.display = 'none';
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
            
            // Skip creating timestamped bubbles for live transcription content if live bubbles exist
            if (targetContainer.id === 'liveTranscriptionContent') {
                const existingLiveBubbles = targetContainer.querySelectorAll('.chat-bubble:not([style*="timestamp"])');
                if (existingLiveBubbles.length > 0) {
                    console.log(`📝 Skipping audio recording transcription - ${existingLiveBubbles.length} live bubbles already present`);
                    return;
                }
            }
            
            // Create chat bubbles for each speaker segment
            consolidatedSpeakers.forEach(segment => {
                createChatBubble(segment.speaker, segment.consolidatedText, data.source, targetContainer);
            });
            
            // Auto-scroll to bottom
            targetContainer.scrollTop = targetContainer.scrollHeight;
            
            // Auto-activate tab for any new transcription content
            try {
                if (typeof window.switchTranscriptionTab === 'function') {
                    console.log(`🔄 Auto-activating tab for source: ${data.source}`);
                    window.switchTranscriptionTab(targetTab);
                }
            } catch (error) {
                console.warn('Error auto-activating tab:', error);
            }
            
            // Update tab counts
            try {
                if (typeof window.updateTranscriptionTabCounts === 'function') {
                    window.updateTranscriptionTabCounts();
                }
            } catch (error) {
                console.warn('Error updating tab counts:', error);
            }
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

function updateTableRecordingCount(tableId) {
    // Update the table card's recording count (🎤 icon)
    const tableCards = document.querySelectorAll('.table-card');
    tableCards.forEach(card => {
        if (card.onclick.toString().includes(tableId)) {
            // Find the recording stat (🎤 icon - second stat-item)
            const recordingStat = card.querySelector('.stat-item:nth-child(2) span:last-child');
            if (recordingStat) {
                const currentCount = parseInt(recordingStat.textContent) || 0;
                recordingStat.textContent = currentCount + 1;
            }
        }
    });
}

// Audio Player Functions
async function loadTableRecordings() {
    if (!currentSession || !currentTable) return;
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/tables/${currentTable.table_number}/recordings`);
        if (response.ok) {
            const recordings = await response.json();
            displayTableRecordings(recordings);
        }
    } catch (error) {
        console.error('Error loading table recordings:', error);
    }
}

function displayTableRecordings(recordings) {
    const recordingsList = document.getElementById('recordingsList');
    const noRecordingsMessage = document.getElementById('noRecordingsMessage');
    const recordingCountBadge = document.getElementById('recordingCountBadge');
    
    if (!recordingsList) return;
    
    // Update badge count
    if (recordingCountBadge) {
        recordingCountBadge.textContent = recordings.length;
    }
    
    if (recordings.length === 0) {
        hideElement(recordingsList);
        showElement(noRecordingsMessage);
        return;
    }
    
    hideElement(noRecordingsMessage);
    showElement(recordingsList);
    recordingsList.innerHTML = '';
    
    recordings.forEach((recording, index) => {
        const recordingItem = document.createElement('div');
        recordingItem.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 12px;
            border: 1px solid #e9ecef;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        `;
        
        const createdAt = new Date(recording.created_at).toLocaleString();
        const createdDate = new Date(recording.created_at).toLocaleDateString();
        const duration = recording.duration_seconds ? `${Math.round(recording.duration_seconds)}s` : '';
        const fileSize = recording.file_size ? formatFileSize(recording.file_size) : '';
        
        // Create informative title: SessionName - TableName - Date
        const sessionName = currentSession?.title || 'Session';
        const tableName = currentTable?.name || `Table ${currentTable?.table_number || ''}`;
        const informativeTitle = `${sessionName} - ${tableName} - ${createdDate}`;
        
        // Check if media file has been deleted
        const isFileDeleted = recording.status === 'file_deleted' || !recording.file_path;
        const statusColor = isFileDeleted ? '#dc3545' : '#28a745';
        const statusText = isFileDeleted ? 'Media File Deleted' : recording.status;

        recordingItem.innerHTML = `
            <div style="display: flex; justify-content: between; align-items: center; margin-bottom: 12px;">
                <div>
                    <h4 style="margin: 0 0 4px 0; font-size: 14px; font-weight: 600; color: #333;">
                        ${isFileDeleted ? '📄' : '🎙️'} ${informativeTitle} ${isFileDeleted ? '(Transcription Only)' : ''}
                    </h4>
                    <div style="font-size: 12px; color: #666;">
                        ${createdAt} ${duration && !isFileDeleted ? `• ${duration}` : ''} ${fileSize && !isFileDeleted ? `• ${fileSize}` : ''}
                    </div>
                </div>
                <div style="font-size: 12px; padding: 4px 8px; background: ${statusColor}; border-radius: 12px; color: white;">
                    ${statusText}
                </div>
            </div>
            
            ${isFileDeleted ? 
                `<div style="
                    width: 100%; 
                    padding: 20px; 
                    margin-bottom: 8px; 
                    background: #f8f9fa; 
                    border: 2px dashed #dee2e6; 
                    border-radius: 8px; 
                    text-align: center; 
                    color: #6c757d;
                ">
                    📄 Media file has been deleted<br>
                    <small>Transcription data is still available</small>
                </div>` 
                : 
                `<audio controls style="width: 100%; margin-bottom: 8px;" preload="metadata">
                    <source src="/recordings/${recording.filename}" type="${recording.mime_type || 'audio/wav'}">
                    <source src="/recordings/${recording.filename}" type="audio/wav">
                    <source src="/recordings/${recording.filename}" type="audio/webm">
                    Your browser does not support the audio element.
                </audio>`
            }
            
            <div style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;">
                ${!isFileDeleted ? 
                    `<button onclick="reprocessRecording('${recording.id}', '${recording.filename}')" style="
                        padding: 6px 12px;
                        background: #ffc107;
                        border: 1px solid #ffc107;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        color: #212529;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='#e0a800'" onmouseout="this.style.background='#ffc107'">🔄 Reprocess</button>
                    <button onclick="downloadRecording('${recording.filename}')" style="
                        padding: 6px 12px;
                        background: #f8f9fa;
                        border: 1px solid #dee2e6;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        color: #6c757d;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='#e9ecef'" onmouseout="this.style.background='#f8f9fa'">📥 Download</button>
                    <button onclick="deleteMediaFile('${recording.id}')" style="
                        padding: 6px 12px;
                        background: #fd7e14;
                        border: 1px solid #fd7e14;
                        border-radius: 4px;
                        font-size: 12px;
                        cursor: pointer;
                        color: white;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='#e8690b'" onmouseout="this.style.background='#fd7e14'">🗑️ Delete File</button>` 
                    : ''
                }
                <button onclick="deleteRecordingComplete('${recording.id}')" style="
                    padding: 6px 12px;
                    background: #dc3545;
                    border: 1px solid #dc3545;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                    color: white;
                    transition: all 0.2s;
                " onmouseover="this.style.background='#c82333'" onmouseout="this.style.background='#dc3545'">${isFileDeleted ? '🗑️ Delete Transcription' : '🗑️ Delete All'}</button>
            </div>
        `;
        
        recordingsList.appendChild(recordingItem);
    });
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function downloadRecording(filename) {
    const link = document.createElement('a');
    link.href = `/recordings/${filename}`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function reprocessRecording(recordingId, filename) {
    if (!confirm('Reprocess this audio file with speech-to-text? This will update the existing transcription.')) {
        return;
    }
    
    try {
        showToast('Starting audio reprocessing...', 'info');
        
        // Use the dedicated reprocess endpoint to avoid creating duplicate files
        const response = await fetch(`/api/recordings/${recordingId}/reprocess`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Reprocessing failed');
        }
        
        const result = await response.json();
        showToast('Audio reprocessing completed! Transcription updated.', 'success');
        
        // Refresh transcriptions to show the updated results
        setTimeout(() => {
            loadExistingTranscriptions();
        }, 1000);
        
    } catch (error) {
        console.error('Error reprocessing recording:', error);
        showToast('Failed to reprocess audio. Please try again.', 'error');
    }
}

// Delete media file only (keep transcription)
async function deleteMediaFile(recordingId) {
    if (!confirm('Delete the media file only? This will keep the transcription for reference but remove the audio file.')) {
        return;
    }
    
    try {
        showToast('Deleting media file...', 'info');
        
        const response = await fetch(`/api/recordings/${recordingId}/media`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete media file');
        }
        
        showToast('Media file deleted successfully. Transcription preserved.', 'success');
        
        // Refresh the recordings list
        setTimeout(() => {
            loadTableRecordings();
        }, 500);
        
    } catch (error) {
        console.error('Error deleting media file:', error);
        showToast('Failed to delete media file. Please try again.', 'error');
    }
}

// Delete recording completely (media file + transcription)
async function deleteRecordingComplete(recordingId) {
    if (!confirm('Delete this recording completely? This will permanently remove both the media file and all associated transcriptions. This action cannot be undone.')) {
        return;
    }
    
    try {
        showToast('Deleting recording and transcriptions...', 'info');
        
        const response = await fetch(`/api/recordings/${recordingId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to delete recording');
        }
        
        showToast('Recording and transcriptions deleted successfully.', 'success');
        
        // Refresh the recordings list and transcriptions
        setTimeout(() => {
            loadTableRecordings();
            loadExistingTranscriptions();
        }, 500);
        
    } catch (error) {
        console.error('Error deleting recording:', error);
        showToast('Failed to delete recording. Please try again.', 'error');
    }
}







async function compareWithOtherTables() {
    // This would show a comparison view between different tables
    alert('Table comparison view - to be implemented');
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
    formData.append('source', 'upload-media'); // Specify source for Upload Media tab
    formData.append('skipTranscription', 'true'); // Don't auto-process, only manual via reprocess button
    
    const tableNumber = currentTable.table_number || currentTable.id;
    
    // Show upload progress
    const uploadProgress = document.getElementById('uploadProgress');
    const uploadFileName = document.getElementById('uploadFileName');
    const uploadStatus = document.getElementById('uploadStatus');
    const uploadProgressBar = document.getElementById('uploadProgressBar');
    
    if (uploadFileName) uploadFileName.textContent = file.name;
    if (uploadStatus) uploadStatus.textContent = 'Preparing...';
    if (uploadProgressBar) uploadProgressBar.style.width = '0%';
    showElement(uploadProgress);
    
    try {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                if (uploadProgressBar) uploadProgressBar.style.width = percentComplete + '%';
                if (uploadStatus) uploadStatus.textContent = `Uploading... ${Math.round(percentComplete)}%`;
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
        
        if (uploadStatus) uploadStatus.textContent = 'Processing...';
        
        const result = await uploadPromise;
        
        if (uploadProgressBar) uploadProgressBar.style.width = '100%';
        if (uploadStatus) uploadStatus.textContent = 'Upload complete! Processing transcription...';
        
        console.log('Media uploaded successfully!');
        
        // Update recording status
        updateRecordingStatus({ status: 'processing', timestamp: new Date() });
        
        // Update recording counter immediately
        if (currentTable) {
            updateTableRecordingCount(currentTable.id);
        }
        
        // Refresh recordings to show any completed ones
        setTimeout(() => {
            loadTableRecordings();
        }, 2000);
        
        // Hide upload progress after 3 seconds
        setTimeout(() => {
            hideElement(uploadProgress);
        }, 3000);
        
    } catch (error) {
        console.error('Error uploading media:', error);
        if (uploadStatus) uploadStatus.textContent = 'Upload failed. Please try again.';
        if (uploadProgressBar) uploadProgressBar.style.width = '0%';
        
        // Hide upload progress after 5 seconds
        setTimeout(() => {
        hideElement(uploadProgress);
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
    
    if (!deepgramKey) {
        alert('Please enter the Deepgram API key.');
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
                deepgram_api_key: deepgramKey || null
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('API keys updated successfully!');
            
            // Update configuration status
            updateConfigurationStatus();
            
            // Clear form
            document.getElementById('deepgramApiKey').value = '';
            
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
    // Check if API keys are configured
    fetch('/api/admin/settings/status')
        .then(response => response.json())
        .then(status => {
            const deepgramStatus = document.getElementById('deepgramConfigStatus');
            
            if (status.apis && status.apis.deepgram && status.apis.deepgram.configured) {
                deepgramStatus.textContent = 'Configured';
                deepgramStatus.className = 'config-status-badge configured';
            } else {
                deepgramStatus.textContent = 'Not Configured';
                deepgramStatus.className = 'config-status-badge';
            }
        })
        .catch(error => {
            console.error('Error updating configuration status:', error);
        });
}

function updateSystemHealthStatus(status) {
    const deepgramHealth = document.getElementById('deepgramStatus');
    
    if (status.deepgram) {
        if (status.deepgram.status === 'success') {
            deepgramHealth.textContent = '✓ Available';
            deepgramHealth.className = 'health-status connected';
        } else {
            deepgramHealth.textContent = '✗ Unavailable';
            deepgramHealth.className = 'health-status error';
        }
    }
}

// Modal functions for the simplified interface
function showAudioRecording() {
    const modal = document.getElementById('audioRecordingModal');
    hideElement(document.getElementById('uploadMediaModal'));
    showElement(modal);
}

function hideAudioRecording() {
    hideElement(document.getElementById('audioRecordingModal'));
}

function showUploadMedia() {
    const modal = document.getElementById('uploadMediaModal');
    hideElement(document.getElementById('audioRecordingModal'));
    showElement(modal);
}

function hideUploadMedia() {
    hideElement(document.getElementById('uploadMediaModal'));
}

function selectMediaFile() {
    document.getElementById('mediaFileInput').click();
    hideUploadMedia();
}

// Update the transcription display when live transcription is active
function updateLiveTranscriptionDisplay(transcript) {
    const displayDiv = document.getElementById('transcriptionDisplay');
    const emptyState = document.getElementById('emptyTranscriptionState');
    
    if (!displayDiv || !emptyState) return;
    
    // Hide empty state and show transcription
    hideElement(emptyState);
    showElement(displayDiv);
    
    // Create a new transcript entry
    const entry = document.createElement('div');
    entry.style.cssText = 'margin-bottom: 12px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #28a745;';
    
    const timestamp = new Date().toLocaleTimeString();
    entry.innerHTML = `
        <div style="font-size: 12px; color: #6c757d; margin-bottom: 4px;">${timestamp}</div>
        <div style="color: #333; line-height: 1.4;">${transcript}</div>
    `;
    
    // Add to display
    displayDiv.appendChild(entry);
    
    // Scroll to bottom
    displayDiv.scrollTop = displayDiv.scrollHeight;
    
    // Update counter
    const counter = document.getElementById('liveTranscriptionCount');
    if (counter) {
        const currentCount = parseInt(counter.textContent) || 0;
        counter.textContent = currentCount + 1;
    }
}

// Reset transcription display
function resetLiveTranscriptionDisplay() {
    const displayDiv = document.getElementById('transcriptionDisplay');
    const emptyState = document.getElementById('emptyTranscriptionState');
    const counter = document.getElementById('liveTranscriptionCount');
    const liveTranscriptionContent = document.getElementById('liveTranscriptionContent');
    
    if (displayDiv) {
        displayDiv.innerHTML = '';
        hideElement(displayDiv);
    }
    
    if (emptyState) {
        showElement(emptyState);
    }
    
    if (counter) {
        counter.textContent = '0';
    }
    
    // Clear live transcription content container
    if (liveTranscriptionContent) {
        liveTranscriptionContent.innerHTML = '';
    }
    
    // Reset interim bubble reference
    currentInterimBubble = null;
    
    // Reset live transcription segments
    liveTranscriptionSegments = [];
    
    // Reset live words tracking
    window.currentLiveWords = [];
    
    // Reset live speaker tracking
    currentLiveSpeaker = null;
    currentLiveBubble = null;
}

// Display live transcription results in real-time
let currentInterimBubble = null;

function displayLiveTranscriptionResult(transcript, isFinal) {
    console.log(`📝 displayLiveTranscriptionResult called with transcript: "${transcript}", isFinal: ${isFinal}`);
    
    const targetContainer = document.getElementById('liveTranscriptionContent');
    if (!targetContainer) {
        console.error('❌ liveTranscriptionContent container not found!');
        return;
    }
    
    console.log(`📝 Target container found:`, targetContainer);
    
    if (isFinal) {
        // Final transcript - clean up interim bubble only (diarized bubbles already created)
        if (currentInterimBubble) {
            // Replace interim bubble with final result
            currentInterimBubble.remove();
            currentInterimBubble = null;
        }
        
        console.log('📝 Final live transcription result processed (already displayed via diarization)');
        
    } else {
        // Interim transcript - update or create temporary bubble
        if (currentInterimBubble) {
            // Update existing interim bubble
            const transcriptElement = currentInterimBubble.querySelector('.transcript-text');
            if (transcriptElement) {
                transcriptElement.textContent = transcript;
            }
        } else {
            // Create new interim bubble
            currentInterimBubble = document.createElement('div');
            currentInterimBubble.className = 'chat-bubble interim-bubble';
            currentInterimBubble.style.cssText = `
                margin-bottom: 12px;
                padding: 12px 16px;
                background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                border: 1px dashed #28a745;
                border-radius: 18px 18px 18px 6px;
                box-shadow: 0 2px 8px rgba(40, 167, 69, 0.1);
                opacity: 0.7;
                animation: pulse 1.5s ease-in-out infinite;
            `;
            
            currentInterimBubble.innerHTML = `
                <div style="display: flex; align-items: flex-start; gap: 8px;">
                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #28a745, #20c997); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-size: 14px; font-weight: 600; flex-shrink: 0;">
                        S1
                    </div>
                    <div style="flex: 1; min-width: 0;">
                        <div class="transcript-text" style="color: #2c3e50; line-height: 1.5; font-size: 15px; margin-bottom: 4px;">${transcript}</div>
                        <div style="color: #6c757d; font-size: 12px; font-style: italic;">Listening...</div>
                    </div>
                </div>
            `;
            
            targetContainer.appendChild(currentInterimBubble);
            
            // Auto-scroll to show new content
            targetContainer.scrollTop = targetContainer.scrollHeight;
        }
        
        console.log('📝 Interim live transcription result updated:', transcript);
    }
}

// Audio wave visualization
let audioContext = null;
let analyser = null;
let dataArray = null;
let waveAnimationId = null;

function initializeAudioWave() {
    const waveContainer = document.getElementById('audioWave');
    if (!waveContainer) return;
    
    // Create wave bars
    waveContainer.innerHTML = '';
    for (let i = 0; i < 9; i++) {
        const bar = document.createElement('div');
        bar.className = 'wave-bar';
        bar.style.setProperty('--wave-height', '8px');
        waveContainer.appendChild(bar);
    }
}

function startAudioWaveVisualization(stream) {
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);
        
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
        
        // Show wave container
        const waveContainer = document.getElementById('audioWaveContainer');
        if (waveContainer) {
            waveContainer.style.display = 'block';
        }
        
        initializeAudioWave();
        animateWave();
    } catch (error) {
        console.error('Error starting audio visualization:', error);
    }
}

function animateWave() {
    if (!analyser || !dataArray) return;
    
    analyser.getByteFrequencyData(dataArray);
    
    // Calculate average audio level
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    const normalizedLevel = Math.min(100, (average / 128) * 100);
    
    // Update audio level display
    const levelDisplay = document.getElementById('audioLevel');
    if (levelDisplay) {
        levelDisplay.textContent = Math.round(normalizedLevel) + '%';
    }
    
    // Update wave bars
    const waveBars = document.querySelectorAll('.wave-bar');
    waveBars.forEach((bar, index) => {
        // Map different frequency ranges to different bars
        const freqIndex = Math.floor((index / waveBars.length) * dataArray.length);
        const height = Math.max(4, (dataArray[freqIndex] / 255) * 40);
        bar.style.setProperty('--wave-height', height + 'px');
        
        // Add some randomness for visual appeal when audio is low
        if (dataArray[freqIndex] < 20) {
            const randomHeight = 4 + Math.random() * 8;
            bar.style.setProperty('--wave-height', randomHeight + 'px');
        }
    });
    
    waveAnimationId = requestAnimationFrame(animateWave);
}

function stopAudioWaveVisualization() {
    if (waveAnimationId) {
        cancelAnimationFrame(waveAnimationId);
        waveAnimationId = null;
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    // Hide wave container
    const waveContainer = document.getElementById('audioWaveContainer');
    if (waveContainer) {
        waveContainer.style.display = 'none';
    }
    
    analyser = null;
    dataArray = null;
}

// Process audio chunks for live transcription (simulated real-time)
async function processLiveAudioChunk(chunkBlob) {
    try {
        liveChunkCounter++;
        console.log(`📤 Processing live chunk ${liveChunkCounter} (${chunkBlob.size} bytes)...`);
        
        // Simulate real-time transcription with placeholder text
        // In a real implementation, this would send to a WebSocket endpoint
        const simulatedTranscripts = [
            "I'm speaking now...",
            "This is live transcription.",
            "The audio is being processed.",
            "Real-time speech recognition.",
            "Converting speech to text.",
            "Live transcription active.",
            "Audio chunk processed.",
            "Transcription in progress...",
            "Speech recognition working.",
            "Live audio processing."
        ];
        
        const randomTranscript = simulatedTranscripts[Math.floor(Math.random() * simulatedTranscripts.length)];
        
        // Simulate processing delay
        setTimeout(() => {
            if (isRecording) { // Only display if still recording
                console.log(`📝 Live chunk ${liveChunkCounter}: "${randomTranscript}"`);
                updateLiveTranscriptionDisplay(randomTranscript);
                
                // Store for final processing
                liveTranscriptionSegments.push({
                    chunkNumber: liveChunkCounter,
                    transcript: randomTranscript,
                    timestamp: Date.now(),
                    confidence: 0.85
                });
            }
        }, 500 + Math.random() * 1000); // 0.5-1.5 second delay to simulate processing
        
    } catch (error) {
        console.error('Error processing live audio chunk:', error);
    }
}

// Save the final live recording
async function saveFinalLiveRecording(finalBlob) {
    try {
        console.log('📼 Saving final live recording...');
        
        const formData = new FormData();
        formData.append('audio', finalBlob, 'live-recording-final.wav');
        formData.append('source', 'live-transcription');
        
        // Include all the live transcription segments
        if (liveTranscriptionSegments.length > 0) {
            formData.append('liveSegments', JSON.stringify(liveTranscriptionSegments));
        }
        
        const tableNumber = currentTable.table_number || currentTable.id;
        
        const response = await fetch(`/api/sessions/${currentSession.id}/tables/${tableNumber}/upload-audio`, {
            method: 'POST',
            body: formData,
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log('📼 Live transcription audio saved successfully:', result);
            
            // If we have live segments but server also provided final transcription, merge them
            if (liveTranscriptionSegments.length > 0 && result.recordingId) {
                const fullTranscript = liveTranscriptionSegments
                    .map(segment => segment.transcript)
                    .join(' ');
                
                // Save the complete transcription
                const transcriptionData = {
                    recording_id: result.recordingId,
                    transcript_text: fullTranscript,
                    source: 'live-transcription',
                    segments: liveTranscriptionSegments
                };
                
                const transcriptionResponse = await fetch(`/api/sessions/${currentSession.id}/tables/${tableNumber}/transcriptions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(transcriptionData)
                });
                
                if (transcriptionResponse.ok) {
                    const transcriptionResult = await transcriptionResponse.json();
                    console.log('📝 Live transcription text saved successfully:', transcriptionResult);
                }
            }
            
            // Update recording status and refresh
            updateRecordingStatus({ status: 'completed', timestamp: new Date() });
            
            if (currentTable) {
                updateTableRecordingCount(currentTable.id);
            }
            
            // Refresh recordings list
            setTimeout(() => {
                loadTableRecordings();
            }, 1000);
            
            showToast('Live transcription completed and saved!', 'success');
        } else {
            const error = await response.json();
            console.error('Failed to save final live recording:', error);
            showToast('Error saving live recording', 'error');
        }
    } catch (error) {
        console.error('Error saving final live recording:', error);
        showToast('Error saving live recording', 'error');
    }
}

// Speaker color palette for different speakers
function getSpeakerColor(speakerIndex) {
    const colors = [
        { border: '#28a745', background: '#f8fffe', textColor: '#155724' }, // Green
        { border: '#007bff', background: '#f8feff', textColor: '#004085' }, // Blue  
        { border: '#dc3545', background: '#fff8f8', textColor: '#721c24' }, // Red
        { border: '#fd7e14', background: '#fffaf7', textColor: '#8b4513' }, // Orange
        { border: '#6f42c1', background: '#faf8ff', textColor: '#4c2a85' }, // Purple
        { border: '#20c997', background: '#f7fffe', textColor: '#0f5132' }, // Teal
        { border: '#e83e8c', background: '#fff8fc', textColor: '#78293d' }, // Pink
        { border: '#6610f2', background: '#f8f7ff', textColor: '#3d0a91' }  // Indigo
    ];
    
    return colors[speakerIndex % colors.length];
}

// Create chat bubble for transcription results
function createChatBubble(speaker, text, source, container) {
    if (!container) return;
    
    // Get speaker color based on speaker index
    const speakerColor = getSpeakerColor(speaker || 0);
    
    // Create bubble element
    const bubble = document.createElement('div');
    bubble.style.cssText = `
        margin-bottom: 12px;
        padding: 12px;
        background: ${speakerColor.background};
        border-radius: 8px;
        border-left: 4px solid ${speakerColor.border};
        transition: all 0.2s ease;
    `;
    
    // Add hover effect
    bubble.addEventListener('mouseenter', () => {
        bubble.style.transform = 'translateX(2px)';
        bubble.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    });
    bubble.addEventListener('mouseleave', () => {
        bubble.style.transform = 'translateX(0px)';
        bubble.style.boxShadow = 'none';
    });
    
    const timestamp = new Date().toLocaleTimeString();
    const speakerLabel = speaker !== undefined ? `Speaker ${speaker}` : 'Unknown';
    
    bubble.innerHTML = `
        <div style="font-size: 12px; color: ${speakerColor.textColor}; margin-bottom: 4px; font-weight: 600;">
            🎤 ${timestamp} - ${speakerLabel}
        </div>
        <div style="color: #333; line-height: 1.4;">${text}</div>
    `;
    
    container.appendChild(bubble);
    
    // Scroll to bottom
    container.scrollTop = container.scrollHeight;
    
    // Update transcription display for our simplified interface
    updateLiveTranscriptionDisplay(text);
}

// Note: Initialization already handled by the main DOMContentLoaded listener above
