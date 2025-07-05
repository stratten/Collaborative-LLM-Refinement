const { LLMClient } = require('./llm-client');
const { PromptRefiner } = require('./prompt-refiner');
const { v4: uuidv4 } = require('uuid');

/**
 * Enhanced model specialization mapping with proper hierarchy
 */
const MODEL_SPECIALIZATIONS = {
    'claude-sonnet-4': {
        strengths: ['comprehensive', 'detailed', 'analytical', 'thoughtful', 'advanced'],
        bestFor: 'comprehensive_review',
        description: 'Most advanced model for thorough analysis and final review'
    },
    'gpt-4.1': {
        strengths: ['advanced', 'nuanced', 'precise', 'technical', 'comprehensive'],
        bestFor: 'technical_precision',
        description: 'Advanced model excelling at technical precision and nuanced analysis'
    },
    'gpt-4o': {
        strengths: ['creative', 'analytical', 'technical', 'fast'],
        bestFor: 'creative_analysis',
        description: 'Fast and creative model for initial generation and creative analysis'
    },
    'gpt-4-turbo': {
        strengths: ['analytical', 'comprehensive', 'reliable', 'fast'],
        bestFor: 'analytical_processing',
        description: 'Reliable model for analytical processing and comprehensive responses'
    },
    'claude-3-5-sonnet': {
        strengths: ['balanced', 'reliable', 'clear'],
        bestFor: 'balanced_processing',
        description: 'Balanced model for reliable processing and clear communication'
    }
};

/**
 * Get appropriate model for each phase of refinement
 */
function getModelForPhase(phase, availableModels, userPreferences = {}) {
    const { finalReviewModel, handoffStrategy } = userPreferences;
    
    // If user specified a final review model and this is the final phase
    if (phase === 'final_review' && finalReviewModel && availableModels.includes(finalReviewModel)) {
        return finalReviewModel;
    }
    
    // Use handoff strategy for non-final phases
    if (handoffStrategy === 'cross_provider') {
        return getCrossProviderModel(availableModels, phase);
    } else if (handoffStrategy === 'capability_based') {
        return getCapabilityBasedModel(availableModels, phase);
    } else if (handoffStrategy === 'model_specialization') {
        return getSpecializationModel(availableModels, phase);
    }
    
    // Default fallback
    return availableModels[0];
}

/**
 * Get model based on specialization for specific phase
 */
function getSpecializationModel(availableModels, phase) {
    const phaseRequirements = {
        'initial': ['creative', 'fast'],
        'critique': ['analytical', 'comprehensive'],
        'improvement': ['technical', 'precise'],
        'final_review': ['comprehensive', 'detailed', 'advanced']
    };
    
    const required = phaseRequirements[phase] || ['balanced'];
    
    // Find best model for this phase
    for (const modelId of availableModels) {
        const specialization = MODEL_SPECIALIZATIONS[modelId];
        if (specialization && required.some(req => specialization.strengths.includes(req))) {
            return modelId;
        }
    }
    
    // Fallback to first available model
    return availableModels[0];
}

/**
 * Main orchestrator for the collaborative LLM refinement system
 * Manages the entire workflow from initial prompt to final result
 */
