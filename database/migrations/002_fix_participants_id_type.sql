-- Migration: Fix participants table id column type
-- Date: 2025-08-27
-- Description: Change id column from int to VARCHAR(36) to support UUIDs

-- Step 1: Drop foreign key constraint that references participants.id
ALTER TABLE recordings DROP FOREIGN KEY recordings_ibfk_3;

-- Step 2: Update participant_id column to match new type
ALTER TABLE recordings MODIFY COLUMN participant_id VARCHAR(36) NULL;

-- Step 3: Change the participants.id column type to VARCHAR(36) for UUID support
ALTER TABLE participants MODIFY COLUMN id VARCHAR(36) NOT NULL;

-- Step 4: Recreate foreign key constraint
ALTER TABLE recordings ADD CONSTRAINT recordings_ibfk_3 FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL;