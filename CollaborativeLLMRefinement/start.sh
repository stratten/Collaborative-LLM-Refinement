#!/bin/bash

# Collaborative LLM Refinement POC Startup Script

echo "🤖 Starting Collaborative LLM Refinement POC..."
echo "======================================================"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Please run this script from the CollaborativeLLMRefinement directory"
    exit 1
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
fi

# Check if we have API keys warning
echo ""
echo "⚠️  IMPORTANT: Make sure you have your API keys ready:"
echo "   - OpenAI API Key (for GPT models)"
echo "   - Anthropic API Key (for Claude models)"
echo "   - At least one API key is required"
echo ""

# Start the application
echo "🚀 Launching Collaborative LLM Refinement POC..."
echo "   The application window will open shortly..."
echo ""

# Check if development mode is requested
if [ "$1" = "dev" ] || [ "$1" = "--dev" ]; then
    echo "🔧 Starting in development mode (with DevTools)..."
    npm run dev
else
    echo "✨ Starting in production mode..."
    npm start
fi 