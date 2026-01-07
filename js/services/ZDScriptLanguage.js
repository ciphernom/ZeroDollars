/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║         ZDScript Integration for ExtensionStudio (CodeMirror 6)           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 * 
 * This provides:
 *   - Custom syntax highlighting for ZDScript
 *   - Autocomplete with ZeroDollars API
 *   - Code snippets and templates
 * 
 * SETUP: Add these exports to your editor.bundle.js build:
 *   - StreamLanguage from @codemirror/language  
 *   - autocompletion, CompletionContext from @codemirror/autocomplete
 * 
 * Or use the simple integration (just syntax highlighting via JS mode)
 */

// ============================================================================
// SIMPLE INTEGRATION (works with existing bundle)
// ============================================================================

/**
 * For _getEditorLanguage in ExtensionStudio.js, just add:
 * 
 *   if (filename.endsWith('.zds')) {
 *       return javascript({ typescript: true });
 *   }
 * 
 * This gives you TypeScript-style highlighting which works great for ZDScript.
 */


// ============================================================================
// FULL INTEGRATION (requires bundle additions)
// ============================================================================

/**
 * If you want full ZDScript support, add to editor.bundle.js:
 * 
 *   import { StreamLanguage } from '@codemirror/language';
 *   import { autocompletion } from '@codemirror/autocomplete';
 *   
 *   export { StreamLanguage, autocompletion };
 * 
 * Then use the classes below.
 */

// ZDScript syntax definition for StreamLanguage
const zdscriptStreamParser = {
    name: 'zdscript',
    
    startState() {
        return {
            inString: false,
            stringChar: null,
            inComment: false,
            inBlockComment: false,
        };
    },
    
    token(stream, state) {
        // Block comment
        if (state.inBlockComment) {
            if (stream.match('*/')) {
                state.inBlockComment = false;
                return 'comment';
            }
            stream.next();
            return 'comment';
        }
        
        // Start of block comment
        if (stream.match('/*')) {
            state.inBlockComment = true;
            return 'comment';
        }
        
        // Line comment
        if (stream.match('//')) {
            stream.skipToEnd();
            return 'comment';
        }
        
        // String
        if (state.inString) {
            while (!stream.eol()) {
                const ch = stream.next();
                if (ch === '\\') {
                    stream.next(); // skip escaped char
                } else if (ch === state.stringChar) {
                    state.inString = false;
                    state.stringChar = null;
                    return 'string';
                }
            }
            return 'string';
        }
        
        if (stream.match('"') || stream.match("'")) {
            state.inString = true;
            state.stringChar = stream.current();
            return 'string';
        }
        
        // Decorator
        if (stream.match(/@\w+/)) {
            return 'meta';
        }
        
        // Numbers
        if (stream.match(/0x[0-9a-fA-F]+/) || stream.match(/\d+\.?\d*([eE][+-]?\d+)?/)) {
            return 'number';
        }
        
        // Operators
        if (stream.match(/[+\-*/%&|^~!<>=]+/)) {
            return 'operator';
        }
        
        // Punctuation
        if (stream.match(/[{}()\[\];,.:]/)) {
            return 'punctuation';
        }
        
        // Identifiers and keywords
        if (stream.match(/[a-zA-Z_$]\w*/)) {
            const word = stream.current();
            
            // Keywords
            if (/^(class|extends|abstract|virtual|override|public|private|protected|static|const|let|var|function|return|if|else|while|for|do|break|continue|new|delete|this|super|export|import|from|declare|constructor|destructor|sizeof|as|struct)$/.test(word)) {
                return 'keyword';
            }
            
            // Types
            if (/^(i32|i64|f32|f64|bool|void|ptr)$/.test(word)) {
                return 'type';
            }
            
            // Constants
            if (/^(true|false|null)$/.test(word)) {
                return 'atom';
            }
            
            // Likely class names (capitalized)
            if (/^[A-Z]/.test(word)) {
                return 'typeName';
            }
            
            return 'variableName';
        }
        
        // Skip whitespace
        if (stream.eatSpace()) {
            return null;
        }
        
        stream.next();
        return null;
    },
};


