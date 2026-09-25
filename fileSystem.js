/* ============================================================
   fileSystem.js — Project-aware virtual file system backed by
   IndexedDB via localforage. Projects are isolated by namespace
   and legacy single-workspace data is migrated automatically.
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
    description: 'Project metadata and expanded-folder state'
  });

  const DEFAULT_PROJECT_ID = 'default';
  let currentProjectId = DEFAULT_PROJECT_ID;
  let initialized = false;

  // ---------- Path and project helpers ----------
  const normalize = (p) => {
    p = String(p || '/');
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
  const projectKey = (path, projectId = currentProjectId) => `${projectId}:${normalize(path)}`;
  const projectPrefix = (projectId = currentProjectId) => `${projectId}:/`;
  const safeProjectName = (name) => String(name || 'Untitled Project').trim().replace(/\s+/g, ' ').slice(0, 80) || 'Untitled Project';
  const makeId = (name) => `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36) || 'project'}-${Date.now().toString(36)}`;

  async function ensureInitialized() {
    if (initialized) return;
    currentProjectId = await metaStore.getItem('currentProjectId') || DEFAULT_PROJECT_ID;
    const projects = await metaStore.getItem('projects');
    if (!projects?.length) {
      const legacyKeys = (await store.keys()).filter(k => !k.includes(':'));
      for (const key of legacyKeys) {
        const entry = await store.getItem(key);
        await store.setItem(projectKey(key, DEFAULT_PROJECT_ID), entry);
        await store.removeItem(key);
      }
      await metaStore.setItem('projects', [{
        id: DEFAULT_PROJECT_ID,
        name: 'My Project',
        created: Date.now(),
        modified: Date.now()
      }]);
    }
    const known = await metaStore.getItem('projects');
    if (!known.some(project => project.id === currentProjectId)) currentProjectId = DEFAULT_PROJECT_ID;
    await metaStore.setItem('currentProjectId', currentProjectId);
    initialized = true;
  }

  async function init() { await ensureInitialized(); return getCurrentProject(); }
  async function listProjects() { await ensureInitialized(); return (await metaStore.getItem('projects') || []).map(p => ({ ...p })); }
  async function getCurrentProject() {
    await ensureInitialized();
    const projects = await metaStore.getItem('projects') || [];
    return projects.find(p => p.id === currentProjectId) || { id: currentProjectId, name: 'My Project' };
  }

  async function touchProject(projectId = currentProjectId) {
    const projects = await metaStore.getItem('projects') || [];
    const updated = projects.map(p => p.id === projectId ? { ...p, modified: Date.now() } : p);
    await metaStore.setItem('projects', updated);
  }

  async function createProject(name = 'Untitled Project') {
    await ensureInitialized();
    const project = { id: makeId(name), name: safeProjectName(name), created: Date.now(), modified: Date.now() };
    const projects = await metaStore.getItem('projects') || [];
    await metaStore.setItem('projects', [...projects, project]);
    await switchProject(project.id);
    return project;
  }

  async function switchProject(projectId) {
    await ensureInitialized();
    const projects = await metaStore.getItem('projects') || [];
    if (!projects.some(p => p.id === projectId)) throw new Error('Project not found');
    currentProjectId = projectId;
    await metaStore.setItem('currentProjectId', projectId);
    return getCurrentProject();
  }

  async function renameProject(projectId, name) {
    await ensureInitialized();
    const projects = await metaStore.getItem('projects') || [];
    const updated = projects.map(p => p.id === projectId ? { ...p, name: safeProjectName(name), modified: Date.now() } : p);
    await metaStore.setItem('projects', updated);
    return updated.find(p => p.id === projectId);
  }

  async function deleteProject(projectId) {
    await ensureInitialized();
    if (projectId === DEFAULT_PROJECT_ID) throw new Error('The default project cannot be deleted');
    const keys = await store.keys();
    for (const key of keys.filter(k => k.startsWith(projectPrefix(projectId)))) await store.removeItem(key);
    const projects = await metaStore.getItem('projects') || [];
    await metaStore.setItem('projects', projects.filter(p => p.id !== projectId));
    if (currentProjectId === projectId) await switchProject(DEFAULT_PROJECT_ID);
  }

  // ---------- Core operations ----------
  async function readEntry(path) {
    await ensureInitialized();
    return store.getItem(projectKey(path));
  }
  async function readFile(path) {
    const entry = await readEntry(path);
    if (!entry || entry.type !== 'file') throw new Error(`Not a file: ${normalize(path)}`);
    if (entry.encoding === 'base64') throw new Error(`Binary file cannot be opened as text: ${normalize(path)}`);
    return entry.content;
  }
  async function writeFile(path, content) {
    await ensureInitialized();
    path = normalize(path);
    await ensureParentDirs(path);
    const now = Date.now();
    const existing = await store.getItem(projectKey(path));
    const entry = { type: 'file', content: String(content), created: existing?.created || now, modified: now };
    await store.setItem(projectKey(path), entry);
    await touchProject();
    return entry;
  }
  async function writeBinaryFile(path, content, mime = 'application/octet-stream') {
    await ensureInitialized();
    path = normalize(path);
    await ensureParentDirs(path);
    const now = Date.now();
    const existing = await store.getItem(projectKey(path));
    const entry = { type: 'file', content, encoding: 'base64', mime, created: existing?.created || now, modified: now };
    await store.setItem(projectKey(path), entry);
    await touchProject();
    return entry;
  }
  async function mkdir(path) {
    await ensureInitialized();
    path = normalize(path);
    await store.setItem(projectKey(path), { type: 'folder', created: Date.now() });
    await touchProject();
  }
  async function exists(path) { return !!(await readEntry(path)); }
  async function stat(path) { return normalize(path) === '/' ? { type: 'folder' } : readEntry(path); }

  async function ensureParentDirs(path) {
    const parent = dirname(path);
    if (parent === '/' || await exists(parent)) return;
    await ensureParentDirs(parent);
    await mkdir(parent);
  }

  async function deletePath(path) {
    await ensureInitialized();
    path = normalize(path);
    const keys = await store.keys();
    const prefix = projectKey(path);
    const targets = keys.filter(k => k === prefix || k.startsWith(prefix + '/'));
    for (const key of targets) await store.removeItem(key);
    await touchProject();
  }

  async function rename(oldPath, newPath) {
    await ensureInitialized();
    oldPath = normalize(oldPath); newPath = normalize(newPath);
    const keys = await store.keys();
    const oldKey = projectKey(oldPath);
    const affected = keys.filter(k => k === oldKey || k.startsWith(oldKey + '/'));
    for (const key of affected) {
      const entry = await store.getItem(key);
      const relative = key.slice(oldKey.length);
      await store.setItem(projectKey(newPath + relative), entry);
      await store.removeItem(key);
    }
    await touchProject();
  }

  async function list(dir = '/') {
    await ensureInitialized();
    dir = normalize(dir);
    const keys = await store.keys();
    const prefix = dir === '/' ? projectPrefix() : `${currentProjectId}:${dir}/`;
    const children = [];
    for (const key of keys) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest.includes('/')) continue;
      const entry = await store.getItem(key);
      children.push({ path: rest ? join(dir, rest) : dir, name: basename(rest), ...entry });
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
      if (child.type === 'folder') result.push({ ...child, children: await readTree(child.path) });
      else result.push(child);
    }
    return result;
  }

  async function getAllEntries() {
    await ensureInitialized();
    const keys = (await store.keys()).filter(k => k.startsWith(projectPrefix()));
    const entries = [];
    for (const key of keys) entries.push({ path: key.slice(projectPrefix().length) || '/', entry: await store.getItem(key) });
    return entries;
  }

  // ---------- Expanded-folder state ----------
  async function getExpandedSet() { await ensureInitialized(); return new Set((await metaStore.getItem(`expanded:${currentProjectId}`)) || []); }
  async function saveExpandedSet(set) { await ensureInitialized(); await metaStore.setItem(`expanded:${currentProjectId}`, [...set]); }

  // ---------- Seed default workspace ----------
  async function seedIfEmpty() {
    await ensureInitialized();
    const seedMarker = `seeded:${currentProjectId}`;
    if (await metaStore.getItem(seedMarker)) return false;
    if (currentProjectId !== DEFAULT_PROJECT_ID) return false;
    if ((await store.keys()).some(k => k.startsWith(projectPrefix()))) {
      await metaStore.setItem(seedMarker, true);
      return false;
    }
    await mkdir('/src');
    await writeFile('/README.md', `# Welcome to Code Editer π\n\nA fully offline, browser-based IDE.\n\n## Phase 1\nUse Project Manager to create projects, import/export ZIP files, and download your workspace.\n\n## Shortcuts\n- \`Ctrl+S\` — Save file\n- \`Ctrl+P\` — Quick file open\n- \`Ctrl+\`\` — Toggle terminal\n- \`Ctrl+Enter\` — Run current file\n- \`Ctrl+B\` — Toggle sidebar\n`);
    await writeFile('/src/index.html', `<!DOCTYPE html>\n<html>\n<head><title>π Preview</title></head>\n<body>\n  <h1>Hello from Code Editer π</h1>\n  <script src="app.js"><\\/script>\n</body>\n</html>`);
    await writeFile('/src/style.css', `body { font-family: sans-serif; padding: 2rem; }`);
    await writeFile('/src/app.js', `console.log('π editor live preview works!');`);
    await writeFile('/src/main.py', `print("Hello from Pyodide — Python in your browser!")`);
    await metaStore.setItem(seedMarker, true);
    return true;
  }

  return {
    init, normalize, dirname, basename, extname, join,
    readFile, readEntry, writeFile, writeBinaryFile, mkdir, exists, stat,
    deletePath, rename, list, readTree, getAllEntries,
    getExpandedSet, saveExpandedSet, seedIfEmpty,
    listProjects, getCurrentProject, createProject, switchProject, renameProject, deleteProject
  };
})();
