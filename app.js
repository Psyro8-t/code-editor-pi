/* ============================================================
   app.js — Application orchestrator
   Monaco Editor · Tabs · File Tree · Live Preview · Shortcuts
   ============================================================ */

(() => {
  'use strict';

  // ==================== STATE ====================
  const state = {
    openTabs: [],           // [{ path, model, viewState, dirty }]
    activeTab: null,        // path
    expanded: new Set(),    // expanded folder paths
    sidebarVisible: true,
    panelVisible: true,
    panelHeight: 240,
    activePanel: 'terminal',
    pyodideReady: false
  };

  // ==================== LANGUAGE MAP ====================
  const LANG_MAP = {
    '.html': 'html', '.htm': 'html',
    '.css': 'css', '.scss': 'scss', '.less': 'less',
    '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
    '.jsx': 'javascript',
    '.ts': 'typescript', '.tsx': 'typescript',
    '.py': 'python',
    '.c': 'c', '.h': 'c',
    '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
    '.java': 'java',
    '.json': 'json', '.md': 'markdown', '.txt': 'plaintext',
    '.xml': 'xml', '.svg': 'xml', '.yml': 'yaml', '.yaml': 'yaml',
    '.sh': 'shell', '.sql': 'sql'
  };

  const extToLang = (path) => LANG_MAP[FileSystem.extname(path).toLowerCase()] || 'plaintext';

  // ==================== DOM REFS ====================
  const $ = (s) => document.querySelector(s);
  const els = {
    sidebar: $('#sidebar'), overlay: $('#sidebar-overlay'),
    fileTree: $('#file-tree'), tabBar: $('#tab-bar'),
    editorContainer: $('#editor-container'),
    bottomPanel: $('#bottom-panel'), dragHandle: $('#panel-drag-handle'),
    previewFrame: $('#preview-frame'), problemsList: $('#problems-list'),
    statusLang: $('#status-lang'), statusPos: $('#status-position'),
    statusPwa: $('#status-pwa'), storageStatus: $('#storage-status'),
    contextMenu: $('#context-menu'), modal: $('#modal'),
    modalTitle: $('#modal-title'), modalInput: $('#modal-input')
  };

  let editor = null;
  let monacoReady = false;

  // ==================== MONACO INIT ====================
  function initMonaco() {
    return new Promise((resolve) => {
      require.config({ paths: { vs: 'vendor/monaco/min/vs' } });
      require(['vs/editor/editor.main'], () => {
        // Register custom flat dark theme (no glow, no neon)
        monaco.editor.defineTheme('pi-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: '', foreground: 'f5f0e8', background: '1a1a1a' },
            { token: 'comment', foreground: '6b6b6b', fontStyle: 'italic' },
            { token: 'keyword', foreground: 'e5c07b' },
            { token: 'string', foreground: '98c379' },
            { token: 'number', foreground: 'd19a66' },
            { token: 'type', foreground: 'e5c07b' },
            { token: 'function', foreground: '61afef' },
            { token: 'variable', foreground: 'f5f0e8' },
            { token: 'operator', foreground: 'c678dd' },
            { token: 'tag', foreground: 'e06c75' },
            { token: 'attribute.name', foreground: 'e5c07b' },
            { token: 'attribute.value', foreground: '98c379' },
            { token: 'delimiter', foreground: 'b8b0a4' }
          ],
          colors: {
            'editor.background': '#1a1a1a',
            'editor.foreground': '#f5f0e8',
            'editor.lineHighlightBackground': '#252526',
            'editorLineNumber.foreground': '#6b6b6b',
            'editorLineNumber.activeForeground': '#f5f0e8',
            'editorIndentGuide.background': '#2d2d30',
            'editorIndentGuide.activeBackground': '#6b6b6b',
            'editor.selectionBackground': '#37373d',
            'editor.inactiveSelectionBackground': '#2d2d30',
            'editorCursor.foreground': '#f5f0e8',
            'editorWidget.background': '#252526',
            'editorWidget.border': '#3c3c3c',
            'editorSuggestWidget.background': '#252526',
            'editorSuggestWidget.border': '#3c3c3c',
            'editorSuggestWidget.selectedBackground': '#37373d',
            'editorHoverWidget.background': '#252526',
            'editorHoverWidget.border': '#3c3c3c',
            'scrollbarSlider.background': '#3e3e4250',
            'scrollbarSlider.hoverBackground': '#3e3e42',
            'minimap.background': '#1a1a1a',
            'editorBracketMatch.background': '#37373d',
            'editorBracketMatch.border': '#6b6b6b'
          }
        });

        editor = monaco.editor.create(els.editorContainer, {
          theme: 'pi-dark',
          model: null,
          fontSize: 13,
          fontFamily: '"SF Mono", "Cascadia Code", Consolas, monospace',
          minimap: { enabled: window.innerWidth > 768 },
          tabSize: 2,
          insertSpaces: true,
          automaticLayout: true,
          scrollBeyondLastLine: false,
          padding: { top: 8 },
          renderWhitespace: 'selection',
          cursorBlinking: 'smooth',
          smoothScrolling: true,
          contextmenu: true,
          mouseWheelZoom: true,
          wordWrap: window.innerWidth < 768 ? 'on' : 'off',
          bracketPairColorization: { enabled: true },
          fixedOverflowWidgets: true
        });

        // Status bar position tracker
        editor.onDidChangeCursorPosition((e) => {
          els.statusPos.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
        });

        // Ctrl+S save
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveActiveFile);

        // Ctrl+Enter run
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runActiveFile);

        // Ctrl+P quick open
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, (e) => {
          e?.preventDefault?.();
          openQuickOpen();
        });

        monacoReady = true;
        resolve();
      });
    });
  }

  // ==================== TAB MANAGEMENT ====================
  function getTab(path) { return state.openTabs.find(t => t.path === path); }

  async function openFile(path) {
    path = FileSystem.normalize(path);
    let tab = getTab(path);
    if (!tab) {
      const content = await FileSystem.readFile(path);
      const lang = extToLang(path);
      const model = monaco.editor.createModel(content, lang);
      tab = { path, model, viewState: null, dirty: false };
      state.openTabs.push(tab);
      model.onDidChangeContent(() => {
        tab.dirty = true;
        updateTabUI(path);
      });
    }
    state.activeTab = path;
    editor.setModel(tab.model);
    if (tab.viewState) editor.restoreViewState(tab.viewState);
    els.statusLang.textContent = tab.model.getLanguageId();
    renderTabs();
    updateTreeActive();
    editor.focus();
  }

  function closeTab(path) {
    const idx = state.openTabs.findIndex(t => t.path === path);
    if (idx === -1) return;
    const tab = state.openTabs[idx];
    if (tab.dirty && !confirm(`"${FileSystem.basename(path)}" has unsaved changes. Close anyway?`)) return;
    tab.model.dispose();
    state.openTabs.splice(idx, 1);
    if (state.activeTab === path) {
      const next = state.openTabs[idx] || state.openTabs[idx - 1];
      if (next) openFile(next.path);
      else { state.activeTab = null; editor.setModel(null); els.statusLang.textContent = 'plaintext'; }
    }
    renderTabs();
  }

  function saveActiveFile() {
    const tab = getTab(state.activeTab);
    if (!tab) return;
    FileSystem.writeFile(tab.path, tab.model.getValue()).then(() => {
      tab.dirty = false;
      updateTabUI(tab.path);
      flashStatus('Saved ✓');
      TerminalManager.writeln(`Saved: ${tab.path}`);
    });
  }

  function updateTabUI(path) {
    const el = els.tabBar.querySelector(`[data-path="${CSS.escape(path)}"]`);
    if (!el) return;
    const tab = getTab(path);
    el.querySelector('.tab-dirty')?.classList.toggle('hidden', !tab.dirty);
  }

  function renderTabs() {
    els.tabBar.innerHTML = '';
    for (const tab of state.openTabs) {
      const el = document.createElement('div');
      el.className = 'tab' + (tab.path === state.activeTab ? ' active' : '');
      el.dataset.path = tab.path;
      const name = FileSystem.basename(tab.path);
      el.innerHTML = `
        <span>${name}</span>
        <span class="tab-dirty ${tab.dirty ? '' : 'hidden'}">●</span>
        <span class="tab-close" title="Close">✕</span>`;
      el.addEventListener('click', (e) => {
        if (e.target.classList.contains('tab-close')) closeTab(tab.path);
        else openFile(tab.path);
      });
      el.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(tab.path); });
      els.tabBar.appendChild(el);
    }
  }

  // ==================== FILE TREE ====================
  async function renderTree() {
    const tree = await FileSystem.readTree('/');
    els.fileTree.innerHTML = '';
    for (const node of tree) renderNode(node, els.fileTree);
  }

  function renderNode(node, container) {
    const el = document.createElement('div');
    el.className = 'tree-item' + (node.path === state.activeTab ? ' active' : '');
    el.dataset.path = node.path;

    const isFolder = node.type === 'folder';
    const expanded = state.expanded.has(node.path);
    const icon = isFolder ? (expanded ? '📂' : '📁') : iconForFile(node.name);

    el.innerHTML = `
      <span class="tree-icon">${icon}</span>
      <span class="tree-label">${node.name}</span>
      ${node.type === 'file' && FileSystem.extname(node.name) ? `<span class="tree-badge">${FileSystem.extname(node.name).slice(1)}</span>` : ''}
    `;

    el.addEventListener('click', () => {
      if (isFolder) toggleFolder(node.path);
      else openFile(node.path);
    });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      showContextMenu(e.clientX, e.clientY, node.path, isFolder);
    });

    container.appendChild(el);

    if (isFolder && expanded && node.children?.length) {
      const childWrap = document.createElement('div');
      childWrap.className = 'tree-children';
      for (const child of node.children) renderNode(child, childWrap);
      container.appendChild(childWrap);
    }
  }

  function iconForFile(name) {
    const ext = FileSystem.extname(name).toLowerCase();
    const map = {
      '.html': '🌐', '.htm': '🌐', '.css': '🎨', '.js': '📜', '.ts': '📘',
      '.py': '🐍', '.c': '⚙️', '.cpp': '⚙️', '.h': '⚙️', '.java': '☕',
      '.json': '📋', '.md': '📝', '.txt': '📄', '.svg': '🖼️'
    };
    return map[ext] || '📄';
  }

  async function toggleFolder(path) {
    if (state.expanded.has(path)) state.expanded.delete(path);
    else state.expanded.add(path);
    await FileSystem.saveExpandedSet(state.expanded);
    renderTree();
  }

  function updateTreeActive() {
    els.fileTree.querySelectorAll('.tree-item').forEach(el => {
      el.classList.toggle('active', el.dataset.path === state.activeTab);
    });
  }

  // ==================== CONTEXT MENU ====================
  let ctxPath = null, ctxIsFolder = false;
  function showContextMenu(x, y, path, isFolder) {
    ctxPath = path; ctxIsFolder = isFolder;
    els.contextMenu.classList.remove('hidden');
    const rect = els.contextMenu.getBoundingClientRect();
    els.contextMenu.style.left = Math.min(x, window.innerWidth - rect.width - 8) + 'px';
    els.contextMenu.style.top = Math.min(y, window.innerHeight - rect.height - 8) + 'px';
  }
  function hideContextMenu() { els.contextMenu.classList.add('hidden'); }

  els.contextMenu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (!action) return;
    hideContextMenu();
    switch (action) {
      case 'rename': showModal('rename'); break;
      case 'delete': {
        if (confirm(`Delete "${FileSystem.basename(ctxPath)}"?`)) {
          await FileSystem.deletePath(ctxPath);
          const tab = getTab(ctxPath);
          if (tab) closeTab(ctxPath);
          renderTree();
        }
        break;
      }
      case 'new-file': showModal('new-file', ctxIsFolder ? ctxPath : FileSystem.dirname(ctxPath)); break;
      case 'new-folder': showModal('new-folder', ctxIsFolder ? ctxPath : FileSystem.dirname(ctxPath)); break;
    }
  });

  document.addEventListener('click', (e) => {
    if (!els.contextMenu.contains(e.target)) hideContextMenu();
  });

  // ==================== MODAL ====================
  let modalMode = 'new-file', modalDir = '/';
  function showModal(mode, dir = '/') {
    modalMode = mode; modalDir = dir;
    els.modal.classList.remove('hidden');
    const titles = {
      'new-file': 'New File', 'new-folder': 'New Folder', 'rename': 'Rename'
    };
    els.modalTitle.textContent = titles[mode];
    els.modalInput.value = mode === 'rename' ? FileSystem.basename(ctxPath) : '';
    els.modalInput.placeholder = mode === 'new-folder' ? 'folder-name' : 'file-name.ext';
    setTimeout(() => els.modalInput.focus(), 50);
  }
  function hideModal() { els.modal.classList.add('hidden'); }

  $('#modal-cancel').addEventListener('click', hideModal);
  els.modal.addEventListener('click', (e) => { if (e.target === els.modal) hideModal(); });
  els.modalInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#modal-confirm').click(); });

  $('#modal-confirm').addEventListener('click', async () => {
    const name = els.modalInput.value.trim();
    if (!name) { hideModal(); return; }
    try {
      if (modalMode === 'new-file') {
        const p = FileSystem.join(modalDir, name);
        await FileSystem.writeFile(p, '');
        state.expanded.add(modalDir);
        await openFile(p);
      } else if (modalMode === 'new-folder') {
        await FileSystem.mkdir(FileSystem.join(modalDir, name));
        state.expanded.add(modalDir);
      } else if (modalMode === 'rename') {
        const newPath = FileSystem.join(FileSystem.dirname(ctxPath), name);
        await FileSystem.rename(ctxPath, newPath);
        const tab = getTab(ctxPath);
        if (tab) { tab.path = newPath; state.activeTab = newPath; }
      }
      await renderTree();
      renderTabs();
    } catch (e) { alert('Error: ' + e.message); }
    hideModal();
  });

  // ==================== QUICK OPEN (Ctrl+P) ====================
  function openQuickOpen() {
    showModal('new-file', '/');  // reuse modal as quick-open
    els.modalTitle.textContent = 'Quick Open (type to filter)';
    const input = els.modalInput;
    input.placeholder = 'Search files…';
    input.value = '';
    let allFiles = [];
    FileSystem.store?.keys?.().then?.(() => {}) // noop guard
    collectAllFiles('/').then(files => { allFiles = files; });

    input.oninput = () => {
      const q = input.value.toLowerCase();
      const matches = allFiles.filter(f => f.toLowerCase().includes(q)).slice(0, 8);
      // Render dropdown inside modal
      let dd = document.getElementById('quickopen-dd');
      if (!dd) {
        dd = document.createElement('div');
        dd.id = 'quickopen-dd';
        dd.style.cssText = 'max-height:200px;overflow-y:auto;margin:-10px 0 12px;border:1px solid var(--border);border-radius:4px;background:var(--bg-primary);';
        input.parentNode.insertBefore(dd, input.nextSibling);
      }
      dd.innerHTML = matches.map(m =>
        `<div style="padding:7px 10px;cursor:pointer;font-family:var(--font-mono);font-size:12px;color:var(--text-secondary);" onmouseover="this.style.background='var(--bg-hover)'" onmouseout="this.style.background=''" data-p="${m}">${m}</div>`
      ).join('');
      dd.querySelectorAll('[data-p]').forEach(el => {
        el.onclick = () => { openFile(el.dataset.p); cleanupQuickOpen(); };
      });
    };
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const first = document.querySelector('#quickopen-dd [data-p]');
        if (first) { openFile(first.dataset.p); cleanupQuickOpen(); }
      }
    };
    const origConfirm = $('#modal-confirm').onclick;
    $('#modal-confirm').onclick = () => { cleanupQuickOpen(); };
    function cleanupQuickOpen() {
      document.getElementById('quickopen-dd')?.remove();
      hideModal();
      $('#modal-confirm').onclick = origConfirm;
      input.oninput = null; input.onkeydown = null;
    }
  }

  async function collectAllFiles(dir, acc = []) {
    const items = await FileSystem.list(dir);
    for (const it of items) {
      if (it.type === 'folder') await collectAllFiles(it.path, acc);
      else acc.push(it.path);
    }
    return acc;
  }

  // ==================== RUN / PREVIEW ====================
  async function runActiveFile() {
    if (!state.activeTab) return;
    await saveActiveFile();
    const ext = FileSystem.extname(state.activeTab).toLowerCase();

    if (['.html', '.htm'].includes(ext)) {
      showPanel('preview');
      await renderPreview(state.activeTab);
    } else if (ext === '.py') {
      showPanel('terminal');
      const code = getTab(state.activeTab).model.getValue();
      await TerminalManager.runPython(code, state.activeTab);
    } else if (ext === '.js') {
      showPanel('terminal');
      TerminalManager.writeln(`Running ${state.activeTab} …`);
      try { new Function(getTab(state.activeTab).model.getValue())(); }
      catch (e) { TerminalManager.writeln(`Error: ${e.message}`); }
    } else if (ext === '.ts') {
      showPanel('terminal');
      TerminalManager.writeln('TypeScript: transpiling with monaco…');
      try {
        const js = ts.transpile(getTab(state.activeTab).model.getValue(), { target: ts.ScriptTarget.ES2020 });
        new Function(js)();
      } catch (e) { TerminalManager.writeln(`TS Error: ${e.message}`); }
    } else if (['.c', '.cpp', '.java'].includes(ext)) {
      showPanel('terminal');
      TerminalManager.writeln(`${ext.slice(1).toUpperCase()} compilation requires a server-side toolchain.`);
      TerminalManager.writeln('Monaco provides full syntax highlighting & autocomplete.');
    } else {
      flashStatus('No runner for this file type');
    }
  }

  async function renderPreview(htmlPath) {
    const dir = FileSystem.dirname(htmlPath);
    let html = '';
    try { html = await FileSystem.readFile(htmlPath); } catch { return; }

    // Inline linked CSS/JS from same folder
    html = await replaceAsync(html, /<link[^>]+href="([^"]+\.css)"[^>]*>/gi, async (m, href) => {
      try { const c = await FileSystem.readFile(FileSystem.join(dir, href)); return `<style>${c}</style>`; }
      catch { return m; }
    });
    html = await replaceAsync(html, /<script[^>]+src="([^"]+\.js)"[^>]*>\s*<\/script>/gi, async (m, src) => {
      try { const c = await FileSystem.readFile(FileSystem.join(dir, src)); return `<script>${c}<\/script>`; }
      catch { return m; }
    });
    // Inline <script type="text/typescript"> via ts.transpile
    html = await replaceAsync(html, /<script type="text\/typescript">([\s\S]*?)<\/script>/gi, async (m, code) => {
      try { return `<script>${ts.transpile(code, { target: ts.ScriptTarget.ES2020 })}<\/script>`; }
      catch { return m; }
    });

    els.previewFrame.srcdoc = html;
  }

  async function replaceAsync(str, regex, fn) {
    const promises = [];
    str.replace(regex, (...args) => { promises.push(fn(...args)); return ''; });
    const data = await Promise.all(promises);
    return str.replace(regex, () => data.shift());
  }

  // Listen for terminal-initiated preview
  window.addEventListener('pi:preview', (e) => {
    showPanel('preview');
    renderPreview(e.detail.path);
  });

  // ==================== PANEL RESIZE ====================
  function initPanelResize() {
    let dragging = false, startY = 0, startH = 0;
    els.dragHandle.addEventListener('mousedown', (e) => {
      dragging = true; startY = e.clientY; startH = els.bottomPanel.offsetHeight;
      els.dragHandle.classList.add('dragging');
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const newH = Math.min(Math.max(startH + (startY - e.clientY), 100), window.innerHeight * 0.7);
      els.bottomPanel.style.height = newH + 'px';
      state.panelHeight = newH;
      TerminalManager.fit();
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
      els.dragHandle.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  function showPanel(name) {
    state.panelVisible = true;
    state.activePanel = name;
    els.bottomPanel.classList.remove('hidden');
    document.querySelectorAll('.panel-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.panel === name));
    document.querySelectorAll('.panel-page').forEach(p =>
      p.classList.toggle('active', p.id === `panel-${name}`));
    if (name === 'terminal') setTimeout(() => TerminalManager.fit(), 50);
  }

  function togglePanel() {
    state.panelVisible = !state.panelVisible;
    els.bottomPanel.classList.toggle('hidden', !state.panelVisible);
    if (state.panelVisible) setTimeout(() => TerminalManager.fit(), 50);
  }

  document.querySelectorAll('.panel-tab').forEach(tab => {
    tab.addEventListener('click', () => showPanel(tab.dataset.panel));
  });
  $('#btn-panel-close').addEventListener('click', togglePanel);

  // ==================== SIDEBAR ====================
  function toggleSidebar() {
    state.sidebarVisible = !state.sidebarVisible;
    els.sidebar.classList.toggle('hidden', !state.sidebarVisible);
    if (window.innerWidth <= 768) {
      els.overlay.classList.toggle('visible', state.sidebarVisible);
    }
  }
  $('#btn-sidebar').addEventListener('click', toggleSidebar);
  els.overlay.addEventListener('click', toggleSidebar);

  // ==================== TOP BAR BUTTONS ====================
  $('#btn-run').addEventListener('click', runActiveFile);
  $('#btn-save').addEventListener('click', saveActiveFile);
  $('#btn-new-file').addEventListener('click', () => showModal('new-file', '/'));
  $('#btn-new-folder').addEventListener('click', () => showModal('new-folder', '/'));
  $('#btn-collapse-all').addEventListener('click', async () => {
    state.expanded.clear();
    await FileSystem.saveExpandedSet(state.expanded);
    renderTree();
  });

  // ==================== KEYBOARD SHORTCUTS (global) ====================
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); toggleSidebar(); break;
        case '`': e.preventDefault(); togglePanel(); break;
        case 'p': e.preventDefault(); openQuickOpen(); break;
      }
    }
    if (e.key === 'Escape') { hideModal(); hideContextMenu(); }
  });

  // ==================== STATUS FLASH ====================
  let flashTimer;
  function flashStatus(msg) {
    els.statusPwa.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { els.statusPwa.textContent = 'Offline Ready'; }, 2000);
  }

  // ==================== SERVICE WORKER ====================
  function registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('service-worker.js')
        .then(() => { els.statusPwa.textContent = 'Offline Ready'; })
        .catch(() => { els.statusPwa.textContent = 'SW Failed'; });
    }
  }

  // ==================== BOOT ====================
  async function boot() {
    // Seed & load VFS
    const seeded = await FileSystem.seedIfEmpty();
    state.expanded = await FileSystem.getExpandedSet();
    if (seeded) state.expanded.add('/src');

    // Init terminal first (non-blocking)
    TerminalManager.init(document.getElementById('terminal-container'));

    // Init Monaco
    await initMonaco();

    // Render UI
    await renderTree();
    renderTabs();
    initPanelResize();

    // Open README or first file
    const files = await collectAllFiles('/');
    const first = files.find(f => f.endsWith('index.html')) || files[0];
    if (first) await openFile(first);

    // Window resize
    window.addEventListener('resize', () => {
      TerminalManager.fit();
      editor?.layout();
    });

    registerSW();
    els.storageStatus.textContent = `IndexedDB: ${files.length} files`;
  }

  boot();
})();