// ZDScript autocomplete
const zdscriptCompletions = [
    // Keywords
    { label: 'class', type: 'keyword', info: 'Declare a class' },
    { label: 'extends', type: 'keyword', info: 'Inherit from a class' },
    { label: 'abstract', type: 'keyword', info: 'Abstract class/method' },
    { label: 'virtual', type: 'keyword', info: 'Virtual method (can be overridden)' },
    { label: 'override', type: 'keyword', info: 'Override a virtual method' },
    { label: 'constructor', type: 'keyword', info: 'Class constructor' },
    { label: 'destructor', type: 'keyword', info: 'Class destructor' },
    { label: 'public', type: 'keyword' },
    { label: 'private', type: 'keyword' },
    { label: 'protected', type: 'keyword' },
    { label: 'static', type: 'keyword' },
    { label: 'export', type: 'keyword', info: 'Export function for WASM' },
    { label: 'declare', type: 'keyword', info: 'Declare external function' },
    { label: 'function', type: 'keyword' },
    { label: 'return', type: 'keyword' },
    { label: 'if', type: 'keyword' },
    { label: 'else', type: 'keyword' },
    { label: 'while', type: 'keyword' },
    { label: 'for', type: 'keyword' },
    { label: 'let', type: 'keyword' },
    { label: 'const', type: 'keyword' },
    { label: 'new', type: 'keyword', info: 'Allocate new object' },
    { label: 'delete', type: 'keyword', info: 'Free object memory' },
    { label: 'this', type: 'keyword' },
    { label: 'super', type: 'keyword', info: 'Call parent constructor' },
    { label: 'sizeof', type: 'keyword', info: 'Get size of type in bytes' },
    
    // Types
    { label: 'i32', type: 'type', info: '32-bit signed integer' },
    { label: 'i64', type: 'type', info: '64-bit signed integer' },
    { label: 'f32', type: 'type', info: '32-bit float' },
    { label: 'f64', type: 'type', info: '64-bit float' },
    { label: 'bool', type: 'type', info: 'Boolean (true/false)' },
    { label: 'void', type: 'type', info: 'No return value' },
    { label: 'ptr', type: 'type', info: 'Pointer type: ptr<T>' },
    
    // ZeroDollars API
    { label: 'getTotalBalance', type: 'function', info: '(): i32 - Total balance in cents', apply: 'getTotalBalance()' },
    { label: 'getAccountCount', type: 'function', info: '(): i32 - Number of accounts', apply: 'getAccountCount()' },
    { label: 'getEnvelopeCount', type: 'function', info: '(): i32 - Number of envelopes', apply: 'getEnvelopeCount()' },
    { label: 'getMonthlySpending', type: 'function', info: '(): i32 - Monthly spending in cents', apply: 'getMonthlySpending()' },
    { label: 'getToBeBudgeted', type: 'function', info: '(): i32 - TBB amount in cents', apply: 'getToBeBudgeted()' },
    { label: 'log', type: 'function', info: '(msg: ptr<i32>): void - Log to console', apply: 'log()' },
    { label: 'showToast', type: 'function', info: '(msg, type): void - Show notification', apply: 'showToast()' },
];

