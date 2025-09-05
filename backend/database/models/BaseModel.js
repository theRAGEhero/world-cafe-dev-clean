const db = require('../connection');

class BaseModel {
  constructor(tableName) {
    this.tableName = tableName;
    this.db = db;
  }

  async findById(id) {
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`;
    return await this.db.queryOne(sql, [id]);
  }

  async findAll(limit = 100, offset = 0) {
    const sql = `SELECT * FROM ${this.tableName} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    return await this.db.query(sql, [limit, offset]);
  }

  async findBy(column, value, limit = 100) {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${column} = ? ORDER BY created_at DESC LIMIT ?`;
    return await this.db.query(sql, [value, limit]);
  }

  async findOneBy(column, value) {
    const sql = `SELECT * FROM ${this.tableName} WHERE ${column} = ? LIMIT 1`;
    return await this.db.queryOne(sql, [value]);
  }

  async create(data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    const result = await this.db.query(sql, values);
    
    return await this.findById(result.insertId || data.id);
  }

  async update(id, data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const setClause = columns.map(col => `${col} = ?`).join(', ');
    
    const sql = `UPDATE ${this.tableName} SET ${setClause} WHERE id = ?`;
    await this.db.query(sql, [...values, id]);
    
    return await this.findById(id);
  }

  async delete(id) {
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`;
    const result = await this.db.query(sql, [id]);
    return result.affectedRows > 0;
  }

  async count(whereClause = '', params = []) {
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName} ${whereClause}`;
    const result = await this.db.queryOne(sql, params);
    return result.count;
  }

  // Helper methods for common patterns
  async exists(id) {
    const result = await this.db.queryOne(`SELECT 1 FROM ${this.tableName} WHERE id = ?`, [id]);
    return !!result;
  }

  async softDelete(id) {
    return await this.update(id, { deleted_at: new Date() });
  }

  // Batch operations
  async batchCreate(dataArray) {
    if (!dataArray.length) return [];
    
    return await this.db.transaction(async (query) => {
      const results = [];
      for (const data of dataArray) {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => '?').join(', ');
        
        const sql = `INSERT INTO ${this.tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
        const result = await query(sql, values);
        results.push(result.insertId || data.id);
      }
      return results;
    });
  }
}

module.exports = BaseModel;