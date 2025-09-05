-- Add language column to sessions table for Deepgram transcription language support
ALTER TABLE sessions ADD COLUMN language VARCHAR(10) DEFAULT 'en-US';