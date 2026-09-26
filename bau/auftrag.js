// Startet Claude (Claude Code im Hintergrund, "claude -p") – für Bauaufträge und für Chat-Antworten.

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const BAU_TOOLS = ['Read', 'Write', 'Edit', 'mcp__baumeister__vorschau', 'mcp__baumeister__fertig']
const WIN = process.platform === 'win32'

// Auf Windows läuft "claude" über die Eingabeaufforderung – leere Werte und Leerzeichen brauchen Anführungszeichen.
function shellArg (a) {
  if (!WIN) return a
  return a === '' || /\s/.test(a) ? `"${a}"` : a
}

function spawnClaude ({ args, prompt, logFile, timeoutMs, onChild }) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(process.env.CLAUDE_BIN || 'claude', args.map(shellArg), { cwd: ROOT, shell: WIN, windowsHide: true })
    } catch (err) {
      resolve({ ok: false, error: 'Claude Code ließ sich nicht starten: ' + err.message })
      return
    }
    if (onChild) onChild(child)
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let done = false
    const finish = (result) => { if (!done) { done = true; resolve(result) } }
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', (err) => finish({ ok: false, error: err.code === 'ENOENT' ? 'Claude Code ("claude") wurde nicht gefunden.' : err.message }))
    const timer = setTimeout(() => { timedOut = true; kill(child) }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (logFile) {
        try { fs.writeFileSync(logFile, stdout + (stderr ? '\n--- stderr ---\n' + stderr : '')) } catch {}
      }
      let info = null
      try { info = JSON.parse(stdout.trim().split('\n').pop()) } catch {}
      finish({ ok: code === 0 && !timedOut && !(info && info.is_error), code, timedOut, info, stderr: stderr.trim() })
    })
    child.stdin.on('error', () => {})
    child.stdin.end(prompt)
  })
}

// Bauauftrag: Claude schreibt einen Bauplan und benutzt "vorschau" und "fertig".
function runClaude ({ jobDir, prompt, model = 'sonnet', effort = 'medium', timeoutMs = 10 * 60 * 1000 }) {
  const mcpConfig = path.join(jobDir, 'mcp.json')
  fs.writeFileSync(mcpConfig, JSON.stringify({
    mcpServers: {
      baumeister: { command: process.execPath, args: [path.join(ROOT, 'bau', 'mcp.js')], env: { BAU_JOB_DIR: jobDir } }
    }
  }, null, 2))
  const args = [
    '-p',
    '--model', model,
    '--effort', effort,
    '--output-format', 'json',
    '--max-turns', '30',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', BAU_TOOLS.join(','),
    '--mcp-config', path.relative(ROOT, mcpConfig),
    '--strict-mcp-config'
  ]
  return spawnClaude({
    args,
    prompt,
    logFile: path.join(jobDir, 'claude-ausgabe.txt'),
    timeoutMs,
    onChild: (child) => { runClaude.current = child }
  })
}

// Chat: kurze Antwort ohne Werkzeuge. Mit sessionId erinnert sich Claude an das bisherige Gespräch.
function runChat ({ prompt, sessionId, model = 'sonnet', effort = 'low', logFile, timeoutMs = 3 * 60 * 1000 }) {
  const args = [
    '-p',
    '--model', model,
    '--effort', effort,
    '--output-format', 'json',
    '--max-turns', '2',
    '--tools', '',
    '--strict-mcp-config'
  ]
  if (sessionId) args.push('--resume', sessionId)
  return spawnClaude({ args, prompt, logFile, timeoutMs })
}

function kill (child) {
  if (!child || child.exitCode !== null) return
  if (WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
  else child.kill('SIGTERM')
}

function cancel () {
  kill(runClaude.current)
}

module.exports = { runClaude, runChat, cancel, ROOT }
