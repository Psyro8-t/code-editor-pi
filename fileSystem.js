/* ============================================================
   fileSystem.js — Virtual File System backed by IndexedDB
   via localforage. Supports files & folders, persists across
   sessions. Path format: "/folder/sub/file.ext" (POSIX-style).
   ============================================================ */

const FileSystem = (() => {
  const store = localforage.createInstance({
    name: 'code-editer-pi',
    storeName: 'vfs',
    description: 'Virtual File System for Code Editer π'
  });

  const metaStore = localforage.createInstance({
    name: 'code-editer-pi',
    storeName: 'meta',
    description: 'Metadata (folder structure, expanded state)'
  });

  // ---------- Path helpers ----------
  const normalize = (p) => {
    if (!p.startsWith('/')) p = '/' + p;
    return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  };
  const dirname = (p) => {
    p = normalize(p);
    const i = p.lastIndexOf('/');
    return i <= 0 ? '/' : p.slice(0, i);
  };
  const basename = (p) => normalize(p).split('/').pop();
  const extname = (p) => {
    const b = basename(p);
    const i = b.lastIndexOf('.');
    return i > 0 ? b.slice(i) : '';
  };
  const join = (...parts) => normalize(parts.filter(Boolean).join('/'));

  // ---------- Core operations ----------
  async function readFile(path) {
    path = normalize(path);
    const entry = await store.getItem(path);
    if (!entry || entry.type !== 'file') throw new Error(`Not a file: ${path}`);
    return entry.content;
  }

  async function writeFile(path, content) {
    path = normalize(path);
    const now = Date.now();
    const existing = await store.getItem(path);
    const entry = {
      type: 'file',
      content,
      created: existing?.created || now,
      modified: now
    };
    await store.setItem(path, entry);
    return entry;
  }

  async function mkdir(path) {
    path = normalize(path);
    await store.setItem(path, { type: 'folder', created: Date.now() });
  }

  async function exists(path) {
    path = normalize(path);
    if (path === '/') return true;
    return (await store.getItem(path)) !== null;
  }

  async function stat(path) {
    path = normalize(path);
    if (path === '/') return { type: 'folder' };
    return await store.getItem(path);
  }

  async function deletePath(path) {
    path = normalize(path);
    const keys = await store.keys();
    const targets = keys.filter(k => k === path || k.startsWith(path + '/'));
    for (const k of targets) await store.removeItem(k);
  }

  async function rename(oldPath, newPath) {
    oldPath = normalize(oldPath);
    newPath = normalize(newPath);
    const keys = await store.keys();
    const affected = keys.filter(k => k === oldPath || k.startsWith(oldPath + '/'));
    for (const k of affected) {
      const entry = await store.getItem(k);
      const dest = newPath + k.slice(oldPath.length);
      await store.setItem(dest, entry);
      await store.removeItem(k);
    }
  }

  async function list(dir = '/') {
    dir = normalize(dir);
    const keys = await store.keys();
    const prefix = dir === '/' ? '/' : dir + '/';
    const children = [];
    for (const k of keys) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      if (rest.includes('/')) continue;           // nested — handled by recursion
      const entry = await store.getItem(k);
      children.push({ path: k, name: basename(k), ...entry });
    }
    children.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return children;
  }

  async function readTree(dir = '/') {
    const children = await list(dir);
    const result = [];
    for (const child of children) {
      if (child.type === 'folder') {
        result.push({ ...child, children: await readTree(child.path) });
      } else {
        result.push(child);
      }
    }
    return result;
  }

  // ---------- Expanded-folder state persistence ----------
  async function getExpandedSet() {
    return new Set((await metaStore.getItem('expanded')) || []);
  }
  async function saveExpandedSet(set) {
    await metaStore.setItem('expanded', [...set]);
  }

  // ---------- Seed default workspace on first run ----------
  async function seedIfEmpty() {
    const keys = await store.keys();
    if (keys.length > 0) return false;
    await mkdir('/src');
    await writeFile('/README.md',
`# Welcome to Code Editer π

A fully offline, browser-based IDE.

## Shortcuts
- \`Ctrl+S\` — Save file
- \`Ctrl+P\` — Quick file open
- \`Ctrl+\`\` — Toggle terminal
- \`Ctrl+Enter\` — Run current file
- \`Ctrl+B\` — Toggle sidebar

## Supported Languages
HTML · CSS · JS · TS · Python · C · C++ · Java
`);
    await writeFile('/src/index.html',
`<!DOCTYPE html>
<html>
<head><title>π Preview</title></head>
<body>
  <h1>Hello from Code Editer π</h1>
  <script src="app.js"><\/script>
</body>
</html>`);
    await writeFile('/src/style.css', `body { font-family: sans-serif; padding: 2rem; }`);
    await writeFile('/src/app.js', `console.log('π editor live preview works!');`);
    await writeFile('/src/main.py', `print("Hello from Pyodide — Python in your browser!")`);
    return true;
  }

  return {
    normalize, dirname, basename, extname, join,
    readFile, writeFile, mkdir, exists, stat,
    deletePath, rename, list, readTree,
    getExpandedSet, saveExpandedSet, seedIfEmpty
  };
})();
