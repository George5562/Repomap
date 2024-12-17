#!/usr/bin/env node

/**
 * generateRepomap.ts
 * Visualizes TypeScript codebases as Mermaid diagrams with AI-powered analysis
 *
 * Core Features:
 * - Generates visual repository maps from TypeScript codebases
 * - Supports feature integration planning with AI assistance
 * - Creates role-based diagrams with automatic styling
 * - Implements font size scaling based on file complexity
 * - Supports incremental updates with --no-repomix option
 *
 * Process Flow:
 * 1. XML Generation: Analyze codebase structure using repomix
 * 2. Data Parsing: Convert XML to structured format using Gemini
 * 3. Diagram Creation: Generate Mermaid diagram using Claude
 * 4. Feature Planning: (Optional) Visualize proposed features
 *
 * Dependencies:
 * - repomix: Codebase analysis and XML generation
 * - OpenRouter API: AI model access (Gemini, Claude)
 * - Mermaid: Diagram rendering
 *
 * Usage:
 *   generateRepomap [directory] [--add "feature request"] [--no-repomix]
 *
 * Options:
 *   directory     Target directory (defaults to current)
 *   --add         Add a proposed feature to the diagram
 *   --no-repomix  Skip repomix analysis, use existing files
 *
 * Environment:
 *   LLM_API_KEY   OpenRouter API key (required)
 *
 * @author George Stephens
 * @license MIT
 */

//----------------------------------------
// Core Dependencies
//----------------------------------------
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import * as os from "os";
import { z } from "zod";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatMessage, BaseMessage } from "@langchain/core/messages";

//----------------------------------------
// Model Configuration
//----------------------------------------
/**
 * XML Parsing Model (Steps 1-2)
 * Gemini model optimized for structured data extraction
 */
const XML_PARSING_MODEL = "google/gemini-flash-1.5-8b";

/**
 * Diagram Generation Model (Step 3)
 * Claude model for intelligent diagram creation and code understanding
 */
const DIAGRAM_GENERATION_MODEL = "anthropic/claude-3.5-sonnet:beta";

/**
 * Feature Planning Model (Step 4)
 * Claude model for architectural analysis and feature integration
 */
const FEATURE_PLANNING_MODEL = "anthropic/claude-3.5-sonnet:beta";

//----------------------------------------
// Type Definitions
//----------------------------------------
/**
 * IntermediateData Interface
 * Structured format for codebase representation between XML and Mermaid
 */
interface IntermediateData {
  files: {
    path: string;
    imports: string[];
    exports: string[];
    relationships: { type: string; target: string }[];
  }[];
  directories: string[];
}

//----------------------------------------
// OpenRouter Integration
//----------------------------------------
/**
 * OpenRouterChatModel
 * Custom LangChain implementation for OpenRouter API
 *
 * Features:
 * - Automatic retries with exponential backoff
 * - Request timeout handling (default: 5 minutes)
 * - JSON response parsing with markdown cleanup
 * - Detailed error handling and reporting
 */
export class OpenRouterChatModel extends BaseChatModel {
  private apiKey: string;
  private model: string;
  private siteUrl: string;
  private siteName: string;
  private maxRetries: number;
  private timeout: number;

  constructor(config: {
    apiKey: string;
    model?: string;
    siteUrl?: string;
    siteName?: string;
    maxRetries?: number;
    timeout?: number;
  }) {
    super({});
    this.apiKey = config.apiKey;
    this.model = config.model || "google/gemini-2.0-flash-exp:free";
    this.siteUrl = config.siteUrl || "https://github.com/George5562/Repomap";
    this.siteName = config.siteName || "RepoMap";
    this.maxRetries = config.maxRetries || 3;
    this.timeout = config.timeout || 300000;
  }

  _llmType(): string {
    return "openrouter";
  }

  bindTools(tools: any[], kwargs?: any): any {
    return this;
  }

