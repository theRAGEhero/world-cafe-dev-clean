// Enhanced World Café Platform - Mobile-First JavaScript

// Global variables
let socket;
let currentSession = null;
let currentTable = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;
let activeSessions = []; // In-memory sessions storage
let isMobile = false;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    detectMobile();
    initializeSocket();
    setupEventListeners();
    loadActiveSessions();
    handleURLParams();
});

// Mobile detection
function detectMobile() {
    isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
        document.body.classList.add('mobile');
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
        showToast('Connected to server', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showToast('Connection lost - trying to reconnect...', 'warning');
    });
    
    socket.on('table-updated', (data) => {
        updateTableDisplay(data.tableId, data.table);
    });
    
    socket.on('recording-status', (data) => {
        updateRecordingStatus(data);
    });
    
    socket.on('transcription-completed', (data) => {
        displayTranscription(data);
        showToast(`Transcription completed for Table ${data.tableNumber}`, 'success');
        updateTableTranscriptionCount(data.tableId);
    });
}

// Enhanced Event listeners
function setupEventListeners() {
    // Navigation
    document.getElementById('createSessionBtn').onclick = showCreateSession;
    document.getElementById('adminBtn').onclick = showAdminDashboard;
    document.getElementById('mobileMenuToggle').onclick = toggleMobileMenu;
    document.getElementById('qrScanBtn').onclick = showQRScanner;
    
    // Forms
    document.getElementById('createSessionForm').onsubmit = createSession;
    document.getElementById('sessionSelect').onchange = loadSessionTables;
    document.getElementById('joinTableBtn').onclick = joinTable;
    
    // Recording controls
    document.getElementById('startRecordingBtn').onclick = startRecording;
    document.getElementById('stopRecordingBtn').onclick = stopRecording;
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

// Mobile menu toggle
function toggleMobileMenu() {
    const navButtons = document.querySelector('.nav-buttons');
    navButtons.classList.toggle('mobile-open');
}

// Navigation functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
    
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

// Session Management
async function createSession(event) {
    event.preventDefault();
    
    const title = document.getElementById('sessionTitle').value;
    const description = document.getElementById('sessionDescription').value;
    const tableCount = parseInt(document.getElementById('tableCount').value);
    const maxParticipants = parseInt(document.getElementById('maxParticipants').value);
    
    if (!title.trim()) {
        showToast('Please enter a session title', 'error');
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
                tableCount,
                maxParticipants
            }),
        });
        
        if (response.ok) {
            const session = await response.json();
            currentSession = session;
            
            // Add to local sessions array
            activeSessions.push(session);
            
            showToast(`Session "${title}" created successfully!`, 'success');
            
            // Join the socket room
            socket.emit('join-session', session.id);
            
            // Show dashboard
            loadSessionDashboard(session.id);
            showScreen('sessionDashboard');
        } else {
            const error = await response.json();
            showToast(`Error creating session: ${error.error}`, 'error');
        }
    } catch (error) {
        console.error('Error creating session:', error);
        showToast('Failed to create session. Please try again.', 'error');
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
        <div class="card session-card" onclick="loadSpecificSession('${session.id}')">
            <h3>${session.title}</h3>
            <p>${session.description || 'No description'}</p>
            <div class="session-stats">
                <span>📊 ${session.table_count || session.tableCount || 0} tables</span>
                <span>👥 ${session.total_participants || 0} participants</span>
                <span>🎤 ${session.total_recordings || 0} recordings</span>
            </div>
            <small>Created: ${new Date(session.created_at || session.createdAt).toLocaleString()}</small>
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
            showToast(`Joined session: ${session.title}`, 'success');
        } else {
            showToast('Session not found or expired', 'error');
        }
    } catch (error) {
        console.error('Error loading session:', error);
        showToast('Error loading session', 'error');
    } finally {
        hideLoading();
    }
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
    
    showToast(`Downloading ${type} QR code...`, 'success');
}

function copyQRLink(type, sessionId, tableNumber = null) {
    const baseUrl = window.location.origin;
    const url = tableNumber 
        ? `${baseUrl}/join/${sessionId}/table/${tableNumber}`
        : `${baseUrl}/join/${sessionId}`;
    
    navigator.clipboard.writeText(url).then(() => {
        showToast('QR code link copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Could not copy link. Please copy manually: ' + url, 'warning');
    });
}

