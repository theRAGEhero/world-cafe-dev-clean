const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');

class Session extends BaseModel {
  constructor() {
    super('sessions');
  }

  async create(data) {
    const sessionData = {
      id: uuidv4(),
      title: data.title,
      description: data.description || null,
      language: data.language || 'en-US',
      table_count: data.tableCount || 10,
      status: 'active',
      session_duration: data.sessionDuration || 120,
      rotation_enabled: data.rotationEnabled || false,
      recording_enabled: data.recordingEnabled || true,
      admin_password: data.admin_password || null,
      admin_password_hash: data.admin_password_hash || null,
      created_at: new Date(),
      updated_at: new Date()
    };

    return await super.create(sessionData);
  }

  async findActive() {
    const sql = `SELECT * FROM ${this.tableName} WHERE status = 'active' AND deleted_at IS NULL ORDER BY created_at DESC`;
    return await this.db.query(sql);
  }

  async findAll(includeDeleted = false) {
    let sql = `SELECT * FROM ${this.tableName}`;
    if (!includeDeleted) {
      sql += ` WHERE deleted_at IS NULL`;
    }
    sql += ` ORDER BY created_at DESC`;
    return await this.db.query(sql);
  }

  async findByStatus(status, includeDeleted = false) {
    let sql = `SELECT * FROM ${this.tableName} WHERE status = ?`;
    if (!includeDeleted) {
      sql += ` AND deleted_at IS NULL`;
    }
    sql += ` ORDER BY created_at DESC`;
    return await this.db.query(sql, [status]);
  }

  async findWithStats(sessionId) {
    const sql = `
      SELECT 
        s.*,
        COUNT(DISTINCT t.id) as active_tables,
        COUNT(DISTINCT p.id) as total_participants,
        COUNT(DISTINCT tr.id) as total_transcriptions,
        COUNT(DISTINCT r.id) as total_recordings
      FROM sessions s
      LEFT JOIN tables t ON s.id = t.session_id AND t.status IN ('recording', 'completed')
      LEFT JOIN participants p ON s.id = p.session_id AND p.left_at IS NULL
      LEFT JOIN transcriptions tr ON s.id = tr.session_id
      LEFT JOIN recordings r ON s.id = r.session_id
      WHERE s.id = ?
      GROUP BY s.id
    `;
    return await this.db.queryOne(sql, [sessionId]);
  }

  async updateStatus(sessionId, status) {
    const updateData = { 
      status, 
      updated_at: new Date() 
    };
    
    if (status === 'completed') {
      updateData.completed_at = new Date();
    }
    
    return await this.update(sessionId, updateData);
  }

  async getSessionStats(sessionId) {
    const sql = `
      SELECT 
        s.id,
        s.title,
        s.status,
        s.table_count,
        COUNT(DISTINCT t.id) as active_tables,
        COUNT(DISTINCT CASE WHEN t.status = 'recording' THEN t.id END) as recording_tables,
        COUNT(DISTINCT CASE WHEN t.status = 'completed' THEN t.id END) as completed_tables,
        COUNT(DISTINCT p.id) as total_participants,
        COUNT(DISTINCT r.id) as total_recordings,
        COUNT(DISTINCT tr.id) as total_transcriptions,
        ROUND(AVG(CASE WHEN t.id IS NOT NULL THEN (
          SELECT COUNT(*) FROM participants WHERE table_id = t.id AND left_at IS NULL
        ) END), 1) as avg_table_size
      FROM sessions s
      LEFT JOIN tables t ON s.id = t.session_id
      LEFT JOIN participants p ON s.id = p.session_id AND p.left_at IS NULL
      LEFT JOIN recordings r ON s.id = r.session_id
      LEFT JOIN transcriptions tr ON s.id = tr.session_id
      WHERE s.id = ?
      GROUP BY s.id
    `;
    return await this.db.queryOne(sql, [sessionId]);
  }

  async findByQRCode(qrCode) {
    const sql = `
      SELECT s.* FROM ${this.tableName} s 
      JOIN qr_codes q ON s.id = q.entity_id 
      WHERE q.entity_type = 'session' AND q.qr_data = ? AND q.is_active = 1
    `;
    return await this.db.queryOne(sql, [qrCode]);
  }

