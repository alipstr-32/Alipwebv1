/* ===========================================================
   ALIP ENCRYPTOR — app.js
   Navigation, stats, toasts, and the wiring for every page.
   Session-only state (nothing persists unless the user opts into
   History, which uses localStorage and never stores passwords/content).
   =========================================================== */

/* ---------- global session stats (real, not fake numbers) ---------- */
const alipStats = { processed: 0, success: 0, failed: 0, bytes: 0 };

function alipBumpStat(ok, bytes) {
  alipStats.processed++;
  if (ok) alipStats.success++; else alipStats.failed++;
  alipStats.bytes += (bytes || 0);
  alipRenderStats();
}
function alipFmtBytes(n) {
  if (n === 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return (n / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}
function alipRenderStats() {
  const map = {
    'stat-processed': alipStats.processed,
    'stat-success': alipStats.success,
    'stat-failed': alipStats.failed,
    'stat-bytes': alipFmtBytes(alipStats.bytes)
  };
  for (const id in map) { const el = document.getElementById(id); if (el) el.textContent = map[id]; }
}

/* ---------- toasts ---------- */
function alipToast(msg, type) {
  const stack = document.getElementById('toast-stack');
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'err' ? ' err' : type === 'ok' ? ' ok' : '');
  t.textContent = msg;
  stack.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/* ---------- navigation ---------- */
function alipNavTo(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.rail-link').forEach(l => l.classList.remove('active'));
  const target = document.getElementById('view-' + view);
  if (target) target.classList.add('active');
  document.querySelectorAll(`.rail-link[data-view="${view}"]`).forEach(l => l.classList.add('active'));
  const titles = {
    home: ['Home', 'Overview & quick actions'],
    encrypt: ['Encrypt File', 'AES-256-GCM, local in-browser encryption'],
    decrypt: ['Decrypt File', 'Restore a .alipenc container'],
    obfuscator: ['Code Obfuscator', 'Protect source code readability'],
    batch: ['Batch Processor', 'Run one operation across many files'],
    history: ['History', 'Local, opt-in session log'],
    docs: ['Documentation', 'Install, run, deploy'],
    faq: ['FAQ & Security', 'How ALIP ENCRYPTOR protects your data'],
    about: ['About', 'ALIP ENCRYPTOR'],
  };
  const [t1, t2] = titles[view] || ['ALIP ENCRYPTOR', ''];
  document.getElementById('topbar-title').textContent = t1;
  document.getElementById('topbar-sub').textContent = t2;
  closeRail();
  window.scrollTo(0, 0);
}
function openRail() { document.getElementById('rail').classList.add('open'); document.getElementById('rail-scrim').classList.add('show'); }
function closeRail() { document.getElementById('rail').classList.remove('open'); document.getElementById('rail-scrim').classList.remove('show'); }

/* ---------- download helper ---------- */
function alipDownloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function alipDownloadZip(items, zipName) {
  // items: [{name, blob}]
  if (typeof JSZip === 'undefined') { alipToast('ZIP engine failed to load — downloading files individually.', 'err'); items.forEach(i => alipDownloadBlob(i.blob, i.name)); return; }
  const zip = new JSZip();
  items.forEach(i => zip.file(i.name, i.blob));
  const blob = await zip.generateAsync({ type: 'blob' });
  alipDownloadBlob(blob, zipName);
}

/* ---------- password strength UI ---------- */
function alipWirePasswordStrength(inputId, barId) {
  const input = document.getElementById(inputId);
  const bar = document.getElementById(barId);
  if (!input || !bar) return;
  const i = bar.querySelector('i');
  input.addEventListener('input', () => {
    const s = passwordStrength(input.value);
    const pct = (s / 5) * 100;
    const colors = ['#e2605a', '#e2605a', '#e8b94d', '#e8b94d', '#4ddc8f', '#4ddc8f'];
    i.style.width = pct + '%';
    i.style.background = colors[s];
  });
}
function alipWirePwToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  if (!btn || !input) return;
  btn.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    btn.textContent = input.type === 'password' ? 'Show' : 'Hide';
  });
}

/* ===========================================================
   Generic file-queue controller — shared by Encrypt / Decrypt / Batch
   =========================================================== */