function downloadAllQRCodes() {
    if (!currentSession) return;
    
    showToast('Downloading all QR codes...', 'info');
    
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
        showToast('QR scanning works best on mobile devices', 'info');
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
        showToast('Please enter a session or table code', 'error');
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
        showToast('Camera access is required for QR scanning', 'error');
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
        showToast('Invalid QR code. Please try again.', 'error');
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
            showToast(`Joined Table ${tableId}!`, 'success');
        }
    } catch (error) {
        console.error('Error joining table:', error);
        showToast(`Error joining Table ${tableId}`, 'error');
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
        showToast('Please fill in all fields', 'error');
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
            
            showToast(`Successfully joined Table ${tableNumber}!`, 'success');
        } else {
            const error = await response.json();
            showToast(`Error joining table: ${error.error}`, 'error');
        }
    } catch (error) {
        console.error('Error joining table:', error);
        showToast('Error joining table. Please try again.', 'error');
    } finally {
        hideLoading();
    }
}

function setupTableInterface() {
    if (!currentTable) return;
    
    document.getElementById('tableTitle').textContent = currentTable.name || `Table ${currentTable.table_number}`;
    document.getElementById('tableStatus').textContent = currentTable.status || 'waiting';
    document.getElementById('tableStatus').className = `status-badge ${currentTable.status || 'waiting'}`;
    
    // Update participants list
    const participantsList = document.getElementById('participantsList');
    if (currentTable.participants && currentTable.participants.length > 0) {
        participantsList.innerHTML = currentTable.participants.map(p => 
            `<li>${p.name} ${p.is_facilitator ? '(Facilitator)' : ''}</li>`
        ).join('');
    } else {
        participantsList.innerHTML = '<li>No participants yet</li>';
    }
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
        
        showToast('Recording started', 'success');
        
    } catch (error) {
        console.error('Error starting recording:', error);
        showToast('Error accessing microphone. Please check permissions.', 'error');
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
        
        showToast('Recording stopped, processing...', 'info');
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
            showToast('Audio uploaded and transcription started!', 'success');
            
            // Update recording status
            updateRecordingStatus({ status: 'processing', timestamp: new Date() });
        } else {
            const error = await response.json();
            showToast(`Upload failed: ${error.error}`, 'error');
        }
    } catch (error) {
        console.error('Error uploading audio:', error);
        showToast('Error uploading audio. Please try again.', 'error');
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
    
    if (data.transcription) {
        const transcriptItem = document.createElement('div');
        transcriptItem.className = 'transcript-item';
        transcriptItem.innerHTML = `
            <div class="transcript-meta">
                <span>Table ${data.tableNumber}</span>
                <span>${new Date().toLocaleTimeString()}</span>
                <span>${data.transcription.confidence ? (data.transcription.confidence * 100).toFixed(1) + '% confidence' : ''}</span>
            </div>
            <div class="transcript-text">${data.transcription.transcript || data.transcription}</div>
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
        showToast('No session selected', 'error');
        return;
    }
    
    showLoading('Generating AI-powered analysis...');
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/analysis`);
        
        if (response.ok) {
            const analysis = await response.json();
            displayAnalysisReport(analysis);
            showScreen('analysisReport');
            showToast('Analysis completed!', 'success');
        } else {
            const error = await response.json();
            showToast(`Analysis failed: ${error.error}`, 'error');
        }
    } catch (error) {
        console.error('Error generating analysis:', error);
        showToast('Error generating analysis', 'error');
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
        showToast('Please enter admin password', 'error');
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
            showToast('Admin access granted', 'success');
        } else {
            const error = await response.json();
            showToast(`Login failed: ${error.error}`, 'error');
        }
    } catch (error) {
        console.error('Error during admin login:', error);
        showToast('Error during login. Please try again.', 'error');
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
            showToast('Prompts saved successfully', 'success');
        } else {
            showToast('Error saving prompts', 'error');
        }
    } catch (error) {
        console.error('Error saving prompts:', error);
        showToast('Error saving prompts', 'error');
    }
}

// Utility functions
function showToast(message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
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
    
    showToast('Report downloaded successfully', 'success');
}