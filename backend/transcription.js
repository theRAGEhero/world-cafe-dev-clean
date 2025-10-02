const { createClient } = require('@deepgram/sdk');
const fs = require('fs');
require('dotenv').config();

class DeepgramSTT {
    constructor() {
        if (!process.env.DEEPGRAM_API_KEY) {
            throw new Error('DEEPGRAM_API_KEY environment variable is required');
        }
        
        this.deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    }

    async transcribeFile(audioFilePath, options = {}, retries = 2) {
        try {
            if (!fs.existsSync(audioFilePath)) {
                throw new Error(`Audio file not found: ${audioFilePath}`);
            }

            const audioBuffer = fs.readFileSync(audioFilePath);
            
            const defaultOptions = {
                model: 'nova-2-general',
                language: options.language || 'en-US',
                smart_format: true,
                punctuate: true,
                diarize: true,
                utterances: true,
                paragraphs: true,
                utt_split: 0.8,
                multichannel: false,
                ...options
            };

            console.log(`🌍 Backend transcription language: ${defaultOptions.language}`);
            console.log(`🔍 Audio buffer size: ${audioBuffer.length} bytes`);
            console.log(`🔧 Transcription options:`, JSON.stringify(defaultOptions, null, 2));
            
            try {
                const { result, error } = await this.deepgram.listen.prerecorded.transcribeFile(
                    audioBuffer,
                    defaultOptions
                );
                
                if (error) {
                    console.error(`❌ Deepgram API returned error:`, error);
                    throw error;
                }
                
                console.log(`✅ Transcription successful`);
                return result;
                
            } catch (apiError) {
                console.error(`💥 Deepgram API call failed:`, apiError);
                
                // Check if this is the HTML response error and we have retries left
                if (apiError.message && apiError.message.includes('Unexpected token') && retries > 0) {
                    console.warn(`🔄 HTML response detected, retrying... (${retries} attempts left)`);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                    return this.transcribeFile(audioFilePath, options, retries - 1);
                }
                
                if (apiError.message && apiError.message.includes('Unexpected token')) {
                    console.error(`🔍 Looks like we got HTML instead of JSON. This usually indicates:
                    1. Network proxy interfering with the request
                    2. Firewall blocking the request
                    3. Rate limiting from Deepgram
                    4. API endpoint issues`);
                }
                
                throw apiError;
            }
        } catch (error) {
            console.error('Error transcribing file:', error);
            throw error;
        }
    }

    async transcribeUrl(audioUrl, options = {}) {
        try {
            const defaultOptions = {
                model: 'nova-2-general',
                language: options.language || 'en-US',
                smart_format: true,
                punctuate: true,
                diarize: true,
                utterances: true,
                paragraphs: true,
                utt_split: 0.8,
                multichannel: false,
                ...options
            };

            const { result, error } = await this.deepgram.listen.prerecorded.transcribeUrl(
                { url: audioUrl },
                defaultOptions
            );

            if (error) {
                throw error;
            }

            return result;
        } catch (error) {
            console.error('Error transcribing URL:', error);
            throw error;
        }
    }

    async startLiveTranscription(options = {}) {
        try {
            const defaultOptions = {
                model: 'nova-2-general',
                language: options.language || 'en-US',
                smart_format: true,
                punctuate: true,
                interim_results: true,
                diarize: true,
                utterance_end_ms: 1000,
                ...options
            };

            console.log(`🚀 Starting live transcription with options:`, JSON.stringify(defaultOptions, null, 2));
            
            const connection = this.deepgram.listen.live(defaultOptions);
            
            return connection;
        } catch (error) {
            console.error('Error starting live transcription:', error);
            throw error;
        }
    }

    extractTranscript(result) {
        if (!result || !result.results || !result.results.channels) {
            return '';
        }

        return result.results.channels[0]?.alternatives?.[0]?.transcript || '';
    }

    extractWords(result) {
        if (!result || !result.results || !result.results.channels) {
            return [];
        }

        return result.results.channels[0]?.alternatives?.[0]?.words || [];
    }

    extractUtterances(result) {
        if (!result || !result.results || !result.results.utterances) {
            return [];
        }

        return result.results.utterances || [];
    }

    extractSpeakerSegments(result) {
        const utterances = this.extractUtterances(result);
        if (!utterances.length) {
            return [];
        }

        const segments = utterances.map(utterance => ({
            speaker: utterance.speaker !== undefined ? utterance.speaker : 0,
            transcript: utterance.transcript,
            start: utterance.start,
            end: utterance.end,
            confidence: utterance.confidence,
            words: utterance.words || []
        }));

        // Only use real speaker diarization from Deepgram
        // Don't create artificial speakers for single-speaker recordings
        return segments;
    }

    createArtificialSpeakerTurns(segments) {
        // Create speaker turns based on longer pauses between utterances
        const artificialSegments = [];
        let currentSpeaker = 0;
        
        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const nextSegment = segments[i + 1];
            
            // If there's a pause of more than 1 second, switch speaker
            if (nextSegment && (nextSegment.start - segment.end) > 1.0) {
                currentSpeaker = currentSpeaker === 0 ? 1 : 0;
            }
            
            artificialSegments.push({
                ...segment,
                speaker: currentSpeaker
            });
        }
        
        return artificialSegments;
    }

    formatDiarizedTranscript(result) {
        const segments = this.extractSpeakerSegments(result);
        if (!segments.length) {
            return this.extractTranscript(result);
        }

        return segments
            .map(segment => `Speaker ${(segment.speaker || 0) + 1}: ${segment.transcript}`)
            .join('\n');
    }
    
    formatDiarizedTranscriptWithTimestamps(result) {
        const segments = this.extractSpeakerSegments(result);
        if (!segments.length) {
            return this.extractTranscript(result);
        }

        return segments
            .map(segment => {
                const speakerNum = (segment.speaker || 0) + 1;
                const startTime = segment.start ? ` [${Math.floor(segment.start)}s` : '';
                const endTime = segment.end ? `-${Math.floor(segment.end)}s]` : '';
                const timestamp = startTime && endTime ? `${startTime}${endTime}` : '';
                return `Speaker ${speakerNum}${timestamp}: ${segment.transcript}`;
            })
            .join('\n');
    }

    getSpeakerCount(result) {
        const segments = this.extractSpeakerSegments(result);
        const speakers = new Set(segments.map(s => s.speaker));
        return speakers.size;
    }
}

module.exports = DeepgramSTT;