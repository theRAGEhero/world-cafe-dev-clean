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
const transcriptionRegistry = new Map();
let transcriptionPreviewEscapeHandler = null;
let lastFocusedTranscriptionCard = null;
let activeTableQrModal = null;
let previousFocusBeforeQrModal = null;
let qrModalEscHandler = null;
let currentInterimBubble = null;
let liveRecorderMimeType = null;
let liveRecorderStopResolver = null;
let showAllTableQRCodes = false;

const DEEPGRAM_MODEL_OPTIONS = [
    'nova-3-general',
    'nova-3-meeting',
    'nova-3-phonecall',
    'nova-3-voicemail',
    'nova-2-meeting',
    'nova-2-general',
    'nova-2-phonecall',
    'nova-2-conversationalai',
    'nova-2-financialservices',
    'nova-2-voicemail',
    'nova-2-automotive',
    'nova-2-medical',
    'enhanced-general',
    'enhanced-meeting',
    'base-general',
    'base-meeting'
];

window.deepgramModel = window.deepgramModel || 'nova-3-general';
let deepgramModelSelectInitialized = false;

const MINIMUM_VALID_AUDIO_BYTES = 4096;

// Lightweight session metrics cache used to keep counters accurate
const tableTranscriptionCounts = new Map();
const tableRecordingCounts = new Map();
const tableParticipantSnapshots = new Map();
const tableConnectionState = new Map();

function tablesMatch(tableA, tableB) {
    if (!tableA || !tableB) return false;

    const haveIds = typeof tableA.id !== 'undefined' && typeof tableB.id !== 'undefined';
    if (haveIds && String(tableA.id) === String(tableB.id)) {
        return true;
    }

    const haveNumbers = typeof tableA.table_number !== 'undefined' && typeof tableB.table_number !== 'undefined';
    if (haveNumbers && String(tableA.table_number) === String(tableB.table_number)) {
        return true;
    }

    return false;
}

