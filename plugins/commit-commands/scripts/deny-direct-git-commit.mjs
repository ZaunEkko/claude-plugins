#!/usr/bin/env node

import process from "node:process";
import { pathToFileURL } from "node:url";

export const DIRECT_COMMIT_REASON =
  "Direct git commit is blocked by commit-commands. Use /commit-commands:commit, "
  + "/commit-commands:commit-push-pr, or the plugin attribution wrapper.";

const COMMAND_SEPARATORS = new Set([";", "|", "&", "(", ")", "{", "}"]);
const GIT_EXECUTABLES = new Set(["git", "git.exe"]);
const SHELL_EXECUTABLES = new Set(["bash", "dash", "sh", "zsh"]);
const SHELL_PREFIX_KEYWORDS = new Set([
  "!",
  "coproc",
  "do",
  "elif",
  "else",
  "if",
  "then",
  "until",
  "while",
]);
const GIT_OPTIONS_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--config-env",
  "--git-dir",
  "--namespace",
  "--super-prefix",
  "--work-tree",
]);
const GIT_TERMINAL_OPTIONS = new Set([
  "-h",
  "--help",
  "--html-path",
  "--info-path",
  "--man-path",
  "--version",
]);

function tokenizeShellSegments(command) {
  if (typeof command !== "string") {
    throw new TypeError("Bash command must be a string");
  }
  if (command.length === 0) {
    throw new RangeError("Bash command must not be empty");
  }

  const segments = [];
  let words = [];
  let word = "";
  let wordStarted = false;

  const pushWord = () => {
    if (!wordStarted) {
      return;
    }
    words.push(word);
    word = "";
    wordStarted = false;
  };
  const pushSegment = () => {
    pushWord();
    if (words.length > 0) {
      segments.push(words);
      words = [];
    }
  };

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];

    if (/\s/u.test(character)) {
      pushWord();
      if (character === "\n" || character === "\r") {
        pushSegment();
      }
      continue;
    }

    if (COMMAND_SEPARATORS.has(character)) {
      pushSegment();
      if (command[index + 1] === character && (character === "&" || character === "|")) {
        index += 1;
      }
      continue;
    }

    if (character === "#" && !wordStarted) {
      while (index + 1 < command.length && !["\n", "\r"].includes(command[index + 1])) {
        index += 1;
      }
      continue;
    }

    if (character === "'") {
      wordStarted = true;
      let closed = false;
      for (index += 1; index < command.length; index += 1) {
        if (command[index] === "'") {
          closed = true;
          break;
        }
        word += command[index];
      }
      if (!closed) {
        throw new Error("Bash command contains an unterminated single-quoted string");
      }
      continue;
    }

    if (character === '"') {
      wordStarted = true;
      let closed = false;
      for (index += 1; index < command.length; index += 1) {
        if (command[index] === '"') {
          closed = true;
          break;
        }
        if (command[index] === "\\") {
          if (index + 1 >= command.length) {
            throw new Error("Bash command ends with an incomplete escape");
          }
          const escaped = command[index + 1];
          if (["$", "`", '"', "\\", "\n"].includes(escaped)) {
            index += 1;
            if (escaped !== "\n") {
              word += escaped;
            }
          } else {
            word += "\\";
          }
          continue;
        }
        word += command[index];
      }
      if (!closed) {
        throw new Error("Bash command contains an unterminated double-quoted string");
      }
      continue;
    }

    if (character === "\\") {
      if (index + 1 >= command.length) {
        throw new Error("Bash command ends with an incomplete escape");
      }
      wordStarted = true;
      index += 1;
      word += command[index];
      continue;
    }

    wordStarted = true;
    word += character;
  }

  pushSegment();
  return segments;
}

function isEnvironmentAssignment(word) {
  return /^[A-Za-z_][A-Za-z0-9_]*=/u.test(word);
}

function skipOptions(words, startIndex, { joinedValuePrefixes = [], optionsWithValue = [] } = {}) {
  const valueOptions = new Set(optionsWithValue);
  let index = startIndex;
  while (index < words.length) {
    const option = words[index];
    if (option === "--") {
      return index + 1;
    }
    if (!option.startsWith("-")) {
      return index;
    }
    if (valueOptions.has(option)) {
      index += 2;
      continue;
    }
    if (joinedValuePrefixes.some((prefix) => option.startsWith(prefix) && option.length > prefix.length)) {
      index += 1;
      continue;
    }
    index += 1;
  }
  return index;
}

