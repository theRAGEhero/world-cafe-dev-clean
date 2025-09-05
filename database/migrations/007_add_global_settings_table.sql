-- Add global settings table for API keys and platform configuration
CREATE TABLE IF NOT EXISTS global_settings (
    setting_key VARCHAR(255) PRIMARY KEY,
    setting_value TEXT,
    encrypted BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default settings
INSERT INTO global_settings (setting_key, setting_value, description) VALUES 
('deepgram_api_key', NULL, 'Deepgram API key for speech-to-text transcription'),
('groq_api_key', NULL, 'Groq API key for LLM analysis'),
('admin_password', 'admin123', 'Admin panel password'),
('platform_initialized', 'true', 'Whether the platform has been initialized')
ON DUPLICATE KEY UPDATE setting_key = setting_key;