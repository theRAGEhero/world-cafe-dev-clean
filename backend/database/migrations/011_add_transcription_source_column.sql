-- Add source column to transcriptions table to track recording method
ALTER TABLE transcriptions 
ADD COLUMN source ENUM('start-recording', 'upload-media', 'live-transcription') DEFAULT 'start-recording' AFTER recording_id;