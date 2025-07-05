/**
 * Prompt Refiner - Analyzes and refines initial user prompts
 * Determines if clarification is needed and generates refined prompts
 */
class PromptRefiner {
    constructor() {
        this.clarificationThreshold = 0.6; // If clarity score below this, ask for clarification
    }

    /**
     * Analyze the initial prompt and determine if refinement/clarification is needed
     * @param {string} initialPrompt - The user's initial prompt
     * @param {LLMClient} llmClient - The LLM client for making API calls
     */
    async analyzeAndRefine(initialPrompt, llmClient) {
        console.log('Analyzing initial prompt for clarity and completeness');

        // Use an LLM to analyze the prompt quality
        const analysisPrompt = this.buildAnalysisPrompt(initialPrompt);
        
        // Use the first available model for analysis
        const availableModels = llmClient.getAvailableModels();
        if (availableModels.length === 0) {
            throw new Error('No LLM models available for prompt analysis');
        }

        const analysisModel = availableModels[0]; // Use the first available model
        const analysisResult = await llmClient.generateResponse(analysisModel, analysisPrompt);
        
        // Parse the analysis result
        const analysis = this.parseAnalysisResult(analysisResult);
        
        console.log('Prompt analysis:', analysis);

        if (analysis.needsClarification) {
            // Generate clarification questions
            const questions = await this.generateClarificationQuestions(
                initialPrompt, 
                analysis, 
                llmClient, 
                analysisModel
            );
            
            return {
                needsClarification: true,
                questions: questions,
                analysis: analysis
            };
        } else {
            // Refine the prompt directly
            const refinedPrompt = await this.generateRefinedPrompt(
                initialPrompt, 
                analysis, 
                llmClient, 
                analysisModel
            );
            
            return {
                needsClarification: false,
                refinedPrompt: refinedPrompt,
                analysis: analysis
            };
        }
    }

    /**
     * Build the prompt analysis prompt
     */
    buildAnalysisPrompt(initialPrompt) {
        return `You are an expert prompt analyst. Analyze the following user prompt for clarity, completeness, and specificity. Determine if clarification questions are needed to improve the prompt quality.

USER PROMPT:
"${initialPrompt}"

ANALYSIS CRITERIA:
1. CLARITY: Is the request clear and unambiguous?
2. COMPLETENESS: Are all necessary details provided?
3. SPECIFICITY: Is the prompt specific enough to generate a high-quality response?
4. CONTEXT: Is sufficient context provided for understanding the request?
5. CONSTRAINTS: Are any important constraints or requirements specified?

RESPOND IN THIS EXACT FORMAT:
CLARITY_SCORE: [0.0-1.0]
COMPLETENESS_SCORE: [0.0-1.0]
SPECIFICITY_SCORE: [0.0-1.0]
OVERALL_SCORE: [0.0-1.0]
NEEDS_CLARIFICATION: [YES/NO]
MISSING_ELEMENTS: [List specific elements that are unclear or missing]
POTENTIAL_IMPROVEMENTS: [Suggest specific improvements]
REASONING: [Brief explanation of the analysis]

Be precise and objective in your scoring. A score below 0.6 in any major area should trigger clarification needs.`;
    }

    /**
     * Parse the analysis result from the LLM
     */
    parseAnalysisResult(analysisText) {
        const analysis = {
            clarityScore: 0.5,
            completenessScore: 0.5,
            specificityScore: 0.5,
            overallScore: 0.5,
            needsClarification: true,
            missingElements: [],
            potentialImprovements: [],
            reasoning: ''
        };

        try {
            // Extract scores
            const clarityMatch = analysisText.match(/CLARITY_SCORE:\s*([0-9.]+)/);
            if (clarityMatch) analysis.clarityScore = parseFloat(clarityMatch[1]);

            const completenessMatch = analysisText.match(/COMPLETENESS_SCORE:\s*([0-9.]+)/);
            if (completenessMatch) analysis.completenessScore = parseFloat(completenessMatch[1]);

            const specificityMatch = analysisText.match(/SPECIFICITY_SCORE:\s*([0-9.]+)/);
            if (specificityMatch) analysis.specificityScore = parseFloat(specificityMatch[1]);

            const overallMatch = analysisText.match(/OVERALL_SCORE:\s*([0-9.]+)/);
            if (overallMatch) analysis.overallScore = parseFloat(overallMatch[1]);

            // Extract clarification need
            const clarificationMatch = analysisText.match(/NEEDS_CLARIFICATION:\s*(YES|NO)/);
            if (clarificationMatch) {
                analysis.needsClarification = clarificationMatch[1] === 'YES';
            }

            // Extract missing elements
            const missingMatch = analysisText.match(/MISSING_ELEMENTS:\s*(.+?)(?=\n[A-Z_]+:|$)/s);
            if (missingMatch) {
                analysis.missingElements = missingMatch[1].trim().split(/[,\n]/).map(item => item.trim()).filter(item => item.length > 0);
            }

            // Extract potential improvements
            const improvementsMatch = analysisText.match(/POTENTIAL_IMPROVEMENTS:\s*(.+?)(?=\n[A-Z_]+:|$)/s);
            if (improvementsMatch) {
                analysis.potentialImprovements = improvementsMatch[1].trim().split(/[,\n]/).map(item => item.trim()).filter(item => item.length > 0);
            }

            // Extract reasoning
            const reasoningMatch = analysisText.match(/REASONING:\s*(.+?)$/s);
            if (reasoningMatch) {
                analysis.reasoning = reasoningMatch[1].trim();
            }

        } catch (error) {
            console.warn('Error parsing analysis result:', error);
            // Fall back to conservative analysis requiring clarification
        }

        return analysis;
    }

