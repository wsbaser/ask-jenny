const { query, AbortError } = require("@anthropic-ai/claude-agent-sdk");
const fs = require("fs/promises");
const path = require("path");

/**
 * XML template for app_spec.txt
 */
const APP_SPEC_XML_TEMPLATE = `<project_specification>
  <project_name></project_name>

  <overview>
  </overview>

  <technology_stack>
    <frontend>
      <framework></framework>
      <ui_library></ui_library>
      <styling></styling>
      <state_management></state_management>
      <drag_drop></drag_drop>
      <icons></icons>
    </frontend>
    <desktop_shell>
      <framework></framework>
      <language></language>
      <inter_process_communication></inter_process_communication>
      <file_system></file_system>
    </desktop_shell>
    <ai_engine>
      <logic_model></logic_model>
      <design_model></design_model>
      <orchestration></orchestration>
    </ai_engine>
    <testing>
      <framework></framework>
      <unit></unit>
    </testing>
  </technology_stack>

  <core_capabilities>
    <project_management>
    </project_management>

    <intelligent_analysis>
    </intelligent_analysis>

    <kanban_workflow>
    </kanban_workflow>

    <autonomous_agent_engine>
    </autonomous_agent_engine>

    <extensibility>
    </extensibility>
  </core_capabilities>

  <ui_layout>
    <window_structure>
    </window_structure>
    <theme>
    </theme>
  </ui_layout>

  <development_workflow>
    <local_testing>
    </local_testing>
  </development_workflow>

  <implementation_roadmap>
    <phase_1_foundation>
    </phase_1_foundation>
    <phase_2_core_logic>
    </phase_2_core_logic>
    <phase_3_kanban_and_interaction>
    </phase_3_kanban_and_interaction>
    <phase_4_polish>
    </phase_4_polish>
  </implementation_roadmap>
</project_specification>`;

/**
 * Spec Regeneration Service - Regenerates app spec based on project description and tech stack
 */
class SpecRegenerationService {
  constructor() {
    this.runningRegeneration = null;
  }

