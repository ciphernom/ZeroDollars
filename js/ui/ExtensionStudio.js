/* js/ui/ExtensionStudio.js - v2 with Projects & AssemblyScript */
import { Utils } from '../utils/index.js';
import { Toaster } from './toast-manager.js';
import { ZDScriptCompiler } from '../services/ZDScriptCompiler.js';
import { zdscriptStreamParser, ZDSCRIPT_TEMPLATES } from '../services/ZDScriptLanguage.js';

// Local Bundle Import
import { 
    EditorView, EditorState, basicSetup, keymap, javascript, indentWithTab, oneDark 
} from '../../lib/editor.bundle.js';

export class ExtensionStudio {
    constructor(app) {
        this.app = app;
        this.root = document.getElementById('studio-modal');
        this._zdscript = new ZDScriptCompiler();
        // ═══════════════════════════════════════════════════════════════
        // PROJECT-BASED FILE SYSTEM (v2)
        // ═══════════════════════════════════════════════════════════════
        const saved = localStorage.getItem('studio_projects_v2');
        if (saved) {
            const data = JSON.parse(saved);
            this.projects = data.projects;
            this.activeProject = data.activeProject;
        } else {
            // Migrate from old format or create default
            const oldFiles = localStorage.getItem('studio_files');
            if (oldFiles) {
                this.projects = {
                    'migrated-project': {
                        name: 'Migrated Project',
                        created: Date.now(),
                        files: JSON.parse(oldFiles)
                    }
                };
                this.activeProject = 'migrated-project';
            } else {
                this.projects = {
                    'demo-extension': this._getDefaultProjectTemplate('Demo Extension')
                };
                this.activeProject = 'demo-extension';
            }
        }
        
        this.activeFile = Object.keys(this._getCurrentFiles())[0] || 'main.js';
        this.openTabs = [this.activeFile];
        this.editor = null;
        this.devKey = localStorage.getItem('dev_nsec_v1') || null;
        this.unsavedChanges = new Set();
        this.isMaximized = false;
        
        // Context menu state
        this.contextMenu = null;
        this.contextTarget = null;
        this.contextType = null; // 'project' or 'file'

        this._injectDialogs();
        this._bindEvents();
        this._renderFileTree();
        this._renderTabs();
        this._initEditor();
        this._updateIdentityUI();
        this._updateStatusBar();
    }

    // ─────────────────────────────────────────────────────────────
    // PROJECT MANAGEMENT (v2)
    // ─────────────────────────────────────────────────────────────
    
    _getDefaultProjectTemplate(name) {
        return {
            name: name,
            created: Date.now(),
            files: {
                'main.js': { 
                    content: this._getDefaultJsTemplate(), 
                    language: 'javascript' 
                },
                'logic.zds': { 
                    content: this._getDefaultZDScriptTemplate(), 
                    language: 'zdscript' 
                },
                'README.md': { 
                    content: this._getDefaultReadme(), 
                    language: 'markdown' 
                }
            }
        };
    }
    
   _getDefaultZDScriptTemplate() {
    return `// ============================================================================
// ZDScript Comprehensive Demo
// ============================================================================
// This demonstrates all ZDScript features:
//   ✅ Classes with constructors
//   ✅ Inheritance (extends, super)
//   ✅ Virtual methods & polymorphism
//   ✅ Abstract classes
//   ✅ Static methods
//   ✅ External imports (@external)
//   ✅ All operators and control flow
// ============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// EXTERNAL IMPORTS - ZeroDollars API
// ─────────────────────────────────────────────────────────────────────────────

@external("zd", "get_total_balance")
declare function getTotalBalance(): i32;

@external("zd", "get_account_count")
declare function getAccountCount(): i32;

@external("zd", "get_envelope_count")
declare function getEnvelopeCount(): i32;

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY CLASS - Static methods
// ─────────────────────────────────────────────────────────────────────────────

class MathUtil {
    static abs(n: i32): i32 {
        if (n < 0) return 0 - n;
        return n;
    }
    
    static clamp(val: i32, minVal: i32, maxVal: i32): i32 {
        if (val < minVal) return minVal;
        if (val > maxVal) return maxVal;
        return val;
    }
    
    static max(a: i32, b: i32): i32 {
        if (a > b) return a;
        return b;
    }
    
    static min(a: i32, b: i32): i32 {
        if (a < b) return a;
        return b;
    }
    
    static percentage(part: i32, total: i32): i32 {
        if (total == 0) return 0;
        return (part * 100) / total;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ABSTRACT BASE CLASS - Polymorphism demo
// ─────────────────────────────────────────────────────────────────────────────

abstract class Metric {
    protected name: i32;
    protected weight: i32;
    protected lastValue: i32;
    
    constructor(n: i32, w: i32) {
        this.name = n;
        this.weight = w;
        this.lastValue = 0;
    }
    
    // Abstract method - must be implemented by subclasses
    abstract calculate(): i32;
    
    // Virtual method - can be overridden
    virtual getWeight(): i32 {
        return this.weight;
    }
    
    // Concrete method using abstract method
    getWeightedScore(): i32 {
        this.lastValue = this.calculate();
        return (this.lastValue * this.getWeight()) / 100;
    }
    
    getLast(): i32 {
        return this.lastValue;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCRETE IMPLEMENTATIONS - Inheritance demo
// ─────────────────────────────────────────────────────────────────────────────

class BalanceMetric extends Metric {
    constructor() {
        super(1, 40);  // name=1, weight=40%
    }
    
    override calculate(): i32 {
        let balance: i32 = getTotalBalance();
        // Score: 0-100 based on balance
        if (balance < 0) return 0;
        if (balance > 1000000) return 100;  // $10,000+
        return balance / 10000;  // 1 point per $100
    }
}

class AccountMetric extends Metric {
    constructor() {
        super(2, 30);  // name=2, weight=30%
    }
    
    override calculate(): i32 {
        let count: i32 = getAccountCount();
        // Score: 0-100 based on account diversity
        if (count >= 5) return 100;
        return count * 20;
    }
}

class EnvelopeMetric extends Metric {
    constructor() {
        super(3, 30);  // name=3, weight=30%
    }
    
    override calculate(): i32 {
        let count: i32 = getEnvelopeCount();
        // Score: 0-100 based on budget organization
        if (count >= 10) return 100;
        return count * 10;
    }
    
    // Override weight for demo
    override getWeight(): i32 {
        // Envelopes are extra important!
        return this.weight + 5;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ANALYZER CLASS - Composition & orchestration
// ─────────────────────────────────────────────────────────────────────────────

class BudgetAnalyzer {
    private balanceMetric: BalanceMetric;
    private accountMetric: AccountMetric;
    private envelopeMetric: EnvelopeMetric;
    private totalScore: i32;
    
    constructor() {
        this.balanceMetric = new BalanceMetric();
        this.accountMetric = new AccountMetric();
        this.envelopeMetric = new EnvelopeMetric();
        this.totalScore = 0;
    }
    
    analyze(): i32 {
        let score: i32 = 0;
        
        // Polymorphic calls - each metric calculates differently
        score = score + this.balanceMetric.getWeightedScore();
        score = score + this.accountMetric.getWeightedScore();
        score = score + this.envelopeMetric.getWeightedScore();
        
        this.totalScore = MathUtil.clamp(score, 0, 100);
        return this.totalScore;
    }
    
    getBalanceScore(): i32 {
        return this.balanceMetric.getLast();
    }
    
    getAccountScore(): i32 {
        return this.accountMetric.getLast();
    }
    
    getEnvelopeScore(): i32 {
        return this.envelopeMetric.getLast();
    }
    
    getTotalScore(): i32 {
        return this.totalScore;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// BASIC MATH EXPORTS - For JS compatibility
// ─────────────────────────────────────────────────────────────────────────────

export function add(a: i32, b: i32): i32 {
    return a + b;
}

export function multiply(a: i32, b: i32): i32 {
    return a * b;
}

export function subtract(a: i32, b: i32): i32 {
    return a - b;
}

export function divide(a: i32, b: i32): i32 {
    if (b == 0) return 0;
    return a / b;
}

export function abs(n: i32): i32 {
    return MathUtil.abs(n);
}

export function max(a: i32, b: i32): i32 {
    return MathUtil.max(a, b);
}

export function min(a: i32, b: i32): i32 {
    return MathUtil.min(a, b);
}

export function clamp(val: i32, minVal: i32, maxVal: i32): i32 {
    return MathUtil.clamp(val, minVal, maxVal);
}

export function percentage(part: i32, total: i32): i32 {
    return MathUtil.percentage(part, total);
}

export function months_to_goal(current: i32, goal: i32, monthly: i32): i32 {
    let remaining: i32 = goal - current;
    if (remaining <= 0) return 0;
    if (monthly <= 0) return 0 - 1;
    return (remaining + monthly - 1) / monthly;
}

export function emergency_fund_target(monthlyExpenses: i32): i32 {
    return monthlyExpenses * 3;
}

// Legacy compatibility
export function calculate_health_score(netWorth: i32, budgeted: i32, negEnvelopes: i32): i32 {
    let score: i32 = 50;
    if (netWorth > 0) score = score + 20;
    if (netWorth > 1000000) score = score + 10;
    if (budgeted >= 0) score = score + 10;
    if (negEnvelopes == 0) score = score + 10;
    return MathUtil.clamp(score, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// OOP EXPORTS - Analyzer instance
// ─────────────────────────────────────────────────────────────────────────────

let analyzer: BudgetAnalyzer;

export function initAnalyzer(): i32 {
    analyzer = new BudgetAnalyzer();
    return 1;
}

export function runAnalysis(): i32 {
    return analyzer.analyze();
}

export function getBalanceScore(): i32 {
    return analyzer.getBalanceScore();
}

export function getAccountScore(): i32 {
    return analyzer.getAccountScore();
}

export function getEnvelopeScore(): i32 {
    return analyzer.getEnvelopeScore();
}

export function getTotalScore(): i32 {
    return analyzer.getTotalScore();
}
`;
}
    
    _getCurrentProject() {
        return this.projects[this.activeProject];
    }
    
    _getCurrentFiles() {
        return this._getCurrentProject()?.files || {};
    }
    
    // Compatibility alias for old code
    get files() {
        return this._getCurrentFiles();
    }
    
    createProject(name) {
        const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'project';
        if (this.projects[id]) {
            Toaster.show('Project already exists', 'error');
            return false;
        }
        
        this.projects[id] = this._getDefaultProjectTemplate(name);
        this.activeProject = id;
        this.activeFile = 'main.js';
        this.openTabs = ['main.js'];
        this.unsavedChanges.clear();
        
        this._saveProjects();
        this._renderFileTree();
        this._renderTabs();
        this._initEditor();
        this._log(`Created project: ${name}`, 'success');
        Toaster.show(`Created project: ${name}`, 'success');
        return true;
    }
    
