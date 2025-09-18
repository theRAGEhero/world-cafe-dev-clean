class SessionChatService {
  constructor(groqService) {
    this.groq = groqService;
    this.modelLimits = {
      'llama-3.3-70b-versatile': 12000,
      'llama-3.1-70b-versatile': 128000,
      'llama-3.1-8b-instant': 128000,
      'mixtral-8x7b-32768': 32768
    };
  }

  async chatWithSession(sessionId, userMessage, sessionData) {
    try {
      const model = "llama-3.3-70b-versatile";
      const maxTokens = this.modelLimits[model] || 12000;
      const reservedTokens = 3000; // Increased reserve for safety
      const availableTokens = maxTokens - reservedTokens;
      
      console.log(`[Chat] Starting with available tokens: ${availableTokens}`);
      
      // Try to get existing summary first
      let context = await this.getOrCreateSummary(sessionId, sessionData);
      console.log(`[Chat] Initial context length: ${context.length} chars`);
      
      // Check token count and optimize context
      let estimatedTokens = this.estimateTokenCount(context + userMessage);
      console.log(`[Chat] Estimated tokens: ${estimatedTokens}, Available: ${availableTokens}`);
      
      if (estimatedTokens > availableTokens) {
        // Try with severely truncated context
        const maxContextTokens = availableTokens - this.estimateTokenCount(userMessage) - 500; // Extra safety buffer
        context = this.truncateContext(context, maxContextTokens);
        estimatedTokens = this.estimateTokenCount(context + userMessage);
        
        console.log(`[Chat] After truncation - Context: ${context.length} chars, Tokens: ${estimatedTokens}`);
        
        if (estimatedTokens > availableTokens) {
          // Last resort: use minimal context
          context = `Session: "${sessionData.session.title}" has ${sessionData.transcriptions.length} transcriptions. Ask specific questions about tables for detailed analysis.`;
          estimatedTokens = this.estimateTokenCount(context + userMessage);
          
          console.log(`[Chat] Minimal context - Tokens: ${estimatedTokens}`);
          
          if (estimatedTokens > availableTokens) {
            return {
              error: true,
              type: 'token_limit_exceeded',
              message: `📊 Session too large for analysis`,
              details: `This session has ${estimatedTokens.toLocaleString()} tokens, but the AI model can only process ${availableTokens.toLocaleString()} tokens at once.`,
              suggestions: [
                "🎯 Try asking about specific tables (e.g., 'What did Table 1 discuss?')",
                "📝 Use the AI Analysis features for automated summaries",
                "🔍 Break your question into smaller, more specific parts"
              ],
              technicalInfo: {
                estimated: estimatedTokens,
                limit: availableTokens,
                model: model
              }
            };
          }
        }
      }

      // Create the chat completion
      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: `You are an AI assistant helping to explore and analyze a World Café session. The session involves multiple tables where participants discuss various topics.

You have access to all the transcriptions from this session. Use this information to answer questions about:
- What was discussed at different tables
- Main themes and topics that emerged
- Agreements and disagreements between participants
- Specific quotes or statements made
- Cross-table comparisons and insights

Be specific and cite which tables or speakers you're referencing when possible. If asked about something not in the transcriptions, say so clearly.

Session Context:
${context}`
          },
          {
            role: "user",
            content: userMessage
          }
        ],
        model: model,
        temperature: 0.3,
        max_tokens: 2000
      });

      return {
        success: true,
        response: completion.choices[0].message.content,
        usage: completion.usage
      };

    } catch (error) {
      console.error('Session chat error:', error);
      
      if (error.message && (error.message.includes('context_length') || error.message.includes('too large'))) {
        return {
          error: true,
          type: 'api_token_limit',
          message: "🚫 Content too large for AI processing",
          details: "The session content exceeds the AI model's processing capacity.",
          suggestions: [
            "🎯 Ask about specific tables instead of the whole session",
            "📝 Use the automated AI Analysis features",
            "🔍 Try a more specific question about particular topics"
          ]
        };
      }
      
      if (error.message && error.message.includes('rate_limit')) {
        return {
          error: true,
          type: 'rate_limit',
          message: "⏳ Too many requests",
          details: "Please wait a moment before asking another question.",
          suggestions: ["Wait 30 seconds and try again"]
        };
      }
      
      return {
        error: true,
        type: 'general_error',
        message: "❌ Failed to process your question",
        details: error.message || "Unknown error occurred",
        suggestions: [
          "🔄 Try rephrasing your question",
          "🎯 Be more specific about what you want to know",
          "📞 Contact support if the problem persists"
        ]
      };
    }
  }

  prepareSessionContext(sessionData) {
    const { session, transcriptions, tables } = sessionData;
    
    let context = `Session: "${session.title}"\n`;
    context += `Tables: ${session.table_count}, Participants: ${session.participants?.length || 'Unknown'}\n\n`;

    // Group transcriptions by table
    const tableTranscriptions = {};
    transcriptions.forEach(t => {
      const tableId = t.table_id;
      if (!tableTranscriptions[tableId]) {
        tableTranscriptions[tableId] = [];
      }
      tableTranscriptions[tableId].push(t);
    });

    // Add transcriptions grouped by table
    Object.entries(tableTranscriptions).forEach(([tableId, tableTranscripts]) => {
      const table = tables?.find(t => t.id == tableId);
      const tableName = table ? `Table ${table.table_number} (${table.name})` : `Table ${tableId}`;
      
      context += `\n--- ${tableName} ---\n`;
      
      tableTranscripts
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .forEach((transcript, index) => {
          context += `\nRecording ${index + 1}:\n`;
          
          if (transcript.speaker_segments) {
            try {
              const speakers = typeof transcript.speaker_segments === 'string' 
                ? JSON.parse(transcript.speaker_segments) 
                : transcript.speaker_segments;
              
              speakers.forEach(segment => {
                context += `Speaker ${segment.speaker}: ${segment.text || segment.transcript || ''}\n`;
              });
            } catch (e) {
              context += `${transcript.transcript_text || transcript.transcript || 'No transcript available'}\n`;
            }
          } else {
            context += `${transcript.transcript_text || transcript.transcript || 'No transcript available'}\n`;
          }
        });
    });

    return context;
  }

  estimateTokenCount(text) {
    // Rough estimation: average 4 characters per token
    return Math.ceil(text.length / 4);
  }

  async getOrCreateSummary(sessionId, sessionData) {
    // Check if we have existing summaries in session_analyses table
    const SessionAnalysis = require('./database/models/SessionAnalysis');
    const db = require('./database/connection');
    const sessionAnalysis = new SessionAnalysis(db);

    try {
      // Try to get existing session summary
      const existingSummary = await sessionAnalysis.findBySessionAndType(
        sessionId, 
        'chat_summary', 
        null, 
        'session'
      );

      if (existingSummary) {
        return this.formatSummaryContext(existingSummary.analysis_data, sessionData);
      }

      // No summary exists, create one from transcriptions
      const summary = await this.createSessionSummary(sessionData);
      
      // Save summary for future use
      await sessionAnalysis.create(
        sessionId,
        'chat_summary',
        summary,
        { created_by: 'auto_summary', tokens_saved: this.estimateTokenCount(this.prepareSessionContext(sessionData)) },
        null,
        'session'
      );

      return this.formatSummaryContext(summary, sessionData);
      
    } catch (error) {
      console.warn('Failed to get/create summary, using emergency fallback:', error.message);
      // Emergency fallback: create minimal summary directly
      const { session, transcriptions } = sessionData;
      return `Session: "${session.title}" - Emergency Summary\n\nThis session has ${transcriptions.length} transcriptions across multiple tables. Due to size constraints, only a brief overview can be provided. For detailed information, please ask about specific tables or use the AI Analysis features.\n\n[Ask specific questions like "What did Table 1 discuss?" for better results]`;
    }
  }

  async createSessionSummary(sessionData) {
    const { session, transcriptions, tables } = sessionData;
    
    // Group by tables and create VERY concise summaries
    const tableTranscriptions = {};
    transcriptions.forEach(t => {
      const tableId = t.table_id;
      if (!tableTranscriptions[tableId]) {
        tableTranscriptions[tableId] = [];
      }
      tableTranscriptions[tableId].push(t);
    });

    let summary = `Session: "${session.title}" (${session.table_count} tables)\n\n`;

    // Create ultra-compact table summaries
    for (const [tableId, tableTranscripts] of Object.entries(tableTranscriptions)) {
      const table = tables?.find(t => t.id == tableId);
      const tableName = table ? `Table ${table.table_number}` : `Table ${tableId}`;
      
      // Extract ALL text first
      const allText = tableTranscripts
        .map(t => {
          if (t.speaker_segments) {
            try {
              const speakers = typeof t.speaker_segments === 'string' 
                ? JSON.parse(t.speaker_segments) 
                : t.speaker_segments;
              return speakers.map(s => s.text || s.transcript || '').join(' ');
            } catch (e) {
              return t.transcript_text || t.transcript || '';
            }
          }
          return t.transcript_text || t.transcript || '';
        })
        .join(' ');
      
      // Create VERY brief summary (max 200 chars)
      const briefText = allText.substring(0, 200);
      const keyWords = this.extractKeywords(allText).slice(0, 5); // Only top 5 keywords
      
      summary += `${tableName}: ${briefText}${allText.length > 200 ? '...' : ''} | Topics: ${keyWords.join(', ')}\n`;
    }

    // Ensure summary itself isn't too long (max 2000 chars total)
    if (summary.length > 2000) {
      summary = summary.substring(0, 1997) + '...';
    }

    return summary;
  }

  formatSummaryContext(summary, sessionData) {
    const { session } = sessionData;
    return `Session Summary: "${session.title}"\n\n${typeof summary === 'object' ? JSON.stringify(summary) : summary}\n\n[This is a condensed summary. For specific details, ask about particular tables or topics.]`;
  }

  extractKeywords(text) {
    // Simple keyword extraction - could be enhanced with NLP
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'have', 'will', 'been', 'from', 'they', 'were', 'said', 'each', 'than'].includes(word));
    
    const frequency = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });
    
    return Object.entries(frequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([word]) => word);
  }

  truncateContext(context, maxTokens) {
    const targetChars = maxTokens * 4; // Convert tokens to characters
    
    if (context.length <= targetChars) {
      return context;
    }
    
    // Very aggressive truncation - keep only beginning
    const keepStart = Math.floor(targetChars * 0.8); // Keep 80% at start
    const truncatedMessage = '\n\n[... Large session content truncated. Ask about specific tables for detailed analysis ...]';
    
    const start = context.substring(0, keepStart - truncatedMessage.length);
    
    return start + truncatedMessage;
  }
}

module.exports = SessionChatService;