#!/usr/bin/env node
// Installs the autodocs skill folder for GitHub Copilot or Claude Code.
//
//   node install.mjs --agent copilot             ~/.copilot/skills/autodocs
//   node install.mjs --agent copilot --project . <project>/.github/skills/autodocs
//   node install.mjs --agent claude              ~/.claude/skills/autodocs
//   node install.mjs --agent claude --project .  <project>/.claude/skills/autodocs
//   node install.mjs --agent all                 every user-level location above
//
// Add --force to replace an existing install, --uninstall to remove it.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.join(path.dirname(fileURLToPath(import.meta.url)), 'skills', 'autodocs');

const TARGETS = {
  copilot: { user: ['.copilot', 'skills'], project: ['.github', 'skills'] },
  claude: { user: ['.claude', 'skills'], project: ['.claude', 'skills'] },
};

function parse(argv) {
  const options = { agent: null, project: null, force: false, uninstall: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--agent') options.agent = argv[++i];
    else if (arg === '--project') options.project = argv[++i] ?? '.';
    else if (arg === '--force') options.force = true;
    else if (arg === '--uninstall') options.uninstall = true;
    else if (arg === '-h' || arg === '--help') options.help = true;
    else throw new Error(`Unknown option ${arg}`);
  }
  return options;
}

function destination(agent, project) {
  const parts = project ? TARGETS[agent].project : TARGETS[agent].user;
  return path.join(project ? path.resolve(project) : os.homedir(), ...parts, 'autodocs');
}

function main() {
  const options = parse(process.argv.slice(2));
  if (options.help || !options.agent) {
    process.stdout.write(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).map((line) => line.replace(/^\/\/ ?/, '')).join('\n') + '\n');
    process.exit(options.agent ? 0 : 2);
  }
  const agents = options.agent === 'all' ? Object.keys(TARGETS) : [options.agent];
  for (const agent of agents) {
    if (!TARGETS[agent]) throw new Error(`Unknown agent "${agent}". Use copilot, claude or all.`);
    const target = destination(agent, options.project);
    if (options.uninstall) {
      if (fs.existsSync(path.join(target, 'SKILL.md'))) {
        fs.rmSync(target, { recursive: true, force: true });
        process.stdout.write(`removed   ${agent}: ${target}\n`);
      } else process.stdout.write(`absent    ${agent}: ${target}\n`);
      continue;
    }
    if (fs.existsSync(target)) {
      if (!options.force) {
        process.stdout.write(`exists    ${agent}: ${target} (use --force to replace)\n`);
        continue;
      }
      if (!fs.existsSync(path.join(target, 'SKILL.md'))) throw new Error(`Refusing to replace ${target}: it is not a skill folder.`);
      fs.rmSync(target, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true, filter: (file) => !file.includes(`${path.sep}node_modules`) });
    process.stdout.write(`installed ${agent}: ${target}\n`);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`install: ${error.message}\n`);
  process.exit(1);
}
