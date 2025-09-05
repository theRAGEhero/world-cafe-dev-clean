// Global variables
let socket;
let currentSession = null;
let currentTable = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let recordingStartTime = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeSocket();
    setupEventListeners();
    loadActiveSessions();
});

// Socket.IO initialization
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        showToast('Connected to server', 'success');
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showToast('Disconnected from server', 'warning');
    });
    
    socket.on('table-updated', (data) => {
        updateTableDisplay(data.tableId, data.table);
    });
    
    socket.on('recording-status', (data) => {
        updateRecordingStatus(data);
    });
    
    socket.on('transcription-completed', (data) => {
        displayTranscription(data.transcription);
        showToast('Transcription completed', 'success');
    });
}

// Event listeners
function setupEventListeners() {
    // Navigation
    document.getElementById('createSessionBtn').onclick = showCreateSession;
    document.getElementById('adminBtn').onclick = showAdminDashboard;
    
    // Forms
    document.getElementById('createSessionForm').onsubmit = createSession;
    document.getElementById('sessionSelect').onchange = loadSessionTables;
    document.getElementById('joinTableBtn').onclick = joinTable;
    
    // Recording controls
    document.getElementById('startRecordingBtn').onclick = startRecording;
    document.getElementById('stopRecordingBtn').onclick = stopRecording;
    document.getElementById('generateReportBtn').onclick = generateAnalysis;
}

// Navigation functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
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
    currentTable = currentSession.tables.find(t => t.id === tableId);
    if (currentTable) {
        setupTableInterface();
        showScreen('tableInterface');
    }
}

function showAdminDashboard() {
    loadAdminPrompts();
    showScreen('adminDashboard');
}