  private async makeRequest(
    messages: BaseMessage[],
    attempt: number = 1
  ): Promise<any> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": this.siteUrl,
            "X-Title": this.siteName,
          },
          body: JSON.stringify({
            model: this.model,
            messages: messages.map((m) => ({
              role: m._getType() === "human" ? "user" : m._getType(),
              content: m.content,
            })),
          }),
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `OpenRouter API error: ${response.statusText}\n${errorText}`
        );
      }

      const result = await response.json();

      if (
        !result.choices ||
        !result.choices.length ||
        !result.choices[0].message
      ) {
        throw new Error("Invalid response format from OpenRouter API");
      }

      return result;
    } catch (error) {
      if (attempt < this.maxRetries) {
        console.log(
          `\n⚠️ attempt ${attempt} failed, retrying in ${
            attempt * 2
          } seconds...`
        );
        await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        return this.makeRequest(messages, attempt + 1);
      }
      throw error;
    }
  }

  async _generate(messages: BaseMessage[]): Promise<any> {
    try {
      const result = await this.makeRequest(messages);
      const content = result.choices[0].message.content;

      let parsedContent = content;
      if (typeof content === "string") {
        try {
          // Remove markdown code block markers if present
          const cleanContent = content.replace(/```json\n?|\n?```/g, "").trim();
          parsedContent = JSON.parse(cleanContent);
        } catch (e) {
          // If not valid JSON, use as is
          parsedContent = { diagram: content };
        }
      }

      return {
        generations: [
          {
            text:
              typeof parsedContent === "object"
                ? JSON.stringify(parsedContent)
                : parsedContent,
            message: new ChatMessage({
              content:
                typeof parsedContent === "object"
                  ? JSON.stringify(parsedContent)
                  : parsedContent,
              role: result.choices[0].message.role || "assistant",
            }),
          },
        ],
      };
    } catch (error) {
      console.error("\n❌ API error details:", error);
      throw error;
    }
  }
}

//----------------------------------------
// Visual Style Configuration
//----------------------------------------
/**
 * Role Definitions
 * Maps file types to visual representations in the diagram
 */
const ROLE_DEFINITIONS = [
  { role: "page", shape: "rectangle", color: "#d0ebff" }, // UI/routing files
  { role: "component", shape: "stadium", color: "#d3f9d8" }, // Reusable UI elements
  { role: "service", shape: "circle", color: "#ffe8cc" }, // Business logic
  { role: "config", shape: "triangle", color: "#ffe3e3" }, // Configuration files
];

/**
 * Relationship Types
 * Defines valid connection types between nodes
 */
const RELATIONSHIP_VERBS = [
  "uses", // General dependency
  "calls", // Function/method invocation
  "renders", // Component rendering
  "fetches from", // Data retrieval
  "provides data to", // Data provision
];

/**
 * Font Size Configuration
 * Scales node text based on file complexity
 */
const MIN_LINES = 100; // Files ≤100 lines: 10px
const MAX_LINES = 500; // Files ≥500 lines: 20px
const MIN_FONT = 10;
const MAX_FONT = 20;

/**
 * Global Configuration Paths
 */
const HOME_DIR = os.homedir();
const GLOBAL_CONFIG_DIR = path.join(HOME_DIR, ".config", "generateRepomap");
const GLOBAL_CONFIG_FILE = path.join(GLOBAL_CONFIG_DIR, ".env");

//----------------------------------------
// CLI Help Documentation
//----------------------------------------
function printHelp() {
  console.log(`
usage:
  generateRepomap [directory] [--add "feature request"] [--no-repomix]

examples:
  generateRepomap ./src
  generateRepomap ./src --add "add a search feature for listings"
  generateRepomap ./src --no-repomix --add "add another feature"

if no directory is specified, uses current directory.
if --no-repomix is specified, we skip running repomix and rely on previously generated files.
`);
}

//----------------------------------------
// API Key Management
//----------------------------------------
/**
 * getApiKey
 * Retrieves OpenRouter API key from available sources
 *
 * Search Order:
 * 1. Environment variable
 * 2. Local .env file
 * 3. Global config file
 *
 * @returns API key if found
 * @throws Error if no API key is found
 */