function alipMakeQueue(opts) {
  // opts: { listEl, accept, badge(file) -> short ext text }
  let files = [];
  function render() {
    opts.listEl.innerHTML = '';
    if (files.length === 0) { opts.onEmpty && opts.onEmpty(); return; }
    files.forEach((f, idx) => {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = `
        <div class="file-ic">${(f.name.split('.').pop() || '?').slice(0, 4).toUpperCase()}</div>
        <div class="file-meta">
          <div class="file-name">${alipEscape(f.name)}</div>
          <div class="file-sub">${alipFmtBytes(f.size)}</div>
        </div>
        <div class="file-status st-pending" data-role="status">Pending</div>
        <button class="file-remove" title="Remove" data-idx="${idx}">✕</button>`;
      row.querySelector('.file-remove').addEventListener('click', () => { files.splice(idx, 1); render(); opts.onChange && opts.onChange(files); });
      row._fileRef = f;
      opts.listEl.appendChild(row);
    });
    opts.onChange && opts.onChange(files);
  }
  return {
    add(newFiles) { files = files.concat(Array.from(newFiles)); render(); },
    clear() { files = []; render(); },
    rows() { return Array.from(opts.listEl.children); },
    get() { return files; },
    setStatus(idx, status, label) {
      const row = opts.listEl.children[idx];
      if (!row) return;
      const el = row.querySelector('[data-role="status"]');
      el.className = 'file-status st-' + status;
      el.textContent = label;
    }
  };
}
function alipEscape(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

/* ===========================================================
   ENCRYPT page
   =========================================================== */
const alipEncryptResults = []; // { name, blob }
let alipEncQueue;

function alipInitEncrypt() {
  alipEncQueue = alipMakeQueue({
    listEl: document.getElementById('enc-filelist'),
    onEmpty: () => {},
    onChange: (files) => { document.getElementById('enc-start').disabled = files.length === 0; }
  });

  const dz = document.getElementById('enc-dropzone');
  const input = document.getElementById('enc-fileinput');
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => { alipEncQueue.add(e.target.files); input.value = ''; });
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) alipEncQueue.add(e.dataTransfer.files); });

  document.getElementById('enc-clear').addEventListener('click', () => { alipEncQueue.clear(); alipResetEncryptOutputs(); });
  alipWirePwToggle('enc-pw-toggle', 'enc-password');
  alipWirePwToggle('enc-pw2-toggle', 'enc-password2');
  alipWirePasswordStrength('enc-password', 'enc-strength');

  document.getElementById('enc-start').addEventListener('click', alipRunEncrypt);
  document.getElementById('enc-download-all').addEventListener('click', () => {
    alipDownloadZip(alipEncryptResults, 'alip_encrypted_files.zip');
  });
  document.getElementById('enc-reset').addEventListener('click', () => {
    alipEncQueue.clear();
    document.getElementById('enc-password').value = '';
    document.getElementById('enc-password2').value = '';
    alipResetEncryptOutputs();
  });
}
function alipResetEncryptOutputs() {
  alipEncryptResults.length = 0;
  document.getElementById('enc-download-all').disabled = true;
  document.getElementById('enc-progress-wrap').style.display = 'none';
  document.getElementById('enc-alert').innerHTML = '';
}

async function alipRunEncrypt() {
  const files = alipEncQueue.get();
  const pw = document.getElementById('enc-password').value;
  const pw2 = document.getElementById('enc-password2').value;
  const alertBox = document.getElementById('enc-alert');
  alertBox.innerHTML = '';

  if (files.length === 0) return alipAlert(alertBox, 'warn', 'Select at least one file first.');
  if (!pw) return alipAlert(alertBox, 'warn', 'Enter a password.');
  if (pw !== pw2) return alipAlert(alertBox, 'warn', 'Password and confirmation do not match.');
  if (pw.length < 6) return alipAlert(alertBox, 'warn', 'Use at least 6 characters — longer is stronger.');

  const startBtn = document.getElementById('enc-start');
  startBtn.disabled = true;
  alipEncryptResults.length = 0;
  document.getElementById('enc-download-all').disabled = true;
  const wrap = document.getElementById('enc-progress-wrap');
  wrap.style.display = 'block';
  const bar = wrap.querySelector('.progress-bar i');
  const label = document.getElementById('enc-progress-label');
  const pct = document.getElementById('enc-progress-pct');

  const rows = alipEncQueue.rows();
  let okCount = 0, failCount = 0;

  for (let idx = 0; idx < files.length; idx++) {
    const f = files[idx]._fileRef || files[idx];
    alipEncQueue.setStatus(idx, 'processing', 'Processing');
    try {
      const result = await alipEncryptFile(f, pw, (frac, msg) => {
        const overall = (idx + frac) / files.length;
        bar.style.width = (overall * 100).toFixed(0) + '%';
        pct.textContent = (overall * 100).toFixed(0) + '%';
        label.textContent = `File ${idx + 1}/${files.length} — ${msg}`;
      });
      alipEncQueue.setStatus(idx, 'success', 'Success');
      alipEncryptResults.push({ name: result.outName, blob: result.blob });
      alipBumpStat(true, result.outSize);
      alipHistoryLog('Encrypt', f.name, true, result.outSize);
      okCount++;
      alipRenderSingleDownload(rows[idx], result);
    } catch (err) {
      alipEncQueue.setStatus(idx, 'failed', 'Failed');
      alipBumpStat(false, 0);
      alipHistoryLog('Encrypt', f.name, false, 0);
      failCount++;
      console.error(err);
    }
  }

  startBtn.disabled = false;
  document.getElementById('enc-download-all').disabled = alipEncryptResults.length === 0;
  if (failCount === 0) alipAlert(alertBox, 'success', `Done — ${okCount} file(s) encrypted successfully.`);
  else alipAlert(alertBox, 'warn', `${okCount} succeeded, ${failCount} failed. See status next to each file.`);
}

