-- Create activity_logs table for comprehensive logging and auditing
CREATE TABLE activity_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    action VARCHAR(100) NOT NULL,
    details TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id VARCHAR(255),
    session_id VARCHAR(255),
    table_id INT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    INDEX idx_action (action),
    INDEX idx_timestamp (timestamp),
    INDEX idx_user_id (user_id),
    INDEX idx_session_id (session_id),
    INDEX idx_table_id (table_id)
);