const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');

class Transcription extends BaseModel {
  constructor() {
    super('transcriptions');
  }

  async create(data) {
    const transcriptionData = {
      id: uuidv4(),
      recording_id: data.recordingId,
      session_id: data.sessionId,
      table_id: data.tableId,
      transcript_text: data.transcriptText,
      confidence_score: data.confidenceScore || 0.0,
      language: data.language || 'en',
      word_count: this.countWords(data.transcriptText),
      speaker_segments: JSON.stringify(data.speakerSegments || []),
      timestamps: JSON.stringify(data.timestamps || []),
      created_at: new Date()
    };

    return await super.create(transcriptionData);
  }

  countWords(text) {
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  async findByTableId(tableId) {
    const sql = `
      SELECT 
        tr.*,
        r.filename,
        r.duration_seconds,
        r.created_at as recording_created_at,
        p.name as participant_name
      FROM ${this.tableName} tr
      JOIN recordings r ON tr.recording_id = r.id
      LEFT JOIN participants p ON r.participant_id = p.id
      WHERE tr.table_id = ?
      ORDER BY tr.created_at DESC
    `;
    return await this.db.query(sql, [tableId]);
  }

  async findBySessionId(sessionId) {
    const sql = `
      SELECT 
        tr.*,
        t.table_number,
        t.name as table_name,
        r.filename,
        r.duration_seconds,
        p.name as participant_name
      FROM ${this.tableName} tr
      JOIN tables t ON tr.table_id = t.id
      JOIN recordings r ON tr.recording_id = r.id
      LEFT JOIN participants p ON r.participant_id = p.id
      WHERE tr.session_id = ?
      ORDER BY t.table_number, tr.created_at DESC
    `;
    return await this.db.query(sql, [sessionId]);
  }

  async findByRecordingId(recordingId) {
    return await this.findOneBy('recording_id', recordingId);
  }

  async searchTranscripts(sessionId, searchTerm, limit = 50) {
    const sql = `
      SELECT 
        tr.*,
        t.table_number,
        t.name as table_name,
        MATCH(tr.transcript_text) AGAINST(? IN NATURAL LANGUAGE MODE) as relevance
      FROM ${this.tableName} tr
      JOIN tables t ON tr.table_id = t.id
      WHERE tr.session_id = ? 
        AND MATCH(tr.transcript_text) AGAINST(? IN NATURAL LANGUAGE MODE)
      ORDER BY relevance DESC
      LIMIT ?
    `;
    return await this.db.query(sql, [searchTerm, sessionId, searchTerm, limit]);
  }

  async getTranscriptionStats(sessionId) {
    const sql = `
      SELECT 
        COUNT(*) as total_transcriptions,
        COUNT(DISTINCT table_id) as tables_with_transcriptions,
        COALESCE(SUM(word_count), 0) as total_words,
        COALESCE(AVG(word_count), 0) as avg_words_per_transcription,
        COALESCE(AVG(confidence_score), 0) as avg_confidence,
        COUNT(CASE WHEN confidence_score >= 0.8 THEN 1 END) as high_confidence_transcriptions,
        MAX(created_at) as latest_transcription
      FROM ${this.tableName}
      WHERE session_id = ?
    `;
    return await this.db.queryOne(sql, [sessionId]);
  }

  async getTableTranscriptionStats(tableId) {
    const sql = `
      SELECT 
        COUNT(*) as total_transcriptions,
        COALESCE(SUM(word_count), 0) as total_words,
        COALESCE(AVG(word_count), 0) as avg_words,
        COALESCE(AVG(confidence_score), 0) as avg_confidence,
        MIN(created_at) as first_transcription,
        MAX(created_at) as latest_transcription
      FROM ${this.tableName}
      WHERE table_id = ?
    `;
    return await this.db.queryOne(sql, [tableId]);
  }

  async getCombinedTranscript(tableId, separator = '\n\n---\n\n') {
    const transcriptions = await this.findByTableId(tableId);
    return transcriptions.map(tr => tr.transcript_text).join(separator);
  }

  async getSessionCombinedTranscripts(sessionId) {
    const sql = `
      SELECT 
        t.id as table_id,
        t.table_number,
        t.name as table_name,
        GROUP_CONCAT(tr.transcript_text ORDER BY tr.created_at SEPARATOR '\n\n---\n\n') as combined_transcript,
        COUNT(tr.id) as transcript_count,
        SUM(tr.word_count) as total_words
      FROM tables t
      LEFT JOIN ${this.tableName} tr ON t.id = tr.table_id
      WHERE t.session_id = ?
      GROUP BY t.id
      ORDER BY t.table_number
    `;
    return await this.db.query(sql, [sessionId]);
  }

  async findWithSpeakerSegments(transcriptionId) {
    const transcription = await this.findById(transcriptionId);
    if (transcription && transcription.speaker_segments) {
      transcription.speaker_segments = JSON.parse(transcription.speaker_segments);
    }
    if (transcription && transcription.timestamps) {
      transcription.timestamps = JSON.parse(transcription.timestamps);
    }
    return transcription;
  }

  async updateConfidence(transcriptionId, confidenceScore) {
    return await this.update(transcriptionId, {
      confidence_score: confidenceScore,
      updated_at: new Date()
    });
  }

  async findLowConfidenceTranscriptions(sessionId, threshold = 0.5) {
    const sql = `
      SELECT 
        tr.*,
        t.table_number,
        t.name as table_name,
        r.filename
      FROM ${this.tableName} tr
      JOIN tables t ON tr.table_id = t.id
      JOIN recordings r ON tr.recording_id = r.id
      WHERE tr.session_id = ? AND tr.confidence_score < ?
      ORDER BY tr.confidence_score ASC
    `;
    return await this.db.query(sql, [sessionId, threshold]);
  }

  async findByLanguage(language, limit = 100) {
    const sql = `
      SELECT tr.*, t.table_number, t.name as table_name
      FROM ${this.tableName} tr
      JOIN tables t ON tr.table_id = t.id
      WHERE tr.language = ?
      ORDER BY tr.created_at DESC
      LIMIT ?
    `;
    return await this.db.query(sql, [language, limit]);
  }

  async getWordFrequency(sessionId, minFrequency = 5) {
    const transcriptions = await this.findBySessionId(sessionId);
    const wordCounts = {};
    
    transcriptions.forEach(tr => {
      const words = tr.transcript_text
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(word => word.length > 3); // Filter out short words
        
      words.forEach(word => {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      });
    });
    
    return Object.entries(wordCounts)
      .filter(([word, count]) => count >= minFrequency)
      .sort(([,a], [,b]) => b - a)
      .map(([word, count]) => ({ word, count }));
  }

  async exportTableTranscripts(tableId, format = 'json') {
    const transcriptions = await this.findByTableId(tableId);
    
    if (format === 'text') {
      return transcriptions.map(tr => 
        `[${tr.recording_created_at}] ${tr.participant_name || 'Unknown'}: ${tr.transcript_text}`
      ).join('\n\n');
    }
    
    return transcriptions;
  }
}

module.exports = new Transcription();