const { ipcRenderer } = require('electron');

// Global state
let currentSessionId = null;
let originalPrompt = '';

// UI Elements
const elements = {
    // API Keys
    openaiKey: document.getElementById('openai-key'),
    anthropicKey: document.getElementById('anthropic-key'),
    saveKeysBtn: document.getElementById('save-keys-btn'),
    
    // Prompt Section
    initialPrompt: document.getElementById('initial-prompt'),
    primaryModel: document.getElementById('primary-model'),
    refinementModel: document.getElementById('refinement-model'),
    finalReviewModel: document.getElementById('final-review-model'),
    handoffStrategy: document.getElementById('handoff-strategy'),
    iterations: document.getElementById('iterations'),
    iterationsValue: document.getElementById('iterations-value'),
    startRefinementBtn: document.getElementById('start-refinement-btn'),
    
    // Clarification Section
    clarificationSection: document.getElementById('clarification-section'),
    clarificationQuestions: document.getElementById('clarification-questions'),
    submitClarificationBtn: document.getElementById('submit-clarification-btn'),
    
    // Process Section
    processSection: document.getElementById('process-section'),
    progressBar: document.getElementById('progress-bar'),
    processTimeline: document.getElementById('process-timeline'),
    
    // Results Section
    resultsSection: document.getElementById('results-section'),
    originalPromptResult: document.getElementById('original-prompt'),
    refinedPromptResult: document.getElementById('refined-prompt'),
    finalOutput: document.getElementById('final-output'),
    copyResultBtn: document.getElementById('copy-result-btn'),
    newSessionBtn: document.getElementById('new-session-btn'),
    
    // Loading
    loadingOverlay: document.getElementById('loading-overlay'),
    loadingText: document.getElementById('loading-text')
};

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadSavedApiKeys();
});

function setupEventListeners() {
    // API Keys
    elements.saveKeysBtn.addEventListener('click', saveApiKeys);
    
    // Iterations slider
    elements.iterations.addEventListener('input', (e) => {
        elements.iterationsValue.textContent = e.target.value;
    });
    
    // Start refinement
    elements.startRefinementBtn.addEventListener('click', startRefinementProcess);
    
    // Clarification submission
    elements.submitClarificationBtn.addEventListener('click', submitClarification);
    
    // Results actions
    elements.copyResultBtn.addEventListener('click', copyResult);
    elements.newSessionBtn.addEventListener('click', startNewSession);
}

async function loadSavedApiKeys() {
    // Try to load from localStorage
    const savedOpenAI = localStorage.getItem('openai-api-key');
    const savedAnthropic = localStorage.getItem('anthropic-api-key');
    
    if (savedOpenAI) elements.openaiKey.value = savedOpenAI;
    if (savedAnthropic) elements.anthropicKey.value = savedAnthropic;
    
    // Automatically send saved keys to backend if they exist
    if (savedOpenAI || savedAnthropic) {
        try {
            const result = await ipcRenderer.invoke('set-api-keys', {
                openai: savedOpenAI || '',
                anthropic: savedAnthropic || ''
            });
            
            if (result.error) {
                console.warn('Failed to auto-load API keys:', result.error);
            } else {
                console.log('✅ API keys auto-loaded from localStorage');
            }
        } catch (error) {
            console.warn('Failed to auto-load API keys:', error.message);
        }
    }
}

async function saveApiKeys() {
    const openaiKey = elements.openaiKey.value.trim();
    const anthropicKey = elements.anthropicKey.value.trim();
    
    if (!openaiKey && !anthropicKey) {
        showError('Please enter at least one API key');
        return;
    }
    
    try {
        showLoading('Saving API keys...');
        
        const result = await ipcRenderer.invoke('set-api-keys', {
            openai: openaiKey,
            anthropic: anthropicKey
        });
        
        if (result.error) {
            showError(result.error);
        } else {
            // Save to localStorage for persistence
            if (openaiKey) localStorage.setItem('openai-api-key', openaiKey);
            if (anthropicKey) localStorage.setItem('anthropic-api-key', anthropicKey);
            
            showSuccess('API keys saved successfully!');
        }
    } catch (error) {
        showError('Failed to save API keys: ' + error.message);
    } finally {
        hideLoading();
    }
}