    switchProject(projectId) {
        if (!this.projects[projectId]) return;
        if (projectId === this.activeProject) return;
        
        // Save current file content first
        this._saveCurrentFileContent();
        
        // Check for unsaved changes
        if (this.unsavedChanges.size > 0) {
            if (!confirm('You have unsaved changes. Switch anyway?')) return;
        }
        
        this.activeProject = projectId;
        const files = Object.keys(this._getCurrentFiles());
        this.activeFile = files[0] || 'main.js';
        this.openTabs = [this.activeFile];
        this.unsavedChanges.clear();
        
        this._saveProjects();
        this._renderFileTree();
        this._renderTabs();
        this._initEditor();
        this._updateStatusBar();
        this._log(`Switched to project: ${this._getCurrentProject().name}`, 'info');
    }
    
    renameProject(projectId, newName) {
        if (!this.projects[projectId]) return;
        this.projects[projectId].name = newName;
        this._saveProjects();
        this._renderFileTree();
        Toaster.show(`Renamed to: ${newName}`, 'success');
    }
    
    deleteProject(projectId) {
        if (Object.keys(this.projects).length <= 1) {
            Toaster.show('Cannot delete the only project', 'error');
            return;
        }
        
        const name = this.projects[projectId].name;
        delete this.projects[projectId];
        
        // Switch to another project
        const remaining = Object.keys(this.projects);
        this.activeProject = remaining[0];
        this.activeFile = Object.keys(this._getCurrentFiles())[0] || 'main.js';
        this.openTabs = [this.activeFile];
        this.unsavedChanges.clear();
        
        this._saveProjects();
        this._renderFileTree();
        this._renderTabs();
        this._initEditor();
        this._log(`Deleted project: ${name}`, 'warning');
        Toaster.show(`Deleted project: ${name}`, 'info');
    }
    
    duplicateProject(projectId) {
        const original = this.projects[projectId];
        if (!original) return;
        
        let newName = original.name + ' Copy';
        let newId = projectId + '-copy';
        let counter = 1;
        while (this.projects[newId]) {
            counter++;
            newId = `${projectId}-copy-${counter}`;
            newName = `${original.name} Copy ${counter}`;
        }
        
        this.projects[newId] = {
            name: newName,
            created: Date.now(),
            files: JSON.parse(JSON.stringify(original.files))
        };
        
        this._saveProjects();
        this._renderFileTree();
        this._log(`Duplicated project: ${newName}`, 'success');
        Toaster.show(`Created: ${newName}`, 'success');
    }
    
    _saveProjects() {
        localStorage.setItem('studio_projects_v2', JSON.stringify({
            projects: this.projects,
            activeProject: this.activeProject
        }));
    }
    
