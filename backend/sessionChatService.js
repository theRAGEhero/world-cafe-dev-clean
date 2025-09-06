class SessionChatService {
  constructor(groqService) {
    this.groq = groqService;
  }

  async chatWithSession(sessionId, userMessage, sessionData) {
    try {
      // Prepare context from all session transcriptions
      const context = this.prepareSessionContext(sessionData);
      
      // Check if context is too long (rough estimate: 4 chars ≈ 1 token)
      const estimatedTokens = Math.ceil(context.length / 4) + Math.ceil(userMessage.length / 4);
      const maxTokens = 32000; // Groq's Llama model limit, leaving room for response
      
      if (estimatedTokens > maxTokens) {
        return {
          error: true,
          message: `Session too large to process (estimated ${estimatedTokens.toLocaleString()} tokens, max ${maxTokens.toLocaleString()}). This session has too much conversation data. Consider using table-specific analysis instead.`,
          suggestion: "Try asking about specific tables or use the existing AI Analysis features for insights."
        };
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
        model: "llama-3.3-70b-versatile",
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
      
      if (error.message && error.message.includes('context_length')) {
        return {
          error: true,
          message: "Session has too much conversation data to process at once. Try asking about specific tables or use the AI Analysis features.",
          suggestion: "Break down your question to focus on specific aspects or tables."
        };
      }
      
      return {
        error: true,
        message: "Failed to process your question. Please try again.",
        details: error.message
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
                context += `Speaker ${segment.speaker}: ${segment.transcript}\n`;
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
}

module.exports = SessionChatService;