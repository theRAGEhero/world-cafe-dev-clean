const natural = require('natural');
const sentiment = require('sentiment');
const nlp = require('compromise');

class AnalysisService {
  constructor() {
    this.sentiment = new sentiment();
    this.stemmer = natural.PorterStemmer;
    this.tokenizer = new natural.WordTokenizer();
    
    // Analysis prompts - configurable by admin
    this.prompts = {
      conflictDetection: {
        title: "Conflict Detection",
        prompt: "Identify disagreements, opposing viewpoints, and tensions between participants",
        keywords: ["disagree", "oppose", "conflict", "wrong", "against", "but", "however", "dispute", "argue"]
      },
      agreementDetection: {
        title: "Agreement Detection", 
        prompt: "Identify areas of consensus, shared values, and common ground",
        keywords: ["agree", "yes", "exactly", "same", "support", "consensus", "together", "shared", "common"]
      },
      themeExtraction: {
        title: "Theme Extraction",
        prompt: "Extract main topics, recurring themes, and key discussion points",
        keywords: []
      },
      sentimentAnalysis: {
        title: "Sentiment Analysis",
        prompt: "Analyze emotional tone and participant engagement levels",
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

  async analyzeSession(session) {
    if (!session.transcriptions || session.transcriptions.length === 0) {
      return {
        conflicts: [],
        agreements: [],
        themes: [],
        sentiment: { overall: 0, byTable: {} },
        participationStats: {},
        summary: "No transcriptions available for analysis"
      };
    }

    const analysis = {
      conflicts: await this.detectConflicts(session.transcriptions),
      agreements: await this.detectAgreements(session.transcriptions),
      themes: await this.extractThemes(session.transcriptions),
      sentiment: await this.analyzeSentiment(session.transcriptions),
      participationStats: this.calculateParticipationStats(session.transcriptions),
      crossTableComparison: await this.compareTables(session.transcriptions)
    };

    return analysis;
  }

  async detectConflicts(transcriptions) {
    const conflicts = [];
    const conflictKeywords = this.prompts.conflictDetection.keywords;
    
    for (const transcript of transcriptions) {
      const text = transcript.transcript.toLowerCase();
      const sentences = text.split(/[.!?]+/);
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        const hasConflictIndicator = conflictKeywords.some(keyword => 
          sentence.includes(keyword)
        );
        
        if (hasConflictIndicator) {
          // Look for disagreement patterns
          const sentimentScore = this.sentiment.analyze(sentence);
          
          if (sentimentScore.score < -2) { // Negative sentiment threshold
            conflicts.push({
              tableId: transcript.tableId,
              text: sentence,
              severity: this.calculateConflictSeverity(sentence, sentimentScore),
              timestamp: transcript.timestamp,
              context: this.getContext(sentences, i),
              keywords: conflictKeywords.filter(k => sentence.includes(k))
            });
          }
        }
      }
      
      // Analyze speaker disagreements
      if (transcript.speakers && transcript.speakers.length > 1) {
        const speakerConflicts = this.detectSpeakerDisagreements(transcript.speakers);
        conflicts.push(...speakerConflicts.map(c => ({
          ...c,
          tableId: transcript.tableId,
          timestamp: transcript.timestamp
        })));
      }
    }
    
    return conflicts.sort((a, b) => b.severity - a.severity);
  }

  async detectAgreements(transcriptions) {
    const agreements = [];
    const agreementKeywords = this.prompts.agreementDetection.keywords;
    
    for (const transcript of transcriptions) {
      const text = transcript.transcript.toLowerCase();
      const sentences = text.split(/[.!?]+/);
      
      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i].trim();
        const hasAgreementIndicator = agreementKeywords.some(keyword => 
          sentence.includes(keyword)
        );
        
        if (hasAgreementIndicator) {
          const sentimentScore = this.sentiment.analyze(sentence);
          
          if (sentimentScore.score > 1) { // Positive sentiment threshold
            agreements.push({
              tableId: transcript.tableId,
              text: sentence,
              strength: this.calculateAgreementStrength(sentence, sentimentScore),
              timestamp: transcript.timestamp,
              context: this.getContext(sentences, i),
              keywords: agreementKeywords.filter(k => sentence.includes(k))
            });
          }
        }
      }
    }
    
    return agreements.sort((a, b) => b.strength - a.strength);
  }

