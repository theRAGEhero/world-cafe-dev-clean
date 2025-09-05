const BaseModel = require('./BaseModel');
const { v4: uuidv4 } = require('uuid');
const QRCodeLib = require('qrcode');
const path = require('path');
const fs = require('fs').promises;

class QRCode extends BaseModel {
  constructor() {
    super('qr_codes');
    this.qrCodesDir = path.join(__dirname, '../../public/qr-codes');
    this.ensureQRCodesDirectory();
  }

  async ensureQRCodesDirectory() {
    try {
      await fs.access(this.qrCodesDir);
    } catch {
      await fs.mkdir(this.qrCodesDir, { recursive: true });
    }
  }

  async create(data) {
    const qrData = {
      id: uuidv4(),
      entity_type: data.entityType, // 'session' or 'table'
      entity_id: data.entityId,
      qr_data: data.qrData, // URL or data to encode
      is_active: true,
      expires_at: data.expiresAt || null,
      created_at: new Date()
    };

    const qrCode = await super.create(qrData);
    
    // Generate QR code image
    await this.generateQRImage(qrCode.id, data.qrData);
    
    return qrCode;
  }

  async generateQRImage(qrId, data, options = {}) {
    const filename = `${qrId}.png`;
    const imagePath = path.join(this.qrCodesDir, filename);
    
    const qrOptions = {
      width: options.width || 300,
      margin: options.margin || 2,
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF'
      }
    };

    try {
      await QRCodeLib.toFile(imagePath, data, qrOptions);
      
      // Update database with image path
      await this.update(qrId, { 
        image_path: imagePath,
        updated_at: new Date()
      });
      
      return imagePath;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw error;
    }
  }

  async createSessionQR(sessionId, baseUrl) {
    const qrData = `${baseUrl}/join/${sessionId}`;
    
    return await this.create({
      entityType: 'session',
      entityId: sessionId,
      qrData: qrData
    });
  }

  async createTableQR(tableId, sessionId, baseUrl, tableNumber = null) {
    // If tableNumber is provided, use it for the URL, otherwise use tableId
    const urlIdentifier = tableNumber !== null ? tableNumber : tableId;
    const qrData = `${baseUrl}/join/${sessionId}/table/${urlIdentifier}`;
    
    return await this.create({
      entityType: 'table',
      entityId: tableId.toString(),
      qrData: qrData
    });
  }

  async findByEntity(entityType, entityId) {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE entity_type = ? AND entity_id = ? AND is_active = 1
      ORDER BY created_at DESC
    `;
    return await this.db.query(sql, [entityType, entityId]);
  }

  async findActiveByEntity(entityType, entityId) {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE entity_type = ? AND entity_id = ? AND is_active = 1
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return await this.db.queryOne(sql, [entityType, entityId]);
  }

  async findByQRData(qrData) {
    const sql = `
      SELECT * FROM ${this.tableName} 
      WHERE qr_data = ? AND is_active = 1
      AND (expires_at IS NULL OR expires_at > NOW())
    `;
    return await this.db.queryOne(sql, [qrData]);
  }

  async deactivateQR(qrId) {
    return await this.update(qrId, { 
      is_active: false,
      updated_at: new Date()
    });
  }

  async refreshQR(qrId, newData = null) {
    const qrCode = await this.findById(qrId);
    if (!qrCode) {
      throw new Error('QR code not found');
    }

    const dataToUse = newData || qrCode.qr_data;
    
    // Generate new image
    await this.generateQRImage(qrId, dataToUse);
    
    // Update data if provided
    const updateData = { updated_at: new Date() };
    if (newData) {
      updateData.qr_data = newData;
    }
    
    return await this.update(qrId, updateData);
  }

  async setExpiration(qrId, expiresAt) {
    return await this.update(qrId, { 
      expires_at: expiresAt,
      updated_at: new Date()
    });
  }

  async cleanupExpiredQRs() {
    const expiredQRs = await this.db.query(`
      SELECT * FROM ${this.tableName} 
      WHERE expires_at IS NOT NULL AND expires_at <= NOW()
    `);

    // Deactivate expired QRs
    await this.db.query(`
      UPDATE ${this.tableName} 
      SET is_active = 0 
      WHERE expires_at IS NOT NULL AND expires_at <= NOW()
    `);

    // Optionally delete image files
    for (const qr of expiredQRs) {
      if (qr.image_path) {
        try {
          await fs.unlink(qr.image_path);
        } catch (error) {
          console.warn('Failed to delete QR image:', qr.image_path, error.message);
        }
      }
    }

    return expiredQRs.length;
  }

  async getQRStats() {
    const sql = `
      SELECT 
        entity_type,
        COUNT(*) as total_qrs,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_qrs,
        COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at > NOW() THEN 1 END) as expiring_qrs,
        COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= NOW() THEN 1 END) as expired_qrs
      FROM ${this.tableName}
      GROUP BY entity_type
    `;
    return await this.db.query(sql);
  }

  async generateSessionQRs(sessionId, tableCount, baseUrl) {
    const qrs = [];
    
    // Generate session QR
    const sessionQR = await this.createSessionQR(sessionId, baseUrl);
    qrs.push(sessionQR);

    // Generate table QRs
    for (let i = 1; i <= tableCount; i++) {
      // Find table ID from table number
      const table = await this.db.queryOne(
        'SELECT id FROM tables WHERE session_id = ? AND table_number = ?',
        [sessionId, i]
      );
      
      if (table) {
        const tableQR = await this.createTableQR(table.id, sessionId, baseUrl, i);
        qrs.push(tableQR);
      }
    }

    return qrs;
  }

  async getImagePath(qrId) {
    const qr = await this.findById(qrId);
    return qr ? qr.image_path : null;
  }

  async getImageBuffer(qrId) {
    const imagePath = await this.getImagePath(qrId);
    if (!imagePath) {
      return null;
    }

    try {
      return await fs.readFile(imagePath);
    } catch (error) {
      console.error('Error reading QR image:', error);
      return null;
    }
  }

  // Generate QR code as data URL for direct embedding
  async generateDataURL(data, options = {}) {
    const qrOptions = {
      width: options.width || 300,
      margin: options.margin || 2,
      color: {
        dark: options.darkColor || '#000000',
        light: options.lightColor || '#FFFFFF'
      }
    };

    try {
      return await QRCodeLib.toDataURL(data, qrOptions);
    } catch (error) {
      console.error('Error generating QR data URL:', error);
      throw error;
    }
  }
}

module.exports = new QRCode();