-- World Café Platform Database Schema
-- MySQL/MariaDB compatible

CREATE DATABASE IF NOT EXISTS world_cafe_platform;
USE world_cafe_platform;

-- Sessions table - main container for World Café sessions
CREATE TABLE sessions (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    table_count INT NOT NULL DEFAULT 20,
    max_participants INT NOT NULL DEFAULT 100,
    status ENUM('active', 'paused', 'completed', 'archived') DEFAULT 'active',
    qr_code_url VARCHAR(500),
    session_duration INT DEFAULT 120, -- minutes
    rotation_enabled BOOLEAN DEFAULT FALSE,
    recording_enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Tables within sessions - each table can have participants and recordings
CREATE TABLE tables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    table_number INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    status ENUM('waiting', 'recording', 'completed', 'paused') DEFAULT 'waiting',
    current_topic VARCHAR(500),
    facilitator_id VARCHAR(36) NULL,
    max_size INT DEFAULT 5,
    qr_code_url VARCHAR(500), -- Individual table QR codes
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_table_per_session (session_id, table_number),
    INDEX idx_session_status (session_id, status)
);

-- Participants in the platform
CREATE TABLE participants (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(20) NULL,
    session_id VARCHAR(36) NOT NULL,
    table_id INT NOT NULL,
    is_facilitator BOOLEAN DEFAULT FALSE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
    INDEX idx_session_table (session_id, table_id),
    INDEX idx_joined_at (joined_at)
);

-- Audio recordings metadata
CREATE TABLE recordings (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    table_id INT NOT NULL,
    participant_id VARCHAR(36) NULL, -- who initiated the recording
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    duration_seconds DECIMAL(10,2),
    mime_type VARCHAR(100),
    status ENUM('uploaded', 'processing', 'completed', 'failed') DEFAULT 'uploaded',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL,
    INDEX idx_table_recordings (table_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);

-- Transcriptions - table-specific transcripts from audio
CREATE TABLE transcriptions (
    id VARCHAR(36) PRIMARY KEY,
    recording_id VARCHAR(36) NOT NULL,
    session_id VARCHAR(36) NOT NULL,
    table_id INT NOT NULL,
    transcript_text TEXT NOT NULL,
    confidence_score DECIMAL(3,2) DEFAULT 0.0,
    language VARCHAR(10) DEFAULT 'en',
    word_count INT DEFAULT 0,
    speaker_segments JSON, -- Store speaker diarization data
    timestamps JSON, -- Store word-level timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
    INDEX idx_table_transcriptions (table_id),
    INDEX idx_session_transcriptions (session_id),
    FULLTEXT idx_transcript_search (transcript_text)
);

-- Analysis results from LLM processing
CREATE TABLE analysis_results (
    id VARCHAR(36) PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    analysis_type ENUM('conflicts', 'agreements', 'themes', 'sentiment', 'full_report') NOT NULL,
    results JSON NOT NULL, -- Store structured analysis results
    llm_model VARCHAR(100), -- Which model was used
    prompt_version VARCHAR(50),
    confidence_score DECIMAL(3,2) DEFAULT 0.0,
    processing_time_ms INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    INDEX idx_session_analysis (session_id, analysis_type),
    INDEX idx_created_at (created_at)
);

-- QR codes for easy joining (separate table for better management)
CREATE TABLE qr_codes (
    id VARCHAR(36) PRIMARY KEY,
    entity_type ENUM('session', 'table') NOT NULL,
    entity_id VARCHAR(100) NOT NULL, -- session_id or table_id
    qr_data TEXT NOT NULL, -- URL or data encoded in QR
    image_path VARCHAR(500), -- Path to generated QR code image
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_active (is_active)
);

-- Session settings and configuration
CREATE TABLE session_settings (
    session_id VARCHAR(36) PRIMARY KEY,
    recording_auto_start BOOLEAN DEFAULT FALSE,
    transcription_auto_start BOOLEAN DEFAULT TRUE,
    analysis_auto_trigger BOOLEAN DEFAULT FALSE,
    notification_enabled BOOLEAN DEFAULT TRUE,
    max_recording_duration INT DEFAULT 3600, -- seconds
    allowed_file_types JSON DEFAULT ('["wav", "mp3", "mp4", "m4a", "webm", "ogg"]'),
    custom_prompts JSON, -- Custom LLM analysis prompts
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Activity log for auditing and debugging
CREATE TABLE activity_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36),
    table_id INT NULL,
    participant_id VARCHAR(36) NULL,
    action_type VARCHAR(100) NOT NULL,
    action_data JSON,
    ip_address VARCHAR(45), -- Support IPv6
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL,
    INDEX idx_session_activity (session_id),
    INDEX idx_action_type (action_type),
    INDEX idx_created_at (created_at)
);

-- Create indexes for better performance
CREATE INDEX idx_sessions_active ON sessions(status, created_at) WHERE status = 'active';
CREATE INDEX idx_tables_recording ON tables(status, updated_at) WHERE status = 'recording';
CREATE INDEX idx_recent_transcriptions ON transcriptions(created_at DESC, table_id);

-- Create views for common queries
CREATE VIEW active_sessions AS
SELECT 
    s.*,
    COUNT(DISTINCT t.id) as active_tables,
    COUNT(DISTINCT p.id) as total_participants,
    COUNT(DISTINCT tr.id) as total_transcriptions
FROM sessions s
LEFT JOIN tables t ON s.id = t.session_id AND t.status IN ('recording', 'completed')
LEFT JOIN participants p ON s.id = p.session_id AND p.left_at IS NULL
LEFT JOIN transcriptions tr ON s.id = tr.session_id
WHERE s.status = 'active'
GROUP BY s.id;

CREATE VIEW table_status_summary AS
SELECT 
    t.*,
    COUNT(p.id) as participant_count,
    COUNT(r.id) as recording_count,
    COUNT(tr.id) as transcription_count,
    s.title as session_title
FROM tables t
LEFT JOIN participants p ON t.id = p.table_id AND p.left_at IS NULL
LEFT JOIN recordings r ON t.id = r.table_id
LEFT JOIN transcriptions tr ON t.id = tr.table_id
LEFT JOIN sessions s ON t.session_id = s.id
GROUP BY t.id;