function getApiKey(): string {
  try {
    if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;

    const localEnv = dotenv.config();
    if (localEnv.parsed?.LLM_API_KEY) return localEnv.parsed.LLM_API_KEY;

    if (fs.existsSync(GLOBAL_CONFIG_FILE)) {
      const globalEnvResult = dotenv.config({
        path: GLOBAL_CONFIG_FILE,
        override: true,
      });
      if (globalEnvResult.error)
        throw new Error(
          `error reading global config: ${globalEnvResult.error.message}`
        );
      if (process.env.LLM_API_KEY) return process.env.LLM_API_KEY;
    }

    console.error("\n❌ API key not found.");
    console.error(
      "please set LLM_API_KEY via env var, local .env, or global config."
    );
    process.exit(1);
  } catch (error) {
    console.error(
      "\n❌ error reading config:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

//----------------------------------------
// File System Operations
//----------------------------------------
/**
 * runRepomix
 * Executes repomix analysis on target directory
 */
function runRepomix(targetDir: string, outputFile: string) {
  console.log("\n🔍 Step 1: Running repomix analysis...");
  try {
    execSync(`npx repomix analyze "${targetDir}" -o "${outputFile}"`, {
      stdio: "inherit",
    });
    console.log("✅ XML generation complete");
  } catch (error) {
    console.error("\n❌ Error in Step 1 - XML generation:", error);
    throw error;
  }
}

/**
 * prepareOutputDirectory
 * Creates output directory if needed
 */
function prepareOutputDirectory(outputDir: string) {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
}

//----------------------------------------
// Schema Definitions
//----------------------------------------
/**
 * Mermaid Diagram Schema
 * Validates diagram output format
 */
const diagramSchema = z.object({
  diagram: z.string().describe("mermaid diagram starting with 'flowchart TB'"),
});

/**
 * Feature Changes Schema
 * Validates proposed feature modifications
 */
const changesSchema = z.object({
  newNodes: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      role: z.enum(
        ROLE_DEFINITIONS.map((r) => r.role) as [string, ...string[]]
      ),
    })
  ),
  newEdges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      relationship: z.string(),
      proposed: z.boolean(),
    })
  ),
  explanation: z
    .string()
    .describe("A verbose, human-readable explanation of the proposed changes"),
});

//----------------------------------------
// Diagram Generation
//----------------------------------------
/**
 * constructXmlParsingPrompt
 * Creates prompt for XML to JSON conversion
 *
 * Guides model to:
 * 1. Extract file metadata
 * 2. Identify dependencies
 * 3. Map relationships
 * 4. Maintain structure
 */
function constructXmlParsingPrompt(xmlContent: string): string {
  return `
Given the repository structure in XML format, transform it into a JSON object that captures the following:

---

### 1. File Roles  
Assign a **one-word role** for each file based on its functional purpose:

| **Role**        | **Definition**                                                  | **Examples**                      |
|-----------------|----------------------------------------------------------------|----------------------------------|
| \`Page\`         | Files that define routes or pages.                              | \`Home.tsx\`, \`listing/route.ts\`   |
| \`Component\`    | UI components and reusable visual elements.                     | \`Button.tsx\`, \`Header.tsx\`       |
| \`Service\`      | Files providing logic, utilities, or external integrations.     | \`apiService.ts\`, \`dbConnect.ts\`  |
| \`Config\`       | Files that store configuration, constants, or static content.   | \`apiConfig.ts\`, \`strings.ts\`     |
| \`Context\`      | Context providers or custom hooks for state management.         | \`AuthContext.tsx\`, \`useFilters.ts\`|
| \`Model\`        | Data models or interfaces.                                      | \`listings.ts\`, \`users.ts\`        |

Each file must include its **role** in the JSON output.

---

### 2. Relationships  
Analyze the relationships between files by parsing **import/export** statements. For each file, list its relationships in the style:

\`\`\`json
{
  "filePath": "path/to/file.ts",
  "role": "RoleName",
  "relationships": [
    {
      "type": "RelationshipType",
      "target": "path/to/targetFile",
      "details": "Additional Details (e.g., function, type, interface)"
    }
  ]
}
\`\`\`

**Table of Relationships**:

| **Relationship Type**  | **Condition**                                              | **Details**                     |
|------------------------|-----------------------------------------------------------|---------------------------------|
| \`imports\`             | File imports another file.                                 | Include specific imports (functions, types, components). |
| \`renders\`             | File imports a component or UI element.                    | Specify component name.         |
| \`uses\`                | File imports a service, utility, or hook.                  | Function/service name.          |
| \`configures\`          | File imports a configuration or constant.                  | Constant name or file.          |
| \`exports\`             | File exports functions, components, types, or interfaces.  | Specify export name and type.   |
| \`depends_on\`          | Logical dependency not captured through direct imports.    | High-level functional linkage.  |

---

### 3. File Path  
For each file, include the **full file path** as provided in the XML input. Paths must be normalized to their absolute form.

---

### Final JSON Structure  

The output JSON should follow this structure:

\`\`\`json
{
  "files": [
    {
      "filePath": "path/to/file.ts",
      "role": "Component",
      "relationships": [
        {
          "type": "imports",
          "target": "path/to/service.ts",
          "details": "apiService function"
        },
        {
          "type": "renders",
          "target": "path/to/Header.tsx",
          "details": "Header component"
        }
      ]
    },
    {
      "filePath": "path/to/config/apiConfig.ts",
      "role": "Config",
      "relationships": []
    }
  ]
}
\`\`\`

---

### Requirements for the LLM  

1. Parse the XML input to extract:
   - File paths.
   - Import/export statements for each file.
2. Identify what is being imported/exported within each file.
3. Assign one of the pre-defined **roles** to each file based on its content.
4. Derive all relationships (e.g., \`imports\`, \`renders\`, \`configures\`) for each file.
5. Normalize and include the file path in absolute form.

Ensure the output is **clean, formatted JSON** with no missing details.

XML Content:
${xmlContent}`;
}

