# World Café Platform - Database Structure Analysis

## Overview
The World Café Platform uses a MySQL 8.0 database named `world_cafe_platform` to manage digital World Café sessions with recording and analysis capabilities.

## Database Schema Summary

### Core Tables
- **sessions**: Main container for World Café sessions
- **tables**: Individual tables within sessions
- **participants**: Users participating in sessions
- **recordings**: Audio recording metadata
- **transcriptions**: Text transcripts from audio
- **qr_codes**: QR code management for easy joining
- **session_analyses**: AI-generated analysis results
- **session_history**: Audit trail for session changes
- **global_settings**: Platform configuration
- **migrations**: Database version control

## Detailed Table Structure

### 1. Sessions Table
```sql
sessions (
    id VARCHAR(36) PRIMARY KEY,           -- UUID
    title VARCHAR(255) NOT NULL,
    description TEXT,
    table_count INT DEFAULT 20,
    max_participants INT DEFAULT 100,
    status ENUM('active','paused','closed','completed','archived','deleted'),
    session_duration INT DEFAULT 120,     -- minutes
    rotation_enabled TINYINT(1) DEFAULT 0,
    recording_enabled TINYINT(1) DEFAULT 1,
    language VARCHAR(10) DEFAULT 'en-US',
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    closed_at TIMESTAMP NULL,
    closed_by VARCHAR(100),
    deleted_at TIMESTAMP NULL,
    deleted_by VARCHAR(100),
    admin_notes TEXT
)
```
**Purpose**: Central hub for organizing World Café sessions
**Key Features**: 
- Soft delete capability (deleted_at field)
- Multi-language support
- Configurable duration and participant limits
- Status tracking through lifecycle

### 2. Tables Table
```sql
tables (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    table_number INT NOT NULL,
    name VARCHAR(255) DEFAULT 'Table',
    status ENUM('waiting','active','inactive','full'),
    max_size INT DEFAULT 6,
    facilitator_id VARCHAR(36),
    current_topic VARCHAR(500),
    qr_code_url VARCHAR(500),
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE KEY (session_id, table_number)
)
```
**Purpose**: Individual discussion tables within sessions
**Key Features**: 
- Each table has its own QR code for joining
- Facilitator assignment capability
- Dynamic topic assignment
- Capacity management

### 3. Participants Table
```sql
participants (
    id VARCHAR(36) PRIMARY KEY,          -- UUID
    session_id VARCHAR(36) NOT NULL,
    table_id INT,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    is_facilitator TINYINT(1) DEFAULT 0,
    joined_at TIMESTAMP,
    left_at TIMESTAMP NULL,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE SET NULL
)
```
**Purpose**: User management and session participation tracking
**Key Features**: 
- Optional contact information
- Join/leave timestamps for attendance tracking
- Facilitator role designation
- Can move between tables (nullable table_id)

### 4. Recordings Table
```sql
recordings (
    id VARCHAR(36) PRIMARY KEY,          -- UUID
    session_id VARCHAR(36) NOT NULL,
    table_id INT NOT NULL,
    participant_id VARCHAR(36),          -- Who initiated recording
    filename VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    duration_seconds DECIMAL(10,2),
    mime_type VARCHAR(100),
    status ENUM('uploaded','processing','completed','failed'),
    created_at TIMESTAMP,
    processed_at TIMESTAMP NULL,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
    FOREIGN KEY (participant_id) REFERENCES participants(id) ON DELETE SET NULL
)
```
**Purpose**: Audio recording metadata and processing status
**Key Features**: 
- Processing pipeline tracking
- File metadata storage
- Participant attribution
- Multiple format support