async function startRefinementProcess() {
    const prompt = elements.initialPrompt.value.trim();
    
    if (!prompt) {
        showError('Please enter an initial prompt');
        return;
    }
    
    originalPrompt = prompt;
    
    const finalReviewModel = elements.finalReviewModel?.value || document.getElementById('final-review-model')?.value;
    const handoffStrategy = elements.handoffStrategy?.value || document.getElementById('handoff-strategy')?.value;
    
    const config = {
        primaryModel: elements.primaryModel.value,
        refinementModel: elements.refinementModel.value,
        finalReviewModel: finalReviewModel === 'auto' ? null : finalReviewModel,
        handoffStrategy: handoffStrategy || 'model_specialization',
        iterations: parseInt(elements.iterations.value)
    };
    
    try {
        showLoading('Starting refinement process...');
        
        // Set up progress listener
        setupProgressListener();
        
        const result = await ipcRenderer.invoke('start-refinement', prompt, config, config.iterations);
        
        if (result.error) {
            showError(result.error);
            return;
        }
        
        currentSessionId = result.sessionId;
        
        if (result.needsClarification) {
            showClarificationQuestions(result.questions);
        } else {
            startProcessingTimeline(result);
        }
        
    } catch (error) {
        showError('Failed to start refinement: ' + error.message);
    } finally {
        hideLoading();
    }
}

function showClarificationQuestions(questions) {
    elements.clarificationQuestions.innerHTML = '';
    
    questions.forEach((question, index) => {
        const questionDiv = document.createElement('div');
        questionDiv.className = 'clarification-question';
        questionDiv.innerHTML = `
            <h4>Question ${index + 1}:</h4>
            <p>${question.question}</p>
            <textarea 
                class="clarification-answer" 
                data-question-id="${question.id}"
                placeholder="Your answer..."
            ></textarea>
        `;
        elements.clarificationQuestions.appendChild(questionDiv);
    });
    
    elements.clarificationSection.style.display = 'block';
    elements.clarificationSection.scrollIntoView({ behavior: 'smooth' });
}

async function submitClarification() {
    const answers = {};
    const answerElements = elements.clarificationQuestions.querySelectorAll('.clarification-answer');
    
    answerElements.forEach(textarea => {
        const questionId = textarea.dataset.questionId;
        answers[questionId] = textarea.value.trim();
    });
    
    // Validate all questions are answered
    for (const [questionId, answer] of Object.entries(answers)) {
        if (!answer) {
            showError('Please answer all clarification questions');
            return;
        }
    }
    
    try {
        showLoading('Processing clarifications...');
        
        const result = await ipcRenderer.invoke('submit-clarification', currentSessionId, answers);
        
        if (result.error) {
            showError(result.error);
            return;
        }
        
        elements.clarificationSection.style.display = 'none';
        startProcessingTimeline(result);
        
    } catch (error) {
        showError('Failed to submit clarifications: ' + error.message);
    } finally {
        hideLoading();
    }
}

function startProcessingTimeline(processData) {
    elements.processSection.style.display = 'block';
    elements.processSection.scrollIntoView({ behavior: 'smooth' });
    
    // Set up the timeline
    updateTimeline(processData.steps || []);
    
    // If the process is already complete
    if (processData.complete) {
        showResults(processData.result);
    } else {
        // Progress updates will be handled by the progress listener
        // Show initial progress state
        elements.progressBar.style.width = '0%';
        updateStatusDisplay({
            phase: 'starting',
            message: 'Initializing refinement process...',
            currentIteration: 0,
            totalIterations: processData.iterations || 2
        });
    }
}

function updateTimeline(steps) {
    elements.processTimeline.innerHTML = '';
    
    steps.forEach((step, index) => {
        const timelineItem = document.createElement('div');
        timelineItem.className = `timeline-item ${step.status || 'pending'}`;
        timelineItem.innerHTML = `
            <div class="timeline-icon">${getStepIcon(step.type, step.status)}</div>
            <div class="timeline-content">
                <h4>${step.title}</h4>
                <p>${step.description}</p>
                ${step.output ? `<div class="step-output">${step.output}</div>` : ''}
            </div>
        `;
        elements.processTimeline.appendChild(timelineItem);
    });
}

function getStepIcon(type, status) {
    if (status === 'completed') return '✅';
    if (status === 'active') return '⚙️';
    
    switch (type) {
        case 'refine': return '🔍';
        case 'generate': return '🤖';
        case 'critique': return '📝';
        case 'iterate': return '🔄';
        default: return '⏳';
    }
}

// Real-time progress tracking
let currentProgress = {
    phase: '',
    currentIteration: 0,
    totalIterations: 0,
    message: ''
};

function setupProgressListener() {
    // Remove any existing listener
    ipcRenderer.removeAllListeners('refinement-progress');
    
    // Set up new listener
    ipcRenderer.on('refinement-progress', (event, progressData) => {
        handleProgressUpdate(progressData);
    });
}