async function stopRecordingIfActive(options = {}) {
    const { silent = false } = options;

    if (!isRecording) {
        return;
    }

    try {
        const tableKeyCandidates = [];
        if (currentTable?.id) tableKeyCandidates.push(String(currentTable.id));
        if (currentTable?.table_number) tableKeyCandidates.push(String(currentTable.table_number));

        const connectionInfo = tableKeyCandidates
            .map((key) => tableConnectionState.get(key))
            .find(Boolean);

        if (connectionInfo) {
            console.log('[RecordingGuard] Table connection state before stop:', {
                tableId: currentTable?.id || currentTable?.table_number,
                hasClients: connectionInfo.hasClients,
                clientCount: connectionInfo.clientCount
            });
        }

        const liveStreamActive = Boolean(
            window.liveTranscriptionStream &&
            window.liveTranscriptionStream.getTracks().some(track => track.readyState === 'live')
        );

        if (liveStreamActive) {
            await stopLiveTranscription({ skipEmit: false, silent: true });
        } else if (mediaRecorder && typeof mediaRecorder.state !== 'undefined' && mediaRecorder.state !== 'inactive') {
            await stopRecording({ silent: true });
        } else if (mediaRecorder && typeof mediaRecorder.stop === 'function') {
            await stopRecording({ silent: true });
        } else {
            isRecording = false;
        }
    } catch (error) {
        console.error('Error stopping active recording during table switch:', error);
        if (!silent) {
            showToast('Unable to stop the current recording automatically. Please stop it manually.', 'error');
        }
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    detectMobileAndTouch();
    initializeMobileOptimizations();
    initializeSocket();
    setupEventListeners();
    loadActiveSessions();
    handleURLParams();
    setupMobileNavigation();
    initializeDeepgramConfiguration();
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
    const interactiveElements = document.querySelectorAll(
        '.btn, .card, .transcription-card, .table-card, .session-item, .admin-session-item'
    );
    
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

function applyToElements(ids, callback) {
    if (!Array.isArray(ids)) return;
    ids.forEach((id) => {
        const el = typeof id === 'string' ? document.getElementById(id) : id;
        if (el) {
            callback(el);
        }
    });
}

const LIVE_TRANSCRIPTION_UI_IDS = {
    startButtons: ['liveTranscriptionBtn'],
    stopButtons: ['stopLiveTranscriptionBtn'],
    counters: ['liveTranscriptionCount'],
    contentContainers: ['liveTranscriptionContent'],
    displayContainers: ['transcriptionDisplay'],
    emptyStates: ['emptyTranscriptionState'],
    audioWaveContainer: 'audioWaveContainer',
    audioWave: 'audioWave',
    audioLevel: 'audioLevel'
};

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
async function loadExistingTranscriptions(options = {}) {
    if (!currentSession || !currentTable) return;
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/tables/${currentTable.table_number}/transcriptions`);
        if (response.ok) {
            const transcriptions = await response.json();
            displayExistingTranscriptions(transcriptions, options);
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
function displayExistingTranscriptions(transcriptions, options = {}) {
    // Get the single transcription container
    const liveTranscriptionContent = document.getElementById('liveTranscriptionContent');
    const transcriptionDisplay = document.getElementById('transcriptionDisplay');
    const emptyState = document.getElementById('emptyTranscriptionState');

    if (transcriptionDisplay) {
        transcriptionDisplay.innerHTML = '';
        showElement(transcriptionDisplay);
    }

    if (emptyState) {
        hideElement(emptyState);
    }

    if (liveTranscriptionContent) {
        liveTranscriptionContent.scrollTop = 0;
        console.log('📝 Cleared transcription display for table switch');
    }
    
    const filteredTranscriptions = prioritizeTranscriptions(transcriptions);

    const totalFiltered = filteredTranscriptions.length;

    filteredTranscriptions.forEach((transcription, index) => {
        const transcriptItem = document.createElement('div');
        transcriptItem.className = 'transcript-item';
        
        const speakers = parseSpeakerSegments(transcription);
        
        const createdAt = new Date(transcription.created_at).toLocaleString();
        const confidenceScore = typeof transcription.confidence === 'number'
            ? transcription.confidence
            : typeof transcription.confidence_score === 'number'
                ? transcription.confidence_score
                : null;
        const confidence = confidenceScore != null
            ? `${(confidenceScore * 100).toFixed(1)}% confidence`
            : '';
        
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
                <span><strong>Recording ${totalFiltered - index}</strong></span>
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
        let targetContainer = transcriptionDisplay || liveTranscriptionContent;
        
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
    if (transcriptionDisplay || liveTranscriptionContent) {
        const container = transcriptionDisplay || liveTranscriptionContent;
        const existingBubbles = container.querySelectorAll('.chat-bubble');
        const existingTranscripts = container.querySelectorAll('.transcript-item');
        if (existingBubbles.length === 0 && existingTranscripts.length === 0 && container.innerHTML.trim() === '') {
            const emptyMessage = '<p style="color: #666; font-style: italic; text-align: center; padding: 2rem;">No transcriptions available yet.</p>';
            container.innerHTML = emptyMessage;
        }
    }
    
    // Update tab counts
    if (typeof updateTranscriptionTabCounts === 'function') {
        updateTranscriptionTabCounts();
    }
}

function prioritizeTranscriptions(transcriptions = []) {
    if (!Array.isArray(transcriptions)) {
        return [];
    }

    const prioritized = new Map();

    transcriptions.forEach((entry) => {
        if (!entry) return;

        const key = entry.recording_id || `transcription-${entry.id}`;
        const parsedSegments = parseSpeakerSegments(entry);
        const hasDiarization = parsedSegments.length > 0;
        const createdAt = new Date(entry.updated_at || entry.created_at || 0).getTime();

        const existing = prioritized.get(key);
        if (!existing) {
            prioritized.set(key, { item: entry, createdAt, hasDiarization, segments: parsedSegments });
            return;
        }

        const shouldReplace = (!existing.hasDiarization && hasDiarization)
            || (existing.hasDiarization === hasDiarization && createdAt > existing.createdAt);

        if (shouldReplace) {
            prioritized.set(key, { item: entry, createdAt, hasDiarization, segments: parsedSegments });
        }
    });

    return Array.from(prioritized.values())
        .map(({ item, segments }) => {
            if (segments.length && typeof item.speaker_segments === 'string') {
                item.__parsedSpeakerSegments = segments;
            }
            return item;
        })
        .sort((a, b) => {
            const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
            const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
            return dateB - dateA;
        });
}

function parseSpeakerSegments(transcription) {
    if (!transcription) {
        return [];
    }

    if (Array.isArray(transcription.__parsedSpeakerSegments)) {
        return transcription.__parsedSpeakerSegments;
    }

    const rawSegments = transcription.speaker_segments;

    if (Array.isArray(rawSegments)) {
        return rawSegments;
    }

    if (typeof rawSegments === 'string') {
        try {
            const parsed = JSON.parse(rawSegments);
            if (Array.isArray(parsed)) {
                transcription.__parsedSpeakerSegments = parsed;
                return parsed;
            }
        } catch (error) {
            console.warn('Unable to parse speaker segments JSON:', error);
        }
    }

    const legacySegments = transcription.speakers;
    if (Array.isArray(legacySegments)) {
        transcription.__parsedSpeakerSegments = legacySegments;
        return legacySegments;
    }

    if (typeof legacySegments === 'string') {
        try {
            const parsedLegacy = JSON.parse(legacySegments);
            if (Array.isArray(parsedLegacy)) {
                transcription.__parsedSpeakerSegments = parsedLegacy;
                return parsedLegacy;
            }
        } catch (error) {
            console.warn('Unable to parse legacy speakers JSON:', error);
        }
    }

    return [];
}

function syncTableCardStat(statKey, tableNumber, value) {
    const normalizedKey = String(statKey).toLowerCase();
    const normalizedTable = String(tableNumber);
    const escapedTable = (typeof CSS !== 'undefined' && typeof CSS.escape === 'function')
        ? CSS.escape(normalizedTable)
        : normalizedTable.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    const card = document.querySelector(`.table-card[data-table-number="${escapedTable}"]`);
    if (!card) {
        return;
    }

    const valueEl = card.querySelector(`.table-session-card__stat[data-stat="${normalizedKey}"] .table-session-card__stat-value`);
    if (!valueEl) {
        return;
    }

    valueEl.textContent = value;
}

function updateSessionSummaryIndicators() {
    const activeTableIds = new Set();
    tableParticipantSnapshots.forEach((_, key) => activeTableIds.add(key));
    tableTranscriptionCounts.forEach((_, key) => activeTableIds.add(key));
    tableRecordingCounts.forEach((_, key) => activeTableIds.add(key));

    const activeTableCount = activeTableIds.size || currentSession?.tables?.length || currentSession?.table_count || 0;
    const totalTranscriptions = Array.from(tableTranscriptionCounts.values())
        .reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);
    const totalRecordings = Array.from(tableRecordingCounts.values())
        .reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Number(value) : 0), 0);

    const uniqueSpeakers = new Set();
    let aggregateParticipants = 0;

    tableParticipantSnapshots.forEach((snapshot) => {
        aggregateParticipants += snapshot.count;
        snapshot.identifiers.forEach((id) => {
            if (id) {
                uniqueSpeakers.add(String(id).trim().toLowerCase());
            }
        });
    });

    const totalSpeakers = uniqueSpeakers.size || aggregateParticipants || currentSession?.total_participants || 0;

    const activeTableElement = document.getElementById('activeTableCount');
    if (activeTableElement) {
        activeTableElement.textContent = activeTableCount;
    }

    const totalTranscriptionsElement = document.getElementById('totalTranscriptions');
    if (totalTranscriptionsElement) {
        totalTranscriptionsElement.textContent = totalTranscriptions;
    }

    const totalSpeakersElement = document.getElementById('totalSpeakers');
    if (totalSpeakersElement) {
        totalSpeakersElement.textContent = totalSpeakers;
    }

    const recordingCountElement = document.getElementById('recordingCount');
    if (recordingCountElement) {
        recordingCountElement.textContent = totalRecordings;
    }

    if (currentSession) {
        currentSession.active_tables = activeTableCount;
        currentSession.total_transcriptions = totalTranscriptions;
        currentSession.total_participants = totalSpeakers;
        currentSession.total_recordings = totalRecordings;
    }
}

function normalizeCount(candidates = []) {
    for (const candidate of candidates) {
        if (candidate === null || candidate === undefined) continue;
        const numeric = Number(candidate);
        if (Number.isFinite(numeric) && numeric >= 0) {
            return numeric;
        }
    }
    return 0;
}

function participantIdentifierFromSnapshot(participant) {
    if (!participant) {
        return null;
    }

    if (typeof participant === 'string') {
        return participant;
    }

    return participant.id
        || participant.participant_id
        || participant.uuid
        || participant.email
        || participant.name
        || null;
}

function resolveTableNumber(tableIdentifier) {
    const identifier = String(tableIdentifier);

    if (currentSession && Array.isArray(currentSession.tables)) {
        const exactMatch = currentSession.tables.find((table) =>
            String(table.id) === identifier || String(table.table_number) === identifier
        );

        if (exactMatch && exactMatch.table_number != null) {
            return exactMatch.table_number;
        }
    }

    return identifier;
}

function updateSessionTableSnapshot(tableIdentifier, updates = {}) {
    if (!currentSession || !Array.isArray(currentSession.tables)) {
        return;
    }

    const identifier = String(tableIdentifier);

    const targetTable = currentSession.tables.find((table) =>
        String(table.id) === identifier || String(table.table_number) === identifier
    );

    if (targetTable) {
        Object.assign(targetTable, updates);
    }
}

async function refreshTableTranscriptionStats(sessionId, tableIdentifier) {
    if (!sessionId || tableIdentifier == null) {
        return;
    }

    const resolvedNumber = resolveTableNumber(tableIdentifier);

    try {
        const response = await fetch(`/api/sessions/${sessionId}/tables/${resolvedNumber}/transcriptions`);
        if (!response.ok) {
            throw new Error(`Failed to refresh transcriptions for table ${resolvedNumber}`);
        }

        const transcriptions = await response.json();
        const prioritized = prioritizeTranscriptions(transcriptions);
        const totalForTable = prioritized.length;

        tableTranscriptionCounts.set(String(resolvedNumber), totalForTable);
        syncTableCardStat('transcriptions', resolvedNumber, totalForTable);
        updateSessionSummaryIndicators();

        updateSessionTableSnapshot(resolvedNumber, {
            transcription_count: totalForTable
        });

        if (
            currentTable &&
            (String(currentTable.id) === String(tableIdentifier) ||
                String(currentTable.table_number) === String(resolvedNumber))
        ) {
            displayExistingTranscriptions(transcriptions, { syncTableStats: false });
        }

    } catch (error) {
        console.error('Failed to refresh table transcription stats:', error);
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

        const eventSource = data?.source || data?.transcription?.source;
        const isReprocessUpdate = eventSource === 'reprocess';

        if (isReprocessUpdate) {
            const sessionIdForRefresh = data.sessionId || currentSession?.id;
            refreshTableTranscriptionStats(sessionIdForRefresh, data.tableId);
        } else {
            displayTranscription(data);
            updateTableTranscriptionCount(data.tableId);
        }

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

        const words = Array.isArray(data.words) ? data.words : [];

        if (words.length > 0) {
            words.forEach(word => {
                if (!word || typeof word.word !== 'string') return;
                const speaker = typeof word.speaker === 'number' ? word.speaker : 0;
                displayLiveTranscriptionWord(speaker, word.word);
            });

            if (data.is_final) {
                currentLiveSpeaker = null;
                currentLiveBubble = null;
                if (currentInterimBubble) {
                    currentInterimBubble.remove();
                    currentInterimBubble = null;
                }
            }
        } else if (data.transcript && data.transcript.trim()) {
            // Fallback to transcript-based display when word data is unavailable
            displayLiveTranscriptionResult(data.transcript, data.is_final);
        } else {
            console.log('📥 Skipping empty transcript payload');
        }
    });
    
    socket.on('live-transcription-error', (data) => {
        console.error('❌ Live transcription error:', data.error);
        showToast(`Live transcription error: ${data.error}`, 'error');
        resetLiveTranscriptionState({ silent: true });
    });
    
    socket.on('live-transcription-ended', () => {
        console.log('🔌 Live transcription connection ended');
        resetLiveTranscriptionState({ silent: true });
        showToast('Live transcription connection ended', 'info');
    });
    
    socket.on('live-transcription-stopped', () => {
        console.log('🛑 Live transcription stopped');
        resetLiveTranscriptionState({ silent: true });
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
    safeSetEventListener('adminLoginForm', 'onsubmit', function(event) {
        event.preventDefault();
        adminLogin();
    });
    safeSetEventListener('sessionSelect', 'onchange', event => {
        // Support both the legacy join form (session/table selects) and the new wizard
        if (document.getElementById('tableSelect')) {
            loadSessionTables(event);
        }

        if (typeof handleSessionSelection === 'function') {
            handleSessionSelection(event);
        }
    });
    
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
    ['liveTranscriptionBtn'].forEach((id) => {
        safeSetEventListener(id, 'onclick', startLiveTranscription);
    });
    ['stopLiveTranscriptionBtn'].forEach((id) => {
        safeSetEventListener(id, 'onclick', stopLiveTranscription);
    });
    
    // QR Code functionality
    safeSetEventListener('showQRCodesBtn', 'onclick', showQRCodes);
    safeSetEventListener('hideQRCodesBtn', 'onclick', hideQRCodes);
    safeSetEventListener('downloadAllQRBtn', 'onclick', downloadAllQRCodes);
    safeSetEventListener('printQRBtn', 'onclick', printQRCodes);
    
    // Mobile QR Scanner
    safeSetEventListener('closeScannerBtn', 'onclick', closeQRScanner);
    safeSetEventListener('manualJoinBtn', 'onclick', showManualJoin);
    safeSetEventListener('closeManualJoinBtn', 'onclick', closeManualJoin);
    safeSetEventListener('cancelManualJoinBtn', 'onclick', closeManualJoin);
    safeSetEventListener('submitManualJoinBtn', 'onclick', submitManualJoin);
    safeSetEventListener('dismissActionBtn', 'onclick', closeSessionActionModal);
    safeSetEventListener('dismissHistoryBtn', 'onclick', closeSessionHistory);
    safeSetEventListener('closeTranscriptionPreviewBtn', 'onclick', closeTranscriptionPreview);

    // Handle manual code input with keypress
    const manualCodeInput = document.getElementById('manualCode');
    if (manualCodeInput) {
        manualCodeInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                submitManualJoin();
            }
        });
    }

    const transcriptionPreviewModal = document.getElementById('transcriptionPreviewModal');
    if (transcriptionPreviewModal) {
        transcriptionPreviewModal.addEventListener('click', event => {
            if (event.target === transcriptionPreviewModal) {
                closeTranscriptionPreview();
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
        'allTranscriptionsScreen': 'Session Transcriptions',
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

async function showTableInterface(tableId) {
    console.log('[DEBUG] showTableInterface called with tableId:', tableId);
    console.log('[DEBUG] Current currentTable before override:', currentTable ? {id: currentTable.id, table_number: currentTable.table_number, name: currentTable.name} : 'null');
    
    if (!currentSession || !currentSession.tables) return;

    const foundTable = currentSession.tables.find(t => t.id === tableId || t.table_number === tableId);
    console.log('[DEBUG] Found table in showTableInterface:', foundTable ? {id: foundTable.id, table_number: foundTable.table_number, name: foundTable.name} : 'not found');
    if (!foundTable) return;

    if (!tablesMatch(currentTable, foundTable)) {
        await stopRecordingIfActive({ silent: true });
    }

    currentTable = foundTable;

    await setupTableInterface();
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
        showElement(scanner);
        initializeQRScanner();
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
        hideElement(scanner);
    }
}

function closeQRScanner() {
    hideQRScanner();
}

function showManualJoin() {
    hideQRScanner();
    const modal = document.getElementById('manualJoinModal');
    if (modal) {
        showElement(modal);
        document.getElementById('manualCode')?.focus();
    }
}

function closeManualJoin() {
    const modal = document.getElementById('manualJoinModal');
    if (modal) {
        hideElement(modal);
    }
    const manualCode = document.getElementById('manualCode');
    if (manualCode) {
        manualCode.value = '';
    }
}

// Join Session QR Scanner - enhanced version for join session context
function showJoinQRScanner() {
    console.log('QR scanning works best on mobile devices');
    selectJoinMethod('qr');
    const scanner = document.getElementById('mobileScanner');
    if (scanner) {
        // Update scanner title for join session context
        const scannerTitle = scanner.querySelector('h3');
        const scannerDescription = scanner.querySelector('p');
        if (scannerTitle) scannerTitle.textContent = 'Scan QR Code';
        if (scannerDescription) scannerDescription.textContent = 'Point camera at session QR code';
        
        showElement(scanner);
        initializeQRScanner();
    }
}

// Duplicate quickJoinSession function removed - using quickJoinWithCode from Step 1 instead

// Old duplicate function removed - using proper backend API now

// Join Wizard Management
let currentJoinMethod = 'code';
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

    document.querySelectorAll('.join-method.join-method--interactive').forEach(card => {
        if (card.dataset.interactiveInitialized === 'true') {
            return;
        }
        card.dataset.interactiveInitialized = 'true';
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                const method = card.dataset.method;
                if (method === 'qr') {
                    showJoinQRScanner();
                } else if (method) {
                    selectJoinMethod(method);
                }
            }
        });
    });
}

function resetWizard() {
    currentJoinMethod = 'code';
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
    document.querySelectorAll('.join-method').forEach(card => {
        if (!card) return;
        card.classList.remove('selected');
        card.setAttribute('aria-pressed', 'false');
    });
    const defaultMethodCard = document.querySelector('.join-method[data-method="code"]');
    if (defaultMethodCard) {
        defaultMethodCard.classList.add('selected');
        defaultMethodCard.setAttribute('aria-pressed', 'true');
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
    document.querySelectorAll('.join-method').forEach(card => {
        card.classList.remove('selected');
        card.setAttribute('aria-pressed', 'false');
    });
    const selectedCard = document.querySelector(`.join-method[data-method="${method}"]`);
    if (selectedCard) {
        selectedCard.classList.add('selected');
        selectedCard.setAttribute('aria-pressed', 'true');
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
        document.getElementById('tableSelection').innerHTML = '<p class="empty-state">No session selected. Please go back and select a session.</p>';
        return;
    }

    // Update session info card
    const sessionInfoCard = document.getElementById('selectedSessionInfo');
    sessionInfoCard.innerHTML = `
        <div class="info-card__content">
            <h4 class="info-card__title">${selectedSessionData.title}</h4>
            <p class="info-card__subtitle">Select an available table to join.</p>
        </div>
    `;

    // Load tables
    const tableSelection = document.getElementById('tableSelection');
    tableSelection.innerHTML = '<p class="helper-text">Loading tables...</p>';

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
            tableSelection.innerHTML = '<p class="empty-state">No tables available for this session.</p>';
            return;
        }

        tableSelection.innerHTML = tables.map(table => {
            const currentParticipants = table.current_participants || 0;
            const maxSize = table.max_size || 10;
            const isFull = currentParticipants >= maxSize;

            return `
                <button type="button"
                        class="table-card join-table-card ${isFull ? 'join-table-card--full' : ''}"
                        data-table-id="${table.id}"
                        data-table-number="${table.table_number}"
                        role="listitem"
                        ${isFull ? 'disabled aria-disabled="true"' : 'aria-pressed="false"'}>
                    <span class="join-table-card__title">Table ${table.table_number}</span>
                    <span class="join-table-card__meta">${currentParticipants}/${maxSize} participants</span>
                    ${table.name ? `<span class="join-table-card__note">${table.name}</span>` : ''}
                    ${isFull ? '<span class="join-table-card__status">Full</span>' : ''}
                </button>
            `;
        }).join('');

        tableSelection.querySelectorAll('.join-table-card').forEach(card => {
            if (card.disabled) {
                return;
            }
            card.addEventListener('click', () => selectTable(Number(card.dataset.tableNumber)));
        });

    } catch (error) {
        console.error('Error loading tables:', error);
        tableSelection.innerHTML = `<p class="empty-state">Error loading tables: ${error.message}</p>`;
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
        document.querySelectorAll('.join-table-card').forEach(card => {
            card.classList.remove('is-selected');
            card.setAttribute('aria-pressed', 'false');
        });

        // Disable final join button
        const finalJoinBtn = document.getElementById('finalJoinBtn');
        if (finalJoinBtn) {
            finalJoinBtn.disabled = true;
        }
        return;
    }

    // Select new table
    selectedTableId = tableId;
    console.log(`[DEBUG] Selected table ID set to: ${selectedTableId}`);

    // Update table selection visuals
    document.querySelectorAll('.join-table-card').forEach(card => {
        card.classList.remove('is-selected');
        card.setAttribute('aria-pressed', 'false');
    });

    // Highlight selected card
    const selectedCard = document.querySelector(`.join-table-card[data-table-number="${tableId}"]`);
    if (selectedCard) {
        selectedCard.classList.add('is-selected');
        selectedCard.setAttribute('aria-pressed', 'true');
    }

    // Enable final join button
    const finalJoinBtn = document.getElementById('finalJoinBtn');
    if (finalJoinBtn) {
        finalJoinBtn.disabled = false;
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
        
        // Stop any active recording before switching tables
        if (!tablesMatch(currentTable, table)) {
            await stopRecordingIfActive({ silent: true });
        }

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
    
    const joinMethodCard = sessionCodeInput.closest('.join-method');
    const joinButton = joinMethodCard ? joinMethodCard.querySelector('.btn-primary') : null;
    const originalText = joinButton ? joinButton.textContent : '';
    if (joinButton) {
        joinButton.textContent = 'Joining...';
        joinButton.disabled = true;
    }
    
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
        if (joinButton) {
            joinButton.textContent = originalText;
            joinButton.disabled = false;
        }
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
            if (!tablesMatch(currentTable, result.table)) {
                await stopRecordingIfActive({ silent: true });
            }

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
        showScreen('allTranscriptionsScreen');
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

    transcriptionRegistry.clear();

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

    allTranscriptionsList.innerHTML = '';

    if (filteredTranscriptions.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';

        const emptyIcon = document.createElement('div');
        emptyIcon.className = 'empty-state__icon';
        emptyIcon.textContent = '🔍';

        const emptyTitle = document.createElement('h5');
        emptyTitle.className = 'empty-state__title';
        emptyTitle.textContent = 'No transcriptions found';

        const emptyDescription = document.createElement('p');
        emptyDescription.className = 'empty-state__description';
        emptyDescription.textContent = 'No recordings match the current filter criteria yet.';

        emptyState.append(emptyIcon, emptyTitle, emptyDescription);
        allTranscriptionsList.appendChild(emptyState);
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

    const fragment = document.createDocumentFragment();

    Object.keys(groupedTranscriptions)
        .sort((a, b) => {
            const tableA = parseInt(a.split('_')[1], 10);
            const tableB = parseInt(b.split('_')[1], 10);
            return tableA - tableB;
        })
        .forEach(tableKey => {
            const tableNumber = tableKey.split('_')[1];
            const tableTranscriptions = groupedTranscriptions[tableKey];

            const groupCard = document.createElement('section');
            groupCard.className = 'card transcription-group';
            groupCard.dataset.tableNumber = tableNumber;

            const header = document.createElement('header');
            header.className = 'card__header transcription-group__header';

            const heading = document.createElement('div');
            heading.className = 'transcription-group__heading';

            const title = document.createElement('h3');
            title.className = 'transcription-group__title';

            const titleIcon = document.createElement('span');
            titleIcon.className = 'transcription-group__icon';
            titleIcon.setAttribute('aria-hidden', 'true');
            titleIcon.textContent = '📢';

            const titleText = document.createElement('span');
            titleText.textContent = `Table ${tableNumber}`;

            title.append(titleIcon, titleText);
            heading.appendChild(title);

            const badge = document.createElement('span');
            badge.className = 'badge badge-neutral transcription-group__badge';
            badge.textContent = `${tableTranscriptions.length} recording${tableTranscriptions.length !== 1 ? 's' : ''}`;

            header.append(heading, badge);

            const body = document.createElement('div');
            body.className = 'transcription-group__body';

            const list = document.createElement('div');
            list.className = 'transcription-group__list';

            tableTranscriptions.forEach((transcription, index) => {
                const speakerSegments = transcription.speaker_segments ?
                    (typeof transcription.speaker_segments === 'string'
                        ? JSON.parse(transcription.speaker_segments)
                        : transcription.speaker_segments)
                    : [];

                const consolidatedSegments = consolidateSpeakerSegments(speakerSegments);
                const uniqueSpeakers = new Set(consolidatedSegments.map(segment => segment.speaker));
                const createdAt = new Date(transcription.created_at);
                const recordedAt = transcription.recording_created_at
                    ? new Date(transcription.recording_created_at)
                    : null;
                const durationSeconds = parseFloat(transcription.duration_seconds) || 0;
                const transcriptionId = String(transcription.id || `${tableNumber}-${index}`);

                const card = document.createElement('article');
                card.className = 'transcription-card';
                card.dataset.transcriptionId = transcriptionId;
                card.dataset.tableNumber = tableNumber;
                card.tabIndex = 0;
                card.setAttribute('role', 'button');
                card.setAttribute('aria-pressed', 'false');
                card.setAttribute('aria-label', `Recording ${index + 1} from table ${tableNumber}`);

                const cardHeader = document.createElement('div');
                cardHeader.className = 'transcription-card__header';

                const cardTitle = document.createElement('h4');
                cardTitle.className = 'transcription-card__title';

                const cardIcon = document.createElement('span');
                cardIcon.className = 'transcription-card__icon';
                cardIcon.setAttribute('aria-hidden', 'true');
                cardIcon.textContent = '🎤';

                const cardTitleText = document.createElement('span');
                cardTitleText.textContent = `Recording ${index + 1}`;

                cardTitle.append(cardIcon, cardTitleText);

                const meta = document.createElement('div');
                meta.className = 'transcription-card__meta';
                meta.append(
                    createTranscriptionMetaItem('📅', `${createdAt.toLocaleDateString()} · ${createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`),
                    createTranscriptionMetaItem('⏱️', formatDuration(durationSeconds)),
                    createTranscriptionMetaItem('🗣️', `${uniqueSpeakers.size || 0} speaker${uniqueSpeakers.size === 1 ? '' : 's'}`)
                );

                cardHeader.append(cardTitle, meta);

                const segments = document.createElement('div');
                segments.className = 'transcription-card__segments';

                if (consolidatedSegments.length === 0) {
                    const placeholder = document.createElement('div');
                    placeholder.className = 'transcription-card__empty';
                    placeholder.textContent = 'No transcription available for this recording yet.';
                    segments.appendChild(placeholder);
                } else {
                    consolidatedSegments.forEach(segment => {
                        const segmentWrapper = document.createElement('div');
                        segmentWrapper.className = 'transcription-segment';

                        const speakerLabel = document.createElement('p');
                        speakerLabel.className = 'transcription-segment__speaker';
                        speakerLabel.textContent = `Speaker ${(segment.speaker || 0) + 1}`;

                        const text = document.createElement('p');
                        text.className = 'transcription-segment__text';
                        text.textContent =
                            (typeof segment.consolidatedText === 'string' && segment.consolidatedText) ||
                            (typeof segment.transcript === 'string' && segment.transcript) ||
                            (typeof segment.text === 'string' && segment.text) ||
                            'No text available';

                        segmentWrapper.append(speakerLabel, text);
                        segments.appendChild(segmentWrapper);
                    });
                }

                card.append(cardHeader, segments);

                transcriptionRegistry.set(transcriptionId, {
                    id: transcriptionId,
                    index: index + 1,
                    tableNumber,
                    createdAt,
                    recordedAt,
                    durationSeconds,
                    speakerCount: uniqueSpeakers.size || 0,
                    source: transcription.source,
                    participantName: transcription.participant_name,
                    filename: transcription.filename,
                    transcriptText: transcription.transcript_text,
                    consolidatedSegments,
                    confidence: transcription.confidence_score,
                    language: transcription.language,
                    wordCount: transcription.word_count
                });

                card.addEventListener('click', () => {
                    selectTranscription(transcriptionId);
                    openTranscriptionPreview(transcriptionId);
                });
                card.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        selectTranscription(transcriptionId);
                        openTranscriptionPreview(transcriptionId);
                    }
                });

                list.appendChild(card);
            });

            body.appendChild(list);
            groupCard.append(header, body);

            fragment.appendChild(groupCard);
        });

    allTranscriptionsList.appendChild(fragment);
}

function createTranscriptionMetaItem(icon, text) {
    const item = document.createElement('span');
    item.className = 'transcription-card__meta-item';

    const iconEl = document.createElement('span');
    iconEl.className = 'transcription-card__meta-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;

    const textEl = document.createElement('span');
    textEl.className = 'transcription-card__meta-text';
    textEl.textContent = text;

    item.append(iconEl, textEl);
    return item;
}

// Transcription selection function with shared card states
function selectTranscription(transcriptionId) {
    console.log('Transcription selected:', transcriptionId);

    const cards = document.querySelectorAll('.transcription-card');
    cards.forEach(card => {
        const isMatch = card.dataset.transcriptionId === String(transcriptionId);
        card.classList.toggle('is-selected', isMatch);
        card.setAttribute('aria-pressed', isMatch ? 'true' : 'false');

        if (isMatch) {
            card.classList.remove('is-animating');
            // Trigger reflow so the animation can replay when reselecting the same card
            void card.offsetWidth;
            card.classList.add('is-animating');
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
            card.classList.remove('is-animating');
        }
    });
}

function openTranscriptionPreview(transcriptionId) {
    const modalOverlay = document.getElementById('transcriptionPreviewModal');
    const dialog = document.getElementById('transcriptionPreviewDialog');

    if (!modalOverlay || !dialog) {
        console.warn('Transcription preview modal elements not found');
        return;
    }

    const entry = transcriptionRegistry.get(String(transcriptionId));
    if (!entry) {
        console.warn('No transcription data available for preview:', transcriptionId);
        return;
    }

    populateTranscriptionPreview(entry);

    modalOverlay.dataset.activeTranscriptionId = String(transcriptionId);
    lastFocusedTranscriptionCard = document.querySelector(
        `.transcription-card[data-transcription-id="${transcriptionId}"]`
    );

    showElement(modalOverlay);
    dialog.focus();

    if (!transcriptionPreviewEscapeHandler) {
        transcriptionPreviewEscapeHandler = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeTranscriptionPreview();
            }
        };
        document.addEventListener('keydown', transcriptionPreviewEscapeHandler);
    }
}

function closeTranscriptionPreview() {
    const modalOverlay = document.getElementById('transcriptionPreviewModal');
    if (!modalOverlay) {
        return;
    }

    hideElement(modalOverlay);
    modalOverlay.dataset.activeTranscriptionId = '';

    if (transcriptionPreviewEscapeHandler) {
        document.removeEventListener('keydown', transcriptionPreviewEscapeHandler);
        transcriptionPreviewEscapeHandler = null;
    }

    if (lastFocusedTranscriptionCard) {
        lastFocusedTranscriptionCard.focus();
        lastFocusedTranscriptionCard = null;
    }
}

function populateTranscriptionPreview(entry) {
    const title = document.getElementById('transcriptionPreviewTitle');
    const metaContainer = document.getElementById('transcriptionPreviewMeta');
    const segmentsContainer = document.getElementById('transcriptionPreviewSegments');
    const fullTextSection = document.getElementById('transcriptionPreviewFullTextSection');
    const fullTextContent = document.getElementById('transcriptionPreviewFullText');

    if (!title || !metaContainer || !segmentsContainer || !fullTextSection || !fullTextContent) {
        console.warn('Transcription preview containers missing');
        return;
    }

    title.textContent = `Table ${entry.tableNumber} · Recording ${entry.index}`;

    metaContainer.innerHTML = '';
    const metaItems = [];

    const recordedDate = entry.recordedAt instanceof Date && !Number.isNaN(entry.recordedAt)
        ? entry.recordedAt
        : entry.createdAt;
    const recordedLabel = formatDateTime(recordedDate);
    if (recordedLabel) {
        metaItems.push({ label: 'Recorded', value: recordedLabel });
    }

    if (entry.durationSeconds) {
        metaItems.push({ label: 'Duration', value: formatDuration(entry.durationSeconds) });
    }

    if (entry.speakerCount) {
        const speakerLabel = entry.speakerCount === 1
            ? '1 speaker'
            : `${entry.speakerCount} speakers`;
        metaItems.push({ label: 'Speakers', value: speakerLabel });
    }

    const sourceLabel = getSourceLabel(entry.source);
    if (sourceLabel && sourceLabel !== 'Unknown') {
        metaItems.push({ label: 'Source', value: sourceLabel });
    }

    if (entry.participantName) {
        metaItems.push({ label: 'Recorded By', value: entry.participantName });
    }

    if (entry.filename) {
        metaItems.push({ label: 'File Name', value: entry.filename });
    }

    if (entry.language) {
        metaItems.push({ label: 'Language', value: entry.language.toUpperCase() });
    }

    if (typeof entry.wordCount === 'number' && entry.wordCount > 0) {
        metaItems.push({ label: 'Word Count', value: entry.wordCount.toLocaleString() });
    }

    if (typeof entry.confidence === 'number' && entry.confidence > 0) {
        metaItems.push({ label: 'Confidence', value: `${Math.round(entry.confidence * 100)}%` });
    }

    if (metaItems.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'transcription-preview__empty';
        placeholder.textContent = 'No metadata is available for this recording yet.';
        metaContainer.appendChild(placeholder);
    } else {
        metaItems.forEach(item => {
            const metaItem = document.createElement('div');
            metaItem.className = 'transcription-preview__meta-item';

            const label = document.createElement('span');
            label.className = 'transcription-preview__meta-label';
            label.textContent = item.label;

            const value = document.createElement('span');
            value.className = 'transcription-preview__meta-value';
            value.textContent = item.value;

            metaItem.append(label, value);
            metaContainer.appendChild(metaItem);
        });
    }

    segmentsContainer.innerHTML = '';

    if (entry.consolidatedSegments && entry.consolidatedSegments.length > 0) {
        entry.consolidatedSegments.forEach(segment => {
            const segmentCard = document.createElement('article');
            segmentCard.className = 'transcription-preview__segment';

            const header = document.createElement('div');
            header.className = 'transcription-preview__segment-header';

            const speaker = document.createElement('p');
            speaker.className = 'transcription-preview__speaker';
            speaker.textContent = `Speaker ${(segment.speaker ?? 0) + 1}`;

            header.appendChild(speaker);

            const timeRange = formatTimestampRange(segment.startTime, segment.endTime);
            if (timeRange) {
                const timestamp = document.createElement('span');
                timestamp.className = 'transcription-preview__timestamp';
                timestamp.textContent = timeRange;
                header.appendChild(timestamp);
            }

            const text = document.createElement('p');
            text.className = 'transcription-preview__text';
            text.textContent =
                (typeof segment.consolidatedText === 'string' && segment.consolidatedText) ||
                (typeof segment.transcript === 'string' && segment.transcript) ||
                (typeof segment.text === 'string' && segment.text) ||
                'No transcript text available for this segment.';

            segmentCard.append(header, text);
            segmentsContainer.appendChild(segmentCard);
        });
    } else {
        const emptyState = document.createElement('div');
        emptyState.className = 'transcription-preview__empty';
        emptyState.textContent = 'No speaker segments are available for this transcription yet.';
        segmentsContainer.appendChild(emptyState);
    }

    if (entry.transcriptText && entry.transcriptText.trim()) {
        fullTextContent.textContent = entry.transcriptText.trim();
        showElement(fullTextSection);
    } else {
        fullTextContent.textContent = '';
        hideElement(fullTextSection);
    }
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

    const tablesForSession = Array.isArray(session.tables) ? session.tables : [];
    const activeTableCount = tablesForSession.length
        || session.active_tables
        || session.tableCount
        || session.table_count
        || 0;
    const initialTranscriptionsTotal = Number(session.total_transcriptions) || 0;
    const initialParticipantsTotal = Number(session.total_participants) || 0;
    const initialRecordingsTotal = Number(session.total_recordings) || 0;

    document.getElementById('activeTableCount').textContent = activeTableCount;
    document.getElementById('totalTranscriptions').textContent = initialTranscriptionsTotal;
    document.getElementById('totalSpeakers').textContent = initialParticipantsTotal;
    document.getElementById('recordingCount').textContent = initialRecordingsTotal;
    
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
        const sessionBadge = document.getElementById('sessionRecordingCountBadge');
        if (sessionBadge) {
            sessionBadge.textContent = totalRecordings;
        }
        
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
        const sessionBadge = document.getElementById('sessionRecordingCountBadge');
        if (sessionBadge) {
            sessionBadge.textContent = String(session.total_recordings || 0);
        }
        const durationElement = document.getElementById('totalRecordingDuration');
        if (durationElement) {
            durationElement.textContent = '0m';
        }
    }
    
    // Update language indicator
    updateSessionLanguageIndicator(session.language || 'en');
    
    // Load tables if available
    const hasRealTables = Array.isArray(session.tables) && session.tables.some(table => table && (table.id || table.session_id));

    showAllTableQRCodes = false;

    const sessionRecordingsSection = document.getElementById('sessionRecordingsSection');
    if (sessionRecordingsSection) {
        showElement(sessionRecordingsSection);
        const badgeElement = document.getElementById('sessionRecordingCountBadge');
        if (badgeElement) {
            const total = typeof totalRecordings === 'number' ? totalRecordings : (session.total_recordings || 0);
            badgeElement.textContent = String(total);
        }
    }

    if (hasRealTables) {
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

    tablesGrid.innerHTML = '';

    tableParticipantSnapshots.clear();
    tableRecordingCounts.clear();
    tableTranscriptionCounts.clear();

    if (!tables || tables.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'table-card table-card--empty';
        emptyState.innerHTML = `
            <div class="table-card__empty-icon" aria-hidden="true">📢</div>
            <h3 class="table-card__empty-title">No tables yet</h3>
            <p class="table-card__empty-description">Create your first table to start the World Café session.</p>
            <button type="button" class="btn btn-primary btn-sm table-card__empty-action" onclick="showCreateTable()">
                ➕ Create Table
            </button>
        `;
        tablesGrid.appendChild(emptyState);
        updateSessionSummaryIndicators();
        return;
    }

    const createStatBlock = (key, icon, label, value) => {
        const stat = document.createElement('div');
        stat.className = 'table-session-card__stat';
        stat.dataset.stat = key;

        const labelRow = document.createElement('span');
        labelRow.className = 'table-session-card__stat-label';

        const iconEl = document.createElement('span');
        iconEl.className = 'table-session-card__stat-icon';
        iconEl.setAttribute('aria-hidden', 'true');
        iconEl.textContent = icon;

        const labelText = document.createElement('span');
        labelText.className = 'table-session-card__stat-label-text';
        labelText.textContent = label;

        labelRow.append(iconEl, labelText);

        const valueEl = document.createElement('span');
        valueEl.className = 'table-session-card__stat-value';
        valueEl.textContent = value;

        stat.append(labelRow, valueEl);
        return stat;
    };

    tables.forEach(table => {
        const participantList = Array.isArray(table.participants) ? table.participants.filter(Boolean) : [];
        const participantCount = typeof table.participant_count === 'number'
            ? table.participant_count
            : participantList.length;
        const maxSize = table.max_size || table.maxSize || table.capacity || 5;
        const recordingCount = normalizeCount([
            table.recording_count,
            table.recordingCount,
            Array.isArray(table.recordings) ? table.recordings.length : null
        ]);
        const transcriptionCount = normalizeCount([
            table.transcription_count,
            table.transcriptionCount,
            Array.isArray(table.transcriptions) ? table.transcriptions.length : null
        ]);
        const rawStatus = (table.status || 'waiting').toString().toLowerCase();
        const formattedStatus = formatStatusLabel(rawStatus);
        const statusVariant = getTableStatusVariant(rawStatus);
        const facilitatorName = table.facilitator_name || table.host_name || 'Unassigned';
        const sessionIdForTable = currentSession?.id || table.session_id || table.sessionId || '';
        const tableCode = sessionIdForTable ? `${sessionIdForTable}/table/${table.table_number}` : `Table ${table.table_number}`;
        const updatedTimestamp = table.updated_at || table.last_activity_at || table.last_update || table.modified_at;
        const updatedText = updatedTimestamp ? `Updated ${formatRelativeTime(updatedTimestamp)}` : 'Updated moments ago';
        const promptText = [table.prompt, table.topic, table.description].find(entry => typeof entry === 'string' && entry.trim());

        const card = document.createElement('article');
        card.className = 'table-card table-card--session';
        card.dataset.tableId = table.id || table.table_number;
        card.dataset.tableNumber = table.table_number;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Open ${table.name || `Table ${table.table_number}`}`);
        card.addEventListener('click', () => showTableInterface(table.id || table.table_number));
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                showTableInterface(table.id || table.table_number);
            }
        });

        const header = document.createElement('header');
        header.className = 'table-session-card__header';

        const titleGroup = document.createElement('div');
        titleGroup.className = 'table-session-card__title-group';

        const icon = document.createElement('span');
        icon.className = 'table-session-card__icon';
        icon.textContent = table.icon || '🪑';

        const titleTextGroup = document.createElement('div');
        titleTextGroup.className = 'table-session-card__title-text';

        const title = document.createElement('h3');
        title.className = 'table-session-card__title';
        title.textContent = table.name || `Table ${table.table_number}`;

        const subtitle = document.createElement('p');
        subtitle.className = 'table-session-card__subtitle';
        const participantSummary = `${participantCount}/${maxSize} participants`;
        subtitle.textContent = facilitatorName ? `${participantSummary} · Facilitator: ${facilitatorName}` : participantSummary;

        titleTextGroup.append(title, subtitle);
        titleGroup.append(icon, titleTextGroup);

        const statusBadge = document.createElement('span');
        statusBadge.className = `badge ${statusVariant}`;
        statusBadge.textContent = formattedStatus;

        header.append(titleGroup, statusBadge);
        card.appendChild(header);

        if (promptText) {
            const prompt = document.createElement('p');
            prompt.className = 'table-session-card__prompt';
            prompt.textContent = promptText.trim();
            card.appendChild(prompt);
        }

        const codeSection = document.createElement('div');
        codeSection.className = 'table-session-card__code';

        const codeLabel = document.createElement('span');
        codeLabel.className = 'table-session-card__code-label';
        codeLabel.textContent = 'Table Code';

        const codeButton = document.createElement('button');
        codeButton.type = 'button';
        codeButton.className = 'table-session-card__code-value';
        codeButton.textContent = tableCode;
        codeButton.addEventListener('click', (event) => {
            event.stopPropagation();
            copyTableCode(tableCode, event);
        });
        codeButton.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                event.stopPropagation();
                copyTableCode(tableCode, event);
            }
        });

        const codeActions = document.createElement('div');
        codeActions.className = 'table-session-card__code-actions';

        const copyCodeBtn = document.createElement('button');
        copyCodeBtn.type = 'button';
        copyCodeBtn.className = 'btn btn-secondary btn-sm';
        copyCodeBtn.textContent = '📋 Copy Code';
        copyCodeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            copyTableCode(tableCode, event);
        });

        const copyLinkBtn = document.createElement('button');
        copyLinkBtn.type = 'button';
        copyLinkBtn.className = 'btn btn-secondary btn-sm';
        copyLinkBtn.textContent = '🔗 Copy Link';
        copyLinkBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            copyTableLink(sessionIdForTable, table.table_number, event);
        });

        const qrCodeBtn = document.createElement('button');
        qrCodeBtn.type = 'button';
        qrCodeBtn.className = 'btn btn-secondary btn-sm';
        qrCodeBtn.textContent = '📱 QR Code';
        qrCodeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            showTableQRCode(sessionIdForTable, table.table_number, table.name);
        });

        if (!sessionIdForTable) {
            copyLinkBtn.disabled = true;
            copyLinkBtn.classList.add('is-disabled');
            copyLinkBtn.setAttribute('aria-disabled', 'true');
            copyLinkBtn.title = 'Session identifier unavailable for this table';

            qrCodeBtn.disabled = true;
            qrCodeBtn.classList.add('is-disabled');
            qrCodeBtn.setAttribute('aria-disabled', 'true');
            qrCodeBtn.title = 'Session identifier unavailable for this table';
        }

        codeActions.append(copyCodeBtn, copyLinkBtn, qrCodeBtn);
        codeSection.append(codeLabel, codeButton, codeActions);
        card.appendChild(codeSection);

        const stats = document.createElement('div');
        stats.className = 'table-session-card__stats';
        stats.append(
            createStatBlock('participants', '👥', 'Participants', `${participantCount}/${maxSize}`),
            createStatBlock('recordings', '🎙️', 'Recordings', recordingCount),
            createStatBlock('transcriptions', '📝', 'Transcriptions', transcriptionCount)
        );
        card.appendChild(stats);

        const footer = document.createElement('footer');
        footer.className = 'table-session-card__footer';

        const updated = document.createElement('span');
        updated.className = 'table-session-card__updated';
        updated.textContent = updatedText;

        const openHint = document.createElement('span');
        openHint.className = 'table-session-card__action-hint';
        openHint.innerHTML = 'Open table <span aria-hidden="true">→</span>';

        footer.append(updated, openHint);
        card.appendChild(footer);

        tablesGrid.appendChild(card);

        tableParticipantSnapshots.set(String(table.table_number), {
            count: participantCount,
            max: maxSize,
            identifiers: participantList.map(participantIdentifierFromSnapshot)
        });
        tableRecordingCounts.set(String(table.table_number), Number(recordingCount) || 0);
        tableTranscriptionCounts.set(String(table.table_number), Number(transcriptionCount) || 0);
    });

    updateSessionSummaryIndicators();
}

