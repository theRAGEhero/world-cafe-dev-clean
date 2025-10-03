-- Update transcriptions source ENUM to include missing values for live-audio and reprocess functionality
ALTER TABLE transcriptions 
MODIFY COLUMN source ENUM('start-recording', 'upload-media', 'live-transcription', 'live-audio', 'reprocess') DEFAULT 'start-recording';