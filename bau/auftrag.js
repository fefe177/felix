// Startet Claude (Claude Code im Hintergrund, "claude -p") für einen Bauauftrag.
// Claude darf nur Baupläne lesen/schreiben und die Werkzeuge "vorschau" und "fertig" benutzen.

const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const TOOLS = ['Read', 'Write', 'Edit', 'mcp__baumeister__vorschau', 'mcp__baumeister__fertig']

function runClaude ({ jobDir, prompt, model = process.env.BAU_MODELL || 'sonnet', effort = process.env.BAU_EFFORT || 'medium', timeoutMs = 10 * 60 * 1000 }) {
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
    '--allowedTools', TOOLS.join(','),
    '--mcp-config', path.relative(ROOT, mcpConfig),
    '--strict-mcp-config'
  ]
  const win = process.platform === 'win32'
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(process.env.CLAUDE_BIN || 'claude', args, { cwd: ROOT, shell: win, windowsHide: true })
    } catch (err) {
      resolve({ ok: false, error: 'Claude Code ließ sich nicht starten: ' + err.message })
      return
    }
    let stdout = ''
    let stderr = ''
    let timedOut = false
    child.stdout.on('data', d => { stdout += d })
    child.stderr.on('data', d => { stderr += d })
    child.on('error', (err) => resolve({ ok: false, error: err.code === 'ENOENT' ? 'Claude Code ("claude") wurde nicht gefunden.' : err.message }))
    const timer = setTimeout(() => { timedOut = true; kill(child) }, timeoutMs)
    child.on('close', (code) => {
      clearTimeout(timer)
      fs.writeFileSync(path.join(jobDir, 'claude-ausgabe.txt'), stdout + (stderr ? '\n--- stderr ---\n' + stderr : ''))
      let info = null
      try { info = JSON.parse(stdout.trim().split('\n').pop()) } catch {}
      resolve({ ok: code === 0 && !timedOut, code, timedOut, info, stderr: stderr.trim() })
    })
    child.stdin.end(prompt)
    runClaude.current = child
  })
}

function kill (child) {
  if (!child || child.exitCode !== null) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'])
  else child.kill('SIGTERM')
}

function cancel () {
  kill(runClaude.current)
}

module.exports = { runClaude, cancel, ROOT }