    _saveCurrentFileContent() {
        if (this.editor && this.activeFile) {
            const files = this._getCurrentFiles();
            if (files[this.activeFile]) {
                files[this.activeFile].content = this.editor.state.doc.toString();
            }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // DEFAULT PROJECT TEMPLATES
    // ─────────────────────────────────────────────────────────────
    
    _getDefaultProject() {
        // Legacy compatibility - returns files for current project
        return this._getCurrentFiles();
    }
    
 _getDefaultReadme() {
    return `# ZDScript Demo Extension

                A comprehensive demo of **ZDScript** and the ZeroDollars Plugin System.

                ## What's Demonstrated

                ### ZDScript Features (logic.zds)
                - 🏗️ **Classes** - \`BudgetAnalyzer\`, \`MathUtil\`
                - 🔗 **Inheritance** - \`BalanceMetric extends Metric\`
                - 🎭 **Abstract Classes** - \`abstract class Metric\`
                - ✨ **Virtual Methods** - \`virtual getWeight()\`, \`override calculate()\`
                - 🔧 **Static Methods** - \`MathUtil.clamp()\`, \`MathUtil.abs()\`
                - 🔌 **External Imports** - \`@external("zd", "get_total_balance")\`
                - 📦 **Exports** - Functions callable from JavaScript

                ### Plugin System Features (main.js)
                - ⚡ **WASM Integration** - Load and call ZDScript-compiled functions
                - 📊 **Widgets** - 3 report widgets showing live data
                - 🎣 **Hooks** - React to income/spending events
                - 🔄 **Filters** - Modify transaction data before save

                ## Build & Run

                1. Click ⚡ **Build & Run**
                2. Open the **Reports** tab
                3. See 3 new widgets powered by ZDScript WASM!

                ## How It Works

                \`\`\`
                logic.zds  →  ZDScript Compiler  →  WAT  →  WABT  →  WASM
                                (in browser!)
                \`\`\`

                The \`BudgetAnalyzer\` class creates 3 metric objects that each calculate
                a score differently. When \`runAnalysis()\` is called, it uses **polymorphism**
                to call the correct \`calculate()\` method for each metric type!

                ## Quick ZDScript Reference

                \`\`\`typescript
                // Import external functions
                @external("zd", "get_total_balance")
                declare function getTotalBalance(): i32;

                // Abstract base class
                abstract class Metric {
                    abstract calculate(): i32;
                    virtual getWeight(): i32 { return 100; }
                }

                // Concrete implementation
                class MyMetric extends Metric {
                    override calculate(): i32 {
                        return getTotalBalance() / 100;
                    }
                }

                // Export to JavaScript
                export function getScore(): i32 {
                    let m: MyMetric = new MyMetric();
                    return m.calculate();
                }
                \`\`\`
                `;
        }
    
    _getDefaultAssemblyScriptTemplate() {
        return `// ============================================================================
// AssemblyScript Reference
// ============================================================================
// AssemblyScript is a TypeScript-like language that compiles to WebAssembly.
// Much easier to write than raw WAT!
//
// ⚠️ NOTE: Browser-based compilation is not yet supported.
// To use AssemblyScript:
//   1. Install: npm install -g assemblyscript
//   2. Compile: asc logic.ts -o logic.wasm -O3
//   3. Convert to base64 and paste into main.js wasmBinary
//
// For now, use logic.wat which compiles in-browser via WABT.
// ============================================================================

// Basic math functions
export function add(a: i32, b: i32): i32 {
    return a + b;
}

export function multiply(a: i32, b: i32): i32 {
    return a * b;
}

export function subtract(a: i32, b: i32): i32 {
    return a - b;
}

export function divide(a: i32, b: i32): i32 {
    if (b == 0) return 0;
    return a / b;
}

export function abs(n: i32): i32 {
    return n < 0 ? -n : n;
}

export function max(a: i32, b: i32): i32 {
    return a > b ? a : b;
}

export function min(a: i32, b: i32): i32 {
    return a < b ? a : b;
}

export function clamp(val: i32, minVal: i32, maxVal: i32): i32 {
    if (val < minVal) return minVal;
    if (val > maxVal) return maxVal;
    return val;
}

// Financial health score calculation
export function calculate_health_score(
    netWorth: i32, 
    budgeted: i32, 
    negativeEnvelopes: i32
): i32 {
    let score: i32 = 50;
    
    if (netWorth > 0) score += 20;
    if (netWorth > 1000000) score += 10;  // > $10,000
    if (budgeted >= 0) score += 10;
    if (negativeEnvelopes == 0) score += 10;
    
    return clamp(score, 0, 100);
}

export function percentage(part: i32, total: i32): i32 {
    if (total == 0) return 0;
    return (part * 100) / total;
}

export function months_to_goal(current: i32, goal: i32, monthly: i32): i32 {
    const remaining = goal - current;
    if (remaining <= 0) return 0;
    if (monthly <= 0) return -1;
    return (remaining + monthly - 1) / monthly;
}

export function emergency_fund_target(monthlyExpenses: i32): i32 {
    return monthlyExpenses * 3;
}
`;
    }
    
    _getDefaultJsTemplate() { 
    return `/* ============================================================================
   ZDSCRIPT + PLUGIN SYSTEM DEMO
   
   This demonstrates:
   ✅ WASM - Functions compiled from ZDScript (logic.zds)
   ✅ OOP in WASM - Classes, inheritance, polymorphism
   ✅ Widgets - 3 report widgets
   ✅ Hooks - React to transactions
   ✅ Filters - Modify data before save
   
   BUILD & RUN, then:
   1. Check Reports tab for widgets
   2. Log income/spending to see hooks fire
   3. Watch console for WASM calculations
============================================================================ */

export const plugin = {
    meta: {
        id: "zdscript-demo",
        title: "ZDScript Demo Extension",
        version: "1.0.0",
        description: "Demonstrates ZDScript WASM + Plugin API"
    },
    
    wasmBinary: "",
    _wasm: null,
    
    async init(ctx) {
        const { state, utils, toast, wasm } = ctx;
        const Utils = utils;
        const self = this;
        
        console.log("🚀 === ZDSCRIPT DEMO STARTING ===");
        
        // ════════════════════════════════════════════════════════════════
        // 1. WASM INITIALIZATION
        // ════════════════════════════════════════════════════════════════
        
        if (this.wasmBinary && wasm) {
            try {
                this._wasm = await wasm.load(this.wasmBinary);
                
                console.log("✅ WASM MODULE LOADED (compiled from ZDScript!)");
                console.log("   Exports:", Object.keys(this._wasm.exports));
                
                // Test basic math functions
                console.log("\\n📊 BASIC MATH (ZDScript → WASM):");
                console.log("   add(100, 250) =", this._wasm.exports.add(100, 250));
                console.log("   multiply(12, 8) =", this._wasm.exports.multiply(12, 8));
                console.log("   subtract(500, 123) =", this._wasm.exports.subtract(500, 123));
                console.log("   divide(100, 4) =", this._wasm.exports.divide(100, 4));
                console.log("   abs(-42) =", this._wasm.exports.abs(-42));
                console.log("   clamp(150, 0, 100) =", this._wasm.exports.clamp(150, 0, 100));
                console.log("   percentage(25, 100) =", this._wasm.exports.percentage(25, 100));
                
                // Test OOP features - the analyzer uses classes, inheritance, polymorphism
                console.log("\\n🏗️ OOP FEATURES (Classes, Inheritance, Polymorphism):");
                this._wasm.exports.initAnalyzer();
                const totalScore = this._wasm.exports.runAnalysis();
                console.log("   initAnalyzer() - Created BudgetAnalyzer instance");
                console.log("   runAnalysis() - Polymorphic calls to 3 metric subclasses");
                console.log("   → Balance Score:", this._wasm.exports.getBalanceScore());
                console.log("   → Account Score:", this._wasm.exports.getAccountScore());
                console.log("   → Envelope Score:", this._wasm.exports.getEnvelopeScore());
                console.log("   → Total Score:", totalScore, "/100");
                
            } catch (e) {
                console.error("❌ WASM load failed:", e.message);
            }
        }
        
        // ════════════════════════════════════════════════════════════════
        // 2. WIDGET: ZDScript Health Dashboard
        // ════════════════════════════════════════════════════════════════
        
        const HealthWidget = {
            id: 'widget-zds-health',
            title: '💪 Budget Health (ZDScript OOP)',
            order: 5,
            collapsible: true,
            gridSpan: 1,
            
            render: (appState) => {
                const container = Utils.createElement('div', { style: { padding: '15px', textAlign: 'center' } });
                
                let score = 50, balScore = 0, accScore = 0, envScore = 0;
                let wasmUsed = false;
                
                if (self._wasm?.exports?.initAnalyzer) {
                    self._wasm.exports.initAnalyzer();
                    score = self._wasm.exports.runAnalysis();
                    balScore = self._wasm.exports.getBalanceScore();
                    accScore = self._wasm.exports.getAccountScore();
                    envScore = self._wasm.exports.getEnvelopeScore();
                    wasmUsed = true;
                }
                
                const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';
                const label = score >= 70 ? 'Excellent' : score >= 40 ? 'Good' : 'Needs Work';
                
                // Score circle
                const circle = Utils.createElement('div', {
                    style: {
                        width: '90px', height: '90px', borderRadius: '50%',
                        border: \`4px solid \${color}\`, margin: '0 auto 10px',
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center'
                    }
                }, [
                    Utils.createElement('div', { 
                        textContent: score, 
                        style: { fontSize: '2rem', fontWeight: '700', color, lineHeight: '1' } 
                    }),
                    Utils.createElement('div', { 
                        textContent: '/100', 
                        style: { fontSize: '0.7rem', color: 'var(--text-secondary)' } 
                    })
                ]);
                
                container.appendChild(circle);
                container.appendChild(Utils.createElement('div', { 
                    textContent: label, 
                    style: { fontWeight: '600', color, marginBottom: '8px' } 
                }));
                
                // Breakdown
                const breakdown = Utils.createElement('div', {
                    style: { fontSize: '0.8rem', textAlign: 'left', marginTop: '10px', 
                             padding: '10px', background: 'var(--bg-primary)', borderRadius: '8px' }
                });
                breakdown.innerHTML = \`
                    <div style="margin-bottom: 5px; font-weight: 600;">Score Breakdown:</div>
                    <div>📊 Balance: \${balScore}/100 (40% weight)</div>
                    <div>🏦 Accounts: \${accScore}/100 (30% weight)</div>
                    <div>📁 Envelopes: \${envScore}/100 (35% weight)</div>
                    <div style="margin-top: 8px; font-style: italic; color: var(--text-secondary);">
                        \${wasmUsed ? '⚡ Calculated via ZDScript WASM' : '📝 JS Fallback'}
                    </div>
                \`;
                container.appendChild(breakdown);
                
                return container;
            }
        };
        
        // ════════════════════════════════════════════════════════════════
        // 3. WIDGET: WASM Calculator
        // ════════════════════════════════════════════════════════════════
        
        const CalcWidget = {
            id: 'widget-zds-calc',
            title: '🧮 WASM Calculator',
            order: 6,
            collapsible: true,
            gridSpan: 1,
            
            render: (appState) => {
                const container = Utils.createElement('div', { style: { padding: '10px' } });
                
                if (!self._wasm) {
                    container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 20px;">⚠️ WASM not loaded</div>';
                    return container;
                }
                
                const calcs = [
                    { label: 'add(1234, 5678)', result: self._wasm.exports.add(1234, 5678) },
                    { label: 'multiply(42, 42)', result: self._wasm.exports.multiply(42, 42) },
                    { label: 'percentage(75, 300)', result: self._wasm.exports.percentage(75, 300) + '%' },
                    { label: 'clamp(999, 0, 100)', result: self._wasm.exports.clamp(999, 0, 100) },
                    { label: 'months_to_goal(0, 12000, 1000)', result: self._wasm.exports.months_to_goal(0, 12000, 1000) + ' mo' },
                    { label: 'emergency_fund_target(3000)', result: '$' + (self._wasm.exports.emergency_fund_target(3000) / 100) },
                ];
                
                calcs.forEach(calc => {
                    const row = Utils.createElement('div', {
                        style: { display: 'flex', justifyContent: 'space-between', padding: '6px 0', 
                                 borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }
                    }, [
                        Utils.createElement('code', { textContent: calc.label, style: { color: 'var(--text-secondary)' } }),
                        Utils.createElement('strong', { textContent: calc.result, style: { color: 'var(--accent)' } })
                    ]);
                    container.appendChild(row);
                });
                
                return container;
            }
        };
        
        // ════════════════════════════════════════════════════════════════
        // 4. WIDGET: ZDScript Feature Showcase
        // ════════════════════════════════════════════════════════════════
        
        const FeaturesWidget = {
            id: 'widget-zds-features',
            title: '📚 ZDScript Features Used',
            order: 7,
            collapsible: true,
            gridSpan: 'full',
            
            render: (appState) => {
                const container = Utils.createElement('div', { style: { padding: '15px' } });
                
                container.innerHTML = \`
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px;">
                        <div style="background: var(--bg-primary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; margin-bottom: 8px;">🏗️ Classes</div>
                            <code style="font-size: 0.75rem; color: var(--text-secondary);">
                                class BudgetAnalyzer {<br>
                                &nbsp;&nbsp;private score: i32;<br>
                                &nbsp;&nbsp;constructor() { ... }<br>
                                }
                            </code>
                        </div>
                        <div style="background: var(--bg-primary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; margin-bottom: 8px;">🔗 Inheritance</div>
                            <code style="font-size: 0.75rem; color: var(--text-secondary);">
                                class BalanceMetric extends Metric {<br>
                                &nbsp;&nbsp;constructor() {<br>
                                &nbsp;&nbsp;&nbsp;&nbsp;super(1, 40);<br>
                                &nbsp;&nbsp;}<br>
                                }
                            </code>
                        </div>
                        <div style="background: var(--bg-primary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; margin-bottom: 8px;">🎭 Polymorphism</div>
                            <code style="font-size: 0.75rem; color: var(--text-secondary);">
                                abstract class Metric {<br>
                                &nbsp;&nbsp;abstract calculate(): i32;<br>
                                &nbsp;&nbsp;virtual getWeight(): i32<br>
                                }
                            </code>
                        </div>
                        <div style="background: var(--bg-primary); padding: 12px; border-radius: 8px;">
                            <div style="font-weight: 600; margin-bottom: 8px;">🔌 External Imports</div>
                            <code style="font-size: 0.75rem; color: var(--text-secondary);">
                                @external("zd", "get_total_balance")<br>
                                declare function getTotalBalance(): i32;
                            </code>
                        </div>
                    </div>
                    <div style="margin-top: 15px; padding: 10px; background: var(--bg-primary); border-radius: 8px; font-size: 0.85rem;">
                        <strong>How it works:</strong> ZDScript compiles to WAT → WASM entirely in-browser. 
                        The analyzer creates 3 Metric subclasses that each override <code>calculate()</code>. 
                        Calling <code>runAnalysis()</code> invokes all 3 polymorphically via vtable dispatch!
                    </div>
                \`;
                
                return container;
            }
        };
        
        // Register widgets
        if (window.app?.plugins) {
            window.app.plugins.registerInternal(HealthWidget.id, HealthWidget);
            window.app.plugins.registerInternal(CalcWidget.id, CalcWidget);
            window.app.plugins.registerInternal(FeaturesWidget.id, FeaturesWidget);
            console.log("\\n✅ REGISTERED 3 WIDGETS - Check Reports tab!");
        }
        
        // ════════════════════════════════════════════════════════════════
        // 5. HOOKS - React to app events
        // ════════════════════════════════════════════════════════════════
        
        console.log("\\n🎉 === ZDSCRIPT DEMO READY ===");
        console.log("   → 3 widgets in Reports tab");
        console.log("   → Hooks listening for transactions");
        console.log("   → Edit logic.zds to modify WASM behavior!\\n");
        
        toast("ZDScript demo loaded! Check Reports tab.", "success");
    },
    
    hooks: {
        'transaction:income_logged': (data, ctx) => {
            console.log("💰 [HOOK] Income logged:", ctx.utils.formatCurrency(data.amount));
            if (data.amount >= 50000) {
                ctx.toast("🎉 Nice income! +$" + (data.amount / 100).toFixed(2), "success");
            }
        },
        'transaction:spend_logged': (data, ctx) => {
            console.log("💸 [HOOK] Spending logged:", ctx.utils.formatCurrency(Math.abs(data.amount)));
        }
    },
    
    filters: {
        'transaction:before_income': (data, ctx) => {
            // Auto-tag income notes
            if (data.note && !data.note.includes('[ZDS]')) {
                data.note = data.note + ' [ZDS]';
            }
            return data;
        }
    },
    
    destroy() {
        if (this._wasm?.unload) this._wasm.unload();
        this._wasm = null;
    }
};`; 
}
    
    _getDefaultWatTemplate() { 
        return `;; ============================================================================
;; WASM MODULE - Financial Calculations
;; 
;; This module provides fast, compiled functions that can be called from JS.
;; The Extension Studio compiles this to binary during Build.
;; ============================================================================

(module
  ;; Memory for advanced operations (1 page = 64KB)
  (memory (export "memory") 1)

  ;; ════════════════════════════════════════════════════════════════════════
  ;; BASIC MATH
  ;; ════════════════════════════════════════════════════════════════════════

  ;; Add two numbers: add(10, 20) => 30
  (func (export "add") (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add
  )

  ;; Multiply: multiply(5, 7) => 35
  (func (export "multiply") (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.mul
  )

  ;; Subtract: subtract(10, 3) => 7
  (func (export "subtract") (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.sub
  )

  ;; Divide (safe, returns 0 if divisor is 0)
  (func (export "divide") (param $a i32) (param $b i32) (result i32)
    local.get $b
    i32.eqz
    if (result i32)
      i32.const 0
    else
      local.get $a
      local.get $b
      i32.div_s
    end
  )

  ;; Absolute value
  (func (export "abs") (param $n i32) (result i32)
    local.get $n
    i32.const 0
    i32.lt_s
    if (result i32)
      i32.const 0
      local.get $n
      i32.sub
    else
      local.get $n
    end
  )

  ;; Max of two numbers
  (func (export "max") (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.gt_s
    if (result i32)
      local.get $a
    else
      local.get $b
    end
  )

  ;; Min of two numbers
  (func (export "min") (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.lt_s
    if (result i32)
      local.get $a
    else
      local.get $b
    end
  )

  ;; Clamp value between min and max
  (func (export "clamp") (param $val i32) (param $min i32) (param $max i32) (result i32)
    (local $result i32)
    local.get $val
    local.set $result
    
    local.get $result
    local.get $min
    i32.lt_s
    if
      local.get $min
      local.set $result
    end
    
    local.get $result
    local.get $max
    i32.gt_s
    if
      local.get $max
      local.set $result
    end
    
    local.get $result
  )

  ;; ════════════════════════════════════════════════════════════════════════
  ;; FINANCIAL CALCULATIONS
  ;; ════════════════════════════════════════════════════════════════════════

  ;; Calculate Financial Health Score (0-100)
  ;; Inputs: net_worth (cents), budgeted (cents), negative_envelope_count
  (func (export "calculate_health_score") 
    (param $net_worth i32) 
    (param $budgeted i32) 
    (param $negative_envelopes i32) 
    (result i32)
    
    (local $score i32)
    
    ;; Base score: 50
    i32.const 50
    local.set $score
    
    ;; +20 if net worth positive
    local.get $net_worth
    i32.const 0
    i32.gt_s
    if
      local.get $score
      i32.const 20
      i32.add
      local.set $score
    end
    
    ;; +10 if net worth > $10,000 (1,000,000 cents)
    local.get $net_worth
    i32.const 1000000
    i32.gt_s
    if
      local.get $score
      i32.const 10
      i32.add
      local.set $score
    end
    
    ;; +10 if budgeted is non-negative
    local.get $budgeted
    i32.const 0
    i32.ge_s
    if
      local.get $score
      i32.const 10
      i32.add
      local.set $score
    end
    
    ;; +10 if no negative envelopes
    local.get $negative_envelopes
    i32.eqz
    if
      local.get $score
      i32.const 10
      i32.add
      local.set $score
    end
    
    ;; Clamp to 0-100
    local.get $score
    i32.const 0
    i32.lt_s
    if
      i32.const 0
      local.set $score
    end
    
    local.get $score
    i32.const 100
    i32.gt_s
    if
      i32.const 100
      local.set $score
    end
    
    local.get $score
  )

  ;; Calculate percentage: percentage(25, 100) => 25
  (func (export "percentage") (param $part i32) (param $total i32) (result i32)
    local.get $total
    i32.eqz
    if (result i32)
      i32.const 0
    else
      local.get $part
      i32.const 100
      i32.mul
      local.get $total
      i32.div_s
    end
  )

  ;; Months until goal reached
  ;; Returns -1 if impossible (no/negative contribution)
  (func (export "months_to_goal") 
    (param $current i32) 
    (param $goal i32) 
    (param $monthly i32) 
    (result i32)
    
    (local $remaining i32)
    
    local.get $goal
    local.get $current
    i32.sub
    local.set $remaining
    
    ;; Already there?
    local.get $remaining
    i32.const 0
    i32.le_s
    if (result i32)
      i32.const 0
    else
      ;; Impossible?
      local.get $monthly
      i32.const 0
      i32.le_s
      if (result i32)
        i32.const -1
      else
        ;; Ceiling division
        local.get $remaining
        local.get $monthly
        i32.const 1
        i32.sub
        i32.add
        local.get $monthly
        i32.div_s
      end
    end
  )

  ;; Emergency fund target (3 months expenses)
  (func (export "emergency_fund_target") (param $monthly_expenses i32) (result i32)
    local.get $monthly_expenses
    i32.const 3
    i32.mul
  )
)`; 
    }

    // ─────────────────────────────────────────────────────────────
    // HTML INJECTION
    // ─────────────────────────────────────────────────────────────
    
    _injectDialogs() {
        const modalContent = this.root.querySelector('.modal-content');
        if (!modalContent) return;
        
        // Publish Dialog
        const publishDialog = `
        <div id="studio-publish-modal" class="studio-overlay">
            <div class="studio-dialog">
                <div class="dialog-header">
                    <span>🚀 Publish Extension</span>
                    <button class="dialog-close" data-close="studio-publish-modal">×</button>
                </div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label>Extension Name</label>
                        <input type="text" id="pub-name" placeholder="e.g. Super Saver Pro">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <textarea id="pub-desc" placeholder="What does your extension do?"></textarea>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label>Price (Sats)</label>
                            <input type="number" id="pub-price" value="0" min="0">
                            <span class="form-hint">0 = Free</span>
                        </div>
                        <div class="form-group">
                            <label>Category</label>
                            <select id="pub-cat">
                                <option value="utility">Utility</option>
                                <option value="bank">Banking</option>
                                <option value="crypto">Crypto</option>
                                <option value="report">Reports</option>
                                <option value="automation">Automation</option>
                            </select>
                        </div>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="studio-btn" data-close="studio-publish-modal">Cancel</button>
                    <button id="pub-confirm" class="studio-btn primary">Publish to Marketplace</button>
                </div>
            </div>
        </div>`;

        // New File Dialog
        const newFileDialog = `
        <div id="studio-newfile-modal" class="studio-overlay">
            <div class="studio-dialog small">
                <div class="dialog-header">
                    <span>📄 New File</span>
                    <button class="dialog-close" data-close="studio-newfile-modal">×</button>
                </div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label>File Name</label>
                        <input type="text" id="newfile-name" placeholder="e.g. helper.js">
                        <span class="form-hint">Supported: .js, .ts, .wat, .md, .json, .txt, .css</span>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="studio-btn" data-close="studio-newfile-modal">Cancel</button>
                    <button id="newfile-confirm" class="studio-btn primary">Create File</button>
                </div>
            </div>
        </div>`;

        // New Project Dialog
        const newProjectDialog = `
        <div id="studio-newproject-modal" class="studio-overlay">
            <div class="studio-dialog small">
                <div class="dialog-header">
                    <span>📁 New Project</span>
                    <button class="dialog-close" data-close="studio-newproject-modal">×</button>
                </div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label>Project Name</label>
                        <input type="text" id="newproject-name" placeholder="e.g. My Awesome Extension">
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="studio-btn" data-close="studio-newproject-modal">Cancel</button>
                    <button id="newproject-confirm" class="studio-btn primary">Create Project</button>
                </div>
            </div>
        </div>`;

        // Rename File Dialog
        const renameDialog = `
        <div id="studio-rename-modal" class="studio-overlay">
            <div class="studio-dialog small">
                <div class="dialog-header">
                    <span>✏️ Rename File</span>
                    <button class="dialog-close" data-close="studio-rename-modal">×</button>
                </div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label>New Name</label>
                        <input type="text" id="rename-input" placeholder="newname.js">
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="studio-btn" data-close="studio-rename-modal">Cancel</button>
                    <button id="rename-confirm" class="studio-btn primary">Rename</button>
                </div>
            </div>
        </div>`;

        // Rename Project Dialog
        const renameProjectDialog = `
        <div id="studio-renameproject-modal" class="studio-overlay">
            <div class="studio-dialog small">
                <div class="dialog-header">
                    <span>✏️ Rename Project</span>
                    <button class="dialog-close" data-close="studio-renameproject-modal">×</button>
                </div>
                <div class="dialog-body">
                    <div class="form-group">
                        <label>New Name</label>
                        <input type="text" id="renameproject-input" placeholder="My Project">
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="studio-btn" data-close="studio-renameproject-modal">Cancel</button>
                    <button id="renameproject-confirm" class="studio-btn primary">Rename</button>
                </div>
            </div>
        </div>`;

        // Delete Confirmation Dialog
        const deleteDialog = `
        <div id="studio-delete-modal" class="studio-overlay">
            <div class="studio-dialog small">
                <div class="dialog-header">
                    <span>🗑️ Delete File</span>
                    <button class="dialog-close" data-close="studio-delete-modal">×</button>
                </div>
                <div class="dialog-body">
                    <p id="delete-message">Are you sure you want to delete this file?</p>
                </div>
                <div class="dialog-footer">
                    <button class="studio-btn" data-close="studio-delete-modal">Cancel</button>
                    <button id="delete-confirm" class="studio-btn danger">Delete</button>
                </div>
            </div>
        </div>`;

        // Delete Project Dialog
        const deleteProjectDialog = `
        <div id="studio-deleteproject-modal" class="studio-overlay">
            <div class="studio-dialog small">
                <div class="dialog-header">
                    <span>🗑️ Delete Project</span>
                    <button class="dialog-close" data-close="studio-deleteproject-modal">×</button>
                </div>
                <div class="dialog-body">
                    <p id="deleteproject-message">Are you sure you want to delete this project?</p>
                </div>
                <div class="dialog-footer">
                    <button class="studio-btn" data-close="studio-deleteproject-modal">Cancel</button>
                    <button id="deleteproject-confirm" class="studio-btn danger">Delete Project</button>
                </div>
            </div>
        </div>`;

        // Key Management Dialog
        const keyDialog = `
        <div id="studio-key-modal" class="studio-overlay">
            <div class="studio-dialog">
                <div class="dialog-header">
                    <span>🔐 Developer Identity</span>
                    <button class="dialog-close" data-close="studio-key-modal">×</button>
                </div>
                <div class="dialog-body">
                    <p class="dialog-info">To publish extensions, import your Nostr private key (nsec). This key signs your extensions and receives payments.</p>
                    <div class="form-group">
                        <label>Private Key (nsec)</label>
                        <input type="password" id="studio-nsec-input" placeholder="nsec1..." autocomplete="off">
                    </div>
                    <div class="key-actions">
                        <button id="studio-key-generate" class="studio-btn small">Generate New Key</button>
                    </div>
                </div>
                <div class="dialog-footer">
                    <button class="studio-btn" data-close="studio-key-modal">Cancel</button>
                    <button id="studio-key-save" class="studio-btn primary">Import Key</button>
                </div>
            </div>
        </div>`;

        // Context Menu
        const contextMenu = `
        <div id="studio-context-menu" class="studio-context-menu">
            <div class="context-item" data-action="rename">✏️ Rename</div>
            <div class="context-item" data-action="duplicate">📋 Duplicate</div>
            <div class="context-divider"></div>
            <div class="context-item danger" data-action="delete">🗑️ Delete</div>
        </div>`;

        modalContent.insertAdjacentHTML('beforeend', publishDialog);
        modalContent.insertAdjacentHTML('beforeend', newFileDialog);
        modalContent.insertAdjacentHTML('beforeend', newProjectDialog);
        modalContent.insertAdjacentHTML('beforeend', renameDialog);
        modalContent.insertAdjacentHTML('beforeend', renameProjectDialog);
        modalContent.insertAdjacentHTML('beforeend', deleteDialog);
        modalContent.insertAdjacentHTML('beforeend', deleteProjectDialog);
        modalContent.insertAdjacentHTML('beforeend', keyDialog);
        modalContent.insertAdjacentHTML('beforeend', contextMenu);
        
        this.contextMenu = document.getElementById('studio-context-menu');
    }

    // ─────────────────────────────────────────────────────────────
    // SHOW / HIDE
    // ─────────────────────────────────────────────────────────────

    show() {
        this.root.classList.add('active');
        this.root.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        
        // Refresh editor layout
        if (this.editor) {
            requestAnimationFrame(() => this.editor.requestMeasure());
        }
        
        this._updateIdentityUI();
        this._updateStatusBar();
    }

    /**
     * Load an existing plugin into the studio for editing
     * Called from UIManager when user clicks "Edit" on an installed plugin
     */
    loadPlugin(plugin) {
        if (!plugin) return;
        
        const pluginName = plugin.name || plugin.meta?.title || 'Imported Plugin';
        const id = pluginName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'imported';
        
        // Create new project from plugin
        this.projects[id] = {
            name: pluginName,
            created: Date.now(),
            files: {
                'main.js': {
                    content: plugin.sourceCode || this._getDefaultJsTemplate(),
                    language: 'javascript'
                },
                'logic.wat': {
                    content: this._getDefaultWatTemplate(),
                    language: 'wat'
                },
                'README.md': {
                    content: `# ${pluginName}\n\nImported from installed plugins.\n\n## Original Info\n- ID: ${plugin.id || 'unknown'}\n- Signed: ${plugin.signerId ? 'Yes' : 'No'}\n`,
                    language: 'markdown'
                }
            }
        };
        
        this.activeProject = id;
        this.activeFile = 'main.js';
        this.openTabs = ['main.js'];
        this.unsavedChanges.clear();
        
        this._saveProjects();
        this._renderFileTree();
        this._renderTabs();
        this._initEditor();
        
        this.show();
        this._log(`Imported plugin: "${pluginName}"`, 'success');
        Toaster.show(`Loaded "${pluginName}" into Studio`, 'info');
    }

    hide() {
        // Check for unsaved changes
        if (this.unsavedChanges.size > 0) {
            const unsavedList = Array.from(this.unsavedChanges).join(', ');
            if (!confirm(`You have unsaved changes in: ${unsavedList}\n\nDiscard changes and close?`)) {
                return;
            }
        }
        
        this.root.classList.remove('active');
        this.root.style.display = 'none';
        document.body.style.overflow = '';
        this._hideContextMenu();
    }

    // ─────────────────────────────────────────────────────────────
    // EVENT BINDING
    // ─────────────────────────────────────────────────────────────

    _bindEvents() {
        const $ = (id) => document.getElementById(id);
        
        // Window Controls
        if ($('studio-btn-close')) $('studio-btn-close').onclick = () => this.hide();
        if ($('studio-btn-max')) $('studio-btn-max').onclick = () => this._toggleMaximize();
        if ($('studio-btn-min')) $('studio-btn-min').onclick = () => this._toggleSidebar();
        
        // Console Controls
        if ($('studio-toggle-console')) $('studio-toggle-console').onclick = () => this._toggleConsole();
        if ($('studio-clear-console')) $('studio-clear-console').onclick = () => this._clearConsole();

        // Toolbar Actions
        if ($('studio-btn-new')) $('studio-btn-new').onclick = () => this._showDialog('studio-newfile-modal');
        if ($('studio-btn-save')) $('studio-btn-save').onclick = () => this._saveFiles();
        if ($('studio-btn-build')) $('studio-btn-build').onclick = () => this._compileAndRun();
        if ($('studio-btn-publish')) $('studio-btn-publish').onclick = () => this._showDialog('studio-publish-modal');

        // New File Dialog
        if ($('newfile-confirm')) {
            $('newfile-confirm').onclick = () => this._createNewFile();
        }
        if ($('newfile-name')) {
            $('newfile-name').onkeydown = (e) => {
                if (e.key === 'Enter') this._createNewFile();
            };
        }

        // New Project Dialog
        if ($('newproject-confirm')) {
            $('newproject-confirm').onclick = () => this._confirmNewProject();
        }
        if ($('newproject-name')) {
            $('newproject-name').onkeydown = (e) => {
                if (e.key === 'Enter') this._confirmNewProject();
            };
        }

        // Rename Dialog
        if ($('rename-confirm')) {
            $('rename-confirm').onclick = () => this._confirmRename();
        }
        if ($('rename-input')) {
            $('rename-input').onkeydown = (e) => {
                if (e.key === 'Enter') this._confirmRename();
            };
        }

        // Rename Project Dialog
        if ($('renameproject-confirm')) {
            $('renameproject-confirm').onclick = () => this._confirmRenameProject();
        }

        // Delete Dialog
        if ($('delete-confirm')) {
            $('delete-confirm').onclick = () => this._confirmDelete();
        }

        // Delete Project Dialog
        if ($('deleteproject-confirm')) {
            $('deleteproject-confirm').onclick = () => this._confirmDeleteProject();
        }

        // Publish Dialog
        if ($('pub-confirm')) {
            $('pub-confirm').onclick = () => this._handlePublishConfirm();
        }

        // Key Management
        if ($('studio-identity')) $('studio-identity').onclick = () => this._showDialog('studio-key-modal');
        if ($('studio-key-save')) $('studio-key-save').onclick = () => this._importKey();
        if ($('studio-key-generate')) $('studio-key-generate').onclick = () => this._generateKey();

        // Dialog Close Buttons (generic)
        this.root.querySelectorAll('[data-close]').forEach(btn => {
            btn.onclick = () => this._hideDialog(btn.dataset.close);
        });

        // Context Menu
        if (this.contextMenu) {
            this.contextMenu.querySelectorAll('.context-item').forEach(item => {
                item.onclick = () => this._handleContextAction(item.dataset.action);
            });
        }

        // Close context menu on outside click
        document.addEventListener('click', (e) => {
            if (this.contextMenu && !this.contextMenu.contains(e.target)) {
                this._hideContextMenu();
            }
        });

        // Keyboard Shortcuts
        document.addEventListener('keydown', (e) => {
            if (!this.root.classList.contains('active')) return;
            
            // Cmd/Ctrl + S = Save
            if ((e.metaKey || e.ctrlKey) && e.key === 's') {
                e.preventDefault();
                this._saveFiles();
            }
            // Cmd/Ctrl + B = Build
            if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
                e.preventDefault();
                this._compileAndRun();
            }
            // Cmd/Ctrl + N = New File
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                this._showDialog('studio-newfile-modal');
            }
            // Cmd/Ctrl + W = Close Tab
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                e.preventDefault();
                this._closeTab(this.activeFile);
            }
            // Escape = Close dialogs/context menu
            if (e.key === 'Escape') {
                this._hideContextMenu();
                this.root.querySelectorAll('.studio-overlay.active').forEach(el => {
                    el.classList.remove('active');
                });
            }
        });
    }

    // ─────────────────────────────────────────────────────────────
    // PROJECT DIALOGS
    // ─────────────────────────────────────────────────────────────

    _showNewProjectDialog() {
        this._showDialog('studio-newproject-modal');
    }

    _confirmNewProject() {
        const input = document.getElementById('newproject-name');
        const name = input?.value.trim();
        
        if (!name) {
            Toaster.show('Please enter a project name', 'error');
            return;
        }
        
        if (this.createProject(name)) {
            this._hideDialog('studio-newproject-modal');
        }
    }

    _showRenameProjectDialog(projectId) {
        this.contextTarget = projectId;
        const project = this.projects[projectId];
        const input = document.getElementById('renameproject-input');
        if (input && project) {
            input.value = project.name;
        }
        this._showDialog('studio-renameproject-modal');
    }

    _confirmRenameProject() {
        const input = document.getElementById('renameproject-input');
        const newName = input?.value.trim();
        
        if (!newName) {
            this._hideDialog('studio-renameproject-modal');
            return;
        }
        
        this.renameProject(this.contextTarget, newName);
        this._hideDialog('studio-renameproject-modal');
    }

    _showDeleteProjectDialog(projectId) {
        this.contextTarget = projectId;
        const project = this.projects[projectId];
        const msg = document.getElementById('deleteproject-message');
        if (msg && project) {
            msg.textContent = `Are you sure you want to delete "${project.name}"? This cannot be undone.`;
        }
        this._showDialog('studio-deleteproject-modal');
    }

    _confirmDeleteProject() {
        this.deleteProject(this.contextTarget);
        this._hideDialog('studio-deleteproject-modal');
    }

    // ─────────────────────────────────────────────────────────────
    // WINDOW CONTROLS
    // ─────────────────────────────────────────────────────────────

    _toggleMaximize() {
        this.isMaximized = !this.isMaximized;
        const content = this.root.querySelector('.studio-content');
        const btn = document.getElementById('studio-btn-max');
        
        if (this.isMaximized) {
            content.classList.add('maximized');
            if (btn) {
                btn.innerHTML = '⤡';
                btn.title = 'Restore';
            }
        } else {
            content.classList.remove('maximized');
            if (btn) {
                btn.innerHTML = '⤢';
                btn.title = 'Maximize';
            }
        }
        
        // Refresh editor layout
        if (this.editor) {
            setTimeout(() => this.editor.requestMeasure(), 100);
        }
    }

    _toggleSidebar() {
        const sidebar = this.root.querySelector('.studio-sidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
            
            if (this.editor) {
                setTimeout(() => this.editor.requestMeasure(), 200);
            }
        }
    }

    _toggleConsole() {
        const consoleEl = document.getElementById('studio-console');
        if (consoleEl) {
            consoleEl.classList.toggle('open');
            
            if (this.editor) {
                setTimeout(() => this.editor.requestMeasure(), 200);
            }
        }
    }

    _clearConsole() {
        const logs = document.getElementById('studio-logs');
        if (logs) {
            logs.innerHTML = '';
            this._log('Console cleared', 'info');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // DIALOG MANAGEMENT
    // ─────────────────────────────────────────────────────────────

    _showDialog(id) {
        const dialog = document.getElementById(id);
        if (!dialog) return;
        
        dialog.classList.add('active');
        
        // Focus first input if exists
        const input = dialog.querySelector('input');
        if (input) {
            setTimeout(() => {
                input.value = '';
                input.focus();
            }, 100);
        }
    }

    _hideDialog(id) {
        const dialog = document.getElementById(id);
        if (dialog) {
            dialog.classList.remove('active');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // FILE MANAGEMENT
    // ─────────────────────────────────────────────────────────────

    _createNewFile() {
        const input = document.getElementById('newfile-name');
        const filename = input.value.trim();
        
        if (!filename) {
            Toaster.show('Please enter a file name', 'error');
            return;
        }
        
        const files = this._getCurrentFiles();
        if (files[filename]) {
            Toaster.show('File already exists', 'error');
            return;
        }
        
        // Validate extension
        const validExts = ['.js', '.zds', '.wat','.ts', '.md', '.json', '.txt', '.css'];
        const hasValidExt = validExts.some(ext => filename.endsWith(ext));
        if (!hasValidExt) {
            Toaster.show('Invalid file type. Use: .js, .ts, .wat, .md, .json, .txt, .css', 'error');
            return;
        }
        
        // Determine language from extension
        const lang = this._getLanguageFromFilename(filename);
        
        // Create file with template content
        files[filename] = {
            content: this._getTemplateForFile(filename),
            language: lang
        };
        
        // Open in editor
        this.activeFile = filename;
        if (!this.openTabs.includes(filename)) {
            this.openTabs.push(filename);
        }
        
        this._hideDialog('studio-newfile-modal');
        this._renderFileTree();
        this._renderTabs();
        this._initEditor();
        this._saveProjects();
        this._log(`Created: ${filename}`, 'success');
    }

    _getLanguageFromFilename(filename) {
        if (filename.endsWith('.js')) return 'javascript';
        if (filename.endsWith('.zds')) return 'zdscript';
        if (filename.endsWith('.ts')) return 'assemblyscript';
        if (filename.endsWith('.json')) return 'json';
        if (filename.endsWith('.wat')) return 'wat';
        if (filename.endsWith('.md')) return 'markdown';
        if (filename.endsWith('.css')) return 'css';
        return 'text';
    }

    _getTemplateForFile(filename) {
        if (filename.endsWith('.js')) {
            return `/* ${filename} */\n\nexport function myFunction() {\n    // Your code here\n}\n`;
        }
        if (filename.endsWith('.ts')) {
            return this._getDefaultAssemblyScriptTemplate();
        }
        if (filename.endsWith('.json')) {
            return `{\n    "key": "value"\n}\n`;
        }
        if (filename.endsWith('.wat')) {
            return `(module\n  ;; Your WebAssembly code here\n)\n`;
        }
        if (filename.endsWith('.md')) {
            return `# ${filename.replace('.md', '')}\n\nYour content here.\n`;
        }
        if (filename.endsWith('.css')) {
            return `/* ${filename} */\n\n.my-class {\n    \n}\n`;
        }
        return '';
    }

    _renameFile(oldName) {
        this.contextTarget = oldName;
        const input = document.getElementById('rename-input');
        input.value = oldName;
        this._showDialog('studio-rename-modal');
        
        // Select filename without extension
        setTimeout(() => {
            const dotIndex = oldName.lastIndexOf('.');
            if (dotIndex > 0) {
                input.setSelectionRange(0, dotIndex);
            } else {
                input.select();
            }
        }, 100);
    }

    _confirmRename() {
        const newName = document.getElementById('rename-input').value.trim();
        const oldName = this.contextTarget;
        
        if (!newName || newName === oldName) {
            this._hideDialog('studio-rename-modal');
            return;
        }
        
        const files = this._getCurrentFiles();
        if (files[newName]) {
            Toaster.show('A file with that name already exists', 'error');
            return;
        }
        
        // Rename the file
        files[newName] = { ...files[oldName] };
        files[newName].language = this._getLanguageFromFilename(newName);
        delete files[oldName];
        
        // Update tabs
        const tabIndex = this.openTabs.indexOf(oldName);
        if (tabIndex !== -1) {
            this.openTabs[tabIndex] = newName;
        }
        
        // Update active file
        if (this.activeFile === oldName) {
            this.activeFile = newName;
        }
        
        // Update unsaved changes
        if (this.unsavedChanges.has(oldName)) {
            this.unsavedChanges.delete(oldName);
            this.unsavedChanges.add(newName);
        }
        
        this._hideDialog('studio-rename-modal');
        this._renderFileTree();
        this._renderTabs();
        this._initEditor();
        this._saveProjects();
        this._log(`Renamed: ${oldName} → ${newName}`, 'success');
    }

    _duplicateFile(filename) {
        const files = this._getCurrentFiles();
        const ext = filename.substring(filename.lastIndexOf('.'));
        const baseName = filename.substring(0, filename.lastIndexOf('.'));
        let newName = `${baseName}_copy${ext}`;
        let counter = 1;
        
        while (files[newName]) {
            newName = `${baseName}_copy${counter}${ext}`;
            counter++;
        }
        
        files[newName] = {
            content: files[filename].content,
            language: files[filename].language
        };
        
        this._renderFileTree();
        this._saveProjects();
        this._log(`Duplicated: ${filename} → ${newName}`, 'success');
    }

    _deleteFile(filename) {
        this.contextTarget = filename;
        document.getElementById('delete-message').textContent = 
            `Are you sure you want to delete "${filename}"? This cannot be undone.`;
        this._showDialog('studio-delete-modal');
    }

    _confirmDelete() {
        const filename = this.contextTarget;
        const files = this._getCurrentFiles();
        
        if (Object.keys(files).length <= 1) {
            Toaster.show('Cannot delete the last file', 'error');
            this._hideDialog('studio-delete-modal');
            return;
        }
        
        // Remove file
        delete files[filename];
        this.unsavedChanges.delete(filename);
        
        // Remove from tabs
        const tabIndex = this.openTabs.indexOf(filename);
        if (tabIndex !== -1) {
            this.openTabs.splice(tabIndex, 1);
        }
        
        // Update active file if needed
        if (this.activeFile === filename) {
            this.activeFile = this.openTabs[0] || Object.keys(files)[0];
        }
        
        this._hideDialog('studio-delete-modal');
        this._renderFileTree();
        this._renderTabs();
        this._initEditor();
        this._saveProjects();
        this._log(`Deleted: ${filename}`, 'info');
    }

    // ─────────────────────────────────────────────────────────────
    // CONTEXT MENU
    // ─────────────────────────────────────────────────────────────

    _showContextMenu(e, target, type = 'file') {
        e.preventDefault();
        this.contextTarget = target;
        this.contextType = type;
        
        if (!this.contextMenu) return;
        
        // Update menu items based on type
        if (type === 'project') {
            this.contextMenu.innerHTML = `
                <div class="context-item" data-action="rename-project">✏️ Rename Project</div>
                <div class="context-item" data-action="duplicate-project">📋 Duplicate Project</div>
                <div class="context-divider"></div>
                <div class="context-item danger" data-action="delete-project">🗑️ Delete Project</div>
            `;
        } else {
            this.contextMenu.innerHTML = `
                <div class="context-item" data-action="rename">✏️ Rename</div>
                <div class="context-item" data-action="duplicate">📋 Duplicate</div>
                <div class="context-divider"></div>
                <div class="context-item danger" data-action="delete">🗑️ Delete</div>
            `;
        }
        
        // Re-bind click handlers
        this.contextMenu.querySelectorAll('.context-item').forEach(item => {
            item.onclick = () => this._handleContextAction(item.dataset.action);
        });
        
        this.contextMenu.style.left = `${e.clientX}px`;
        this.contextMenu.style.top = `${e.clientY}px`;
        this.contextMenu.classList.add('visible');
    }

    _hideContextMenu() {
        if (this.contextMenu) {
            this.contextMenu.classList.remove('visible');
        }
    }

    _handleContextAction(action) {
        const target = this.contextTarget;
        this._hideContextMenu();
        
        switch (action) {
            case 'rename':
                this._renameFile(target);
                break;
            case 'duplicate':
                this._duplicateFile(target);
                break;
            case 'delete':
                this._deleteFile(target);
                break;
            case 'rename-project':
                this._showRenameProjectDialog(target);
                break;
            case 'duplicate-project':
                this.duplicateProject(target);
                break;
            case 'delete-project':
                this._showDeleteProjectDialog(target);
                break;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // FILE TREE RENDERING (v2 - Project-based)
    // ─────────────────────────────────────────────────────────────

    _renderFileTree() {
        const tree = document.getElementById('studio-file-tree');
        if (!tree) return;
        
        tree.innerHTML = '';
        
        // Projects header
        const header = document.createElement('div');
        header.className = 'sidebar-section-header';
        header.innerHTML = `
            <span>PROJECTS</span>
            <button class="sidebar-btn" id="btn-new-project" title="New Project">+</button>
        `;
        tree.appendChild(header);
        
        // Bind new project button
        const newProjBtn = header.querySelector('#btn-new-project');
        if (newProjBtn) {
            newProjBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._showNewProjectDialog();
            });
        }
        
        // Projects list
        Object.entries(this.projects).forEach(([id, project]) => {
            const isActive = id === this.activeProject;
            
            const projectEl = document.createElement('div');
            projectEl.className = `project-item ${isActive ? 'active expanded' : ''}`;
            projectEl.dataset.projectId = id;
            
            // Project header (clickable)
            const projectHeader = document.createElement('div');
            projectHeader.className = 'project-header';
            projectHeader.innerHTML = `
                <span class="project-toggle">${isActive ? '▼' : '▶'}</span>
                <span class="project-icon">📁</span>
                <span class="project-name">${project.name}</span>
            `;
            
            // Click to expand/switch
            projectHeader.addEventListener('click', () => {
                if (id !== this.activeProject) {
                    this.switchProject(id);
                } else {
                    projectEl.classList.toggle('expanded');
                    const toggle = projectHeader.querySelector('.project-toggle');
                    if (toggle) {
                        toggle.textContent = projectEl.classList.contains('expanded') ? '▼' : '▶';
                    }
                }
            });
            
            // Right-click for context menu
            projectHeader.addEventListener('contextmenu', (e) => {
                this._showContextMenu(e, id, 'project');
            });
            
            projectEl.appendChild(projectHeader);
            
            // Files list (only for active/expanded project)
            if (isActive) {
                const filesContainer = document.createElement('div');
                filesContainer.className = 'project-files';
                
                // Sort files
                const sortedFiles = Object.keys(project.files).sort((a, b) => {
                    const aIsJs = a.endsWith('.js');
                    const bIsJs = b.endsWith('.js');
                    if (aIsJs && !bIsJs) return -1;
                    if (!aIsJs && bIsJs) return 1;
                    return a.localeCompare(b);
                });
                
                sortedFiles.forEach(filename => {
                    const fileEl = document.createElement('div');
                    fileEl.className = `file-item ${filename === this.activeFile ? 'active' : ''}`;
                    fileEl.dataset.filename = filename;
                    
                    const icon = this._getFileIcon(filename);
                    const hasUnsaved = this.unsavedChanges.has(filename);
                    
                    fileEl.innerHTML = `
                        <span class="file-icon">${icon}</span>
                        <span class="file-name">${filename}</span>
                        ${hasUnsaved ? '<span class="unsaved-dot">●</span>' : ''}
                    `;
                    
                    fileEl.addEventListener('click', () => this._openFile(filename));
                    fileEl.addEventListener('contextmenu', (e) => {
                        this._showContextMenu(e, filename, 'file');
                    });
                    
                    filesContainer.appendChild(fileEl);
                });
                
                // New file button inside project
                const newFileBtn = document.createElement('div');
                newFileBtn.className = 'file-item new-file-btn';
                newFileBtn.innerHTML = `<span class="file-icon">+</span><span class="file-name">New File...</span>`;
                newFileBtn.addEventListener('click', () => this._showDialog('studio-newfile-modal'));
                filesContainer.appendChild(newFileBtn);
                
                projectEl.appendChild(filesContainer);
            }
            
            tree.appendChild(projectEl);
        });
    }

    _getFileIcon(filename) {
        if (filename.endsWith('.js')) return '📜';
        if (filename.endsWith('.zds')) return '🔷';
        if (filename.endsWith('.ts')) return '🔷';
        if (filename.endsWith('.wat')) return '⚙️';
        if (filename.endsWith('.md')) return '📝';
        if (filename.endsWith('.json')) return '📋';
        if (filename.endsWith('.css')) return '🎨';
        return '📄';
    }

    // ─────────────────────────────────────────────────────────────
    // TAB MANAGEMENT
    // ─────────────────────────────────────────────────────────────

    _openFile(filename) {
        const files = this._getCurrentFiles();
        if (!files[filename]) return;
        
        // Save current file content first
        this._saveCurrentFileContent();
        
        // Add to tabs if not already open
        if (!this.openTabs.includes(filename)) {
            this.openTabs.push(filename);
        }
        
        this.activeFile = filename;
        this._renderFileTree();
        this._renderTabs();
        this._initEditor();
        this._updateStatusBar();
    }

    _closeTab(filename) {
        if (this.openTabs.length <= 1) {
            Toaster.show('Cannot close the last tab', 'info');
            return;
        }
        
        // Check for unsaved changes
        if (this.unsavedChanges.has(filename)) {
            if (!confirm(`"${filename}" has unsaved changes. Close anyway?`)) {
                return;
            }
            this.unsavedChanges.delete(filename);
        }
        
        const tabIndex = this.openTabs.indexOf(filename);
        this.openTabs.splice(tabIndex, 1);
        
        // Switch to adjacent tab if closing active tab
        if (this.activeFile === filename) {
            this.activeFile = this.openTabs[Math.min(tabIndex, this.openTabs.length - 1)];
            this._initEditor();
        }
        
        this._renderTabs();
        this._renderFileTree();
    }

    _renderTabs() {
        const tabsContainer = document.getElementById('studio-tabs');
        if (!tabsContainer) return;
        
        tabsContainer.innerHTML = '';
        
        this.openTabs.forEach(filename => {
            const tab = document.createElement('div');
            const hasUnsaved = this.unsavedChanges.has(filename);
            tab.className = `tab ${filename === this.activeFile ? 'active' : ''} ${hasUnsaved ? 'unsaved' : ''}`;
            
            tab.innerHTML = `
                <span class="tab-icon">${this._getFileIcon(filename)}</span>
                <span class="tab-name">${filename}</span>
                ${hasUnsaved ? '<span class="tab-unsaved">●</span>' : ''}
                <button class="tab-close" title="Close">×</button>
            `;
            
            // Click tab to switch
            tab.onclick = (e) => {
                if (!e.target.classList.contains('tab-close')) {
                    this._openFile(filename);
                }
            };
            
            // Middle click to close
            tab.onauxclick = (e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    this._closeTab(filename);
                }
            };
            
            // Close button
            tab.querySelector('.tab-close').onclick = (e) => {
                e.stopPropagation();
                this._closeTab(filename);
            };
            
            tabsContainer.appendChild(tab);
        });
    }

    // ─────────────────────────────────────────────────────────────
    // EDITOR
    // ─────────────────────────────────────────────────────────────

    _initEditor() {
        const container = document.getElementById('studio-editor-container');
        if (!container) return;
        
        // Destroy old editor
        if (this.editor) {
            this.editor.destroy();
        }
        
        container.innerHTML = '';
        
        const files = this._getCurrentFiles();
        const file = files[this.activeFile];
        if (!file) return;
        
        // Get language extension
        const langExt = this._getEditorLanguage(this.activeFile);
        
        const startState = EditorState.create({
            doc: file.content,
            extensions: [
                basicSetup,
                keymap.of([indentWithTab]),
                oneDark,
                langExt,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged) {
                        const newContent = update.state.doc.toString();
                        const files = this._getCurrentFiles();
                        if (files[this.activeFile]) {
                            files[this.activeFile].content = newContent;
                        }
                        this.unsavedChanges.add(this.activeFile);
                        this._renderTabs();
                        this._renderFileTree();
                        this._updateStatusBar();
                    }
                }),
                EditorView.theme({
                    "&": { height: "100%" },
                    ".cm-scroller": { overflow: "auto" }
                })
            ]
        });

        this.editor = new EditorView({ 
            state: startState, 
            parent: container 
        });
    }

    _getEditorLanguage(filename) {
    if (filename.endsWith('.js') || filename.endsWith('.ts') || filename.endsWith('.json')) {
        return javascript();
    }
    if (filename.endsWith('.zds')) {
        return javascript({ typescript: true }); // TS highlighting works great
    }
    return [];
    }

    // ─────────────────────────────────────────────────────────────
    // STATUS BAR
    // ─────────────────────────────────────────────────────────────

    _updateStatusBar() {
        const statusBar = document.getElementById('studio-status-bar');
        if (!statusBar) return;
        
        const files = this._getCurrentFiles();
        const file = files[this.activeFile];
        if (!file) {
            statusBar.textContent = 'No file open';
            return;
        }
        
        const lines = file.content.split('\n').length;
        const chars = file.content.length;
        const lang = file.language || 'text';
        const unsaved = this.unsavedChanges.size;
        const projectName = this._getCurrentProject()?.name || 'Unknown';
        
        statusBar.innerHTML = `
            <span class="status-item">${projectName}</span>
            <span class="status-sep">|</span>
            <span class="status-item">${this.activeFile}</span>
            <span class="status-sep">|</span>
            <span class="status-item">${lines} lines, ${chars} chars</span>
            <span class="status-sep">|</span>
            <span class="status-item">${lang}</span>
            ${unsaved > 0 ? `<span class="status-sep">|</span><span class="status-item unsaved">${unsaved} unsaved</span>` : ''}
        `;
    }

    // ─────────────────────────────────────────────────────────────
    // SAVE / BUILD / PUBLISH
    // ─────────────────────────────────────────────────────────────

    _saveFiles() {
        this._saveCurrentFileContent();
        this._saveProjects();
        this.unsavedChanges.clear();
        this._renderTabs();
        this._renderFileTree();
        this._updateStatusBar();
        this._log('All files saved', 'success');
        Toaster.show('Saved!', 'success');
    }

    async _compileAndRun() {
        this._log('──────────────────────────────', 'info');
        this._log('Build started...', 'info');
        
        // Open console
        const consoleEl = document.getElementById('studio-console');
        if (consoleEl) {
            consoleEl.classList.add('open');
        }
        if (this.editor) {
            setTimeout(() => this.editor.requestMeasure(), 200);
        }
        
        try {
            const files = this._getCurrentFiles();
            
            // 1. Compile WASM if present
            const zdsFile = Object.entries(files).find(([name]) => name.endsWith('.zds'));
            let watFile = Object.entries(files).find(([name]) => name.endsWith('.wat'));

            if (zdsFile && !watFile) {
                this._log('Compiling ZDScript → WAT...', 'info');
                const result = this._zdscript.compile(zdsFile[1].content);
                
                if (!result.success) {
                    this._log(`ZDScript Error: ${result.error}`, 'error');
                    throw new Error(result.error);
                }
                
                this._log(`✓ ZDScript compiled (${result.semanticInfo.classes.size} classes, ${result.semanticInfo.functions.size} functions)`, 'success');
                watFile = ['logic.wat', { content: result.wat }];
                console.log('Generated WAT:\n' + result.wat);
            }
            let wasmBase64 = null;

            if (watFile && watFile[1].content.trim().length > 0) {
                this._log('Compiling WebAssembly...', 'info');
                
                // Initialize WABT properly
                let wabtInstance;
                
                // Check if we already have a VALID working instance cached
                if (window._wabtInstance && typeof window._wabtInstance.parseWat === 'function') {
                    wabtInstance = window._wabtInstance;
                    this._log('Using cached WABT instance', 'info');
                } else {
                    this._log('Initializing WABT compiler...', 'info');
                    
                    // Some WABT builds export the instance directly, not a factory
                    // Check for direct instance first
                    if (window.WabtModule && typeof window.WabtModule.parseWat === 'function') {
                        wabtInstance = window.WabtModule;
                        this._log('Using direct WabtModule instance', 'info');
                    } else if (window.wabt && typeof window.wabt.parseWat === 'function') {
                        wabtInstance = window.wabt;
                        this._log('Using direct wabt instance', 'info');
                    } else {
                        // Try as factory functions
                        let wabtLoader = null;
                        
                        if (typeof window.wabt === 'function') {
                            wabtLoader = window.wabt;
                            this._log('Found wabt() factory', 'info');
                        } else if (typeof window.WabtModule === 'function') {
                            wabtLoader = window.WabtModule;
                            this._log('Found WabtModule() factory', 'info');
                        } else if (typeof window.Wabt === 'function') {
                            wabtLoader = window.Wabt;
                            this._log('Found Wabt() factory', 'info');
                        }
                        
                        // Check non-window scope too (some bundlers)
                        if (!wabtLoader) {
                            try {
                                if (typeof wabt === 'function') {
                                    wabtLoader = wabt;
                                    this._log('Found global wabt() factory', 'info');
                                }
                            } catch (e) { /* not defined */ }
                        }
                        
                        if (!wabtLoader) {
                            // Debug: Log what globals ARE available
                            const wabtRelated = Object.keys(window).filter(k => 
                                k.toLowerCase().includes('wabt') || k === 'Module'
                            );
                            console.error('WABT globals found:', wabtRelated);
                            wabtRelated.forEach(k => {
                                console.error(`  ${k}:`, typeof window[k], window[k]);
                            });
                            this._log(`Debug: wabt-related globals: ${wabtRelated.join(', ') || 'none'}`, 'error');
                            throw new Error('WABT compiler not found. Check console for details.');
                        }
                        
                        try {
                            wabtInstance = await wabtLoader();
                            if (!wabtInstance || typeof wabtInstance.parseWat !== 'function') {
                                console.error('WABT loader returned:', wabtInstance);
                                console.error('Available methods:', wabtInstance ? Object.keys(wabtInstance) : 'null');
                                throw new Error('WABT loaded but parseWat method not found');
                            }
                            this._log('WABT compiler ready', 'success');
                        } catch (wabtErr) {
                            console.error('WABT init error:', wabtErr);
                            throw new Error(`WABT initialization failed: ${wabtErr.message}`);
                        }
                    }
                    
                    window._wabtInstance = wabtInstance;
                }
                
                try {
                    const module = wabtInstance.parseWat(watFile[0], watFile[1].content);
                    const { buffer } = module.toBinary({});
                    wasmBase64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                    module.destroy();
                    this._log(`WASM compiled: ${buffer.byteLength} bytes`, 'success');
                } catch (parseErr) {
                    throw new Error(`WAT parse error: ${parseErr.message}`);
                }
            }

            // 2. Prepare JS source
            let jsSource = files['main.js']?.content;
            if (!jsSource) {
                throw new Error('main.js not found');
            }
            
            if (wasmBase64) {
                if (jsSource.includes('wasmBinary: ""')) {
                    jsSource = jsSource.replace('wasmBinary: ""', `wasmBinary: "${wasmBase64}"`);
                    this._log('WASM binary injected into main.js', 'info');
                }
            }

            // 3. Install as plugin
            this._log('Installing extension...', 'info');
            
            const project = this._getCurrentProject();
            const pluginData = {
                id: 'dev_build',
                name: project.name,
                sourceCode: jsSource,
                active: true,
                signerId: null
            };
            
            // Unload existing dev build first
            if (this.app.plugins.plugins.has('dev_build')) {
                const existing = this.app.plugins.plugins.get('dev_build');
                if (existing?.destroy) existing.destroy();
                this.app.plugins.plugins.delete('dev_build');
            }
            
            await this.app.db.put('installed_plugins', pluginData);
            await this.app.plugins.bootPlugin(pluginData);
            
            this._log(`✅ Build successful!`, 'success');
            this._log('→ Refresh the Reports tab to see changes.', 'info');
            Toaster.show('Build successful!', 'success');

        } catch (e) {
            this._log(`❌ Build failed: ${e.message}`, 'error');
            console.error(e);
            Toaster.show('Build failed', 'error');
        }
    }

    async _handlePublishConfirm() {
        const name = document.getElementById('pub-name')?.value.trim();
        const desc = document.getElementById('pub-desc')?.value.trim();
        const price = document.getElementById('pub-price')?.value || '0';
        const cat = document.getElementById('pub-cat')?.value;

        if (!name) {
            Toaster.show('Please enter an extension name', 'error');
            return;
        }

        if (!this.devKey) {
            Toaster.show('Import your developer key first', 'error');
            this._hideDialog('studio-publish-modal');
            this._showDialog('studio-key-modal');
            return;
        }

        this._hideDialog('studio-publish-modal');
        this._log('──────────────────────────────', 'info');
        this._log('Publishing extension...', 'info');
        document.getElementById('studio-console')?.classList.add('open');

        try {
            const files = this._getCurrentFiles();
            
            // 1. Decode private key
            let privKeyHex = this.devKey;
            
            if (typeof privKeyHex === 'string' && privKeyHex.startsWith('nsec')) {
                const { data } = window.NostrTools.nip19.decode(privKeyHex);
                privKeyHex = data;
            }

            // 2. Compile source
            const watFile = Object.entries(files).find(([n]) => n.endsWith('.wat'));
            let finalJs = files['main.js']?.content;

            if (!finalJs) {
                throw new Error('main.js not found');
            }

            if (watFile && watFile[1].content.trim().length > 0) {
                // Initialize WABT properly - same logic as _compileAndRun
                let wabtInstance;
                
                if (window._wabtInstance && typeof window._wabtInstance.parseWat === 'function') {
                    wabtInstance = window._wabtInstance;
                } else {
                    let wabtLoader = window.wabt || window.WabtModule || window.Wabt;
                    if (typeof wabtLoader !== 'function' && typeof wabt === 'function') {
                        wabtLoader = wabt;
                    }
                    if (!wabtLoader) {
                        throw new Error('WABT compiler not found');
                    }
                    wabtInstance = await wabtLoader();
                    window._wabtInstance = wabtInstance;
                }
                
                const module = wabtInstance.parseWat(watFile[0], watFile[1].content);
                const { buffer } = module.toBinary({});
                const b64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
                finalJs = finalJs.replace('wasmBinary: ""', `wasmBinary: "${b64}"`);
                module.destroy();
                this._log('WASM compiled and injected', 'success');
            }

            // 3. Create signed package
            this._log('Creating signed package...', 'info');
            const zdpBlob = await this.app.plugins.createSignedPackage(finalJs, privKeyHex);
            
            // 4. Read as data URI and broadcast
            const reader = new FileReader();
            reader.readAsDataURL(zdpBlob);
            
            reader.onloadend = async () => {
                const dataUri = reader.result;
                const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                const { finalizeEvent, getPublicKey, SimplePool } = window.NostrTools;

                const pubKey = getPublicKey(privKeyHex);

                const event = {
                    kind: 30402,
                    created_at: Math.floor(Date.now() / 1000),
                    content: desc,
                    tags: [
                        ['d', slug],
                        ['title', name],
                        ['summary', desc],
                        ['t', 'zerodollars-plugin'],
                        ['t', cat],
                        ['price', price, 'sats'],
                        ['resource', dataUri],
                        ['image', `https://placehold.co/600x400/6366f1/ffffff?text=${encodeURIComponent(name)}`]
                    ],
                    pubkey: pubKey,
                };

                const signed = finalizeEvent(event, privKeyHex);
                
                this._log('Broadcasting to Nostr relays...', 'info');
                const pool = new SimplePool();
                const RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
                
                await Promise.any(pool.publish(RELAYS, signed));
                
                this._log(`✅ Published: "${name}"`, 'success');
                this._log(`Price: ${price} sats | Category: ${cat}`, 'info');
                Toaster.show('Published to marketplace!', 'success');
            };

        } catch (e) {
            this._log(`❌ Publish failed: ${e.message}`, 'error');
            console.error(e);
            Toaster.show('Publish failed', 'error');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // KEY MANAGEMENT
    // ─────────────────────────────────────────────────────────────

    _importKey() {
        const nsec = document.getElementById('studio-nsec-input')?.value.trim();
        
        if (!nsec || !nsec.startsWith('nsec1')) {
            Toaster.show('Invalid key format (should start with nsec1)', 'error');
            return;
        }
        
        try {
            // Validate by decoding
            const decoded = window.NostrTools.nip19.decode(nsec);
            if (!decoded.data) throw new Error('Invalid key');
            
            this.devKey = nsec;
            localStorage.setItem('dev_nsec_v1', nsec);
            
            // Sync to app
            if (window.app?.ui) {
                window.app.ui.devPrivateKey = Utils.bytesToHex(decoded.data);
            }
            
            this._hideDialog('studio-key-modal');
            this._updateIdentityUI();
            this._log('Developer key imported', 'success');
            Toaster.show('Key imported!', 'success');
            
        } catch (e) {
            Toaster.show('Invalid nsec key', 'error');
        }
    }

    _generateKey() {
        try {
            const { generateSecretKey, getPublicKey, nip19 } = window.NostrTools;
            
            const sk = generateSecretKey();
            const nsec = nip19.nsecEncode(sk);
            const pk = getPublicKey(sk);
            const npub = nip19.npubEncode(pk);
            
            const input = document.getElementById('studio-nsec-input');
            if (input) input.value = nsec;
            
            this._log('Generated new keypair', 'success');
            this._log(`Public key: ${npub.substring(0, 20)}...`, 'info');
            
            Toaster.show('New key generated! Click Import to save.', 'info');
            
        } catch (e) {
            Toaster.show('Failed to generate key', 'error');
            console.error(e);
        }
    }

    async _updateIdentityUI() {
        const badge = document.getElementById('studio-identity');
        const label = document.getElementById('studio-id-label');
        if (!badge || !label) return;
        
        const dot = badge.querySelector('.status-dot');
        
        if (this.devKey) {
            let pubKeyHex;
            try {
                if (this.devKey.startsWith('nsec')) {
                    pubKeyHex = window.NostrTools.getPublicKey(
                        window.NostrTools.nip19.decode(this.devKey).data
                    );
                } else {
                    pubKeyHex = window.NostrTools.getPublicKey(this.devKey);
                }
            } catch (e) {
                console.error('Bad key in UI update');
                return;
            }

            label.textContent = 'Verifying...';
            label.style.color = '#fbbf24';
            if (dot) dot.className = 'status-dot';

            // Try to fetch profile
            if (window.app?.ui?.views?.marketplace) {
                try {
                    const market = window.app.ui.views.marketplace.market;
                    await market.fetchProfiles([pubKeyHex]);
                    const profile = market.getProfile(pubKeyHex);
                    
                    if (profile) {
                        label.textContent = profile.name || 'Verified Dev';
                        label.style.color = '#10b981';
                        if (dot) dot.classList.add('active');
                    } else {
                        label.textContent = 'New Developer';
                        label.style.color = '#818cf8';
                        if (dot) dot.classList.add('active');
                    }
                } catch (e) {
                    label.textContent = 'Key Loaded';
                    label.style.color = '#818cf8';
                    if (dot) dot.classList.add('active');
                }
            } else {
                label.textContent = 'Key Loaded';
                label.style.color = '#818cf8';
                if (dot) dot.classList.add('active');
            }
        } else {
            label.textContent = 'Guest';
            label.style.color = '';
            if (dot) dot.classList.remove('active');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // LOGGING
    // ─────────────────────────────────────────────────────────────

    _log(msg, type = 'info') {
        const logs = document.getElementById('studio-logs');
        if (!logs) return;
        
        const line = document.createElement('div');
        line.className = `log-line log-${type}`;
        
        const time = new Date().toLocaleTimeString('en-US', { 
            hour12: false, 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
        });
        
        line.innerHTML = `<span class="log-time">[${time}]</span> ${msg}`;
        logs.appendChild(line);
        logs.scrollTop = logs.scrollHeight;
    }
}