// Session management
async function createSession(event) {
    event.preventDefault();
    
    const formData = {
        title: document.getElementById('sessionTitle').value,
        description: document.getElementById('sessionDescription').value,
        tableCount: parseInt(document.getElementById('tableCount').value),
        maxParticipants: parseInt(document.getElementById('maxParticipants').value)
    };
    
    showLoading('Creating session...');
    
    try {
        const response = await fetch('/api/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });
        
        if (response.ok) {
            const session = await response.json();
            currentSession = session;
            showToast('Session created successfully', 'success');
            showSessionDashboard();
        } else {
            throw new Error('Failed to create session');
        }
    } catch (error) {
        showToast('Error creating session: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

async function loadActiveSessions() {
    try {
        const response = await fetch('/api/sessions');
        const sessions = await response.json();
        
        // Update session selector
        const sessionSelect = document.getElementById('sessionSelect');
        sessionSelect.innerHTML = '<option value="">Select a session</option>';
        
        sessions.forEach(session => {
            const option = document.createElement('option');
            option.value = session.id;
            option.textContent = `${session.title} (${session.participants?.length || 0} participants)`;
            sessionSelect.appendChild(option);
        });
        
        // Update sessions list
        const sessionsList = document.getElementById('sessionsList');
        sessionsList.innerHTML = '';
        
        if (sessions.length === 0) {
            sessionsList.innerHTML = '<p>No active sessions found.</p>';
        } else {
            sessions.forEach(session => {
                const sessionItem = document.createElement('div');
                sessionItem.className = 'session-item';
                sessionItem.onclick = () => joinSession(session.id);
                
                sessionItem.innerHTML = `
                    <div class="session-title">${session.title}</div>
                    <div class="session-meta">
                        ${session.participants?.length || 0} participants • 
                        ${session.tables?.filter(t => t.participants?.length > 0).length || 0} active tables •
                        Created ${new Date(session.createdAt).toLocaleDateString()}
                    </div>
                `;
                
                sessionsList.appendChild(sessionItem);
            });
        }
    } catch (error) {
        showToast('Error loading sessions: ' + error.message, 'error');
    }
}

async function joinSession(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        const session = await response.json();
        currentSession = session;
        socket.emit('join-session', sessionId);
        showSessionDashboard();
    } catch (error) {
        showToast('Error joining session: ' + error.message, 'error');
    }
}

async function loadSessionTables() {
    const sessionId = document.getElementById('sessionSelect').value;
    const tableSelect = document.getElementById('tableSelect');
    
    if (!sessionId) {
        tableSelect.innerHTML = '<option value="">First select a session</option>';
        document.getElementById('joinTableBtn').disabled = true;
        return;
    }
    
    try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        const session = await response.json();
        
        tableSelect.innerHTML = '<option value="">Select a table</option>';
        
        session.tables.forEach(table => {
            if (table.participants.length < table.maxSize) {
                const option = document.createElement('option');
                option.value = table.id;
                option.textContent = `${table.name} (${table.participants.length}/${table.maxSize} participants)`;
                tableSelect.appendChild(option);
            }
        });
        
        tableSelect.onchange = () => {
            document.getElementById('joinTableBtn').disabled = !tableSelect.value;
        };
        
    } catch (error) {
        showToast('Error loading tables: ' + error.message, 'error');
    }
}

async function joinTable() {
    const sessionId = document.getElementById('sessionSelect').value;
    const tableId = document.getElementById('tableSelect').value;
    const participantName = document.getElementById('participantName').value;
    
    if (!sessionId || !tableId || !participantName) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    showLoading('Joining table...');
    
    try {
        const response = await fetch(`/api/sessions/${sessionId}/tables/${tableId}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ participantName })
        });
        
        if (response.ok) {
            await joinSession(sessionId);
            showTableInterface(parseInt(tableId));
            showToast('Joined table successfully', 'success');
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
    } catch (error) {
        showToast('Error joining table: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Dashboard functions
async function loadSessionDashboard(sessionId) {
    try {
        const response = await fetch(`/api/sessions/${sessionId}`);
        const session = await response.json();
        currentSession = session;
        
        // Update dashboard title
        document.getElementById('dashboardTitle').textContent = session.title;
        
        // Update stats
        const stats = {
            participants: session.participants?.length || 0,
            activeTables: session.tables?.filter(t => t.participants?.length > 0).length || 0,
            recordings: session.transcriptions?.length || 0
        };
        
        document.getElementById('participantCount').textContent = stats.participants;
        document.getElementById('activeTableCount').textContent = stats.activeTables;
        document.getElementById('recordingCount').textContent = stats.recordings;
        
        // Update tables grid
        const tablesGrid = document.getElementById('tablesGrid');
        tablesGrid.innerHTML = '';
        
        session.tables.forEach(table => {
            const tableCard = createTableCard(table);
            tablesGrid.appendChild(tableCard);
        });
        
    } catch (error) {
        showToast('Error loading dashboard: ' + error.message, 'error');
    }
}

function createTableCard(table) {
    const card = document.createElement('div');
    card.className = 'table-card';
    
    const statusClass = `status-${table.status}`;
    const participantCount = table.participants?.length || 0;
    
    card.innerHTML = `
        <div class="table-card-header">
            <h3>${table.name}</h3>
            <span class="status-badge ${statusClass}">${table.status}</span>
        </div>
        <div class="table-card-body">
            <p><strong>Participants:</strong> ${participantCount}/${table.maxSize}</p>
            <p><strong>Status:</strong> ${table.status}</p>
            ${table.currentTopic ? `<p><strong>Topic:</strong> ${table.currentTopic}</p>` : ''}
            <button onclick="showTableInterface(${table.id})" class="btn btn-primary" style="width: 100%; margin-top: 1rem;">
                View Table
            </button>
        </div>
    `;
    
    return card;
}

// Table interface functions
function setupTableInterface() {
    if (!currentTable) return;
    
    // Update table info
    document.getElementById('tableTitle').textContent = currentTable.name;
    document.getElementById('tableStatus').textContent = currentTable.status;
    document.getElementById('tableStatus').className = `status-badge status-${currentTable.status}`;
    
    // Update participants list
    const participantsList = document.getElementById('participantsList');
    participantsList.innerHTML = '';
    
    if (currentTable.participants) {
        currentTable.participants.forEach(participant => {
            const li = document.createElement('li');
            li.textContent = participant.name;
            if (participant.id === currentTable.facilitator) {
                li.innerHTML += ' <strong>(Facilitator)</strong>';
            }
            participantsList.appendChild(li);
        });
    }
    
    // Setup recording controls
    updateRecordingControls();
}

function updateRecordingControls() {
    const startBtn = document.getElementById('startRecordingBtn');
    const stopBtn = document.getElementById('stopRecordingBtn');
    const status = document.getElementById('recordingStatus');
    
    if (isRecording) {
        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        status.innerHTML = '<div class="recording-status active">🔴 Recording in progress...</div>';
    } else {
        startBtn.style.display = 'inline-block';
        stopBtn.style.display = 'none';
        status.innerHTML = '';
    }
}

// Recording functions
async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            } 
        });
        
        // Setup MediaRecorder
        mediaRecorder = new MediaRecorder(stream, {
            mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg'
        });
        
        audioChunks = [];
        recordingStartTime = new Date();
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            uploadRecording();
            stream.getTracks().forEach(track => track.stop());
        };
        
        // Start recording
        mediaRecorder.start(1000); // Collect data every second
        isRecording = true;
        
        // Update UI
        updateRecordingControls();
        showAudioVisualization(stream);
        
        // Notify other participants
        socket.emit('recording-started', {
            sessionId: currentSession.id,
            tableId: currentTable.id
        });
        
        showToast('Recording started', 'success');
        
    } catch (error) {
        showToast('Error starting recording: ' + error.message, 'error');
        console.error('Recording error:', error);
    }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        
        // Update UI
        updateRecordingControls();
        hideAudioVisualization();
        
        // Notify other participants
        socket.emit('recording-stopped', {
            sessionId: currentSession.id,
            tableId: currentTable.id
        });
        
        showToast('Recording stopped, processing...', 'success');
    }
}

async function uploadRecording() {
    if (audioChunks.length === 0) return;
    
    showLoading('Processing recording...');
    
    try {
        // Create audio blob
        const audioBlob = new Blob(audioChunks, { 
            type: mediaRecorder.mimeType || 'audio/webm' 
        });
        
        // Create form data
        const formData = new FormData();
        formData.append('audio', audioBlob, `table-${currentTable.id}-${Date.now()}.webm`);
        
        // Upload to server
        const response = await fetch(
            `/api/sessions/${currentSession.id}/tables/${currentTable.id}/upload-audio`, 
            {
                method: 'POST',
                body: formData
            }
        );
        
        if (response.ok) {
            const result = await response.json();
            showToast('Recording processed successfully', 'success');
            
            // Display transcription
            if (result.transcription) {
                displayTranscription({
                    transcript: result.transcription,
                    speakers: result.speakers
                });
            }
        } else {
            const error = await response.json();
            throw new Error(error.error);
        }
        
    } catch (error) {
        showToast('Error uploading recording: ' + error.message, 'error');
    } finally {
        hideLoading();
        audioChunks = [];
    }
}

// Audio visualization
function showAudioVisualization(stream) {
    const visualization = document.getElementById('audioVisualization');
    visualization.style.display = 'block';
    
    // Create audio bars
    const bars = [];
    for (let i = 0; i < 20; i++) {
        const bar = document.createElement('div');
        bar.className = 'audio-bar';
        bars.push(bar);
    }
    
    visualization.innerHTML = '<div class="audio-bars"></div>';
    const barsContainer = visualization.querySelector('.audio-bars');
    bars.forEach(bar => barsContainer.appendChild(bar));
    
    // Setup audio context for visualization
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    
    analyser.fftSize = 64;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function updateVisualization() {
        if (!isRecording) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        bars.forEach((bar, index) => {
            const value = dataArray[index] || 0;
            const height = (value / 255) * 35 + 5;
            bar.style.height = height + 'px';
        });
        
        requestAnimationFrame(updateVisualization);
    }
    
    updateVisualization();
}

function hideAudioVisualization() {
    document.getElementById('audioVisualization').style.display = 'none';
}

// Transcription functions
function displayTranscription(transcription) {
    const display = document.getElementById('liveTranscript');
    
    let transcriptText = '';
    
    if (transcription.speakers && transcription.speakers.length > 0) {
        transcriptText = transcription.speakers
            .map(speaker => `Speaker ${speaker.speaker}: ${speaker.transcript}`)
            .join('\n\n');
    } else {
        transcriptText = transcription.transcript || 'No transcription available';
    }
    
    display.textContent = transcriptText;
    display.scrollTop = display.scrollHeight;
}

// Analysis functions
async function generateAnalysis() {
    if (!currentSession) return;
    
    showLoading('Generating analysis...');
    
    try {
        const response = await fetch(`/api/sessions/${currentSession.id}/analysis`);
        const analysis = await response.json();
        
        displayAnalysisReport(analysis);
        showScreen('analysisReport');
        
    } catch (error) {
        showToast('Error generating analysis: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function displayAnalysisReport(analysis) {
    const reportContent = document.getElementById('reportContent');
    
    let html = `
        <div class="report-section">
            <h3>Executive Summary</h3>
            <p><strong>Overall Sentiment:</strong> ${analysis.sentiment?.interpretation || 'N/A'} 
               (Score: ${analysis.sentiment?.overall?.toFixed(2) || 'N/A'})</p>
            <p><strong>Total Conflicts:</strong> ${analysis.conflicts?.length || 0}</p>
            <p><strong>Total Agreements:</strong> ${analysis.agreements?.length || 0}</p>
            <p><strong>Main Themes:</strong> ${analysis.themes?.slice(0, 5).map(t => t.theme).join(', ') || 'None identified'}</p>
        </div>
    `;
    
    if (analysis.conflicts && analysis.conflicts.length > 0) {
        html += `
            <div class="report-section">
                <h3>Conflicts Detected (${analysis.conflicts.length})</h3>
                ${analysis.conflicts.slice(0, 5).map(conflict => `
                    <div class="conflict-item">
                        <strong>Table ${conflict.tableId} - Severity: ${(conflict.severity * 100).toFixed(0)}%</strong>
                        <p>${conflict.text}</p>
                        <small>Keywords: ${conflict.keywords?.join(', ') || 'N/A'}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    if (analysis.agreements && analysis.agreements.length > 0) {
        html += `
            <div class="report-section">
                <h3>Agreements Found (${analysis.agreements.length})</h3>
                ${analysis.agreements.slice(0, 5).map(agreement => `
                    <div class="agreement-item">
                        <strong>Table ${agreement.tableId} - Strength: ${(agreement.strength * 100).toFixed(0)}%</strong>
                        <p>${agreement.text}</p>
                        <small>Keywords: ${agreement.keywords?.join(', ') || 'N/A'}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    if (analysis.themes && analysis.themes.length > 0) {
        html += `
            <div class="report-section">
                <h3>Main Themes</h3>
                ${analysis.themes.slice(0, 10).map(theme => `
                    <div style="margin-bottom: 1rem;">
                        <strong>${theme.theme}</strong> (${theme.frequency} mentions)
                        <br><small>Sentiment: ${theme.sentiment?.toFixed(2) || 'N/A'}</small>
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    reportContent.innerHTML = html;
}

// Admin functions
async function loadAdminPrompts() {
    try {
        const response = await fetch('/api/admin/prompts');
        const prompts = await response.json();
        
        document.getElementById('conflictPrompt').value = prompts.conflictDetection?.prompt || '';
        document.getElementById('agreementPrompt').value = prompts.agreementDetection?.prompt || '';
        document.getElementById('themePrompt').value = prompts.themeExtraction?.prompt || '';
        document.getElementById('sentimentPrompt').value = prompts.sentimentAnalysis?.prompt || '';
        
    } catch (error) {
        showToast('Error loading prompts: ' + error.message, 'error');
    }
}

function adminLogin() {
    const password = document.getElementById('adminPassword').value;
    if (password === 'admin') {
        document.getElementById('adminLogin').style.display = 'none';
        document.getElementById('adminPanel').style.display = 'block';
        showToast('Admin panel unlocked', 'success');
    } else {
        showToast('Invalid admin password', 'error');
        document.getElementById('adminPassword').value = '';
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
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, prompts })
        });
        
        if (response.ok) {
            showToast('Prompts saved successfully', 'success');
        } else {
            throw new Error('Failed to save prompts');
        }
    } catch (error) {
        showToast('Error saving prompts: ' + error.message, 'error');
    }
}

// Utility functions
function showLoading(message = 'Loading...') {
    document.getElementById('loadingMessage').textContent = message;
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.getElementById('toastContainer').appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

function updateTableDisplay(tableId, table) {
    if (currentTable && currentTable.id === tableId) {
        currentTable = table;
        setupTableInterface();
    }
}

function updateRecordingStatus(data) {
    if (currentTable && currentTable.id === data.tableId) {
        // Update UI based on recording status
        console.log('Recording status updated:', data);
    }
}

function downloadReport() {
    // In a real implementation, this would generate and download a PDF report
    showToast('Report download feature coming soon', 'info');
}