  async closeSession(sessionId, adminUser = 'admin', reason = null) {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    if (session.status === 'closed') {
      throw new Error('Session is already closed');
    }
    
    const previousStatus = session.status;
    const updateData = {
      status: 'closed',
      closed_at: new Date(),
      closed_by: adminUser,
      updated_at: new Date()
    };
    
    if (reason) {
      updateData.admin_notes = reason;
    }
    
    // Update session
    await this.update(sessionId, updateData);
    
    // Record in history
    await this.recordSessionHistory(sessionId, 'closed', adminUser, reason, previousStatus, 'closed');
    
    return await this.findById(sessionId);
  }

  async reopenSession(sessionId, adminUser = 'admin', reason = null) {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    if (session.status === 'active') {
      throw new Error('Session is already active');
    }
    
    const previousStatus = session.status;
    const updateData = {
      status: 'active',
      closed_at: null,
      closed_by: null,
      updated_at: new Date()
    };
    
    if (reason) {
      updateData.admin_notes = reason;
    }
    
    // Update session
    await this.update(sessionId, updateData);
    
    // Record in history
    await this.recordSessionHistory(sessionId, 'reopened', adminUser, reason, previousStatus, 'active');
    
    return await this.findById(sessionId);
  }

  async deleteSession(sessionId, adminUser = 'admin', reason = null) {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    if (session.deleted_at) {
      throw new Error('Session is already deleted');
    }
    
    const previousStatus = session.status;
    const updateData = {
      status: 'deleted',
      deleted_at: new Date(),
      deleted_by: adminUser,
      updated_at: new Date()
    };
    
    if (reason) {
      updateData.admin_notes = reason;
    }
    
    // Soft delete - update status instead of actual deletion
    await this.update(sessionId, updateData);
    
    // Record in history
    await this.recordSessionHistory(sessionId, 'deleted', adminUser, reason, previousStatus, 'deleted');
    
    return { success: true, message: 'Session deleted successfully' };
  }

  async restoreSession(sessionId, adminUser = 'admin', reason = null) {
    const session = await this.findById(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }
    
    if (!session.deleted_at) {
      throw new Error('Session is not deleted');
    }
    
    const updateData = {
      status: 'active',
      deleted_at: null,
      deleted_by: null,
      updated_at: new Date()
    };
    
    if (reason) {
      updateData.admin_notes = reason;
    }
    
    // Restore session
    await this.update(sessionId, updateData);
    
    // Record in history
    await this.recordSessionHistory(sessionId, 'restored', adminUser, reason, 'deleted', 'active');
    
    return await this.findById(sessionId);
  }

  async recordSessionHistory(sessionId, action, adminUser, reason, previousStatus, newStatus) {
    const historyData = {
      session_id: sessionId,
      action: action,
      admin_user: adminUser,
      reason: reason,
      previous_status: previousStatus,
      new_status: newStatus,
      created_at: new Date()
    };
    
    const sql = `INSERT INTO session_history (session_id, action, admin_user, reason, previous_status, new_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`;
    return await this.db.query(sql, [sessionId, action, adminUser, reason, previousStatus, newStatus, new Date()]);
  }

  async getSessionHistory(sessionId) {
    const sql = `SELECT * FROM session_history WHERE session_id = ? ORDER BY created_at DESC`;
    return await this.db.query(sql, [sessionId]);
  }

  async getAdminDashboardStats() {
    const sql = `
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'active' AND deleted_at IS NULL THEN 1 END) as active_sessions,
        COUNT(CASE WHEN status = 'closed' AND deleted_at IS NULL THEN 1 END) as closed_sessions,
        COUNT(CASE WHEN status = 'deleted' OR deleted_at IS NOT NULL THEN 1 END) as deleted_sessions,
        COUNT(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND deleted_at IS NULL THEN 1 END) as recent_sessions
      FROM ${this.tableName}
    `;
    return await this.db.queryOne(sql);
  }

  async findByAdminPassword(password) {
    const sql = `SELECT * FROM ${this.tableName} WHERE admin_password = ? AND status = 'active' AND deleted_at IS NULL LIMIT 1`;
    return await this.db.queryOne(sql, [password]);
  }
}

module.exports = new Session();