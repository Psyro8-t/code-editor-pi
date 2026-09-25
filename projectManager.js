/* ============================================================
   projectManager.js — Phase 1 project workspace controls.
   Uses JSZip for browser-local archives; no server is required.
   ============================================================ */

const ProjectManager = (() => {
  const $ = (selector) => document.querySelector(selector);
  const els = {
    dialog: $('#project-dialog'),
    select: $('#project-select'),
    name: $('#project-name-input'),
    status: $('#project-status'),
    fileInput: $('#project-file-input'),
    folderInput: $('#project-folder-input'),
    backupInput: $('#project-backup-input'),
    singleInput: $('#project-single-input'),
    current: $('#current-project-name')
  };
  let initialized = false;

  function setStatus(message, error = false) {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.classList.toggle('error', error);
  }

  function projectNameFromPath(path) {
    const clean = path.replace(/\\/g, '/').replace(/^\/+/, '');
    return clean.split('/')[0] || 'Imported Project';
  }

  function normalizeImportedPath(path) {
    let clean = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
    clean = clean.split('/').filter(part => part && part !== '.' && part !== '..').join('/');
    return clean ? '/' + clean : null;
  }

  function shouldSkip(path) {
    return path.split('/').some(part => part === '.git' || part === 'node_modules' || part === 'dist' || part === 'build');
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function refresh() {
    const projects = await FileSystem.listProjects();
    const current = await FileSystem.getCurrentProject();
    if (els.select) {
      els.select.innerHTML = projects.map(project => `<option value="${CSS.escape(project.id)}">${project.name}</option>`).join('');
      els.select.value = current.id;
    }
    if (els.current) els.current.textContent = current.name;
    return current;
  }

  async function openDialog() {
    await refresh();
    els.name.value = '';
    setStatus('Choose a project or create a new one.');
    els.dialog.classList.remove('hidden');
    els.select.focus();
  }

  function closeDialog() { els.dialog.classList.add('hidden'); }

  async function createProject() {
    const name = els.name.value.trim();
    if (!name) { setStatus('Enter a project name.', true); return; }
    const project = await FileSystem.createProject(name);
    closeDialog();
    await refresh();
    notifyWorkspaceChanged(project);
  }

  async function switchProject() {
    const project = await FileSystem.switchProject(els.select.value);
    closeDialog();
    await refresh();
    notifyWorkspaceChanged(project);
  }

  async function renameProject() {
    const current = await FileSystem.getCurrentProject();
    const name = prompt('New project name:', current.name);
    if (!name?.trim()) return;
    await FileSystem.renameProject(current.id, name);
    await refresh();
    flash('Project renamed');
  }

  async function deleteProject() {
    const current = await FileSystem.getCurrentProject();
    if (current.id === 'default') { setStatus('The default project cannot be deleted.', true); return; }
    if (!confirm(`Delete project "${current.name}" and all its files?`)) return;
    await FileSystem.deleteProject(current.id);
    await refresh();
    closeDialog();
    notifyWorkspaceChanged(await FileSystem.getCurrentProject());
  }

  async function importZip(file, nameOverride) {
    if (!file) return;
    try {
      setStatus(`Reading ${file.name}…`);
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter(entry => !entry.dir && !shouldSkip(entry.name));
      if (!entries.length) throw new Error('No importable files found in ZIP');
      const project = await FileSystem.createProject(nameOverride || file.name.replace(/\.zip$/i, ''));
      for (const entry of entries) {
        const path = normalizeImportedPath(entry.name);
        if (!path) continue;
        const bytes = await entry.async('uint8array');
        const text = await entry.async('text');
        const looksText = !bytes.some(byte => byte === 0);
        if (looksText) await FileSystem.writeFile(path, text);
        else await FileSystem.writeBinaryFile(path, bytesToBase64(bytes), 'application/octet-stream');
      }
      closeDialog();
      notifyWorkspaceChanged(project);
      flash(`Imported ${entries.length} files`);
    } catch (error) {
      setStatus(`Import failed: ${error.message}`, true);
    } finally {
      els.fileInput.value = '';
    }
  }

  async function importFolder(files, nameOverride) {
    if (!files?.length) return;
    try {
      const firstPath = files[0].webkitRelativePath || files[0].name;
      const project = await FileSystem.createProject(nameOverride || projectNameFromPath(firstPath));
      let imported = 0;
      for (const file of files) {
        const rawPath = file.webkitRelativePath || file.name;
        if (shouldSkip(rawPath)) continue;
        const path = normalizeImportedPath(rawPath.replace(/^[^/]+\//, ''));
        if (!path) continue;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const looksText = !bytes.some(byte => byte === 0);
        if (looksText) await FileSystem.writeFile(path, new TextDecoder().decode(bytes));
        else await FileSystem.writeBinaryFile(path, bytesToBase64(bytes), file.type || 'application/octet-stream');
        imported++;
      }
      closeDialog();
      notifyWorkspaceChanged(project);
      flash(`Imported ${imported} files`);
    } catch (error) {
      setStatus(`Folder import failed: ${error.message}`, true);
    } finally {
      els.folderInput.value = '';
      if (els.singleInput) els.singleInput.value = '';
    }
  }

  async function exportZip() {
    const project = await FileSystem.getCurrentProject();
    const entries = await FileSystem.getAllEntries();
    const zip = new JSZip();
    for (const item of entries) {
      if (item.path === '/') continue;
      const path = item.path.replace(/^\//, '');
      if (item.entry.type === 'folder') zip.folder(path);
      else if (item.entry.encoding === 'base64') zip.file(path, base64ToBytes(item.entry.content));
      else zip.file(path, item.entry.content);
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    downloadBlob(blob, `${project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'project'}.zip`);
    flash('Project ZIP downloaded');
  }

  async function exportBackup() {
    const project = await FileSystem.getCurrentProject();
    const entries = await FileSystem.getAllEntries();
    const payload = {
      format: 'code-editer-pi-backup', version: 1, exportedAt: new Date().toISOString(),
      project, entries
    };
    downloadBlob(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `${project.name.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'project'}-backup.json`);
    flash('Backup downloaded');
  }

  async function restoreBackup(file) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload.format !== 'code-editer-pi-backup' || !Array.isArray(payload.entries)) throw new Error('Invalid Code Editer π backup');
      const project = await FileSystem.createProject(payload.project?.name || 'Restored Project');
      for (const item of payload.entries) {
        if (!item.path || item.path === '/') continue;
        if (item.entry.type === 'folder') await FileSystem.mkdir(item.path);
        else if (item.entry.encoding === 'base64') await FileSystem.writeBinaryFile(item.path, item.entry.content, item.entry.mime);
        else await FileSystem.writeFile(item.path, item.entry.content);
      }
      closeDialog();
      notifyWorkspaceChanged(project);
      flash('Backup restored');
    } catch (error) {
      setStatus(`Restore failed: ${error.message}`, true);
    } finally {
      els.backupInput.value = '';
    }
  }

  async function uploadFiles(files) {
    return importFolder(files, 'Uploaded Project');
  }

  async function downloadCurrentFile() {
    const path = window.PIApp?.getActivePath?.();
    if (!path) { flash('Open a file first', true); return; }
    const entry = await FileSystem.readEntry(path);
    if (!entry || entry.type !== 'file') return;
    const body = entry.encoding === 'base64' ? base64ToBytes(entry.content) : entry.content;
    downloadBlob(new Blob([body], { type: entry.mime || 'text/plain' }), FileSystem.basename(path));
    flash('File downloaded');
  }

  function notifyWorkspaceChanged(project) {
    window.dispatchEvent(new CustomEvent('pi:workspace-changed', { detail: { project } }));
  }

  function flash(message, error = false) {
    setStatus(message, error);
    const status = $('#status-pwa');
    if (status) {
      status.textContent = message;
      setTimeout(() => { status.textContent = 'Offline Ready'; }, 2200);
    }
  }

  async function init() {
    if (initialized) return;
    initialized = true;
    await FileSystem.init();
    $('#btn-projects')?.addEventListener('click', openDialog);
    $('#btn-export-zip')?.addEventListener('click', exportZip);
    $('#btn-backup')?.addEventListener('click', exportBackup);
    $('#btn-download-file')?.addEventListener('click', downloadCurrentFile);
    $('#btn-new-project')?.addEventListener('click', createProject);
    $('#btn-switch-project')?.addEventListener('click', switchProject);
    $('#btn-rename-project')?.addEventListener('click', renameProject);
    $('#btn-delete-project')?.addEventListener('click', deleteProject);
    $('#project-dialog-close')?.addEventListener('click', closeDialog);
    $('#project-dialog')?.addEventListener('click', event => { if (event.target === els.dialog) closeDialog(); });
    $('#btn-import-zip')?.addEventListener('click', () => els.fileInput.click());
    $('#btn-upload-folder')?.addEventListener('click', () => els.folderInput.click());
    $('#btn-upload-files')?.addEventListener('click', () => els.singleInput.click());
    $('#btn-restore-backup')?.addEventListener('click', () => els.backupInput.click());
    els.fileInput?.addEventListener('change', event => importZip(event.target.files[0], els.name.value.trim()));
    els.folderInput?.addEventListener('change', event => importFolder(event.target.files, els.name.value.trim()));
    els.singleInput?.addEventListener('change', event => importFolder(event.target.files, els.name.value.trim() || 'Uploaded Project'));
    els.backupInput?.addEventListener('change', event => restoreBackup(event.target.files[0]));
    await refresh();
  }

  return { init, refresh, openDialog, exportZip, exportBackup };
})();
