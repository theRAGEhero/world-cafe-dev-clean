const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');

class Recording extends BaseModel {
  constructor() {
    super('recordings');
  }

  async create(data) {
    const recordingData = {
      id: uuidv4(),
      session_id: data.sessionId,
      table_id: data.tableId,
      participant_id: data.participantId || null,
      filename: data.filename,
      file_path: data.filePath,
      file_size: data.fileSize || null,
      duration_seconds: data.duration || null,
      mime_type: data.mimeType || null,
      status: 'uploaded',
      created_at: new Date()
    };

    return await super.create(recordingData);
  }

  async updateStatus(recordingId, status, processedAt = null) {
    const updateData = { 
      status, 
      updated_at: new Date()
    };
    
    if (processedAt || status === 'completed') {
      updateData.processed_at = processedAt || new Date();
    }
    
    return await this.update(recordingId, updateData);
  }

  async findByTableId(tableId) {
    const sql = `
      SELECT r.*, p.name as participant_name 
      FROM ${this.tableName} r
      LEFT JOIN participants p ON r.participant_id = p.id
      WHERE r.table_id = ? 
      ORDER BY r.created_at DESC
    `;
    return await this.db.query(sql, [tableId]);
  }

  async findBySessionId(sessionId) {
    const sql = `
      SELECT 
        r.*,
        t.table_number,
        t.name as table_name,
        p.name as participant_name
      FROM ${this.tableName} r
      JOIN tables t ON r.table_id = t.id
      LEFT JOIN participants p ON r.participant_id = p.id
      WHERE r.session_id = ? 
      ORDER BY r.created_at DESC
    `;
    return await this.db.query(sql, [sessionId]);
  }

  async findPendingTranscription() {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE status IN ('uploaded', 'processing') 
      ORDER BY created_at ASC
    `;
    return await this.db.query(sql);
  }

  async getRecordingStats(sessionId) {
    const sql = `
      SELECT 
        COUNT(*) as total_recordings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_recordings,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_recordings,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_recordings,
        COALESCE(SUM(duration_seconds), 0) as total_duration,
        COALESCE(SUM(file_size), 0) as total_file_size,
        COUNT(DISTINCT table_id) as tables_with_recordings
      FROM ${this.tableName}
      WHERE session_id = ?
    `;
    return await this.db.queryOne(sql, [sessionId]);
  }

  async getTableRecordingStats(tableId) {
    const sql = `
      SELECT 
        COUNT(*) as total_recordings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_recordings,
        COALESCE(SUM(duration_seconds), 0) as total_duration,
        COALESCE(AVG(duration_seconds), 0) as avg_duration,
        MAX(created_at) as latest_recording
      FROM ${this.tableName}
      WHERE table_id = ?
    `;
    return await this.db.queryOne(sql, [tableId]);
  }

  async findWithTranscription(recordingId) {
    const sql = `
      SELECT 
        r.*,
        t.table_number,
        t.name as table_name,
        p.name as participant_name,
        tr.id as transcription_id,
        tr.transcript_text,
        tr.confidence_score,
        tr.word_count,
        tr.speaker_segments
      FROM ${this.tableName} r
      JOIN tables t ON r.table_id = t.id
      LEFT JOIN participants p ON r.participant_id = p.id
      LEFT JOIN transcriptions tr ON r.id = tr.recording_id
      WHERE r.id = ?
    `;
    return await this.db.queryOne(sql, [recordingId]);
  }

  async markProcessing(recordingId) {
    return await this.updateStatus(recordingId, 'processing');
  }

  async markCompleted(recordingId) {
    return await this.updateStatus(recordingId, 'completed', new Date());
  }

  async markFailed(recordingId) {
    return await this.updateStatus(recordingId, 'failed');
  }

  async updateDuration(recordingId, durationSeconds) {
    return await this.update(recordingId, { 
      duration_seconds: durationSeconds,
      updated_at: new Date()
    });
  }

  async findByStatus(status, limit = 50) {
    const sql = `
      SELECT r.*, t.table_number, t.name as table_name
      FROM ${this.tableName} r
      JOIN tables t ON r.table_id = t.id
      WHERE r.status = ?
      ORDER BY r.created_at ASC
      LIMIT ?
    `;
    return await this.db.query(sql, [status, limit]);
  }

  async cleanupOldRecordings(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE created_at < ? AND status IN ('completed', 'failed')
    `;
    const oldRecordings = await this.db.query(sql, [cutoffDate]);
    
    // This would typically include file system cleanup
    // For now, just mark them for cleanup
    await this.db.query(`
      UPDATE ${this.tableName} 
      SET status = 'archived' 
      WHERE created_at < ? AND status IN ('completed', 'failed')
    `, [cutoffDate]);
    
    return oldRecordings.length;
  }
}

module.exports = new Recording();