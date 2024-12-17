# Project Mindmap Generator

A TypeScript tool that generates visual diagrams of your codebase using AI assistance. Creates Mermaid diagrams showing current structure and can visualize proposed feature additions through natural language requests.

## Key Features

- **AI-Powered Analysis**: Uses multiple specialized models for different tasks
- **Role-Based Visualization**: Automatically categorizes files by their function
- **Feature Planning**: Visualizes proposed features through natural language
- **Adaptive Styling**: Font sizes scale with file complexity
- **Incremental Updates**: Supports partial updates with `--no-repomix`

## Dependencies

- **repomix**: Codebase analysis and XML generation
- **OpenRouter API**: Access to multiple AI models (required)
- **Mermaid**: Diagram rendering
- **LangChain**: AI model integration
- **Zod**: Schema validation

## Installation

### Prerequisites

1. Node.js (v18 or later)
2. npm (v8 or later)
3. OpenRouter API key from https://openrouter.ai/

### Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/project_mindmap.git
   cd project_mindmap
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Configure API key (choose one method):

   ```bash
   # Environment variable
   export LLM_API_KEY=your_openrouter_api_key_here

   # Local .env file
   echo "LLM_API_KEY=your_openrouter_api_key_here" > .env

   # Global config
   mkdir -p ~/.config/generateRepomap
   echo "LLM_API_KEY=your_openrouter_api_key_here" > ~/.config/generateRepomap/.env
   ```

## Usage

### Basic Diagram Generation

```bash
# Generate diagram for current directory
npx ts-node generateRepomap.ts

# Generate diagram for specific directory
npx ts-node generateRepomap.ts ./src
```

### Feature Planning

```bash
# Add a proposed feature to the diagram
npx ts-node generateRepomap.ts --add "add a search feature"

# Skip repomix analysis when planning features
npx ts-node generateRepomap.ts --no-repomix --add "add authentication"
```

### Output Files

Generated in `./repomap_output/`:

- `repomix-output.xml`: Raw codebase analysis
- `{dirname}_base_repomap.mmd`: Current structure diagram
- `add_{feature_name}.mmd`: Feature planning diagram (if requested)

## AI Model Pipeline

The tool uses OpenRouter to access different AI models optimized for each step:

1. **XML Parsing** (Gemini Flash 1.5-8b)

   - Processes large XML files from repomix
   - Efficient at structured data extraction
   - Large context window (handles full codebase)

2. **Diagram Generation** (Claude 3.5 Sonnet)

   - Creates Mermaid diagrams
   - Strong code understanding
   - Graph relationship modeling

3. **Feature Planning** (Claude 3.5 Sonnet)
   - Architectural analysis
   - Feature impact assessment
   - Integration planning

## File Role Categories

Files are automatically categorized into roles:

| Role      | Purpose            | Examples                           |
| --------- | ------------------ | ---------------------------------- |
| Page      | Routes/Pages       | `Home.tsx`, `listing/route.ts`     |
| Component | UI Elements        | `Button.tsx`, `Header.tsx`         |
| Service   | Logic/Integration  | `apiService.ts`, `dbConnect.ts`    |
| Config    | Settings/Constants | `apiConfig.ts`, `strings.ts`       |
| Context   | State Management   | `AuthContext.tsx`, `useFilters.ts` |
| Model     | Data Structures    | `listings.ts`, `users.ts`          |

## Configuration

### repomix.config.json

```json
{
  "include": ["**/*.ts", "*.ts"],
  "exclude": ["**/node_modules/**", "dist/**", "examples/**"],
  "output": {
    "format": "xml",
    "file": "repomap_output/repomix-output.xml"
  }
}
```

### Environment Variables

- `LLM_API_KEY`: OpenRouter API key (required)

## Viewing Diagrams

1. **GitHub**: Open `.mmd` files directly (Mermaid support)
2. **SVG Export**: Use Mermaid CLI
   ```bash
   mmdc -i "./repomap_output/diagram.mmd" -o "diagram.svg"
   ```

## Troubleshooting

1. **Large Codebases**: The tool uses Gemini Flash 1.5-8b specifically for its large context window to handle extensive XML files. No special handling needed.

2. **API Rate Limits**: The tool includes automatic retries with exponential backoff for API calls.

3. **Model Selection**: Models are pre-configured for optimal performance but can be modified in the code:
   - `XML_PARSING_MODEL`
   - `DIAGRAM_GENERATION_MODEL`
   - `FEATURE_PLANNING_MODEL`

## License

MIT License - See LICENSE file for details