// Snippet completions
const zdscriptSnippets = [
    {
        label: '@external import',
        type: 'snippet',
        apply: `@external("zd", "\${name}")
declare function \${name}(): i32;`,
        info: 'Import ZeroDollars function'
    },
    {
        label: 'export function',
        type: 'snippet',
        apply: `export function \${name}(): i32 {
    return 0;
}`,
        info: 'Exported WASM function'
    },
    {
        label: 'class',
        type: 'snippet',
        apply: `class \${ClassName} {
    private value: i32;
    
    constructor(val: i32) {
        this.value = val;
    }
    
    getValue(): i32 {
        return this.value;
    }
}`,
        info: 'Class with constructor'
    },
    {
        label: 'class extends',
        type: 'snippet',
        apply: `class \${ClassName} extends \${BaseClass} {
    constructor() {
        super();
    }
    
    override method(): i32 {
        return 0;
    }
}`,
        info: 'Class with inheritance'
    },
    {
        label: 'for loop',
        type: 'snippet',
        apply: `for (let i: i32 = 0; i < \${n}; i = i + 1) {
    
}`,
        info: 'For loop'
    },
    {
        label: 'zd-basic',
        type: 'snippet',
        apply: `// ZDScript Extension
@external("zd", "get_total_balance")
declare function getTotalBalance(): i32;

export function run(): i32 {
    return getTotalBalance();
}`,
        info: 'Basic ZDScript template'
    },
];

/**
 * Create ZDScript autocompletion function
 * Use with: autocompletion({ override: [zdscriptAutocomplete] })
 */
function zdscriptAutocomplete(context) {
    const word = context.matchBefore(/\w*/);
    if (!word || (word.from === word.to && !context.explicit)) {
        return null;
    }
    
    return {
        from: word.from,
        options: [...zdscriptCompletions, ...zdscriptSnippets],
    };
}


// ============================================================================
// TEMPLATES
// ============================================================================

