# Table-Level & Session-Level Analysis Implementation

## ✅ Implementation Complete

This document describes the implementation of context-aware AI analysis that provides both **table-level analysis** (for individual table discussions) and **session-level analysis** (for cross-table insights).

## 🎯 Key Features Implemented

### **Context-Aware Analysis Triggering**
- **Table Interface**: "Generate Analysis" button → Analyzes only that specific table
- **Session Dashboard**: "🤖 AI Analysis" button → Analyzes entire session across all tables
- **Automatic Detection**: System determines context and triggers appropriate analysis

### **Table-Level Analysis**
- ✅ **Multiple Recordings Aggregation**: Combines all recordings from same table chronologically
- ✅ **Recording Break Markers**: Inserts `--- [Recording Break] ---` between separate recordings
- ✅ **Context Preservation**: Maintains conversation flow across technical interruptions
- ✅ **Metadata Tracking**: Records count, duration, quality scores, time spans
- ✅ **Speaker Continuity**: Handles speaker identification across multiple recordings

### **Session-Level Analysis** 
- ✅ **Cross-Table Insights**: Themes and patterns across all tables
- ✅ **Comparative Analysis**: Table sentiment comparison and distribution
- ✅ **Session-Wide Conflicts**: Disagreements that span multiple tables
- ✅ **Global Agreements**: Consensus points across the entire session

## 🏗️ Technical Implementation

### **Database Schema Changes**
```sql
-- New table structure supports both scopes
session_analyses (
  table_id INT NULL,                    -- NULL for session-level, ID for table-level
  analysis_scope ENUM('session', 'table') DEFAULT 'session',
  UNIQUE KEY (session_id, table_id, analysis_type, analysis_scope)
)
```

### **API Endpoints**
```javascript
// Table-specific analysis
POST /api/tables/:tableId/analysis/generate
GET  /api/tables/:tableId/analysis

// Session-wide analysis  
POST /api/sessions/:sessionId/analysis/generate
GET  /api/sessions/:sessionId/analysis/scope/session
GET  /api/sessions/:sessionId/analysis/scope/table
```

### **Frontend Integration**

#### **Session Dashboard**
- **Location**: Session Dashboard screen (main admin interface)
- **Button**: "🤖 AI Analysis" in the dashboard stats section
- **Display**: Compact analysis summary with key metrics
- **Navigation**: Links to full report and table breakdowns

#### **Table Interface**  
- **Location**: Individual table interface
- **Button**: "Generate Analysis" (existing button, now context-aware)
- **Display**: Full table-specific analysis report
- **Navigation**: Links to session analysis for comparison

## 📊 User Experience Flow

### **Session-Level Analysis Flow**
1. **Admin in Session Dashboard** clicks "🤖 AI Analysis"
2. **System analyzes ALL tables** in the session
3. **Compact summary appears** in dashboard with:
   - Total themes, conflicts, agreements, sentiment
   - Top 3 session themes with frequency
   - Sentiment indicators for each table
4. **"View Full Report"** button opens detailed cross-table analysis

### **Table-Level Analysis Flow**  
1. **Participant/facilitator in Table X** clicks "Generate Analysis"
2. **System finds ALL recordings for Table X** (handles multiple recordings)
3. **Recordings combined chronologically** with break markers:
   ```
   Recording 1: "Let's discuss the budget..."
   --- [Recording Break] ---
   Recording 2: "As I was saying about the budget..."
   ```
4. **Table-specific report** shows themes/conflicts/sentiment for just that table
5. **"View Session Analysis"** button switches to session-wide view

## 🔄 Data Flow Architecture

### **Table Analysis Data Flow**
```
Table Interface → generateTableAnalysis() 
                → /api/tables/5/analysis/generate
                → aggregateTableTranscriptions() 
                → analyzeTable() 
                → Save with scope='table', table_id=5
                → displayTableAnalysisReport()
```

### **Session Analysis Data Flow**
```
Session Dashboard → generateSessionAnalysisFromDashboard()
                  → /api/sessions/abc/analysis/generate  
                  → analyzeSession()
                  → Save with scope='session', table_id=NULL
                  → displaySessionAnalysisInDashboard()
```

## 📝 Database Storage Examples

### **Table-Level Analysis Record**
```json
{
  "session_id": "abc123",
  "table_id": 5,
  "analysis_scope": "table", 
  "analysis_type": "themes",
  "analysis_data": {
    "themes": [...],
    "table_id": 5,
    "recording_count": 3
  }
}
```

### **Session-Level Analysis Record**
```json
{
  "session_id": "abc123", 
  "table_id": null,
  "analysis_scope": "session",
  "analysis_type": "themes", 
  "analysis_data": {
    "themes": [...],
    "cross_table_distribution": {...}
  }
}
```

## 🎨 UI Components Added

### **Session Dashboard Analysis Section**
- **Compact stats grid**: Themes, conflicts, agreements, sentiment
- **Theme tags**: Top session themes with frequency indicators
- **Table sentiment grid**: Emoji indicators for each table's mood
- **Action buttons**: View full report, table breakdown

### **Enhanced Analysis Reports**
- **Table reports**: Include table number, recording count, break markers context
- **Session reports**: Cross-table comparisons, table distribution charts  
- **Navigation**: Seamless switching between table and session views

## 🔧 Technical Specifications

### **Recording Aggregation Algorithm**
```javascript
function aggregateTableTranscriptions(tableTranscriptions) {
  // 1. Sort chronologically by created_at
  // 2. Combine with recording break markers
  // 3. Preserve speaker segments across recordings
  // 4. Generate metadata (count, duration, quality)
  // 5. Return unified transcription object
}
```

### **Context Detection Logic**
```javascript
function generateAnalysis() {
  const currentScreen = document.querySelector('.screen.active');
  const isTableInterface = currentScreen?.id === 'tableInterface';
  
  if (isTableInterface && currentTable) {
    generateTableAnalysis();    // Table-level
  } else {
    generateSessionAnalysis();  // Session-level
  }
}
```

## 🚀 Ready for Production

The implementation is **complete and ready for use**:

- ✅ **Database migrations** run successfully
- ✅ **API endpoints** handle both scopes correctly
- ✅ **Frontend integration** detects context automatically  
- ✅ **UI components** display appropriate analysis type
- ✅ **CSS styles** support both compact and full views
- ✅ **Error handling** for missing data or API failures

## 📍 Button Locations

### **Session Dashboard AI Analysis Button**
- **Location**: Session Dashboard screen → Stats section
- **Position**: Between "Recordings" stat and "QR Codes" button  
- **Style**: Primary blue button with "🤖 AI Analysis" text
- **Function**: `generateSessionAnalysisFromDashboard()`

### **Table Interface Analysis Button**  
- **Location**: Table Interface screen → Controls section
- **Position**: Existing "Generate Analysis" button (now context-aware)
- **Function**: `generateAnalysis()` (detects table context automatically)

The **Session Dashboard now has a prominent AI Analysis button** that provides session-wide insights, while the **Table Interface continues to provide table-specific analysis**. The system automatically determines which type of analysis to perform based on the current interface context.