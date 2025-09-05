const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');

class Participant extends BaseModel {
  constructor() {
    super('participants');
  }

  async create(data) {
    const participantData = {
      id: uuidv4(),
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      session_id: data.sessionId,
      table_id: data.tableId,
      is_facilitator: data.isFacilitator || false,
      joined_at: new Date()
    };

    return await super.create(participantData);
  }

  async joinTable(sessionId, tableId, participantName, email = null, phone = null) {
    // Check if table is full
    const currentCount = await this.getTableParticipantCount(tableId);
    const table = await this.db.queryOne('SELECT max_size FROM tables WHERE id = ?', [tableId]);
    
    if (currentCount >= table.max_size) {
      throw new Error('Table is full');
    }

    // Create participant
    const participant = await this.create({
      name: participantName,
      email,
      phone,
      sessionId,
      tableId,
      isFacilitator: currentCount === 0 // First person becomes facilitator
    });

    // Update table facilitator if this is the first participant
    if (currentCount === 0) {
      await this.db.query(
        'UPDATE tables SET facilitator_id = ?, updated_at = ? WHERE id = ?', 
        [participant.id, new Date(), tableId]
      );
    }

    return participant;
  }

  async leaveTable(participantId) {
    const participant = await this.findById(participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    // Mark as left
    await this.update(participantId, { left_at: new Date() });

    // If this was the facilitator, reassign to another participant
    if (participant.is_facilitator) {
      const newFacilitator = await this.db.queryOne(`
        SELECT * FROM ${this.tableName} 
        WHERE table_id = ? AND left_at IS NULL AND id != ? 
        ORDER BY joined_at ASC LIMIT 1
      `, [participant.table_id, participantId]);

      if (newFacilitator) {
        await this.update(newFacilitator.id, { is_facilitator: true });
        await this.db.query(
          'UPDATE tables SET facilitator_id = ?, updated_at = ? WHERE id = ?',
          [newFacilitator.id, new Date(), participant.table_id]
        );
      } else {
        // No one left, clear facilitator
        await this.db.query(
          'UPDATE tables SET facilitator_id = NULL, status = "waiting", updated_at = ? WHERE id = ?',
          [new Date(), participant.table_id]
        );
      }
    }

    return true;
  }

  async findBySessionId(sessionId) {
    const sql = `
      SELECT p.*, t.table_number, t.name as table_name 
      FROM ${this.tableName} p
      JOIN tables t ON p.table_id = t.id
      WHERE p.session_id = ? AND p.left_at IS NULL
      ORDER BY t.table_number, p.joined_at
    `;
    return await this.db.query(sql, [sessionId]);
  }

  async findByTableId(tableId) {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE table_id = ? AND left_at IS NULL 
      ORDER BY joined_at ASC
    `;
    return await this.db.query(sql, [tableId]);
  }

  async findActiveByTableId(tableId) {
    return await this.findByTableId(tableId);
  }

  async getTableParticipantCount(tableId) {
    const result = await this.db.queryOne(`
      SELECT COUNT(*) as count FROM ${this.tableName} 
      WHERE table_id = ? AND left_at IS NULL
    `, [tableId]);
    return result.count;
  }

  async getSessionParticipantCount(sessionId) {
    const result = await this.db.queryOne(`
      SELECT COUNT(*) as count FROM ${this.tableName} 
      WHERE session_id = ? AND left_at IS NULL
    `, [sessionId]);
    return result.count;
  }

  async makeFacilitator(participantId) {
    const participant = await this.findById(participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    // Remove facilitator status from others at the same table
    await this.db.query(`
      UPDATE ${this.tableName} 
      SET is_facilitator = 0 
      WHERE table_id = ? AND left_at IS NULL
    `, [participant.table_id]);

    // Make this participant the facilitator
    await this.update(participantId, { is_facilitator: true });

    // Update table facilitator
    await this.db.query(
      'UPDATE tables SET facilitator_id = ?, updated_at = ? WHERE id = ?',
      [participantId, new Date(), participant.table_id]
    );

    return await this.findById(participantId);
  }

  async getFacilitator(tableId) {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE table_id = ? AND is_facilitator = 1 AND left_at IS NULL
    `;
    return await this.db.queryOne(sql, [tableId]);
  }

  async getParticipantHistory(participantId) {
    const sql = `
      SELECT 
        p.*,
        t.table_number,
        t.name as table_name,
        s.title as session_title,
        COUNT(DISTINCT r.id) as recordings_participated
      FROM ${this.tableName} p
      JOIN tables t ON p.table_id = t.id
      JOIN sessions s ON p.session_id = s.id
      LEFT JOIN recordings r ON p.table_id = r.table_id 
        AND r.created_at BETWEEN p.joined_at AND COALESCE(p.left_at, NOW())
      WHERE p.id = ?
      GROUP BY p.id
    `;
    return await this.db.queryOne(sql, [participantId]);
  }

  async moveToTable(participantId, newTableId) {
    const participant = await this.findById(participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    // Check if new table has space
    const currentCount = await this.getTableParticipantCount(newTableId);
    const table = await this.db.queryOne('SELECT max_size FROM tables WHERE id = ?', [newTableId]);
    
    if (currentCount >= table.max_size) {
      throw new Error('Target table is full');
    }

    const oldTableId = participant.table_id;
    const wasFacilitator = participant.is_facilitator;

    // Update participant's table
    await this.update(participantId, { 
      table_id: newTableId,
      is_facilitator: currentCount === 0, // Become facilitator if table was empty
      updated_at: new Date()
    });

    // Handle facilitator reassignment on old table
    if (wasFacilitator) {
      const newFacilitator = await this.db.queryOne(`
        SELECT * FROM ${this.tableName} 
        WHERE table_id = ? AND left_at IS NULL 
        ORDER BY joined_at ASC LIMIT 1
      `, [oldTableId]);

      if (newFacilitator) {
        await this.update(newFacilitator.id, { is_facilitator: true });
        await this.db.query(
          'UPDATE tables SET facilitator_id = ?, updated_at = ? WHERE id = ?',
          [newFacilitator.id, new Date(), oldTableId]
        );
      } else {
        await this.db.query(
          'UPDATE tables SET facilitator_id = NULL, status = "waiting", updated_at = ? WHERE id = ?',
          [new Date(), oldTableId]
        );
      }
    }

    // Update new table facilitator if participant became facilitator
    if (currentCount === 0) {
      await this.db.query(
        'UPDATE tables SET facilitator_id = ?, updated_at = ? WHERE id = ?',
        [participantId, new Date(), newTableId]
      );
    }

    return await this.findById(participantId);
  }
}

module.exports = new Participant();