  async extractThemes(transcriptions) {
    const allText = transcriptions.map(t => t.transcript).join(' ');
    const doc = nlp(allText);
    
    // Extract nouns and noun phrases as potential themes
    const nouns = doc.nouns().out('array');
    const topics = doc.topics().out('array');
    
    // Count frequency of themes
    const themeFrequency = {};
    [...nouns, ...topics].forEach(theme => {
      const normalized = theme.toLowerCase();
      if (normalized.length > 2) { // Filter short words
        themeFrequency[normalized] = (themeFrequency[normalized] || 0) + 1;
      }
    });
    
    // Get top themes
    const themes = Object.entries(themeFrequency)
      .filter(([theme, count]) => count >= 2) // Minimum occurrence
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([theme, count]) => ({
        theme,
        frequency: count,
        tables: this.getThemeDistribution(theme, transcriptions),
        sentiment: this.getThemeSentiment(theme, transcriptions)
      }));
    
    return themes;
  }

  async analyzeSentiment(transcriptions) {
    let overallScore = 0;
    let totalSentences = 0;
    const byTable = {};
    
    for (const transcript of transcriptions) {
      const sentimentScore = this.sentiment.analyze(transcript.transcript);
      const normalizedScore = this.normalizeSentiment(sentimentScore);
      
      byTable[transcript.tableId] = normalizedScore;
      
      const sentences = transcript.transcript.split(/[.!?]+/).length;
      overallScore += normalizedScore * sentences;
      totalSentences += sentences;
    }
    
    return {
      overall: totalSentences > 0 ? overallScore / totalSentences : 0,
      byTable,
      interpretation: this.interpretSentiment(overallScore / totalSentences)
    };
  }

  calculateParticipationStats(transcriptions) {
    const stats = {
      totalTables: new Set(transcriptions.map(t => t.tableId)).size,
      averageTranscriptLength: 0,
      tablesWithMultipleSpeakers: 0,
      speakerDistribution: {}
    };
    
    let totalLength = 0;
    
    for (const transcript of transcriptions) {
      totalLength += transcript.transcript.length;
      
      if (transcript.speakers && transcript.speakers.length > 1) {
        stats.tablesWithMultipleSpeakers++;
        
        transcript.speakers.forEach(speaker => {
          const speakerId = `Table${transcript.tableId}_Speaker${speaker.speaker}`;
          if (!stats.speakerDistribution[speakerId]) {
            stats.speakerDistribution[speakerId] = {
              tableId: transcript.tableId,
              speaker: speaker.speaker,
              wordCount: 0,
              duration: 0
            };
          }
          stats.speakerDistribution[speakerId].wordCount += speaker.transcript.split(' ').length;
          stats.speakerDistribution[speakerId].duration += (speaker.end - speaker.start);
        });
      }
    }
    
    stats.averageTranscriptLength = totalLength / transcriptions.length;
    
    return stats;
  }

  async compareTables(transcriptions) {
    const tableAnalysis = {};
    
    for (const transcript of transcriptions) {
      const tableId = transcript.tableId;
      
      if (!tableAnalysis[tableId]) {
        tableAnalysis[tableId] = {
          sentiment: 0,
          themes: [],
          conflicts: 0,
          agreements: 0,
          participationLevel: 0
        };
      }
      
      // Analyze this table's content
      const sentimentScore = this.sentiment.analyze(transcript.transcript);
      tableAnalysis[tableId].sentiment = this.normalizeSentiment(sentimentScore);
      tableAnalysis[tableId].participationLevel = transcript.transcript.length;
      
      // Count conflicts and agreements for this table
      const conflicts = await this.detectConflicts([transcript]);
      const agreements = await this.detectAgreements([transcript]);
      
      tableAnalysis[tableId].conflicts = conflicts.length;
      tableAnalysis[tableId].agreements = agreements.length;
    }
    
    return tableAnalysis;
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
      
      // Executive Summary
      executiveSummary: {
        overallSentiment: analysis.sentiment?.overall || 0,
        totalConflicts: analysis.conflicts?.length || 0,
        totalAgreements: analysis.agreements?.length || 0,
        mainThemes: analysis.themes?.slice(0, 5) || [],
        participationRate: this.calculateParticipationRate(session)
      },
      
      // Detailed Analysis
      detailedAnalysis: analysis,
      
      // Recommendations
      recommendations: this.generateRecommendations(analysis),
      
      // Next Steps
      nextSteps: this.suggestNextSteps(analysis, session)
    };
    
    return report;
  }

  // Helper methods
  
  calculateConflictSeverity(sentence, sentimentScore) {
    const baseScore = Math.abs(sentimentScore.score) / 10; // Normalize to 0-1
    const negativeWords = sentimentScore.negative.length;
    const intensity = (negativeWords + Math.abs(sentimentScore.score)) / 10;
    return Math.min(1, baseScore + intensity);
  }

  calculateAgreementStrength(sentence, sentimentScore) {
    const positiveWords = sentimentScore.positive.length;
    const intensity = (positiveWords + sentimentScore.score) / 10;
    return Math.min(1, Math.max(0, intensity));
  }

  getContext(sentences, index) {
    const start = Math.max(0, index - 1);
    const end = Math.min(sentences.length, index + 2);
    return sentences.slice(start, end).join('. ').trim();
  }

  detectSpeakerDisagreements(speakers) {
    const disagreements = [];
    // Simple heuristic: look for opposing sentiments between consecutive speakers
    for (let i = 1; i < speakers.length; i++) {
      const prev = this.sentiment.analyze(speakers[i-1].transcript);
      const curr = this.sentiment.analyze(speakers[i].transcript);
      
      if (prev.score > 0 && curr.score < -2 || prev.score < -2 && curr.score > 0) {
        disagreements.push({
          speakers: [speakers[i-1].speaker, speakers[i].speaker],
          texts: [speakers[i-1].transcript, speakers[i].transcript],
          severity: Math.abs(prev.score - curr.score) / 20
        });
      }
    }
    return disagreements;
  }

  getThemeDistribution(theme, transcriptions) {
    const distribution = {};
    transcriptions.forEach(t => {
      if (t.transcript.toLowerCase().includes(theme.toLowerCase())) {
        distribution[t.tableId] = (distribution[t.tableId] || 0) + 1;
      }
    });
    return distribution;
  }

  getThemeSentiment(theme, transcriptions) {
    let totalScore = 0;
    let count = 0;
    
    transcriptions.forEach(t => {
      if (t.transcript.toLowerCase().includes(theme.toLowerCase())) {
        const score = this.sentiment.analyze(t.transcript);
        totalScore += this.normalizeSentiment(score);
        count++;
      }
    });
    
    return count > 0 ? totalScore / count : 0;
  }

  normalizeSentiment(sentimentScore) {
    // Normalize sentiment to -1 to 1 scale
    return Math.max(-1, Math.min(1, sentimentScore.score / 10));
  }

  interpretSentiment(score) {
    if (score > 0.3) return 'Very Positive';
    if (score > 0.1) return 'Positive';
    if (score > -0.1) return 'Neutral';
    if (score > -0.3) return 'Negative';
    return 'Very Negative';
  }

  calculateParticipationRate(session) {
    if (!session.participants || !session.transcriptions) return 0;
    
    const tablesWithRecordings = new Set(session.transcriptions.map(t => t.tableId));
    const totalActiveTables = session.tables?.filter(t => t.participants.length > 0).length || 1;
    
    return tablesWithRecordings.size / totalActiveTables;
  }

  generateRecommendations(analysis) {
    const recommendations = [];
    
    if (analysis.conflicts && analysis.conflicts.length > 5) {
      recommendations.push({
        type: 'conflict_resolution',
        priority: 'high',
        message: 'High number of conflicts detected. Consider facilitating conflict resolution sessions.',
        details: `${analysis.conflicts.length} conflicts identified across tables.`
      });
    }
    
    if (analysis.sentiment && analysis.sentiment.overall < -0.2) {
      recommendations.push({
        type: 'sentiment_improvement',
        priority: 'medium',
        message: 'Overall sentiment is negative. Consider addressing underlying concerns.',
        details: `Overall sentiment score: ${analysis.sentiment.overall.toFixed(2)}`
      });
    }
    
    if (analysis.themes && analysis.themes.length < 3) {
      recommendations.push({
        type: 'theme_development',
        priority: 'low',
        message: 'Limited thematic diversity. Consider introducing more diverse discussion topics.',
        details: `Only ${analysis.themes.length} main themes identified.`
      });
    }
    
    return recommendations;
  }

  suggestNextSteps(analysis, session) {
    const steps = [
      'Review detailed conflict analysis and plan mediation if needed',
      'Share agreement highlights with participants to build on consensus',
      'Develop action plans around the main themes identified'
    ];
    
    if (analysis.crossTableComparison) {
      const tables = Object.keys(analysis.crossTableComparison);
      if (tables.length > 1) {
        steps.push('Consider cross-table sharing sessions to exchange insights');
      }
    }
    
    return steps;
  }
}

module.exports = AnalysisService;