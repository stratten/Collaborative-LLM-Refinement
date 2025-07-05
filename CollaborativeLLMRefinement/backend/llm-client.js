const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

/**
 * LLM Client for communicating with different API providers
 * Supports OpenAI and Anthropic models with proper capability hierarchy
 */
class LLMClient {
    constructor() {
        this.openaiClient = null;
        this.anthropicClient = null;
        this.apiKeys = {};
        
        // Model configuration with proper capability hierarchy
        // Most powerful models at top
        this.modelConfig = {
            'claude-sonnet-4': {
                provider: 'anthropic',
                modelName: 'claude-sonnet-4-20250514',
                maxTokens: 60000, // Claude Sonnet 4 supports 64,000 tokens - using 60k for safety
                temperature: 0.7,
                tier: 'premium',
                capabilities: ['comprehensive', 'detailed', 'analytical', 'thoughtful', 'advanced']
            },
            'gpt-4.1': {
                provider: 'openai',
                modelName: 'gpt-4.1-2025-04-14', // GPT-4.1 real model
                maxTokens: 32000, // GPT-4.1 supports 32,768 tokens - using 32k for balance
                temperature: 0.7,
                tier: 'premium',
                capabilities: ['advanced', 'nuanced', 'precise', 'technical', 'comprehensive']
            },
            'gpt-4o': {
                provider: 'openai',
                modelName: 'gpt-4o',
                maxTokens: 8000, // GPT-4o supports 16,384 tokens - using 8k for balance
                temperature: 0.7,
                tier: 'advanced',
                capabilities: ['creative', 'analytical', 'technical', 'fast']
            },
            'gpt-4-turbo': {
                provider: 'openai',
                modelName: 'gpt-4-turbo-preview',
                maxTokens: 4000, // GPT-4 Turbo supports 4,096 tokens - close to max
                temperature: 0.7,
                tier: 'advanced',
                capabilities: ['analytical', 'comprehensive', 'reliable', 'fast']
            },
            'claude-3-5-sonnet': {
                provider: 'anthropic',
                modelName: 'claude-3-5-sonnet-20241022',
                maxTokens: 6000, // Claude 3.5 Sonnet supports 8,192 tokens - using 6k for safety
                temperature: 0.7,
                tier: 'standard',
                capabilities: ['balanced', 'reliable', 'clear']
            }
        };
    }

    /**
     * Set API keys for the providers
     */
    setApiKeys(apiKeys) {
        this.apiKeys = { ...apiKeys };
        
        // Initialize clients if keys are provided
        if (apiKeys.openai) {
            this.openaiClient = new OpenAI({
                apiKey: apiKeys.openai
            });
        }
        
        if (apiKeys.anthropic) {
            this.anthropicClient = new Anthropic({
                apiKey: apiKeys.anthropic
            });
        }
    }

    /**
     * Generate a response using the specified model
     * @param {string} modelId - The model identifier
     * @param {string} prompt - The prompt to send to the model
     * @param {object} options - Additional options for the request
     */
    async generateResponse(modelId, prompt, options = {}) {
        const config = this.modelConfig[modelId];
        if (!config) {
            throw new Error(`Unknown model: ${modelId}`);
        }

        console.log(`🤖 Generating response with ${modelId} (${config.provider}, ${config.tier} tier)`);

        switch (config.provider) {
            case 'openai':
                return await this.generateOpenAIResponse(config, prompt, options);
            case 'anthropic':
                return await this.generateAnthropicResponse(config, prompt, options);
            default:
                throw new Error(`Unknown provider: ${config.provider}`);
        }
    }