function skipCommandPrefix(words) {
  let index = 0;

  while (index < words.length) {
    while (index < words.length && isEnvironmentAssignment(words[index])) {
      index += 1;
    }
    if (index >= words.length) {
      return -1;
    }

    const word = executableName(words[index]);
    if (SHELL_PREFIX_KEYWORDS.has(word)) {
      index += 1;
      continue;
    }

    if (word === "command") {
      index += 1;
      while (index < words.length && words[index].startsWith("-")) {
        if (["-V", "-v"].includes(words[index])) {
          return -1;
        }
        index += 1;
      }
      continue;
    }

    if (word === "exec") {
      index = skipOptions(words, index + 1, {
        joinedValuePrefixes: ["-a"],
        optionsWithValue: ["-a"],
      });
      continue;
    }

    if (word === "env") {
      index += 1;
      while (index < words.length) {
        const option = words[index];
        if (isEnvironmentAssignment(option)) {
          index += 1;
          continue;
        }
        if (option === "--") {
          index += 1;
          break;
        }
        if (["-C", "-S", "-u", "--chdir", "--split-string", "--unset"].includes(option)) {
          index += 2;
          continue;
        }
        if (
          option.startsWith("--chdir=")
          || option.startsWith("--split-string=")
          || option.startsWith("--unset=")
        ) {
          index += 1;
          continue;
        }
        if (option.startsWith("-")) {
          index += 1;
          continue;
        }
        break;
      }
      continue;
    }

    if (word === "time") {
      index = skipOptions(words, index + 1, {
        joinedValuePrefixes: ["-f", "-o"],
        optionsWithValue: ["-f", "-o", "--format", "--output"],
      });
      continue;
    }

    if (word === "timeout") {
      index = skipOptions(words, index + 1, {
        optionsWithValue: ["-k", "-s", "--kill-after", "--signal"],
      });
      index += 1;
      continue;
    }

    if (word === "nice") {
      index = skipOptions(words, index + 1, {
        joinedValuePrefixes: ["-n"],
        optionsWithValue: ["-n", "--adjustment"],
      });
      continue;
    }

    if (word === "nohup" || word === "setsid") {
      index = skipOptions(words, index + 1);
      continue;
    }

    if (word === "stdbuf") {
      index = skipOptions(words, index + 1, {
        joinedValuePrefixes: ["-e", "-i", "-o"],
        optionsWithValue: ["-e", "-i", "-o", "--error", "--input", "--output"],
      });
      continue;
    }

    if (word === "xargs") {
      index = skipOptions(words, index + 1, {
        joinedValuePrefixes: ["-E", "-I", "-L", "-P", "-a", "-d", "-n", "-s"],
        optionsWithValue: [
          "-E",
          "-I",
          "-L",
          "-P",
          "-a",
          "-d",
          "-n",
          "-s",
          "--arg-file",
          "--delimiter",
          "--eof",
          "--max-args",
          "--max-chars",
          "--max-lines",
          "--max-procs",
          "--process-slot-var",
          "--replace",
        ],
      });
      continue;
    }

    if (word === "sudo") {
      index = skipOptions(words, index + 1, {
        optionsWithValue: [
          "-C",
          "-D",
          "-R",
          "-T",
          "-g",
          "-h",
          "-p",
          "-u",
          "--chdir",
          "--close-from",
          "--group",
          "--host",
          "--prompt",
          "--role",
          "--type",
          "--user",
        ],
      });
      continue;
    }

    return index;
  }

  return -1;
}

function executableName(word) {
  return word.replaceAll("\\", "/").split("/").at(-1)?.toLowerCase() ?? "";
}

function gitSubcommand(words, startIndex) {
  let index = startIndex;

  while (index < words.length) {
    const word = words[index];
    if (GIT_TERMINAL_OPTIONS.has(word) || word.startsWith("--list-cmds")) {
      return null;
    }
    if (word === "--exec-path") {
      return null;
    }
    if (word === "--") {
      index += 1;
      break;
    }
    if (GIT_OPTIONS_WITH_VALUE.has(word)) {
      index += 2;
      continue;
    }
    if (
      (word.startsWith("-C") && word.length > 2)
      || (word.startsWith("-c") && word.length > 2)
      || [...GIT_OPTIONS_WITH_VALUE].some((option) => word.startsWith(`${option}=`))
      || word.startsWith("--exec-path=")
    ) {
      index += 1;
      continue;
    }
    if (word.startsWith("-")) {
      index += 1;
      continue;
    }
    return word;
  }

  return index < words.length ? words[index] : null;
}

