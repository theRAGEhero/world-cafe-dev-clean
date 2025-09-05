const { v4: uuidv4 } = require('uuid');

class SessionManager {
  constructor() {
    this.sessions = new Map();
  }

  createSession({ title, description, tableCount = 20, maxParticipants = 100 }) {
    const sessionId = uuidv4();
    const session = {
      id: sessionId,
      title,
      description,
      tableCount,
      maxParticipants,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tables: this.initializeTables(tableCount),
      participants: [],
      transcriptions: [],
      settings: {
        recordingEnabled: true,
        maxTableSize: Math.floor(maxParticipants / tableCount),
        sessionDuration: 120, // minutes
        rotationEnabled: false
      }
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  initializeTables(count) {
    const tables = [];
    for (let i = 1; i <= count; i++) {
      tables.push({
        id: i,
        name: `Table ${i}`,
        participants: [],
        status: 'waiting', // waiting, recording, completed
        recordings: [],
        currentTopic: '',
        facilitator: null,
        maxSize: 5
      });
    }
    return tables;
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    Object.assign(session, updates, {
      updatedAt: new Date().toISOString()
    });

    return session;
  }

  deleteSession(sessionId) {
    return this.sessions.delete(sessionId);
  }

  joinTable(session, tableId, participantName) {
    const table = session.tables.find(t => t.id === tableId);
    if (!table) {
      throw new Error('Table not found');
    }

    if (table.participants.length >= table.maxSize) {
      throw new Error('Table is full');
    }

    const participant = {
      id: uuidv4(),
      name: participantName,
      joinedAt: new Date().toISOString(),
      tableId: tableId
    };

    table.participants.push(participant);
    session.participants.push(participant);

    // Set first participant as facilitator
    if (table.participants.length === 1) {
      table.facilitator = participant.id;
    }

    return table;
  }

  leaveTable(session, tableId, participantId) {
    const table = session.tables.find(t => t.id === tableId);
    if (!table) {
      throw new Error('Table not found');
    }

    table.participants = table.participants.filter(p => p.id !== participantId);
    session.participants = session.participants.filter(p => p.id !== participantId);

    // Reassign facilitator if needed
    if (table.facilitator === participantId && table.participants.length > 0) {
      table.facilitator = table.participants[0].id;
    } else if (table.participants.length === 0) {
      table.facilitator = null;
      table.status = 'waiting';
    }

    return table;
  }

  updateTableStatus(session, tableId, status) {
    const table = session.tables.find(t => t.id === tableId);
    if (!table) {
      throw new Error('Table not found');
    }

    table.status = status;
    table.updatedAt = new Date().toISOString();

    return table;
  }

  updateTableTopic(session, tableId, topic) {
    const table = session.tables.find(t => t.id === tableId);
    if (!table) {
      throw new Error('Table not found');
    }

    table.currentTopic = topic;
    table.updatedAt = new Date().toISOString();

    return table;
  }

  getSessionStats(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const totalParticipants = session.participants.length;
    const activeTables = session.tables.filter(t => t.participants.length > 0).length;
    const recordingTables = session.tables.filter(t => t.status === 'recording').length;
    const completedTables = session.tables.filter(t => t.status === 'completed').length;

    return {
      totalParticipants,
      totalTables: session.tableCount,
      activeTables,
      recordingTables,
      completedTables,
      transcriptions: session.transcriptions?.length || 0,
      averageTableSize: activeTables > 0 ? Math.round(totalParticipants / activeTables) : 0
    };
  }

  getAllSessions() {
    return Array.from(this.sessions.values());
  }
}

module.exports = SessionManager;