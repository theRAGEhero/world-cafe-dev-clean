const { v4: uuidv4 } = require('uuid');

class SessionAnalysis {
  constructor(db) {
    this.db = db;
  }

  async create(sessionId, analysisType, analysisData, metadata = null, tableId = null, analysisScope = 'session') {
    const id = uuidv4();
    
    // Properly serialize the data
    const serializedAnalysisData = typeof analysisData === 'string' ? 
      analysisData : JSON.stringify(analysisData);
    const serializedMetadata = metadata ? 
      (typeof metadata === 'string' ? metadata : JSON.stringify(metadata)) : null;
    
    await this.db.query(`
      INSERT INTO session_analyses (id, session_id, table_id, analysis_scope, analysis_type, analysis_data, metadata) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        analysis_data = VALUES(analysis_data),
        metadata = VALUES(metadata),
        updated_at = CURRENT_TIMESTAMP
    `, [id, sessionId, tableId, analysisScope, analysisType, serializedAnalysisData, serializedMetadata]);
    
    return {
      id,
      session_id: sessionId,
      table_id: tableId,
      analysis_scope: analysisScope,
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

  async findBySessionAndType(sessionId, analysisType, tableId = null, analysisScope = 'session') {
    let query, params;
    
    if (analysisScope === 'table' && tableId !== null) {
      query = 'SELECT * FROM session_analyses WHERE session_id = ? AND table_id = ? AND analysis_type = ? AND analysis_scope = ? ORDER BY created_at DESC LIMIT 1';
      params = [sessionId, tableId, analysisType, analysisScope];
    } else {
      query = 'SELECT * FROM session_analyses WHERE session_id = ? AND analysis_type = ? AND analysis_scope = ? AND table_id IS NULL ORDER BY created_at DESC LIMIT 1';
      params = [sessionId, analysisType, analysisScope];
    }
    
    const results = await this.db.query(query, params);
    
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

  async findByTableId(tableId) {
    const results = await this.db.query(
      'SELECT * FROM session_analyses WHERE table_id = ? AND analysis_scope = ? ORDER BY created_at DESC',
      [tableId, 'table']
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

  async findBySessionScope(sessionId, analysisScope = 'session') {
    let query, params;
    
    if (analysisScope === 'session') {
      query = 'SELECT * FROM session_analyses WHERE session_id = ? AND analysis_scope = ? AND table_id IS NULL ORDER BY created_at DESC';
      params = [sessionId, analysisScope];
    } else {
      query = 'SELECT * FROM session_analyses WHERE session_id = ? AND analysis_scope = ? ORDER BY table_id, created_at DESC';
      params = [sessionId, analysisScope];
    }
    
    const results = await this.db.query(query, params);
    
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