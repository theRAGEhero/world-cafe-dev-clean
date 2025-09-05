const { v4: uuidv4 } = require('uuid');

class SessionAnalysis {
  constructor(db) {
    this.db = db;
  }

  async create(sessionId, analysisType, analysisData, metadata = null) {
    const id = uuidv4();
    
    // Properly serialize the data
    const serializedAnalysisData = typeof analysisData === 'string' ? 
      analysisData : JSON.stringify(analysisData);
    const serializedMetadata = metadata ? 
      (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;
    
    await this.db.query(`
      INSERT INTO session_analyses (id, session_id, analysis_type, analysis_data, metadata) 
      VALUES (?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        analysis_data = VALUES(analysis_data),
        metadata = VALUES(metadata),
        updated_at = CURRENT_TIMESTAMP
    `, [id, sessionId, analysisType, serializedAnalysisData, serializedMetadata]);
    
    return {
      id,
      session_id: sessionId,
      analysis_type: analysisType,
      analysis_data: analysisData,
      metadata: metadata,
      created_at: new Date(),
      updated_at: new Date()
    };
  }

  async findById(id) {
    const results = await this.db.query(
      'SELECT * FROM session_analyses WHERE id = ?',
      [id]
    );
    
    if (results.length > 0) {
      const analysis = results[0];
      // Parse JSON fields
      if (analysis.analysis_data) {
        analysis.analysis_data = JSON.parse(analysis.analysis_data);
      }
      if (analysis.metadata) {
        analysis.metadata = JSON.parse(analysis.metadata);
      }
      return analysis;
    }
    return null;
  }

  async findBySessionId(sessionId) {
    const results = await this.db.query(
      'SELECT * FROM session_analyses WHERE session_id = ? ORDER BY created_at DESC',
      [sessionId]
    );
    
    return results.map(analysis => {
      // Parse JSON fields
      if (analysis.analysis_data) {
        analysis.analysis_data = JSON.parse(analysis.analysis_data);
      }
      if (analysis.metadata) {
        analysis.metadata = JSON.parse(analysis.metadata);
      }
      return analysis;
    });
  }

  async findBySessionAndType(sessionId, analysisType) {
    const results = await this.db.query(
      'SELECT * FROM session_analyses WHERE session_id = ? AND analysis_type = ? ORDER BY created_at DESC LIMIT 1',
      [sessionId, analysisType]
    );
    
    if (results.length > 0) {
      const analysis = results[0];
      // Parse JSON fields
      if (analysis.analysis_data) {
        analysis.analysis_data = JSON.parse(analysis.analysis_data);
      }
      if (analysis.metadata) {
        analysis.metadata = JSON.parse(analysis.metadata);
      }
      return analysis;
    }
    return null;
  }

  async deleteById(id) {
    await this.db.query('DELETE FROM session_analyses WHERE id = ?', [id]);
    return true;
  }

  async deleteBySessionId(sessionId) {
    await this.db.query('DELETE FROM session_analyses WHERE session_id = ?', [sessionId]);
    return true;
  }
}

module.exports = SessionAnalysis;