function hereDocumentDeclarations(line, state) {
  const declarations = [];
  if (!state.quote && !state.suppressed && !state.lineContinued) {
    state.wordStarted = false;
  }
  state.lineContinued = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (state.suppressed) {
      const context = state.suppressed;
      if (context.quote) {
        if (character === context.quote) {
          context.quote = null;
        } else if (context.quote === '"' && character === "\\") {
          if (index + 1 >= line.length) {
            state.lineContinued = true;
          } else {
            index += 1;
          }
        }
        continue;
      }
      if (character === "'" || character === '"') {
        context.quote = character;
        continue;
      }
      if (character === "\\") {
        if (index + 1 >= line.length) {
          state.lineContinued = true;
        } else {
          index += 1;
        }
        continue;
      }
      if (character === context.open) {
        context.depth += 1;
      } else if (character === context.close) {
        context.depth -= 1;
        if (context.depth === 0) {
          state.suppressed = null;
        }
      }
      continue;
    }
    if (state.quote) {
      if (character === state.quote) {
        state.quote = null;
      } else if (state.quote === '"' && character === "\\") {
        if (index + 1 >= line.length) {
          state.lineContinued = true;
        } else {
          index += 1;
        }
      }
      continue;
    }
    if (/\s/u.test(character)) {
      state.wordStarted = false;
      continue;
    }
    if (character === "#" && !state.wordStarted) {
      break;
    }
    if (character === "'" || character === '"') {
      state.quote = character;
      state.wordStarted = true;
      continue;
    }
    if (character === "\\") {
      state.wordStarted = true;
      if (index + 1 >= line.length) {
        state.lineContinued = true;
      } else {
        index += 1;
      }
      continue;
    }
    if (character === "$" && line[index + 1] === "(" && line[index + 2] === "(") {
      state.suppressed = {
        close: ")",
        depth: 2,
        multiline: true,
        open: "(",
        quote: null,
      };
      state.wordStarted = true;
      index += 2;
      continue;
    }
    if (character === "(" && line[index + 1] === "(") {
      state.suppressed = {
        close: ")",
        depth: 2,
        multiline: true,
        open: "(",
        quote: null,
      };
      state.wordStarted = true;
      index += 1;
      continue;
    }
    if (character === "$" && line[index + 1] === "[") {
      state.suppressed = {
        close: "]",
        depth: 1,
        multiline: true,
        open: "[",
        quote: null,
      };
      state.wordStarted = true;
      index += 1;
      continue;
    }
    if (character === "$" && line[index + 1] === "{") {
      state.suppressed = {
        close: "}",
        depth: 1,
        multiline: true,
        open: "{",
        quote: null,
      };
      state.wordStarted = true;
      index += 1;
      continue;
    }
    if (character === "[" && state.wordStarted) {
      state.suppressed = {
        close: "]",
        depth: 1,
        multiline: false,
        open: "[",
        quote: null,
      };
      continue;
    }
    if (character === "<" && line[index + 1] === "<" && line[index + 2] === "<") {
      state.wordStarted = false;
      index += 2;
      continue;
    }
    if (character !== "<" || line[index + 1] !== "<") {
      state.wordStarted = !/[;&|(){}<>]/u.test(character);
      continue;
    }

    let cursor = index + 2;
    const stripTabs = line[cursor] === "-";
    if (stripTabs) {
      cursor += 1;
    }
    while (line[cursor] === " " || line[cursor] === "\t") {
      cursor += 1;
    }

    let delimiter = "";
    let delimiterQuote = null;
    let quoted = false;
    while (cursor < line.length) {
      const delimiterCharacter = line[cursor];
      if (delimiterQuote) {
        if (delimiterCharacter === delimiterQuote) {
          delimiterQuote = null;
          cursor += 1;
          continue;
        }
        if (
          delimiterQuote === '"'
          && delimiterCharacter === "\\"
          && cursor + 1 < line.length
          && ["$", "`", '"', "\\"].includes(line[cursor + 1])
        ) {
          cursor += 1;
        }
        delimiter += line[cursor];
        cursor += 1;
        continue;
      }
      if (/[\s;&|<>]/u.test(delimiterCharacter)) {
        break;
      }
      if (
        delimiterCharacter === "$"
        && (line[cursor + 1] === "'" || line[cursor + 1] === '"')
      ) {
        quoted = true;
        delimiterQuote = line[cursor + 1];
        cursor += 2;
        continue;
      }
      if (delimiterCharacter === "'" || delimiterCharacter === '"') {
        quoted = true;
        delimiterQuote = delimiterCharacter;
        cursor += 1;
        continue;
      }
      if (delimiterCharacter === "\\") {
        quoted = true;
        cursor += 1;
        if (cursor < line.length) {
          delimiter += line[cursor];
          cursor += 1;
        }
        continue;
      }
      delimiter += delimiterCharacter;
      cursor += 1;
    }

    if (delimiterQuote) {
      throw new Error("Bash command contains an unterminated here-document delimiter");
    }
    if (delimiter) {
      declarations.push({ delimiter, expand: !quoted, stripTabs });
    }
    index = Math.max(index, cursor - 1);
  }

  if (state.suppressed && !state.suppressed.multiline) {
    state.suppressed = null;
  }
  return declarations;
}

