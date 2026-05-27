// Auto-compile SCSS → CSS after Claude Code edits a .scss file.
// Wired via the PostToolUse hook in .claude/settings.json (matcher Write|Edit|MultiEdit).
//
// Reads the hook payload (JSON) on stdin, and only runs `sass` when the edited
// file is a .scss file. Compiles scss/main.scss → css/main.css (+ .map) in the
// repo's expanded style so the committed CSS stays in sync with the SCSS source.
// On success it is silent; on a sass error it prints to stderr and exits non-zero
// so the failure surfaces in the transcript.

const { execSync } = require('node:child_process');
const path = require('node:path');

let data = '';
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  let filePath = '';
  try {
    filePath = ((JSON.parse(data) || {}).tool_input || {}).file_path || '';
  } catch {
    return; // payload wasn't JSON — nothing to do
  }
  if (!filePath.toLowerCase().endsWith('.scss')) return; // only .scss edits

  const root = path.resolve(__dirname, '..'); // repo root = parent of .claude/
  try {
    // String form runs through a shell, so `sass.cmd` resolves on Windows.
    // Args are a fixed trusted literal — no untrusted interpolation.
    execSync('sass scss/main.scss css/main.css --style=expanded', { cwd: root, stdio: 'inherit' });
  } catch (err) {
    console.error('[sass-sync] sass compile failed: ' + (err && err.message));
    process.exit(1);
  }
});