    /**
     * Generate clarification questions based on the analysis
     */
    async generateClarificationQuestions(initialPrompt, analysis, llmClient, modelId) {
        const clarificationPrompt = `Based on the analysis of this user prompt, generate 2-4 specific clarification questions that will help improve the prompt quality.

ORIGINAL PROMPT:
"${initialPrompt}"

ANALYSIS ISSUES:
- Missing Elements: ${analysis.missingElements.join(', ')}
- Potential Improvements: ${analysis.potentialImprovements.join(', ')}
- Reasoning: ${analysis.reasoning}

GENERATE CLARIFICATION QUESTIONS:
Create questions that are:
1. Specific and actionable
2. Help address the missing elements
3. Improve clarity and completeness
4. Are easy for the user to answer

RESPOND IN THIS FORMAT:
QUESTION_1: [Clear, specific question]
QUESTION_2: [Clear, specific question]
QUESTION_3: [Clear, specific question] (if needed)
QUESTION_4: [Clear, specific question] (if needed)

Each question should help gather essential missing information.`;

        const questionsText = await llmClient.generateResponse(modelId, clarificationPrompt);
        
        return this.parseClarificationQuestions(questionsText);
    }

    /**
     * Parse clarification questions from LLM response
     */
    parseClarificationQuestions(questionsText) {
        const questions = [];
        
        // Extract questions using regex
        const questionMatches = questionsText.match(/QUESTION_\d+:\s*(.+?)(?=\nQUESTION_\d+:|$)/gs);
        
        if (questionMatches) {
            questionMatches.forEach((match, index) => {
                const questionText = match.replace(/QUESTION_\d+:\s*/, '').trim();
                if (questionText.length > 0) {
                    questions.push({
                        id: `q${index + 1}`,
                        question: questionText
                    });
                }
            });
        } else {
            // Fallback: split by lines and look for question-like content
            const lines = questionsText.split('\n');
            let questionCount = 0;
            
            for (const line of lines) {
                const trimmed = line.trim();
                if (trimmed.length > 10 && (trimmed.includes('?') || trimmed.toLowerCase().includes('question'))) {
                    questionCount++;
                    questions.push({
                        id: `q${questionCount}`,
                        question: trimmed.replace(/^QUESTION_?\d*:?\s*/i, '').trim()
                    });
                    
                    if (questionCount >= 4) break; // Limit to 4 questions
                }
            }
        }

        // Ensure we have at least one question
        if (questions.length === 0) {
            questions.push({
                id: 'q1',
                question: 'Could you provide more specific details about what you want to achieve with this request?'
            });
        }

        return questions;
    }

    /**
     * Generate a refined prompt based on clarification answers
     */
    async refineWithClarifications(originalPrompt, questions, answers, llmClient) {
        const clarificationDetails = questions.map(q => {
            const answer = answers[q.id] || '';
            return `Q: ${q.question}\nA: ${answer}`;
        }).join('\n\n');

        const refinementPrompt = `You are tasked with refining a user's prompt based on their answers to clarification questions. Create a comprehensive, clear, and specific prompt that incorporates all the provided information.

ORIGINAL PROMPT:
"${originalPrompt}"

CLARIFICATION Q&A:
${clarificationDetails}

REFINED PROMPT REQUIREMENTS:
1. Incorporate all relevant information from the Q&A
2. Maintain the user's original intent
3. Make the prompt clear, specific, and actionable
4. Include all necessary context and constraints
5. Ensure the refined prompt will generate high-quality responses

Provide the refined prompt:`;

        const availableModels = llmClient.getAvailableModels();
        const modelId = availableModels[0]; // Use first available model
        
        return await llmClient.generateResponse(modelId, refinementPrompt);
    }

    /**
     * Generate a refined prompt without clarification (when prompt is already good)
     */
    async generateRefinedPrompt(originalPrompt, analysis, llmClient, modelId) {
        const refinementPrompt = `You are tasked with making minor refinements to an already good prompt. The prompt has been analyzed and found to be mostly clear and complete, but could benefit from small improvements.

ORIGINAL PROMPT:
"${originalPrompt}"

ANALYSIS INSIGHTS:
- Clarity Score: ${analysis.clarityScore}
- Completeness Score: ${analysis.completenessScore}
- Specificity Score: ${analysis.specificityScore}
- Potential Improvements: ${analysis.potentialImprovements.join(', ')}

REFINEMENT TASK:
Make minimal, strategic improvements to enhance clarity and effectiveness while preserving the original intent. Only make changes that add significant value.

If the prompt is already excellent, you may return it with only minor polish or unchanged.

Refined prompt:`;

        return await llmClient.generateResponse(modelId, refinementPrompt);
    }

    /**
     * Validate clarification answers
     */
    validateClarificationAnswers(questions, answers) {
        const errors = [];

        for (const question of questions) {
            const answer = answers[question.id];
            if (!answer || answer.trim().length === 0) {
                errors.push(`Please answer: ${question.question}`);
            } else if (answer.trim().length < 3) {
                errors.push(`Please provide a more detailed answer for: ${question.question}`);
            }
        }

        return errors;
    }

    /**
     * Get refinement statistics
     */
    getRefinementStats(analysis) {
        return {
            clarityImprovement: Math.max(0, this.clarificationThreshold - analysis.clarityScore),
            completenessImprovement: Math.max(0, this.clarificationThreshold - analysis.completenessScore),
            specificityImprovement: Math.max(0, this.clarificationThreshold - analysis.specificityScore),
            overallImprovement: Math.max(0, this.clarificationThreshold - analysis.overallScore),
            recommendedClarifications: analysis.missingElements.length
        };
    }
}

module.exports = { PromptRefiner }; 