### 5. Transcriptions Table
```sql
transcriptions (
    id VARCHAR(36) PRIMARY KEY,          -- UUID
    session_id VARCHAR(36) NOT NULL,
    table_id INT NOT NULL,
    recording_id VARCHAR(36),
    transcript_text LONGTEXT,
    confidence_score DECIMAL(5,4),
    language VARCHAR(10) DEFAULT 'en',
    word_count INT DEFAULT 0,
    speaker_segments LONGTEXT (JSON),    -- Speaker diarization
    timestamps LONGTEXT (JSON),          -- Word-level timing
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
)
```
**Purpose**: AI-generated transcripts with advanced features
**Key Features**: 
- Speaker identification and segmentation
- Confidence scoring for quality assessment
- Word-level timestamps for precise navigation
- Multi-language support

### 6. Session Analyses Table
```sql
session_analyses (
    id VARCHAR(36) PRIMARY KEY,          -- UUID
    session_id VARCHAR(36) NOT NULL,
    analysis_type ENUM('summary','themes','sentiment','conflicts','agreements'),
    analysis_data LONGTEXT (JSON),       -- Structured results
    metadata LONGTEXT (JSON),            -- Processing metadata
    created_at TIMESTAMP,
    updated_at TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    UNIQUE KEY (session_id, analysis_type)
)
```
**Purpose**: AI-generated analysis results storage
**Key Features**: 
- Multiple analysis types supported
- Structured JSON data for flexible reporting
- One analysis per type per session constraint
- Metadata for processing transparency

### 7. QR Codes Table
```sql
qr_codes (
    id VARCHAR(36) PRIMARY KEY,          -- UUID
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(100) NOT NULL,
    qr_data TEXT NOT NULL,
    image_path VARCHAR(500),
    is_active TINYINT(1) DEFAULT 1,
    expires_at TIMESTAMP NULL,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
```
**Purpose**: QR code management for easy access
**Key Features**: 
- Generic entity linking (sessions, tables, etc.)
- Image file management
- Expiration capability
- Active/inactive status control

### 8. Session History Table
```sql
session_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    action ENUM('created','closed','reopened','deleted','restored'),
    admin_user VARCHAR(100) DEFAULT 'admin',
    reason TEXT,
    previous_status VARCHAR(50),
    new_status VARCHAR(50),
    created_at TIMESTAMP,
    
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
)
```
**Purpose**: Audit trail for session lifecycle management
**Key Features**: 
- Complete action history
- Admin user tracking
- Status change logging
- Reason documentation

### 9. Global Settings Table
```sql
global_settings (
    setting_key VARCHAR(255) PRIMARY KEY,
    setting_value TEXT,
    encrypted TINYINT(1) DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
)
```
**Purpose**: Platform-wide configuration management
**Key Features**: 
- Key-value storage
- Optional encryption for sensitive data
- Self-documenting with descriptions
- Version tracking with timestamps

### 10. Migrations Table
```sql
migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    executed_at TIMESTAMP
)
```
**Purpose**: Database version control and migration tracking

## Entity Relationships

### Primary Relationships
```
sessions (1) ←→ (N) tables
sessions (1) ←→ (N) participants  
sessions (1) ←→ (N) recordings
sessions (1) ←→ (N) transcriptions
sessions (1) ←→ (N) session_analyses
sessions (1) ←→ (N) session_history

tables (1) ←→ (N) participants
tables (1) ←→ (N) recordings  
tables (1) ←→ (N) transcriptions

recordings (1) ←→ (1) transcriptions

participants (1) ←→ (N) recordings (as initiator)
participants (1) ←→ (1) tables (as facilitator)
```

### Relationship Details

#### Session → Tables (1:N)
- **Cascade Delete**: When a session is deleted, all its tables are removed
- **Constraint**: Each table must belong to exactly one session
- **Business Rule**: Table numbers are unique within a session

#### Tables → Participants (1:N)
- **Set NULL**: When a table is deleted, participants remain but lose table assignment
- **Business Rule**: Participants can move between tables during a session

#### Tables → Recordings (1:N)
- **Cascade Delete**: Table recordings are removed with the table
- **Business Rule**: Each recording belongs to exactly one table and session

