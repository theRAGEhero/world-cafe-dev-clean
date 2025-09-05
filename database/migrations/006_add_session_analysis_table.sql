-- Migration: Add session analysis table for storing AI analysis results
CREATE TABLE IF NOT EXISTS session_analyses (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    session_id VARCHAR(36) NOT NULL,
    analysis_type ENUM('summary', 'themes', 'sentiment', 'conflicts', 'agreements') NOT NULL,
    analysis_data JSON NOT NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    INDEX idx_session_analyses_session_id (session_id),
    INDEX idx_session_analyses_type (analysis_type),
    UNIQUE KEY unique_session_analysis (session_id, analysis_type)
);