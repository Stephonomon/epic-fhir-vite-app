# Epic FHIR EHR Assistant - Refactored Architecture

## Overview

The Epic FHIR EHR Assistant has been refactored to provide a more modular, scalable, and maintainable architecture. The application now supports all authorized FHIR resources with dynamic querying capabilities.

## Key Improvements

### 1. Modular Architecture

The application is now organized into distinct modules:

- **`main.js`** - Application entry point and orchestration
- **`fhirTools.js`** - Dynamic FHIR resource handling with function calling
- **`dataFetcher.js`** - Centralized data fetching with caching and retry logic
- **`uiManager.js`** - All UI operations and DOM manipulation
- **`chatManager.js`** - Chat interface and conversation management
- **`configManager.js`** - Configuration and settings management
- **`fhirClient.js`** - FHIR client wrapper (unchanged)
- **`fhirUtils.js`** - FHIR data processing utilities
- **`summarizers.js`** - Data summarization for chat context

### 2. Supported FHIR Resources

The refactored application now supports all authorized resources:

- **AllergyIntolerance** - Patient allergies and intolerances
- **Appointment** - Scheduled appointments and surgeries
- **Condition** - Problems, diagnoses, health concerns
- **DiagnosticReport** - Lab results and diagnostic reports
- **DocumentReference** - Clinical notes and documents
- **Encounter** - Patient visits and encounters
- **Immunization** - Vaccination records
- **Medication** - Medication definitions
- **MedicationRequest** - Medication orders and prescriptions
- **Observation** - Vital signs, labs, social history
- **Patient** - Patient demographics
- **Procedure** - Procedures and surgeries
- **Questionnaire** - Patient questionnaires
- **QuestionnaireResponse** - Questionnaire responses

### 3. Dynamic FHIR Querying

The enhanced chat mode now supports dynamic FHIR queries through function calling:

```javascript
// Example tool definitions generated dynamically
{
  name: "search_allergyintolerance",
  description: "Search for AllergyIntolerance resources with flexible filtering",
  parameters: {
    clinical_status: "active|inactive|resolved",
    type: "allergy|intolerance",
    category: "food|medication|environment|biologic",
    criticality: "low|high|unable-to-assess",
    date_start: "YYYY-MM-DD",
    date_end: "YYYY-MM-DD",
    text_search: "Search text",
    count: 25
  }
}
```

### 4. Improved Data Fetching

The `DataFetcherService` provides:

- **Automatic retry with fallback queries** - Handles Epic-specific query limitations
- **Request caching** - Reduces redundant API calls
- **Batch fetching** - Load multiple resources efficiently
- **Configurable options** - Control count, sorting, date ranges

Example usage:
```javascript
const dataFetcher = new DataFetcherService(client, backendUrl);

// Fetch with options
const vitals = await dataFetcher.fetchData('VitalSigns', {
  count: 50,
  dateRange: { start: '2024-01-01', end: '2024-12-31' },
  useCache: true
});

// Batch fetch multiple resources
const results = await dataFetcher.batchFetch([
  'VitalSigns', 'MedicationRequests', 'Conditions'
]);
```

### 5. Centralized UI Management

The `UIManager` class handles all UI operations:

- Patient information display
- Chat interface management
- Search history tracking
- Data inspector functionality
- Settings panel control
- Error handling and notifications

### 6. Enhanced Configuration

The `ConfigManager` provides:

- Persistent settings storage
- Resource-specific configurations
- Event-driven updates
- Import/export functionality

## File Structure

```
src/
├── main.js              # Application entry point
├── fhirTools.js         # Dynamic FHIR tools for LLM
├── dataFetcher.js       # Data fetching service
├── uiManager.js         # UI management
├── chatManager.js       # Chat interface management
├── configManager.js     # Configuration management
├── fhirClient.js        # FHIR client wrapper
├── fhirUtils.js         # FHIR data utilities
├── summarizers.js       # Data summarization
├── openaiChat.js        # Basic chat implementation
├── openaiChatEnhanced.js # Enhanced chat with function calling
└── style.css            # Application styles
```

## Usage

### Basic Usage

```javascript
// Initialize the application
const app = new EHRAssistantApp();
await app.init();
```

### Configuration

```javascript
// Update configuration
configManager.updateConfig({
  includeAllergies: true,
  allergyCount: 20,
  useEnhancedChat: true
});

// Get current configuration
const config = configManager.getConfig();

// Listen for configuration changes
configManager.on('configChange', (newConfig, oldConfig) => {
  console.log('Configuration updated:', newConfig);
});
```

### Data Fetching

```javascript
// Fetch specific resource
const allergies = await dataFetcher.fetchData('AllergyIntolerances', {
  count: 10,
  useCache: true
});

// Clear cache
dataFetcher.clearCache('AllergyIntolerances');
```

### Enhanced Chat

The enhanced chat mode automatically:
- Detects user intent from natural language
- Executes appropriate FHIR queries
- Formats results for clear presentation
- Maintains conversation context

Example interactions:
- "Show me all active allergies"
- "What medications is the patient taking?"
- "Find lab results from the last 6 months"
- "List all encounters in 2024"

## Development

### Adding New Resources

1. Add resource configuration to `FHIR_RESOURCES` in `fhirTools.js`
2. Add fetch configuration to `FETCH_CONFIGS` in `dataFetcher.js`
3. Add formatter method if needed in `fhirTools.js`
4. Update configuration options in `configManager.js`

### Testing

```bash
npm test
```

### Building

```bash
npm run build
```

## Security Notes

- All FHIR requests go through the backend proxy
- Access tokens are managed by the SMART on FHIR client
- No sensitive data is stored in localStorage
- All API keys should be stored in environment variables

## Future Enhancements

1. **Advanced Analytics** - Trend analysis and data visualization
2. **Bulk Operations** - Export and import patient data
3. **Custom Queries** - User-defined FHIR queries
4. **Offline Support** - Progressive web app capabilities
5. **Multi-patient Support** - Switch between patients
6. **Plugin System** - Extensible architecture for custom features



Pushing to both gits via Command Line
git push -u azure --all
git remote -v

## For pull requests across both
git checkout main
git merge development  # resolves locally
git push github main
git push azure main