const ZDSCRIPT_TEMPLATES = {
    
    basic: `// ZDScript Extension - Basic Template
// Compile with: Build button or Ctrl+B

@external("zd", "get_total_balance")
declare function getTotalBalance(): i32;

@external("zd", "console_log")
declare function log(msg: ptr<i32>): void;

export function run(): i32 {
    let balance: i32 = getTotalBalance();
    return balance;
}
`,

    class: `// ZDScript Extension - With Class
@external("zd", "get_total_balance")
declare function getTotalBalance(): i32;

@external("zd", "get_monthly_spending")
declare function getMonthlySpending(): i32;

class BudgetInfo {
    private balance: i32;
    private spending: i32;
    
    constructor() {
        this.balance = getTotalBalance();
        this.spending = getMonthlySpending();
    }
    
    getSavings(): i32 {
        return this.balance - this.spending;
    }
    
    getSavingsPercent(): i32 {
        if (this.balance <= 0) return 0;
        return (this.getSavings() * 100) / this.balance;
    }
}

let budget: BudgetInfo;

export function init(): i32 {
    budget = new BudgetInfo();
    return 1;
}

export function getSavings(): i32 {
    return budget.getSavings();
}

export function getSavingsPercent(): i32 {
    return budget.getSavingsPercent();
}
`,

    inheritance: `// ZDScript Extension - Inheritance Example
@external("zd", "get_total_balance")
declare function getTotalBalance(): i32;

@external("zd", "get_envelope_count") 
declare function getEnvelopeCount(): i32;

// Abstract base class
abstract class Metric {
    protected weight: i32;
    
    constructor(w: i32) {
        this.weight = w;
    }
    
    abstract calculate(): i32;
    
    getWeightedScore(): i32 {
        return (this.calculate() * this.weight) / 100;
    }
}

// Concrete implementations
class BalanceMetric extends Metric {
    constructor() {
        super(60); // 60% weight
    }
    
    override calculate(): i32 {
        let bal: i32 = getTotalBalance();
        if (bal < 0) return 0;
        if (bal > 100000) return 100;
        return bal / 1000;
    }
}

class OrganizationMetric extends Metric {
    constructor() {
        super(40); // 40% weight
    }
    
    override calculate(): i32 {
        let envelopes: i32 = getEnvelopeCount();
        if (envelopes >= 10) return 100;
        return envelopes * 10;
    }
}

// Global metrics
let balanceMetric: BalanceMetric;
let orgMetric: OrganizationMetric;

export function init(): i32 {
    balanceMetric = new BalanceMetric();
    orgMetric = new OrganizationMetric();
    return 1;
}

export function getHealthScore(): i32 {
    return balanceMetric.getWeightedScore() + orgMetric.getWeightedScore();
}
`,

    full: `// ZDScript Extension - Full Example
// A complete budget analyzer with multiple metrics

// ═══════════════════════════════════════════════════════════
// IMPORTS
// ═══════════════════════════════════════════════════════════

@external("zd", "get_total_balance")
declare function getTotalBalance(): i32;

@external("zd", "get_account_count")
declare function getAccountCount(): i32;

@external("zd", "get_envelope_count")
declare function getEnvelopeCount(): i32;

@external("zd", "get_monthly_spending")
declare function getMonthlySpending(): i32;

@external("zd", "get_tbb")
declare function getToBeBudgeted(): i32;

@external("zd", "set_result_i32")
declare function setResult(key: i32, value: i32): void;

// ═══════════════════════════════════════════════════════════
// UTILITY CLASS
// ═══════════════════════════════════════════════════════════

class MathUtil {
    static clamp(val: i32, min: i32, max: i32): i32 {
        if (val < min) return min;
        if (val > max) return max;
        return val;
    }
    
    static percent(part: i32, whole: i32): i32 {
        if (whole == 0) return 0;
        return (part * 100) / whole;
    }
}

// ═══════════════════════════════════════════════════════════
// ANALYZER CLASS
// ═══════════════════════════════════════════════════════════

class BudgetAnalyzer {
    private monthlyIncome: i32;
    
    constructor(income: i32) {
        this.monthlyIncome = income;
    }
    
    // Savings rate as percentage (0-100)
    getSavingsRate(): i32 {
        if (this.monthlyIncome <= 0) return 0;
        let spending: i32 = getMonthlySpending();
        let savings: i32 = this.monthlyIncome - spending;
        return MathUtil.clamp(MathUtil.percent(savings, this.monthlyIncome), 0, 100);
    }
    
    // Budget health score (0-100)
    getHealthScore(): i32 {
        let score: i32 = 0;
        
        // TBB component (0-30 points)
        let tbb: i32 = getToBeBudgeted();
        if (tbb >= 0) {
            score = score + 30;
        } else if (tbb > 0 - 10000) {
            score = score + 15;
        }
        
        // Balance component (0-30 points)
        let balance: i32 = getTotalBalance();
        if (balance > 0) {
            score = score + MathUtil.clamp(balance / 10000, 0, 30);
        }
        
        // Organization component (0-20 points)
        let envelopes: i32 = getEnvelopeCount();
        score = score + MathUtil.clamp(envelopes * 2, 0, 20);
        
        // Savings rate component (0-20 points)
        score = score + MathUtil.clamp(this.getSavingsRate() / 5, 0, 20);
        
        return score;
    }
    
    // Store all results for JS to retrieve
    analyze(): i32 {
        let savings: i32 = this.getSavingsRate();
        let health: i32 = this.getHealthScore();
        
        setResult(0, savings);
        setResult(1, health);
        setResult(2, getTotalBalance());
        setResult(3, getMonthlySpending());
        
        return health;
    }
}

// ═══════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════

let analyzer: BudgetAnalyzer;

export function init(monthlyIncome: i32): i32 {
    analyzer = new BudgetAnalyzer(monthlyIncome);
    return 1;
}

export function analyze(): i32 {
    return analyzer.analyze();
}

export function getSavingsRate(): i32 {
    return analyzer.getSavingsRate();
}

export function getHealthScore(): i32 {
    return analyzer.getHealthScore();
}
`,
};


// ============================================================================
// EXPORTS
// ============================================================================

export { 
    zdscriptStreamParser,
    zdscriptCompletions,
    zdscriptSnippets,
    zdscriptAutocomplete,
    ZDSCRIPT_TEMPLATES,
};

export default {
    streamParser: zdscriptStreamParser,
    completions: zdscriptCompletions,
    snippets: zdscriptSnippets,
    autocomplete: zdscriptAutocomplete,
    templates: ZDSCRIPT_TEMPLATES,
};
