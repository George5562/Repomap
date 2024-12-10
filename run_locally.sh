#!/bin/bash

# Check for required dependencies
#--------------------------------
# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed. Please install Node.js first."
    exit 1
fi

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed. Please install npm first."
    exit 1
fi

# Install project dependencies
#---------------------------
echo "📦 Installing dependencies..."
npm init -y
npm install repomix @langchain/anthropic dotenv zod ts-node typescript

# Configure package.json
#---------------------
echo "📝 Adding npm script..."
node -e "
const fs = require('fs');
const pkg = require('./package.json');
pkg.scripts = pkg.scripts || {};
pkg.scripts.repomap = 'ts-node generateRepomap.ts';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
"

# Set up environment configuration
#------------------------------
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating template..."
    echo "LLM_API_KEY=your_anthropic_key_here" > .env
    echo "Please edit .env with your actual Anthropic API key"
fi

echo "✅ Setup complete! You can now run:"
echo "npm run repomap [directory]"
echo "or"
echo "./generateRepomap.ts [directory]" 