#### Recordings → Transcriptions (1:1)
- **Cascade Delete**: Transcription is removed when recording is deleted
- **Business Rule**: Each recording can have one transcription

#### Participants → Tables (N:1) - Facilitator Relationship
- **Set NULL**: When facilitator is removed, table loses facilitator assignment
- **Business Rule**: Each table can have at most one facilitator

## Indexes and Performance

### Primary Indexes
- All tables have appropriate primary keys (UUIDs for main entities, AUTO_INCREMENT for junction tables)

### Foreign Key Indexes
- All foreign key columns are indexed for join performance
- Composite indexes on frequently queried combinations

### Business Logic Indexes
- `idx_sessions_status` - Fast filtering by session status
- `idx_sessions_deleted_at` - Soft delete queries
- `unique_session_table` - Prevents duplicate table numbers per session

## Data Flow

### Session Lifecycle
1. **Session Creation**: New record in `sessions` table with status 'active'
2. **Table Setup**: Bulk creation of `tables` records based on `table_count`
3. **Participant Registration**: Users join via QR codes, creating `participants` records
4. **Recording Process**: Audio uploads create `recordings` with processing status
5. **Transcription**: AI processing creates `transcriptions` linked to recordings
6. **Analysis**: LLM analysis creates `session_analyses` with structured insights
7. **Session Completion**: Status updates tracked in `session_history`

### Data Dependencies
- Sessions must exist before tables can be created
- Participants need sessions to join (tables are optional for initial registration)
- Recordings require both session and table context
- Transcriptions are dependent on successful recordings
- Analyses require sufficient transcription data

## Security Considerations

### Data Protection
- **Soft Deletes**: Sessions use `deleted_at` field instead of hard deletes
- **Encryption Support**: Global settings can be encrypted for sensitive configuration
- **Audit Trail**: Complete session history for accountability

### Access Control
- No built-in user authentication table (handled at application level)
- Admin operations tracked with user identification
- QR codes have expiration capability for time-limited access

## Storage Estimates

### Space Requirements (Approximate)
- **Sessions**: ~500 bytes per session
- **Tables**: ~200 bytes per table (typically 20 per session)
- **Participants**: ~300 bytes per participant
- **Recordings**: Metadata only (~400 bytes), actual files stored separately
- **Transcriptions**: Variable (1-10KB per recording depending on length)
- **Analyses**: 5-50KB per analysis depending on session complexity

### Growth Projections
For 100 active sessions with average 50 participants each:
- Core data: ~50MB
- Transcriptions: ~25MB
- Analyses: ~12.5MB
- **Total Database**: ~87.5MB (excluding audio files)

## Migration History

The database includes 7 migrations that have evolved the schema:
1. `001_add_email_column.sql` - Added email field to participants
2. `002_fix_participants_id_type.sql` - Updated participant ID type
3. `003_add_tables_facilitator_columns.sql` - Enhanced table management
4. `004_fix_recordings_table.sql` - Improved recording metadata
5. `005_add_sessions_language_column.sql` - Multi-language support
6. `006_add_session_analysis_table.sql` - AI analysis capability
7. `007_add_global_settings_table.sql` - Platform configuration

## Recommendations

### Performance Optimization
1. **Archival Strategy**: Implement automated archival for completed sessions older than 6 months
2. **Index Optimization**: Add composite indexes for common query patterns
3. **Partitioning**: Consider date-based partitioning for large transcription tables

### Data Integrity
1. **Constraints**: Add more check constraints for business rules
2. **Triggers**: Implement triggers for automatic timestamp updates
3. **Validation**: Add application-level validation for complex business logic

### Scalability
1. **Read Replicas**: Consider read replicas for reporting and analysis queries
2. **Caching**: Implement Redis caching for frequently accessed session data
3. **File Storage**: Move to cloud storage (S3) for audio files and QR code images