  /**
   * Create initial app spec for a new project
   * @param {string} projectPath - Path to the project
   * @param {string} projectOverview - User's project description
   * @param {Function} sendToRenderer - Function to send events to renderer
   * @param {Object} execution - Execution context with abort controller
   * @param {boolean} generateFeatures - Whether to generate feature entries in features folder
   */
  async createInitialSpec(projectPath, projectOverview, sendToRenderer, execution, generateFeatures = true) {
    console.log(`[SpecRegeneration] Creating initial spec for: ${projectPath}, generateFeatures: ${generateFeatures}`);

    try {
      const abortController = new AbortController();
      execution.abortController = abortController;

      const options = {
        model: "claude-sonnet-4-20250514",
        systemPrompt: this.getInitialCreationSystemPrompt(generateFeatures),
        maxTurns: 50,
        cwd: projectPath,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      const prompt = this.buildInitialCreationPrompt(projectOverview, generateFeatures);

      sendToRenderer({
        type: "spec_regeneration_progress",
        content: "Starting project analysis and spec creation...\n",
      });

      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      let fullResponse = "";
      for await (const msg of currentQuery) {
        if (!execution.isActive()) break;

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              fullResponse += block.text;
              sendToRenderer({
                type: "spec_regeneration_progress",
                content: block.text,
              });
            } else if (block.type === "tool_use") {
              sendToRenderer({
                type: "spec_regeneration_tool",
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      sendToRenderer({
        type: "spec_regeneration_complete",
        message: "Initial spec creation complete!",
      });

      return {
        success: true,
        message: "Initial spec creation complete",
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[SpecRegeneration] Creation aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          success: false,
          message: "Creation aborted",
        };
      }

      console.error("[SpecRegeneration] Error creating initial spec:", error);
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }

  /**
   * Get the system prompt for initial spec creation
   * @param {boolean} generateFeatures - Whether features should be generated
   */
  getInitialCreationSystemPrompt(generateFeatures = true) {
    return `You are an expert software architect and product manager. Your job is to analyze an existing codebase and generate a comprehensive application specification based on a user's project overview.

You should:
1. First, thoroughly analyze the project structure to understand the existing tech stack
2. Read key configuration files (package.json, tsconfig.json, Cargo.toml, requirements.txt, etc.) to understand dependencies and frameworks
3. Understand the current architecture and patterns used
4. Based on the user's project overview, create a comprehensive app specification
5. Be liberal and comprehensive when defining features - include everything needed for a complete, polished application
6. Use the XML template format provided
7. Write the specification to .automaker/app_spec.txt

When analyzing, look at:
- package.json, cargo.toml, requirements.txt or similar config files for tech stack
- Source code structure and organization
- Framework-specific patterns (Next.js, React, Django, etc.)
- Database configurations and schemas
- API structures and patterns

**Feature Storage:**
Features are stored in .automaker/features/{id}/feature.json - each feature has its own folder.
Do NOT manually create feature files. Use the UpdateFeatureStatus tool to manage features.

You CAN and SHOULD modify:
- .automaker/app_spec.txt (this is your primary target)

You have access to file reading, writing, and search tools. Use them to understand the codebase and write the new spec.`;
  }

  /**
   * Build the prompt for initial spec creation
   * @param {string} projectOverview - User's project description
   * @param {boolean} generateFeatures - Whether to generate feature entries in features folder
   */
  buildInitialCreationPrompt(projectOverview, generateFeatures = true) {
    return `I need you to create an initial application specification for my project. I haven't set up an app_spec.txt yet, so this will be the first one.

**My Project Overview:**
${projectOverview}

**Your Task:**

1. First, explore the project to understand the existing tech stack:
   - Read package.json, Cargo.toml, requirements.txt, or similar config files
   - Identify all frameworks and libraries being used
   - Understand the current project structure and architecture
   - Note any database, authentication, or other infrastructure in use

2. Based on my project overview and the existing tech stack, create a comprehensive app specification using this XML template:

\`\`\`xml
${APP_SPEC_XML_TEMPLATE}
\`\`\`

3. Fill out the template with:
   - **project_name**: Extract from the project or derive from overview
   - **overview**: A clear description based on my project overview
   - **technology_stack**: All technologies you discover in the project (fill out the relevant sections, remove irrelevant ones)
   - **core_capabilities**: List all the major capabilities the app should have based on my overview
   - **ui_layout**: Describe the UI structure if relevant
   - **development_workflow**: Note any testing or development patterns
   - **implementation_roadmap**: Break down the features into phases - be VERY detailed here, listing every feature that needs to be built

4. **IMPORTANT**: Write the complete specification to the file \`.automaker/app_spec.txt\`

**Guidelines:**
- Be comprehensive! Include ALL features needed for a complete application
- Only include technology_stack sections that are relevant (e.g., skip desktop_shell if it's a web-only app)
- Add new sections to core_capabilities as needed for the specific project
- The implementation_roadmap should reflect logical phases for building out the app - list EVERY feature individually
- Consider user flows, error states, and edge cases when defining features
- Each phase should have multiple specific, actionable features

Begin by exploring the project structure.`;
  }

  /**
   * Regenerate the app spec based on user's project definition
   */
  async regenerateSpec(projectPath, projectDefinition, sendToRenderer, execution) {
    console.log(`[SpecRegeneration] Regenerating spec for: ${projectPath}`);

    try {
      const abortController = new AbortController();
      execution.abortController = abortController;

      const options = {
        model: "claude-sonnet-4-20250514",
        systemPrompt: this.getSystemPrompt(),
        maxTurns: 50,
        cwd: projectPath,
        allowedTools: ["Read", "Write", "Edit", "Glob", "Grep", "Bash"],
        permissionMode: "acceptEdits",
        sandbox: {
          enabled: true,
          autoAllowBashIfSandboxed: true,
        },
        abortController: abortController,
      };

      const prompt = this.buildRegenerationPrompt(projectDefinition);

      sendToRenderer({
        type: "spec_regeneration_progress",
        content: "Starting spec regeneration...\n",
      });

      const currentQuery = query({ prompt, options });
      execution.query = currentQuery;

      let fullResponse = "";
      for await (const msg of currentQuery) {
        if (!execution.isActive()) break;

        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              fullResponse += block.text;
              sendToRenderer({
                type: "spec_regeneration_progress",
                content: block.text,
              });
            } else if (block.type === "tool_use") {
              sendToRenderer({
                type: "spec_regeneration_tool",
                tool: block.name,
                input: block.input,
              });
            }
          }
        }
      }

      execution.query = null;
      execution.abortController = null;

      sendToRenderer({
        type: "spec_regeneration_complete",
        message: "Spec regeneration complete!",
      });

      return {
        success: true,
        message: "Spec regeneration complete",
      };
    } catch (error) {
      if (error instanceof AbortError || error?.name === "AbortError") {
        console.log("[SpecRegeneration] Regeneration aborted");
        if (execution) {
          execution.abortController = null;
          execution.query = null;
        }
        return {
          success: false,
          message: "Regeneration aborted",
        };
      }

      console.error("[SpecRegeneration] Error regenerating spec:", error);
      if (execution) {
        execution.abortController = null;
        execution.query = null;
      }
      throw error;
    }
  }

  /**
   * Get the system prompt for spec regeneration
   */
  getSystemPrompt() {
    return `You are an expert software architect and product manager. Your job is to analyze an existing codebase and generate a comprehensive application specification based on a user's project definition.

You should:
1. First, thoroughly analyze the project structure to understand the existing tech stack
2. Read key configuration files (package.json, tsconfig.json, etc.) to understand dependencies and frameworks
3. Understand the current architecture and patterns used
4. Based on the user's project definition, create a comprehensive app specification that includes ALL features needed to realize their vision
5. Be liberal and comprehensive when defining features - include everything needed for a complete, polished application
6. Write the specification to .automaker/app_spec.txt

When analyzing, look at:
- package.json, cargo.toml, or similar config files for tech stack
- Source code structure and organization
- Framework-specific patterns (Next.js, React, etc.)
- Database configurations and schemas
- API structures and patterns

**Feature Storage:**
Features are stored in .automaker/features/{id}/feature.json - each feature has its own folder.
Do NOT manually create feature files. Use the UpdateFeatureStatus tool to manage features.

You CAN and SHOULD modify:
- .automaker/app_spec.txt (this is your primary target)

You have access to file reading, writing, and search tools. Use them to understand the codebase and write the new spec.`;
  }

  /**
   * Build the prompt for regenerating the spec
   */
  buildRegenerationPrompt(projectDefinition) {
    return `I need you to regenerate my application specification based on the following project definition. Be very comprehensive and liberal when defining features - I want a complete, polished application.

**My Project Definition:**
${projectDefinition}

**Your Task:**

1. First, explore the project to understand the existing tech stack:
   - Read package.json or similar config files
   - Identify all frameworks and libraries being used
   - Understand the current project structure and architecture
   - Note any database, authentication, or other infrastructure in use

2. Based on my project definition and the existing tech stack, create a comprehensive app specification that includes:
   - Product Overview: A clear description of what the app does
   - Tech Stack: All technologies currently in use
   - Features: A COMPREHENSIVE list of all features needed to realize my vision
     - Be liberal! Include all features that would make this a complete, production-ready application
     - Include core features, supporting features, and nice-to-have features
     - Think about user experience, error handling, edge cases, etc.
   - Architecture Notes: Any important architectural decisions or patterns

3. **IMPORTANT**: Write the complete specification to the file \`.automaker/app_spec.txt\`

**Format Guidelines for the Spec:**

Use this general structure:

\`\`\`
# [App Name] - Application Specification

## Product Overview
[Description of what the app does and its purpose]

## Tech Stack
- Frontend: [frameworks, libraries]
- Backend: [frameworks, APIs]
- Database: [if applicable]
- Other: [other relevant tech]

## Features

### [Category 1]
- **[Feature Name]**: [Detailed description of the feature]
- **[Feature Name]**: [Detailed description]
...

### [Category 2]
- **[Feature Name]**: [Detailed description]
...

## Architecture Notes
[Any important architectural notes, patterns, or conventions]
\`\`\`

**Remember:**
- Be comprehensive! Include ALL features needed for a complete application
- Consider user flows, error states, loading states, etc.
- Include authentication, authorization if relevant
- Think about what would make this a polished, production-ready app
- The more detailed and complete the spec, the better

Begin by exploring the project structure.`;
  }

  /**
   * Stop the current regeneration
   */
  stop() {
    if (this.runningRegeneration && this.runningRegeneration.abortController) {
      this.runningRegeneration.abortController.abort();
    }
    this.runningRegeneration = null;
  }
}

module.exports = new SpecRegenerationService();