    /**
     * Generate response using OpenAI API
     */
    async generateOpenAIResponse(config, prompt, options) {
        if (!this.openaiClient) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            const response = await this.openaiClient.chat.completions.create({
                model: config.modelName,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: options.maxTokens || config.maxTokens,
                temperature: options.temperature || config.temperature,
                stream: false
            });

            if (!response.choices || response.choices.length === 0) {
                throw new Error('No response generated from OpenAI');
            }

            return response.choices[0].message.content.trim();

        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error(`OpenAI API error: ${error.message}`);
        }
    }

    /**
     * Generate response using Anthropic API with streaming for long requests
     */
    async generateAnthropicResponse(config, prompt, options) {
        if (!this.anthropicClient) {
            throw new Error('Anthropic API key not configured');
        }

        try {
            const maxTokens = options.maxTokens || config.maxTokens;
            
            // Use streaming for requests that might take longer than 10 minutes
            // This is based on Anthropic's recommendation for high token count requests
            const shouldStream = maxTokens > 4000;
            
            if (shouldStream) {
                // Use streaming for long requests
                const stream = await this.anthropicClient.messages.create({
                    model: config.modelName,
                    max_tokens: maxTokens,
                    temperature: options.temperature || config.temperature,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    stream: true
                });

                let responseText = '';
                
                for await (const chunk of stream) {
                    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
                        responseText += chunk.delta.text;
                    }
                }

                if (!responseText.trim()) {
                    throw new Error('No response generated from Anthropic');
                }

                return responseText.trim();
            } else {
                // Use non-streaming for shorter requests
                const response = await this.anthropicClient.messages.create({
                    model: config.modelName,
                    max_tokens: maxTokens,
                    temperature: options.temperature || config.temperature,
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ]
                });

                if (!response.content || response.content.length === 0) {
                    throw new Error('No response generated from Anthropic');
                }

                // Anthropic returns content as an array of content blocks
                return response.content[0].text.trim();
            }

        } catch (error) {
            console.error('Anthropic API error:', error);
            throw new Error(`Anthropic API error: ${error.message}`);
        }
    }

    /**
     * Check if a model is available (API key configured)
     */
    isModelAvailable(modelId) {
        const config = this.modelConfig[modelId];
        if (!config) return false;

        switch (config.provider) {
            case 'openai':
                return !!this.openaiClient;
            case 'anthropic':
                return !!this.anthropicClient;
            default:
                return false;
        }
    }

    /**
     * Get all available models, sorted by capability tier
     */
    getAvailableModels() {
        const availableModels = Object.keys(this.modelConfig).filter(modelId => 
            this.isModelAvailable(modelId)
        );

        // Sort by tier: premium > advanced > standard
        const tierOrder = { 'premium': 0, 'advanced': 1, 'standard': 2 };
        
        return availableModels.sort((a, b) => {
            const configA = this.modelConfig[a];
            const configB = this.modelConfig[b];
            return tierOrder[configA.tier] - tierOrder[configB.tier];
        });
    }

    /**
     * Get models suitable for final review (premium tier preferred)
     */
    getFinalReviewModels() {
        const availableModels = this.getAvailableModels();
        const finalReviewModels = [];

        // First, add premium tier models
        const premiumModels = availableModels.filter(modelId => 
            this.modelConfig[modelId].tier === 'premium'
        );
        finalReviewModels.push(...premiumModels);

        // Then add advanced tier models
        const advancedModels = availableModels.filter(modelId => 
            this.modelConfig[modelId].tier === 'advanced'
        );
        finalReviewModels.push(...advancedModels);

        // Finally add standard tier models
        const standardModels = availableModels.filter(modelId => 
            this.modelConfig[modelId].tier === 'standard'
        );
        finalReviewModels.push(...standardModels);

        return finalReviewModels;
    }

    /**
     * Get the best available model for final review
     */
    getBestFinalReviewModel() {
        const finalReviewModels = this.getFinalReviewModels();
        
        // Prefer Claude Sonnet 4 if available, then GPT-4.1
        const preferredOrder = ['claude-sonnet-4', 'gpt-4.1', 'gpt-4o', 'gpt-4-turbo', 'claude-3-5-sonnet'];
        
        for (const preferred of preferredOrder) {
            if (finalReviewModels.includes(preferred)) {
                return preferred;
            }
        }
        
        return finalReviewModels[0] || null;
    }

    /**
     * Get model configuration
     */
    getModelConfig(modelId) {
        return this.modelConfig[modelId];
    }

    /**
     * Get model display info for UI
     */
    getModelDisplayInfo(modelId) {
        const config = this.modelConfig[modelId];
        if (!config) return null;

        return {
            id: modelId,
            name: this.getModelDisplayName(modelId),
            provider: config.provider,
            tier: config.tier,
            capabilities: config.capabilities,
            available: this.isModelAvailable(modelId)
        };
    }

    /**
     * Get display name for model
     */
    getModelDisplayName(modelId) {
        const displayNames = {
            'claude-sonnet-4': 'Claude 4 Sonnet',
            'gpt-4.1': 'GPT-4.1',
            'gpt-4o': 'GPT-4o',
            'gpt-4-turbo': 'GPT-4 Turbo',
            'claude-3-5-sonnet': 'Claude 3.5 Sonnet'
        };
        return displayNames[modelId] || modelId;
    }

    /**
     * Validate that required API keys are set for the selected models
     */
    validateModelsConfiguration(primaryModel, refinementModel, finalReviewModel = null) {
        const errors = [];

        if (!this.isModelAvailable(primaryModel)) {
            const config = this.modelConfig[primaryModel];
            errors.push(`Primary model ${primaryModel} requires ${config.provider.toUpperCase()} API key`);
        }

        if (!this.isModelAvailable(refinementModel)) {
            const config = this.modelConfig[refinementModel];
            errors.push(`Refinement model ${refinementModel} requires ${config.provider.toUpperCase()} API key`);
        }

        if (finalReviewModel && !this.isModelAvailable(finalReviewModel)) {
            const config = this.modelConfig[finalReviewModel];
            errors.push(`Final review model ${finalReviewModel} requires ${config.provider.toUpperCase()} API key`);
        }

        if (errors.length > 0) {
            throw new Error(`Configuration errors: ${errors.join(', ')}`);
        }

        return true;
    }

    /**
     * Estimate token count for a prompt (rough estimation)
     */
    estimateTokenCount(text) {
        // Rough estimation: ~4 characters per token for English text
        return Math.ceil(text.length / 4);
    }

    /**
     * Check if prompt is within model limits
     */
    validatePromptLength(modelId, prompt) {
        const config = this.modelConfig[modelId];
        const estimatedTokens = this.estimateTokenCount(prompt);
        
        // Reserve some tokens for the response
        const maxInputTokens = config.maxTokens * 0.7; // Use 70% for input
        
        if (estimatedTokens > maxInputTokens) {
            throw new Error(
                `Prompt too long for ${modelId}: ${estimatedTokens} tokens ` +
                `(max: ${maxInputTokens})`
            );
        }

        return true;
    }

    /**
     * Get provider statistics
     */
    getProviderStats() {
        const stats = {
            openai: { available: !!this.openaiClient, models: 0 },
            anthropic: { available: !!this.anthropicClient, models: 0 }
        };

        Object.values(this.modelConfig).forEach(config => {
            if (this.isModelAvailable(config.modelName)) {
                stats[config.provider].models++;
            }
        });

        return stats;
    }
}

module.exports = { LLMClient }; 