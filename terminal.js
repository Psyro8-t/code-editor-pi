/* ============================================================
   terminal.js — XTerm.js terminal with Pyodide Python execution
   and a mini shell for VFS navigation.
   ============================================================ */

const TerminalManager = (() => {
  let term = null;
  let fitAddon = null;
  let pyodide = null;
  let pyodideLoading = null;
  let inputBuffer = '';
  let cursorPos = 0;
  let history = [];
  let historyIdx = -1;
  let cwd = '/';                    // shell working directory (VFS)
  let prompt = () => `π [${cwd}] $ `;

  // ---------- Init ----------
  function init(container) {
    term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: '"SF Mono", "Cascadia Code", Consolas, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      theme: {
        background: '#1a1a1a',
        foreground: '#f5f0e8',
        cursor: '#f5f0e8',
        cursorAccent: '#1a1a1a',
        selectionBackground: '#37373d',
        black: '#1a1a1a', red: '#e06c75', green: '#98c379',
        yellow: '#e5c07b', blue: '#61afef', magenta: '#c678dd',
        cyan: '#56b6c2', white: '#f5f0e8',
        brightBlack: '#6b6b6b', brightRed: '#e06c75', brightGreen: '#98c379',
        brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
        brightCyan: '#56b6c2', brightWhite: '#ffffff'
      },
      allowProposedApi: true,
      scrollback: 3000,
      tabStopWidth: 4
    });

    fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(container);
    fit();

    term.writeln('┌─────────────────────────────────────┐');
    term.writeln('│   Code Editer π — Terminal v1.0     │');
    term.writeln('│   Type "help" for commands          │');
    term.writeln('└─────────────────────────────────────┘');
    term.writeln('');
    writePrompt();

    term.onData(onData);
    return term;
  }

  function fit() { fitAddon?.fit(); }
  function focus() { term?.focus(); }

  function writePrompt() {
    term.write('\r\n' + prompt());
    inputBuffer = '';
    cursorPos = 0;
  }

  // ---------- Keyboard input ----------
  function onData(data) {
    const code = data.charCodeAt(0);
    if (code === 13) {           // Enter
      term.write('\r\n');
      execute(inputBuffer.trim());
      writePrompt();
    } else if (code === 127) {   // Backspace
      if (cursorPos > 0) {
        inputBuffer = inputBuffer.slice(0, cursorPos - 1) + inputBuffer.slice(cursorPos);
        cursorPos--;
        redrawLine();
      }
    } else if (code === 27) {    // Escape sequences (arrows)
      if (data === '\x1b[A') historyUp();
      else if (data === '\x1b[B') historyDown();
      else if (data === '\x1b[C' && cursorPos < inputBuffer.length) { cursorPos++; term.write(data); }
      else if (data === '\x1b[D' && cursorPos > 0) { cursorPos--; term.write(data); }
    } else if (code === 3) {     // Ctrl+C
      term.write('^C');
      writePrompt();
    } else if (code === 12) {    // Ctrl+L
      term.clear();
      writePrompt();
    } else if (code >= 32) {
      inputBuffer = inputBuffer.slice(0, cursorPos) + data + inputBuffer.slice(cursorPos);
      cursorPos += data.length;
      redrawLine();
    }
  }

  function redrawLine() {
    const p = prompt();
    term.write('\r' + p + ' '.repeat(Math.max(0, p.length + inputBuffer.length + 4)));
    term.write('\r' + p + inputBuffer);
    // move cursor to correct position
    const back = inputBuffer.length - cursorPos;
    if (back > 0) term.write(`\x1b[${back}D`);
  }

  function historyUp() {
    if (historyIdx < history.length - 1) {
      historyIdx++;
      inputBuffer = history[history.length - 1 - historyIdx];
      cursorPos = inputBuffer.length;
      redrawLine();
    }
  }
  function historyDown() {
    if (historyIdx > 0) {
      historyIdx--;
      inputBuffer = history[history.length - 1 - historyIdx];
    } else {
      historyIdx = -1;
      inputBuffer = '';
    }
    cursorPos = inputBuffer.length;
    redrawLine();
  }

  // ---------- Command execution ----------
  async function execute(cmdline) {
    if (!cmdline) return;
    history.push(cmdline);
    historyIdx = -1;

    const [cmd, ...args] = cmdline.split(/\s+/);

    switch (cmd) {
      case 'help':
        term.writeln('Available commands:');
        term.writeln('  ls [dir]          List files');
        term.writeln('  cd <dir>          Change directory');
        term.writeln('  pwd               Print working directory');
        term.writeln('  cat <file>        Print file contents');
        term.writeln('  run <file>        Execute file (py/js/html)');
        term.writeln('  python <file>     Run Python via Pyodide');
        term.writeln('  clear             Clear terminal');
        term.writeln('  echo <text>       Print text');
        term.writeln('  whoami            Print user');
        term.writeln('  date              Print date');
        break;
      case 'clear': term.clear(); break;
      case 'whoami': term.writeln('pi-user'); break;
      case 'date': term.writeln(new Date().toString()); break;
      case 'pwd': term.writeln(cwd); break;
      case 'echo': term.writeln(args.join(' ')); break;
      case 'ls': await cmdLs(args[0]); break;
      case 'cd': cmdCd(args[0]); break;
      case 'cat': await cmdCat(args[0]); break;
      case 'run': await cmdRun(args[0]); break;
      case 'python': await cmdPython(args[0]); break;
      default:
        term.writeln(`π: command not found: ${cmd}. Type "help".`);
    }
  }

  async function cmdLs(arg) {
    const dir = FileSystem.normalize(arg ? FileSystem.join(cwd, arg) : cwd);
    try {
      const items = await FileSystem.list(dir);
      if (!items.length) { term.writeln('(empty)'); return; }
      for (const it of items) {
        const icon = it.type === 'folder' ? '📁' : '📄';
        term.writeln(`${icon} ${it.name}`);
      }
    } catch { term.writeln(`ls: cannot access '${dir}'`); }
  }

  function cmdCd(arg) {
    if (!arg || arg === '/') { cwd = '/'; return; }
    const target = FileSystem.normalize(FileSystem.join(cwd, arg));
    FileSystem.stat(target).then(s => {
      if (s?.type === 'folder') cwd = target;
      else term.writeln(`cd: not a directory: ${arg}`);
    });
  }

  async function cmdCat(arg) {
    if (!arg) { term.writeln('usage: cat <file>'); return; }
    const p = FileSystem.normalize(FileSystem.join(cwd, arg));
    try {
      const content = await FileSystem.readFile(p);
      content.split('\n').forEach(l => term.writeln(l));
    } catch { term.writeln(`cat: ${arg}: No such file`); }
  }

  async function cmdRun(arg) {
    if (!arg) { term.writeln('usage: run <file>'); return; }
    const p = resolveFilePath(arg);
    const ext = FileSystem.extname(p).toLowerCase();
    try {
      const content = await FileSystem.readFile(p);
      if (ext === '.py') await runPython(content, p);
      else if (ext === '.js') runJavaScript(content, p);
      else if (ext === '.html') window.dispatchEvent(new CustomEvent('pi:preview', { detail: { path: p } }));
      else term.writeln(`run: unsupported file type ${ext}`);
    } catch (e) { term.writeln(`run: ${e.message}`); }
  }

  async function cmdPython(arg) {
    if (!arg) { term.writeln('usage: python <file.py>'); return; }
    const p = resolveFilePath(arg);
    try {
      const content = await FileSystem.readFile(p);
      await runPython(content, p);
    } catch (e) { term.writeln(`python: ${e.message}`); }
  }

  function resolveFilePath(arg) {
    const value = String(arg || '').trim();
    return FileSystem.normalize(value.startsWith('/') ? value : FileSystem.join(cwd, value));
  }

  // ---------- Pyodide ----------
  async function ensurePyodide() {
    if (pyodide) return pyodide;
    if (pyodideLoading) return pyodideLoading;
    term.writeln('Loading Pyodide (Python runtime)…');
    pyodideLoading = (async () => {
      // Assumes pyodide is served locally in vendor/pyodide/
      pyodide = await loadPyodide({ indexURL: 'vendor/pyodide/' });
      // Bridge Python stdout/stderr into the visible terminal.
      window.piPythonWrite = (text) => term.write(String(text));
      pyodide.runPython(`
import sys
from js import piPythonWrite
class __PiConsole:
    def write(self, s): piPythonWrite(s)
    def flush(self): pass
sys.stdout = __PiConsole()
sys.stderr = __PiConsole()
      `);
      term.writeln('Pyodide ready. Python 3.11 in browser.');
      return pyodide;
    })();
    return pyodideLoading;
  }

  async function runPython(code, filename = '<stdin>') {
    try {
      const py = await ensurePyodide();
      await py.runPythonAsync(code);
      term.writeln(`✓ Python finished: ${filename}`);
    } catch (e) {
      term.writeln(`\x1b[31mPython error in ${filename}: ${e.message || e}\x1b[0m`);
    }
  }

  // ---------- JavaScript execution in terminal ----------
  function runJavaScript(code, filename) {
    try {
      const captured = [];
      const origLog = console.log;
      console.log = (...a) => { captured.push(a.map(x => typeof x === 'object' ? JSON.stringify(x) : String(x)).join(' ')); };
      new Function(code)();
      console.log = origLog;
      captured.forEach(l => term.writeln(l));
    } catch (e) {
      term.writeln(`\x1b[31m${e.message}\x1b[0m`);
    }
  }

  // ---------- Public API ----------
  return {
    init, fit, focus,
    runPython,
    writeln: (s) => term?.writeln(s),
    write: (s) => term?.write(s),
    clear: () => term?.clear(),
    get term() { return term; }
  };
})();