function alipRenderSingleDownload(row, result) {
  if (!row) return;
  const btn = document.createElement('button');
  btn.className = 'btn btn-sm btn-outline';
  btn.style.marginLeft = '8px';
  btn.textContent = 'Download';
  btn.addEventListener('click', () => alipDownloadBlob(result.blob, result.outName));
  row.appendChild(btn);
}

function alipAlert(box, kind, msg) {
  box.innerHTML = `<div class="alert alert-${kind === 'warn' ? 'warn' : kind}">${alipEscape(msg)}</div>`;
}

/* ===========================================================
   DECRYPT page
   =========================================================== */
const alipDecryptResults = [];
let alipDecQueue;

function alipInitDecrypt() {
  alipDecQueue = alipMakeQueue({
    listEl: document.getElementById('dec-filelist'),
    onChange: (files) => { document.getElementById('dec-start').disabled = files.length === 0; }
  });
  const dz = document.getElementById('dec-dropzone');
  const input = document.getElementById('dec-fileinput');
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', e => { alipDecQueue.add(e.target.files); input.value = ''; });
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) alipDecQueue.add(e.dataTransfer.files); });

  document.getElementById('dec-clear').addEventListener('click', () => { alipDecQueue.clear(); alipResetDecryptOutputs(); });
  alipWirePwToggle('dec-pw-toggle', 'dec-password');
  document.getElementById('dec-start').addEventListener('click', alipRunDecrypt);
  document.getElementById('dec-download-all').addEventListener('click', () => alipDownloadZip(alipDecryptResults, 'alip_decrypted_files.zip'));
  document.getElementById('dec-reset').addEventListener('click', () => {
    alipDecQueue.clear();
    document.getElementById('dec-password').value = '';
    alipResetDecryptOutputs();
  });
}
function alipResetDecryptOutputs() {
  alipDecryptResults.length = 0;
  document.getElementById('dec-download-all').disabled = true;
  document.getElementById('dec-progress-wrap').style.display = 'none';
  document.getElementById('dec-alert').innerHTML = '';
}

