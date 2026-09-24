# Vendored browser dependencies

These files are the minimal browser runtime assets required by Code Editer π. Package archives, source files, TypeScript declarations, examples, and source maps are intentionally excluded.

| Dependency | Version | Files included |
| --- | ---: | --- |
| Monaco Editor | 0.56.0 | `monaco/min/vs/` AMD runtime, editor CSS, language contributions, workers, and codicon font |
| XTerm.js | 5.3.0 | `xterm/lib/xterm.js`, `xterm/css/xterm.css` |
| xterm-addon-fit | 0.8.0 | `xterm-addon-fit/lib/xterm-addon-fit.js` |
| localForage | 1.10.0 | `localforage.min.js` |
| Pyodide | 0.29.5 | `pyodide/` loader, JavaScript/WASM runtime, standard library, and lock file |
| TypeScript | 5.9.3 | `typescript/typescript.js` compiler runtime for `.ts` execution and inline TypeScript preview |

The service worker precaches every runtime file listed by the application so the editor and its Python runtime can start without network access after installation.
