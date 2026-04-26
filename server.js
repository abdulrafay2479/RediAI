require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');
const fs = require('fs');
const { execSync, exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ============================================================
// SYSTEM PROMPT
// ============================================================
const SYSTEM_PROMPT = `You are R-ASSISTENT, an AI automation assistant that runs on the user's Windows PC. You have REAL tools that actually execute on their computer.

You can:
- Open websites in the browser
- Save and read files on their PC
- Run PowerShell commands
- Launch applications (Chrome, Notepad, Word, etc.)
- List folder contents
- Create folders

IMPORTANT RULES:
1. When a user asks you to do something, USE YOUR TOOLS to actually do it — don't just describe what you would do.
2. Always confirm what you did after completing the action.
3. For file paths, default to the user's Desktop (C:\\Users\\DELL\\Desktop) unless they specify otherwise.
4. If a task needs multiple steps, do all the steps using tools one by one.
5. Be concise — act first, explain briefly.`;

// ============================================================
// TOOL DEFINITIONS (Claude sees these and decides when to use them)
// ============================================================
const TOOLS = [
  {
    name: 'open_browser',
    description: 'Opens a URL in the default web browser on the user\'s PC.',
    input_schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to open, e.g. https://google.com' }
      },
      required: ['url']
    }
  },
  {
    name: 'save_file',
    description: 'Saves text content to a file on the user\'s computer.',
    input_schema: {
      type: 'object',
      properties: {
        filepath: { type: 'string', description: 'Full file path, e.g. C:\\Users\\DELL\\Desktop\\email.txt' },
        content: { type: 'string', description: 'Text content to write into the file' }
      },
      required: ['filepath', 'content']
    }
  },
  {
    name: 'read_file',
    description: 'Reads and returns the content of a file.',
    input_schema: {
      type: 'object',
      properties: {
        filepath: { type: 'string', description: 'Full file path to read' }
      },
      required: ['filepath']
    }
  },
  {
    name: 'open_application',
    description: 'Launches a desktop application. Examples: chrome, notepad, mspaint, calc, explorer, msword.',
    input_schema: {
      type: 'object',
      properties: {
        app: { type: 'string', description: 'Application name or full path to launch' }
      },
      required: ['app']
    }
  },
  {
    name: 'run_command',
    description: 'Runs a PowerShell command on Windows and returns the output. Use for file operations, system tasks, etc.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'PowerShell command to run' }
      },
      required: ['command']
    }
  },
  {
    name: 'list_files',
    description: 'Lists all files and folders in a directory.',
    input_schema: {
      type: 'object',
      properties: {
        directory: { type: 'string', description: 'Directory path to list, e.g. C:\\Users\\DELL\\Desktop' }
      },
      required: ['directory']
    }
  },
  {
    name: 'create_folder',
    description: 'Creates a new folder at the specified path.',
    input_schema: {
      type: 'object',
      properties: {
        folderpath: { type: 'string', description: 'Full path of the folder to create' }
      },
      required: ['folderpath']
    }
  }
];