class RefinementOrchestrator {
    constructor() {
        this.llmClient = new LLMClient();
        this.promptRefiner = new PromptRefiner();
        this.activeSessions = new Map();
        this.availableModels = [
            { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', capabilities: ['creative', 'analytical', 'technical'] },
            { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai', capabilities: ['analytical', 'comprehensive', 'fast'] },
            { id: 'gpt-4.1', name: 'GPT-4.1', provider: 'openai', capabilities: ['advanced', 'nuanced', 'precise'] },
            { id: 'claude-sonnet-4', name: 'Claude 4 Sonnet', provider: 'anthropic', capabilities: ['thoughtful', 'detailed', 'analytical'] },
            { id: 'claude-3-5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', capabilities: ['balanced', 'reliable', 'clear'] }
        ];
        
        // Model handoff strategies for different iteration patterns
        this.handoffStrategies = {
            'cross_provider': {
                name: 'Cross-Provider Collaboration',
                description: 'Alternates between OpenAI and Anthropic models for diverse perspectives',
                getNextModel: (currentModel, iteration, totalIterations) => {
                    const openaiModels = this.availableModels.filter(m => m.provider === 'openai');
                    const anthropicModels = this.availableModels.filter(m => m.provider === 'anthropic');
                    const currentProvider = this.getModelById(currentModel)?.provider;
                    
                    if (currentProvider === 'openai') {
                        return anthropicModels[iteration % anthropicModels.length]?.id;
                    } else {
                        return openaiModels[iteration % openaiModels.length]?.id;
                    }
                }
            },
            'capability_progression': {
                name: 'Capability-Based Progression',
                description: 'Selects models based on required capabilities for each iteration phase',
                getNextModel: (currentModel, iteration, totalIterations, phase) => {
                    const phaseMap = {
                        'initial': ['creative', 'comprehensive'],
                        'critique': ['analytical', 'thoughtful'],
                        'improvement': ['precise', 'nuanced'],
                        'final': ['detailed', 'reliable']
                    };
                    
                    const requiredCapabilities = phaseMap[phase] || ['balanced'];
                    return this.selectModelByCapabilities(requiredCapabilities, currentModel);
                }
            },
            'model_specialization': {
                name: 'Model Specialization',
                description: 'Uses specific models for their specialized strengths',
                getNextModel: (currentModel, iteration, totalIterations, phase) => {
                    const specializationMap = {
                        'creative_generation': 'gpt-4o',
                        'analytical_critique': 'claude-sonnet-4',
                        'technical_improvement': 'gpt-4.1',
                        'comprehensive_review': 'claude-sonnet-4' // Use most powerful model for final review
                    };
                    
                    const phaseToSpecialization = {
                        'initial': 'creative_generation',
                        'critique': 'analytical_critique',
                        'improvement': 'technical_improvement',
                        'final': 'comprehensive_review'
                    };
                    
                    return specializationMap[phaseToSpecialization[phase]] || currentModel;
                }
            }
        };
    }

    /**
     * Set API keys for LLM providers with validation
     */
    setApiKeys(apiKeys) {
        console.log('🔑 Setting API keys for providers...');
        
        // Validate API keys format
        const validatedKeys = {};
        
        if (apiKeys.openai && apiKeys.openai.trim().startsWith('sk-')) {
            validatedKeys.openai = apiKeys.openai.trim();
            console.log('✅ OpenAI API key validated');
        } else if (apiKeys.openai) {
            console.warn('⚠️ OpenAI API key format appears invalid');
        }
        
        if (apiKeys.anthropic && apiKeys.anthropic.trim().startsWith('sk-ant-')) {
            validatedKeys.anthropic = apiKeys.anthropic.trim();
            console.log('✅ Anthropic API key validated');
        } else if (apiKeys.anthropic) {
            console.warn('⚠️ Anthropic API key format appears invalid');
        }
        
        this.llmClient.setApiKeys(validatedKeys);
        
        // Update available models based on configured keys
        this.updateAvailableModels(validatedKeys);
        
        return { success: true, enabledProviders: Object.keys(validatedKeys) };
    }

    /**
     * Update available models based on configured API keys
     */
    updateAvailableModels(apiKeys) {
        this.enabledModels = this.availableModels.filter(model => {
            return apiKeys[model.provider] !== undefined;
        });
        
        console.log(`🤖 Enabled models: ${this.enabledModels.map(m => m.id).join(', ')}`);
    }

    /**
     * Get list of available models (only those with valid API keys)
     */
    getAvailableModels() {
        return this.enabledModels || this.availableModels;
    }

    /**
     * Get available models for final review (premium models preferred)
     */
    getFinalReviewModels() {
        return this.llmClient.getFinalReviewModels();
    }

    /**
     * Get the best available model for final review
     */
    getBestFinalReviewModel() {
        return this.llmClient.getBestFinalReviewModel();
    }

    /**
     * Get model display information for UI
     */
    getModelDisplayInfo(modelId) {
        return this.llmClient.getModelDisplayInfo(modelId);
    }

    /**
     * Get model by ID
     */
    getModelById(modelId) {
        return this.availableModels.find(m => m.id === modelId);
    }

    /**
     * Select model by capabilities, avoiding the current model if possible
     */
    selectModelByCapabilities(requiredCapabilities, excludeModel = null) {
        const candidateModels = this.getAvailableModels().filter(model => {
            if (excludeModel && model.id === excludeModel) return false;
            return requiredCapabilities.some(cap => 
                model.capabilities.includes(cap)
            );
        });
        
        if (candidateModels.length === 0) {
            // Fallback to any available model
            const fallbackModels = this.getAvailableModels().filter(m => m.id !== excludeModel);
            return fallbackModels.length > 0 ? fallbackModels[0].id : this.getAvailableModels()[0]?.id;
        }
        
        // Return model with most matching capabilities
        const scoredModels = candidateModels.map(model => ({
            ...model,
            score: requiredCapabilities.filter(cap => model.capabilities.includes(cap)).length
        }));
        
        scoredModels.sort((a, b) => b.score - a.score);
        return scoredModels[0].id;
    }

    /**
     * Start the refinement process with enhanced iteration tracking
     * @param {string} initialPrompt - The user's initial prompt
     * @param {object} models - Selected models configuration
     * @param {number} iterations - Number of refinement iterations (user-configurable N)
     */
    async startRefinementProcess(initialPrompt, models, iterations, progressCallback = null) {
        const sessionId = uuidv4();
        
        // Auto-select final review model if not specified
        let finalReviewModel = models.finalReviewModel;
        if (!finalReviewModel) {
            finalReviewModel = this.llmClient.getBestFinalReviewModel();
            console.log(`🎯 Auto-selected final review model: ${finalReviewModel}`);
        }
        
        // Enhanced session tracking with iteration configuration
        const session = {
            id: sessionId,
            originalPrompt: initialPrompt,
            refinedPrompt: null,
            models: { ...models, finalReviewModel },
            targetIterations: iterations, // User-specified N
            currentIteration: 0,
            completedIterations: 0,
            steps: [],
            startTime: Date.now(),
            handoffStrategy: models.handoffStrategy || 'model_specialization',
            iterationHistory: [],
            modelUsageStats: new Map(),
            finalReviewModel: finalReviewModel,
            progressCallback: progressCallback
        };

        this.activeSessions.set(sessionId, session);
        
        console.log(`🚀 Starting refinement session ${sessionId}`);
        console.log(`📊 Target iterations: ${iterations} (user-specified N)`);
        console.log(`🤖 Primary model: ${models.primaryModel}`);
        console.log(`🔄 Refinement model: ${models.refinementModel}`);
        console.log(`🎯 Final review model: ${finalReviewModel}`);
        console.log(`📋 Handoff strategy: ${session.handoffStrategy}`);

        try {
            // Step 1: Analyze and refine the initial prompt
            console.log(`[${sessionId}] Starting prompt refinement process`);
            
            const refinementResult = await this.promptRefiner.analyzeAndRefine(
                initialPrompt, 
                this.llmClient
            );

            if (refinementResult.needsClarification) {
                session.pendingClarifications = refinementResult.questions;
                return {
                    sessionId,
                    needsClarification: true,
                    questions: refinementResult.questions
                };
            }

            session.refinedPrompt = refinementResult.refinedPrompt;
            
            // Start the collaborative generation process
            return await this.startCollaborativeGeneration(sessionId);

        } catch (error) {
            console.error(`[${sessionId}] Error in refinement process:`, error);
            this.activeSessions.delete(sessionId);
            return { error: error.message };
        }
    }

    /**
     * Generate the process steps with enhanced iteration tracking
     */
    generateProcessSteps(session) {
        const steps = [];
        
        // Initial generation step
        steps.push({
            id: 'initial-generation',
            type: 'generate',
            title: `Generate Initial Response (${session.models.primaryModel})`,
            description: 'Creating the first response using the primary model',
            status: 'pending',
            iteration: 0
        });

        // Enhanced refinement iterations with dynamic model selection
        for (let i = 1; i <= session.targetIterations; i++) {
            const handoffStrategy = this.handoffStrategies[session.handoffStrategy];
            
            // Determine critique model
            const critiqueModel = handoffStrategy.getNextModel(
                session.models.primaryModel, i, session.targetIterations, 'critique'
            ) || session.models.refinementModel;
            
            // Determine improvement model  
            const improvementModel = handoffStrategy.getNextModel(
                critiqueModel, i, session.targetIterations, 'improvement'
            ) || session.models.primaryModel;
            
            steps.push({
                id: `iteration-${i}-critique`,
                type: 'critique',
                title: `Iteration ${i}/${session.targetIterations}: Critique (${critiqueModel})`,
                description: `Analyzing the response and identifying improvements using ${critiqueModel}`,
                status: 'pending',
                iteration: i,
                modelId: critiqueModel
            });

            steps.push({
                id: `iteration-${i}-improve`,
                type: 'iterate',
                title: `Iteration ${i}/${session.targetIterations}: Improve (${improvementModel})`,
                description: `Implementing the suggested improvements using ${improvementModel}`,
                status: 'pending',
                iteration: i,
                modelId: improvementModel
            });
        }

        // Final review step with best available model
        const finalModel = this.selectModelByCapabilities(['detailed', 'comprehensive']);
        steps.push({
            id: 'final-review',
            type: 'refine',
            title: `Final Quality Review (${finalModel})`,
            description: 'Ensuring the output meets all requirements with comprehensive review',
            status: 'pending',
            iteration: session.targetIterations + 1,
            modelId: finalModel
        });

        return steps;
    }

    /**
     * Execute the collaborative refinement process with enhanced model orchestration
     */
    async executeCollaborativeProcess(session) {
        let currentResponse = '';
        let iterationHistory = [];
        const handoffStrategy = this.handoffStrategies[session.handoffStrategy];

        try {
            console.log(`[${session.id}] 🎯 Executing ${session.targetIterations} iterations with ${session.handoffStrategy} strategy`);
            console.log(`${'='.repeat(80)}`);
            
            // Send initial progress update
            this.sendProgressUpdate(session, {
                phase: 'starting',
                message: `Starting ${session.targetIterations} iterations with ${session.handoffStrategy} strategy`,
                currentIteration: 0,
                totalIterations: session.targetIterations
            });
            
            // Step 1: Initial generation
            console.log(`[${session.id}] Initial generation with ${session.models.primaryModel}`);
            this.sendProgressUpdate(session, {
                phase: 'initial_generation',
                message: `Generating initial response with ${session.models.primaryModel}`,
                currentIteration: 0,
                totalIterations: session.targetIterations,
                model: session.models.primaryModel
            });
            
            currentResponse = await this.llmClient.generateResponse(
                session.models.primaryModel,
                session.refinedPrompt
            );

            // Log the initial response content
            console.log(`[${session.id}] 📝 INITIAL RESPONSE:`);
            console.log(`${currentResponse.substring(0, 300)}${currentResponse.length > 300 ? '...' : ''}`);
            console.log(`[${session.id}] 📊 Length: ${currentResponse.length} characters\n`);

            this.trackModelUsage(session, session.models.primaryModel, 'initial_generation');
            
            iterationHistory.push({
                iteration: 0,
                model: session.models.primaryModel,
                type: 'initial_generation',
                input: session.refinedPrompt,
                output: currentResponse,
                timestamp: Date.now()
            });

            // Step 2: Enhanced collaborative refinement iterations
            for (let i = 1; i <= session.targetIterations; i++) {
                session.currentIteration = i;
                console.log(`[${session.id}] 🔄 Starting iteration ${i}/${session.targetIterations}`);
                
                // Send iteration start update
                this.sendProgressUpdate(session, {
                    phase: 'iteration_start',
                    message: `Starting iteration ${i} of ${session.targetIterations}`,
                    currentIteration: i,
                    totalIterations: session.targetIterations
                });
                
                // Dynamic model selection for critique phase
                const critiqueModel = handoffStrategy.getNextModel(
                    session.models.primaryModel, i, session.targetIterations, 'critique'
                ) || session.models.refinementModel;

                console.log(`[${session.id}] Iteration ${i} - Critique phase with ${critiqueModel}`);
                
                // Send critique phase update
                this.sendProgressUpdate(session, {
                    phase: 'critique',
                    message: `Analyzing response with ${critiqueModel}`,
                    currentIteration: i,
                    totalIterations: session.targetIterations,
                    model: critiqueModel
                });
                
                // Critique phase with context-aware prompting
                const critiquePrompt = this.buildCritiquePrompt(
                    session.refinedPrompt,
                    currentResponse,
                    i,
                    session.targetIterations,
                    iterationHistory
                );

                const critique = await this.llmClient.generateResponse(
                    critiqueModel,
                    critiquePrompt
                );

                // Log the critique content
                console.log(`[${session.id}] 🔍 CRITIQUE ${i}/${session.targetIterations}:`);
                console.log(`${critique.substring(0, 400)}${critique.length > 400 ? '...' : ''}`);
                console.log(`[${session.id}] 📊 Critique length: ${critique.length} characters\n`);

                this.trackModelUsage(session, critiqueModel, 'critique');

                iterationHistory.push({
                    iteration: i,
                    model: critiqueModel,
                    type: 'critique',
                    input: critiquePrompt,
                    output: critique,
                    timestamp: Date.now()
                });

                // Dynamic model selection for improvement phase
                const improvementModel = handoffStrategy.getNextModel(
                    critiqueModel, i, session.targetIterations, 'improvement'
                ) || session.models.primaryModel;

                console.log(`[${session.id}] Iteration ${i} - Improvement phase with ${improvementModel}`);
                
                // Send improvement phase update
                this.sendProgressUpdate(session, {
                    phase: 'improvement',
                    message: `Implementing improvements with ${improvementModel}`,
                    currentIteration: i,
                    totalIterations: session.targetIterations,
                    model: improvementModel
                });
                
                // Improvement phase with enhanced context
                const improvementPrompt = this.buildImprovementPrompt(
                    session.refinedPrompt,
                    currentResponse,
                    critique,
                    i,
                    session.targetIterations,
                    iterationHistory
                );

                currentResponse = await this.llmClient.generateResponse(
                    improvementModel,
                    improvementPrompt
                );

                // Log the improved response content
                console.log(`[${session.id}] ✨ IMPROVED RESPONSE ${i}/${session.targetIterations}:`);
                console.log(`${currentResponse.substring(0, 300)}${currentResponse.length > 300 ? '...' : ''}`);
                console.log(`[${session.id}] 📊 Length: ${currentResponse.length} characters\n`);

                this.trackModelUsage(session, improvementModel, 'improvement');

                iterationHistory.push({
                    iteration: i,
                    model: improvementModel,
                    type: 'improvement',
                    input: improvementPrompt,
                    output: currentResponse,
                    timestamp: Date.now()
                });

                session.completedIterations = i;
                console.log(`[${session.id}] ✅ Completed iteration ${i}/${session.targetIterations}`);
                console.log(`${'='.repeat(80)}\n`);
            }

            // Step 3: Final review with user-selected model
            const finalModel = session.finalReviewModel || this.getBestFinalReviewModel();
            console.log(`[${session.id}] Final review with user-selected model: ${finalModel}`);
            
            // Send final review update
            this.sendProgressUpdate(session, {
                phase: 'final_review',
                message: `Performing final review with ${finalModel}`,
                currentIteration: session.targetIterations + 1,
                totalIterations: session.targetIterations,
                model: finalModel
            });
            
            const finalReviewPrompt = this.buildFinalReviewPrompt(
                session.refinedPrompt,
                currentResponse,
                session.completedIterations,
                iterationHistory
            );

            const finalResponse = await this.llmClient.generateResponse(
                finalModel,
                finalReviewPrompt
            );

            // Log the final response content
            console.log(`[${session.id}] 🏆 FINAL RESPONSE:`);
            console.log(`${finalResponse.substring(0, 400)}${finalResponse.length > 400 ? '...' : ''}`);
            console.log(`[${session.id}] 📊 Final length: ${finalResponse.length} characters\n`);

            this.trackModelUsage(session, finalModel, 'final_review');

            const result = {
                originalPrompt: session.originalPrompt,
                refinedPrompt: session.refinedPrompt,
                finalOutput: finalResponse,
                iterationHistory: iterationHistory,
                sessionDuration: Date.now() - session.startTime,
                targetIterations: session.targetIterations,
                completedIterations: session.completedIterations,
                handoffStrategy: session.handoffStrategy,
                modelUsageStats: Object.fromEntries(session.modelUsageStats)
            };

            console.log(`[${session.id}] 🎉 Collaborative refinement completed successfully`);
            console.log(`📊 Iterations: ${session.completedIterations}/${session.targetIterations}`);
            console.log(`⏱️ Duration: ${(result.sessionDuration / 1000).toFixed(1)}s`);
            console.log(`🤖 Models used: ${Object.keys(result.modelUsageStats).join(', ')}`);

            // Send completion update
            this.sendProgressUpdate(session, {
                phase: 'completed',
                message: `Refinement completed in ${(result.sessionDuration / 1000).toFixed(1)}s`,
                currentIteration: session.completedIterations,
                totalIterations: session.targetIterations,
                completed: true,
                result: result
            });

            return result;

        } catch (error) {
            console.error(`[${session.id}] Error in collaborative process:`, error);
            throw error;
        } finally {
            // Clean up session
            this.activeSessions.delete(session.id);
        }
    }

    /**
     * Send progress update to frontend
     */
    sendProgressUpdate(session, updateData) {
        if (session.progressCallback && typeof session.progressCallback === 'function') {
            session.progressCallback({
                sessionId: session.id,
                timestamp: Date.now(),
                ...updateData
            });
        }
    }

    /**
     * Track model usage statistics
     */
    trackModelUsage(session, modelId, operationType) {
        if (!session.modelUsageStats.has(modelId)) {
            session.modelUsageStats.set(modelId, {
                model: modelId,
                operations: {},
                totalUsage: 0
            });
        }
        
        const stats = session.modelUsageStats.get(modelId);
        stats.operations[operationType] = (stats.operations[operationType] || 0) + 1;
        stats.totalUsage += 1;
    }

    /**
     * Build enhanced critique prompt with iteration context
     */
    buildCritiquePrompt(originalPrompt, currentResponse, iteration, totalIterations, iterationHistory) {
        const previousCritiques = iterationHistory
            .filter(h => h.type === 'critique')
            .map(h => `Iteration ${h.iteration}: ${h.output.substring(0, 200)}...`)
            .join('\n');

        return `You are an expert content critic and improvement specialist conducting iteration ${iteration} of ${totalIterations} in a collaborative refinement process.

**Original Request:**
${originalPrompt}

**Current Response (After ${iteration-1} iterations):**
${currentResponse}

${previousCritiques ? `**Previous Critique Themes:**\n${previousCritiques}\n` : ''}

**Your Task for Iteration ${iteration}/${totalIterations}:**
1. Evaluate how well the response addresses the original request
2. Identify specific areas for improvement not covered in previous iterations
3. Focus on ${iteration <= totalIterations/2 ? 'structural and content improvements' : 'refinement and polish'}
4. Suggest concrete changes to enhance quality, clarity, accuracy, and completeness
5. Consider the target audience and purpose
6. Prioritize the most impactful improvements for this iteration

**Provide your critique in this format:**
STRENGTHS: [What the response does well]
AREAS FOR IMPROVEMENT: [Specific issues to address that haven't been covered before]
CONCRETE SUGGESTIONS: [Actionable improvements to implement]
PRIORITY: [Rank improvements by impact - focus on top 2-3]
ITERATION FOCUS: [What should this iteration specifically achieve?]

Be specific, constructive, and focus on improvements that will have the greatest positive impact while building on previous iterations.`;
    }

    /**
     * Build enhanced improvement prompt with iteration context
     */
    buildImprovementPrompt(originalPrompt, currentResponse, critique, iteration, totalIterations, iterationHistory) {
        const progressContext = iteration <= totalIterations/2 ? 
            'major structural and content improvements' : 
            'refinement, polish, and final optimization';

        return `You are implementing iteration ${iteration} of ${totalIterations} in a collaborative refinement process. Focus on ${progressContext}.

**Original Request:**
${originalPrompt}

**Current Response:**
${currentResponse}

**Expert Feedback for Iteration ${iteration}:**
${critique}

**Iteration Context:**
- This is iteration ${iteration} of ${totalIterations}
- ${iteration <= totalIterations/2 ? 'Focus on major improvements and content development' : 'Focus on refinement, clarity, and polish'}
- Previous iterations have already addressed earlier feedback

**Your Task:**
1. Implement the suggested improvements from the expert feedback
2. Maintain the strengths and positive aspects of the current response
3. Ensure the improved response fully addresses the original request
4. ${iteration === totalIterations ? 'Prepare for final review - ensure completeness' : 'Set up for next iteration'}
5. Make the content more engaging, clear, and valuable

**Important Guidelines:**
- Focus on the highest-priority improvements first
- Maintain consistency in tone and style throughout
- Ensure factual accuracy in any additions or changes
- Keep the response well-organized and easy to follow
- Build upon the work of previous iterations

Provide the improved response:`;
    }

    /**
     * Build enhanced final review prompt with full context
     */
    buildFinalReviewPrompt(originalPrompt, finalResponse, completedIterations, iterationHistory) {
        const modelSummary = iterationHistory
            .reduce((acc, h) => {
                acc[h.model] = (acc[h.model] || 0) + 1;
                return acc;
            }, {});

        return `You are conducting the final quality review of a collaboratively refined response that has undergone ${completedIterations} iterations of improvement.

**Original Request:**
${originalPrompt}

**Final Response After ${completedIterations} Iterations:**
${finalResponse}

**Collaborative Process Summary:**
- Models involved: ${Object.keys(modelSummary).join(', ')}
- Total refinement steps: ${iterationHistory.length}
- Completed iterations: ${completedIterations}

**Your Task:**
Provide the final, polished version that:
1. Fully addresses all aspects of the original request
2. Is clear, engaging, and well-structured
3. Contains accurate and valuable information
4. Uses appropriate tone and style
5. Is free of errors and inconsistencies
6. Represents the best possible outcome from collaborative refinement

**Quality Standards:**
- Professional-grade output ready for immediate use
- Incorporates insights from all previous iterations
- Demonstrates clear improvement over the original response
- Meets or exceeds user expectations

If the response is already excellent, you may make only minor polish improvements. If significant issues remain despite the iterations, provide a corrected version with explanation.

Final Response:`;
    }

    /**
     * Submit clarification answers and continue the refinement process
     * @param {string} sessionId - The session identifier
     * @param {object} answers - User answers to clarification questions
     */
    async submitClarification(sessionId, answers, progressCallback = null) {
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
            return { error: 'Session not found' };
        }

        if (!session.pendingClarifications) {
            return { error: 'No pending clarifications for this session' };
        }

        try {
            // Update progress callback if provided
            if (progressCallback) {
                session.progressCallback = progressCallback;
            }
            
            console.log(`[${sessionId}] Processing clarification answers`);
            
            // Send progress update
            this.sendProgressUpdate(session, {
                phase: 'processing_clarifications',
                message: 'Processing your clarification answers',
                currentIteration: 0,
                totalIterations: session.targetIterations
            });
            
            // Validate answers
            const validationErrors = this.promptRefiner.validateClarificationAnswers(
                session.pendingClarifications, 
                answers
            );
            
            if (validationErrors.length > 0) {
                return { error: `Validation errors: ${validationErrors.join(', ')}` };
            }

            // Refine the prompt with clarification answers
            const refinedPrompt = await this.promptRefiner.refineWithClarifications(
                session.originalPrompt,
                session.pendingClarifications,
                answers,
                this.llmClient
            );

            // Update session with refined prompt
            session.refinedPrompt = refinedPrompt;
            session.pendingClarifications = null; // Clear pending clarifications

            console.log(`[${sessionId}] Prompt refined with clarifications`);
            
            // Start the collaborative generation process
            return await this.startCollaborativeGeneration(sessionId);

        } catch (error) {
            console.error(`[${sessionId}] Error processing clarifications:`, error);
            return { error: error.message };
        }
    }

    /**
     * Start the collaborative generation process
     */
    async startCollaborativeGeneration(sessionId) {
        const session = this.activeSessions.get(sessionId);
        
        if (!session) {
            return { error: 'Session not found' };
        }

        try {
            console.log(`[${sessionId}] Starting collaborative generation`);
            
            // Generate process steps
            const steps = this.generateProcessSteps(session);
            session.steps = steps;

            // Execute the collaborative process
            const result = await this.executeCollaborativeProcess(session);

            return {
                sessionId,
                complete: true,
                result: result
            };

        } catch (error) {
            console.error(`[${sessionId}] Error in collaborative generation:`, error);
            this.activeSessions.delete(sessionId);
            return { error: error.message };
        }
    }

}

module.exports = { RefinementOrchestrator }; 