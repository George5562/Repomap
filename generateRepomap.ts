#!/usr/bin/env node

/**
 * generateRepomap.ts
 * A  tool to visualize TypeScript codebases using Mermaid diagrams
 *
 * Key Features:
 * 1. Generates visual repository maps from TypeScript codebases
 * 2. Supports feature integration planning with AI assistance
 * 3. Creates role-based diagrams with automatic styling
 * 4. Uses GenAI for feature planning and code refactoring
 *
 * Usage:
 *   generateRepomap [directory] [--add "feature request"] [--no-repomix]
 *
 * Options:
 *   directory     - Target directory (defaults to current)
 *   --add         - Add a proposed feature to the diagram
 *   --no-repomix  - Skip repomix analysis, use existing files
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
import { ChatAnthropic } from "@langchain/anthropic";

//----------------------------------------
// Visual Style Configuration
//----------------------------------------
const ROLE_DEFINITIONS = [
  { role: "page", shape: "rectangle", color: "#d0ebff" }, // Light blue for pages
  { role: "component", shape: "stadium", color: "#d3f9d8" }, // Light green for components
  { role: "service", shape: "circle", color: "#ffe8cc" }, // Light orange for services
  { role: "config", shape: "triangle", color: "#ffe3e3" }, // Light red for config
];
// see more shapes at https://mermaid.js.org/syntax/flowchart.html#subgraphs

// Valid relationship verbs for diagram connections
const RELATIONSHIP_VERBS = [
  "uses",
  "calls",
  "renders",
  "fetches from",
  "provides data to",
];

// Font size scaling configuration based on file size
const MIN_LINES = 100;
const MAX_LINES = 500;
const MIN_FONT = 10;
const MAX_FONT = 20;

// Configuration paths
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
 * Retrieves the Anthropic API key from various sources in order:
 * 1. Environment variable
 * 2. Local .env file
 * 3. Global config file
 * @returns {string} The API key if found
 * @throws {Error} If no API key is found
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

    console.error("\n❌ api key not found.");
    console.error("please set it via env var, local .env, or global config.");
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
 * Creates the output directory if it doesn't exist
 * @param {string} outputDir - Path to the output directory
 */
function prepareOutputDirectory(outputDir: string) {
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
}

/**
 * Verifies repomix installation and throws if not found
 * @throws {Error} If repomix is not installed
 */
function checkRepomixInstallation() {
  try {
    execSync("repomix --version", { stdio: "ignore" });
  } catch {
    throw new Error("repomix not installed. run: npm install -g repomix");
  }
}

/**
 * Executes repomix analysis on the target directory
 * @param {string} targetDir - Directory to analyze
 * @param {string} repomixOutputFile - Output file path
 * @throws {Error} If repomix execution fails
 */