async function alipRunDecrypt() {
  const files = alipDecQueue.get();
  const pw = document.getElementById('dec-password').value;
  const alertBox = document.getElementById('dec-alert');
  alertBox.innerHTML = '';
  if (files.length === 0) return alipAlert(alertBox, 'warn', 'Select at least one .alipenc file.');
  if (!pw) return alipAlert(alertBox, 'warn', 'Enter the password used to encrypt this file.');

  const startBtn = document.getElementById('dec-start');
  startBtn.disabled = true;
  alipDecryptResults.length = 0;
  document.getElementById('dec-download-all').disabled = true;
  const wrap = document.getElementById('dec-progress-wrap');
  wrap.style.display = 'block';
  const bar = wrap.querySelector('.progress-bar i');
  const label = document.getElementById('dec-progress-label');
  const pct = document.getElementById('dec-progress-pct');

  const rows = alipDecQueue.rows();
  let okCount = 0, failCount = 0;

  for (let idx = 0; idx < files.length; idx++) {
    const f = files[idx]._fileRef || files[idx];
    alipDecQueue.setStatus(idx, 'processing', 'Processing');
    try {
      const result = await alipDecryptFile(f, pw, (frac, msg) => {
        const overall = (idx + frac) / files.length;
        bar.style.width = (overall * 100).toFixed(0) + '%';
        pct.textContent = (overall * 100).toFixed(0) + '%';
        label.textContent = `File ${idx + 1}/${files.length} — ${msg}`;
      });
      alipDecQueue.setStatus(idx, 'success', 'Success');
      alipDecryptResults.push({ name: result.outName, blob: result.blob });
      alipBumpStat(true, result.outSize);
      alipHistoryLog('Decrypt', f.name, true, result.outSize);
      okCount++;
      alipRenderSingleDownload(rows[idx], result);
    } catch (err) {
      alipDecQueue.setStatus(idx, 'failed', 'Failed: ' + err.message);
      alipBumpStat(false, 0);
      alipHistoryLog('Decrypt', f.name, false, 0);
      failCount++;
    }
  }

  startBtn.disabled = false;
  document.getElementById('dec-download-all').disabled = alipDecryptResults.length === 0;
  if (failCount === 0) alipAlert(alertBox, 'success', `Done — ${okCount} file(s) decrypted and integrity-verified.`);
  else alipAlert(alertBox, 'warn', `${okCount} succeeded, ${failCount} failed. Check password / file integrity.`);
}

/* ===========================================================
   OBFUSCATOR page
   =========================================================== */
let alipObfLang = 'auto';
let alipObfLevel = 'sedang';
let alipObfCurrentFile = null;

function alipInitObfuscator() {
  const dz = document.getElementById('obf-dropzone');
  const input = document.getElementById('obf-fileinput');
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', e => { if (e.target.files[0]) alipLoadObfFile(e.target.files[0]); input.value = ''; });
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) alipLoadObfFile(e.dataTransfer.files[0]); });

  document.querySelectorAll('[data-obf-lang]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-obf-lang]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      alipObfLang = chip.dataset.obfLang;
    });
  });
  document.querySelectorAll('[data-obf-level]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-obf-level]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      alipObfLevel = chip.dataset.obfLevel;
    });
  });

  document.getElementById('obf-start').addEventListener('click', alipRunObfuscate);
  document.getElementById('obf-copy').addEventListener('click', () => {
    const out = document.getElementById('obf-output').value;
    navigator.clipboard.writeText(out).then(() => alipToast('Copied to clipboard', 'ok'));
  });
  document.getElementById('obf-download').addEventListener('click', () => {
    const out = document.getElementById('obf-output').value;
    if (!out) return;
    const name = alipObfOutputName();
    alipDownloadBlob(new Blob([out]), name);
  });
  document.getElementById('obf-reset').addEventListener('click', () => {
    document.getElementById('obf-input').value = '';
    document.getElementById('obf-output').value = '';
    document.getElementById('obf-alert').innerHTML = '';
    document.getElementById('obf-filename').textContent = 'untitled.js';
    alipObfCurrentFile = null;
    alipSetObfButtons(false);
  });
}

function alipLoadObfFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById('obf-input').value = reader.result;
    document.getElementById('obf-filename').textContent = file.name;
    alipObfCurrentFile = file;
    const detected = alipDetectLanguage(file.name);
    if (detected && alipObfLang === 'auto') {
      document.querySelectorAll('[data-obf-lang]').forEach(c => c.classList.remove('active'));
      const chip = document.querySelector(`[data-obf-lang="${detected}"]`);
      if (chip) chip.classList.add('active');
    }
  };
  reader.readAsText(file);
}

function alipObfOutputName() {
  const base = (alipObfCurrentFile ? alipObfCurrentFile.name.replace(/\.[^.]+$/, '') : 'code');
  const lang = alipObfLang === 'auto' ? (alipObfCurrentFile ? alipDetectLanguage(alipObfCurrentFile.name) : 'javascript') : alipObfLang;
  const ext = (ALIP_SUPPORTED_LANGS[lang] || { ext: 'txt' }).ext;
  return `${base}_obfuscated.${ext}`;
}

function alipSetObfButtons(enabled) {
  ['obf-copy', 'obf-download'].forEach(id => document.getElementById(id).disabled = !enabled);
}

