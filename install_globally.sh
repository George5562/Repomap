#!/bin/bash

# Check for required dependencies
#--------------------------------
# Check if Repomix is installed
if ! command -v repomix &> /dev/null; then
    echo "Installing Repomix globally..."
    npm install -g repomix
fi

# Build TypeScript project
#------------------------
echo "Compiling TypeScript..."
npx tsc

# Make the compiled script executable
chmod +x dist/generateRepomap.js

# Configure API key
#-----------------
# Read the LLM_API_KEY from .env
if [ -f .env ]; then
    echo "Reading .env file..."
    LLM_API_KEY=$(grep '^LLM_API_KEY=' .env | cut -d '=' -f 2)
    if [ -z "$LLM_API_KEY" ]; then
        echo "Error: LLM_API_KEY not found in .env file."
        exit 1
    fi
    echo "Found LLM_API_KEY: ${LLM_API_KEY:0:5}... (truncated for security)"
else
    echo "Error: .env file not found."
    exit 1
fi

# Set up global configuration
#---------------------------
# Create config directory and store API key
CONFIG_DIR="$HOME/.config/generateRepomap"
mkdir -p "$CONFIG_DIR"
echo "LLM_API_KEY=$LLM_API_KEY" > "$CONFIG_DIR/.env"
chmod 600 "$CONFIG_DIR/.env"

# Store the script path
SCRIPT_PATH="$(pwd)/dist/generateRepomap.js"
echo "$SCRIPT_PATH" > "$CONFIG_DIR/script_path"
chmod 600 "$CONFIG_DIR/script_path"

# Create global CLI wrapper
#-------------------------
# Create a temporary wrapper script
TEMP_WRAPPER="/tmp/repomap-cli-temp"
cat > "$TEMP_WRAPPER" << 'EOF'
#!/bin/bash

CONFIG_DIR="$HOME/.config/generateRepomap"

# Verify config files exist
if [ ! -f "$CONFIG_DIR/.env" ] || [ ! -f "$CONFIG_DIR/script_path" ]; then
    echo "ERROR: Configuration files missing. Please reinstall."
    exit 1
fi

# Read configurations
SCRIPT_PATH=$(cat "$CONFIG_DIR/script_path")

# Verify the script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "ERROR: Cannot find script at $SCRIPT_PATH"
    exit 1
fi

# Execute the Node.js script with environment variables
source "$CONFIG_DIR/.env"
exec node "$SCRIPT_PATH" "$@"
EOF

# Install globally
#----------------
echo "Creating wrapper script (may ask for sudo password)..."
sudo mv "$TEMP_WRAPPER" "/usr/local/bin/repomap-cli"
sudo chmod +x "/usr/local/bin/repomap-cli"

echo "✅ Installation complete! You can now use 'repomap-cli' from any directory."
echo "Usage: repomap-cli [directory]"
echo "Configuration stored in: $CONFIG_DIR" 