function handleProgressUpdate(progressData) {
    currentProgress = { ...currentProgress, ...progressData };
    
    // Update the loading text with current progress
    if (elements.loadingText) {
        elements.loadingText.textContent = progressData.message || 'Processing...';
    }
    
    // Update progress bar
    if (progressData.totalIterations > 0) {
        const progressPercent = (progressData.currentIteration / progressData.totalIterations) * 100;
        elements.progressBar.style.width = progressPercent + '%';
    }
    
    // Update status display
    updateStatusDisplay(progressData);
    
    // Handle completion
    if (progressData.completed && progressData.result) {
        showResults(progressData.result);
    }
}

function updateStatusDisplay(progressData) {
    const statusElement = document.getElementById('current-status');
    
    if (!statusElement) {
        // Create status element if it doesn't exist
        const statusDiv = document.createElement('div');
        statusDiv.id = 'current-status';
        statusDiv.className = 'current-status';
        statusDiv.innerHTML = '<h3>Current Progress</h3><div id="status-content"></div>';
        
        // Insert it before the progress bar
        const progressSection = elements.processSection;
        const progressBar = elements.progressBar.parentElement;
        progressSection.insertBefore(statusDiv, progressBar);
    }
    
    const statusContent = document.getElementById('status-content');
    if (statusContent) {
        const phaseIcon = getPhaseIcon(progressData.phase);
        const iterationText = progressData.totalIterations > 0 ? 
            `Iteration ${progressData.currentIteration}/${progressData.totalIterations}` : 
            'Preparing...';
        
        statusContent.innerHTML = `
            <div class="status-line">
                <span class="phase-icon">${phaseIcon}</span>
                <span class="phase-text">${progressData.message}</span>
            </div>
            <div class="iteration-info">${iterationText}</div>
            ${progressData.model ? `<div class="model-info">Using: ${progressData.model}</div>` : ''}
        `;
    }
}

function getPhaseIcon(phase) {
    const icons = {
        'starting': '🚀',
        'processing_clarifications': '🔍',
        'initial_generation': '🤖',
        'iteration_start': '🔄',
        'critique': '📝',
        'improvement': '⚙️',
        'final_review': '🎯',
        'completed': '✅'
    };
    return icons[phase] || '⏳';
}

function generateMockResult() {
    // Mock result for demonstration
    return {
        originalPrompt: originalPrompt,
        refinedPrompt: `Refined version of: ${originalPrompt}\n\nWith additional context, clarity, and specific requirements based on clarifications.`,
        finalOutput: `This is the final output generated through collaborative refinement between multiple LLMs.\n\nThe process involved:\n1. Initial prompt analysis\n2. Clarification gathering\n3. Iterative refinement\n4. Quality improvement\n\nFinal result: A comprehensive response that addresses the original request with enhanced quality and relevance.`,
        iterationDetails: [
            { model: 'GPT-4o', iteration: 1, improvement: 'Enhanced clarity and structure' },
            { model: 'Claude 4', iteration: 2, improvement: 'Added depth and examples' },
            { model: 'GPT-4o', iteration: 3, improvement: 'Refined language and flow' }
        ]
    };
}

function showResults(result) {
    elements.processSection.style.display = 'none';
    elements.resultsSection.style.display = 'block';
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
    
    elements.originalPromptResult.textContent = result.originalPrompt;
    elements.refinedPromptResult.textContent = result.refinedPrompt;
    elements.finalOutput.textContent = result.finalOutput;
}

function copyResult() {
    const result = elements.finalOutput.textContent;
    navigator.clipboard.writeText(result).then(() => {
        showSuccess('Result copied to clipboard!');
    }).catch(() => {
        showError('Failed to copy to clipboard');
    });
}

function startNewSession() {
    // Reset the UI
    currentSessionId = null;
    originalPrompt = '';
    
    elements.initialPrompt.value = '';
    elements.clarificationSection.style.display = 'none';
    elements.processSection.style.display = 'none';
    elements.resultsSection.style.display = 'none';
    elements.progressBar.style.width = '0%';
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showLoading(text) {
    elements.loadingText.textContent = text;
    elements.loadingOverlay.style.display = 'flex';
}

function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
}

function showError(message) {
    // Simple error display - could be enhanced with a proper modal
    alert('Error: ' + message);
}

function showSuccess(message) {
    // Simple success display - could be enhanced with a proper notification
    alert('Success: ' + message);
} 