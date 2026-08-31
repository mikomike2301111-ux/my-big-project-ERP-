/**
 * Ensures src/mobile-polish.css is imported after styles.css in main.jsx.
 * Does not change layout structure — only stacking + mobile spacing.
 */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const mainPath = path.join(root, 'src', 'main.jsx');
const polishPath = path.join(root, 'src', 'mobile-polish.css');

if (!fs.existsSync(polishPath)) {
  console.warn('[mobile-polish] missing mobile-polish.css');
  process.exit(0);
}
if (!fs.existsSync(mainPath)) {
  console.warn('[mobile-polish] missing main.jsx');
  process.exit(0);
}
let m = fs.readFileSync(mainPath, 'utf8');
if (m.includes("mobile-polish.css")) {
  console.log('[mobile-polish] already imported');
} else if (m.includes("import './styles.css'")) {
  m = m.replace("import './styles.css';", "import './styles.css';\nimport './mobile-polish.css';");
  fs.writeFileSync(mainPath, m);
  console.log('[mobile-polish] import added');
} else if (m.includes('import \"./styles.css\"')) {
  m = m.replace('import \"./styles.css\";', 'import \"./styles.css\";\nimport \"./mobile-polish.css\";');
  fs.writeFileSync(mainPath, m);
  console.log('[mobile-polish] import added (double quotes)');
} else {
  console.warn('[mobile-polish] could not find styles.css import');
}
