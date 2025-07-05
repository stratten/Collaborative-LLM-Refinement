# Collaborative LLM Refinement POC

A proof-of-concept Electron application that demonstrates collaborative prompt refinement and multi-LLM iteration, inspired by the workflow described in the Twitter thread about passing prompts between multiple SOTA LLMs.

## Features

**Multi-LLM Support**: Works with OpenAI (GPT-4o, GPT-4 Turbo) and Anthropic (Claude 3.5 Sonnet) models
**Intelligent Prompt Analysis**: Analyzes initial prompts for clarity, completeness, and specificity
**Interactive Clarification**: Asks follow-up questions when prompts need refinement
**Iterative Refinement**: Multiple rounds of critique and improvement between models
**Process Visualization**: Real-time timeline showing the refinement process
**Clean UI**: Modern, responsive interface with progress tracking

## Workflow

1. **Initial Prompt**: User enters their prompt
2. **Analysis**: System analyzes prompt quality and may ask clarifying questions
3. **Refinement**: User answers questions, system refines the prompt
4. **Collaborative Generation**: 
   - Primary model generates initial response
   - Refinement model critiques and suggests improvements
   - Primary model implements improvements
   - Process repeats for N iterations
5. **Final Review**: Final quality check and polishing
6. **Results**: User receives the refined output with full process history

## Setup

### Prerequisites

- Node.js 18+
- OpenAI API Key (for GPT models)
- Anthropic API Key (for Claude models)
- At least one API key is required

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the application**:
   ```bash
   npm start
   ```
   
   Or for development mode with DevTools:
   ```bash
   npm run dev
   ```

### Configuration

1. Launch the app
2. Enter your API keys in the configuration section
3. Select your preferred models:
   - **Primary Model**: Generates the main responses
   - **Refinement Model**: Provides critique and suggestions
4. Set the number of refinement iterations (1-5)

## Usage

1. **Enter your prompt** in the text area
2. **Select models** and iteration count
3. **Click "Start Refinement"**
4. **Answer any clarification questions** if prompted
5. **Watch the process** unfold in real-time
6. **Review the results** and copy the final output

## Technical Architecture

### Frontend (Electron Renderer)
- `renderer/index.html` - Main UI
- `renderer/style.css` - Styling
- `renderer/script.js` - UI logic and IPC communication

### Backend (Node.js)
- `main.js` - Electron main process
- `backend/refinement-orchestrator.js` - Core workflow orchestration
- `backend/llm-client.js` - API communication with LLM providers
- `backend/prompt-refiner.js` - Prompt analysis and refinement logic

### Key Components

- **RefinementOrchestrator**: Manages the entire workflow
- **LLMClient**: Handles API calls to OpenAI and Anthropic
- **PromptRefiner**: Analyzes prompts and generates clarification questions

## Example Use Cases

- **Content Creation**: Refine blog post ideas into comprehensive outlines
- **Technical Documentation**: Transform brief requirements into detailed specifications
- **Creative Writing**: Develop story concepts into rich narratives
- **Business Planning**: Evolve simple ideas into detailed strategic plans

## API Costs

This POC makes multiple API calls per refinement session:
- 1 call for prompt analysis
- 2-4 calls for clarification questions (if needed)
- 1 call for prompt refinement
- 2 calls per iteration (critique + improvement)
- 1 call for final review

**Example**: 3 iterations = ~8-12 API calls total

## Limitations

- Requires internet connection for LLM APIs
- API costs accumulate with usage
- Processing time depends on model response times
- Currently supports OpenAI and Anthropic only

## Future Enhancements

- Add support for more LLM providers
- Implement conversation history and session saving
- Add model-specific prompt templates
- Real-time streaming for longer processes
- Export options for refined prompts and results
- Advanced analytics and improvement tracking

## Contributing

This is a proof-of-concept built with love (and help from Jarvish). Feel free to extend and modify for your specific needs.

## License

MIT License - Feel free to use and modify as needed. 