function runRepomix(targetDir: string, repomixOutputFile: string) {
  console.log(`\n🔍 analyzing dir: ${targetDir}`);
  console.log(`📁 absolute path: ${path.resolve(targetDir)}`);
  console.log(`📝 output file: ${repomixOutputFile}`);
  checkRepomixInstallation();
  const command = `repomix "${targetDir}" --style xml --include "**/*.ts,**/*.tsx,**/*.js,**/*.jsx" --ignore "**/node_modules/**,**/dist/**,**/.git/**" --output-show-line-numbers -o "${repomixOutputFile}"`;
  console.log(`🔧 running command: ${command}`);
  try {
    execSync(command, { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"] });
  } catch (error) {
    console.error("\n❌ repomix error details:", error);
    throw new Error(
      `failed to run repomix: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

//----------------------------------------
// Schema Definitions
//----------------------------------------
/**
 * Zod schema for Mermaid diagram output
 */
const diagramSchema = z.object({
  diagram: z.string().describe("mermaid diagram starting with 'flowchart TB'"),
});

/**
 * Zod schema for proposed feature changes
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
 * Constructs CSS class definitions for role-based styling
 * @returns {string} Mermaid class definitions
 */
function constructRoleClassDefs(): string {
  return ROLE_DEFINITIONS.map(
    (r) =>
      `classDef ${r.role} fill:${r.color},stroke:#333,stroke-width:1px,color:#fff;`
  ).join("\n");
}

/**
 * Creates note about valid relationship verbs
 * @returns {string} Formatted relationship note
 */
function constructRelationshipsNote(): string {
  return `you can use these verbs: ${RELATIONSHIP_VERBS.join(
    ", "
  )}. pick what's most relevant.`;
}

//----------------------------------------
// LLM Integration
//----------------------------------------
/**
 * Generates base repository map using Claude
 * @param {string} xmlContent - Repomix XML output
 * @param {string} rolesString - Role class definitions
 * @param {string} relationshipsNote - Relationship documentation
 * @returns {Promise<string>} Generated Mermaid diagram
 */
async function processWithStructuredOutput(
  xmlContent: string
): Promise<string> {
  console.log("\n🤖 generating base repomap...");
  const apiKey = getApiKey();
  const model = new ChatAnthropic({
    anthropicApiKey: apiKey,
    modelName: "claude-3-5-sonnet-latest",
    temperature: 0,
  });
  const structuredModel = model.withStructuredOutput(diagramSchema, {
    name: "diagram_response",
  });

  // updated prompt with subgraph instructions
  const prompt = `
you have a ts codebase in repomix xml form. produce a mermaid diagram with node types for each roles, subgraphs for each subdirectory, and named edges between nodes denoting the relationship. Use specific bracket syntax for shapes AND apply color classes:

flowchart TB  
    %% First define class styling for colors
    ClassDef *roles*
    
    subgraph subdirectory1
        %% Use bracket syntax for shapes:
        %% ((text)) for circles
        %% ([text]) for rounded rectangles
        %% [[text]] for subroutines
        %% >text] for flags
        %% {text} for rhombus
        file1(([File 1])):::role1
        file2([File 2]):::role2
    end
    
    subgraph subdirectory2
        file3[[File 3]]:::role1
        file4>File 4]:::role2
    end

    file1 -- relationship1 --> file2
    file1 -- relationship1 --> file3
    file2 -- relationship3 --> file4
    file3 -- relationship2 --> file4
    file4 -- relationship5 --> file1


instructions:
1. parse the xml to find each file's role. 
2. roles, shapes and colors:
${ROLE_DEFINITIONS.map((r) => `- ${r.role} (${r.shape}, ${r.color})`).join(
  "\n"
)}, adding classDefs for each into the code.
3. Assign each file a role from ${ROLE_DEFINITIONS.map((r) => r.role).join(
    ", "
  )}
4. For each node:
   - Use appropriate bracket syntax for the shape based on role
   - Apply color class using :::rolename syntax
5. group nodes into subgraphs by directory
6. name edges by relationship, choosing from this list: ${RELATIONSHIP_VERBS.join(
    ", "
  )} e.g. page "renders" component, component "calls" service, service "fetches from" config.
7. output only a json { "diagram": "..." } with no extra commentary.

xml:
${xmlContent}
`;

  const response = await structuredModel.invoke(prompt);
  const diagram = response.diagram.trim();
  if (!diagram.startsWith("flowchart TB"))
    throw new Error("diagram must start with 'flowchart TB'");
  return diagram;
}

/**
 * Plans changes for new feature integration
 * @param {string} repomixXml - Repomix XML output
 * @param {string} featureRequest - User's feature request
 * @returns {Promise<z.infer<typeof changesSchema>>} Planned changes
 */
async function getProposedChanges(
  repomixXml: string,
  featureRequest: string
): Promise<z.infer<typeof changesSchema>> {
  console.log("\n🧩 planning new feature changes...");
  const apiKey = getApiKey();
  const model = new ChatAnthropic({
    anthropicApiKey: apiKey,
    modelName: "claude-3-5-sonnet-latest",
    temperature: 0,
  });
  const structuredModel = model.withStructuredOutput(changesSchema, {
    name: "proposed_changes",
  });

  // updated prompt to include the explanation
  const prompt = `
you have a ts codebase in repomix xml and a user wants to add a new feature.

user request: "${featureRequest}"

instructions:
1. analyze xml to understand code structure.
2. propose new nodes/edges for the feature:
   for files: newNodes: {id, label, role}
   for relationships: newEdges: {from, to, relationship, proposed:true}
3. in addition to newNodes and newEdges, also include an "explanation" field in the returned json:
   "explanation": "a verbose english description of the reasoning behind these changes, e.g. 'to add search, we introduce a search service which ...', etc."
   this should describe what was added and why, in human-friendly language.
4. return only { "newNodes": [...], "newEdges": [...], "explanation": "..." } json, no mermaid code.
5. use roles and relationship verbs as before.
6. feature should fit logically with existing structure.

xml:
${repomixXml}
`;

  const response = await structuredModel.invoke(prompt);
  return response;
}

/**
 * Integrates proposed changes into existing diagram
 * @param {string} originalDiagram - Base Mermaid diagram
 * @param {z.infer<typeof changesSchema>} changes - Proposed changes
 * @returns {Promise<string>} Updated Mermaid diagram
 */
async function integrateChangesIntoDiagram(
  originalDiagram: string,
  changes: z.infer<typeof changesSchema>
): Promise<string> {
  console.log("\n🔧 integrating proposed changes...");
  const apiKey = getApiKey();
  const model = new ChatAnthropic({
    anthropicApiKey: apiKey,
    modelName: "claude-3-5-sonnet-latest",
    temperature: 0,
  });
  const structuredModel = model.withStructuredOutput(diagramSchema, {
    name: "diagram_response",
  });

  const prompt = `
you have an original mermaid diagram and proposed changes.

original:
${originalDiagram}

changes:
${JSON.stringify(changes, null, 2)}

instructions:
1. inspect the original diagram to understand current roles, classes, subgraphs, and relationships:
   - analyze how existing nodes use bracket syntax for shapes (e.g., ((text)) for circles, ([text]) for rounded rectangles)
   - note the classDefs and color assignments using :::rolename syntax
   - understand the existing subgraph structure

2. add new nodes using the same shape conventions but with dashed styling:
   - use the SAME bracket syntax as existing nodes of the same role:
     * ((text)) for circles
     * ([text]) for rounded rectangles
     * [[text]] for subroutines
     * >text] for flags
     * {text} for rhombus
   - apply appropriate color class using :::rolename
   - add style override for dashed border: style nodeName stroke-dasharray: 5 5
   - group in appropriate subgraph based on directory

3. add new relationships with dashed lines:
   - use dotted arrow syntax: A-. "relationship" .->B
   - use relationship verbs from this list: ${RELATIONSHIP_VERBS.join(", ")}
   - maintain existing relationships unchanged
   - new relationships to/from existing nodes should use dashed lines

4. maintain diagram structure:
   - keep 'flowchart TB' at the start
   - preserve all existing nodes, edges, and subgraphs exactly as they are
   - maintain all existing classDefs
   - if adding new roles, add their classDefs in the same style
   - place new subgraphs (if needed) after existing ones

5. output only a json with a "diagram" key containing the updated mermaid code.
   do not include extra commentary or code fences.

example of new node with dashed style:
  newNode(([New Feature])):::role1
  style newNode stroke-dasharray: 5 5

example of new relationship:
  newNode-. "uses" .->existingNode

the goal is to have a coherent updated diagram that integrates the new components while clearly distinguishing them with dashed lines but maintaining consistent shapes and colors with existing nodes of the same role.
`;

  const response = await structuredModel.invoke(prompt);
  const diagram = response.diagram.trim();
  if (!diagram.startsWith("flowchart TB"))
    throw new Error("updated diagram must start with 'flowchart TB'");
  return diagram;
}

//----------------------------------------
// File Operations
//----------------------------------------
/**
 * Saves Mermaid diagram to file
 * @param {string} mermaidSyntax - Diagram content
 * @param {string} mermaidFile - Output file path
 */
function saveDiagram(mermaidSyntax: string, mermaidFile: string) {
  console.log(`\n💾 saving repomap to ${mermaidFile}...`);
  fs.writeFileSync(mermaidFile, mermaidSyntax, { flag: "w" });
  console.log(`✅ saved ${mermaidFile}`);
}

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
 */
function calculateFontSize(lines: number): number {
  if (lines <= MIN_LINES) return MIN_FONT;
  if (lines >= MAX_LINES) return MAX_FONT;
  const ratio = (lines - MIN_LINES) / (MAX_LINES - MIN_LINES);
  return MIN_FONT + ratio * (MAX_FONT - MIN_FONT);
}

//----------------------------------------
// main
//----------------------------------------
async function generateRepomap() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  let featureRequest: string | null = null;
  const addIndex = args.indexOf("--add");
  if (addIndex !== -1 && args[addIndex + 1])
    featureRequest = args[addIndex + 1];

  const noRepomix = args.includes("--no-repomix");
  const targetDir =
    args[0] && args[0] !== "--add" && args[0] !== "--no-repomix"
      ? path.resolve(args[0])
      : process.cwd();
  const dirName = path.basename(targetDir);
  const OUTPUT_DIR = path.join(targetDir, "repomap_output");
  prepareOutputDirectory(OUTPUT_DIR);

  const REPOMIX_OUTPUT_FILE = path.join(OUTPUT_DIR, "repomix-output.xml");
  const BASE_FILE = path.join(OUTPUT_DIR, `${dirName}_base_repomap.mmd`);
  const FINAL_FILE = featureRequest
    ? path.join(OUTPUT_DIR, `add_${sanitizeFeatureName(featureRequest)}.mmd`)
    : path.join(OUTPUT_DIR, `${dirName}_repomap.mmd`);

  try {
    console.log("\n🚀 starting repomap generation...");

    if (!noRepomix) {
      runRepomix(targetDir, REPOMIX_OUTPUT_FILE);
    } else {
      if (!fs.existsSync(REPOMIX_OUTPUT_FILE) || !fs.existsSync(BASE_FILE)) {
        throw new Error(
          `--no-repomix set but missing base diagram or repomix-output.xml. run without --no-repomix first.`
        );
      }
    }

    if (!fs.existsSync(REPOMIX_OUTPUT_FILE)) {
      throw new Error(
        "no repomix-output.xml found, run without --no-repomix first."
      );
    }
    const lineCountMap = parseLineCountsFromRepomix(REPOMIX_OUTPUT_FILE);

    let baseDiagram: string;
    if (!fs.existsSync(BASE_FILE) && !noRepomix) {
      const repomixXml = fs.readFileSync(REPOMIX_OUTPUT_FILE, "utf8");
      baseDiagram = await processWithStructuredOutput(repomixXml);
      baseDiagram = applyFontSizeScaling(baseDiagram, lineCountMap);
      saveDiagram(baseDiagram, BASE_FILE);
    } else {
      baseDiagram = fs.readFileSync(BASE_FILE, "utf8");
    }

    console.log(`\n✅ base repomap diagram at ${BASE_FILE}`);

    if (featureRequest) {
      console.log(`\n📜 feature request: "${featureRequest}"`);
      const repomixXml = fs.readFileSync(REPOMIX_OUTPUT_FILE, "utf8");
      const changesPlan = await getProposedChanges(repomixXml, featureRequest);

      const safeFeatureName = sanitizeFeatureName(featureRequest);
      const CHANGES_FILE = path.join(OUTPUT_DIR, `add_${safeFeatureName}.json`);
      console.log(`\n💾 saving proposed changes to ${CHANGES_FILE}...`);
      fs.writeFileSync(CHANGES_FILE, JSON.stringify(changesPlan, null, 2));
      console.log(`✅ saved ${CHANGES_FILE}`);

      let updatedDiagram = await integrateChangesIntoDiagram(
        baseDiagram,
        changesPlan
      );
      updatedDiagram = applyFontSizeScaling(updatedDiagram, lineCountMap);
      saveDiagram(updatedDiagram, FINAL_FILE);

      console.log(
        `\n✅ updated repomap with proposed features saved to ${FINAL_FILE}`
      );
    } else {
      console.log("\nno features requested. done.");
      fs.copyFileSync(BASE_FILE, FINAL_FILE);
      console.log(`✅ copied base to ${FINAL_FILE} too.`);
    }

    console.log("\nyou can view the .mmd file on github or use mermaid cli:");
    console.log(
      `  mmdc -i "${FINAL_FILE}" -o "${FINAL_FILE.replace(".mmd", ".svg")}"\n`
    );
  } catch (error) {
    console.error(
      "\n❌ error generating repomap:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}

// run
generateRepomap().catch((err) => {
  console.error(
    "\n❌ unexpected error:",
    err instanceof Error ? err.message : String(err)
  );
  process.exit(1);
});
