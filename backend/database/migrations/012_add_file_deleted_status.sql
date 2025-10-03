-- Add 'file_deleted' status to recordings table and make file_path nullable
ALTER TABLE recordings MODIFY COLUMN status ENUM('uploaded', 'processing', 'completed', 'failed', 'file_deleted') DEFAULT 'uploaded';
ALTER TABLE recordings MODIFY COLUMN file_path VARCHAR(500) NULL;