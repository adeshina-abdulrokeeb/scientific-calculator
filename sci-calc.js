/* ---------- Elements & State ---------- */
const display = document.getElementById('display');
const keysGrid = document.querySelector('.keys-grid');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistory');
const modeToggle = document.getElementById('modeToggle');

let degMode = true;      // default: Degrees
let lastAnswer = '';
let history = [];

/* ---------- Transform expression ---------- */
function transformExpression(input, useDegrees) {
  let expr = String(input).trim();

  // Support "pi" and π
  expr = expr.replace(/\bpi\b/gi, 'PI');
  expr = expr.replace(/π/g, 'PI');

  // Normalize symbols
  expr = expr.replace(/×/g, '*').replace(/÷/g, '/');

  // Percent -> (n/100)
  expr = expr.replace(/(\d+(\.\d+)?)%/g, '($1/100)');

  // ^ -> **
  expr = expr.replace(/\^/g, '**');

  // Constants
  expr = expr.replace(/\bPI\b/g, 'Math.PI');
  expr = expr.replace(/\be\b/g, 'Math.E');

  // Factorials: (expr)! or 5!
  expr = expr.replace(/(\([^\)]+\))\!/g, 'fact($1)');
  expr = expr.replace(/(\d+(\.\d+)?)\!/g, 'fact($1)');

  // Map common functions to Math.* (and pow)
  const fnMap = {
    'sqrt': 'Math.sqrt',
    'abs': 'Math.abs',
    'ln': 'Math.log',
    'log': 'Math.log10',
    'exp': 'Math.exp',
    'pow': 'Math.pow'
  };
  Object.keys(fnMap).forEach(key => {
    const re = new RegExp('\\b' + key + '\\s*\\(', 'g');
    expr = expr.replace(re, fnMap[key] + '(');
  });

  // Trig functions -> Math.*
  const trigFns = ['sin', 'cos', 'tan', 'asin', 'acos', 'atan'];
  trigFns.forEach(fn => {
    const re = new RegExp('\\b' + fn + '\\s*\\(', 'g');
    expr = expr.replace(re, `Math.${fn}(`);
  });

  if (useDegrees) {
    // Convert sin/cos/tan args to radians:
    // Math.sin(<arg>) -> Math.sin((<arg>) * Math.PI / 180)
    expr = expr.replace(/Math\.(sin|cos|tan)\(\s*([^\)]*?)\s*\)/g, (m, fn, arg) => {
      return `Math.${fn}((${arg}) * Math.PI / 180)`;
    });

    // Convert inverse trig results to degrees:
    // Math.asin(x) -> (Math.asin(x) * 180 / Math.PI)
    expr = expr.replace(/Math\.(asin|acos|atan)\(\s*([^\)]*?)\s*\)/g, (m, fn, arg) => {
      return `(Math.${fn}(${arg}) * 180 / Math.PI)`;
    });
  }

  // Replace Math.log10 with fallback function _log10
  expr = expr.replace(/Math\.log10\(/g, '_log10(');

  return expr;
}

/* ---------- Helpers ---------- */
function fact(n) {
  n = Math.floor(Number(n));
  if (!Number.isFinite(n)) return NaN;
  if (n < 0) return NaN;
  if (n === 0 || n === 1) return 1;
  let res = 1;
  for (let i = 2; i <= n; i++) res *= i;
  return res;
}

function _log10(x) {
  return Math.log(x) / Math.LN10;
}