function alipRunObfuscate() {
  const alertBox = document.getElementById('obf-alert');
  alertBox.innerHTML = '';
  const code = document.getElementById('obf-input').value;
  if (!code.trim()) return alipAlert(alertBox, 'warn', 'Paste code or upload a file first.');

  let lang = alipObfLang;
  if (lang === 'auto') {
    lang = alipObfCurrentFile ? alipDetectLanguage(alipObfCurrentFile.name) : null;
    if (!lang) return alipAlert(alertBox, 'warn', 'Could not auto-detect the language — pick one manually.');
  }

  const beforeSize = new Blob([code]).size;
  try {
    const { output, note } = alipRunObfuscator(code, lang, alipObfLevel);
    document.getElementById('obf-output').value = output;
    const afterSize = new Blob([output]).size;
    alipAlert(alertBox, 'success', `${note} — ${alipFmtBytes(beforeSize)} → ${alipFmtBytes(afterSize)}.`);
    alipSetObfButtons(true);
    alipBumpStat(true, afterSize);
    alipHistoryLog('Obfuscate', alipObfCurrentFile ? alipObfCurrentFile.name : 'pasted-code', true, afterSize);
  } catch (err) {
    alipAlert(alertBox, 'error', err.message);
    document.getElementById('obf-output').value = '';
    alipSetObfButtons(false);
    alipBumpStat(false, 0);
    alipHistoryLog('Obfuscate', alipObfCurrentFile ? alipObfCurrentFile.name : 'pasted-code', false, 0);
  }
}

/* ===========================================================
   BATCH page — pick an operation, drop many files, one report
   =========================================================== */
let alipBatchOp = 'encrypt';
let alipBatchQueue;
const alipBatchResults = [];

function alipInitBatch() {
  alipBatchQueue = alipMakeQueue({
    listEl: document.getElementById('batch-filelist'),
    onChange: (files) => { document.getElementById('batch-start').disabled = files.length === 0; }
  });
  document.querySelectorAll('[data-batch-op]').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('[data-batch-op]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      alipBatchOp = chip.dataset.batchOp;
      document.getElementById('batch-pw-field').style.display = alipBatchOp === 'obfuscate' ? 'none' : 'block';
    });
  });
  const dz = document.getElementById('batch-dropzone');
  const input = document.getElementById('batch-fileinput');
  dz.addEventListener('click', () => input.click());
  input.addEventListener('change', e => { alipBatchQueue.add(e.target.files); input.value = ''; });
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files.length) alipBatchQueue.add(e.dataTransfer.files); });

  document.getElementById('batch-clear').addEventListener('click', () => { alipBatchQueue.clear(); alipBatchResults.length = 0; document.getElementById('batch-report').innerHTML = ''; document.getElementById('batch-download-all').disabled = true; });
  document.getElementById('batch-start').addEventListener('click', alipRunBatch);
  document.getElementById('batch-download-all').addEventListener('click', () => alipDownloadZip(alipBatchResults, 'alip_batch_results.zip'));
}

async function alipRunBatch() {
  const files = alipBatchQueue.get();
  const pw = document.getElementById('batch-password').value;
  const report = document.getElementById('batch-report');
  report.innerHTML = '';
  if (files.length === 0) return;
  if (alipBatchOp !== 'obfuscate' && !pw) return alipAlert(report, 'warn', 'Enter a password for encrypt/decrypt operations.');

  alipBatchResults.length = 0;
  document.getElementById('batch-download-all').disabled = true;
  const startBtn = document.getElementById('batch-start');
  startBtn.disabled = true;
  const wrap = document.getElementById('batch-progress-wrap');
  wrap.style.display = 'block';
  const bar = wrap.querySelector('.progress-bar i');
  const pct = document.getElementById('batch-progress-pct');

  const log = [];
  let ok = 0, fail = 0;

  for (let idx = 0; idx < files.length; idx++) {
    const f = files[idx]._fileRef || files[idx];
    alipBatchQueue.setStatus(idx, 'processing', 'Processing');
    try {
      if (alipBatchOp === 'encrypt') {
        const r = await alipEncryptFile(f, pw, () => {});
        alipBatchResults.push({ name: r.outName, blob: r.blob });
        alipBumpStat(true, r.outSize);
      } else if (alipBatchOp === 'decrypt') {
        const r = await alipDecryptFile(f, pw, () => {});
        alipBatchResults.push({ name: r.outName, blob: r.blob });
        alipBumpStat(true, r.outSize);
      } else {
        const lang = alipDetectLanguage(f.name);
        if (!lang) throw new Error('Unrecognized extension');
        const text = await f.text();
        const { output } = alipRunObfuscator(text, lang, 'sedang');
        const spec = ALIP_SUPPORTED_LANGS[lang];
        const outName = f.name.replace(/\.[^.]+$/, '') + '_obfuscated.' + spec.ext;
        const blob = new Blob([output]);
        alipBatchResults.push({ name: outName, blob });
        alipBumpStat(true, blob.size);
      }
      alipBatchQueue.setStatus(idx, 'success', 'Success');
      alipHistoryLog('Batch:' + alipBatchOp, f.name, true, 0);
      log.push(`<div class="l-ok">${alipEscape(f.name)} — done</div>`);
      ok++;
    } catch (err) {
      alipBatchQueue.setStatus(idx, 'failed', 'Failed');
      alipBumpStat(false, 0);
      alipHistoryLog('Batch:' + alipBatchOp, f.name, false, 0);
      log.push(`<div class="l-err">${alipEscape(f.name)} — ${alipEscape(err.message || 'error')}</div>`);
      fail++;
    }
    bar.style.width = (((idx + 1) / files.length) * 100).toFixed(0) + '%';
    pct.textContent = (((idx + 1) / files.length) * 100).toFixed(0) + '%';
  }

  startBtn.disabled = false;
  document.getElementById('batch-download-all').disabled = alipBatchResults.length === 0;
  report.innerHTML = `<div class="alert alert-${fail ? 'warn' : 'success'}">Batch finished — ${ok} succeeded, ${fail} failed.</div><div class="log">${log.join('')}</div>`;
}

