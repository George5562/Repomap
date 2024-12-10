# Repomix Directory Visualizer (Now & Future)

A tool to generate mermaid diagrams of your repo with one command, and visualise the elements to be added by any future updates via a CLI instruction (--add).

Uses Repomix by Kazuki Yamada: https://github.com/yamadashy/repomix
Mermaid: https://mermaid.js.org/
Langchain: https://js.langchain.com/

## Features

- Generate directory structure flowcharts
- Plan new features using natural language
- Output structured implementation suggestions
- Customize node types and relationships
- Node font size (and subsequent node size) based on number of lines in the file

## Important Notes

⚠️ **Large Repositories**: The entire file structure is fed to the LLM, so be mindful with large codebases. Use scoping options to restrict analysis:

```bash
# Include only specific patterns
repomix --include "src/**/*.ts,**/*.md"

# Exclude specific patterns
repomix --ignore "**/*.log,tmp/"
```

## Installation

### Global Installation

1. Install Node.js and npm
2. Run:
   ```bash
   chmod +x install_globally.sh
   ./install_globally.sh
   ```
3. Create `.env` with your Anthropic API key:
   ```
   LLM_API_KEY=your_anthropic_key_here
   ```

### Local Installation

1. Create project directory:
   ```bash
   mkdir my-repomap && cd my-repomap
   ```
2. Download `generateRepomap.ts` and `run_locally.sh`
3. Run setup:
   ```bash
   chmod +x run_locally.sh
   ./run_locally.sh
   ```
4. Edit `.env` with your Anthropic API key

## Usage

### Basic Usage

```bash
# Global
repomap-cli [directory]

# Local
npm run repomap [directory]
```

### Feature Planning

```bash
repomap-cli [directory] --add "add a search feature"
```

### Skip Analysis

```bash
repomap-cli [directory] --no-repomix
```

## Output Files

Generated in `repomap_output/`:

- `repomix-output.xml` - Directory analysis
- `*_base_repomap.mmd` - Current structure
- `*_repomap.mmd` - Structure with proposed changes
- `add_*.json` - Feature change details (with --add)

View diagrams:

- Directly on GitHub (Mermaid support)
- Convert to SVG: `mmdc -i "repomap.mmd" -o "repomap.svg"`