function formatStatusLabel(status) {
    if (!status && status !== 0) {
        return 'Unknown';
    }

    const normalized = status
        .toString()
        .replace(/[_-]+/g, ' ')
        .trim()
        .toLowerCase();

    if (!normalized) {
        return 'Unknown';
    }

    return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getTableStatusVariant(status) {
    const statusMap = {
        active: 'badge-success',
        recording: 'badge-success',
        running: 'badge-success',
        waiting: 'badge-neutral',
        ready: 'badge-neutral',
        idle: 'badge-neutral',
        paused: 'badge-warning',
        full: 'badge-warning',
        completed: 'badge-neutral',
        closed: 'badge-neutral',
        error: 'badge-error',
        failed: 'badge-error'
    };

    return statusMap[status] || 'badge-neutral';
}

function matchesTableCard(card, tableId) {
    if (!card) return false;
    const datasetId = card.dataset.tableId;
    const datasetNumber = card.dataset.tableNumber;
    const target = String(tableId);
    return String(datasetId) === target || String(datasetNumber) === target;
}

function findTableCardElement(tableId) {
    const cards = document.querySelectorAll('.table-card');
    for (const card of cards) {
        if (matchesTableCard(card, tableId)) {
            return card;
        }
    }
    return null;
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
                <img src="/api/qr/session/${currentSession.id}?ts=${Date.now()}" 
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
        const tables = currentSession.tables;
        const tablesToRender = showAllTableQRCodes ? tables : tables.slice(0, 8);

        tablesToRender.forEach(table => {
            const tableNumber = table.table_number || table.id;
            qrHTML += `
                <div class="qr-card">
                    <h4>Table ${tableNumber}</h4>
                    <p>Join Table ${tableNumber} directly</p>
                    <div class="qr-code-image">
                        <img src="/api/qr/table/${currentSession.id}/${tableNumber}?ts=${Date.now()}" 
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
        
        if (!showAllTableQRCodes && currentSession.tables.length > 8) {
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

function showAllTableQRs() {
    showAllTableQRCodes = true;
    populateQRCodesGrid();
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

function showTableQRCode(sessionId, tableNumber, tableName = '') {
    if (!sessionId || !tableNumber) {
        return;
    }

    closeTableQRCodeModal();

    previousFocusBeforeQrModal = document.activeElement;

    const overlay = document.createElement('div');
    overlay.id = 'tableQrModal';
    overlay.className = 'qr-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const titleId = `tableQrTitle-${sessionId}-${tableNumber}`;
    overlay.setAttribute('aria-labelledby', titleId);

    const friendlyName = typeof tableName === 'string' && tableName.trim() ? tableName.trim() : `Table ${tableNumber}`;
    const description = `Share this QR to let participants join ${friendlyName}.`;

    const content = document.createElement('div');
    content.className = 'qr-modal__content';
    content.innerHTML = `
        <header class="qr-modal__header">
            <h2 class="qr-modal__title" id="${titleId}">${friendlyName} QR Code</h2>
            <button type="button" class="qr-modal__close" data-action="close-qr-modal" aria-label="Close QR code dialog">✕</button>
        </header>
        <div class="qr-modal__body">
            <div class="qr-modal__image">
                <img src="/api/qr/table/${sessionId}/${tableNumber}?ts=${Date.now()}" alt="QR code for ${friendlyName}" onerror="const container = this.closest('.qr-modal__image'); if (container) { container.innerHTML = '<span class=\'qr-modal__image-fallback\'>QR code not available</span>'; }">
            </div>
            <p class="qr-modal__description">${description}</p>
        </div>
    `;

    overlay.appendChild(content);
    document.body.appendChild(overlay);
    activeTableQrModal = overlay;

    overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
            closeTableQRCodeModal();
        }
    });

    const closeBtn = overlay.querySelector('[data-action="close-qr-modal"]');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeTableQRCodeModal);
        closeBtn.focus();
    }

    qrModalEscHandler = (event) => {
        if (event.key === 'Escape') {
            closeTableQRCodeModal();
        }
    };
    document.addEventListener('keydown', qrModalEscHandler);
}

function closeTableQRCodeModal() {
    if (!activeTableQrModal) {
        return;
    }

    if (qrModalEscHandler) {
        document.removeEventListener('keydown', qrModalEscHandler);
        qrModalEscHandler = null;
    }

    activeTableQrModal.remove();
    activeTableQrModal = null;

    if (previousFocusBeforeQrModal && typeof previousFocusBeforeQrModal.focus === 'function') {
        previousFocusBeforeQrModal.focus();
    }
    previousFocusBeforeQrModal = null;
}

function copyTextToClipboard(text, {
    success,
    fallback,
    error
} = {}) {
    const fallbackCopy = () => {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = text;
            textArea.setAttribute('readonly', '');
            textArea.style.position = 'absolute';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            textArea.setSelectionRange(0, textArea.value.length);
            const succeeded = document.execCommand('copy');
            document.body.removeChild(textArea);

            if (succeeded) {
                if (fallback) {
                    showToast(fallback, 'info');
                } else if (success) {
                    showToast(success, 'success');
                }

                console.log('Clipboard fallback copy succeeded');
                return true;
            }

            throw new Error('document.execCommand("copy") returned false');
        } catch (fallbackErr) {
            console.error('Fallback clipboard copy failed:', fallbackErr);
            if (error) {
                showToast(error, 'error');
            }
            return false;
        }
    };

    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            return navigator.clipboard.writeText(text).then(() => {
                if (success) {
                    showToast(success, 'success');
                }
                console.log('Clipboard API copy succeeded');
                return true;
            }).catch(err => {
                console.warn('navigator.clipboard.writeText failed, using fallback:', err);
                return fallbackCopy();
            });
        }
    } catch (err) {
        console.warn('Clipboard API threw synchronously, using fallback:', err);
    }

    return Promise.resolve(fallbackCopy());
}

function copyTableCode(tableCode, event) {
    event?.stopPropagation?.();

    return copyTextToClipboard(tableCode, {
        success: 'Table code copied to clipboard!',
        fallback: 'Table code copied. Paste if needed.',
        error: 'Unable to copy table code. Please copy manually.',
    });
}

function copyTableLink(sessionId, tableNumber, event) {
    event?.stopPropagation?.();

    const baseUrl = window.location.origin;
    const link = `${baseUrl}/?session=${sessionId}&table=${tableNumber}`;

    return copyTextToClipboard(link, {
        success: 'Table join link copied to clipboard!',
        fallback: 'Table link copied. Paste if needed.',
        error: 'Unable to copy table link. Please copy manually.',
    });
}

function copySessionCode(sessionId, event) {
    event?.stopPropagation?.();

    return copyTextToClipboard(sessionId, {
        success: 'Session ID copied to clipboard!',
        fallback: 'Session ID copied. Paste if needed.',
        error: 'Unable to copy session ID. Please copy manually.',
    });
}

function copySessionLink(sessionId, event) {
    event?.stopPropagation?.();

    const baseUrl = window.location.origin;
    const link = `${baseUrl}/?session=${sessionId}`;

    return copyTextToClipboard(link, {
        success: 'Session join link copied to clipboard!',
        fallback: 'Session link copied. Paste if needed.',
        error: 'Unable to copy session link. Please copy manually.',
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
    const timestamp = Date.now();
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
                    <img src="/api/qr/session/${currentSession.id}?ts=${timestamp}" alt="Session QR">
                    <p>Join this World Café session</p>
                </div>
                ${currentSession.tables ? currentSession.tables.map(table => {
                    const tableNumber = table.table_number || table.id;
                    return `
                        <div class="qr-item">
                            <h3>Table ${tableNumber}</h3>
                            <img src="/api/qr/table/${currentSession.id}/${tableNumber}?ts=${timestamp + tableNumber}" alt="Table ${tableNumber} QR">
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
        const targetTableIdentifier = {
            id: tableId,
            table_number: parseInt(tableId, 10)
        };

        if (!tablesMatch(currentTable, targetTableIdentifier)) {
            await stopRecordingIfActive({ silent: true });
        }

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
            const hasDescription = Boolean(currentSession.description && currentSession.description.trim());

            if (hasDescription) {
                sessionDescriptionHeader.textContent = currentSession.description;
                sessionDescriptionHeader.style.display = 'block';
                sessionDescriptionHeader.removeAttribute('hidden');
            } else {
                sessionDescriptionHeader.textContent = '';
                sessionDescriptionHeader.style.display = 'none';
                sessionDescriptionHeader.setAttribute('hidden', '');
            }
        }
    }

    document.getElementById('tableTitle').textContent = currentTable.name || `Table ${currentTable.table_number}`;

    const tableStatusElement = document.getElementById('tableStatus');
    if (tableStatusElement) {
        const rawStatus = (currentTable.status || 'waiting').toString().toLowerCase();
        const normalizedStatus = rawStatus.replace(/[_-]+/g, ' ');
        const slugStatus = normalizedStatus.replace(/\s+/g, '-');
        const formattedStatus = normalizedStatus.replace(/\b\w/g, char => char.toUpperCase());
        const statusVariantMap = {
            waiting: 'badge-neutral',
            ready: 'badge-neutral',
            active: 'badge-success',
            recording: 'badge-success',
            running: 'badge-success',
            paused: 'badge-warning',
            error: 'badge-error',
            failed: 'badge-error',
            completed: 'badge-neutral',
            closed: 'badge-neutral',
            'in-progress': 'badge-success'
        };

        const variant = statusVariantMap[rawStatus] || statusVariantMap[slugStatus] || 'badge-neutral';

        tableStatusElement.textContent = formattedStatus;
        tableStatusElement.className = `badge ${variant}`;

        const heroStatusValue = document.getElementById('tableHeroStatus');
        if (heroStatusValue) {
            heroStatusValue.textContent = formattedStatus;
        }

        const heroStatusCard = document.getElementById('tableHeroStatusCard');
        if (heroStatusCard) {
            heroStatusCard.dataset.status = slugStatus || rawStatus;
        }
    }

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

    // Load table-specific recordings so media library is always in sync
    loadTableRecordings();
}

function getTableParticipants(table) {
    if (!table) return [];

    if (Array.isArray(table.participants)) {
        return table.participants.filter(Boolean);
    }

    if (Array.isArray(table.active_participants)) {
        return table.active_participants.filter(Boolean);
    }

    if (Array.isArray(table.clients)) {
        return table.clients.filter(Boolean);
    }

    return [];
}

function getParticipantInitials(name) {
    if (!name || typeof name !== 'string') {
        return 'P';
    }

    const trimmed = name.trim();
    if (!trimmed) return 'P';

    const parts = trimmed.split(/\s+/).slice(0, 2);
    const initials = parts.map(part => part.charAt(0)).join('');
    return initials ? initials.toUpperCase() : trimmed.charAt(0).toUpperCase();
}

function renderTableLobby() {
    const lobbyCard = document.getElementById('tableLobbyCard');
    if (!lobbyCard || !currentTable) return;

    const sessionTitleEl = document.getElementById('tableLobbySessionTitle');
    if (sessionTitleEl) {
        sessionTitleEl.textContent = currentSession?.title || 'Session';
    }

    const tableNameEl = document.getElementById('tableLobbyTableName');
    if (tableNameEl) {
        const fallbackName = currentTable.table_number ? `Table ${currentTable.table_number}` : 'Table';
        tableNameEl.textContent = currentTable.name || fallbackName;
    }

    const facilitatorEl = document.getElementById('tableLobbyFacilitator');
    if (facilitatorEl) {
        facilitatorEl.textContent = currentTable.facilitator_name || 'Unassigned';
    }

    const participants = getTableParticipants(currentTable);
    const participantCount = typeof currentTable.participant_count === 'number'
        ? currentTable.participant_count
        : participants.length;
    const maxSize = currentTable.max_size || currentTable.maxSize || currentTable.capacity || 5;

    const capacityEl = document.getElementById('tableLobbyCapacity');
    if (capacityEl) {
        capacityEl.textContent = `${participantCount}/${maxSize}`;
    }

    const statusEl = document.getElementById('tableLobbyStatus');
    if (statusEl) {
        const rawStatus = (currentTable.status || 'waiting').toString().toLowerCase();
        statusEl.textContent = formatStatusLabel(rawStatus);
        statusEl.className = `badge ${getTableStatusVariant(rawStatus)}`;
    }

    const promptEl = document.getElementById('tableLobbyPrompt');
    if (promptEl) {
        const prompt = currentTable.prompt || currentTable.topic || currentTable.description || currentSession?.description;
        if (prompt && typeof prompt === 'string' && prompt.trim()) {
            promptEl.textContent = prompt.trim();
        } else {
            promptEl.textContent = 'Share the conversation prompt and welcome guests as they arrive.';
        }
    }

    const updatedEl = document.getElementById('tableLobbyUpdated');
    if (updatedEl) {
        const timestamp = currentTable.updated_at || currentTable.last_activity_at || currentSession?.updated_at;
        updatedEl.textContent = timestamp ? `Updated ${formatRelativeTime(timestamp)}` : 'Updated moments ago';
    }

    const participantsList = document.getElementById('tableLobbyParticipants');
    if (participantsList) {
        participantsList.innerHTML = '';

        if (participants.length === 0) {
            const emptyItem = document.createElement('li');
            emptyItem.className = 'table-lobby__empty';
            emptyItem.textContent = 'No participants have joined this table yet.';
            participantsList.appendChild(emptyItem);
        } else {
            participants.forEach((participant, index) => {
                const safeName = (participant && (participant.name || participant.display_name)) || `Guest ${index + 1}`;

                const item = document.createElement('li');
                item.className = 'table-lobby__participant';

                const initial = document.createElement('span');
                initial.className = 'table-lobby__participant-initial';
                initial.textContent = getParticipantInitials(safeName);

                const details = document.createElement('div');
                details.className = 'table-lobby__participant-details';

                const nameEl = document.createElement('span');
                nameEl.className = 'table-lobby__participant-name';
                nameEl.textContent = safeName;

                const metaEl = document.createElement('span');
                metaEl.className = 'table-lobby__participant-meta';

                if (participant && participant.is_facilitator) {
                    metaEl.textContent = 'Facilitator';
                } else if (participant && participant.role) {
                    metaEl.textContent = participant.role;
                } else if (participant && participant.joined_at) {
                    metaEl.textContent = `Joined ${formatRelativeTime(participant.joined_at)}`;
                } else if (participant && participant.email) {
                    metaEl.textContent = participant.email;
                } else {
                    metaEl.textContent = 'Participant';
                }

                details.append(nameEl, metaEl);
                item.append(initial, details);
                participantsList.appendChild(item);
            });
        }
    }
}

function renderFacilitatorControls(overrides = {}) {
    const controlsCard = document.getElementById('facilitatorControlsCard');
    if (!controlsCard || !currentTable) return;

    const participants = getTableParticipants(currentTable);
    const participantCount = typeof currentTable.participant_count === 'number'
        ? currentTable.participant_count
        : participants.length;
    const maxSize = currentTable.max_size || currentTable.maxSize || currentTable.capacity || 5;

    const statusValue = document.getElementById('facilitatorStatusValue');
    const rawStatus = (currentTable.status || 'waiting').toString().toLowerCase();
    const normalizedStatus = rawStatus.replace(/[_-]+/g, ' ');
    const slugStatus = normalizedStatus.replace(/\s+/g, '-');
    const readableStatus = formatStatusLabel(rawStatus);

    if (statusValue) {
        statusValue.textContent = readableStatus;
    }

    const heroStatusValue = document.getElementById('tableHeroStatus');
    if (heroStatusValue) {
        heroStatusValue.textContent = readableStatus;
    }

    const heroStatusCard = document.getElementById('tableHeroStatusCard');
    if (heroStatusCard) {
        heroStatusCard.dataset.status = slugStatus || rawStatus;
    }

    const participantsValue = document.getElementById('facilitatorParticipantsValue');
    if (participantsValue) {
        participantsValue.textContent = `${participantCount}/${maxSize}`;
    }

    const heroParticipantsValue = document.getElementById('tableHeroParticipants');
    if (heroParticipantsValue) {
        heroParticipantsValue.textContent = `${participantCount}/${maxSize}`;
    }

    const recordingsValue = document.getElementById('facilitatorRecordingsValue');
    const recordingCount = typeof overrides.recordingCount === 'number'
        ? overrides.recordingCount
        : (currentTable.recording_count || 0);

    if (recordingsValue) {
        recordingsValue.textContent = recordingCount;
    }

    const heroRecordingsValue = document.getElementById('tableHeroRecordings');
    if (heroRecordingsValue) {
        heroRecordingsValue.textContent = recordingCount;
    }

    const updatedValue = document.getElementById('facilitatorUpdatedValue');
    const timestamp = currentTable.updated_at || currentTable.last_activity_at || currentSession?.updated_at;
    const updatedText = timestamp ? formatRelativeTime(timestamp) : 'moments ago';

    if (updatedValue) {
        updatedValue.textContent = updatedText;
    }

    const heroUpdatedValue = document.getElementById('tableHeroUpdated');
    if (heroUpdatedValue) {
        heroUpdatedValue.textContent = updatedText;
    }

    const note = document.getElementById('facilitatorNote');
    if (note) {
        const facilitatorName = currentTable.facilitator_name;
        if (facilitatorName) {
            note.textContent = `${facilitatorName} can manage recordings and live transcription using the controls on the left.`;
        } else {
            note.textContent = 'Assign a facilitator to coordinate recordings and guide the discussion.';
        }
    }
}

async function refreshTableRoster() {
    if (!currentSession || !currentTable) return;

    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/tables/${currentTable.table_number}`);
        if (!response.ok) {
            renderTableLobby();
            renderFacilitatorControls();
            return;
        }

        const tableDetails = await response.json();
        currentTable = { ...currentTable, ...tableDetails };

        if (currentSession && Array.isArray(currentSession.tables)) {
            currentSession.tables = currentSession.tables.map((table) => {
                if (!table) return table;
                const matchesId = table.id && tableDetails.id && table.id === tableDetails.id;
                const matchesNumber = table.table_number && tableDetails.table_number && table.table_number === tableDetails.table_number;
                return matchesId || matchesNumber ? { ...table, ...tableDetails } : table;
            });
        }

        renderTableLobby();
        renderFacilitatorControls();
    } catch (error) {
        console.warn('Failed to refresh table roster:', error);
    }
}

function getPreferredMediaRecorderOptions() {
    if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
        return {};
    }

    const preferredTypes = [
        'audio/webm;codecs=opus',
        'audio/ogg;codecs=opus',
        'audio/webm',
        'audio/ogg'
    ];

    for (const type of preferredTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
            return { mimeType: type };
        }
    }

    return {};
}

function normalizeMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
        return 'audio/webm';
    }

    const lower = mimeType.toLowerCase();
    if (lower.includes('webm')) {
        return 'audio/webm';
    }
    if (lower.includes('ogg')) {
        return 'audio/ogg';
    }
    if (lower.includes('mpeg')) {
        return 'audio/mpeg';
    }
    if (lower.includes('mp4')) {
        return 'audio/mp4';
    }
    if (lower.includes('wav')) {
        return 'audio/wav';
    }
    if (lower.includes('x-wav')) {
        return 'audio/wav';
    }
    if (lower.includes('flac')) {
        return 'audio/flac';
    }

    return 'audio/webm';
}

function getFileExtensionFromMime(mimeType) {
    const normalized = normalizeMimeType(mimeType);

    switch (normalized) {
        case 'audio/webm':
            return 'webm';
        case 'audio/ogg':
            return 'ogg';
        case 'audio/mpeg':
            return 'mp3';
        case 'audio/mp4':
            return 'm4a';
        case 'audio/wav':
            return 'wav';
        case 'audio/flac':
            return 'flac';
        default:
            return 'webm';
    }
}

function createAudioBlobFromChunks(chunks, recorder) {
    const recorderType = recorder && typeof recorder.mimeType === 'string' ? recorder.mimeType : '';
    const chunkType = Array.isArray(chunks) && chunks.length > 0 && chunks[0] && typeof chunks[0].type === 'string'
        ? chunks[0].type
        : '';
    const normalizedType = normalizeMimeType(recorderType || chunkType);

    return {
        blob: new Blob(chunks, { type: normalizedType }),
        mimeType: normalizedType
    };
}

function normalizeAudioBlob(blob) {
    if (!(blob instanceof Blob)) {
        return { blob, mimeType: 'audio/webm' };
    }

    const normalizedType = normalizeMimeType(blob.type);
    if (blob.type === normalizedType) {
        return { blob, mimeType: normalizedType };
    }

    return {
        blob: blob.slice(0, blob.size, normalizedType),
        mimeType: normalizedType
    };
}

function detectAudioFormatFromBuffer(buffer) {
    if (!buffer || buffer.byteLength < 4) {
        return 'unknown';
    }

    const view = new Uint8Array(buffer);
    const ascii = String.fromCharCode(...view.slice(0, 4));

    if (ascii === 'RIFF') {
        return 'wav';
    }
    if (ascii === 'OggS') {
        return 'ogg';
    }
    if (ascii === 'fLaC') {
        return 'flac';
    }
    if (ascii.startsWith('ID3')) {
        return 'mp3';
    }

    if (buffer.byteLength >= 4) {
        const headerView = new DataView(buffer, 0, 4);
        if (headerView.getUint32(0) === 0x1a45dfa3) {
            return 'webm';
        }
    }

    if (buffer.byteLength >= 12) {
        const brand = String.fromCharCode(...view.slice(4, 8));
        if (brand === 'ftyp') {
            return 'mp4';
        }
    }

    const byte0 = view[0];
    const byte1 = view[1];
    if (byte0 === 0xff && (byte1 & 0xe0) === 0xe0) {
        return 'mp3';
    }

    return 'unknown';
}

async function detectAudioFormatFromBlob(blob) {
    if (!(blob instanceof Blob)) {
        return 'unknown';
    }

    const headerSize = Math.min(blob.size, 64);
    if (headerSize === 0) {
        return 'unknown';
    }

    try {
        const buffer = await blob.slice(0, headerSize).arrayBuffer();
        return detectAudioFormatFromBuffer(buffer);
    } catch (error) {
        console.warn('Failed to inspect audio blob header:', error);
        return 'unknown';
    }
}

function getAudioFilename(baseName, mimeType) {
    const safeBase = typeof baseName === 'string' && baseName.trim().length > 0 ? baseName.trim() : 'recording';
    return `${safeBase}.${getFileExtensionFromMime(mimeType)}`;
}

function mixToMono(audioBuffer) {
    const { numberOfChannels, length } = audioBuffer;
    if (numberOfChannels === 1) {
        return audioBuffer.getChannelData(0);
    }

    const result = new Float32Array(length);
    for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioBuffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
            result[i] += channelData[i];
        }
    }

    for (let i = 0; i < length; i++) {
        result[i] /= numberOfChannels;
    }

    return result;
}

function floatTo16BitPCM(view, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const sample = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    }
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function audioBufferToWav(audioBuffer) {
    const sampleRate = audioBuffer.sampleRate;
    const channelData = mixToMono(audioBuffer);
    const samples = channelData.length;
    const bytesPerSample = 2;
    const dataSize = samples * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytesPerSample, true);
    view.setUint16(32, bytesPerSample, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    floatTo16BitPCM(view, 44, channelData);
    return buffer;
}

async function convertBlobToWav(blob) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) {
        throw new Error('Web Audio API is not supported in this browser');
    }

    const audioContext = new AudioCtx();
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
        const wavBuffer = audioBufferToWav(audioBuffer);
        return new Blob([wavBuffer], { type: 'audio/wav' });
    } finally {
        if (typeof audioContext.close === 'function') {
            try {
                await audioContext.close();
            } catch (closeError) {
                console.warn('AudioContext close warning:', closeError);
            }
        }
    }
}

// Recording functionality
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, getPreferredMediaRecorderOptions());
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };
        
        mediaRecorder.onstop = async () => {
            const { blob, mimeType } = createAudioBlobFromChunks(audioChunks, mediaRecorder);
            const filename = getAudioFilename('recording', mimeType);
            await uploadAudio(blob, filename);
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

function stopRecording(options = {}) {
    const normalizedOptions = (options instanceof Event) ? {} : options;
    const { silent = false } = normalizedOptions;

    if (!mediaRecorder || !isRecording) {
        if (!silent) {
            showToast('No active recording to stop.', 'warning');
        }
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        const startRecordingBtn = document.getElementById('startRecordingBtn');
        const stopRecordingBtn = document.getElementById('stopRecordingBtn');
        const audioWaveContainer = document.getElementById('audioWaveContainer');

        const originalOnStop = mediaRecorder.onstop;
        mediaRecorder.onstop = async (...args) => {
            try {
                if (typeof originalOnStop === 'function') {
                    await originalOnStop(...args);
                }
            } catch (error) {
                console.error('Error finalizing recording:', error);
                if (!silent) {
                    showToast('Recording may not have saved correctly. Please check the recordings list.', 'warning');
                }
            } finally {
                mediaRecorder = null;
                resolve();
            }
        };

        try {
            mediaRecorder.stop();
        } catch (error) {
            console.error('Error stopping media recorder:', error);
            mediaRecorder = null;
            resolve();
            return;
        }

        isRecording = false;

        // Update UI (if elements exist)
        showElement(startRecordingBtn);
        hideElement(stopRecordingBtn);
        hideElement(audioWaveContainer);

        // Notify other clients
        if (socket && socket.connected && currentSession && currentTable) {
            socket.emit('recording-stopped', {
                sessionId: currentSession.id,
                tableId: currentTable.id || currentTable.table_number
            });
        }

        console.log('Recording stopped, processing...');
        if (!silent) {
            showToast('Recording stopped. Processing audio...', 'info');
        }
    });
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
        console.error('❌ live transcription container not found!');
        return;
    }

    console.log(`✅ Found live transcription container (${targetContainer.id})`);

    const displayDiv = document.getElementById('transcriptionDisplay');
    const emptyState = document.getElementById('emptyTranscriptionState');

    if (emptyState) {
        hideElement(emptyState);
    }
    if (displayDiv) {
        showElement(displayDiv);
    }

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
        } else {
            console.error('❌ bubble-text element not found in bubble!');
        }
    } else {
        console.error('❌ currentLiveBubble is null!');
    }

    // Store word with speaker info for persistence
    if (!window.currentLiveWords) window.currentLiveWords = [];
    console.log(`💾 Adding word to save queue: Speaker ${speaker} - "${word}"`);
    window.currentLiveWords.push({
        speaker: speaker,
        word: word,
        timestamp: Date.now()
    });

    try {
        updateTranscriptionTabCounts();
    } catch (error) {
        console.warn('Error updating transcription counts during live stream:', error);
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
        
        if (!socket || !socket.connected) {
            showToast('Cannot start live transcription while offline. Please reconnect.', 'error');
            return;
        }

        if (!currentSession || !currentTable) {
            showToast('Join a session table before starting live transcription.', 'warning');
            return;
        }

        // Check if getUserMedia is available
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this environment. Please use HTTPS or a compatible browser.');
        }
        
        // Request microphone access
        window.liveTranscriptionStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                sampleRate: 48000
            }
        });

        const preferredRecorderOptions = getPreferredMediaRecorderOptions();
        const recorderOptions = {
            ...preferredRecorderOptions,
            audioBitsPerSecond: 128000
        };

        try {
            mediaRecorder = new MediaRecorder(
                window.liveTranscriptionStream,
                Object.keys(recorderOptions).length > 0 ? recorderOptions : undefined
            );
        } catch (recorderError) {
            console.warn('⚠️ Preferred MediaRecorder options not supported, falling back to defaults:', recorderError);
            mediaRecorder = new MediaRecorder(window.liveTranscriptionStream);
        }

        liveRecorderMimeType = mediaRecorder.mimeType || recorderOptions.mimeType || '';
        
        // Array to store audio chunks for saving
        window.liveAudioChunks = [];

        // Start audio wave visualization
        startAudioWaveVisualization(window.liveTranscriptionStream);

        const model = window.deepgramModel || 'nova-2-meeting';
        socket.emit('start-live-transcription', {
            sessionId: currentSession?.id,
            tableId: currentTable?.id,
            language: currentSession?.language || 'en-US',
            model
        });

        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                // Save audio chunk for file storage
                window.liveAudioChunks.push(event.data);
                if (typeof liveRecorderStopResolver === 'function') {
                    const resolve = liveRecorderStopResolver;
                    liveRecorderStopResolver = null;
                    resolve();
                }

                // Send to backend for transcription pipeline
                if (socket && socket.connected) {
                    event.data.arrayBuffer()
                        .then(buffer => {
                            socket.emit('live-audio-chunk', buffer);
                        })
                        .catch(error => {
                            console.error('❌ Error reading audio chunk for live transcription:', error);
                        });
                }
            }
        };

        mediaRecorder.onerror = (errorEvent) => {
            console.error('❌ MediaRecorder error:', errorEvent.error || errorEvent.message || errorEvent);
            showToast('Live transcription encountered a recording error. Stopping...', 'error');
            stopLiveTranscription({ skipEmit: true, silent: true });
        };

        mediaRecorder.start(250); // Collect 250ms of audio at a time
        isRecording = true;
        recordingStartTime = Date.now();

        // Update UI
        applyToElements(LIVE_TRANSCRIPTION_UI_IDS.startButtons, hideElement);
        applyToElements(LIVE_TRANSCRIPTION_UI_IDS.stopButtons, showElement);

        showToast(`Live transcription started (${formatDeepgramModelLabel(model)})`, 'success');

    } catch (error) {
        console.error('Error starting live transcription:', error);
        const errorMessage = error.name === 'NotAllowedError' 
            ? 'Microphone access denied. Please allow microphone access and try again.'
            : 'Error starting live transcription. Please try again.';
        showToast(errorMessage, 'error');

        if (window.liveTranscriptionStream) {
            window.liveTranscriptionStream.getTracks().forEach(track => track.stop());
            window.liveTranscriptionStream = null;
        }
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
    }
}

async function stopLiveTranscription(options = {}) {
    const { skipEmit = false, silent = false } = options;

    const recorderActive = mediaRecorder && mediaRecorder.state !== 'inactive';
    const streamActive = window.liveTranscriptionStream && window.liveTranscriptionStream.getTracks().some(track => track.readyState === 'live');

    if (!isRecording && !recorderActive && !streamActive) {
        if (!silent) {
            showToast('No active live transcription to stop.', 'warning');
        }
        return;
    }

    isRecording = false;

    if (!skipEmit && socket && socket.connected) {
        socket.emit('stop-live-transcription');
    }

    const recorderRef = mediaRecorder;
    const initialChunkCount = Array.isArray(window.liveAudioChunks) ? window.liveAudioChunks.length : 0;

    if (recorderRef && recorderRef.state !== 'inactive') {
        const waitForStop = new Promise((resolve) => {
            const handleStop = () => {
                if (typeof recorderRef.removeEventListener === 'function') {
                    recorderRef.removeEventListener('stop', handleStop);
                }
                resolve();
            };

            if (typeof recorderRef.addEventListener === 'function') {
                recorderRef.addEventListener('stop', handleStop, { once: true });
            }

            try {
                recorderRef.stop();
            } catch (error) {
                console.warn('⚠️ MediaRecorder stop warning:', error);
                if (typeof recorderRef.removeEventListener === 'function') {
                    recorderRef.removeEventListener('stop', handleStop);
                }
                resolve();
            }
        });

        let waitForFinalData = null;
        if (typeof liveRecorderStopResolver !== 'function') {
            waitForFinalData = new Promise((resolve) => {
                let settled = false;
                const finish = () => {
                    if (!settled) {
                        settled = true;
                        liveRecorderStopResolver = null;
                        resolve();
                    }
                };

                const timeoutId = setTimeout(finish, 1000);
                liveRecorderStopResolver = () => {
                    if (Array.isArray(window.liveAudioChunks) && window.liveAudioChunks.length > initialChunkCount) {
                        clearTimeout(timeoutId);
                        finish();
                    }
                };

                if (Array.isArray(window.liveAudioChunks) && window.liveAudioChunks.length > initialChunkCount) {
                    clearTimeout(timeoutId);
                    finish();
                }
            });
        }

        await waitForStop;
        if (waitForFinalData) {
            await waitForFinalData;
        }
        if (typeof liveRecorderStopResolver === 'function') {
            liveRecorderStopResolver();
        }
    }

    if (window.liveTranscriptionStream) {
        window.liveTranscriptionStream.getTracks().forEach(track => track.stop());
        window.liveTranscriptionStream = null;
    }

    stopAudioWaveVisualization();

    let savedRecordingId = null;
    let audioSaved = false;

    if (Array.isArray(window.liveAudioChunks) && window.liveAudioChunks.length > 0) {
        try {
            const { blob: audioBlob } = createAudioBlobFromChunks(
                window.liveAudioChunks,
                recorderRef || { mimeType: liveRecorderMimeType }
            );
            const audioSaveResult = await saveAudioFileOnly(audioBlob);
            if (audioSaveResult) {
                audioSaved = true;
                savedRecordingId = audioSaveResult.recording?.id || audioSaveResult.recordingId || null;
            }
        } catch (error) {
            console.error('❌ Error saving live audio file:', error);
            if (!silent) {
                showToast('Warning: Audio file may not be available in recordings', 'warning');
            }
        }
    }

    if (window.currentLiveWords && window.currentLiveWords.length > 0) {
        try {
            await saveLiveTranscriptionData(savedRecordingId);
        } catch (error) {
            console.error('❌ Error saving live transcription data:', error);
            if (!silent) {
                showToast('Warning: Live transcription may not persist on reload', 'warning');
            }
        }
    } else {
        console.warn('⚠️ No live words to save - transcription will not persist on reload');
    }

    resetLiveTranscriptionState({ silent: true, keepBuffers: false, skipRecorderStop: true });

    if (!silent) {
        if (audioSaved) {
            showToast('Live transcription stopped and audio saved', 'info');
        } else {
            showToast('Live transcription stopped', 'info');
        }
    }

    // Refresh recordings list to show the newly saved audio file
    setTimeout(() => {
        loadTableRecordings();
    }, 1000);
}

async function saveLiveTranscriptionData(recordingId = null) {
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
        duration_seconds: (Date.now() - recordingStartTime) / 1000,
        recording_id: recordingId || null
    };
    
    const response = await fetch(`/api/transcriptions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            sessionId: currentSession.id,
            tableId: currentTable.id,
            recordingId: transcriptionData.recording_id,
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

    const { blob, mimeType } = normalizeAudioBlob(audioBlob);
    const format = await detectAudioFormatFromBlob(blob);

    if (blob.size < MINIMUM_VALID_AUDIO_BYTES) {
        showToast('Recording too short. Please record at least one second before stopping.', 'warning');
        return null;
    }

    let finalBlob = blob;
    let finalMimeType = mimeType;

    if (!format || format === 'unknown') {
        console.warn('Captured audio format could not be detected, re-encoding as WAV', {
            size: blob.size,
            mimeType
        });
        try {
            finalBlob = await convertBlobToWav(blob);
            finalMimeType = 'audio/wav';
        } catch (conversionError) {
            console.warn('Failed to convert live audio to WAV, using original blob', conversionError);
        }
    }

    const fileName = getAudioFilename('live-recording', finalMimeType);

    const formData = new FormData();
    formData.append('audio', finalBlob, fileName);
    formData.append('skipTranscription', 'true'); // Tell backend not to process transcription
    formData.append('source', 'live-transcription');
    if (recordingStartTime) {
        const durationSeconds = Math.max(0, (Date.now() - recordingStartTime) / 1000);
        formData.append('duration', durationSeconds.toFixed(2));
    }

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

async function uploadAudio(audioBlob, filename, source = 'start-recording') {
    const { blob, mimeType } = normalizeAudioBlob(audioBlob);
    const format = await detectAudioFormatFromBlob(blob);

    if (blob.size < MINIMUM_VALID_AUDIO_BYTES) {
        showToast('Recording too short. Please record at least one second before stopping.', 'warning');
        return;
    }

    let finalBlob = blob;
    let finalMimeType = mimeType;

    if (!format || format === 'unknown') {
        console.warn('Unable to detect audio format for upload, attempting WAV conversion', {
            size: blob.size,
            mimeType
        });
        try {
            finalBlob = await convertBlobToWav(blob);
            finalMimeType = 'audio/wav';
        } catch (conversionError) {
            console.warn('WAV conversion failed, using original blob', conversionError);
        }
    }

    const fileNameToUse = typeof filename === 'string' && filename.length > 0
        ? filename
        : getAudioFilename('recording', finalMimeType);

    const formData = new FormData();
    formData.append('audio', finalBlob, fileNameToUse);
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
    tableConnectionState.set(String(tableId), { hasClients, clientCount });

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
    const eventSource = data?.source || data?.transcription?.source;
    if (eventSource === 'reprocess') {
        console.log('📝 Skipping direct render for reprocess source (handled via reload)');
        return;
    }

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
        console.warn('No transcription display element found');
        return;
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


const TRANSCRIPTION_TAB_CONFIG = {
    'start-recording': {
        tabIds: ['startRecordingTab'],
        contentIds: ['startRecordingContent'],
        countId: 'startRecordingCount'
    },
    'upload-media': {
        tabIds: ['uploadMediaTab'],
        contentIds: ['uploadMediaContent'],
        countId: 'uploadMediaCount'
    },
    'live-transcription': {
        tabIds: ['liveTranscriptionTab'],
        contentIds: ['liveTranscriptionContent'],
        countId: 'liveTranscriptionCount'
    }
};

function switchTranscriptionTab(tabName) {
    const config = TRANSCRIPTION_TAB_CONFIG[tabName];
    if (!config) {
        return;
    }

    const tabbedContents = document.querySelectorAll('.transcription-tab-content');
    if (tabbedContents.length > 0) {
        tabbedContents.forEach(contentEl => {
            const shouldShow = config.contentIds && config.contentIds.includes(contentEl.id);
            contentEl.style.display = shouldShow ? 'block' : 'none';
        });
    } else if (config.contentIds) {
        const allContentIds = new Set();
        Object.values(TRANSCRIPTION_TAB_CONFIG).forEach(cfg => {
            (cfg.contentIds || []).forEach(id => allContentIds.add(id));
        });

        allContentIds.forEach(contentId => {
            const contentEl = document.getElementById(contentId);
            if (!contentEl) {
                return;
            }

            const shouldShow = config.contentIds && config.contentIds.includes(contentId);
            contentEl.style.display = shouldShow ? 'block' : 'none';
        });
    }

    const allTabIds = new Set();
    Object.values(TRANSCRIPTION_TAB_CONFIG).forEach(cfg => {
        (cfg.tabIds || []).forEach(id => allTabIds.add(id));
    });

    allTabIds.forEach(tabId => {
        const tabEl = document.getElementById(tabId);
        if (!tabEl) {
            return;
        }

        const isActive = config.tabIds && config.tabIds.includes(tabId);
        tabEl.classList.toggle('active', isActive);
        if (isActive) {
            tabEl.classList.add('active');
        }
    });
}

function updateTranscriptionTabCounts() {
    Object.values(TRANSCRIPTION_TAB_CONFIG).forEach(cfg => {
        if (!cfg.countId) {
            return;
        }

        const countEl = document.getElementById(cfg.countId);
        if (!countEl) {
            return;
        }

        const selectors = (cfg.contentIds || [])
            .map(id => `#${id} .chat-bubble`)
            .join(', ');

        const total = selectors ? document.querySelectorAll(selectors).length : 0;
        countEl.textContent = String(total);
    });
}

function activateRecordingMethodTab(method) {
    const mapping = {
        live: 'live-transcription',
        audio: 'start-recording',
        upload: 'upload-media'
    };

    const target = mapping[method] || method;
    switchTranscriptionTab(target);
}

function updateTableTranscriptionCount(tableId, options = {}) {
    const card = findTableCardElement(tableId);
    if (!card) {
        return;
    }

    const tableNumber = card.dataset.tableNumber || resolveTableNumber(tableId);
    const transcriptStat = card.querySelector('.table-session-card__stat[data-stat="transcriptions"] .table-session-card__stat-value');
    if (!transcriptStat) {
        return;
    }

    const nextCount = typeof options.newCount === 'number'
        ? options.newCount
        : (parseInt(transcriptStat.textContent, 10) || 0) + 1;

    transcriptStat.textContent = nextCount;

    tableTranscriptionCounts.set(String(tableNumber), nextCount);
    updateSessionSummaryIndicators();
    updateSessionTableSnapshot(tableNumber, {
        transcription_count: nextCount
    });
}

function updateTableRecordingCount(tableId, options = {}) {
    const card = findTableCardElement(tableId);
    if (!card) {
        return;
    }

    const tableNumber = card.dataset.tableNumber || resolveTableNumber(tableId);
    const recordingStat = card.querySelector('.table-session-card__stat[data-stat="recordings"] .table-session-card__stat-value');
    if (!recordingStat) {
        return;
    }

    const nextCount = typeof options.newCount === 'number'
        ? options.newCount
        : (parseInt(recordingStat.textContent, 10) || 0) + 1;

    recordingStat.textContent = nextCount;

    tableRecordingCounts.set(String(tableNumber), nextCount);
    updateSessionSummaryIndicators();
    updateSessionTableSnapshot(tableNumber, {
        recording_count: nextCount
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

async function loadSessionRecordings(sessionId = currentSession?.id) {
    const recordingsSection = document.getElementById('sessionRecordingsSection');
    if (!recordingsSection || recordingsSection.dataset.tableOnly === 'true') {
        return;
    }

    const recordingsList = document.getElementById('sessionRecordingsList');
    const emptyState = document.getElementById('sessionRecordingsEmpty');

    if (!recordingsList || !emptyState || !sessionId) {
        return;
    }

    try {
        let sessionData = null;

        if (currentSession && currentSession.id === sessionId && Array.isArray(currentSession.tables)) {
            sessionData = currentSession;
        } else {
            const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
            if (!sessionResponse.ok) {
                throw new Error('Failed to load session metadata');
            }
            sessionData = await sessionResponse.json();

            if (currentSession && currentSession.id === sessionId) {
                currentSession = { ...currentSession, ...sessionData };
            }
        }

        const tables = Array.isArray(sessionData.tables) ? sessionData.tables : [];

        if (tables.length === 0) {
            renderRecordingList([], {
                listId: 'sessionRecordingsList',
                emptyStateId: 'sessionRecordingsEmpty',
                badgeId: 'sessionRecordingCountBadge',
                context: 'session'
            });
            return;
        }

        const aggregatedRecordings = [];

        for (const table of tables) {
            if (!table || !table.table_number) continue;

            try {
                const response = await fetch(`/api/sessions/${sessionId}/tables/${table.table_number}/recordings`);
                if (!response.ok) {
                    continue;
                }

                const tableRecordings = await response.json();
                const safeLength = Array.isArray(tableRecordings) ? tableRecordings.length : 0;

                tableRecordingCounts.set(String(table.table_number), safeLength);
                updateSessionTableSnapshot(table.table_number, {
                    recording_count: safeLength
                });

                tableRecordings.forEach((recording) => {
                    aggregatedRecordings.push({
                        ...recording,
                        tableDisplayName: table.name || `Table ${table.table_number}`,
                        table_number: table.table_number,
                        sessionTitle: sessionData.title
                    });
                });
            } catch (error) {
                console.warn(`Error loading recordings for table ${table.table_number}:`, error);
            }
        }

        renderRecordingList(aggregatedRecordings, {
            listId: 'sessionRecordingsList',
            emptyStateId: 'sessionRecordingsEmpty',
            badgeId: 'sessionRecordingCountBadge',
            context: 'session'
        });

        updateSessionSummaryIndicators();
    } catch (error) {
        console.error('Error loading session recordings:', error);
        renderRecordingList([], {
            listId: 'sessionRecordingsList',
            emptyStateId: 'sessionRecordingsEmpty',
            badgeId: 'sessionRecordingCountBadge',
            context: 'session'
        });
    }
}

function displayTableRecordings(recordings) {
    const safeRecordings = Array.isArray(recordings) ? recordings : [];

    renderRecordingList(safeRecordings, {
        listId: 'tableRecordingsList',
        emptyStateId: 'tableRecordingsEmpty',
        badgeId: 'tableRecordingCountBadge',
        context: 'table'
    });

    if (currentTable) {
        currentTable.recording_count = safeRecordings.length;
        tableRecordingCounts.set(String(currentTable.table_number), safeRecordings.length);
        updateSessionTableSnapshot(currentTable.table_number, {
            recording_count: safeRecordings.length
        });
        updateSessionSummaryIndicators();
    }

    renderFacilitatorControls({ recordingCount: safeRecordings.length });
}

function renderRecordingList(recordings, { listId, emptyStateId, badgeId, context }) {
    const listElement = document.getElementById(listId);
    const emptyStateElement = document.getElementById(emptyStateId);
    const badgeElement = badgeId ? document.getElementById(badgeId) : null;

    if (!listElement || !emptyStateElement) {
        return;
    }

    const safeRecordings = Array.isArray(recordings) ? [...recordings] : [];

    if (badgeElement) {
        badgeElement.textContent = safeRecordings.length;
    }

    if (safeRecordings.length === 0) {
        hideElement(listElement);
        showElement(emptyStateElement);
        return;
    }

    hideElement(emptyStateElement);
    listElement.innerHTML = '';
    showElement(listElement);

    safeRecordings
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
        .forEach((recording) => {
            const card = createRecordingCard(recording, context);
            listElement.appendChild(card);
        });
}

function createRecordingCard(recording, context = 'table') {
    const isFileDeleted = recording.status === 'file_deleted' || !recording.file_path;

    const card = document.createElement('article');
    card.className = 'recording-card';
    if (recording.id) {
        card.dataset.recordingId = recording.id;
    }

    const header = document.createElement('header');
    header.className = 'recording-card__header';

    const heading = document.createElement('div');
    heading.className = 'recording-card__heading';

    const title = document.createElement('h3');
    title.className = 'recording-card__title';

    const titleIcon = document.createElement('span');
    titleIcon.className = 'recording-card__icon';
    titleIcon.setAttribute('aria-hidden', 'true');
    titleIcon.textContent = isFileDeleted ? '📄' : '🎙️';

    const titleText = document.createElement('span');
    titleText.textContent = formatRecordingTitle(recording, context);

    title.append(titleIcon, titleText);
    heading.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'recording-card__meta';

    if (recording.created_at) {
        meta.appendChild(createRecordingMetaItem(new Date(recording.created_at).toLocaleString()));
    }

    if (context === 'session' && recording.tableDisplayName) {
        meta.appendChild(createRecordingMetaItem(recording.tableDisplayName));
    } else if (context === 'table' && currentTable) {
        meta.appendChild(createRecordingMetaItem(currentTable.name || `Table ${currentTable.table_number || ''}`));
    }

    const durationSeconds = parseFloat(recording.duration_seconds);
    if (!Number.isNaN(durationSeconds) && durationSeconds > 0) {
        meta.appendChild(createRecordingMetaItem(formatDuration(durationSeconds)));
    }

    if (recording.file_size && !isFileDeleted) {
        meta.appendChild(createRecordingMetaItem(formatFileSize(recording.file_size)));
    }

    heading.appendChild(meta);
    header.appendChild(heading);

    const statusBadge = document.createElement('span');
    statusBadge.className = `recording-card__status badge ${getRecordingStatusVariant(recording.status, isFileDeleted)}`;
    statusBadge.textContent = formatStatusLabel(recording.status || (isFileDeleted ? 'file_deleted' : 'ready'));
    header.appendChild(statusBadge);

    card.appendChild(header);

    if (isFileDeleted) {
        const placeholder = document.createElement('div');
        placeholder.className = 'recording-card__placeholder';
        placeholder.textContent = 'Media file removed. Transcription remains available.';
        card.appendChild(placeholder);
    } else {
        const player = document.createElement('audio');
        player.className = 'recording-card__player';
        player.controls = true;
        player.preload = 'metadata';

        const primarySource = document.createElement('source');
        primarySource.src = `/recordings/${recording.filename}`;
        primarySource.type = recording.mime_type || 'audio/wav';
        player.appendChild(primarySource);

        if (!recording.mime_type || recording.mime_type !== 'audio/wav') {
            const fallbackSource = document.createElement('source');
            fallbackSource.src = `/recordings/${recording.filename}`;
            fallbackSource.type = 'audio/wav';
            player.appendChild(fallbackSource);
        }

        player.appendChild(document.createTextNode('Your browser does not support the audio element.'));
        card.appendChild(player);
    }

    const actions = document.createElement('div');
    actions.className = 'recording-card__actions';

    if (!isFileDeleted) {
        actions.appendChild(createRecordingAction('🔄 Reprocess', 'btn-secondary', () => reprocessRecording(recording.id, recording.filename)));
        actions.appendChild(createRecordingAction('📥 Download', 'btn-secondary', () => downloadRecording(recording.filename)));
        actions.appendChild(createRecordingAction('🗑️ Delete File', 'btn-secondary', () => deleteMediaFile(recording.id, { context })));
    }

    actions.appendChild(createRecordingAction(isFileDeleted ? '🗑️ Delete Transcription' : '🗑️ Delete All', 'btn-danger', () => deleteRecordingComplete(recording.id, { context })));

    card.appendChild(actions);
    return card;
}

function formatRecordingTitle(recording, context) {
    const parts = [];
    const sessionTitle = recording.sessionTitle || currentSession?.title;
    if (sessionTitle && context === 'session') {
        parts.push(sessionTitle);
    }

    const tableDisplay = recording.tableDisplayName || recording.table_name || (recording.table_number ? `Table ${recording.table_number}` : null);
    if (tableDisplay) {
        parts.push(tableDisplay);
    } else if (context === 'table' && currentTable) {
        parts.push(currentTable.name || `Table ${currentTable.table_number || ''}`);
    }

    if (recording.created_at) {
        parts.push(new Date(recording.created_at).toLocaleDateString());
    }

    if (parts.length === 0 && sessionTitle) {
        parts.push(sessionTitle);
    }

    return parts.join(' • ');
}

function createRecordingMetaItem(text) {
    const item = document.createElement('span');
    item.className = 'recording-card__meta-item';
    item.textContent = text;
    return item;
}

function createRecordingAction(label, variantClass, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn ${variantClass} btn-sm`;
    button.innerHTML = label;
    button.addEventListener('click', handler);
    return button;
}

function getRecordingStatusVariant(status, isFileDeleted) {
    if (isFileDeleted || status === 'file_deleted') {
        return 'badge-warning';
    }

    const normalized = (status || '').toString().toLowerCase();
    const map = {
        completed: 'badge-success',
        ready: 'badge-success',
        processed: 'badge-success',
        transcribed: 'badge-success',
        processing: 'badge-warning',
        pending: 'badge-warning',
        uploading: 'badge-warning',
        saving: 'badge-warning',
        failed: 'badge-error',
        error: 'badge-error'
    };

    return map[normalized] || 'badge-neutral';
}

function formatDateTime(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        return null;
    }

    const datePart = date.toLocaleDateString();
    const timePart = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
}

function formatTimestampRange(start, end) {
    const formatPart = value => {
        if (typeof value !== 'number' || !Number.isFinite(value)) {
            return null;
        }

        const totalSeconds = Math.max(0, Math.floor(value));
        const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        return `${minutes}:${seconds}`;
    };

    const startLabel = formatPart(start);
    const endLabel = formatPart(end);

    if (startLabel && endLabel) {
        return `${startLabel} – ${endLabel}`;
    }
    return startLabel || endLabel;
}

function formatRelativeTime(value) {
    if (!value) return 'moments ago';

    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return 'moments ago';
    }

    const diff = Date.now() - date.getTime();
    if (diff < 0) {
        return date.toLocaleString();
    }

    const minute = 60 * 1000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diff < minute) {
        return 'moments ago';
    }

    if (diff < hour) {
        const minutes = Math.floor(diff / minute);
        return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
    }

    if (diff < day) {
        const hours = Math.floor(diff / hour);
        return `${hours} hr${hours === 1 ? '' : 's'} ago`;
    }

    if (diff < day * 7) {
        const days = Math.floor(diff / day);
        return `${days} day${days === 1 ? '' : 's'} ago`;
    }

    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDuration(seconds) {
    const totalSeconds = Math.round(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;

    if (minutes > 0) {
        return `${minutes}m${remainingSeconds > 0 ? ` ${remainingSeconds}s` : ''}`;
    }

    return `${remainingSeconds}s`;
}

function refreshRecordingContexts(context = 'all') {
    const target = context || 'all';

    if ((target === 'all' || target === 'table') && document.getElementById('tableRecordingsList')) {
        loadTableRecordings();
    }

    const recordingsSection = document.getElementById('sessionRecordingsSection');
    if ((target === 'all' || target === 'session') && recordingsSection && recordingsSection.dataset.tableOnly !== 'true' && document.getElementById('sessionRecordingsList')) {
        loadSessionRecordings();
    }
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
async function deleteMediaFile(recordingId, options = {}) {
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
        
        const targetContext = options.context || 'all';

        setTimeout(() => {
            refreshRecordingContexts(targetContext);
        }, 500);
        
    } catch (error) {
        console.error('Error deleting media file:', error);
        showToast('Failed to delete media file. Please try again.', 'error');
    }
}

// Delete recording completely (media file + transcription)
async function deleteRecordingComplete(recordingId, options = {}) {
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
        
        const targetContext = options.context || 'all';

        setTimeout(() => {
            refreshRecordingContexts(targetContext);
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
            const loginContainer = document.getElementById('adminLogin');
            const adminPanel = document.getElementById('adminPanel');

            if (loginContainer) {
                loginContainer.classList.add('is-hidden');
            }

            if (adminPanel) {
                adminPanel.classList.remove('is-hidden');
            }

            loadAdminSessions();
            loadAdminStats();
            loadSettingsData();
            loadPlatformStats();

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
    } else if (tabName === 'settings') {
        loadSettingsData();
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
    
    showElement(document.getElementById('sessionActionModal'));
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
    hideElement(document.getElementById('sessionActionModal'));
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
        
        showElement(document.getElementById('sessionHistoryModal'));
    } catch (error) {
        console.error('Error loading session history:', error);
        console.error('Error loading history');
    }
}

function closeSessionHistory() {
    hideElement(document.getElementById('sessionHistoryModal'));
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

function formatDeepgramModelLabel(model) {
    if (!model || typeof model !== 'string') {
        return '';
    }

    return model
        .replace(/-/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
}

function initializeDeepgramModelSelect(availableModels = DEEPGRAM_MODEL_OPTIONS) {
    const select = document.getElementById('deepgramModelSelect');
    if (!select) {
        return;
    }

    const uniqueModels = Array.from(new Set([
        ...(Array.isArray(availableModels) && availableModels.length ? availableModels : []),
        ...DEEPGRAM_MODEL_OPTIONS
    ]));

    const fallbackValue = window.deepgramModel || 'nova-2-meeting';
    const currentValue = select.value || fallbackValue;

    select.innerHTML = '';

    uniqueModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = formatDeepgramModelLabel(model);
        select.appendChild(option);
    });

    if (!uniqueModels.includes(currentValue)) {
        const option = document.createElement('option');
        option.value = currentValue;
        option.textContent = formatDeepgramModelLabel(currentValue);
        select.appendChild(option);
    }

    select.value = currentValue;
    window.deepgramModel = select.value;
    deepgramModelSelectInitialized = true;

    if (!select.dataset.deepgramModelBound) {
        select.addEventListener('change', (event) => {
            window.deepgramModel = event.target.value;
        });
        select.dataset.deepgramModelBound = 'true';
    }
}

function syncDeepgramModelSelect(newValue) {
    const select = document.getElementById('deepgramModelSelect');
    if (!select) {
        window.deepgramModel = newValue || window.deepgramModel;
        return;
    }

    if (!deepgramModelSelectInitialized) {
        initializeDeepgramModelSelect();
    }

    if (newValue && select.value !== newValue) {
        if (![...select.options].some(option => option.value === newValue)) {
            const option = document.createElement('option');
            option.value = newValue;
            option.textContent = formatDeepgramModelLabel(newValue);
            select.appendChild(option);
        }
        select.value = newValue;
    }

    window.deepgramModel = select.value;
}

function initializeDeepgramConfiguration() {
    initializeDeepgramModelSelect();

    fetch('/api/config/transcription')
        .then(response => response.ok ? response.json() : null)
        .then(config => {
            if (!config) {
                return;
            }

            if (Array.isArray(config.available_models) && config.available_models.length > 0) {
                initializeDeepgramModelSelect(config.available_models);
            }

            if (config.model) {
                syncDeepgramModelSelect(config.model);
            }
        })
        .catch(error => {
            console.error('Error loading Deepgram configuration:', error);
        });
}

async function updateApiKeys() {
    const deepgramKeyInput = document.getElementById('deepgramApiKey');
    const deepgramKey = deepgramKeyInput ? deepgramKeyInput.value.trim() : '';
    const deepgramModel = document.getElementById('deepgramModelSelect')?.value || window.deepgramModel || 'nova-2-meeting';

    showLoading('Updating API keys...');
    
    try {
        const response = await fetch('/api/admin/settings/api-keys', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                deepgram_api_key: deepgramKey || null,
                deepgram_model: deepgramModel
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert('API keys updated successfully!');
            
            // Update configuration status
            updateConfigurationStatus();
            
            // Clear form
            if (deepgramKeyInput) {
                deepgramKeyInput.value = '';
            }
            if (result.deepgram_model) {
                syncDeepgramModelSelect(result.deepgram_model);
            }
            
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

            if (enabledCheckbox) {
                enabledCheckbox.checked = settings.enabled;
            }

            if (passwordInput) {
                passwordInput.value = settings.password || 'testtesttest';
            }
            if (passwordRow) {
                passwordRow.classList.toggle('is-hidden', !settings.enabled);
            }
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
        initializeDeepgramModelSelect();
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
                if (!passwordRow) return;

                const shouldShow = this.checked;
                passwordRow.classList.toggle('is-hidden', !shouldShow);

                if (shouldShow && passwordInput && !passwordInput.value.trim()) {
                    passwordInput.value = 'testtesttest';
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
            
            if (status.apis && status.apis.deepgram) {
                const deepgramDetails = status.apis.deepgram;

                if (Array.isArray(deepgramDetails.available_models)) {
                    initializeDeepgramModelSelect(deepgramDetails.available_models);
                }

                if (deepgramDetails.model) {
                    syncDeepgramModelSelect(deepgramDetails.model);
                }

                if (deepgramDetails.configured) {
                    deepgramStatus.textContent = 'Configured';
                    deepgramStatus.className = 'config-status-badge configured';
                } else {
                    deepgramStatus.textContent = 'Not Configured';
                    deepgramStatus.className = 'config-status-badge';
                }
            } else if (deepgramStatus) {
                deepgramStatus.textContent = 'Not Configured';
                deepgramStatus.className = 'config-status-badge';
                window.deepgramModel = window.deepgramModel || 'nova-2-meeting';
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
    const displayIds = LIVE_TRANSCRIPTION_UI_IDS.displayContainers;
    const emptyStateIds = LIVE_TRANSCRIPTION_UI_IDS.emptyStates;

    displayIds.forEach((displayId, index) => {
        const displayDiv = document.getElementById(displayId);
        const emptyState = document.getElementById(emptyStateIds[index]);

        if (!displayDiv) return;

        if (emptyState) {
            hideElement(emptyState);
        }
        showElement(displayDiv);

        const entry = document.createElement('div');
        entry.style.cssText = 'margin-bottom: 12px; padding: 12px; background: #f8f9fa; border-radius: 8px; border-left: 4px solid #28a745;';

        const timestamp = new Date().toLocaleTimeString();
        entry.innerHTML = `
            <div style="font-size: 12px; color: #6c757d; margin-bottom: 4px;">${timestamp}</div>
            <div style="color: #333; line-height: 1.4;">${transcript}</div>
        `;

        displayDiv.appendChild(entry);
        displayDiv.scrollTop = displayDiv.scrollHeight;
    });

    applyToElements(LIVE_TRANSCRIPTION_UI_IDS.counters, (counter) => {
        const currentCount = parseInt(counter.textContent) || 0;
        counter.textContent = currentCount + 1;
    });
}

// Reset transcription display
function resetLiveTranscriptionDisplay() {
    const displayIds = LIVE_TRANSCRIPTION_UI_IDS.displayContainers;
    const emptyStateIds = LIVE_TRANSCRIPTION_UI_IDS.emptyStates;
    const contentIds = LIVE_TRANSCRIPTION_UI_IDS.contentContainers;

    displayIds.forEach((id) => {
        const displayDiv = document.getElementById(id);
        if (displayDiv) {
            displayDiv.innerHTML = '';
            hideElement(displayDiv);
        }
    });

    emptyStateIds.forEach((id) => {
        const emptyState = document.getElementById(id);
        if (emptyState) {
            showElement(emptyState);
        }
    });

    applyToElements(LIVE_TRANSCRIPTION_UI_IDS.counters, (counter) => {
        counter.textContent = '0';
    });

    contentIds.forEach((id) => {
        const container = document.getElementById(id);
        if (container) {
            container.scrollTop = 0;
        }
    });

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
function displayLiveTranscriptionResult(transcript, isFinal) {
    console.log(`📝 displayLiveTranscriptionResult called with transcript: "${transcript}", isFinal: ${isFinal}`);
    
    const targetContainer = document.getElementById('liveTranscriptionContent');
    if (!targetContainer) {
        console.error('❌ liveTranscriptionContent container not found!');
        return;
    }

    console.log(`📝 Target container found:`, targetContainer);

    const emptyState = document.getElementById('emptyTranscriptionState');
    const displayDiv = document.getElementById('transcriptionDisplay');

    if (emptyState) {
        hideElement(emptyState);
    }
    if (displayDiv) {
        showElement(displayDiv);
    }

    if (isFinal) {
        const trimmedTranscript = typeof transcript === 'string' ? transcript.trim() : '';

        const hasExistingWords = Array.isArray(window.currentLiveWords) && window.currentLiveWords.length > 0;

        if (currentInterimBubble) {
            const textElement = currentInterimBubble.querySelector('.transcript-text');
            if (textElement && trimmedTranscript) {
                textElement.textContent = trimmedTranscript;
            }

            const statusElement = currentInterimBubble.querySelector('.interim-status');
            if (statusElement) {
                statusElement.remove();
            }

            currentInterimBubble.style.animation = 'none';
            currentInterimBubble.style.opacity = '1';
            currentInterimBubble.style.border = '1px solid #d1d5db';
            currentInterimBubble.style.background = '#ffffff';
            currentInterimBubble = null;
        } else if (!hasExistingWords && trimmedTranscript) {
            const finalBubble = createLiveChatBubble(0, targetContainer);
            const textElement = finalBubble.querySelector('.bubble-text');
            if (textElement) {
                textElement.textContent = trimmedTranscript;
            }
            finalBubble.style.background = '#ffffff';
            finalBubble.style.border = '1px solid #d1d5db';
            finalBubble.style.boxShadow = '0 2px 6px rgba(0,0,0,0.08)';
        }

        if (!hasExistingWords && trimmedTranscript) {
            window.currentLiveWords = window.currentLiveWords || [];
            window.currentLiveWords.push({
                speaker: 0,
                word: trimmedTranscript,
                timestamp: Date.now()
            });
        }

        try {
            updateTranscriptionTabCounts();
        } catch (error) {
            console.warn('Error updating counts on final transcript:', error);
        }

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
                        <div class="interim-status" style="color: #6c757d; font-size: 12px; font-style: italic;">Listening...</div>
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
    const waveContainer = document.getElementById(LIVE_TRANSCRIPTION_UI_IDS.audioWave);
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
        const waveContainer = document.getElementById(LIVE_TRANSCRIPTION_UI_IDS.audioWaveContainer);
        if (waveContainer) {
            showElement(waveContainer);
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
    const levelDisplay = document.getElementById(LIVE_TRANSCRIPTION_UI_IDS.audioLevel);
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
    }
    audioContext = null;
}

function resetLiveTranscriptionState({ silent = false, keepBuffers = false, skipRecorderStop = false } = {}) {
    if (!skipRecorderStop && mediaRecorder && mediaRecorder.state !== 'inactive') {
        try {
            mediaRecorder.stop();
        } catch (error) {
            console.warn('⚠️ MediaRecorder stop warning during reset:', error);
        }
    }
    mediaRecorder = null;

    if (window.liveTranscriptionStream) {
        window.liveTranscriptionStream.getTracks().forEach(track => track.stop());
        window.liveTranscriptionStream = null;
    }

    stopAudioWaveVisualization();
    isRecording = false;
    recordingStartTime = null;

    if (!keepBuffers) {
        window.liveAudioChunks = [];
        window.currentLiveWords = [];
        liveTranscriptionSegments = [];
    }

    currentLiveSpeaker = null;
    currentLiveBubble = null;

    if (currentInterimBubble) {
        currentInterimBubble.remove();
        currentInterimBubble = null;
    }

    applyToElements(LIVE_TRANSCRIPTION_UI_IDS.startButtons, showElement);
    applyToElements(LIVE_TRANSCRIPTION_UI_IDS.stopButtons, hideElement);

    const waveContainer = document.getElementById(LIVE_TRANSCRIPTION_UI_IDS.audioWaveContainer);
    if (waveContainer) {
        hideElement(waveContainer);
    }

    analyser = null;
    dataArray = null;
    liveRecorderMimeType = null;
    liveRecorderStopResolver = null;

    if (!silent) {
        showToast('Live transcription session ended', 'info');
    }
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

// Expose selected helpers for other scripts
window.switchTranscriptionTab = window.switchTranscriptionTab || switchTranscriptionTab;
window.updateTranscriptionTabCounts = window.updateTranscriptionTabCounts || updateTranscriptionTabCounts;
window.activateRecordingMethodTab = window.activateRecordingMethodTab || activateRecordingMethodTab;
window.resetLiveTranscriptionState = window.resetLiveTranscriptionState || resetLiveTranscriptionState;

// Note: Initialization already handled by the main DOMContentLoaded listener above