/* ---------- Safe evaluation ---------- */
function safeEval(expr) {
  // Disallow suspicious characters
  const unsafePattern = /[^\dA-Za-z\s\.\+\-\*\/\^\%\(\),!<>=\[\]]/;
  if (unsafePattern.test(expr) || /[;`\\]/.test(expr)) {
    throw new Error('Invalid characters in expression');
  }
  // Evaluate in a constrained function scope
  const fn = new Function('fact', '_log10', 'Math', `return (${expr});`);
  return fn(fact, _log10, Math);
}

/* ---------- UI helpers ---------- */
function appendToDisplay(value) {
  if (value === 'pi') value = 'π';
  if (value === 'e') value = 'e';
  display.value += value;
}

function clearDisplay() { display.value = ''; }
function deleteLast() { display.value = display.value.slice(0, -1); }

function formatResult(res) {
  if (typeof res === 'number' && !Number.isFinite(res)) return 'Infinity';
  if (typeof res === 'number' && Math.abs(res) >= 1e9) return res.toExponential(6);
  if (typeof res === 'number' && Number.isInteger(res)) return res.toString();
  if (typeof res === 'number') return parseFloat(res.toFixed(8)).toString();
  return String(res);
}

/* ---------- Evaluate ---------- */
function evaluateExpression() {
  const raw = display.value;
  if (!raw.trim()) return;

  try {
    const transformed = transformExpression(raw, degMode);
    const result = safeEval(transformed);
    const formatted = formatResult(result);
    display.value = formatted;
    lastAnswer = formatted;
    addToHistory(raw, formatted);
  } catch (err) {
    showErrorFeedback();
    display.value = 'Error';
    console.error('Calc error:', err);
    // Also log the transformed expression to help debugging
    try { console.info('Transformed expression:', transformExpression(raw, degMode)); } catch (e) {}
  }
}

/* ---------- History ---------- */
function addToHistory(expr, res) {
  history.unshift({ expr, res });
  if (history.length > 40) history.pop();
  renderHistory();
}
function renderHistory() {
  historyList.innerHTML = '';
  history.forEach(item => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="expr">${escapeHtml(item.expr)}</span><span class="res">${escapeHtml(item.res)}</span>`;
    li.addEventListener('click', () => {
      display.value = item.expr;
      display.focus();
    });
    historyList.appendChild(li);
  });
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Actions & keyboard ---------- */
keysGrid.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  handleAction(action);
});

function insertFunction(fnName) {
  const insertion = `${fnName}()`;
  const cursorPos = display.selectionStart || display.value.length;
  const currentValue = display.value || '';
  display.value = currentValue.slice(0, cursorPos) + insertion + currentValue.slice(cursorPos);
  const newPos = cursorPos + fnName.length + 1;
  display.setSelectionRange(newPos, newPos);
  display.focus();
}

function handleAction(action) {
  switch (action) {
    case 'clear': clearDisplay(); break;
    case 'del': deleteLast(); break;
    case '=': evaluateExpression(); break;
    case 'ans': appendToDisplay(lastAnswer); break;
    default:
      const fnNames = ['sin','cos','tan','asin','acos','atan','sqrt','log','ln','abs','exp','pow','exp'];
      if (fnNames.includes(action)) {
        insertFunction(action);
      } else {
        appendToDisplay(action);
      }
      break;
  }
}

document.addEventListener('keydown', (e) => {
  const allowedKeys = '0123456789.+-*/()%^';
  if (allowedKeys.includes(e.key)) {
    appendToDisplay(e.key);
    e.preventDefault();
    return;
  }
  if (e.key === 'Enter') { evaluateExpression(); e.preventDefault(); return; }
  if (e.key === 'Backspace') { deleteLast(); e.preventDefault(); return; }
  if (e.key === 'Escape') { clearDisplay(); e.preventDefault(); return; }

  // allow letters; do a simple autocomplete when full function typed
  if (/^[a-zA-Z]$/.test(e.key)) {
    const prior = display.value.slice(0, display.selectionStart || display.value.length);
    const currentWord = (prior.match(/[a-zA-Z]+$/) || [''])[0] + e.key;
    const fnNames = ['sin','cos','tan','asin','acos','atan','sqrt','log','ln','abs','exp','pow'];
    if (fnNames.includes(currentWord)) {
      const cursorPos = display.selectionStart || display.value.length;
      // remove typed letters
      display.value = display.value.slice(0, cursorPos - currentWord.length) + display.value.slice(cursorPos);
      insertFunction(currentWord);
      e.preventDefault();
      return;
    }
    appendToDisplay(e.key);
  }
});

/* deg/rad toggle */
modeToggle.addEventListener('click', () => {
  degMode = !degMode;
  modeToggle.setAttribute('aria-pressed', String(degMode));
  modeToggle.textContent = degMode ? 'Deg' : 'Rad';
});

/* clear history */
clearHistoryBtn.addEventListener('click', () => {
  history = [];
  renderHistory();
});

/* error feedback */
function showErrorFeedback() {
  display.classList.add('error');
  setTimeout(() => display.classList.remove('error'), 700);
}

/* init */
clearDisplay();
renderHistory();