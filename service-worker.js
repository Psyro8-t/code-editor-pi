/* ============================================================
   service-worker.js — Offline-first caching strategy
   All application and vendored runtime assets are precached so
   the editor, workers, and Pyodide can start without a network.
   ============================================================ */

const CACHE_NAME = 'code-editer-pi-v2.0.0';
const RUNTIME_CACHE = 'code-editer-pi-runtime-v2';

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './fileSystem.js',
  './terminal.js',
  './manifest.json',
  './assets/icon.svg',

  './vendor/localforage.min.js',
  './vendor/monaco/min/vs/abap-D-t0cyap.js',
  './vendor/monaco/min/vs/apex-CcIm7xu6.js',
  './vendor/monaco/min/vs/assets/css.worker-URu8fCFR.js',
  './vendor/monaco/min/vs/assets/editor.worker-lj3bdIIn.js',
  './vendor/monaco/min/vs/assets/editorWebWorkerMain-CA_vMoUU.js',
  './vendor/monaco/min/vs/assets/html.worker-D1SL3iM8.js',
  './vendor/monaco/min/vs/assets/json.worker-CoJx_OPf.js',
  './vendor/monaco/min/vs/assets/ts.worker-BWKtMYOk.js',
  './vendor/monaco/min/vs/azcli-BA0tQDCg.js',
  './vendor/monaco/min/vs/basic-languages/monaco.contribution.js',
  './vendor/monaco/min/vs/bat-C397hTD6.js',
  './vendor/monaco/min/vs/bicep-DF5aW17k.js',
  './vendor/monaco/min/vs/cameligo-plsz8qhj.js',
  './vendor/monaco/min/vs/clojure-Y2auQMzK.js',
  './vendor/monaco/min/vs/coffee-Bu45yuWE.js',
  './vendor/monaco/min/vs/cpp-CkKPQIni.js',
  './vendor/monaco/min/vs/csharp-CX28MZyh.js',
  './vendor/monaco/min/vs/csp-D8uWnyxW.js',
  './vendor/monaco/min/vs/css-CaeNmE3S.js',
  './vendor/monaco/min/vs/css.worker-CyhWkhHo.js',
  './vendor/monaco/min/vs/cssMode-CV6Ay48H.js',
  './vendor/monaco/min/vs/cypher-DVThT8BS.js',
  './vendor/monaco/min/vs/dart-CmGfCvrO.js',
  './vendor/monaco/min/vs/dockerfile-CZqqYdch.js',
  './vendor/monaco/min/vs/ecl-30fUercY.js',
  './vendor/monaco/min/vs/editor-KLE6jdfb.js',
  './vendor/monaco/min/vs/editor.js',
  './vendor/monaco/min/vs/editor/editor.main.css',
  './vendor/monaco/min/vs/editor/editor.main.js',
  './vendor/monaco/min/vs/editor/editor.worker.js',
  './vendor/monaco/min/vs/editorWorkerHost-fVE1cjcC.js',
  './vendor/monaco/min/vs/elixir-xjPaIfzF.js',
  './vendor/monaco/min/vs/flow9-DqtmStfK.js',
  './vendor/monaco/min/vs/freemarker2-FWreY7v7.js',
  './vendor/monaco/min/vs/fsharp-BOMdg4U1.js',
  './vendor/monaco/min/vs/go-D_hbi-Jt.js',
  './vendor/monaco/min/vs/graphql-CKUU4kLG.js',
  './vendor/monaco/min/vs/handlebars-CZi4pHCH.js',
  './vendor/monaco/min/vs/hcl-DTaboeZW.js',
  './vendor/monaco/min/vs/html-j_7ZTNRU.js',
  './vendor/monaco/min/vs/html.worker-CA3iAimZ.js',
  './vendor/monaco/min/vs/htmlMode-27by_KM4.js',
  './vendor/monaco/min/vs/index-049xrXrp.js',
  './vendor/monaco/min/vs/index-CBVt3dzv.js',
  './vendor/monaco/min/vs/index.js',
  './vendor/monaco/min/vs/ini-CsNwO04R.js',
  './vendor/monaco/min/vs/initialize-DL0l1TGY.js',
  './vendor/monaco/min/vs/java-CI4ZMsH9.js',
  './vendor/monaco/min/vs/javascript-DTJl4Jn1.js',
  './vendor/monaco/min/vs/json.worker-BizpAl9O.js',
  './vendor/monaco/min/vs/jsonMode-DLUiMUrI.js',
  './vendor/monaco/min/vs/julia-BwzEvaQw.js',
  './vendor/monaco/min/vs/kotlin-IUYPiTV8.js',
  './vendor/monaco/min/vs/language/css/css.worker.js',
  './vendor/monaco/min/vs/language/css/monaco.contribution.js',
  './vendor/monaco/min/vs/language/html/html.worker.js',
  './vendor/monaco/min/vs/language/html/monaco.contribution.js',
  './vendor/monaco/min/vs/language/json/json.worker.js',
  './vendor/monaco/min/vs/language/json/monaco.contribution.js',
  './vendor/monaco/min/vs/language/typescript/monaco.contribution.js',
  './vendor/monaco/min/vs/language/typescript/ts.worker.js',
  './vendor/monaco/min/vs/less-C0eDYdqa.js',
  './vendor/monaco/min/vs/lexon-iON-Kj97.js',
  './vendor/monaco/min/vs/liquid-CLJYelW6.js',
  './vendor/monaco/min/vs/loader.js',
  './vendor/monaco/min/vs/lspLanguageFeatures-BIkJOWLw.js',
  './vendor/monaco/min/vs/lua-DtygF91M.js',
  './vendor/monaco/min/vs/m3-CsR4AuFi.js',
  './vendor/monaco/min/vs/main-BEx-Fmlo.js',
  './vendor/monaco/min/vs/main-DsK8pnKg.js',
  './vendor/monaco/min/vs/markdown-C_rD0bIw.js',
  './vendor/monaco/min/vs/mdx-CpzZIPHF.js',
  './vendor/monaco/min/vs/mips-CiYP61RB.js',
  './vendor/monaco/min/vs/monaco.contribution-9cKT3C7t.js',
  './vendor/monaco/min/vs/monaco.contribution-BE88ZNGY.js',
  './vendor/monaco/min/vs/monaco.contribution-BPhsneLd.js',
  './vendor/monaco/min/vs/monaco.contribution-BgRy6xDf.js',
  './vendor/monaco/min/vs/msdax-C38-sJlp.js',
  './vendor/monaco/min/vs/mysql-CdtbpvbG.js',
  './vendor/monaco/min/vs/nls.messages-loader.js',
  './vendor/monaco/min/vs/nls/lang/cs.js',
  './vendor/monaco/min/vs/nls/lang/de.js',
  './vendor/monaco/min/vs/nls/lang/es.js',
  './vendor/monaco/min/vs/nls/lang/fr.js',
  './vendor/monaco/min/vs/nls/lang/it.js',
  './vendor/monaco/min/vs/nls/lang/ja.js',
  './vendor/monaco/min/vs/nls/lang/ko.js',
  './vendor/monaco/min/vs/nls/lang/pl.js',
  './vendor/monaco/min/vs/nls/lang/pt-br.js',
  './vendor/monaco/min/vs/nls/lang/ru.js',
  './vendor/monaco/min/vs/nls/lang/tr.js',
  './vendor/monaco/min/vs/nls/lang/zh-cn.js',
  './vendor/monaco/min/vs/nls/lang/zh-tw.js',
  './vendor/monaco/min/vs/objective-c-CntZFaHX.js',
  './vendor/monaco/min/vs/pascal-r6kuqfl_.js',
  './vendor/monaco/min/vs/pascaligo-BiXoTmXh.js',
  './vendor/monaco/min/vs/perl-DABw_TcH.js',
  './vendor/monaco/min/vs/pgsql-me_jFXeX.js',
  './vendor/monaco/min/vs/php-D_kh-9LK.js',
  './vendor/monaco/min/vs/pla-VfZjczW0.js',
  './vendor/monaco/min/vs/postiats-BBSzz8Pk.js',
  './vendor/monaco/min/vs/powerquery-Dt-g_2cc.js',
  './vendor/monaco/min/vs/powershell-B-7ap1zc.js',
  './vendor/monaco/min/vs/protobuf-BmtuEB1A.js',
  './vendor/monaco/min/vs/pug-BRpRNeEb.js',
  './vendor/monaco/min/vs/python-CqWUUgfu.js',
  './vendor/monaco/min/vs/qsharp-BzsFaUU9.js',
  './vendor/monaco/min/vs/r-f8dDdrp4.js',
  './vendor/monaco/min/vs/razor-hok5y9Km.js',
  './vendor/monaco/min/vs/redis-fvZQY4PI.js',
  './vendor/monaco/min/vs/redshift-45Et0LQi.js',
  './vendor/monaco/min/vs/restructuredtext-C7UUFKFD.js',
  './vendor/monaco/min/vs/ruby-CZO8zYTz.js',
  './vendor/monaco/min/vs/rust-Bfetafyc.js',
  './vendor/monaco/min/vs/sb-3GYllVck.js',
  './vendor/monaco/min/vs/scala-foMgrKo1.js',
  './vendor/monaco/min/vs/scheme-CHdMtr7p.js',
  './vendor/monaco/min/vs/scss-C1cmLt9V.js',
  './vendor/monaco/min/vs/shell-ClXCKCEW.js',
  './vendor/monaco/min/vs/solidity-MZ6ExpPy.js',
  './vendor/monaco/min/vs/sophia-DWkuSsPQ.js',
  './vendor/monaco/min/vs/sparql-AUGFYSyk.js',
  './vendor/monaco/min/vs/sql-32GpJSV2.js',
  './vendor/monaco/min/vs/st-CuDFIVZ_.js',
  './vendor/monaco/min/vs/swift-t-PfMj7W.js',
  './vendor/monaco/min/vs/systemverilog-Ch4vA8Yt.js',
  './vendor/monaco/min/vs/tcl-D74tq1nH.js',
  './vendor/monaco/min/vs/toggleHighContrast-qGX7E9o7.js',
  './vendor/monaco/min/vs/ts.worker-2QLmBukE.js',
  './vendor/monaco/min/vs/tsMode-B0S_kp2q.js',
  './vendor/monaco/min/vs/twig-C6taOxMV.js',
  './vendor/monaco/min/vs/typescript-_2t_511t.js',
  './vendor/monaco/min/vs/typespec-8OfoLt6R.js',
  './vendor/monaco/min/vs/vb-Dyb2648j.js',
  './vendor/monaco/min/vs/wgsl-BhLXMOR0.js',
  './vendor/monaco/min/vs/workers-BBttULjf.js',
  './vendor/monaco/min/vs/xml-cZjNDqDT.js',
  './vendor/monaco/min/vs/yaml-A1fOIdH6.js',
  './vendor/pyodide/pyodide-lock.json',
  './vendor/pyodide/pyodide.asm.js',
  './vendor/pyodide/pyodide.asm.wasm',
  './vendor/pyodide/pyodide.js',
  './vendor/pyodide/python_stdlib.zip',
  './vendor/typescript/typescript.js',
  './vendor/xterm-addon-fit/lib/xterm-addon-fit.js',
  './vendor/xterm/css/xterm.css',
  './vendor/xterm/lib/xterm.js',
];

// ---------- Install ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

// ---------- Activate ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

// ---------- Fetch ----------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match(request).then(cached => cached || caches.match('./index.html'))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok && new URL(request.url).origin === self.location.origin) {
          const clone = response.clone();
          caches.open(RUNTIME_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});

// ---------- Manual update hook ----------
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