function analyzeHereDocuments(command) {
  const visibleLines = [];
  const expandableBodies = [];
  const pending = [];
  const lexerState = {
    lineContinued: false,
    quote: null,
    suppressed: null,
    wordStarted: false,
  };
  let active = null;
  let bodyLines = [];

  const finishBody = () => {
    if (active?.expand) {
      expandableBodies.push(bodyLines.join("\n"));
    }
    bodyLines = [];
    active = pending.shift() ?? null;
  };

  for (const line of command.split(/\r?\n/u)) {
    if (active) {
      const candidate = active.stripTabs ? line.replace(/^\t+/u, "") : line;
      if (candidate === active.delimiter) {
        finishBody();
      } else if (active.expand) {
        bodyLines.push(candidate);
      }
      visibleLines.push("");
      continue;
    }

    visibleLines.push(line);
    pending.push(...hereDocumentDeclarations(line, lexerState));
    active = pending.shift() ?? null;
  }

  if (active?.expand) {
    expandableBodies.push(bodyLines.join("\n"));
  }

  return {
    expandableBodies,
    visibleCommand: visibleLines.join("\n"),
  };
}

function backtickSubstitutionEnd(command, startIndex) {
  for (let index = startIndex; index < command.length; index += 1) {
    if (command[index] === "\\") {
      index += 1;
      continue;
    }
    if (command[index] === "`") {
      return index;
    }
  }
  throw new Error("Bash command contains an unterminated backtick substitution");
}

function balancedShellExpansionEnd(command, startIndex, open, close, initialDepth) {
  let depth = initialDepth;
  let quote = null;

  for (let index = startIndex; index < command.length; index += 1) {
    const character = command[index];
    if (quote === "single") {
      if (character === "'") {
        quote = null;
      }
      continue;
    }
    if (character === "\\") {
      const escapesCharacter = quote === "double"
        ? ["$", "`", '"', "\\", "\n"].includes(command[index + 1])
        : true;
      if (escapesCharacter) {
        index += 1;
      }
      continue;
    }
    if (character === "'" && quote === null) {
      quote = "single";
      continue;
    }
    if (character === '"') {
      quote = quote === "double" ? null : "double";
      continue;
    }
    if (character === "`") {
      index = backtickSubstitutionEnd(command, index + 1);
      continue;
    }
    if (character === "$" && command[index + 1] === "(") {
      if (command[index + 2] === "(") {
        index = balancedShellExpansionEnd(command, index + 3, "(", ")", 2);
      } else {
        index = balancedShellExpansionEnd(command, index + 2, "(", ")", 1);
      }
      continue;
    }
    if (character === "$" && command[index + 1] === "{") {
      index = balancedShellExpansionEnd(command, index + 2, "{", "}", 1);
      continue;
    }
    if (character === "$" && command[index + 1] === "[") {
      index = balancedShellExpansionEnd(command, index + 2, "[", "]", 1);
      continue;
    }
    if (quote === "double") {
      continue;
    }
    if (character === open) {
      depth += 1;
    } else if (character === close) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error("Bash command contains an unterminated shell expansion");
}

function commandSubstitutions(command, { hereDocument = false } = {}) {
  const substitutions = [];
  let quote = null;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (!hereDocument && quote === "single") {
      if (character === "'") {
        quote = null;
      }
      continue;
    }
    if (!hereDocument && character === "'" && quote === null) {
      quote = "single";
      continue;
    }
    if (!hereDocument && character === '"') {
      quote = quote === "double" ? null : "double";
      continue;
    }
    if (character === "\\" && index + 1 < command.length) {
      const escaped = command[index + 1];
      const escapesCharacter = hereDocument || quote === "double"
        ? ["$", "`", '"', "\\", "\n"].includes(escaped)
        : true;
      if (escapesCharacter) {
        index += 1;
        continue;
      }
    }
    if (character === "`") {
      const endIndex = backtickSubstitutionEnd(command, index + 1);
      substitutions.push(command.slice(index + 1, endIndex));
      index = endIndex;
      continue;
    }
    if (character !== "$" || command[index + 1] !== "(") {
      continue;
    }
    if (command[index + 2] === "(") {
      const endIndex = balancedShellExpansionEnd(command, index + 3, "(", ")", 2);
      substitutions.push(...commandSubstitutions(command.slice(index + 3, endIndex)));
      index = endIndex;
      continue;
    }
    const endIndex = balancedShellExpansionEnd(command, index + 2, "(", ")", 1);
    substitutions.push(command.slice(index + 2, endIndex));
    index = endIndex;
  }

  return substitutions;
}

