const BaseModel = require('./BaseModel');

class Table extends BaseModel {
  constructor() {
    super('tables');
  }

  async createTablesForSession(sessionId, tableCount) {
    const tables = [];
    for (let i = 1; i <= tableCount; i++) {
      tables.push({
        session_id: sessionId,
        table_number: i,
        name: `Table ${i}`,
        status: 'waiting',
        max_size: 5,
        created_at: new Date(),
        updated_at: new Date()
      });
    }
    
    await this.batchCreate(tables);
    return await this.findBySessionId(sessionId);
  }

  async findBySessionId(sessionId) {
    const sql = `SELECT * FROM ${this.tableName} WHERE session_id = ? ORDER BY table_number`;
    return await this.db.query(sql, [sessionId]);
  }

  async findBySessionAndNumber(sessionId, tableNumber) {
    const sql = `SELECT * FROM ${this.tableName} WHERE session_id = ? AND table_number = ?`;
    return await this.db.queryOne(sql, [sessionId, tableNumber]);
  }

  async findWithParticipants(tableId) {
    const sql = `
      SELECT 
        t.*,
        JSON_ARRAYAGG(
          CASE WHEN p.id IS NOT NULL THEN
            JSON_OBJECT(
              'id', p.id,
              'name', p.name,
              'is_facilitator', p.is_facilitator,
              'joined_at', p.joined_at
            )
          END
        ) as participants
      FROM ${this.tableName} t
      LEFT JOIN participants p ON t.id = p.table_id AND p.left_at IS NULL
      WHERE t.id = ?
      GROUP BY t.id
    `;
    return await this.db.queryOne(sql, [tableId]);
  }

  async findSessionTablesWithStats(sessionId) {
    const sql = `
      SELECT 
        t.*,
        COUNT(DISTINCT p.id) as participant_count,
        COUNT(DISTINCT r.id) as recording_count,
        COUNT(DISTINCT tr.id) as transcription_count,
        JSON_ARRAYAGG(
          CASE WHEN p.id IS NOT NULL THEN
            JSON_OBJECT(
              'id', p.id,
              'name', p.name,
              'is_facilitator', p.is_facilitator,
              'joined_at', p.joined_at
            )
          END
        ) as participants
      FROM ${this.tableName} t
      LEFT JOIN participants p ON t.id = p.table_id AND p.left_at IS NULL
      LEFT JOIN recordings r ON t.id = r.table_id
      LEFT JOIN transcriptions tr ON t.id = tr.table_id
      WHERE t.session_id = ?
      GROUP BY t.id
      ORDER BY t.table_number
    `;
    return await this.db.query(sql, [sessionId]);
  }

  async updateStatus(tableId, status) {
    return await this.update(tableId, { 
      status, 
      updated_at: new Date() 
    });
  }

  async updateTopic(tableId, topic) {
    return await this.update(tableId, { 
      current_topic: topic, 
      updated_at: new Date() 
    });
  }

  async updateFacilitator(tableId, participantId) {
    return await this.update(tableId, { 
      facilitator_id: participantId, 
      updated_at: new Date() 
    });
  }

  async getTableStats(tableId) {
    const sql = `
      SELECT 
        t.*,
        COUNT(DISTINCT p.id) as participant_count,
        COUNT(DISTINCT CASE WHEN p.is_facilitator = 1 THEN p.id END) as facilitator_count,
        COUNT(DISTINCT r.id) as recording_count,
        COUNT(DISTINCT tr.id) as transcription_count,
        COALESCE(SUM(r.duration_seconds), 0) as total_recording_duration,
        COALESCE(SUM(tr.word_count), 0) as total_words
      FROM ${this.tableName} t
      LEFT JOIN participants p ON t.id = p.table_id AND p.left_at IS NULL
      LEFT JOIN recordings r ON t.id = r.table_id
      LEFT JOIN transcriptions tr ON t.id = tr.table_id
      WHERE t.id = ?
      GROUP BY t.id
    `;
    return await this.db.queryOne(sql, [tableId]);
  }

  async findAvailableTables(sessionId, maxSize = null) {
    let sql = `
      SELECT t.*, COUNT(p.id) as current_participants
      FROM ${this.tableName} t
      LEFT JOIN participants p ON t.id = p.table_id AND p.left_at IS NULL
      WHERE t.session_id = ?
      GROUP BY t.id
    `;
    
    if (maxSize) {
      sql += ` HAVING current_participants < ?`;
      return await this.db.query(sql, [sessionId, maxSize]);
    } else {
      sql += ` HAVING current_participants < t.max_size`;
      return await this.db.query(sql, [sessionId]);
    }
  }

  async findByQRCode(qrCode) {
    const sql = `
      SELECT t.* FROM ${this.tableName} t 
      JOIN qr_codes q ON CAST(t.id AS CHAR) = q.entity_id 
      WHERE q.entity_type = 'table' AND q.qr_data = ? AND q.is_active = 1
    `;
    return await this.db.queryOne(sql, [qrCode]);
  }
}

module.exports = new Table();