// ============================================================
// TOOL EXECUTOR — Actually runs the tools on the PC
// ============================================================
async function executeTool(toolName, toolInput) {
  console.log(`\n🔧 Executing tool: ${toolName}`, toolInput);

  try {
    switch (toolName) {

      case 'open_browser': {
        const { url } = toolInput;
        execSync(`Start-Process "${url}"`, { shell: 'powershell.exe' });
        return `✅ Opened browser: ${url}`;
      }

      case 'save_file': {
        const { filepath, content } = toolInput;
        // Ensure directory exists
        const dir = path.dirname(filepath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(filepath, content, 'utf8');
        return `✅ File saved successfully: ${filepath}`;
      }

      case 'read_file': {
        const { filepath } = toolInput;
        if (!fs.existsSync(filepath)) return `❌ File not found: ${filepath}`;
        const content = fs.readFileSync(filepath, 'utf8');
        return `📄 File contents of ${filepath}:\n\n${content}`;
      }

      case 'open_application': {
        const { app } = toolInput;
        execSync(`Start-Process "${app}"`, { shell: 'powershell.exe' });
        return `✅ Launched application: ${app}`;
      }

      case 'run_command': {
        const { command } = toolInput;
        const output = execSync(command, {
          shell: 'powershell.exe',
          encoding: 'utf8',
          timeout: 30000,
          windowsHide: true
        });
        return `✅ Command output:\n${output || '(no output)'}`;
      }

      case 'list_files': {
        const { directory } = toolInput;
        if (!fs.existsSync(directory)) return `❌ Directory not found: ${directory}`;
        const items = fs.readdirSync(directory);
        const formatted = items.map(item => {
          const full = path.join(directory, item);
          const isDir = fs.statSync(full).isDirectory();
          return `${isDir ? '📁' : '📄'} ${item}`;
        }).join('\n');
        return `📂 Contents of ${directory}:\n\n${formatted || '(empty folder)'}`;
      }

      case 'create_folder': {
        const { folderpath } = toolInput;
        fs.mkdirSync(folderpath, { recursive: true });
        return `✅ Folder created: ${folderpath}`;
      }

      default:
        return `❌ Unknown tool: ${toolName}`;
    }
  } catch (err) {
    console.error(`Tool error (${toolName}):`, err.message);
    return `❌ Error executing ${toolName}: ${err.message}`;
  }
}

// ============================================================
// CONVERSATION HISTORY (in-memory per session)
// ============================================================
const conversations = new Map();

// ============================================================
// AGENTIC LOOP — Keeps calling Claude + executing tools until done
// ============================================================
async function runAgentLoop(history) {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  const actionLog = []; // What tools were used

  while (true) {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: history
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Add assistant response to history
    history.push({ role: 'assistant', content: response.content });

    // If Claude is done (no more tool calls), return the text
    if (response.stop_reason === 'end_turn') {
      const textBlock = response.content.find(b => b.type === 'text');
      return {
        message: textBlock ? textBlock.text : '✅ Done.',
        usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens },
        actions: actionLog
      };
    }

    // If Claude wants to use tools, execute them
    if (response.stop_reason === 'tool_use') {
      const toolUseBlocks = response.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const toolUse of toolUseBlocks) {
        const result = await executeTool(toolUse.name, toolUse.input);
        actionLog.push({ tool: toolUse.name, input: toolUse.input, result });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result
        });
      }

      // Feed tools results back to Claude and loop again
      history.push({ role: 'user', content: toolResults });
      continue;
    }

    // Fallback — shouldn't happen
    break;
  }

  return { message: 'Task complete.', usage: { input_tokens: totalInputTokens, output_tokens: totalOutputTokens }, actions: [] };
}

// ============================================================
// CHAT ENDPOINT
// ============================================================
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    if (!conversations.has(sessionId)) conversations.set(sessionId, []);
    const history = conversations.get(sessionId);

    // Add user message
    history.push({ role: 'user', content: message });

    // Keep last 40 messages to avoid context overflow
    const recentHistory = history.slice(-40);

    // Run the agentic loop
    const result = await runAgentLoop(recentHistory);

    // Sync back to stored history
    conversations.set(sessionId, recentHistory);

    res.json(result);

  } catch (error) {
    console.error('Error:', error);
    if (error.status === 401) return res.status(401).json({ error: 'Invalid API key.' });
    if (error.status === 429) return res.status(429).json({ error: 'Rate limit hit. Wait a moment.' });
    res.status(500).json({ error: 'Server error: ' + (error.message || 'Unknown') });
  }
});

// Clear conversation
app.post('/api/clear', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) conversations.delete(sessionId);
  res.json({ success: true });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', apiKeyConfigured: !!process.env.ANTHROPIC_API_KEY });
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════╗
  ║        🤖 R-ASSISTENT is running!            ║
  ║                                              ║
  ║  Open: http://localhost:${PORT}                 ║
  ║  Mode: REAL ACTIONS (browser, files, cmds)  ║
  ║  API:  ${process.env.ANTHROPIC_API_KEY ? '✅ Configured' : '❌ Missing'}                        ║
  ╚══════════════════════════════════════════════╝
  `);
});