function shellCommandArgument(words, executableIndex) {
  for (let index = executableIndex + 1; index < words.length; index += 1) {
    const word = words[index];
    if (word === "--") {
      return null;
    }
    if (["+O", "-O", "--init-file", "--rcfile"].includes(word)) {
      index += 1;
      continue;
    }
    if (word.startsWith("--init-file=") || word.startsWith("--rcfile=")) {
      continue;
    }
    if (!word.startsWith("-") && !word.startsWith("+")) {
      return null;
    }
    if (/^-[^-]*c/u.test(word)) {
      return words[index + 1] ?? null;
    }
  }
  return null;
}

function containsDirectGitCommitAtDepth(command, depth) {
  if (depth > 8) {
    throw new Error("Bash command nesting exceeds the guard limit");
  }
  const { expandableBodies, visibleCommand } = analyzeHereDocuments(command);
  const normalizedCommand = [visibleCommand, ...expandableBodies].join("\n").toLowerCase();
  if (!normalizedCommand.includes("git") || !normalizedCommand.includes("commit")) {
    return false;
  }

  for (const nestedCommand of commandSubstitutions(visibleCommand)) {
    if (containsDirectGitCommitAtDepth(nestedCommand, depth + 1)) {
      return true;
    }
  }
  for (const body of expandableBodies) {
    for (const nestedCommand of commandSubstitutions(body, { hereDocument: true })) {
      if (containsDirectGitCommitAtDepth(nestedCommand, depth + 1)) {
        return true;
      }
    }
  }

  for (const words of tokenizeShellSegments(visibleCommand)) {
    const executableIndex = skipCommandPrefix(words);
    if (executableIndex < 0) {
      continue;
    }

    const executable = executableName(words[executableIndex]);
    if (SHELL_EXECUTABLES.has(executable)) {
      const nestedCommand = shellCommandArgument(words, executableIndex);
      if (nestedCommand && containsDirectGitCommitAtDepth(nestedCommand, depth + 1)) {
        return true;
      }
      continue;
    }
    if (executable === "eval") {
      const nestedCommand = words.slice(executableIndex + 1).join(" ");
      if (nestedCommand && containsDirectGitCommitAtDepth(nestedCommand, depth + 1)) {
        return true;
      }
      continue;
    }
    if (!GIT_EXECUTABLES.has(executable)) {
      continue;
    }
    if (gitSubcommand(words, executableIndex + 1)?.toLowerCase() === "commit") {
      return true;
    }
  }
  return false;
}

export function containsDirectGitCommit(command) {
  if (typeof command !== "string") {
    throw new TypeError("Bash command must be a string");
  }
  return containsDirectGitCommitAtDepth(command, 0);
}

export function evaluateHookInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("hook input must be a JSON object");
  }
  if (input.hook_event_name !== "PreToolUse" || input.tool_name !== "Bash") {
    return null;
  }
  const command = input.tool_input?.command;
  if (typeof command !== "string") {
    throw new TypeError("PreToolUse Bash input must include tool_input.command");
  }
  if (!containsDirectGitCommit(command)) {
    return null;
  }
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: DIRECT_COMMIT_REASON,
    },
  };
}

async function readStandardInput() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  const rawInput = await readStandardInput();
  const decision = evaluateHookInput(JSON.parse(rawInput || "{}"));
  if (decision) {
    process.stdout.write(`${JSON.stringify(decision)}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`commit-commands: direct git commit guard error: ${error.message}`);
    process.exitCode = 2;
  });
}