/* ===========================================================
   HISTORY (opt-in, localStorage, metadata only — never content/passwords)
   =========================================================== */
const ALIP_HIST_KEY = 'alip_encryptor_history_v1';
const ALIP_HIST_OPT_KEY = 'alip_encryptor_history_opt';

function alipHistoryEnabled() { return localStorage.getItem(ALIP_HIST_OPT_KEY) === '1'; }
function alipHistoryLog(op, filename, ok, size) {
  if (!alipHistoryEnabled()) return;
  try {
    const list = JSON.parse(localStorage.getItem(ALIP_HIST_KEY) || '[]');
    list.unshift({ op, filename, ok, size, ts: new Date().toISOString() });
    localStorage.setItem(ALIP_HIST_KEY, JSON.stringify(list.slice(0, 200)));
    alipRenderHistory();
  } catch (e) { /* storage full or disabled — ignore silently */ }
}
function alipRenderHistory() {
  const body = document.getElementById('history-body');
  const toggle = document.getElementById('history-toggle');
  if (!body || !toggle) return;
  toggle.checked = alipHistoryEnabled();
  const list = JSON.parse(localStorage.getItem(ALIP_HIST_KEY) || '[]');
  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="5"><div class="empty"><p>${alipHistoryEnabled() ? 'No activity recorded yet.' : 'History is off — turn it on above to start logging locally.'}</p></div></td></tr>`;
    return;
  }
  body.innerHTML = list.map(r => `
    <tr>
      <td>${alipEscape(r.filename)}</td>
      <td>${alipEscape(r.op)}</td>
      <td>${new Date(r.ts).toLocaleString()}</td>
      <td>${r.ok ? '<span style="color:var(--success)">Success</span>' : '<span style="color:var(--danger)">Failed</span>'}</td>
      <td>${r.size ? alipFmtBytes(r.size) : '—'}</td>
    </tr>`).join('');
}
function alipInitHistory() {
  const toggle = document.getElementById('history-toggle');
  toggle.addEventListener('change', () => {
    localStorage.setItem(ALIP_HIST_OPT_KEY, toggle.checked ? '1' : '0');
    alipRenderHistory();
  });
  document.getElementById('history-clear').addEventListener('click', () => {
    localStorage.removeItem(ALIP_HIST_KEY);
    alipRenderHistory();
    alipToast('History cleared', 'ok');
  });
  alipRenderHistory();
}

/* ===========================================================
   BOOT
   =========================================================== */
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-view]').forEach(el => {
    el.addEventListener('click', (e) => { e.preventDefault(); alipNavTo(el.dataset.view); });
  });
  document.getElementById('menu-btn').addEventListener('click', openRail);
  document.getElementById('rail-scrim').addEventListener('click', closeRail);

  alipInitEncrypt();
  alipInitDecrypt();
  alipInitObfuscator();
  alipInitBatch();
  alipInitHistory();
  alipRenderStats();
  alipNavTo('home');
});