/**
 * parseXmlToUnstructuredMap
 * Converts repomix XML to IntermediateData format
 *
 * @param content Raw XML from repomix
 * @returns Structured codebase representation
 */
async function parseXmlToUnstructuredMap(
  content: string
): Promise<IntermediateData> {
  console.log("\n📊 Step 2/4: Parsing XML structure");

  const apiKey = getApiKey();

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/George5562/Repomap",
          "X-Title": "RepoMap",
        },
        body: JSON.stringify({
          model: XML_PARSING_MODEL,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are a code analysis assistant that extracts structured information from codebase content.
Your responses should always be valid JSON objects in the following format:
{
  "files": [
    {
      "path": "string",
      "imports": ["string"],
      "exports": ["string"],
      "relationships": [
        {
          "type": "string (uses|renders|fetches from|provides data to)",
          "target": "string (normalized path)"
        }
      ]
    }
  ],
  "directories": ["string"]
}

Important:
1. Ensure all relative imports are normalized to absolute paths
2. Every import should have a corresponding relationship
3. Use appropriate relationship types based on what is being imported
4. Return ONLY valid JSON, no markdown or additional text`,
            },
            {
              role: "user",
              content: constructXmlParsingPrompt(content),
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    const result = await response.json();
    if (!result.choices?.[0]?.message?.content) {
      throw new Error("Invalid API response format");
    }

    let parsed;
    const rawContent = result.choices[0].message.content;

    try {
      // First try: direct JSON parse
      parsed =
        typeof rawContent === "object" ? rawContent : JSON.parse(rawContent);
    } catch (e) {
      try {
        // Second try: clean up markdown and comments
        const cleaned = rawContent
          .replace(/```json\n?|\n?```/g, "")
          .replace(/\/\/.+/g, "") // Remove single line comments
          .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
          .trim();
        parsed = JSON.parse(cleaned);
      } catch (e2) {
        // Last resort: aggressive cleanup
        const aggressive = rawContent
          .replace(/```[\s\S]*?```/g, "") // Remove all code blocks
          .replace(/[^\x20-\x7E]/g, "") // Remove non-printable characters
          .replace(/\/\/.+/g, "") // Remove comments
          .replace(/\/\*[\s\S]*?\*\//g, "") // Remove multi-line comments
          .replace(/,(\s*[}\]])/g, "$1") // Remove trailing commas
          .replace(/\s+/g, " ") // Normalize whitespace
          .replace(/([{,]\s*)([a-zA-Z0-9_]+):/g, '$1"$2":') // Quote unquoted keys
          .trim();

        // Find the first { and last }, take only that substring
        const start = aggressive.indexOf("{");
        const end = aggressive.lastIndexOf("}") + 1;
        if (start >= 0 && end > start) {
          const jsonStr = aggressive.substring(start, end);
          parsed = JSON.parse(jsonStr);
        } else {
          throw new Error("Could not find valid JSON structure in response");
        }
      }
    }

    // Basic structure validation
    if (!parsed.files || !Array.isArray(parsed.files)) {
      parsed = {
        files: [],
        directories: [],
      };
    }

    // Ensure each file has the required properties
    parsed.files = parsed.files.map((file: any) => ({
      path: file.path || "",
      imports: Array.isArray(file.imports) ? file.imports : [],
      exports: Array.isArray(file.exports) ? file.exports : [],
      relationships: Array.isArray(file.relationships)
        ? file.relationships
        : [],
    }));

    // Ensure directories is an array
    if (!Array.isArray(parsed.directories)) {
      parsed.directories = [];
    }

    return parsed as IntermediateData;
  } catch (error) {
    console.error("⚠️ XML parsing failed, returning empty structure");
    return {
      files: [],
      directories: [],
    };
  }
}

/**
 * generateMermaidDiagram
 * Creates Mermaid diagram from IntermediateData
 *
 * @param structureData Parsed codebase structure
 * @returns Mermaid diagram syntax
 */
async function generateMermaidDiagram(
  structureData: IntermediateData
): Promise<string> {
  console.log("\n🎨 Step 3/4: Generating diagram");

  const apiKey = getApiKey();

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/George5562/Repomap",
          "X-Title": "RepoMap",
        },
        body: JSON.stringify({
          model: DIAGRAM_GENERATION_MODEL,
          messages: [
            {
              role: "system",
              content: `You are a diagram generation assistant that creates Mermaid flowcharts from codebase structures.
                Your responses must always start with 'flowchart TB' and use correct Mermaid syntax.

                ### Class Definitions:
                Define these styles for the roles:
                classDef page fill:#d0ebff,stroke:#333,stroke-width:1px,color:#fff,shape:rect;
                classDef component fill:#d3f9d8,stroke:#333,stroke-width:1px,color:#fff,shape:round;
                classDef service fill:#ffe8cc,stroke:#333,stroke-width:1px,color:#fff,shape:diamond;
                classDef config fill:#ffe3e3,stroke:#333,stroke-width:1px,color:#fff,shape:parallelogram;
                classDef model fill:#f8f9fa,stroke:#333,stroke-width:1px,color:#333,shape:ellipse;
                classDef context fill:#fef9c3,stroke:#333,stroke-width:1px,color:#333,shape:hexagon;

                ### Relationship Rules:
                - Use the 'imports' relationship only to avoid duplication.
                - Format the arrow text as follows:
                  **type:** followed by the details of the relationship.

                Example:
                listing.ts -- **imports:** apiService function --> nextauth.ts
                `,
            },
            {
              role: "user",
              content: `Create a Mermaid flowchart from this codebase structure:

${JSON.stringify(structureData, null, 2)}

### Instructions:
1. Start the diagram with 'flowchart TB'.
2. Group related nodes into subgraphs based on their directory structure.
3. Use the appropriate classDef styles for each node based on its role:
   - Page → class: page
   - Component → class: component
   - Service → class: service
   - Config → class: config
   - Model → class: model
   - Context → class: context
4. Map the relationships using arrows with proper labels:
   - Arrow text must include the bold **type:** followed by 'details'.
   - Example: listing.ts -- **imports:** apiService function --> nextauth.ts
5. Escape node names containing square brackets (e.g., replace \[...\] with \\[...\\]) to avoid Mermaid syntax errors.
6. Ensure the diagram is clean and maintainable. **Return ONLY the Mermaid diagram syntax.**`,
            },
          ],
        }),
      }
    );

    const data = await response.json();
    const diagram = data.choices?.[0]?.message?.content;

    if (diagram) {
      return diagram;
    } else {
      throw new Error("No Mermaid diagram generated.");
    }
  } catch (error) {
    console.error("Error generating Mermaid diagram:", error);
    throw error;
  }
}

//----------------------------------------
// Feature Planning
//----------------------------------------
/**
 * getProposedChanges
 * Plans changes for requested feature
 */
async function getProposedChanges(
  structureData: IntermediateData,
  featureRequest: string
): Promise<any> {
  console.log("\n🎯 Planning feature changes...");
  const apiKey = getApiKey();
  const model = new OpenRouterChatModel({
    apiKey,
    model: FEATURE_PLANNING_MODEL,
    siteUrl: "https://github.com/George5562/repomap",
    siteName: "RepoMap",
  });

  const structuredModel = model.withStructuredOutput(changesSchema);
  return await structuredModel.invoke(
    constructFeaturePrompt(structureData, featureRequest)
  );
}

/**
 * integrateChangesIntoDiagram
 * Integrates proposed changes into existing diagram
 */
async function integrateChangesIntoDiagram(
  baseDiagram: string,
  changes: any
): Promise<string> {
  console.log("\n🔄 Integrating changes into diagram...");
  const apiKey = getApiKey();
  const model = new OpenRouterChatModel({
    apiKey,
    model: FEATURE_PLANNING_MODEL,
    siteUrl: "https://github.com/George5562/repomap",
    siteName: "RepoMap",
  });

  const structuredModel = model.withStructuredOutput(diagramSchema);
  return (
    await structuredModel.invoke(
      constructIntegrationPrompt(baseDiagram, changes)
    )
  ).diagram;
}

/**
 * constructFeaturePrompt
 * Creates prompt for feature planning
 */
function constructFeaturePrompt(
  structureData: IntermediateData,
  featureRequest: string
): string {
  return `
analyze this TypeScript codebase and propose changes for the requested feature.
suggest new components and their relationships while maintaining existing architecture.

feature request: "${featureRequest}"

current structure:
${JSON.stringify(structureData, null, 2)}

instructions:
1. analyze the current codebase structure
2. propose new components needed for the feature
3. define relationships between new and existing components
4. use available roles: ${ROLE_DEFINITIONS.map((r) => r.role).join(", ")}
5. use relationship types: ${RELATIONSHIP_VERBS.join(", ")}
`;
}

/**
 * constructIntegrationPrompt
 * Creates prompt for integrating changes
 */
function constructIntegrationPrompt(baseDiagram: string, changes: any): string {
  return `
integrate these proposed changes into the existing mermaid diagram.
maintain consistent styling and structure while adding new components.

base diagram:
${baseDiagram}

proposed changes:
${JSON.stringify(changes, null, 2)}

instructions:
1. preserve existing diagram structure and styling
2. add new nodes with correct shapes and colors
3. integrate new relationships
4. maintain flowchart TB direction
5. ensure all style definitions are preserved
`;
}

/**
 * planAndVisualizeFeature
 * Plans and visualizes new feature additions
 *
 * @param structureData Current codebase structure
 * @param featureRequest Requested feature description
 * @param baseDiagram Existing Mermaid diagram
 * @returns Updated diagram with new features
 */
async function planAndVisualizeFeature(
  structureData: IntermediateData,
  featureRequest: string,
  baseDiagram: string
): Promise<string> {
  console.log("\n✨ Step 4/4: Planning feature");

  const changes = await getProposedChanges(structureData, featureRequest);
  const updatedDiagram = await integrateChangesIntoDiagram(
    baseDiagram,
    changes
  );
  return updatedDiagram;
}

//----------------------------------------
// File Operations
//----------------------------------------
/**
 * saveDiagram
 * Writes Mermaid diagram to file
 */
function saveDiagram(mermaidSyntax: string, mermaidFile: string): void {
  fs.writeFileSync(mermaidFile, mermaidSyntax, { flag: "w" });
  console.log(`✅ Saved: ${path.basename(mermaidFile)}`);
}

/**
 * sanitizeFeatureName
 * Converts feature request to valid filename
 */
function sanitizeFeatureName(featureRequest: string): string {
  return featureRequest
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function applyFontSizeScaling(
  diagram: string,
  lineCountMap: Map<string, number>
): string {
  const lines = diagram.split("\n");
  const nodeRegex = /^(\s*)([a-zA-Z0-9_]+)\((\[?"?([^\"]+)"?\]?)\)/;
  const newLines: string[] = [];
  for (const line of lines) {
    newLines.push(line);
    const match = nodeRegex.exec(line);
    if (match) {
      const nodeId = match[2];
      const filename = match[4];
      const linesCount = lineCountMap.get(filename);
      if (linesCount !== undefined) {
        const fontSize = calculateFontSize(linesCount);
        newLines.push(`style ${nodeId} font-size:${fontSize}px;`);
      }
    }
  }
  return newLines.join("\n");
}

//----------------------------------------
// Line Count Processing
//----------------------------------------
/**
 * parseLineCountsFromRepomix
 * Extracts line counts from repomix output
 */
function parseLineCountsFromRepomix(repofile: string): Map<string, number> {
  const content = fs.readFileSync(repofile, "utf8");
  const lineCountMap = new Map<string, number>();
  const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g;
  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    const filePath = match[1];
    const fileContent = match[2];
    let maxLine = 0;
    const lineMatches = fileContent.matchAll(/^(\d+):/gm);
    for (const lm of lineMatches) {
      const num = parseInt(lm[1], 10);
      if (num > maxLine) maxLine = num;
    }
    const filename = path.basename(filePath);
    lineCountMap.set(filename, maxLine);
  }
  return lineCountMap;
}

/**
 * Calculates font size based on line count
 * Rules:
 * - Files ≤ MIN_LINES get MIN_FONT size
 * - Files ≥ MAX_LINES get MAX_FONT size
 * - Files in between get proportionally scaled size
 */
function calculateFontSize(lines: number): number {
  if (lines <= MIN_LINES) return MIN_FONT;
  if (lines >= MAX_LINES) return MAX_FONT;
  const ratio = (lines - MIN_LINES) / (MAX_LINES - MIN_LINES);
  return MIN_FONT + ratio * (MAX_FONT - MIN_FONT);
}

//----------------------------------------
// Main Program Flow
//----------------------------------------
/**
 * Main function orchestrating the four-step process:
- * 1. Generate XML with repomix
- * 2. Parse to IntermediateData using Gemini
- * 3. Create Mermaid diagram using Claude
- * 4. (Optional) Add feature visualization
- */
async function generateRepomap() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  // Parse command line arguments
  let featureRequest: string | null = null;
  const addIndex = args.indexOf("--add");
  if (addIndex !== -1 && args[addIndex + 1]) {
    featureRequest = args[addIndex + 1];
  }

  const noRepomix = args.includes("--no-repomix");
  const targetDir =
    args[0] && args[0] !== "--add" && args[0] !== "--no-repomix"
      ? path.resolve(args[0])
      : process.cwd();

  // Setup output directories
  const dirName = path.basename(targetDir);
  const OUTPUT_DIR = path.join(targetDir, "repomap_output");
  prepareOutputDirectory(OUTPUT_DIR);

  const REPOMIX_OUTPUT_FILE = path.join(OUTPUT_DIR, "repomix-output.xml");
  const BASE_FILE = path.join(OUTPUT_DIR, `${dirName}_base_repomap.mmd`);
  const FINAL_FILE = featureRequest
    ? path.join(OUTPUT_DIR, `add_${sanitizeFeatureName(featureRequest)}.mmd`)
    : path.join(OUTPUT_DIR, `${dirName}_repomap.mmd`);

  try {
    console.log("\n🚀 Step 1/4: Analyzing codebase");

    // Step 1: Generate XML using repomix
    if (!noRepomix) {
      execSync(
        `npx repomix analyze "${targetDir}" -o "${REPOMIX_OUTPUT_FILE}"`,
        {
          stdio: ["ignore", "pipe", "pipe"],
        }
      );
    } else if (!fs.existsSync(REPOMIX_OUTPUT_FILE)) {
      throw new Error(
        "No repomix-output.xml found. Run without --no-repomix first."
      );
    }

    // Step 2: Parse XML to intermediate format
    const repomixXml = fs.readFileSync(REPOMIX_OUTPUT_FILE, "utf8");
    const structureData = await parseXmlToUnstructuredMap(repomixXml);

    // Step 3: Generate base Mermaid diagram
    let diagram: string;
    if (!fs.existsSync(BASE_FILE) && !noRepomix) {
      diagram = await generateMermaidDiagram(structureData);
      diagram = applyFontSizeScaling(
        diagram,
        parseLineCountsFromRepomix(REPOMIX_OUTPUT_FILE)
      );
      saveDiagram(diagram, BASE_FILE);
    } else {
      diagram = fs.readFileSync(BASE_FILE, "utf8");
      console.log("📄 Using existing base diagram");
    }

    // Step 4: (Optional) Add feature visualization
    if (featureRequest) {
      diagram = await planAndVisualizeFeature(
        structureData,
        featureRequest,
        diagram
      );
      diagram = applyFontSizeScaling(
        diagram,
        parseLineCountsFromRepomix(REPOMIX_OUTPUT_FILE)
      );
      saveDiagram(diagram, FINAL_FILE);
    } else {
      fs.copyFileSync(BASE_FILE, FINAL_FILE);
      saveDiagram(diagram, FINAL_FILE);
    }

    // Output viewing instructions
    console.log("\n📋 View options:");
    console.log("1. Open in GitHub (supports .mmd files)");
    console.log(
      "2. Generate SVG: mmdc -i",
      path.basename(FINAL_FILE),
      "-o",
      path.basename(FINAL_FILE).replace(".mmd", ".svg")
    );
  } catch (error) {
    console.error(
      "\n❌ Error:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// Execute main program
generateRepomap().catch((err) => {
  console.error(
    "\n❌ Unexpected error:",
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
