/* ===========================================================
   ALIP ENCRYPTOR — obfuscator.js

   Honesty rule: every function here either runs a real transform
   engine or throws/returns a clear "not supported" result. Nothing
   fakes an obfuscated output for a language we can't actually process
   in the browser.

   - JavaScript : real obfuscation via the `javascript-obfuscator`
                  engine (loaded from CDN in index.html as window.JavaScriptObfuscator)
   - JSON       : structural minification (whitespace removal only —
                  JSON has no identifiers to rename)
   - HTML       : minification (comments/whitespace stripped); real
                  identifier obfuscation doesn't apply to markup
   - CSS        : minification (comments/whitespace stripped, safe only)
   - Python/PHP/Java/C/C++ : NOT supported in a pure browser build —
                  these need a real parser/compiler toolchain per
                  language. We say so instead of faking it.
   =========================================================== */

const ALIP_SUPPORTED_LANGS = {
  javascript: { label: 'JavaScript', mode: 'obfuscate', ext: 'js' },
  json:       { label: 'JSON',       mode: 'minify',    ext: 'json' },
  html:       { label: 'HTML',       mode: 'minify',    ext: 'html' },
  css:        { label: 'CSS',        mode: 'minify',    ext: 'css' },
  python:     { label: 'Python',     mode: 'unsupported', ext: 'py' },
  php:        { label: 'PHP',        mode: 'unsupported', ext: 'php' },
  java:       { label: 'Java',       mode: 'unsupported', ext: 'java' },
  c:          { label: 'C',          mode: 'unsupported', ext: 'c' },
  cpp:        { label: 'C++',        mode: 'unsupported', ext: 'cpp' },
};

function alipDetectLanguage(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  const map = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    json: 'json', html: 'html', htm: 'html', css: 'css',
    py: 'python', php: 'php', java: 'java', c: 'c',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp', h: 'c', hpp: 'cpp'
  };
  return map[ext] || null;
}

function alipJsObfuscatorOptions(level) {
  const base = {
    compact: true,
    simplify: true,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    renameGlobals: false,
  };
  if (level === 'ringan') {
    return { ...base, controlFlowFlattening: false, deadCodeInjection: false,
      stringArrayThreshold: 0.4, identifierNamesGenerator: 'hexadecimal' };
  }
  if (level === 'sedang') {
    return { ...base, controlFlowFlattening: true, controlFlowFlatteningThreshold: 0.5,
      deadCodeInjection: true, deadCodeInjectionThreshold: 0.2,
      stringArrayThreshold: 0.75, identifierNamesGenerator: 'hexadecimal',
      selfDefending: false };
  }
  // tinggi
  return { ...base, controlFlowFlattening: true, controlFlowFlatteningThreshold: 1,
    deadCodeInjection: true, deadCodeInjectionThreshold: 0.4,
    stringArrayThreshold: 1, stringArrayRotate: true, stringArrayShuffle: true,
    identifierNamesGenerator: 'hexadecimal', selfDefending: true,
    disableConsoleOutput: true, numbersToExpressions: true, splitStrings: true };
}

function alipObfuscateJS(code, level) {
  if (typeof JavaScriptObfuscator === 'undefined') {
    throw new Error('JavaScript obfuscation engine failed to load (check your internet connection / CDN access).');
  }
  const options = alipJsObfuscatorOptions(level);
  const result = JavaScriptObfuscator.obfuscate(code, options);
  return result.getObfuscatedCode();
}

/** Safe-ish HTML minifier: strips comments and collapses insignificant
 *  whitespace between tags. Does not touch content inside <pre>/<textarea>/<script>/<style>. */
function alipMinifyHTML(code) {
  const PROTECT = [];
  let protectedCode = code.replace(/<(pre|textarea|script|style)[\s\S]*?<\/\1>/gi, (m) => {
    PROTECT.push(m);
    return `\u0000PROTECT${PROTECT.length - 1}\u0000`;
  });
  protectedCode = protectedCode
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n\s*/g, '')
    .trim();
  return protectedCode.replace(/\u0000PROTECT(\d+)\u0000/g, (_, i) => PROTECT[Number(i)]);
}

/** Safe CSS minifier: strips comments, collapses whitespace, trims
 *  redundant semicolons/spaces around punctuation. */
function alipMinifyCSS(code) {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([{}:;,])\s*/g, '$1')
    .replace(/;}/g, '}')
    .replace(/\n+/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function alipMinifyJSON(code) {
  // Validates as a side effect — throws a clear error on malformed JSON
  const parsed = JSON.parse(code);
  return JSON.stringify(parsed);
}

/**
 * Main entry point. Returns { output, note, mode } or throws.
 */
function alipRunObfuscator(code, lang, level) {
  const spec = ALIP_SUPPORTED_LANGS[lang];
  if (!spec) throw new Error('Unknown language: ' + lang);

  if (spec.mode === 'unsupported') {
    throw new Error(
      `${spec.label} obfuscation needs a real compiler/parser toolchain and can't be ` +
      `done honestly in a browser-only build. Use a dedicated tool for this language ` +
      `(for example pyarmor for Python, or ionCube/php-obfuscator for PHP) and run it ` +
      `through a backend, or request a Node.js backend build of ALIP ENCRYPTOR for this language.`
    );
  }
  if (spec.mode === 'obfuscate') {
    return { output: alipObfuscateJS(code, level), mode: 'obfuscate', note: 'Full obfuscation (identifier renaming, string encoding, control-flow transforms).' };
  }
  // minify
  if (lang === 'html') return { output: alipMinifyHTML(code), mode: 'minify', note: 'Minified only — HTML has no identifiers to obfuscate.' };
  if (lang === 'css')  return { output: alipMinifyCSS(code),  mode: 'minify', note: 'Minified only — CSS has no identifiers to obfuscate.' };
  if (lang === 'json') return { output: alipMinifyJSON(code), mode: 'minify', note: 'Minified only — whitespace removed, structure validated.' };
  throw new Error('No handler for ' + lang);
}
