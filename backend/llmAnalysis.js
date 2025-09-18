const Groq = require('groq-sdk');

class LLMAnalysisService {
  constructor() {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY environment variable is required');
    }
    
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
    
    // Default model - using Llama 3.3 70B for high-quality analysis
    this.model = 'llama-3.3-70b-versatile';
    
    // Model-specific token limits
    this.modelLimits = {
      'llama-3.3-70b-versatile': 12000,
      'llama-3.1-70b-versatile': 128000,
      'llama-3.1-8b-instant': 128000,
      'mixtral-8x7b-32768': 32768
    };
    
    // Analysis prompts - configurable by admin
    this.prompts = {
      conflictDetection: {
        title: "Conflict Detection",
        prompt: "Analyze the following World Café discussion transcripts and identify disagreements, opposing viewpoints, and tensions between participants. Focus on detecting conflicts, disputes, and areas where participants express opposing views. Rate severity from 0-1.",
        keywords: ["disagree", "oppose", "conflict", "wrong", "against", "but", "however", "dispute", "argue"]
      },
      agreementDetection: {
        title: "Agreement Detection", 
        prompt: "Analyze the following World Café discussion transcripts and identify areas of consensus, shared values, and common ground between participants. Focus on finding agreements, collaborative statements, and points of unity. Rate strength from 0-1.",
        keywords: ["agree", "yes", "exactly", "same", "support", "consensus", "together", "shared", "common"]
      },
      themeExtraction: {
        title: "Theme Extraction",
        prompt: "Analyze the following World Café discussion transcripts and extract the main topics, recurring themes, and key discussion points. Identify the most important subjects that participants are discussing and their frequency.",
        keywords: []
      },
      sentimentAnalysis: {
        title: "Sentiment Analysis",
        prompt: "Analyze the emotional tone and participant engagement levels in the following World Café discussion transcripts. Assess the overall mood, enthusiasm, and emotional climate of the discussions.",
        keywords: []
      }
    };
  }

  getPrompts() {
    return this.prompts;
  }

  updatePrompts(newPrompts) {
    this.prompts = { ...this.prompts, ...newPrompts };
  }

  estimateTokenCount(text) {
    // Rough estimation: average 4 characters per token
    return Math.ceil(text.length / 4);
  }

  truncateTranscripts(transcripts, maxTokens) {
    // Truncate transcripts to fit within token limit
    const maxChars = maxTokens * 4;
    let currentChars = 0;
    const truncatedTranscripts = [];
    
    for (const transcriptItem of transcripts) {
      const tableInfo = `\n\n--- Table ${transcriptItem.tableId} ---\n`;
      const transcriptText = transcriptItem.transcript || '';
      const speakerInfo = transcriptItem.speakers ? 
        transcriptItem.speakers.map(s => `Speaker ${s.speaker}: ${s.text || s.transcript || ''}`).join('\n') :
        transcriptText;
      
      const fullText = tableInfo + speakerInfo;
      
      if (currentChars + fullText.length > maxChars) {
        // Add truncated version if we have space
        const remainingChars = maxChars - currentChars - tableInfo.length;
        if (remainingChars > 100) { // Only if meaningful content can fit
          const truncatedContent = speakerInfo.substring(0, remainingChars - 50) + '... [truncated]';
          truncatedTranscripts.push({
            ...transcriptItem,
            transcript: truncatedContent,
            speakers: null // Simplify structure
          });
        }
        break;
      }
      
      truncatedTranscripts.push(transcriptItem);
      currentChars += fullText.length;
    }
    
    return truncatedTranscripts;
  }

  buildCombinedText(transcripts) {
    return transcripts.map(t => {
      const tableInfo = `\n\n--- Table ${t.tableId} ---\n`;
      const transcriptText = t.transcript || '';
      const speakerInfo = t.speakers && t.speakers.length > 0 ? 
        t.speakers.map(s => `Speaker ${s.speaker}: ${s.transcript || s.text || ''}`).join('\n') :
        transcriptText;
      
      return tableInfo + speakerInfo;
    }).join('\n');
  }

  buildSystemPrompt(analysisType) {
    return `You are an expert facilitator and conversation analyst specializing in World Café methodology. Your task is to analyze discussion transcripts and provide insightful, actionable analysis.

Please provide your response in valid JSON format based on the analysis type: ${analysisType}

Keep responses concise but insightful. If content is truncated, provide the best analysis possible with available data.`;
  }

  async analyzeWithLLM(prompt, transcripts, analysisType) {
    try {
      const maxTokens = this.modelLimits[this.model] || 12000;
      const reservedTokens = 3000; // Reserve for response and system prompt
      const availableTokens = maxTokens - reservedTokens;
      
      console.log(`[LLM Analysis] Starting ${analysisType} with available tokens: ${availableTokens}`);
      
      // Check if we need to truncate transcripts
      let workingTranscripts = transcripts;
      const systemPromptSize = this.estimateTokenCount(this.buildSystemPrompt(analysisType));
      const maxTranscriptTokens = availableTokens - systemPromptSize - 200; // Extra buffer
      
      // Estimate initial size
      let combinedText = this.buildCombinedText(workingTranscripts);
      let estimatedTokens = this.estimateTokenCount(combinedText);
      
      console.log(`[LLM Analysis] Initial tokens: ${estimatedTokens}, Max allowed: ${maxTranscriptTokens}`);
      
      if (estimatedTokens > maxTranscriptTokens) {
        console.log(`[LLM Analysis] Truncating transcripts for ${analysisType}`);
        workingTranscripts = this.truncateTranscripts(workingTranscripts, maxTranscriptTokens);
        combinedText = this.buildCombinedText(workingTranscripts);
        estimatedTokens = this.estimateTokenCount(combinedText);
        
        console.log(`[LLM Analysis] After truncation: ${estimatedTokens} tokens`);
      }
      
      // Final safety check
      if (estimatedTokens > maxTranscriptTokens) {
        console.warn(`[LLM Analysis] Still too large (${estimatedTokens} tokens), using minimal summary`);
        combinedText = `Session contains ${transcripts.length} transcriptions across multiple tables. Content too large for detailed analysis. Providing summary-level analysis only.`;
      }

      const systemPrompt = this.buildSystemPrompt(analysisType) + `\n\n${prompt}\n\nProvide concise but insightful analysis in valid JSON format. Include relevant quotes and specific table references when possible.`;

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: systemPrompt
          },
          {
            role: "user",
            content: `Please analyze these World Café discussion transcripts:\n\n${combinedText}\n\nFocus on: ${analysisType}`
          }
        ],
        model: this.model,
        temperature: 0.3, // Lower temperature for more consistent analysis
        max_tokens: 2000,
        response_format: { type: "json_object" }
      });

      const response = completion.choices[0].message.content;
      return JSON.parse(response);

    } catch (error) {
      console.error(`LLM Analysis Error (${analysisType}):`, error);
      
      // Check for token limit errors
      if (error.message && (error.message.includes('too large') || error.message.includes('context_length'))) {
        console.warn(`Token limit exceeded for ${analysisType} analysis`);
      }
      
      // Fallback to empty results if LLM fails
      switch (analysisType) {
        case 'conflicts':
          return { conflicts: [], note: 'Analysis limited due to content size' };
        case 'agreements':
          return { agreements: [], note: 'Analysis limited due to content size' };
        case 'themes':
          return { themes: [], note: 'Analysis limited due to content size' };
        case 'sentiment':
          return { overall: 0, byTable: {}, interpretation: 'Analysis limited due to content size', insights: [] };
        default:
          return { note: 'Analysis limited due to content size' };
      }
    }
  }

  async analyzeSession(session) {
    if (!session.transcriptions || session.transcriptions.length === 0) {
      return {
        conflicts: [],
        agreements: [],
        themes: [],
        sentiment: { overall: 0, byTable: {}, interpretation: 'No transcriptions available' },
        participationStats: {},
        crossTableComparison: {},
        summary: "No transcriptions available for analysis"
      };
    }

    console.log('Starting LLM analysis for session:', session.id);

    try {
      // Run all analyses in parallel for better performance
      const [conflictResults, agreementResults, themeResults, sentimentResults] = await Promise.all([
        this.analyzeWithLLM(
          this.prompts.conflictDetection.prompt,
          session.transcriptions,
          'conflicts'
        ),
        this.analyzeWithLLM(
          this.prompts.agreementDetection.prompt,
          session.transcriptions,
          'agreements'
        ),
        this.analyzeWithLLM(
          this.prompts.themeExtraction.prompt,
          session.transcriptions,
          'themes'
        ),
        this.analyzeWithLLM(
          this.prompts.sentimentAnalysis.prompt,
          session.transcriptions,
          'sentiment'
        )
      ]);

      // Process and structure the results
      const analysis = {
        conflicts: conflictResults.conflicts || [],
        agreements: agreementResults.agreements || [],
        themes: themeResults.themes || [],
        sentiment: sentimentResults,
        participationStats: this.calculateParticipationStats(session.transcriptions),
        crossTableComparison: this.compareTablesLLM(session.transcriptions),
        llmPowered: true,
        analyzedAt: new Date().toISOString()
      };

      console.log('LLM analysis completed successfully');
      return analysis;

    } catch (error) {
      console.error('Session analysis failed:', error);
      
      // Return basic structure if analysis fails
      return {
        conflicts: [],
        agreements: [],
        themes: [],
        sentiment: { overall: 0, byTable: {}, interpretation: 'Analysis failed', insights: [] },
        participationStats: this.calculateParticipationStats(session.transcriptions),
        crossTableComparison: {},
        error: error.message,
        llmPowered: false
      };
    }
  }

  async analyzeTable(tableId, tableTranscriptions) {
    if (!tableTranscriptions || tableTranscriptions.length === 0) {
      return {
        conflicts: [],
        agreements: [],
        themes: [],
        sentiment: { overall: 0, interpretation: 'No transcriptions available for this table' },
        participationStats: {},
        summary: "No transcriptions available for table analysis"
      };
    }

    console.log(`Starting LLM analysis for table ${tableId}, ${tableTranscriptions.length} transcriptions`);

    try {
      // Aggregate multiple recordings from the same table
      const aggregatedTranscription = this.aggregateTableTranscriptions(tableTranscriptions);
      
      // Run all analyses in parallel for better performance
      const [conflictResults, agreementResults, themeResults, sentimentResults] = await Promise.all([
        this.analyzeWithLLM(
          this.prompts.conflictDetection.prompt,
          [aggregatedTranscription],
          'conflicts'
        ),
        this.analyzeWithLLM(
          this.prompts.agreementDetection.prompt,
          [aggregatedTranscription],
          'agreements'
        ),
        this.analyzeWithLLM(
          this.prompts.themeExtraction.prompt,
          [aggregatedTranscription],
          'themes'
        ),
        this.analyzeWithLLM(
          this.prompts.sentimentAnalysis.prompt,
          [aggregatedTranscription],
          'sentiment'
        )
      ]);

      // Process and structure the results
      const analysis = {
        conflicts: conflictResults.conflicts || [],
        agreements: agreementResults.agreements || [],
        themes: themeResults.themes || [],
        sentiment: sentimentResults,
        participationStats: this.calculateParticipationStats(tableTranscriptions),
        tableId: tableId,
        recordingCount: tableTranscriptions.length,
        llmPowered: true,
        analyzedAt: new Date().toISOString()
      };

      console.log(`LLM analysis completed successfully for table ${tableId}`);
      return analysis;

    } catch (error) {
      console.error(`Table analysis failed for table ${tableId}:`, error);
      
      // Return basic structure if analysis fails
      return {
        conflicts: [],
        agreements: [],
        themes: [],
        sentiment: { overall: 0, interpretation: 'Analysis failed', insights: [] },
        participationStats: this.calculateParticipationStats(tableTranscriptions),
        tableId: tableId,
        recordingCount: tableTranscriptions.length,
        error: error.message,
        llmPowered: false
      };
    }
  }

  aggregateTableTranscriptions(tableTranscriptions) {
    // Sort transcriptions chronologically
    const sortedTranscriptions = tableTranscriptions.sort((a, b) => 
      new Date(a.created_at || a.timestamp) - new Date(b.created_at || b.timestamp)
    );

    // Combine all transcriptions for this table
    const combinedText = sortedTranscriptions.map((t, index) => {
      const transcript = t.transcript || t.transcript_text || '';
      const recordingBreak = index > 0 ? '\n\n--- [Recording Break] ---\n\n' : '';
      
      // Include speaker information if available
      if (t.speakers && t.speakers.length > 0) {
        const speakerText = t.speakers.map(s => `Speaker ${s.speaker}: ${s.transcript}`).join('\n');
        return recordingBreak + speakerText;
      }
      
      return recordingBreak + transcript;
    }).join('');

    // Create metadata about the aggregation
    const metadata = {
      recording_count: tableTranscriptions.length,
      total_duration: tableTranscriptions.reduce((sum, t) => sum + (t.duration_seconds || 0), 0),
      quality_scores: tableTranscriptions.map(t => t.confidence_score || 0),
      time_span: {
        start: sortedTranscriptions[0]?.created_at || sortedTranscriptions[0]?.timestamp,
        end: sortedTranscriptions[sortedTranscriptions.length - 1]?.created_at || 
             sortedTranscriptions[sortedTranscriptions.length - 1]?.timestamp
      }
    };

    return {
      tableId: tableTranscriptions[0]?.tableId || tableTranscriptions[0]?.table_id,
      transcript: combinedText,
      speakers: this.aggregateSpeakers(tableTranscriptions),
      metadata: metadata
    };
  }

  aggregateSpeakers(tableTranscriptions) {
    const allSpeakers = [];
    
    tableTranscriptions.forEach((t, recordingIndex) => {
      if (t.speakers && t.speakers.length > 0) {
        t.speakers.forEach(speaker => {
          allSpeakers.push({
            ...speaker,
            recordingIndex: recordingIndex,
            recordingTimestamp: t.created_at || t.timestamp
          });
        });
      }
    });
    
    return allSpeakers;
  }

  calculateParticipationStats(transcriptions) {
    const stats = {
      totalTables: new Set(transcriptions.map(t => t.tableId)).size,
      averageTranscriptLength: 0,
      tablesWithMultipleSpeakers: 0,
      speakerDistribution: {}
    };
    
    let totalLength = 0;
    
    for (const transcription of transcriptions) {
      const transcriptText = transcription.transcript || '';
      totalLength += transcriptText.length;
      
      if (transcription.speakers && transcription.speakers.length > 1) {
        stats.tablesWithMultipleSpeakers++;
        
        transcription.speakers.forEach(speaker => {
          const speakerId = `Table${transcription.tableId}_Speaker${speaker.speaker}`;
          if (!stats.speakerDistribution[speakerId]) {
            stats.speakerDistribution[speakerId] = {
              tableId: transcription.tableId,
              speaker: speaker.speaker,
              wordCount: 0,
              duration: 0
            };
          }
          // Safety check for speaker text
          const speakerText = speaker.transcript || speaker.text || '';
          stats.speakerDistribution[speakerId].wordCount += speakerText.split(' ').length;
          stats.speakerDistribution[speakerId].duration += (speaker.end - speaker.start) || 0;
        });
      }
    }
    
    stats.averageTranscriptLength = totalLength / transcriptions.length;
    
    return stats;
  }

  compareTablesLLM(transcriptions) {
    // Group transcriptions by table
    const tableGroups = {};
    transcriptions.forEach(t => {
      if (!tableGroups[t.tableId]) {
        tableGroups[t.tableId] = [];
      }
      tableGroups[t.tableId].push(t);
    });

    // Basic comparison - could be enhanced with LLM analysis
    const comparison = {};
    Object.keys(tableGroups).forEach(tableId => {
      const tableTranscripts = tableGroups[tableId];
      const totalLength = tableTranscripts.reduce((sum, t) => sum + t.transcript.length, 0);
      
      comparison[tableId] = {
        participationLevel: totalLength,
        transcriptCount: tableTranscripts.length,
        averageLength: totalLength / tableTranscripts.length
      };
    });

    return comparison;
  }

  async generateFinalReport(session) {
    const analysis = await this.analyzeSession(session);
    const stats = session.tables ? {
      totalTables: session.tableCount,
      activeTables: session.tables.filter(t => t.participants.length > 0).length,
      totalParticipants: session.participants?.length || 0
    } : {};
    
    const report = {
      sessionId: session.id,
      title: session.title,
      generatedAt: new Date().toISOString(),
      sessionStats: stats,
      llmPowered: true,
      
      // Executive Summary
      executiveSummary: {
        overallSentiment: analysis.sentiment?.overall || 0,
        sentimentInterpretation: analysis.sentiment?.interpretation || 'Unknown',
        totalConflicts: analysis.conflicts?.length || 0,
        totalAgreements: analysis.agreements?.length || 0,
        mainThemes: analysis.themes?.slice(0, 5) || [],
        participationRate: this.calculateParticipationRate(session),
        keyInsights: analysis.sentiment?.insights || []
      },
      
      // Detailed Analysis
      detailedAnalysis: analysis,
      
      // LLM-Enhanced Recommendations
      recommendations: await this.generateLLMRecommendations(analysis),
      
      // Next Steps
      nextSteps: this.suggestNextSteps(analysis, session)
    };
    
    return report;
  }

  async generateLLMRecommendations(analysis) {
    try {
      const prompt = `Based on this World Café session analysis, provide specific, actionable recommendations for the facilitator:

Conflicts found: ${analysis.conflicts.length}
Agreements found: ${analysis.agreements.length}
Main themes: ${analysis.themes.map(t => t.theme).slice(0, 5).join(', ')}
Overall sentiment: ${analysis.sentiment.overall} (${analysis.sentiment.interpretation})

Please provide 3-5 specific recommendations in JSON format:
{
  "recommendations": [
    {
      "type": "conflict_resolution|engagement|theme_development|facilitation",
      "priority": "high|medium|low",
      "title": "Short recommendation title",
      "description": "Detailed actionable advice",
      "rationale": "Why this recommendation matters"
    }
  ]
}`;

      const completion = await this.groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "You are an expert World Café facilitator providing actionable recommendations based on session analysis."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        model: this.model,
        temperature: 0.4,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });

      const response = JSON.parse(completion.choices[0].message.content);
      return response.recommendations || [];

    } catch (error) {
      console.error('Error generating LLM recommendations:', error);
      return this.generateBasicRecommendations(analysis);
    }
  }

  generateBasicRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.conflicts && analysis.conflicts.length > 3) {
      recommendations.push({
        type: 'conflict_resolution',
        priority: 'high',
        title: 'Address Identified Conflicts',
        description: 'High number of conflicts detected. Consider facilitating conflict resolution sessions.',
        rationale: `${analysis.conflicts.length} conflicts identified across tables.`
      });
    }
    
    if (analysis.sentiment && analysis.sentiment.overall < -0.2) {
      recommendations.push({
        type: 'engagement',
        priority: 'medium',
        title: 'Improve Group Sentiment',
        description: 'Overall sentiment is negative. Consider addressing underlying concerns.',
        rationale: `Overall sentiment score: ${analysis.sentiment.overall.toFixed(2)}`
      });
    }
    
    if (analysis.themes && analysis.themes.length < 3) {
      recommendations.push({
        type: 'theme_development',
        priority: 'low',
        title: 'Expand Thematic Diversity',
        description: 'Limited thematic diversity. Consider introducing more diverse discussion topics.',
        rationale: `Only ${analysis.themes.length} main themes identified.`
      });
    }
    
    return recommendations;
  }

  calculateParticipationRate(session) {
    if (!session.participants || !session.transcriptions) return 0;
    
    const tablesWithRecordings = new Set(session.transcriptions.map(t => t.tableId));
    const totalActiveTables = session.tables?.filter(t => t.participants.length > 0).length || 1;
    
    return tablesWithRecordings.size / totalActiveTables;
  }

  suggestNextSteps(analysis, session) {
    const steps = [
      'Review detailed LLM analysis results and insights',
      'Address any high-priority conflicts identified by the AI',
      'Build on agreements and consensus points highlighted in the analysis'
    ];
    
    if (analysis.themes && analysis.themes.length > 0) {
      steps.push('Develop action plans around the AI-identified main themes');
    }
    
    if (analysis.crossTableComparison) {
      const tables = Object.keys(analysis.crossTableComparison);
      if (tables.length > 1) {
        steps.push('Consider cross-table sharing sessions based on participation analysis');
      }
    }
    
    return steps;
  }
}

module.exports = LLMAnalysisService;