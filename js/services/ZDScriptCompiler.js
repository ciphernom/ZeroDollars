/**
 * ╔═══════════════════════════════════════════════════════════════════════════╗
 * ║                    ZDSCRIPT COMPILER V2 - SELF-HOSTING                    ║
 * ╠═══════════════════════════════════════════════════════════════════════════╣
 * ║  Extended version with:                                                    ║
 * ║    - Generics (Vec<T>, Map<K,V>)                                          ║
 * ║    - Built-in String type                                                 ║
 * ║    - Nullable types (T?)                                                  ║
 * ║    - For-each loops                                                       ║
 * ║    - Runtime library                                                      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1: LEXER
// ═══════════════════════════════════════════════════════════════════════════

const TokenType = {
    // Literals
    NUMBER: 'NUMBER',
    STRING: 'STRING',
    IDENTIFIER: 'IDENTIFIER',
    
    // Keywords
    FUNCTION: 'FUNCTION',
    CLASS: 'CLASS',
    STRUCT: 'STRUCT',
    EXTENDS: 'EXTENDS',
    RETURN: 'RETURN',
    IF: 'IF',
    ELSE: 'ELSE',
    WHILE: 'WHILE',
    FOR: 'FOR',
    IN: 'IN',           // NEW: for-in loops
    DO: 'DO',
    BREAK: 'BREAK',
    CONTINUE: 'CONTINUE',
    LET: 'LET',
    CONST: 'CONST',
    VAR: 'VAR',
    NEW: 'NEW',
    DELETE: 'DELETE',
    THIS: 'THIS',
    SUPER: 'SUPER',
    NULL: 'NULL',       // NEW: null literal
    TRUE: 'TRUE',
    FALSE: 'FALSE',
    VOID: 'VOID',
    EXPORT: 'EXPORT',
    IMPORT: 'IMPORT',
    FROM: 'FROM',
    DECLARE: 'DECLARE',
    ABSTRACT: 'ABSTRACT',
    VIRTUAL: 'VIRTUAL',
    OVERRIDE: 'OVERRIDE',
    STATIC: 'STATIC',
    PUBLIC: 'PUBLIC',
    PRIVATE: 'PRIVATE',
    PROTECTED: 'PROTECTED',
    CONSTRUCTOR: 'CONSTRUCTOR',
    DESTRUCTOR: 'DESTRUCTOR',
    SIZEOF: 'SIZEOF',
    AS: 'AS',
    
    // Control Flow & Exceptions
    SWITCH: 'SWITCH',
    CASE: 'CASE',
    DEFAULT: 'DEFAULT',
    TRY: 'TRY',
    CATCH: 'CATCH',
    FINALLY: 'FINALLY',
    THROW: 'THROW',
    INSTANCEOF: 'INSTANCEOF', // Operator    
    
    // Types
    I32: 'I32',
    I64: 'I64',
    F32: 'F32',
    F64: 'F64',
    BOOL: 'BOOL',
    PTR: 'PTR',
    STRING_TYPE: 'STRING_TYPE',  // NEW: String type keyword
    
    // Operators
    PLUS: 'PLUS',
    MINUS: 'MINUS',
    STAR: 'STAR',
    SLASH: 'SLASH',
    PERCENT: 'PERCENT',
    AMPERSAND: 'AMPERSAND',
    PIPE: 'PIPE',
    CARET: 'CARET',
    TILDE: 'TILDE',
    LSHIFT: 'LSHIFT',
    RSHIFT: 'RSHIFT',
    AMPAMP: 'AMPAMP',
    PIPEPIPE: 'PIPEPIPE',
    BANG: 'BANG',
    EQ: 'EQ',
    EQEQ: 'EQEQ',
    NEQ: 'NEQ',
    LT: 'LT',
    GT: 'GT',
    LTE: 'LTE',
    GTE: 'GTE',
    PLUSPLUS: 'PLUSPLUS',
    MINUSMINUS: 'MINUSMINUS',
    PLUSEQ: 'PLUSEQ',
    MINUSEQ: 'MINUSEQ',
    STAREQ: 'STAREQ',
    SLASHEQ: 'SLASHEQ',
    QUESTION: 'QUESTION',
    QUESTIONDOT: 'QUESTIONDOT',  // NEW: ?. optional chaining
    NULLCOALESCE: 'NULLCOALESCE', // NEW: ?? null coalescing
    
    // Punctuation
    LPAREN: 'LPAREN',
    RPAREN: 'RPAREN',
    LBRACE: 'LBRACE',
    RBRACE: 'RBRACE',
    LBRACKET: 'LBRACKET',
    RBRACKET: 'RBRACKET',
    SEMICOLON: 'SEMICOLON',
    COLON: 'COLON',
    COMMA: 'COMMA',
    DOT: 'DOT',
    AT: 'AT',
    ARROW: 'ARROW',
    
    // Special
    EOF: 'EOF',
};

const KEYWORDS = {
    'function': TokenType.FUNCTION,
    'class': TokenType.CLASS,
    'struct': TokenType.STRUCT,
    'extends': TokenType.EXTENDS,
    'return': TokenType.RETURN,
    'if': TokenType.IF,
    'else': TokenType.ELSE,
    'while': TokenType.WHILE,
    'for': TokenType.FOR,
    'in': TokenType.IN,
    'do': TokenType.DO,
    'break': TokenType.BREAK,
    'continue': TokenType.CONTINUE,
    'let': TokenType.LET,
    'const': TokenType.CONST,
    'var': TokenType.VAR,
    'new': TokenType.NEW,
    'delete': TokenType.DELETE,
    'this': TokenType.THIS,
    'super': TokenType.SUPER,
    'null': TokenType.NULL,
    'true': TokenType.TRUE,
    'false': TokenType.FALSE,
    'void': TokenType.VOID,
    'export': TokenType.EXPORT,
    'import': TokenType.IMPORT,
    'from': TokenType.FROM,
    'declare': TokenType.DECLARE,
    'abstract': TokenType.ABSTRACT,
    'virtual': TokenType.VIRTUAL,
    'override': TokenType.OVERRIDE,
    'static': TokenType.STATIC,
    'public': TokenType.PUBLIC,
    'private': TokenType.PRIVATE,
    'protected': TokenType.PROTECTED,
    'constructor': TokenType.CONSTRUCTOR,
    'destructor': TokenType.DESTRUCTOR,
    'sizeof': TokenType.SIZEOF,
    'as': TokenType.AS,
    'switch': TokenType.SWITCH,
    'case': TokenType.CASE,
    'default': TokenType.DEFAULT,
    'try': TokenType.TRY,
    'catch': TokenType.CATCH,
    'finally': TokenType.FINALLY,
    'throw': TokenType.THROW,
    'instanceof': TokenType.INSTANCEOF,
    'i32': TokenType.I32,
    'i64': TokenType.I64,
    'f32': TokenType.F32,
    'f64': TokenType.F64,
    'bool': TokenType.BOOL,
    'ptr': TokenType.PTR,
    'String': TokenType.STRING_TYPE,
};

class Token {
    constructor(type, value, line, column) {
        this.type = type;
        this.value = value;
        this.line = line;
        this.column = column;
    }
}

class Lexer {
    constructor(source) {
        this.source = source;
        this.pos = 0;
        this.line = 1;
        this.column = 1;
        this.tokens = [];
    }
    
    tokenize() {
        while (this.pos < this.source.length) {
            this.skipWhitespaceAndComments();
            if (this.pos >= this.source.length) break;
            
            const token = this.nextToken();
            if (token) {
                this.tokens.push(token);
            }
        }
        
        this.tokens.push(new Token(TokenType.EOF, '', this.line, this.column));
        return this.tokens;
    }
    
    skipWhitespaceAndComments() {
        while (this.pos < this.source.length) {
            const c = this.source[this.pos];
            
            if (c === ' ' || c === '\t' || c === '\r') {
                this.pos++;
                this.column++;
            } else if (c === '\n') {
                this.pos++;
                this.line++;
                this.column = 1;
            } else if (c === '/' && this.source[this.pos + 1] === '/') {
                // Line comment
                while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
                    this.pos++;
                }
            } else if (c === '/' && this.source[this.pos + 1] === '*') {
                // Block comment
                this.pos += 2;
                this.column += 2;
                while (this.pos < this.source.length - 1) {
                    if (this.source[this.pos] === '*' && this.source[this.pos + 1] === '/') {
                        this.pos += 2;
                        this.column += 2;
                        break;
                    }
                    if (this.source[this.pos] === '\n') {
                        this.line++;
                        this.column = 1;
                    } else {
                        this.column++;
                    }
                    this.pos++;
                }
            } else {
                break;
            }
        }
    }
    
    nextToken() {
        const startLine = this.line;
        const startColumn = this.column;
        const c = this.source[this.pos];
        
        // Numbers
        if (this.isDigit(c) || (c === '.' && this.isDigit(this.source[this.pos + 1]))) {
            return this.readNumber(startLine, startColumn);
        }
        
        // Strings
        if (c === '"' || c === "'") {
            return this.readString(c, startLine, startColumn);
        }
        
        // Identifiers and keywords
        if (this.isAlpha(c) || c === '_') {
            return this.readIdentifier(startLine, startColumn);
        }
        
        // Operators and punctuation
        return this.readOperator(startLine, startColumn);
    }
    
    readNumber(line, column) {
        let value = '';
        let isFloat = false;
        let isHex = false;
        
        if (this.source[this.pos] === '0' && (this.source[this.pos + 1] === 'x' || this.source[this.pos + 1] === 'X')) {
            isHex = true;
            value += this.source[this.pos++];
            value += this.source[this.pos++];
            this.column += 2;
            
            while (this.pos < this.source.length && this.isHexDigit(this.source[this.pos])) {
                value += this.source[this.pos++];
                this.column++;
            }
        } else {
            while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
                value += this.source[this.pos++];
                this.column++;
            }
            
            if (this.source[this.pos] === '.' && this.isDigit(this.source[this.pos + 1])) {
                isFloat = true;
                value += this.source[this.pos++];
                this.column++;
                
                while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
                    value += this.source[this.pos++];
                    this.column++;
                }
            }
            
            if (this.source[this.pos] === 'e' || this.source[this.pos] === 'E') {
                isFloat = true;
                value += this.source[this.pos++];
                this.column++;
                
                if (this.source[this.pos] === '+' || this.source[this.pos] === '-') {
                    value += this.source[this.pos++];
                    this.column++;
                }
                
                while (this.pos < this.source.length && this.isDigit(this.source[this.pos])) {
                    value += this.source[this.pos++];
                    this.column++;
                }
            }
        }
        
        return new Token(TokenType.NUMBER, isHex ? parseInt(value, 16) : (isFloat ? parseFloat(value) : parseInt(value, 10)), line, column);
    }
    
    readString(quote, line, column) {
        let value = '';
        this.pos++;
        this.column++;
        
        while (this.pos < this.source.length && this.source[this.pos] !== quote) {
            if (this.source[this.pos] === '\\') {
                this.pos++;
                this.column++;
                const escaped = this.source[this.pos];
                switch (escaped) {
                    case 'n': value += '\n'; break;
                    case 't': value += '\t'; break;
                    case 'r': value += '\r'; break;
                    case '\\': value += '\\'; break;
                    case '"': value += '"'; break;
                    case "'": value += "'"; break;
                    case '0': value += '\0'; break;
                    default: value += escaped;
                }
            } else {
                if (this.source[this.pos] === '\n') {
                    this.line++;
                    this.column = 0;
                }
                value += this.source[this.pos];
            }
            this.pos++;
            this.column++;
        }
        
        this.pos++; // Skip closing quote
        this.column++;
        
        return new Token(TokenType.STRING, value, line, column);
    }
    
    readIdentifier(line, column) {
        let value = '';
        
        while (this.pos < this.source.length && (this.isAlphaNumeric(this.source[this.pos]) || this.source[this.pos] === '_')) {
            value += this.source[this.pos++];
            this.column++;
        }
        
        const keyword = KEYWORDS[value];
        if (keyword) {
            return new Token(keyword, value, line, column);
        }
        
        return new Token(TokenType.IDENTIFIER, value, line, column);
    }
    
    readOperator(line, column) {
        const c = this.source[this.pos];
        const next = this.source[this.pos + 1];
        
        // Two-character operators
        const twoChar = c + (next || '');
        const twoCharOps = {
            '++': TokenType.PLUSPLUS,
            '--': TokenType.MINUSMINUS,
            '+=': TokenType.PLUSEQ,
            '-=': TokenType.MINUSEQ,
            '*=': TokenType.STAREQ,
            '/=': TokenType.SLASHEQ,
            '==': TokenType.EQEQ,
            '!=': TokenType.NEQ,
            '<=': TokenType.LTE,
            '>=': TokenType.GTE,
            '&&': TokenType.AMPAMP,
            '||': TokenType.PIPEPIPE,
            '<<': TokenType.LSHIFT,
            '>>': TokenType.RSHIFT,
            '->': TokenType.ARROW,
            '?.': TokenType.QUESTIONDOT,
            '??': TokenType.NULLCOALESCE,
        };
        
        if (twoCharOps[twoChar]) {
            this.pos += 2;
            this.column += 2;
            return new Token(twoCharOps[twoChar], twoChar, line, column);
        }
        
        // Single-character operators
        const singleOps = {
            '+': TokenType.PLUS,
            '-': TokenType.MINUS,
            '*': TokenType.STAR,
            '/': TokenType.SLASH,
            '%': TokenType.PERCENT,
            '&': TokenType.AMPERSAND,
            '|': TokenType.PIPE,
            '^': TokenType.CARET,
            '~': TokenType.TILDE,
            '!': TokenType.BANG,
            '=': TokenType.EQ,
            '<': TokenType.LT,
            '>': TokenType.GT,
            '?': TokenType.QUESTION,
            '(': TokenType.LPAREN,
            ')': TokenType.RPAREN,
            '{': TokenType.LBRACE,
            '}': TokenType.RBRACE,
            '[': TokenType.LBRACKET,
            ']': TokenType.RBRACKET,
            ';': TokenType.SEMICOLON,
            ':': TokenType.COLON,
            ',': TokenType.COMMA,
            '.': TokenType.DOT,
            '@': TokenType.AT,
        };
        
        if (singleOps[c]) {
            this.pos++;
            this.column++;
            return new Token(singleOps[c], c, line, column);
        }
        
        throw new Error(`Unexpected character '${c}' at line ${line}, column ${column}`);
    }
    
    isDigit(c) {
        return c >= '0' && c <= '9';
    }
    
    isHexDigit(c) {
        return this.isDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
    }
    
    isAlpha(c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
    }
    
    isAlphaNumeric(c) {
        return this.isAlpha(c) || this.isDigit(c);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2: AST NODES
// ═══════════════════════════════════════════════════════════════════════════

class ASTNode {
    constructor(nodeType, line, column) {
        this.nodeType = nodeType;
        this.line = line;
        this.column = column;
    }
}

// Program
class Program extends ASTNode {
    constructor(declarations) {
        super('Program', 1, 1);
        this.declarations = declarations;
    }
}

// Declarations
class VarDecl extends ASTNode {
    constructor(name, type, initializer, isConst, line, column) {
        super('VarDecl', line, column);
        this.name = name;
        this.type = type;
        this.initializer = initializer;
        this.isConst = isConst;
    }
}

class FunctionDecl extends ASTNode {
    constructor(name, returnType, params, body, isExport, line, column) {
        super('FunctionDecl', line, column);
        this.name = name;
        this.returnType = returnType;
        this.params = params;
        this.body = body;
        this.isExport = isExport;
    }
}

class ExternalDecl extends ASTNode {
    constructor(module, name, funcName, returnType, params, line, column) {
        super('ExternalDecl', line, column);
        this.module = module;
        this.name = name;
        this.funcName = funcName;
        this.returnType = returnType;
        this.params = params;
    }
}

class ClassDecl extends ASTNode {
    constructor(name, baseClass, members, isAbstract, typeParams, line, column) {
        super('ClassDecl', line, column);
        this.name = name;
        this.baseClass = baseClass;
        this.members = members;
        this.isAbstract = isAbstract;
        this.typeParams = typeParams; // NEW: Generic type parameters
    }
}

class StructDecl extends ASTNode {
    constructor(name, fields, line, column) {
        super('StructDecl', line, column);
        this.name = name;
        this.fields = fields;
    }
}

class FieldDecl extends ASTNode {
    constructor(name, type, visibility, isStatic, initializer, line, column) {
        super('FieldDecl', line, column);
        this.name = name;
        this.type = type;
        this.visibility = visibility;
        this.isStatic = isStatic;
        this.initializer = initializer;
    }
}

class MethodDecl extends ASTNode {
    constructor(name, returnType, params, body, visibility, isStatic, isVirtual, isAbstract, isOverride, line, column) {
        super('MethodDecl', line, column);
        this.name = name;
        this.returnType = returnType;
        this.params = params;
        this.body = body;
        this.visibility = visibility;
        this.isStatic = isStatic;
        this.isVirtual = isVirtual;
        this.isAbstract = isAbstract;
        this.isOverride = isOverride;
    }
}

class ConstructorDecl extends ASTNode {
    constructor(params, body, line, column) {
        super('ConstructorDecl', line, column);
        this.params = params;
        this.body = body;
    }
}

class DestructorDecl extends ASTNode {
    constructor(body, line, column) {
        super('DestructorDecl', line, column);
        this.body = body;
    }
}

class Parameter extends ASTNode {
    constructor(name, type, line, column) {
        super('Parameter', line, column);
        this.name = name;
        this.type = type;
    }
}

// Type nodes
class PrimitiveType extends ASTNode {
    constructor(name, line, column) {
        super('PrimitiveType', line, column);
        this.name = name;
    }
}

class PointerType extends ASTNode {
    constructor(elementType, line, column) {
        super('PointerType', line, column);
        this.elementType = elementType;
    }
}

class ClassType extends ASTNode {
    constructor(name, typeArgs, line, column) {
        super('ClassType', line, column);
        this.name = name;
        this.typeArgs = typeArgs || []; // NEW: Generic type arguments
    }
}

class NullableType extends ASTNode {
    constructor(innerType, line, column) {
        super('NullableType', line, column);
        this.innerType = innerType;
    }
}

class StringType extends ASTNode {
    constructor(line, column) {
        super('StringType', line, column);
    }
}

// Statements
class BlockStmt extends ASTNode {
    constructor(statements, line, column) {
        super('BlockStmt', line, column);
        this.statements = statements;
    }
}

class ExprStmt extends ASTNode {
    constructor(expression, line, column) {
        super('ExprStmt', line, column);
        this.expression = expression;
    }
}

class ReturnStmt extends ASTNode {
    constructor(value, line, column) {
        super('ReturnStmt', line, column);
        this.value = value;
    }
}

class IfStmt extends ASTNode {
    constructor(condition, thenBranch, elseBranch, line, column) {
        super('IfStmt', line, column);
        this.condition = condition;
        this.thenBranch = thenBranch;
        this.elseBranch = elseBranch;
    }
}

class WhileStmt extends ASTNode {
    constructor(condition, body, line, column) {
        super('WhileStmt', line, column);
        this.condition = condition;
        this.body = body;
    }
}

class DoWhileStmt extends ASTNode {
    constructor(body, condition, line, column) {
        super('DoWhileStmt', line, column);
        this.body = body;
        this.condition = condition;
    }
}

class ForStmt extends ASTNode {
    constructor(init, condition, update, body, line, column) {
        super('ForStmt', line, column);
        this.init = init;
        this.condition = condition;
        this.update = update;
        this.body = body;
    }
}

class ForEachStmt extends ASTNode {
    constructor(variable, varType, iterable, body, line, column) {
        super('ForEachStmt', line, column);
        this.variable = variable;
        this.varType = varType;
        this.iterable = iterable;
        this.body = body;
    }
}

class BreakStmt extends ASTNode {
    constructor(line, column) {
        super('BreakStmt', line, column);
    }
}

class ContinueStmt extends ASTNode {
    constructor(line, column) {
        super('ContinueStmt', line, column);
    }
}

class SwitchStmt extends ASTNode {
    constructor(discriminant, cases, defaultCase, line, column) {
        super('SwitchStmt', line, column);
        this.discriminant = discriminant;
        this.cases = cases;        
        this.defaultCase = defaultCase; 
    }
}

class SwitchCase extends ASTNode {
    constructor(value, body, line, column) {
        super('SwitchCase', line, column);
        this.value = value;
        this.body = body;
    }
}

class TryStmt extends ASTNode {
    constructor(tryBlock, catchVar, catchBlock, finallyBlock, line, column) {
        super('TryStmt', line, column);
        this.tryBlock = tryBlock;
        this.catchVar = catchVar;
        this.catchBlock = catchBlock;
        this.finallyBlock = finallyBlock;
    }
}

class ThrowStmt extends ASTNode {
    constructor(expression, line, column) {
        super('ThrowStmt', line, column);
        this.expression = expression;
    }
}


class VarDeclStmt extends ASTNode {
    constructor(name, type, initializer, isConst, line, column) {
        super('VarDeclStmt', line, column);
        this.name = name;
        this.type = type;
        this.initializer = initializer;
        this.isConst = isConst;
    }
}

class DeleteStmt extends ASTNode {
    constructor(expression, line, column) {
        super('DeleteStmt', line, column);
        this.expression = expression;
    }
}

// Expressions
class LiteralExpr extends ASTNode {
    constructor(value, literalType, line, column) {
        super('LiteralExpr', line, column);
        this.value = value;
        this.literalType = literalType; // 'number', 'string', 'bool', 'null'
    }
}

class IdentifierExpr extends ASTNode {
    constructor(name, line, column) {
        super('IdentifierExpr', line, column);
        this.name = name;
    }
}

class BinaryExpr extends ASTNode {
    constructor(left, operator, right, line, column) {
        super('BinaryExpr', line, column);
        this.left = left;
        this.operator = operator;
        this.right = right;
    }
}

class UnaryExpr extends ASTNode {
    constructor(operator, operand, isPrefix, line, column) {
        super('UnaryExpr', line, column);
        this.operator = operator;
        this.operand = operand;
        this.isPrefix = isPrefix;
    }
}

class CallExpr extends ASTNode {
    constructor(callee, args, line, column) {
        super('CallExpr', line, column);
        this.callee = callee;
        this.args = args;
    }
}

class MemberExpr extends ASTNode {
    constructor(object, property, line, column) {
        super('MemberExpr', line, column);
        this.object = object;
        this.property = property;
    }
}

class IndexExpr extends ASTNode {
    constructor(object, index, line, column) {
        super('IndexExpr', line, column);
        this.object = object;
        this.index = index;
    }
}

class AssignExpr extends ASTNode {
    constructor(target, operator, value, line, column) {
        super('AssignExpr', line, column);
        this.target = target;
        this.operator = operator;
        this.value = value;
    }
}

class TernaryExpr extends ASTNode {
    constructor(condition, thenExpr, elseExpr, line, column) {
        super('TernaryExpr', line, column);
        this.condition = condition;
        this.thenExpr = thenExpr;
        this.elseExpr = elseExpr;
    }
}

class InstanceOfExpr extends ASTNode {
    constructor(left, targetType, line, column) {
        super('InstanceOfExpr', line, column);
        this.left = left;
        this.targetType = targetType;
        this.targetClassInfo = null; // Resolved during analysis
    }
}

class CastExpr extends ASTNode {
    constructor(expression, targetType, line, column) {
        super('CastExpr', line, column);
        this.expression = expression;
        this.targetType = targetType;
    }
}

class NewExpr extends ASTNode {
    constructor(className, typeArgs, args, line, column) {
        super('NewExpr', line, column);
        this.className = className;
        this.typeArgs = typeArgs || []; // NEW: Generic type arguments
        this.args = args;
    }
}

class ThisExpr extends ASTNode {
    constructor(line, column) {
        super('ThisExpr', line, column);
    }
}

class SuperExpr extends ASTNode {
    constructor(line, column) {
        super('SuperExpr', line, column);
    }
}

class NullExpr extends ASTNode {
    constructor(line, column) {
        super('NullExpr', line, column);
    }
}

class SizeofExpr extends ASTNode {
    constructor(targetType, line, column) {
        super('SizeofExpr', line, column);
        this.targetType = targetType;
    }
}

class NullCoalesceExpr extends ASTNode {
    constructor(left, right, line, column) {
        super('NullCoalesceExpr', line, column);
        this.left = left;
        this.right = right;
    }
}

class OptionalChainExpr extends ASTNode {
    constructor(object, property, line, column) {
        super('OptionalChainExpr', line, column);
        this.object = object;
        this.property = property;
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3: PARSER
// ═══════════════════════════════════════════════════════════════════════════

class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.pos = 0;
    }
    
    parse() {
        const declarations = [];
        
        while (!this.isAtEnd()) {
            const decl = this.parseDeclaration();
            if (decl) {
                declarations.push(decl);
            }
        }
        
        return new Program(declarations);
    }
    
    // Utility methods
    peek() {
        return this.tokens[this.pos];
    }
    
    previous() {
        return this.tokens[this.pos - 1];
    }
    
    isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }
    
    check(type) {
        if (this.isAtEnd()) return false;
        return this.peek().type === type;
    }
    
    advance() {
        if (!this.isAtEnd()) this.pos++;
        return this.previous();
    }
    
    match(...types) {
        for (const type of types) {
            if (this.check(type)) {
                this.advance();
                return true;
            }
        }
        return false;
    }
    
    consume(type, message) {
        if (this.check(type)) return this.advance();
        const token = this.peek();
        throw new Error(`Parse error at line ${token.line}, column ${token.column}: ${message} (got ${token.type})`);
    }
    
    // Special consume for '>' that handles '>>' (RSHIFT) for nested generics like Vec<Vec<i32>>
    consumeGT(message) {
        if (this.check(TokenType.GT)) {
            return this.advance();
        }
        // Handle '>>' which lexer sees as RSHIFT - split it into two GT tokens
        if (this.check(TokenType.RSHIFT)) {
            const token = this.peek();
            // Transform RSHIFT into GT for current position
            this.tokens[this.pos] = new Token(TokenType.GT, '>', token.line, token.column);
            // Insert another GT after
            this.tokens.splice(this.pos + 1, 0, new Token(TokenType.GT, '>', token.line, token.column + 1));
            return this.advance();
        }
        const token = this.peek();
        throw new Error(`Parse error at line ${token.line}, column ${token.column}: ${message} (got ${token.type})`);
    }
    
    // Declaration parsing
    parseDeclaration() {
        // Check for decorators
        let decorator = null;
        if (this.match(TokenType.AT)) {
            decorator = this.parseDecorator();
        }
        
        if (this.match(TokenType.EXPORT)) {
            return this.parseExportDeclaration();
        }
        
        if (this.match(TokenType.DECLARE)) {
            return this.parseDeclareDeclaration(decorator);
        }
        
        if (this.check(TokenType.ABSTRACT) || this.check(TokenType.CLASS)) {
            return this.parseClassDeclaration();
        }
        
        if (this.check(TokenType.STRUCT)) {
            return this.parseStructDeclaration();
        }
        
        if (this.check(TokenType.FUNCTION)) {
            return this.parseFunctionDeclaration(false);
        }
        
        if (this.match(TokenType.LET) || this.match(TokenType.CONST) || this.match(TokenType.VAR)) {
            return this.parseGlobalVarDeclaration(this.previous().type === TokenType.CONST);
        }
        
        throw new Error(`Unexpected token at line ${this.peek().line}: ${this.peek().type}`);
    }
    
    parseDecorator() {
        const name = this.consume(TokenType.IDENTIFIER, 'Expected decorator name');
        const args = [];
        
        if (this.match(TokenType.LPAREN)) {
            if (!this.check(TokenType.RPAREN)) {
                do {
                    args.push(this.consume(TokenType.STRING, 'Expected string argument').value);
                } while (this.match(TokenType.COMMA));
            }
            this.consume(TokenType.RPAREN, 'Expected )');
        }
        
        return { name: name.value, args };
    }
    
    parseExportDeclaration() {
        if (this.check(TokenType.FUNCTION)) {
            return this.parseFunctionDeclaration(true);
        }
        throw new Error(`Can only export functions at line ${this.peek().line}`);
    }
    
    parseDeclareDeclaration(decorator) {
        this.consume(TokenType.FUNCTION, 'Expected function after declare');
        const name = this.consume(TokenType.IDENTIFIER, 'Expected function name');
        
        this.consume(TokenType.LPAREN, 'Expected (');
        const params = this.parseParameters();
        this.consume(TokenType.RPAREN, 'Expected )');
        
        let returnType = null;
        if (this.match(TokenType.COLON)) {
            returnType = this.parseType();
        }
        
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        
        let module = 'env', externalName = name.value;
        if (decorator && decorator.name === 'external' && decorator.args.length >= 2) {
            module = decorator.args[0];
            externalName = decorator.args[1];
        }
        
        return new ExternalDecl(
            module, externalName, name.value, returnType, params,
            name.line, name.column
        );
    }
    
    parseFunctionDeclaration(isExport) {
        this.consume(TokenType.FUNCTION, 'Expected function');
        const name = this.consume(TokenType.IDENTIFIER, 'Expected function name');
        
        this.consume(TokenType.LPAREN, 'Expected (');
        const params = this.parseParameters();
        this.consume(TokenType.RPAREN, 'Expected )');
        
        let returnType = null;
        if (this.match(TokenType.COLON)) {
            returnType = this.parseType();
        }
        
        const body = this.parseBlock();
        
        return new FunctionDecl(name.value, returnType, params, body, isExport, name.line, name.column);
    }
    
    parseClassDeclaration() {
        const isAbstract = this.match(TokenType.ABSTRACT);
        this.consume(TokenType.CLASS, 'Expected class');
        const name = this.consume(TokenType.IDENTIFIER, 'Expected class name');
        
        // Parse type parameters: class Vec<T>
        let typeParams = [];
        if (this.match(TokenType.LT)) {
            do {
                typeParams.push(this.consume(TokenType.IDENTIFIER, 'Expected type parameter').value);
            } while (this.match(TokenType.COMMA));
            this.consume(TokenType.GT, 'Expected >');
        }
        
        let baseClass = null;
        if (this.match(TokenType.EXTENDS)) {
            baseClass = this.consume(TokenType.IDENTIFIER, 'Expected base class name').value;
        }
        
        this.consume(TokenType.LBRACE, 'Expected {');
        
        const members = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            members.push(this.parseClassMember());
        }
        
        this.consume(TokenType.RBRACE, 'Expected }');
        
        return new ClassDecl(name.value, baseClass, members, isAbstract, typeParams, name.line, name.column);
    }
    
    parseClassMember() {
        const startToken = this.peek();
        
        // Parse modifiers
        let visibility = 'public';
        let isStatic = false;
        let isVirtual = false;
        let isAbstract = false;
        let isOverride = false;
        
        while (true) {
            if (this.match(TokenType.PUBLIC)) { visibility = 'public'; }
            else if (this.match(TokenType.PRIVATE)) { visibility = 'private'; }
            else if (this.match(TokenType.PROTECTED)) { visibility = 'protected'; }
            else if (this.match(TokenType.STATIC)) { isStatic = true; }
            else if (this.match(TokenType.VIRTUAL)) { isVirtual = true; }
            else if (this.match(TokenType.ABSTRACT)) { isAbstract = true; }
            else if (this.match(TokenType.OVERRIDE)) { isOverride = true; }
            else break;
        }
        
        // Constructor
        if (this.match(TokenType.CONSTRUCTOR)) {
            this.consume(TokenType.LPAREN, 'Expected (');
            const params = this.parseParameters();
            this.consume(TokenType.RPAREN, 'Expected )');
            const body = this.parseBlock();
            return new ConstructorDecl(params, body, startToken.line, startToken.column);
        }
        
        // Destructor
        if (this.match(TokenType.DESTRUCTOR)) {
            this.consume(TokenType.LPAREN, 'Expected (');
            this.consume(TokenType.RPAREN, 'Expected )');
            const body = this.parseBlock();
            return new DestructorDecl(body, startToken.line, startToken.column);
        }
        
        // Method or field
        const name = this.consume(TokenType.IDENTIFIER, 'Expected member name');
        
        // Method
        if (this.check(TokenType.LPAREN)) {
            this.consume(TokenType.LPAREN, 'Expected (');
            const params = this.parseParameters();
            this.consume(TokenType.RPAREN, 'Expected )');
            
            let returnType = null;
            if (this.match(TokenType.COLON)) {
                returnType = this.parseType();
            }
            
            let body = null;
            if (isAbstract) {
                this.consume(TokenType.SEMICOLON, 'Expected ;');
            } else {
                body = this.parseBlock();
            }
            
            return new MethodDecl(
                name.value, returnType, params, body,
                visibility, isStatic, isVirtual, isAbstract, isOverride,
                name.line, name.column
            );
        }
        
        // Field
        this.consume(TokenType.COLON, 'Expected :');
        const fieldType = this.parseType();
        
        let initializer = null;
        if (this.match(TokenType.EQ)) {
            initializer = this.parseExpression();
        }
        
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        
        return new FieldDecl(name.value, fieldType, visibility, isStatic, initializer, name.line, name.column);
    }
    
    parseStructDeclaration() {
        this.consume(TokenType.STRUCT, 'Expected struct');
        const name = this.consume(TokenType.IDENTIFIER, 'Expected struct name');
        
        this.consume(TokenType.LBRACE, 'Expected {');
        
        const fields = [];
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            const fieldName = this.consume(TokenType.IDENTIFIER, 'Expected field name');
            this.consume(TokenType.COLON, 'Expected :');
            const fieldType = this.parseType();
            this.consume(TokenType.SEMICOLON, 'Expected ;');
            
            fields.push(new FieldDecl(fieldName.value, fieldType, 'public', false, null, fieldName.line, fieldName.column));
        }
        
        this.consume(TokenType.RBRACE, 'Expected }');
        
        return new StructDecl(name.value, fields, name.line, name.column);
    }
    
    parseGlobalVarDeclaration(isConst) {
        const name = this.consume(TokenType.IDENTIFIER, 'Expected variable name');
        
        this.consume(TokenType.COLON, 'Expected :');
        const type = this.parseType();
        
        let initializer = null;
        if (this.match(TokenType.EQ)) {
            initializer = this.parseExpression();
        }
        
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        
        return new VarDecl(name.value, type, initializer, isConst, name.line, name.column);
    }
    
    parseParameters() {
        const params = [];
        
        if (!this.check(TokenType.RPAREN)) {
            do {
                const name = this.consume(TokenType.IDENTIFIER, 'Expected parameter name');
                this.consume(TokenType.COLON, 'Expected :');
                const type = this.parseType();
                params.push(new Parameter(name.value, type, name.line, name.column));
            } while (this.match(TokenType.COMMA));
        }
        
        return params;
    }
    
    parseType() {
        const startToken = this.peek();
        let type;
        
        // String type
        if (this.match(TokenType.STRING_TYPE)) {
            type = new StringType(startToken.line, startToken.column);
        }
        // Primitive types
        else if (this.match(TokenType.I32)) {
            type = new PrimitiveType('i32', startToken.line, startToken.column);
        } else if (this.match(TokenType.I64)) {
            type = new PrimitiveType('i64', startToken.line, startToken.column);
        } else if (this.match(TokenType.F32)) {
            type = new PrimitiveType('f32', startToken.line, startToken.column);
        } else if (this.match(TokenType.F64)) {
            type = new PrimitiveType('f64', startToken.line, startToken.column);
        } else if (this.match(TokenType.BOOL)) {
            type = new PrimitiveType('bool', startToken.line, startToken.column);
        } else if (this.match(TokenType.VOID)) {
            type = new PrimitiveType('void', startToken.line, startToken.column);
        }
        // Pointer type
        else if (this.match(TokenType.PTR)) {
            this.consume(TokenType.LT, 'Expected <');
            const elementType = this.parseType();
            this.consumeGT('Expected >');
            type = new PointerType(elementType, startToken.line, startToken.column);
        }
        // Class/struct/generic type
        else if (this.check(TokenType.IDENTIFIER)) {
            const name = this.advance().value;
            let typeArgs = [];
            
            // Parse generic type arguments: Vec<i32>, Map<String, i32>
            if (this.match(TokenType.LT)) {
                do {
                    typeArgs.push(this.parseType());
                } while (this.match(TokenType.COMMA));
                this.consumeGT('Expected >');
            }
            
            type = new ClassType(name, typeArgs, startToken.line, startToken.column);
        }
        else {
            throw new Error(`Expected type at line ${startToken.line}, column ${startToken.column}`);
        }
        
        // Check for nullable: T?
        if (this.match(TokenType.QUESTION)) {
            type = new NullableType(type, type.line, type.column);
        }
        
        return type;
    }
    
    // Statement parsing
    parseBlock() {
        const startToken = this.consume(TokenType.LBRACE, 'Expected {');
        const statements = [];
        
        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            statements.push(this.parseStatement());
        }
        
        this.consume(TokenType.RBRACE, 'Expected }');
        
        return new BlockStmt(statements, startToken.line, startToken.column);
    }
    
    parseStatement() {
        const token = this.peek();
        
        if (this.match(TokenType.RETURN)) {
            return this.parseReturnStatement(token);
        }
        
        if (this.match(TokenType.IF)) {
            return this.parseIfStatement(token);
        }
        
        if (this.match(TokenType.WHILE)) {
            return this.parseWhileStatement(token);
        }
        
        if (this.match(TokenType.DO)) {
            return this.parseDoWhileStatement(token);
        }
        
        if (this.match(TokenType.FOR)) {
            return this.parseForStatement(token);
        }
    
        if (this.match(TokenType.SWITCH)) {
            return this.parseSwitchStatement(token);
        }
        
        if (this.match(TokenType.TRY)) {
            return this.parseTryStatement(token);
        }
        
        if (this.match(TokenType.THROW)) {
            return this.parseThrowStatement(token);
        }

        if (this.match(TokenType.BREAK)) {
            this.consume(TokenType.SEMICOLON, 'Expected ;');
            return new BreakStmt(token.line, token.column);
        }
        
        if (this.match(TokenType.CONTINUE)) {
            this.consume(TokenType.SEMICOLON, 'Expected ;');
            return new ContinueStmt(token.line, token.column);
        }
        
        if (this.match(TokenType.LET) || this.match(TokenType.CONST) || this.match(TokenType.VAR)) {
            return this.parseVarDeclStatement(token.type === TokenType.CONST);
        }
        
        if (this.match(TokenType.DELETE)) {
            const expr = this.parseExpression();
            this.consume(TokenType.SEMICOLON, 'Expected ;');
            return new DeleteStmt(expr, token.line, token.column);
        }
        
        if (this.check(TokenType.LBRACE)) {
            return this.parseBlock();
        }
        
        // Expression statement
        const expr = this.parseExpression();
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        return new ExprStmt(expr, expr.line, expr.column);
    }
    
    parseReturnStatement(token) {
        let value = null;
        if (!this.check(TokenType.SEMICOLON)) {
            value = this.parseExpression();
        }
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        return new ReturnStmt(value, token.line, token.column);
    }
    
    parseIfStatement(token) {
        this.consume(TokenType.LPAREN, 'Expected (');
        const condition = this.parseExpression();
        this.consume(TokenType.RPAREN, 'Expected )');
        
        const thenBranch = this.parseStatement();
        
        let elseBranch = null;
        if (this.match(TokenType.ELSE)) {
            elseBranch = this.parseStatement();
        }
        
        return new IfStmt(condition, thenBranch, elseBranch, token.line, token.column);
    }
    
    parseWhileStatement(token) {
        this.consume(TokenType.LPAREN, 'Expected (');
        const condition = this.parseExpression();
        this.consume(TokenType.RPAREN, 'Expected )');
        
        const body = this.parseStatement();
        
        return new WhileStmt(condition, body, token.line, token.column);
    }
    
    parseDoWhileStatement(token) {
        const body = this.parseStatement();
        
        this.consume(TokenType.WHILE, 'Expected while');
        this.consume(TokenType.LPAREN, 'Expected (');
        const condition = this.parseExpression();
        this.consume(TokenType.RPAREN, 'Expected )');
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        
        return new DoWhileStmt(body, condition, token.line, token.column);
    }
    
    parseForStatement(token) {
        this.consume(TokenType.LPAREN, 'Expected (');
        
        // Check for for-each: for (let x in collection)
        if (this.check(TokenType.LET) || this.check(TokenType.VAR)) {
            const savedPos = this.pos;
            this.advance(); // consume let/var
            
            if (this.check(TokenType.IDENTIFIER)) {
                const varName = this.advance().value;
                
                // Check for optional type annotation
                let varType = null;
                if (this.match(TokenType.COLON)) {
                    varType = this.parseType();
                }
                
                if (this.match(TokenType.IN)) {
                    // This is a for-each loop
                    const iterable = this.parseExpression();
                    this.consume(TokenType.RPAREN, 'Expected )');
                    const body = this.parseStatement();
                    return new ForEachStmt(varName, varType, iterable, body, token.line, token.column);
                }
            }
            
            // Not a for-each, backtrack
            this.pos = savedPos;
        }
        
        // Standard for loop
        let init = null;
        if (!this.check(TokenType.SEMICOLON)) {
            if (this.match(TokenType.LET) || this.match(TokenType.VAR)) {
                init = this.parseVarDeclStatement(false);
            } else {
                init = this.parseExpression();
                this.consume(TokenType.SEMICOLON, 'Expected ;');
            }
        } else {
            this.consume(TokenType.SEMICOLON, 'Expected ;');
        }
        
        let condition = null;
        if (!this.check(TokenType.SEMICOLON)) {
            condition = this.parseExpression();
        }
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        
        let update = null;
        if (!this.check(TokenType.RPAREN)) {
            update = this.parseExpression();
        }
        
        this.consume(TokenType.RPAREN, 'Expected )');
        const body = this.parseStatement();
        
        return new ForStmt(init, condition, update, body, token.line, token.column);
    }
    
    parseSwitchStatement(token) {
        this.consume(TokenType.LPAREN, "Expected '(' after switch");
        const discriminant = this.parseExpression();
        this.consume(TokenType.RPAREN, "Expected ')' after switch condition");
        this.consume(TokenType.LBRACE, "Expected '{' before switch cases");

        const cases = [];
        let defaultCase = null;

        while (!this.check(TokenType.RBRACE) && !this.isAtEnd()) {
            if (this.match(TokenType.CASE)) {
                const caseToken = this.previous();
                const value = this.parseExpression(); 
                this.consume(TokenType.COLON, "Expected ':' after case value");
                
                const stmts = [];
                while (!this.check(TokenType.CASE) && !this.check(TokenType.DEFAULT) && !this.check(TokenType.RBRACE)) {
                    stmts.push(this.parseStatement());
                }
                const body = new BlockStmt(stmts, caseToken.line, caseToken.column);
                cases.push(new SwitchCase(value, body, caseToken.line, caseToken.column));
            } else if (this.match(TokenType.DEFAULT)) {
                if (defaultCase !== null) {
                    throw new Error(`Multiple default cases in switch at line ${this.peek().line}`);
                }
                const defToken = this.previous();
                this.consume(TokenType.COLON, "Expected ':' after default");
                const stmts = [];
                while (!this.check(TokenType.CASE) && !this.check(TokenType.DEFAULT) && !this.check(TokenType.RBRACE)) {
                    stmts.push(this.parseStatement());
                }
                defaultCase = new BlockStmt(stmts, defToken.line, defToken.column);
            } else {
                throw new Error("Expected 'case' or 'default' inside switch");
            }
        }
        this.consume(TokenType.RBRACE, "Expected '}' after switch");
        return new SwitchStmt(discriminant, cases, defaultCase, token.line, token.column);
    }

    parseTryStatement(token) {
        const tryBlock = this.parseBlock();
        
        let catchVar = null;
        let catchBlock = null;
        let finallyBlock = null;

        if (this.match(TokenType.CATCH)) {
            this.consume(TokenType.LPAREN, "Expected '(' after catch");
            catchVar = this.consume(TokenType.IDENTIFIER, "Expected exception name").value;
            this.consume(TokenType.RPAREN, "Expected ')' after catch variable");
            catchBlock = this.parseBlock();
        }
        
        if (this.match(TokenType.FINALLY)) {
            finallyBlock = this.parseBlock();
        }

        return new TryStmt(tryBlock, catchVar, catchBlock, finallyBlock, token.line, token.column);
    }

    parseThrowStatement(token) {
        const expr = this.parseExpression();
        this.consume(TokenType.SEMICOLON, "Expected ';'");
        return new ThrowStmt(expr, token.line, token.column);
    }

    
    parseVarDeclStatement(isConst) {
        const name = this.consume(TokenType.IDENTIFIER, 'Expected variable name');
        
        let type = null;
        if (this.match(TokenType.COLON)) {
            type = this.parseType();
        }
        
        let initializer = null;
        if (this.match(TokenType.EQ)) {
            initializer = this.parseExpression();
        }
        
        this.consume(TokenType.SEMICOLON, 'Expected ;');
        
        return new VarDeclStmt(name.value, type, initializer, isConst, name.line, name.column);
    }
    
    // Expression parsing (precedence climbing)
    parseExpression() {
        return this.parseAssignment();
    }
    
    parseAssignment() {
        const expr = this.parseTernary();
        
        if (this.match(TokenType.EQ, TokenType.PLUSEQ, TokenType.MINUSEQ, TokenType.STAREQ, TokenType.SLASHEQ)) {
            const operator = this.previous().value;
            const value = this.parseAssignment();
            return new AssignExpr(expr, operator, value, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseTernary() {
        let expr = this.parseNullCoalesce();
        
        if (this.match(TokenType.QUESTION)) {
            const thenExpr = this.parseExpression();
            this.consume(TokenType.COLON, 'Expected :');
            const elseExpr = this.parseTernary();
            return new TernaryExpr(expr, thenExpr, elseExpr, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseNullCoalesce() {
        let expr = this.parseLogicalOr();
        
        while (this.match(TokenType.NULLCOALESCE)) {
            const right = this.parseLogicalOr();
            expr = new NullCoalesceExpr(expr, right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseLogicalOr() {
        let expr = this.parseLogicalAnd();
        
        while (this.match(TokenType.PIPEPIPE)) {
            const right = this.parseLogicalAnd();
            expr = new BinaryExpr(expr, '||', right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseLogicalAnd() {
        let expr = this.parseBitwiseOr();
        
        while (this.match(TokenType.AMPAMP)) {
            const right = this.parseBitwiseOr();
            expr = new BinaryExpr(expr, '&&', right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseBitwiseOr() {
        let expr = this.parseBitwiseXor();
        
        while (this.match(TokenType.PIPE)) {
            const right = this.parseBitwiseXor();
            expr = new BinaryExpr(expr, '|', right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseBitwiseXor() {
        let expr = this.parseBitwiseAnd();
        
        while (this.match(TokenType.CARET)) {
            const right = this.parseBitwiseAnd();
            expr = new BinaryExpr(expr, '^', right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseBitwiseAnd() {
        let expr = this.parseEquality();
        
        while (this.match(TokenType.AMPERSAND)) {
            const right = this.parseEquality();
            expr = new BinaryExpr(expr, '&', right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseEquality() {
        let expr = this.parseComparison();
        
        while (this.match(TokenType.EQEQ, TokenType.NEQ)) {
            const operator = this.previous().value;
            const right = this.parseComparison();
            expr = new BinaryExpr(expr, operator, right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseComparison() {
        let expr = this.parseShift();
        
        while (this.match(TokenType.LT, TokenType.GT, TokenType.LTE, TokenType.GTE, TokenType.INSTANCEOF)) {
            const operatorToken = this.previous();
            
            if (operatorToken.type === TokenType.INSTANCEOF) {
                const targetType = this.parseType();
                expr = new InstanceOfExpr(expr, targetType, operatorToken.line, operatorToken.column);
            } else {
                const operator = operatorToken.value;
                const right = this.parseShift();
                expr = new BinaryExpr(expr, operator, right, expr.line, expr.column);
            }
        }
        
        return expr;
    }
    
    parseShift() {
        let expr = this.parseAdditive();
        
        while (this.match(TokenType.LSHIFT, TokenType.RSHIFT)) {
            const operator = this.previous().value;
            const right = this.parseAdditive();
            expr = new BinaryExpr(expr, operator, right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseAdditive() {
        let expr = this.parseMultiplicative();
        
        while (this.match(TokenType.PLUS, TokenType.MINUS)) {
            const operator = this.previous().value;
            const right = this.parseMultiplicative();
            expr = new BinaryExpr(expr, operator, right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseMultiplicative() {
        let expr = this.parseUnary();
        
        while (this.match(TokenType.STAR, TokenType.SLASH, TokenType.PERCENT)) {
            const operator = this.previous().value;
            const right = this.parseUnary();
            expr = new BinaryExpr(expr, operator, right, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parseUnary() {
        if (this.match(TokenType.BANG, TokenType.MINUS, TokenType.TILDE, TokenType.PLUSPLUS, TokenType.MINUSMINUS)) {
            const operator = this.previous().value;
            const operand = this.parseUnary();
            return new UnaryExpr(operator, operand, true, this.previous().line, this.previous().column);
        }
        
        return this.parseCast();
    }
    
    parsePostfix() {
       let expr = this.parsePrimary();
        
        while (true) {
            if (this.match(TokenType.PLUSPLUS, TokenType.MINUSMINUS)) {
                expr = new UnaryExpr(this.previous().value, expr, false, expr.line, expr.column);
            } else if (this.match(TokenType.LPAREN)) {
                // Function call
                const args = [];
                if (!this.check(TokenType.RPAREN)) {
                    do {
                        args.push(this.parseExpression());
                    } while (this.match(TokenType.COMMA));
                }
                this.consume(TokenType.RPAREN, 'Expected )');
                expr = new CallExpr(expr, args, expr.line, expr.column);
            } else if (this.match(TokenType.DOT)) {
                // Member access
                const prop = this.consume(TokenType.IDENTIFIER, 'Expected property name');
                expr = new MemberExpr(expr, prop.value, expr.line, expr.column);
            } else if (this.match(TokenType.QUESTIONDOT)) {
                // Optional chaining
                const prop = this.consume(TokenType.IDENTIFIER, 'Expected property name');
                expr = new OptionalChainExpr(expr, prop.value, expr.line, expr.column);
            } else if (this.match(TokenType.LBRACKET)) {
                // Index access
                const index = this.parseExpression();
                this.consume(TokenType.RBRACKET, 'Expected ]');
                expr = new IndexExpr(expr, index, expr.line, expr.column);
            } else {
                break;
            }
        }
        
        return expr;
    }
    
    parseCast() {
        let expr = this.parsePostfix();
        
        if (this.match(TokenType.AS)) {
            const targetType = this.parseType();
            return new CastExpr(expr, targetType, expr.line, expr.column);
        }
        
        return expr;
    }
    
    parsePrimary() {
        const token = this.peek();
        
        // Numbers
        if (this.match(TokenType.NUMBER)) {
            return new LiteralExpr(this.previous().value, 'number', token.line, token.column);
        }
        
        // Strings
        if (this.match(TokenType.STRING)) {
            return new LiteralExpr(this.previous().value, 'string', token.line, token.column);
        }
        
        // Booleans
        if (this.match(TokenType.TRUE)) {
            return new LiteralExpr(true, 'bool', token.line, token.column);
        }
        if (this.match(TokenType.FALSE)) {
            return new LiteralExpr(false, 'bool', token.line, token.column);
        }
        
        // Null
        if (this.match(TokenType.NULL)) {
            return new NullExpr(token.line, token.column);
        }
        
        // This
        if (this.match(TokenType.THIS)) {
            return new ThisExpr(token.line, token.column);
        }
        
        // Super
        if (this.match(TokenType.SUPER)) {
            return new SuperExpr(token.line, token.column);
        }
        
        // New
        if (this.match(TokenType.NEW)) {
            const className = this.consume(TokenType.IDENTIFIER, 'Expected class name');
            
            // Parse type arguments: new Vec<i32>()
            let typeArgs = [];
            if (this.match(TokenType.LT)) {
                do {
                    typeArgs.push(this.parseType());
                } while (this.match(TokenType.COMMA));
                this.consumeGT('Expected >');
            }
            
            this.consume(TokenType.LPAREN, 'Expected (');
            const args = [];
            if (!this.check(TokenType.RPAREN)) {
                do {
                    args.push(this.parseExpression());
                } while (this.match(TokenType.COMMA));
            }
            this.consume(TokenType.RPAREN, 'Expected )');
            
            return new NewExpr(className.value, typeArgs, args, token.line, token.column);
        }
        
        // Sizeof
        if (this.match(TokenType.SIZEOF)) {
            this.consume(TokenType.LPAREN, 'Expected (');
            const targetType = this.parseType();
            this.consume(TokenType.RPAREN, 'Expected )');
            return new SizeofExpr(targetType, token.line, token.column);
        }
        
        // Parenthesized expression
        if (this.match(TokenType.LPAREN)) {
            const expr = this.parseExpression();
            this.consume(TokenType.RPAREN, 'Expected )');
            return expr;
        }
        
        // Identifier
        if (this.match(TokenType.IDENTIFIER)) {
            return new IdentifierExpr(this.previous().value, token.line, token.column);
        }
        
        throw new Error(`Unexpected token at line ${token.line}: ${token.type}`);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4: TYPE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════

class TypeInfo {
    constructor(kind) {
        this.kind = kind;
    }
    
    equals(other) {
        return false;
    }
    
    toString() {
        return this.kind;
    }
    
    sizeOf() {
        return 4;
    }
    
    toWatType() {
        return 'i32';
    }
    
    isNullable() {
        return false;
    }
}

class PrimitiveTypeInfo extends TypeInfo {
    constructor(name) {
        super('primitive');
        this.name = name;
    }
    
    equals(other) {
        return other instanceof PrimitiveTypeInfo && this.name === other.name;
    }
    
    toString() {
        return this.name;
    }
    
    sizeOf() {
        switch (this.name) {
            case 'i32': case 'f32': case 'bool': return 4;
            case 'i64': case 'f64': return 8;
            case 'void': return 0;
            default: return 4;
        }
    }
    
    toWatType() {
        switch (this.name) {
            case 'i32': case 'bool': return 'i32';
            case 'i64': return 'i64';
            case 'f32': return 'f32';
            case 'f64': return 'f64';
            case 'void': return null;
            default: return 'i32';
        }
    }
}

class PointerTypeInfo extends TypeInfo {
    constructor(elementType) {
        super('pointer');
        this.elementType = elementType;
    }
    
    equals(other) {
        return other instanceof PointerTypeInfo && this.elementType.equals(other.elementType);
    }
    
    toString() {
        return `ptr<${this.elementType.toString()}>`;
    }
    
    sizeOf() {
        return 4; // 32-bit pointer
    }
    
    toWatType() {
        return 'i32';
    }
}

class NullableTypeInfo extends TypeInfo {
    constructor(innerType) {
        super('nullable');
        this.innerType = innerType;
    }
    
    equals(other) {
        return other instanceof NullableTypeInfo && this.innerType.equals(other.innerType);
    }
    
    toString() {
        return `${this.innerType.toString()}?`;
    }
    
    sizeOf() {
        return this.innerType.sizeOf();
    }
    
    toWatType() {
        return this.innerType.toWatType();
    }
    
    isNullable() {
        return true;
    }
}

class StringTypeInfo extends TypeInfo {
    constructor() {
        super('string');
    }
    
    equals(other) {
        return other instanceof StringTypeInfo;
    }
    
    toString() {
        return 'String';
    }
    
    sizeOf() {
        return 4; // Pointer to string object
    }
    
    toWatType() {
        return 'i32';
    }
}

class ClassTypeInfo extends TypeInfo {
    constructor(name, classDecl) {
        super('class');
        this.name = name;
        this.classDecl = classDecl;
        this.fields = new Map();
        this.methods = new Map();
        this.vtable = [];
        this.baseClass = null;
        this.instanceSize = 4; // vtable ptr
        this.typeParams = []; // Generic type parameters
        this.typeArgs = null; // Concrete type arguments (when instantiated)
    }
    
    equals(other) {
        if (!(other instanceof ClassTypeInfo)) return false;
        if (this.name !== other.name) return false;
        
        // Check type arguments for generics
        if (this.typeArgs && other.typeArgs) {
            if (this.typeArgs.length !== other.typeArgs.length) return false;
            for (let i = 0; i < this.typeArgs.length; i++) {
                if (!this.typeArgs[i].equals(other.typeArgs[i])) return false;
            }
        }
        
        return true;
    }
    
    toString() {
        if (this.typeArgs && this.typeArgs.length > 0) {
            return `${this.name}<${this.typeArgs.map(t => t.toString()).join(', ')}>`;
        }
        return this.name;
    }
    
    sizeOf() {
        return this.instanceSize;
    }
    
    toWatType() {
        return 'i32'; // Objects are pointers
    }
}

class ClassReferenceTypeInfo extends TypeInfo {
    constructor(classInfo) {
        super('classref');
        this.classInfo = classInfo;
        this.name = classInfo.name;
    }
    
    equals(other) {
        return other instanceof ClassReferenceTypeInfo && this.name === other.name;
    }
    
    toString() {
        return `typeof ${this.name}`;
    }
    
    sizeOf() {
        return 0;
    }
    
    toWatType() {
        return 'i32';
    }
}

class StructTypeInfo extends TypeInfo {
    constructor(name, structDecl) {
        super('struct');
        this.name = name;
        this.structDecl = structDecl;
        this.fields = new Map();
        this.totalSize = 0;
    }
    
    equals(other) {
        return other instanceof StructTypeInfo && this.name === other.name;
    }
    
    toString() {
        return this.name;
    }
    
    sizeOf() {
        return this.totalSize;
    }
    
    toWatType() {
        return 'i32';
    }
}

class FunctionTypeInfo extends TypeInfo {
    constructor(returnType, paramTypes) {
        super('function');
        this.returnType = returnType;
        this.paramTypes = paramTypes;
    }
    
    equals(other) {
        if (!(other instanceof FunctionTypeInfo)) return false;
        if (!this.returnType.equals(other.returnType)) return false;
        if (this.paramTypes.length !== other.paramTypes.length) return false;
        return this.paramTypes.every((t, i) => t.equals(other.paramTypes[i]));
    }
    
    toString() {
        const params = this.paramTypes.map(t => t.toString()).join(', ');
        return `(${params}) => ${this.returnType.toString()}`;
    }
}

class GenericTypeInfo extends TypeInfo {
    constructor(name, constraints) {
        super('generic');
        this.name = name;
        this.constraints = constraints || []; // Type constraints
    }
    
    equals(other) {
        return other instanceof GenericTypeInfo && this.name === other.name;
    }
    
    toString() {
        return this.name;
    }
    
    sizeOf() {
        return 4; // Unknown, default to pointer size
    }
    
    toWatType() {
        return 'i32';
    }
}

// Built-in types
const BUILTIN_TYPES = {
    i32: new PrimitiveTypeInfo('i32'),
    i64: new PrimitiveTypeInfo('i64'),
    f32: new PrimitiveTypeInfo('f32'),
    f64: new PrimitiveTypeInfo('f64'),
    bool: new PrimitiveTypeInfo('bool'),
    void: new PrimitiveTypeInfo('void'),
    String: new StringTypeInfo(),
    null: new PrimitiveTypeInfo('null'), // Special null type
};


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5: SEMANTIC ANALYZER
// ═══════════════════════════════════════════════════════════════════════════

class SemanticAnalyzer {
    constructor() {
        this.classes = new Map();
        this.structs = new Map();
        this.functions = new Map();
        this.externals = new Map();
        this.globals = new Map();
        this.scopes = [new Map()];
        this.currentClass = null;
        this.currentFunction = null;
        this.errors = [];
        this.loopDepth = 0;
        this.typeParams = new Map(); // Current scope's type parameters
        this.genericInstances = new Map(); // Cache of instantiated generic types
    }
    
    error(message, node) {
        const err = `Semantic error at ${node.line}:${node.column}: ${message}`;
        this.errors.push(err);
        throw new Error(err);
    }
    
    pushScope() {
        this.scopes.push(new Map());
    }
    
    popScope() {
        this.scopes.pop();
    }
    
    defineLocal(name, type) {
        const scope = this.scopes[this.scopes.length - 1];
        if (scope.has(name)) {
            return false;
        }
        scope.set(name, type);
        return true;
    }
    
    lookupLocal(name) {
        for (let i = this.scopes.length - 1; i >= 0; i--) {
            if (this.scopes[i].has(name)) {
                return this.scopes[i].get(name);
            }
        }
        if (this.globals.has(name)) {
            return this.globals.get(name);
        }
        return null;
    }
    
    analyze(program) {
        // First pass: register all types
        for (const decl of program.declarations) {
            if (decl instanceof ClassDecl) {
                this.classes.set(decl.name, new ClassTypeInfo(decl.name, decl));
            } else if (decl instanceof StructDecl) {
                this.structs.set(decl.name, new StructTypeInfo(decl.name, decl));
            }
        }
        
        // Register built-in generic types
        this.registerBuiltinGenerics();
        
        // Second pass: analyze type layouts
        for (const decl of program.declarations) {
            if (decl instanceof ClassDecl) {
                this.analyzeClassLayout(decl);
            } else if (decl instanceof StructDecl) {
                this.analyzeStructLayout(decl);
            }
        }
        
        // Third pass: analyze functions and method bodies
        for (const decl of program.declarations) {
            if (decl instanceof ExternalDecl) {
                this.analyzeExternal(decl);
            } else if (decl instanceof VarDecl) {
                this.analyzeGlobalVar(decl);
            } else if (decl instanceof ClassDecl) {
                this.analyzeClass(decl);
            } else if (decl instanceof FunctionDecl && decl.body) {
                this.analyzeFunction(decl);
            }
        }
        
        return {
            classes: this.classes,
            structs: this.structs,
            functions: this.functions,
            externals: this.externals,
            globals: this.globals,
        };
    }
    
    registerBuiltinGenerics() {
        // Vec<T> - dynamic array
        const vecDecl = { name: 'Vec', typeParams: ['T'] };
        const vecType = new ClassTypeInfo('Vec', vecDecl);
        vecType.typeParams = ['T'];
        vecType.isBuiltin = true;
        this.classes.set('Vec', vecType);
        
        // Map<K, V> - hash map
        const mapDecl = { name: 'Map', typeParams: ['K', 'V'] };
        const mapType = new ClassTypeInfo('Map', mapDecl);
        mapType.typeParams = ['K', 'V'];
        mapType.isBuiltin = true;
        this.classes.set('Map', mapType);
        
        // Option<T> - optional type
        const optDecl = { name: 'Option', typeParams: ['T'] };
        const optType = new ClassTypeInfo('Option', optDecl);
        optType.typeParams = ['T'];
        optType.isBuiltin = true;
        this.classes.set('Option', optType);
    }
    
    resolveType(typeNode) {
        if (!typeNode) return BUILTIN_TYPES.void;
        
        if (typeNode instanceof PrimitiveType) {
            const t = BUILTIN_TYPES[typeNode.name];
            if (!t) this.error(`Unknown type: ${typeNode.name}`, typeNode);
            return t;
        }
        
        if (typeNode instanceof StringType) {
            return BUILTIN_TYPES.String;
        }
        
        if (typeNode instanceof PointerType) {
            const elemType = this.resolveType(typeNode.elementType);
            return new PointerTypeInfo(elemType);
        }
        
        if (typeNode instanceof NullableType) {
            const innerType = this.resolveType(typeNode.innerType);
            return new NullableTypeInfo(innerType);
        }
        
        if (typeNode instanceof ClassType) {
            // Check if it's a type parameter in current scope
            if (this.typeParams.has(typeNode.name)) {
                return this.typeParams.get(typeNode.name);
            }
            
            // Check classes
            if (this.classes.has(typeNode.name)) {
                const baseClass = this.classes.get(typeNode.name);
                
                // Handle generic instantiation
                if (typeNode.typeArgs && typeNode.typeArgs.length > 0) {
                    return this.instantiateGeneric(baseClass, typeNode.typeArgs, typeNode);
                }
                
                return baseClass;
            }
            
            // Check structs
            if (this.structs.has(typeNode.name)) {
                return this.structs.get(typeNode.name);
            }
            
            this.error(`Unknown type: ${typeNode.name}`, typeNode);
        }
        
        this.error(`Cannot resolve type`, typeNode);
    }
    
    instantiateGeneric(baseClass, typeArgNodes, node) {
        const typeArgs = typeArgNodes.map(t => this.resolveType(t));
        const key = `${baseClass.name}<${typeArgs.map(t => t.toString()).join(',')}>`;
        
        // Check cache
        if (this.genericInstances.has(key)) {
            return this.genericInstances.get(key);
        }
        
        // Create new instantiated type
        const instance = new ClassTypeInfo(baseClass.name, baseClass.classDecl);
        instance.typeArgs = typeArgs;
        instance.typeParams = baseClass.typeParams;
        instance.isBuiltin = baseClass.isBuiltin;
        
        // For built-in generics, set up their structure
        if (baseClass.isBuiltin) {
            this.setupBuiltinGeneric(instance, baseClass.name, typeArgs);
        }
        
        this.genericInstances.set(key, instance);
        return instance;
    }
    
    setupBuiltinGeneric(instance, name, typeArgs) {
        switch (name) {
            case 'Vec': {
                // Vec<T> layout: { _length: i32, _capacity: i32, _data: ptr<T> }
                // Fields are prefixed with _ to avoid conflicts with methods
                const elemType = typeArgs[0];
                instance.instanceSize = 12; // 3 * i32
                instance.fields.set('_length', { type: BUILTIN_TYPES.i32, offset: 0 });
                instance.fields.set('_capacity', { type: BUILTIN_TYPES.i32, offset: 4 });
                instance.fields.set('_data', { type: new PointerTypeInfo(elemType), offset: 8 });
                
                // Methods
                const pushType = new FunctionTypeInfo(BUILTIN_TYPES.void, [elemType]);
                const popType = new FunctionTypeInfo(elemType, []);
                const getType = new FunctionTypeInfo(elemType, [BUILTIN_TYPES.i32]);
                const setType = new FunctionTypeInfo(BUILTIN_TYPES.void, [BUILTIN_TYPES.i32, elemType]);
                const lenType = new FunctionTypeInfo(BUILTIN_TYPES.i32, []);
                const isEmptyType = new FunctionTypeInfo(BUILTIN_TYPES.bool, []);
                
                instance.methods.set('push', { type: pushType, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('pop', { type: popType, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('get', { type: getType, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('set', { type: setType, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('length', { type: lenType, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('isEmpty', { type: isEmptyType, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('clear', { type: new FunctionTypeInfo(BUILTIN_TYPES.void, []), vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('clone', { 
                    type: new FunctionTypeInfo(instance, []), // Returns Vec<T>
                    vtableIndex: -1, 
                    isStatic: false, 
                    isBuiltin: true 
                });
                break;
            }
            case 'Map': {
                // Map<K, V> layout: { _size: i32, _capacity: i32, _buckets: ptr }
                const keyType = typeArgs[0];
                const valType = typeArgs[1];
                instance.instanceSize = 12;
                instance.fields.set('_size', { type: BUILTIN_TYPES.i32, offset: 0 });
                instance.fields.set('_capacity', { type: BUILTIN_TYPES.i32, offset: 4 });
                instance.fields.set('_buckets', { type: new PointerTypeInfo(BUILTIN_TYPES.i32), offset: 8 });
                
                // Methods
                const setMethod = new FunctionTypeInfo(BUILTIN_TYPES.void, [keyType, valType]);
                const getMethod = new FunctionTypeInfo(new NullableTypeInfo(valType), [keyType]);
                const hasMethod = new FunctionTypeInfo(BUILTIN_TYPES.bool, [keyType]);
                const deleteMethod = new FunctionTypeInfo(BUILTIN_TYPES.bool, [keyType]);
                const sizeMethod = new FunctionTypeInfo(BUILTIN_TYPES.i32, []);
                
                instance.methods.set('set', { type: setMethod, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('get', { type: getMethod, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('has', { type: hasMethod, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('delete', { type: deleteMethod, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('size', { type: sizeMethod, vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('clear', { type: new FunctionTypeInfo(BUILTIN_TYPES.void, []), vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('clone', { 
                    type: new FunctionTypeInfo(instance, []), // Returns Map<K,V>
                    vtableIndex: -1, 
                    isStatic: false, 
                    isBuiltin: true 
                });
                break;
            }
            case 'Option': {
                // Option<T> layout: { hasValue: bool, value: T }
                const innerType = typeArgs[0];
                instance.instanceSize = 4 + innerType.sizeOf();
                instance.fields.set('hasValue', { type: BUILTIN_TYPES.bool, offset: 0 });
                instance.fields.set('value', { type: innerType, offset: 4 });
                
                // Methods
                instance.methods.set('isSome', { type: new FunctionTypeInfo(BUILTIN_TYPES.bool, []), vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('isNone', { type: new FunctionTypeInfo(BUILTIN_TYPES.bool, []), vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('unwrap', { type: new FunctionTypeInfo(innerType, []), vtableIndex: -1, isStatic: false, isBuiltin: true });
                instance.methods.set('unwrapOr', { type: new FunctionTypeInfo(innerType, [innerType]), vtableIndex: -1, isStatic: false, isBuiltin: true });
                break;
            }
        }
    }
    
    analyzeClassLayout(decl) {
        const classInfo = this.classes.get(decl.name);
        
        // Setup type parameters
        if (decl.typeParams && decl.typeParams.length > 0) {
            classInfo.typeParams = decl.typeParams;
            for (const param of decl.typeParams) {
                this.typeParams.set(param, new GenericTypeInfo(param));
            }
        }
        
        // Resolve base class
        if (decl.baseClass) {
            if (!this.classes.has(decl.baseClass)) {
                this.error(`Unknown base class: ${decl.baseClass}`, decl);
            }
            classInfo.baseClass = this.classes.get(decl.baseClass);
            
            // Inherit from base
            classInfo.instanceSize = classInfo.baseClass.instanceSize;
            classInfo.vtable = [...classInfo.baseClass.vtable];
            
            // Copy base class fields
            for (const [name, info] of classInfo.baseClass.fields) {
                classInfo.fields.set(name, { ...info });
            }
            
            // Copy base class methods
            for (const [name, info] of classInfo.baseClass.methods) {
                classInfo.methods.set(name, { ...info });
            }
        }
        
        // Process members
        for (const member of decl.members) {
            if (member instanceof FieldDecl) {
                if (classInfo.fields.has(member.name)) {
                    this.error(`Duplicate field: ${member.name}`, member);
                }
                const fieldType = this.resolveType(member.type);
                const offset = classInfo.instanceSize;
                classInfo.fields.set(member.name, {
                    type: fieldType,
                    offset,
                    visibility: member.visibility,
                    isStatic: member.isStatic,
                    initializer: member.initializer
                });
                if (!member.isStatic) {
                    classInfo.instanceSize += fieldType.sizeOf();
                }
            } else if (member instanceof MethodDecl) {
                const returnType = this.resolveType(member.returnType);
                const paramTypes = member.params.map(p => this.resolveType(p.type));
                const methodType = new FunctionTypeInfo(returnType, paramTypes);
                
                let vtableIndex = -1;
                
                if (member.isVirtual || member.isAbstract || member.isOverride) {
                    if (member.isOverride && classInfo.methods.has(member.name)) {
                        vtableIndex = classInfo.methods.get(member.name).vtableIndex;
                    } else {
                        vtableIndex = classInfo.vtable.length;
                        classInfo.vtable.push(member.name);
                    }
                }
                
                classInfo.methods.set(member.name, {
                    type: methodType,
                    vtableIndex,
                    visibility: member.visibility,
                    isStatic: member.isStatic,
                    isVirtual: member.isVirtual || member.isAbstract,
                    isAbstract: member.isAbstract,
                    decl: member,
                });
            } else if (member instanceof ConstructorDecl) {
                classInfo.constructor = {
                    params: member.params.map(p => ({ name: p.name, type: this.resolveType(p.type) })),
                    decl: member,
                };
            } else if (member instanceof DestructorDecl) {
                classInfo.destructor = { decl: member };
            }
        }
        
        // Align instance size to 4 bytes
        classInfo.instanceSize = Math.ceil(classInfo.instanceSize / 4) * 4;
        
        // Clear type parameters scope
        this.typeParams.clear();
    }
    
    analyzeStructLayout(decl) {
        const structInfo = this.structs.get(decl.name);
        let offset = 0;
        
        for (const field of decl.fields) {
            const fieldType = this.resolveType(field.type);
            structInfo.fields.set(field.name, {
                type: fieldType,
                offset,
            });
            offset += fieldType.sizeOf();
        }
        
        structInfo.totalSize = Math.ceil(offset / 4) * 4;
    }
    
    analyzeExternal(decl) {
        const returnType = this.resolveType(decl.returnType);
        const paramTypes = decl.params.map(p => this.resolveType(p.type));
        const funcType = new FunctionTypeInfo(returnType, paramTypes);
        
        this.externals.set(decl.funcName, {
            type: funcType,
            module: decl.module,
            name: decl.name,
            decl: decl,
        });
    }
    
    analyzeGlobalVar(decl) {
        const type = this.resolveType(decl.type);
        decl.resolvedType = type;
        this.globals.set(decl.name, type);
    }
    
    analyzeClass(decl) {
        const classInfo = this.classes.get(decl.name);
        this.currentClass = classInfo;
        
        // Setup type parameters
        if (decl.typeParams && decl.typeParams.length > 0) {
            for (const param of decl.typeParams) {
                this.typeParams.set(param, new GenericTypeInfo(param));
            }
        }
        
        // Analyze constructor
        const ctor = decl.members.find(m => m instanceof ConstructorDecl);
        if (ctor) {
            this.analyzeConstructor(ctor, classInfo);
        }
        
        // Analyze methods
        for (const member of decl.members) {
            if (member instanceof MethodDecl && member.body) {
                this.analyzeMethod(member, classInfo);
            }
        }
        
        this.currentClass = null;
        this.typeParams.clear();
    }
    
    analyzeConstructor(ctor, classInfo) {
        this.pushScope();
        
        // Add 'this'
        this.defineLocal('this', classInfo);
        
        // Add parameters
        for (const param of ctor.params) {
            const type = this.resolveType(param.type);
            this.defineLocal(param.name, type);
        }
        
        // Analyze body
        this.analyzeBlock(ctor.body);
        
        this.popScope();
    }
    
    analyzeMethod(method, classInfo) {
        this.pushScope();
        
        // Add 'this' for non-static methods
        if (!method.isStatic) {
            this.defineLocal('this', classInfo);
        }
        
        // Add parameters
        for (const param of method.params) {
            const type = this.resolveType(param.type);
            this.defineLocal(param.name, type);
        }
        
        // Set current function return type
        this.currentFunction = {
            returnType: this.resolveType(method.returnType),
        };
        
        // Analyze body
        this.analyzeBlock(method.body);
        
        this.currentFunction = null;
        this.popScope();
    }
    
    analyzeFunction(decl) {
        const returnType = this.resolveType(decl.returnType);
        const paramTypes = decl.params.map(p => this.resolveType(p.type));
        const funcType = new FunctionTypeInfo(returnType, paramTypes);
        
        this.functions.set(decl.name, { type: funcType, decl });
        
        this.pushScope();
        
        // Add parameters
        for (const param of decl.params) {
            const type = this.resolveType(param.type);
            this.defineLocal(param.name, type);
        }
        
        this.currentFunction = { returnType };
        
        // Analyze body
        this.analyzeBlock(decl.body);
        
        this.currentFunction = null;
        this.popScope();
    }
    
    analyzeBlock(block) {
        this.pushScope();
        for (const stmt of block.statements) {
            this.analyzeStatement(stmt);
        }
        this.popScope();
    }
    
    analyzeStatement(stmt) {
        switch (stmt.nodeType) {
            case 'ExprStmt':
                this.analyzeExpression(stmt.expression);
                break;
                
            case 'ReturnStmt':
                if (stmt.value) {
                    const valueType = this.analyzeExpression(stmt.value);
                    if (this.currentFunction) {
                        const expectedType = this.currentFunction.returnType;
                        
                        // Allow null to be returned for nullable types
                        if (valueType.equals(BUILTIN_TYPES.null) && expectedType.isNullable && expectedType.isNullable()) {
                            // OK
                        }
                        // Check assignability
                        else if (!this.isAssignable(expectedType, valueType)) {
                            this.error(`Return type mismatch: expected ${expectedType.toString()}, got ${valueType.toString()}`, stmt);
                        }
                    }
                } else {
                    // Returning void
                    if (this.currentFunction && !this.currentFunction.returnType.equals(BUILTIN_TYPES.void)) {
                        this.error(`Expected return value of type ${this.currentFunction.returnType.toString()}`, stmt);
                    }
                }
                break;
                
            case 'IfStmt':
                this.analyzeExpression(stmt.condition);
                this.analyzeStatement(stmt.thenBranch);
                if (stmt.elseBranch) {
                    this.analyzeStatement(stmt.elseBranch);
                }
                break;
                
            case 'WhileStmt':
                this.analyzeExpression(stmt.condition);
                this.loopDepth++;
                this.analyzeStatement(stmt.body);
                this.loopDepth--;
                break;
                
            case 'DoWhileStmt':
                this.loopDepth++;
                this.analyzeStatement(stmt.body);
                this.loopDepth--;
                this.analyzeExpression(stmt.condition);
                break;
                
            case 'ForStmt':
                this.pushScope();
                if (stmt.init) {
                    if (stmt.init.nodeType === 'VarDeclStmt') {
                        this.analyzeStatement(stmt.init);
                    } else {
                        this.analyzeExpression(stmt.init);
                    }
                }
                if (stmt.condition) {
                    this.analyzeExpression(stmt.condition);
                }
                if (stmt.update) {
                    this.analyzeExpression(stmt.update);
                }
                this.loopDepth++;
                this.analyzeStatement(stmt.body);
                this.loopDepth--;
                this.popScope();
                break;
                
            case 'ForEachStmt':
                this.pushScope();
                const iterableType = this.analyzeExpression(stmt.iterable);
                
                // Determine element type
                let elemType;
                if (iterableType instanceof ClassTypeInfo && iterableType.name === 'Vec' && iterableType.typeArgs) {
                    elemType = iterableType.typeArgs[0];
                } else if (iterableType instanceof StringTypeInfo) {
                    elemType = BUILTIN_TYPES.i32; // Characters as i32
                } else {
                    this.error(`Cannot iterate over ${iterableType}`, stmt);
                }
                
                // Override with explicit type if provided
                if (stmt.varType) {
                    elemType = this.resolveType(stmt.varType);
                }
                
                stmt.elementType = elemType;
                this.defineLocal(stmt.variable, elemType);
                
                this.loopDepth++;
                this.analyzeStatement(stmt.body);
                this.loopDepth--;
                this.popScope();
                break;
                
            case 'BreakStmt':
            case 'ContinueStmt':
                if (this.loopDepth === 0) {
                    this.error(`${stmt.nodeType === 'BreakStmt' ? 'break' : 'continue'} outside of loop`, stmt);
                }
                break;
                
            case 'VarDeclStmt':
                let varType;
                if (stmt.type) {
                    varType = this.resolveType(stmt.type);
                } else if (stmt.initializer) {
                    varType = this.analyzeExpression(stmt.initializer);
                } else {
                    this.error(`Variable must have type or initializer`, stmt);
                }
                
                if (stmt.initializer) {
                    const initType = this.analyzeExpression(stmt.initializer);
                    if (!this.isAssignable(varType, initType)) {
                        this.error(`Type mismatch in initialization`, stmt);
                    }
                }
                
                stmt.resolvedType = varType;
                this.defineLocal(stmt.name, varType);
                break;
                
            case 'DeleteStmt':
                this.analyzeExpression(stmt.expression);
                break;
                
            case 'BlockStmt':
                this.analyzeBlock(stmt);
                break;
              
            case 'SwitchStmt':
                const discType = this.analyzeExpression(stmt.discriminant);
                for (const c of stmt.cases) {
                    const caseType = this.analyzeExpression(c.value);
                    if (!this.isAssignable(discType, caseType)) {
                        this.error("Switch case type mismatch", c);
                    }
                    this.analyzeStatement(c.body);
                }
                if (stmt.defaultCase) this.analyzeStatement(stmt.defaultCase);
                break;

            case 'TryStmt':
                this.analyzeStatement(stmt.tryBlock);
                if (stmt.catchBlock) {
                    this.pushScope();
                    this.defineLocal(stmt.catchVar, BUILTIN_TYPES.String); 
                    this.analyzeStatement(stmt.catchBlock);
                    this.popScope();
                }
                if (stmt.finallyBlock) {
                    this.analyzeStatement(stmt.finallyBlock);
                }
                break;

            case 'ThrowStmt':
                const throwType = this.analyzeExpression(stmt.expression);
                if (!throwType.equals(BUILTIN_TYPES.String) && !(throwType instanceof ClassTypeInfo)) {
                    this.error("Can only throw Strings or Class Objects", stmt);
                }
                break;
                 
             default:
                throw new Error(`Unknown statement type: ${stmt.nodeType}`);
        }
    }
    
    analyzeExpression(expr) {
        switch (expr.nodeType) {
            case 'LiteralExpr':
                switch (expr.literalType) {
                    case 'number':
                        if (Number.isInteger(expr.value)) {
                            expr.resolvedType = BUILTIN_TYPES.i32;
                        } else {
                            expr.resolvedType = BUILTIN_TYPES.f64;
                        }
                        return expr.resolvedType;
                    case 'string':
                        expr.resolvedType = BUILTIN_TYPES.String;
                        return expr.resolvedType;
                    case 'bool':
                        expr.resolvedType = BUILTIN_TYPES.bool;
                        return expr.resolvedType;
                    default:
                        expr.resolvedType = BUILTIN_TYPES.i32;
                        return expr.resolvedType;
                }
                
            case 'NullExpr':
                expr.resolvedType = BUILTIN_TYPES.null;
                return expr.resolvedType;
                
            case 'IdentifierExpr': {
                // Check local first
                let type = null;
                for (let i = this.scopes.length - 1; i >= 0; i--) {
                    if (this.scopes[i].has(expr.name)) {
                        type = this.scopes[i].get(expr.name);
                        expr.resolvedType = type;
                        expr.isLocal = true;
                        return type;
                    }
                }
                
                // Check globals
                if (this.globals.has(expr.name)) {
                    type = this.globals.get(expr.name);
                    expr.resolvedType = type;
                    expr.isGlobal = true;
                    return type;
                }
                
                // Check functions
                if (this.functions.has(expr.name)) {
                    expr.resolvedType = this.functions.get(expr.name).type;
                    expr.isFunction = true;
                    return expr.resolvedType;
                }
                
                // Check externals
                if (this.externals.has(expr.name)) {
                    expr.resolvedType = this.externals.get(expr.name).type;
                    expr.isExternal = true;
                    return expr.resolvedType;
                }
                
                // Check class names (for static method calls)
                if (this.classes.has(expr.name)) {
                    const classInfo = this.classes.get(expr.name);
                    expr.resolvedType = new ClassReferenceTypeInfo(classInfo);
                    expr.isClassRef = true;
                    return expr.resolvedType;
                }
                
                this.error(`Undefined identifier: ${expr.name}`, expr);
            }
                
            case 'ThisExpr':
                if (!this.currentClass) {
                    this.error(`'this' outside of class`, expr);
                }
                expr.resolvedType = this.currentClass;
                return expr.resolvedType;
                
            case 'SuperExpr':
                if (!this.currentClass || !this.currentClass.baseClass) {
                    this.error(`'super' requires a base class`, expr);
                }
                expr.resolvedType = this.currentClass.baseClass;
                expr.isSuper = true;
                return expr.resolvedType;
                
            case 'BinaryExpr': {
                const leftType = this.analyzeExpression(expr.left);
                const rightType = this.analyzeExpression(expr.right);
                
                // Generate operands
                this.generateExpression(expr.left);
                this.generateExpression(expr.right);
                
                // Pass the result type for proper code generation
                this.generateBinaryOp(expr.operator, expr.resolvedType);
                break;
            }
                
            case 'UnaryExpr': {
                const operandType = this.analyzeExpression(expr.operand);
                expr.resolvedType = this.resolveUnaryOp(expr.operator, operandType, expr);
                return expr.resolvedType;
            }
                
            case 'CallExpr': {
                const calleeType = this.analyzeExpression(expr.callee);
                
                // Super call
                if (expr.callee.nodeType === 'SuperExpr') {
                    if (!this.currentClass || !this.currentClass.baseClass) {
                        this.error(`super() requires base class`, expr);
                    }
                    expr.isSuperCall = true;
                    expr.baseClass = this.currentClass.baseClass;
                    
                    // Check constructor args
                    const baseCtor = this.currentClass.baseClass.constructor;
                    if (baseCtor) {
                        if (expr.args.length !== baseCtor.params.length) {
                            this.error(`super() expects ${baseCtor.params.length} arguments`, expr);
                        }
                        for (let i = 0; i < expr.args.length; i++) {
                            const argType = this.analyzeExpression(expr.args[i]);
                            if (!this.isAssignable(baseCtor.params[i].type, argType)) {
                                this.error(`super() argument ${i + 1} type mismatch`, expr);
                            }
                        }
                    }
                    
                    expr.resolvedType = BUILTIN_TYPES.void;
                    return expr.resolvedType;
                }
                
                // Method/function call - calleeType should be FunctionTypeInfo
                if (calleeType instanceof FunctionTypeInfo) {
                    // Check argument count
                    if (expr.args.length !== calleeType.paramTypes.length) {
                        this.error(`Expected ${calleeType.paramTypes.length} arguments, got ${expr.args.length}`, expr);
                    }
                    
                    // Check argument types
                    for (let i = 0; i < expr.args.length; i++) {
                        const argType = this.analyzeExpression(expr.args[i]);
                        if (!this.isAssignable(calleeType.paramTypes[i], argType)) {
                            this.error(`Argument ${i + 1} type mismatch`, expr);
                        }
                    }
                    
                    expr.resolvedType = calleeType.returnType;
                    return expr.resolvedType;
                }
                
                // Handle case where callee is a method expression that returns the method's return type
                // This happens when MemberExpr resolves to a method - we need to look at the FunctionTypeInfo
                if (expr.callee.nodeType === 'MemberExpr' && expr.callee.isMethod) {
                    const methodType = expr.callee.methodInfo.type;
                    
                    // Check argument count
                    if (expr.args.length !== methodType.paramTypes.length) {
                        this.error(`Expected ${methodType.paramTypes.length} arguments, got ${expr.args.length}`, expr);
                    }
                    
                    // Check argument types
                    for (let i = 0; i < expr.args.length; i++) {
                        const argType = this.analyzeExpression(expr.args[i]);
                        if (!this.isAssignable(methodType.paramTypes[i], argType)) {
                            this.error(`Argument ${i + 1} type mismatch`, expr);
                        }
                    }
                    
                    expr.resolvedType = methodType.returnType;
                    return expr.resolvedType;
                }
                
                // Handle String method calls
                if (expr.callee.nodeType === 'MemberExpr' && expr.callee.isStringMethod) {
                    const methodType = expr.callee.resolvedType;
                    if (methodType instanceof FunctionTypeInfo) {
                        for (let i = 0; i < expr.args.length; i++) {
                            this.analyzeExpression(expr.args[i]);
                        }
                        expr.resolvedType = methodType.returnType;
                        return expr.resolvedType;
                    }
                }
                
                this.error(`Cannot call ${calleeType}`, expr);
            }
                
            case 'MemberExpr': {
                const objType = this.analyzeExpression(expr.object);
                
                // Handle static method calls
                if (objType instanceof ClassReferenceTypeInfo) {
                    const classInfo = objType.classInfo;
                    
                    // 1. Check for Static Methods (Existing logic)
                    if (classInfo.methods.has(expr.property)) {
                        const method = classInfo.methods.get(expr.property);
                        if (method.isStatic || method.isBuiltin) {
                            expr.resolvedType = method.type;
                            expr.isStaticMethod = true;
                            expr.methodInfo = method;
                            expr.classInfo = classInfo;
                            return expr.resolvedType;
                        } else {
                            this.error(`Method '${expr.property}' is not static`, expr);
                        }
                    }
                    
                    // 2. NEW: Check for Static Fields
                    if (classInfo.fields.has(expr.property)) {
                        const field = classInfo.fields.get(expr.property);
                        if (field.isStatic) {
                            expr.resolvedType = field.type;
                            expr.isStaticField = true;
                            // Create a unique global name: $ClassName_FieldName
                            expr.staticFieldName = `$${classInfo.name}_${expr.property}`;
                            return expr.resolvedType;
                        } else {
                            this.error(`Field '${expr.property}' is not static`, expr);
                        }
                    }
                    
                    this.error(`Unknown static member: ${expr.property}`, expr);
                }
                
                // Handle String methods
                if (objType instanceof StringTypeInfo) {
                    expr.resolvedType = this.resolveStringMethod(expr.property, expr);
                    expr.isStringMethod = true;
                    return expr.resolvedType;
                }
                
                if (objType instanceof ClassTypeInfo) {
                    // Check methods first (so method calls work even if there's a field with same name)
                    if (objType.methods.has(expr.property)) {
                        const method = objType.methods.get(expr.property);
                        expr.resolvedType = method.type;
                        expr.isMethod = true;
                        expr.methodInfo = method;
                        expr.classInfo = objType;
                        return expr.resolvedType;
                    }
                    
                    // Check fields
                    if (objType.fields.has(expr.property)) {
                        const field = objType.fields.get(expr.property);
                        expr.resolvedType = field.type;
                        expr.fieldOffset = field.offset;
                        return expr.resolvedType;
                    }
                    
                    this.error(`Unknown member: ${expr.property}`, expr);
                }
                
                if (objType instanceof StructTypeInfo) {
                    if (objType.fields.has(expr.property)) {
                        const field = objType.fields.get(expr.property);
                        expr.resolvedType = field.type;
                        expr.fieldOffset = field.offset;
                        return expr.resolvedType;
                    }
                    this.error(`Unknown field: ${expr.property}`, expr);
                }
                
                this.error(`Cannot access member of ${objType}`, expr);
            }
                
            case 'OptionalChainExpr': {
                const objType = this.analyzeExpression(expr.object);
                
                // The object must be nullable
                let innerType = objType;
                if (objType instanceof NullableTypeInfo) {
                    innerType = objType.innerType;
                }
                
                if (innerType instanceof ClassTypeInfo) {
                    if (innerType.fields.has(expr.property)) {
                        const field = innerType.fields.get(expr.property);
                        expr.resolvedType = new NullableTypeInfo(field.type);
                        expr.fieldOffset = field.offset;
                        return expr.resolvedType;
                    }
                    
                    if (innerType.methods.has(expr.property)) {
                        const method = innerType.methods.get(expr.property);
                        expr.resolvedType = method.type;
                        expr.isMethod = true;
                        expr.methodInfo = method;
                        expr.classInfo = innerType;
                        return expr.resolvedType;
                    }
                }
                
                this.error(`Cannot access member of ${objType}`, expr);
            }
                
            case 'IndexExpr': {
                const objType = this.analyzeExpression(expr.object);
                const indexType = this.analyzeExpression(expr.index);
                
                // Check index type
                if (!(indexType.equals(BUILTIN_TYPES.i32) || indexType.equals(BUILTIN_TYPES.i64))) {
                    this.error(`Index must be integer`, expr);
                }
                
                // Pointer indexing
                if (objType instanceof PointerTypeInfo) {
                    expr.resolvedType = objType.elementType;
                    return expr.resolvedType;
                }
                
                // Vec indexing
                if (objType instanceof ClassTypeInfo && objType.name === 'Vec' && objType.typeArgs) {
                    expr.resolvedType = objType.typeArgs[0];
                    expr.isVecIndex = true;
                    return expr.resolvedType;
                }
                
                // String indexing
                if (objType instanceof StringTypeInfo) {
                    expr.resolvedType = BUILTIN_TYPES.i32; // char code
                    expr.isStringIndex = true;
                    return expr.resolvedType;
                }
                
                this.error(`Cannot index ${objType}`, expr);
            }
                
            case 'AssignExpr': {
                const targetType = this.analyzeExpression(expr.target);
                const valueType = this.analyzeExpression(expr.value);
                
                if (!this.isAssignable(targetType, valueType)) {
                    this.error(`Cannot assign ${valueType} to ${targetType}`, expr);
                }
                
                expr.resolvedType = targetType;
                return expr.resolvedType;
            }
                
            case 'TernaryExpr':
                this.analyzeExpression(expr.condition);
                const thenType = this.analyzeExpression(expr.thenExpr);
                const elseType = this.analyzeExpression(expr.elseExpr);
                
                // Result is the common type
                expr.resolvedType = thenType; // Simplified
                return expr.resolvedType;
                
            case 'NullCoalesceExpr': {
                const leftType = this.analyzeExpression(expr.left);
                const rightType = this.analyzeExpression(expr.right);
                
                // Left should be nullable, result is non-nullable
                if (leftType instanceof NullableTypeInfo) {
                    expr.resolvedType = leftType.innerType;
                } else {
                    expr.resolvedType = leftType;
                }
                return expr.resolvedType;
            }
                
            case 'CastExpr':
                this.analyzeExpression(expr.expression);
                expr.resolvedType = this.resolveType(expr.targetType);
                return expr.resolvedType;
                
            case 'NewExpr': {
                // 1. Check if it is a Class
                if (this.classes.has(expr.className)) {
                    let classInfo = this.classes.get(expr.className);
    
                    // Handle generic instantiation
                    if (expr.typeArgs && expr.typeArgs.length > 0) {
                        classInfo = this.instantiateGeneric(classInfo, expr.typeArgs, expr);
                    }
    
                    // Check constructor args
                    if (classInfo.constructor && !classInfo.isBuiltin) {
                        const params = classInfo.constructor.params;
                        if (expr.args.length !== params.length) {
                            this.error(`Constructor expects ${params.length} arguments`, expr);
                        }
                        for (let i = 0; i < expr.args.length; i++) {
                            const argType = this.analyzeExpression(expr.args[i]);
                            if (!this.isAssignable(params[i].type, argType)) {
                                this.error(`Constructor argument ${i + 1} type mismatch`, expr);
                            }
                        }
                    } else if (!classInfo.isBuiltin && !classInfo.constructor) {
                        if (expr.args.length > 0) {
                            this.error(`Default constructor takes no arguments`, expr);
                        }
                    }
                    
                    // Builtin args analysis
                    for (const arg of expr.args) this.analyzeExpression(arg);
    
                    expr.resolvedType = classInfo;
                    expr.classInfo = classInfo;
                    return expr.resolvedType;
                } 
                // 2. CHECK FOR STRUCTS (This was missing!)
                else if (this.structs.has(expr.className)) {
                    const structInfo = this.structs.get(expr.className);
                    if (expr.args.length > 0) {
                        this.error(`Struct constructors do not take arguments`, expr);
                    }
                    expr.resolvedType = structInfo;
                    expr.structInfo = structInfo; // Store this for the generator
                    return expr.resolvedType;
                }
    
                this.error(`Unknown type: ${expr.className}`, expr);
            }
                
            case 'InstanceOfExpr':
                this.analyzeExpression(expr.left);
                const targetType = this.resolveType(expr.targetType);
                if (!(targetType instanceof ClassTypeInfo)) {
                    this.error("Instanceof target must be a class", expr);
                }
                expr.targetClassInfo = targetType;
                expr.resolvedType = BUILTIN_TYPES.bool;
                return expr.resolvedType;                
                
                
            case 'SizeofExpr':
                const sizeType = this.resolveType(expr.targetType);
                expr.resolvedType = BUILTIN_TYPES.i32;
                expr.targetSize = sizeType.sizeOf();
                return expr.resolvedType;
                
            default:
                throw new Error(`Unknown expression type: ${expr.nodeType}`);
        }
    }
    
resolveStringMethod(methodName, expr) {
    const stringMethods = {
        'length': new FunctionTypeInfo(BUILTIN_TYPES.i32, []),
        'charAt': new FunctionTypeInfo(BUILTIN_TYPES.i32, [BUILTIN_TYPES.i32]),
        'charCodeAt': new FunctionTypeInfo(BUILTIN_TYPES.i32, [BUILTIN_TYPES.i32]),
        'substring': new FunctionTypeInfo(BUILTIN_TYPES.String, [BUILTIN_TYPES.i32, BUILTIN_TYPES.i32]),
        'substr': new FunctionTypeInfo(BUILTIN_TYPES.String, [BUILTIN_TYPES.i32, BUILTIN_TYPES.i32]),
        'concat': new FunctionTypeInfo(BUILTIN_TYPES.String, [BUILTIN_TYPES.String]),
        'indexOf': new FunctionTypeInfo(BUILTIN_TYPES.i32, [BUILTIN_TYPES.String]),
        'lastIndexOf': new FunctionTypeInfo(BUILTIN_TYPES.i32, [BUILTIN_TYPES.String]),
        'startsWith': new FunctionTypeInfo(BUILTIN_TYPES.bool, [BUILTIN_TYPES.String]),
        'endsWith': new FunctionTypeInfo(BUILTIN_TYPES.bool, [BUILTIN_TYPES.String]),
        'includes': new FunctionTypeInfo(BUILTIN_TYPES.bool, [BUILTIN_TYPES.String]),
        'trim': new FunctionTypeInfo(BUILTIN_TYPES.String, []),
        'toLowerCase': new FunctionTypeInfo(BUILTIN_TYPES.String, []),
        'toUpperCase': new FunctionTypeInfo(BUILTIN_TYPES.String, []),
        'equals': new FunctionTypeInfo(BUILTIN_TYPES.bool, [BUILTIN_TYPES.String]),
        'split': new FunctionTypeInfo(this.getVecStringType(), [BUILTIN_TYPES.String]),
    };
    
    if (stringMethods[methodName]) {
        return stringMethods[methodName];
    }
    
    this.error(`Unknown String method: ${methodName}`, expr);
}
    
    getVecStringType() {
        // Return Vec<String> type
        const vecBase = this.classes.get('Vec');
        if (!vecBase) return BUILTIN_TYPES.i32;
        
        const instance = new ClassTypeInfo('Vec', vecBase.classDecl);
        instance.typeArgs = [BUILTIN_TYPES.String];
        instance.isBuiltin = true;
        this.setupBuiltinGeneric(instance, 'Vec', [BUILTIN_TYPES.String]);
        return instance;
    }
    
resolveBinaryOp(operator, leftType, rightType, expr) {
    // String concatenation - EXPANDED SUPPORT
    if (operator === '+') {
        if (leftType instanceof StringTypeInfo || rightType instanceof StringTypeInfo) {
            return BUILTIN_TYPES.String;
        }
    }
    
    // Comparison operators
    if (['==', '!=', '<', '>', '<=', '>='].includes(operator)) {
        return BUILTIN_TYPES.bool;
    }
    
    // Logical operators
    if (['&&', '||'].includes(operator)) {
        return BUILTIN_TYPES.bool;
    }
    
    // Numeric operations - return the wider type
    if (leftType.equals(BUILTIN_TYPES.f64) || rightType.equals(BUILTIN_TYPES.f64)) {
        return BUILTIN_TYPES.f64;
    }
    if (leftType.equals(BUILTIN_TYPES.f32) || rightType.equals(BUILTIN_TYPES.f32)) {
        return BUILTIN_TYPES.f32;
    }
    if (leftType.equals(BUILTIN_TYPES.i64) || rightType.equals(BUILTIN_TYPES.i64)) {
        return BUILTIN_TYPES.i64;
    }
    
    return BUILTIN_TYPES.i32;
}
    
    resolveUnaryOp(operator, operandType, expr) {
        if (operator === '!') {
            return BUILTIN_TYPES.bool;
        }
        
        if (operator === '~') {
            return operandType;
        }
        
        return operandType;
    }
    
    isAssignable(targetType, sourceType) {
        // Same type
        if (targetType.equals(sourceType)) return true;
        
        // Null can be assigned to nullable types
        if (sourceType.equals(BUILTIN_TYPES.null) && targetType.isNullable()) {
            return true;
        }
        
        // Any value can be assigned to nullable version
        if (targetType instanceof NullableTypeInfo) {
            return this.isAssignable(targetType.innerType, sourceType);
        }
        
        // Numeric promotions
        if (targetType.equals(BUILTIN_TYPES.i64) && sourceType.equals(BUILTIN_TYPES.i32)) return true;
        if (targetType.equals(BUILTIN_TYPES.f32) && sourceType.equals(BUILTIN_TYPES.i32)) return true;
        if (targetType.equals(BUILTIN_TYPES.f64) && sourceType.equals(BUILTIN_TYPES.i32)) return true;
        if (targetType.equals(BUILTIN_TYPES.f64) && sourceType.equals(BUILTIN_TYPES.i64)) return true;
        if (targetType.equals(BUILTIN_TYPES.f64) && sourceType.equals(BUILTIN_TYPES.f32)) return true;
        
        // Class inheritance
        if (targetType instanceof ClassTypeInfo && sourceType instanceof ClassTypeInfo) {
            let current = sourceType;
            while (current) {
                if (current.name === targetType.name) return true;
                current = current.baseClass;
            }
        }
        
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6: WAT CODE GENERATOR
// ═══════════════════════════════════════════════════════════════════════════

class WATGenerator {
    constructor(semanticInfo) {
        this.classes = semanticInfo.classes;
        this.structs = semanticInfo.structs;
        this.functions = semanticInfo.functions;
        this.externals = semanticInfo.externals;
        this.globals = semanticInfo.globals;
        
        this.output = [];
        this.indent = 0;
        this.locals = new Map();
        this.localIndex = 0;
        this.currentClass = null;
        this.stringTable = new Map();
        this.stringOffset = 4096; // After vtables
        this.functionTable = [];
        this.functionIndices = new Map();
        this.methodTypes = new Map();
        this.methodTypeSignatures = new Map();
        this.classVtableEntries = new Map();
        this.loopLabels = [];
        this.loopCounter = 0;
        this.scopeStack = []; // Stack of { locals: VarInfo[] } for RAII
    }
    
    emit(line) {
        this.output.push('  '.repeat(this.indent) + line);
    }
    
    pushScope() {
        this.scopeStack.push({ locals: [] });
    }

    popScope() {
        if (this.scopeStack.length === 0) return;
        const scope = this.scopeStack.pop();
        // LIFO: Destroy newest variables first
        for (let i = scope.locals.length - 1; i >= 0; i--) {
            this.generateDestructorCall(scope.locals[i]);
        }
    }

    registerLocalInScope(name, typeInfo) {
        if (this.scopeStack.length > 0) {
            this.scopeStack[this.scopeStack.length - 1].locals.push({ name, type: typeInfo });
        }
    }

generateDestructorCall(localInfo) {
        const type = localInfo.type;
        // Built-ins (Vec, String, Map) or Classes with destructors
        if (type.name === 'Vec' && type.isBuiltin) {
             this.emit(`(local.get $${localInfo.name})`);
             this.emit(`(call $__Vec_free)`);
        }
        else if (type.name === 'Map' && type.isBuiltin) {
             this.emit(`(local.get $${localInfo.name})`);
             this.emit(`(call $__Map_free)`);
        }
        else if (type.name === 'String' && type.isBuiltin) {
             this.emit(`(local.get $${localInfo.name})`);
             this.emit(`(call $__free)`); // Strings are just pointers
        }
        else if (type instanceof ClassTypeInfo && !type.isBuiltin && type.destructor) {
             // Custom Class Destructor
             this.emit(`(local.get $${localInfo.name})`);
             this.emit(`(call $${type.name}__destructor)`);
             // Free the memory of the object itself
             this.emit(`(local.get $${localInfo.name})`);
             this.emit(`(call $__free)`);
        }
    }
    
   collectLocals(node) {
        if (!node) return;

        // 1. Declare scratch variable $__tmp if not present (Global for function)
        if (!this.locals.has('__tmp')) {
            this.emit(`(local $__tmp i32)`);
            this.locals.set('__tmp', { index: this.localIndex++, type: 'i32' });
        }

        // 2. Pre-declare loop iterators to avoid counter desync issues in generator
        // We declare __iter_0 through __iter_19 to handle up to 20 loops per function
        for(let i=0; i<20; i++) {
            const itName = `__iter_${i}`;
            if(!this.locals.has(itName)) {
                this.emit(`(local $${itName} i32)`);
                this.locals.set(itName, { index: this.localIndex++, type: 'i32' });
            }
        }

        // 3. Recursive Visitor to find all local variables
        const visit = (stmt) => {
            if (!stmt) return;

            if (stmt instanceof BlockStmt) {
                for (const s of stmt.statements) visit(s);
                return;
            }

            if (stmt instanceof VarDeclStmt) {
                const type = this.resolveWatType(stmt.resolvedType);
                if (!this.locals.has(stmt.name)) {
                    this.emit(`(local $${stmt.name} ${type})`);
                    this.locals.set(stmt.name, { index: this.localIndex++, type });
                }
            }
            else if (stmt instanceof IfStmt) {
                visit(stmt.thenBranch);
                // FIX: Recurse into elseBranch regardless of type (Block or IfStmt)
                visit(stmt.elseBranch); 
            }
            else if (stmt instanceof WhileStmt) {
                visit(stmt.body);
            }
            else if (stmt instanceof DoWhileStmt) {
                visit(stmt.body);
            }
            else if (stmt instanceof ForStmt) {
                visit(stmt.init);
                visit(stmt.body);
            }
            else if (stmt instanceof ForEachStmt) {
                const type = this.resolveWatType(stmt.elementType);
                if (!this.locals.has(stmt.variable)) {
                    this.emit(`(local $${stmt.variable} ${type})`);
                    this.locals.set(stmt.variable, { index: this.localIndex++, type });
                }
                visit(stmt.body);
            }
            else if (stmt instanceof SwitchStmt) {
                 if (!this.locals.has('__switch_disc')) {
                     this.emit(`(local $__switch_disc i32)`);
                     this.locals.set('__switch_disc', { index: this.localIndex++, type: 'i32' });
                     this.emit(`(local $__switch_matched i32)`);
                     this.locals.set('__switch_matched', { index: this.localIndex++, type: 'i32' });
                }
                for(const c of stmt.cases) visit(c.body);
                visit(stmt.defaultCase);
            }
            else if (stmt instanceof TryStmt) {
                visit(stmt.tryBlock);
                if(stmt.catchBlock) {
                     if (!this.locals.has(stmt.catchVar)) {
                        this.emit(`(local $${stmt.catchVar} i32)`);
                        this.locals.set(stmt.catchVar, { index: this.localIndex++, type: 'i32' });
                     }
                     visit(stmt.catchBlock);
                }
                visit(stmt.finallyBlock);
            }
        };

        // Start traversal from the root node passed to this function
        visit(node);
    }
    
    
    generate(program) {
        this.emit('(module');
        this.indent++;
        
        // Imports
        this.generateImports();
        
        // Memory
        this.emit('(memory (export "memory") 16)'); // 1MB
        
        // Build virtual dispatch info
        this.buildVirtualDispatchInfo(program);
        
        // Generate type definitions
        this.generateMethodTypes();
        
        // Globals
        this.emit('(global $__heap_ptr (mut i32) (i32.const 65536))');
        // 1. Global Variables (Existing)
        for (const decl of program.declarations) {
            if (decl instanceof VarDecl) {
                const watType = this.resolveWatType(decl.resolvedType);
                this.emit(`(global $${decl.name} (mut ${watType}) (${watType}.const 0))`);
            }
        }

        // 2. Static Class Fields (With Initializers)
        for (const [className, classInfo] of this.classes) {
            if (classInfo.isBuiltin) continue;
            
            for (const [fieldName, fieldInfo] of classInfo.fields) {
                if (fieldInfo.isStatic) {
                    const watType = this.resolveWatType(fieldInfo.type);
                    let initVal = 0;

                    // Check for constant initializer (numbers/bools)
                    if (fieldInfo.initializer && fieldInfo.initializer.nodeType === 'LiteralExpr') {
                        if (fieldInfo.initializer.literalType === 'number') {
                            initVal = fieldInfo.initializer.value;
                        } else if (fieldInfo.initializer.literalType === 'bool') {
                            initVal = fieldInfo.initializer.value ? 1 : 0;
                        }
                    }
                    
                    this.emit(`(global $${className}_${fieldName} (mut ${watType}) (${watType}.const ${initVal}))`);
                }
            }
        }
        
        // String data
        this.collectStrings(program);
        this.generateStringData();
        
        // VTables
        this.generateVTables();
        
        // Runtime library
        this.generateRuntime();
        
        // Classes
        for (const decl of program.declarations) {
            if (decl instanceof ClassDecl) {
                this.generateClass(decl);
            }
        }
        
        // Functions
        for (const decl of program.declarations) {
            if (decl instanceof FunctionDecl && decl.body) {
                this.generateFunction(decl);
            }
        }
        
        // Function table
        if (this.functionTable.length > 0) {
            const entries = this.functionTable.map(n => `$${n}`).join(' ');
            this.emit(`(table ${this.functionTable.length} funcref)`);
            this.emit(`(elem (i32.const 0) ${entries})`);
        }
        
        this.indent--;
        this.emit(')');
        
        return this.output.join('\n');
    }
    
    generateImports() {
        for (const [name, info] of this.externals) {
            const decl = info.decl;
            const params = decl.params.map(p => {
                const type = this.resolveWatType(this.resolveTypeInfo(p.type));
                return `(param ${type})`;
            }).join(' ');
            const result = this.resolveWatType(this.resolveTypeInfo(decl.returnType));
            const resultStr = result ? `(result ${result})` : '';
            this.emit(`(import "${decl.module}" "${decl.name}" (func $${decl.funcName} ${params} ${resultStr}))`);
        }
    }
    
    resolveTypeInfo(typeNode) {
        if (!typeNode) return BUILTIN_TYPES.void;
        if (typeNode instanceof PrimitiveType) return BUILTIN_TYPES[typeNode.name];
        if (typeNode instanceof StringType) return BUILTIN_TYPES.String;
        if (typeNode instanceof PointerType) return new PointerTypeInfo(this.resolveTypeInfo(typeNode.elementType));
        if (typeNode instanceof NullableType) return new NullableTypeInfo(this.resolveTypeInfo(typeNode.innerType));
        if (typeNode instanceof ClassType) {
            if (this.classes.has(typeNode.name)) return this.classes.get(typeNode.name);
            if (this.structs.has(typeNode.name)) return this.structs.get(typeNode.name);
        }
        return BUILTIN_TYPES.i32;
    }
    
resolveWatType(typeInfo) {
    if (!typeInfo) return 'i32';
    if (typeInfo.toWatType) {
        const watType = typeInfo.toWatType();
        if (watType === null) return null; // void
        return watType; // This will now correctly return 'i64' for i64 primitives
    }
    return 'i32';
}
    
    buildVirtualDispatchInfo(program) {
        // Build type signatures for virtual methods
        for (const [className, classInfo] of this.classes) {
            if (classInfo.isBuiltin) continue;
            
            for (const [methodName, methodInfo] of classInfo.methods) {
                if (methodInfo.vtableIndex >= 0) {
                    const sig = this.getMethodSignature(methodInfo);
                    if (!this.methodTypes.has(sig)) {
                        const typeName = `$vt_${this.methodTypes.size}`;
                        this.methodTypes.set(sig, typeName);
                        this.methodTypeSignatures.set(typeName, this.parseSignature(methodInfo));
                    }
                    methodInfo.watTypeName = this.methodTypes.get(sig);
                }
            }
        }
        
        // Build function table
        for (const [className, classInfo] of this.classes) {
            if (classInfo.isBuiltin) continue;
            
            const entries = [];
            for (const methodName of classInfo.vtable) {
                const impl = this.findImplementingClass(classInfo, methodName);
                if (impl) {
                    const funcName = `${impl}__${methodName}`;
                    if (!this.functionIndices.has(funcName)) {
                        this.functionIndices.set(funcName, this.functionTable.length);
                        this.functionTable.push(funcName);
                    }
                    entries.push(this.functionIndices.get(funcName));
                } else {
                    entries.push(0);
                }
            }
            this.classVtableEntries.set(className, entries);
        }
    }
    
    findImplementingClass(classInfo, methodName) {
        let current = classInfo;
        while (current) {
            if (current.classDecl && !current.isBuiltin) {
                for (const member of current.classDecl.members) {
                    if (member instanceof MethodDecl && member.name === methodName && member.body) {
                        return current.name;
                    }
                }
            }
            current = current.baseClass;
        }
        return null;
    }
    
    // Find which class implements a method - works with ClassTypeInfo
    findMethodImplementingClass(classInfo, methodName) {
        let current = classInfo;
        while (current) {
            if (current.classDecl && !current.isBuiltin) {
                for (const member of current.classDecl.members) {
                    if (member instanceof MethodDecl && member.name === methodName && member.body) {
                        return current.name;
                    }
                }
            }
            current = current.baseClass;
        }
        // Fallback to the original class name if not found
        return classInfo.name;
    }
    
    getMethodSignature(methodInfo) {
        const params = ['i32'];
        for (const p of methodInfo.type.paramTypes) {
            params.push(this.resolveWatType(p));
        }
        const ret = this.resolveWatType(methodInfo.type.returnType) || 'void';
        return `(${params.join(',')})=>${ret}`;
    }
    
    parseSignature(methodInfo) {
        const params = ['i32'];
        for (const p of methodInfo.type.paramTypes) {
            params.push(this.resolveWatType(p));
        }
        return { params, result: this.resolveWatType(methodInfo.type.returnType) };
    }
    
    generateMethodTypes() {
        for (const [typeName, sig] of this.methodTypeSignatures) {
            const paramStr = sig.params.map(t => `(param ${t})`).join(' ');
            const resultStr = sig.result ? `(result ${sig.result})` : '';
            this.emit(`(type ${typeName} (func ${paramStr} ${resultStr}))`);
        }
    }
    
    collectStrings(node) {
        if (!node) return;
        if (node instanceof LiteralExpr && node.literalType === 'string') {
            if (!this.stringTable.has(node.value)) {
                this.stringTable.set(node.value, { offset: 0 });
            }
        }
        for (const key of Object.keys(node)) {
            const val = node[key];
            if (val instanceof ASTNode) this.collectStrings(val);
            else if (Array.isArray(val)) val.forEach(v => { if (v instanceof ASTNode) this.collectStrings(v); });
        }
    }
    
    generateStringData() {
        let offset = this.stringOffset;
        for (const [str, info] of this.stringTable) {
            const bytes = new TextEncoder().encode(str);
            // String object: length (i32) + data
            const lenBytes = new Uint8Array(4);
            new DataView(lenBytes.buffer).setInt32(0, bytes.length, true);
            const lenHex = Array.from(lenBytes).map(b => '\\' + b.toString(16).padStart(2, '0')).join('');
            const strHex = Array.from(bytes).map(b => '\\' + b.toString(16).padStart(2, '0')).join('');
            this.emit(`(data (i32.const ${offset}) "${lenHex}${strHex}")`);
            info.offset = offset;
            offset += 4 + bytes.length;
        }
        this.nextDataOffset = offset;
    }
    
    generateVTables() {
        let vtableOffset = this.nextDataOffset || 8192;
        for (const [className, classInfo] of this.classes) {
            if (classInfo.isBuiltin) continue;
            
            classInfo.vtableOffset = vtableOffset;
            // Parent VTable Offset (-1 if null)
            let parentOffset = -1;
            if (classInfo.baseClass && classInfo.baseClass.vtableOffset !== undefined) {
                parentOffset = classInfo.baseClass.vtableOffset;
            }
            const entries = this.classVtableEntries.get(className) || [];
            
            // Header (Parent Ptr) + Entries
            const parentBytes = new Uint8Array(4);
            new DataView(parentBytes.buffer).setInt32(0, parentOffset, true);
            let hex = Array.from(parentBytes).map(b => '\\' + b.toString(16).padStart(2, '0')).join('');
            
            if (entries.length > 0) {
                hex += entries.map(idx => {
                    const arr = new Uint8Array(4);
                    new DataView(arr.buffer).setInt32(0, idx, true);
                    return Array.from(arr).map(b => '\\' + b.toString(16).padStart(2, '0')).join('');
                }).join('');
            }
            this.emit(`(data (i32.const ${vtableOffset}) "${hex}") ;; vtable for ${className}`);
            vtableOffset += 4 + (entries.length * 4);
        }
    }
    
generateRuntime() {
        // 1. GLOBALS for Memory Management
        this.emit(`(global $__free_list (mut i32) (i32.const 0))`); 
        
        // 2. MALLOC (Try Free List -> Else Bump)
        this.emit(`(func $__malloc (param $size i32) (result i32)`);
        this.indent++;
        this.emit(`(local $ptr i32) (local $prev i32) (local $curr i32)`);
        
        // Add 4 bytes for header (to store size/next)
        this.emit(`(local.set $size (i32.add (local.get $size) (i32.const 4)))`);
        
        // START: Search Free List
        this.emit(`(local.set $curr (global.get $__free_list))`);
        this.emit(`(local.set $prev (i32.const 0))`);
        
        this.emit(`(block $found (loop $search`);
        this.emit(`  (br_if $found (i32.eqz (local.get $curr)))`); // End of list?
        
        // Check if block is big enough (read size at offset 0)
        this.emit(`(if (i32.ge_u (i32.load (local.get $curr)) (local.get $size))`);
        this.emit(`  (then`);
        // Unlink from list
        this.emit(`    (if (i32.eqz (local.get $prev))`);
        this.emit(`      (then (global.set $__free_list (i32.load offset=4 (local.get $curr))))`); // Head
        this.emit(`      (else (i32.store offset=4 (local.get $prev) (i32.load offset=4 (local.get $curr))))`); // Middle
        this.emit(`    )`);
        this.emit(`    (local.set $ptr (local.get $curr))`);
        this.emit(`    (br $found)`); // Found it!
        this.emit(`  ))`);
        
        this.emit(`  (local.set $prev (local.get $curr))`);
        this.emit(`  (local.set $curr (i32.load offset=4 (local.get $curr)))`); // Next
        this.emit(`  (br $search)`);
        this.emit(`))`);
        
        // If $ptr is 0, we didn't find a block. Bump the heap.
        this.emit(`(if (i32.eqz (local.get $ptr))`);
        this.emit(`  (then`);
        this.emit(`    (local.set $ptr (global.get $__heap_ptr))`);
        this.emit(`    (global.set $__heap_ptr (i32.add (local.get $ptr) (local.get $size)))`);
        this.emit(`    (i32.store (local.get $ptr) (local.get $size))`); // Store size in header
        this.emit(`  ))`);

        // Return pointer + 4 (skip header)
        this.emit(`(i32.add (local.get $ptr) (i32.const 4))`);
        this.indent--;
        this.emit(`)`);
        this.emit(`(export "__malloc" (func $__malloc))`);

        // 3. FREE (Add to Free List)
        this.emit(`(func $__free (param $ptr i32)`);
        this.indent++;
        // Move back 4 bytes to header
        this.emit(`(local.set $ptr (i32.sub (local.get $ptr) (i32.const 4)))`);
        // Point this block's "next" to the current head
        this.emit(`(i32.store offset=4 (local.get $ptr) (global.get $__free_list))`);
        // Make this block the new head
        this.emit(`(global.set $__free_list (local.get $ptr))`);
        this.indent--;
        this.emit(`)`);

        // ==================== STRING HELPERS ====================
        // String equals (Deep comparison)
        this.emit(`(func $__str_equals (param $a i32) (param $b i32) (result i32)`);
        this.indent++;
        this.emit(`(local $len i32) (local $i i32)`);
        
        // 1. Compare lengths. If different, return false (0)
        this.emit(`(local.set $len (i32.load (local.get $a)))`);
        this.emit(`(if (i32.ne (local.get $len) (i32.load (local.get $b)))`);
        this.emit(`  (then (i32.const 0) (return)))`);
        
        // 2. Loop through bytes
        this.emit(`(local.set $i (i32.const 0))`);
        this.emit(`(block $diff (loop $check`);
        this.emit(`  (br_if $diff (i32.ge_u (local.get $i) (local.get $len)))`); // End of string?
        
        // Load byte A and byte B
        this.emit(`  (if (i32.ne`); 
        this.emit(`      (i32.load8_u (i32.add (i32.add (local.get $a) (i32.const 4)) (local.get $i)))`);
        this.emit(`      (i32.load8_u (i32.add (i32.add (local.get $b) (i32.const 4)) (local.get $i)))`);
        this.emit(`  )`);
        this.emit(`    (then (i32.const 0) (return)))`); // Mismatch found
        
        this.emit(`  (local.set $i (i32.add (local.get $i) (i32.const 1)))`);
        this.emit(`  (br $check)`);
        this.emit(`))`);
        
        // 3. If we get here, they are equal
        this.emit(`(i32.const 1)`);
        this.indent--;
        this.emit(`)`);
        
        // String length
        this.emit(`(func $__str_length (param $s i32) (result i32)`);
        this.indent++;
        this.emit(`(i32.load (local.get $s))`);
        this.indent--;
        this.emit(`)`);

        // String charAt / charCodeAt
        this.emit(`(func $__str_charAt (param $s i32) (param $idx i32) (result i32)`);
        this.indent++;
        this.emit(`(i32.load8_u (i32.add (i32.add (local.get $s) (i32.const 4)) (local.get $idx)))`);
        this.indent--;
        this.emit(`)`);

        // String concat
        this.emit(`(func $__str_concat (param $a i32) (param $b i32) (result i32)`);
        this.indent++;
        this.emit(`(local $lenA i32) (local $lenB i32) (local $result i32) (local $i i32)`);
        this.emit(`(local.set $lenA (i32.load (local.get $a)))`);
        this.emit(`(local.set $lenB (i32.load (local.get $b)))`);
        this.emit(`(local.set $result (call $__malloc (i32.add (i32.add (local.get $lenA) (local.get $lenB)) (i32.const 4))))`);
        this.emit(`(i32.store (local.get $result) (i32.add (local.get $lenA) (local.get $lenB)))`);
        // Copy A
        this.emit(`(local.set $i (i32.const 0))`);
        this.emit(`(block $doneA (loop $loopA`);
        this.emit(`  (br_if $doneA (i32.ge_u (local.get $i) (local.get $lenA)))`);
        this.emit(`  (i32.store8 (i32.add (i32.add (local.get $result) (i32.const 4)) (local.get $i))`);
        this.emit(`              (i32.load8_u (i32.add (i32.add (local.get $a) (i32.const 4)) (local.get $i))))`);
        this.emit(`  (local.set $i (i32.add (local.get $i) (i32.const 1)))`);
        this.emit(`  (br $loopA)`);
        this.emit(`))`);
        // Copy B
        this.emit(`(local.set $i (i32.const 0))`);
        this.emit(`(block $doneB (loop $loopB`);
        this.emit(`  (br_if $doneB (i32.ge_u (local.get $i) (local.get $lenB)))`);
        this.emit(`  (i32.store8 (i32.add (i32.add (i32.add (local.get $result) (i32.const 4)) (local.get $lenA)) (local.get $i))`);
        this.emit(`              (i32.load8_u (i32.add (i32.add (local.get $b) (i32.const 4)) (local.get $i))))`);
        this.emit(`  (local.set $i (i32.add (local.get $i) (i32.const 1)))`);
        this.emit(`  (br $loopB)`);
        this.emit(`))`);
        this.emit(`(local.get $result)`);
        this.indent--;
        this.emit(`)`);

        // ==================== VEC HELPERS ====================

        // Vec constructor
        this.emit(`(func $__Vec_new (result i32)`);
        this.indent++;
        this.emit(`(local $v i32)`);
        this.emit(`(local.set $v (call $__malloc (i32.const 12)))`);
        this.emit(`(i32.store offset=0 (local.get $v) (i32.const 0))`);      // length = 0
        this.emit(`(i32.store offset=4 (local.get $v) (i32.const 8))`);      // capacity = 8
        this.emit(`(i32.store offset=8 (local.get $v) (call $__malloc (i32.const 32)))`); // data ptr (8*4)
        this.emit(`(local.get $v)`);
        this.indent--;
        this.emit(`)`);

        // Vec push
        this.emit(`(func $__Vec_push (param $v i32) (param $val i32)`);
        this.indent++;
        this.emit(`(local $len i32) (local $cap i32) (local $data i32) (local $newData i32)`);
        this.emit(`(local.set $len (i32.load offset=0 (local.get $v)))`);
        this.emit(`(local.set $cap (i32.load offset=4 (local.get $v)))`);
        this.emit(`(local.set $data (i32.load offset=8 (local.get $v)))`);
        this.emit(`(if (i32.ge_u (local.get $len) (local.get $cap))`);
        this.emit(` (then`);
        this.emit(`  (local.set $cap (i32.mul (local.get $cap) (i32.const 2)))`);
        this.emit(`  (local.set $newData (call $__malloc (i32.mul (local.get $cap) (i32.const 4))))`);
        this.emit(`  (memory.copy (local.get $newData) (local.get $data) (i32.mul (local.get $len) (i32.const 4)))`);
        this.emit(`  (i32.store offset=4 (local.get $v) (local.get $cap))`);
        this.emit(`  (i32.store offset=8 (local.get $v) (local.get $newData))`);
        this.emit(`  (local.set $data (local.get $newData))`);
        this.emit(` ))`);
        this.emit(`(i32.store (i32.add (local.get $data) (i32.mul (local.get $len) (i32.const 4))) (local.get $val))`);
        this.emit(`(i32.store offset=0 (local.get $v) (i32.add (local.get $len) (i32.const 1)))`);
        this.indent--;
        this.emit(`)`);

        // Vec get
        this.emit(`(func $__Vec_get (param $v i32) (param $idx i32) (result i32)`);
        this.indent++;
        this.emit(`(i32.load (i32.add (i32.load offset=8 (local.get $v)) (i32.mul (local.get $idx) (i32.const 4))))`);
        this.indent--;
        this.emit(`)`);

        // Vec length
        this.emit(`(func $__Vec_length (param $v i32) (result i32)`);
        this.indent++;
        this.emit(`(i32.load offset=0 (local.get $v))`);
        this.indent--;
        this.emit(`)`);

        // ==================== MAP HELPERS ====================

        // Simple i32 hash
        this.emit(`(func $__hash_i32 (param $key i32) (result i32)`);
        this.indent++;
        this.emit(`(local.get $key)`);
        this.emit(`(i32.const 0x45d9f3b)`);
        this.emit(`(i32.mul)`);
        this.emit(`(i32.const 0x119de1f3)`);
        this.emit(`(i32.xor)`);
        this.indent--;
        this.emit(`)`);

        // Map constructor
        this.emit(`(func $__Map_new (result i32)`);
        this.indent++;
        this.emit(`(local $m i32) (local $buckets i32)`);
        this.emit(`(local.set $m (call $__malloc (i32.const 16)))`);                     // size, cap, keys_ptr, values_ptr
        this.emit(`(i32.store offset=0 (local.get $m) (i32.const 0))`);                 // size = 0
        this.emit(`(i32.store offset=4 (local.get $m) (i32.const 16))`);                // capacity = 16
        this.emit(`(local.set $buckets (call $__malloc (i32.mul (i32.const 16) (i32.const 8))))`); // 16 * (key + value)
        this.emit(`(i32.store offset=8 (local.get $m) (local.get $buckets))`);          // keys start
        this.emit(`(i32.store offset=12 (local.get $m) (i32.add (local.get $buckets) (i32.const 64)))`); // values start after keys
        this.emit(`(call $__Map_clear_keys (local.get $m))`);
        this.emit(`(local.get $m)`);
        this.indent--;
        this.emit(`)`);

        // Helper: clear all key slots
        this.emit(`(func $__Map_clear_keys (param $m i32)`);
        this.indent++;
        this.emit(`(local $i i32) (local $cap i32) (local $keys i32)`);
        this.emit(`(local.set $cap (i32.load offset=4 (local.get $m)))`);
        this.emit(`(local.set $keys (i32.load offset=8 (local.get $m)))`);
        this.emit(`(local.set $i (i32.const 0))`);
        this.emit(`(block $clear`);
        this.emit(` (loop $clear_loop`);
        this.emit(`  (br_if $clear (i32.ge_u (local.get $i) (local.get $cap)))`);
        this.emit(`  (i32.store (i32.add (local.get $keys) (i32.mul (local.get $i) (i32.const 8))) (i32.const 0))`);
        this.emit(`  (local.set $i (i32.add (local.get $i) (i32.const 1)))`);
        this.emit(`  (br $clear_loop)`);
        this.emit(` ))`);
        this.indent--;
        this.emit(`)`);

        // Map size
        this.emit(`(func $__Map_size (param $m i32) (result i32)`);
        this.indent++;
        this.emit(`(i32.load offset=0 (local.get $m))`);
        this.indent--;
        this.emit(`)`);

        // Map set
        this.emit(`(func $__Map_set (param $m i32) (param $key i32) (param $value i32)`);
        this.indent++;
        // FIX: Added $slotKey to declarations
        this.emit(`(local $size i32) (local $cap i32) (local $keys i32) (local $values i32)`);
        this.emit(`(local $index i32) (local $probe i32) (local $slotKey i32)`);
        this.emit(`(local.set $size (i32.load offset=0 (local.get $m)))`);
        this.emit(`(local.set $cap (i32.load offset=4 (local.get $m)))`);
        this.emit(`(local.set $keys (i32.load offset=8 (local.get $m)))`);
        this.emit(`(local.set $values (i32.load offset=12 (local.get $m)))`);

        // Grow if load factor > 0.75
        this.emit(`(if (i32.gt_u (local.get $size) (i32.div_u (i32.mul (local.get $cap) (i32.const 3)) (i32.const 4)))`);
        this.emit(` (then`);
        this.emit(`  (call $__Map_grow (local.get $m))`);
        this.emit(`  (local.set $cap (i32.load offset=4 (local.get $m)))`);
        this.emit(`  (local.set $keys (i32.load offset=8 (local.get $m)))`);
        this.emit(`  (local.set $values (i32.load offset=12 (local.get $m)))`);
        this.emit(` ))`);

        // Hash + probe
        this.emit(`(local.set $index (i32.rem_u (call $__hash_i32 (local.get $key)) (local.get $cap)))`);
        this.emit(`(local.set $probe (i32.const 0))`);
        this.emit(`(block $done (loop $search`);
        this.emit(`  (local.set $probe (i32.add (local.get $probe) (i32.const 1)))`);
        this.emit(`  (br_if $done (i32.ge_u (local.get $probe) (local.get $cap)))`);
        // FIX: local.set used correctly
        this.emit(`  (local.set $slotKey (i32.load (i32.add (local.get $keys) (i32.mul (local.get $index) (i32.const 8)))))`);
        
        this.emit(`  (if (i32.eqz (local.get $slotKey))`);
        this.emit(`    (then`);
        this.emit(`      (i32.store (i32.add (local.get $keys) (i32.mul (local.get $index) (i32.const 8))) (local.get $key))`);
        this.emit(`      (i32.store (i32.add (local.get $values) (i32.mul (local.get $index) (i32.const 8))) (local.get $value))`);
        this.emit(`      (i32.store offset=0 (local.get $m) (i32.add (local.get $size) (i32.const 1)))`);
        this.emit(`      (br $done)`);
        this.emit(`    ))`);
        
        this.emit(`  (if (i32.eq (local.get $slotKey) (local.get $key))`);
        this.emit(`    (then`);
        this.emit(`      (i32.store (i32.add (local.get $values) (i32.mul (local.get $index) (i32.const 8))) (local.get $value))`);
        this.emit(`      (br $done)`);
        this.emit(`    ))`);
        
        this.emit(`  (local.set $index (i32.rem_u (i32.add (local.get $index) (i32.const 1)) (local.get $cap)))`);
        this.emit(`  (br $search)`);
        this.emit(`))`);
        this.indent--;
        this.emit(`)`);

        // Map get (returns 0 if not found)
        this.emit(`(func $__Map_get (param $m i32) (param $key i32) (result i32)`);
        this.indent++;
        // FIX: Added $slotKey to declarations
        this.emit(`(local $cap i32) (local $keys i32) (local $values i32) (local $index i32) (local $probe i32) (local $slotKey i32)`);
        this.emit(`(local.set $cap (i32.load offset=4 (local.get $m)))`);
        this.emit(`(local.set $keys (i32.load offset=8 (local.get $m)))`);
        this.emit(`(local.set $values (i32.load offset=12 (local.get $m)))`);
        this.emit(`(local.set $index (i32.rem_u (call $__hash_i32 (local.get $key)) (local.get $cap)))`);
        this.emit(`(local.set $probe (i32.const 0))`);
        this.emit(`(block $notfound (loop $search`);
        this.emit(`  (br_if $notfound (i32.ge_u (local.get $probe) (local.get $cap)))`);
        // FIX: Changed 'local' to 'local.set'
        this.emit(`  (local.set $slotKey (i32.load (i32.add (local.get $keys) (i32.mul (local.get $index) (i32.const 8)))))`);
        this.emit(`  (if (i32.eqz (local.get $slotKey)) (then (br $notfound)))`);
        this.emit(`  (if (i32.eq (local.get $slotKey) (local.get $key))`);
        this.emit(`   (then (i32.load (i32.add (local.get $values) (i32.mul (local.get $index) (i32.const 8)))) (return)))`);
        this.emit(`  (local.set $index (i32.rem_u (i32.add (local.get $index) (i32.const 1)) (local.get $cap)))`);
        this.emit(`  (local.set $probe (i32.add (local.get $probe) (i32.const 1)))`);
        this.emit(`  (br $search)`);
        this.emit(`))`);
        this.emit(`(i32.const 0)`);
        this.indent--;
        this.emit(`)`);

        // Map has
        this.emit(`(func $__Map_has (param $m i32) (param $key i32) (result i32)`);
        this.indent++;
        // FIX: Added $slotKey to declarations
        this.emit(`(local $cap i32) (local $keys i32) (local $index i32) (local $probe i32) (local $slotKey i32)`);
        this.emit(`(local.set $cap (i32.load offset=4 (local.get $m)))`);
        this.emit(`(local.set $keys (i32.load offset=8 (local.get $m)))`);
        this.emit(`(local.set $index (i32.rem_u (call $__hash_i32 (local.get $key)) (local.get $cap)))`);
        this.emit(`(local.set $probe (i32.const 0))`);
        this.emit(`(block $notfound (loop $search`);
        this.emit(`  (br_if $notfound (i32.ge_u (local.get $probe) (local.get $cap)))`);
        // FIX: Changed 'local' to 'local.set'
        this.emit(`  (local.set $slotKey (i32.load (i32.add (local.get $keys) (i32.mul (local.get $index) (i32.const 8)))))`);
        this.emit(`  (if (i32.eqz (local.get $slotKey)) (then (br $notfound)))`);
        this.emit(`  (if (i32.eq (local.get $slotKey) (local.get $key))`);
        this.emit(`   (then (i32.const 1) (return)))`);
        this.emit(`  (local.set $index (i32.rem_u (i32.add (local.get $index) (i32.const 1)) (local.get $cap)))`);
        this.emit(`  (local.set $probe (i32.add (local.get $probe) (i32.const 1)))`);
        this.emit(`  (br $search)`);
        this.emit(`))`);
        this.emit(`(i32.const 0)`);
        this.indent--;
        this.emit(`)`);

        // Map grow (double capacity + rehash)
        this.emit(`(func $__Map_grow (param $m i32)`);
        this.indent++;
        this.emit(`(local $oldCap i32) (local $oldKeys i32) (local $oldValues i32)`);
        this.emit(`(local $newCap i32) (local $newBuckets i32) (local $i i32) (local $key i32) (local $value i32)`);
        this.emit(`(local.set $oldCap (i32.load offset=4 (local.get $m)))`);
        this.emit(`(local.set $oldKeys (i32.load offset=8 (local.get $m)))`);
        this.emit(`(local.set $oldValues (i32.load offset=12 (local.get $m)))`);
        this.emit(`(local.set $newCap (i32.mul (local.get $oldCap) (i32.const 2)))`);
        this.emit(`(local.set $newBuckets (call $__malloc (i32.mul (local.get $newCap) (i32.const 8))))`);
        this.emit(`(i32.store offset=4 (local.get $m) (local.get $newCap))`);
        this.emit(`(i32.store offset=8 (local.get $m) (local.get $newBuckets))`);
        this.emit(`(i32.store offset=12 (local.get $m) (i32.add (local.get $newBuckets) (i32.mul (local.get $newCap) (i32.const 4))))`);
        this.emit(`(call $__Map_clear_keys (local.get $m))`);
        // Re-insert old entries
        this.emit(`(local.set $i (i32.const 0))`);
        this.emit(`(block $rehash`);
        this.emit(` (loop $rehash_loop`);
        this.emit(`  (br_if $rehash (i32.ge_u (local.get $i) (local.get $oldCap)))`);
        this.emit(`  (local.set $key (i32.load (i32.add (local.get $oldKeys) (i32.mul (local.get $i) (i32.const 8)))))`);
        this.emit(`  (br_if $rehash_loop (i32.eqz (local.get $key)))`);
        this.emit(`  (local.set $value (i32.load (i32.add (local.get $oldValues) (i32.mul (local.get $i) (i32.const 8)))))`);
        this.emit(`  (call $__Map_set (local.get $m) (local.get $key) (local.get $value))`);
        this.emit(`  (local.set $i (i32.add (local.get $i) (i32.const 1)))`);
        this.emit(`  (br $rehash_loop)`);
        this.emit(` ))`);
        this.indent--;
        this.emit(`)`);
    
        // Vec Free
        this.emit(`(func $__Vec_free (param $v i32)`);
        this.indent++;
        this.emit(`(call $__free (i32.load offset=8 (local.get $v)))`); // Free buffer
        this.emit(`(call $__free (local.get $v))`); // Free struct
        this.indent--;
        this.emit(`)`);

        // Map Free
        this.emit(`(func $__Map_free (param $m i32)`);
        this.indent++;
        this.emit(`(call $__free (i32.load offset=8 (local.get $m)))`); // Free buckets
        this.emit(`(call $__free (local.get $m))`); // Free struct
        this.indent--;
        this.emit(`)`);
        
        // ==================== CLONE HELPERS ====================

        // Vec Clone (Deep Copy)
        this.emit(`(func $__Vec_clone (param $v i32) (result i32)`);
        this.indent++;
        this.emit(`(local $newV i32) (local $len i32) (local $cap i32) (local $srcData i32) (local $destData i32)`);
        
        // 1. Create new Vec structure
        this.emit(`(local.set $newV (call $__malloc (i32.const 12)))`);
        
        // 2. Get properties of old Vec
        this.emit(`(local.set $len (i32.load offset=0 (local.get $v)))`);
        this.emit(`(local.set $cap (i32.load offset=4 (local.get $v)))`);
        this.emit(`(local.set $srcData (i32.load offset=8 (local.get $v)))`);
        
        // 3. Copy properties
        this.emit(`(i32.store offset=0 (local.get $newV) (local.get $len))`);
        this.emit(`(i32.store offset=4 (local.get $newV) (local.get $cap))`);
        
        // 4. Allocate NEW data buffer (Deep Copy step 1)
        this.emit(`(local.set $destData (call $__malloc (i32.mul (local.get $cap) (i32.const 4))))`);
        this.emit(`(i32.store offset=8 (local.get $newV) (local.get $destData))`);
        
        // 5. Memcpy the contents (Deep Copy step 2)
        // Note: If T is a primitive (i32/f64), memcpy is fine.
        // If T is a Pointer (String/Vec), this is still a Shallow Copy of the inner elements!
        // shallow copy of elements is acceptable C behavior.
        this.emit(`(memory.copy (local.get $destData) (local.get $srcData) (i32.mul (local.get $len) (i32.const 4)))`);
        
        this.emit(`(local.get $newV)`);
        this.indent--;
        this.emit(`)`);

        // Map Clone (Deep Copy)
        this.emit(`(func $__Map_clone (param $m i32) (result i32)`);
        this.indent++;
        this.emit(`(local $newM i32) (local $cap i32) (local $srcBuckets i32) (local $destBuckets i32)`);
        
        this.emit(`(local.set $newM (call $__malloc (i32.const 16)))`);
        this.emit(`(local.set $cap (i32.load offset=4 (local.get $m)))`);
        
        // Copy struct fields
        this.emit(`(i32.store offset=0 (local.get $newM) (i32.load offset=0 (local.get $m)))`); // size
        this.emit(`(i32.store offset=4 (local.get $newM) (local.get $cap))`); // cap
        
        // Allocate new buckets
        this.emit(`(local.set $destBuckets (call $__malloc (i32.mul (local.get $cap) (i32.const 8))))`);
        this.emit(`(local.set $srcBuckets (i32.load offset=8 (local.get $m)))`);
        
        // Set pointers
        this.emit(`(i32.store offset=8 (local.get $newM) (local.get $destBuckets))`); // keys
        this.emit(`(i32.store offset=12 (local.get $newM) (i32.add (local.get $destBuckets) (i32.mul (local.get $cap) (i32.const 4))))`); // values
        
        // Memcpy buckets
        this.emit(`(memory.copy (local.get $destBuckets) (local.get $srcBuckets) (i32.mul (local.get $cap) (i32.const 8)))`);
        
        this.emit(`(local.get $newM)`);
        this.indent--;
        this.emit(`)`);       
        
    }
    
    generateClass(decl) {
        const classInfo = this.classes.get(decl.name);
        if (!classInfo || classInfo.isBuiltin) return;
        
        this.currentClass = classInfo;
        
        // Constructor
        const ctor = decl.members.find(m => m instanceof ConstructorDecl);
        this.generateConstructor(decl.name, classInfo, ctor);
        
        // Methods
        for (const member of decl.members) {
            if (member instanceof MethodDecl && member.body) {
                this.generateMethod(decl.name, classInfo, member);
            }
        }
        
        this.currentClass = null;
    }
    
    generateConstructor(className, classInfo, ctorDecl) {
        this.locals = new Map();
        this.localIndex = 0;
        
        const params = ctorDecl ? ctorDecl.params : [];
        let paramStr = params.map(p => {
            const type = this.resolveWatType(this.resolveTypeInfo(p.type));
            this.locals.set(p.name, { index: this.localIndex++, type });
            return `(param $${p.name} ${type})`;
        }).join(' ');
        
        this.emit(`(func $${className}__new ${paramStr} (result i32)`);
        this.indent++;
        
        this.emit(`(local $this i32)`);
        this.locals.set('this', { index: this.localIndex++, type: 'i32' });
        
        // Collect locals
        if (ctorDecl && ctorDecl.body) {
            this.collectLocals(ctorDecl.body);
        }
        
        // Allocate
        this.emit(`(i32.const ${classInfo.instanceSize})`);
        this.emit(`(call $__malloc)`);
        this.emit(`(local.set $this)`);
        
        // Set vtable
        this.emit(`(local.get $this)`);
        this.emit(`(i32.const ${classInfo.vtableOffset || 0})`);
        this.emit(`(i32.store)`);
        
        // Constructor body
        if (ctorDecl && ctorDecl.body) {
            this.generateBlock(ctorDecl.body);
        }
        
        this.emit(`(local.get $this)`);
        this.indent--;
        this.emit(`)`);
        this.emit(`(export "${className}__new" (func $${className}__new))`);
        
        // __init function
        this.locals = new Map();
        this.localIndex = 0;
        
        let initParams = '(param $this i32)';
        this.locals.set('this', { index: this.localIndex++, type: 'i32' });
        
        for (const p of params) {
            const type = this.resolveWatType(this.resolveTypeInfo(p.type));
            this.locals.set(p.name, { index: this.localIndex++, type });
            initParams += ` (param $${p.name} ${type})`;
        }
        
        this.emit(`(func $${className}__init ${initParams}`);
        this.indent++;
        
        if (ctorDecl && ctorDecl.body) {
            this.collectLocals(ctorDecl.body);
            this.generateBlock(ctorDecl.body);
        }
        
        this.indent--;
        this.emit(`)`);
    }
    
generateMethod(className, classInfo, decl) {
        this.locals = new Map();
        this.localIndex = 0;
        
        let paramStr = '';
        if (!decl.isStatic) {
            paramStr = '(param $this i32)';
            this.locals.set('this', { index: this.localIndex++, type: 'i32' });
        }
        
        for (const p of decl.params) {
            const type = this.resolveWatType(this.resolveTypeInfo(p.type));
            this.locals.set(p.name, { index: this.localIndex++, type });
            paramStr += ` (param $${p.name} ${type})`;
        }
        
        const retType = this.resolveWatType(this.resolveTypeInfo(decl.returnType));
        const resultStr = retType ? `(result ${retType})` : '';
        
        this.emit(`(func $${className}__${decl.name} ${paramStr} ${resultStr}`);
        this.indent++;
        
        this.collectLocals(decl.body);

        if (retType) {
            this.emit(`(local $__retval ${retType})`);
        }

        // Also ensure scope is reset for methods
        this.scopeStack = []; 
        this.generateBlock(decl.body, true);
        
        this.indent--;
        this.emit(`)`);
        
        if (decl.visibility === 'public') {
            this.emit(`(export "${className}__${decl.name}" (func $${className}__${decl.name}))`);
        }
    }
    
generateFunction(decl) {
        this.locals = new Map();
        this.localIndex = 0;
        
        let paramStr = '';
        for (const p of decl.params) {
            const type = this.resolveWatType(this.resolveTypeInfo(p.type));
            this.locals.set(p.name, { index: this.localIndex++, type });
            paramStr += `(param $${p.name} ${type}) `;
        }
        
        const retType = this.resolveWatType(this.resolveTypeInfo(decl.returnType));
        const resultStr = retType ? `(result ${retType})` : '';
        
        this.emit(`(func $${decl.name} ${paramStr}${resultStr}`);
        this.indent++;
        
        this.collectLocals(decl.body);

        if (retType) {
            this.emit(`(local $__retval ${retType})`);
        }

        this.scopeStack = []; // Reset RAII stack
        this.generateBlock(decl.body, true); // Mark as function body
        
        this.indent--;
        this.emit(`)`);
        
        if (decl.isExport) {
            this.emit(`(export "${decl.name}" (func $${decl.name}))`);
        }
    }
    
   
    
    generateBlock(block, isFunctionBody = false) {
        this.pushScope();

        for (const stmt of block.statements) {
            this.generateStatement(stmt);
        }

        this.popScope(); // Runs destructors
    }
    
    generateStatement(stmt) {
        switch (stmt.nodeType) {
            case 'ExprStmt':
                this.generateExpression(stmt.expression);
                if (stmt.expression.resolvedType && !stmt.expression.resolvedType.equals(BUILTIN_TYPES.void)) {
                    this.emit(`(drop)`);
                }
                break;
                
            case 'ReturnStmt':
                if (stmt.value) {
                    this.generateExpression(stmt.value);
                    // If returning a value, store it in a temp local so it persists past destructors
                    if (stmt.value.resolvedType && !stmt.value.resolvedType.equals(BUILTIN_TYPES.void)) {
                         // Note: Ensure $__retval is added to collectLocals if not already present
                        this.emit(`(local.set $__retval)`); 
                    }
                }
                
                // RAII: Run Destructors for ALL scopes (Reverse order) because we are leaving function
                for (let i = this.scopeStack.length - 1; i >= 0; i--) {
                    const scope = this.scopeStack[i];
                    for (let j = scope.locals.length - 1; j >= 0; j--) {
                        this.generateDestructorCall(scope.locals[j]);
                    }
                }

                // Restore return value
                if (stmt.value && !stmt.value.resolvedType.equals(BUILTIN_TYPES.void)) {
                    this.emit(`(local.get $__retval)`);
                }

                this.emit(`(return)`);
                break;
                
            case 'IfStmt':
                this.generateExpression(stmt.condition);
                this.emit(`(if`);
                this.indent++;
                this.emit(`(then`);
                this.indent++;
                this.generateStatement(stmt.thenBranch);
                this.indent--;
                this.emit(`)`);
                if (stmt.elseBranch) {
                    this.emit(`(else`);
                    this.indent++;
                    this.generateStatement(stmt.elseBranch);
                    this.indent--;
                    this.emit(`)`);
                }
                this.indent--;
                this.emit(`)`);
                break;
                
            case 'WhileStmt': {
                const loopId = this.loopCounter++;
                this.loopLabels.push({ break: `$while_end_${loopId}`, continue: `$while_${loopId}` });
                
                this.emit(`(block $while_end_${loopId}`);
                this.indent++;
                this.emit(`(loop $while_${loopId}`);
                this.indent++;
                
                this.generateExpression(stmt.condition);
                this.emit(`(i32.eqz)`);
                this.emit(`(br_if $while_end_${loopId})`);
                
                this.generateStatement(stmt.body);
                
                this.emit(`(br $while_${loopId})`);
                this.indent--;
                this.emit(`)`);
                this.indent--;
                this.emit(`)`);
                
                this.loopLabels.pop();
                break;
            }
                
            case 'ForStmt': {
                const loopId = this.loopCounter++;
                this.loopLabels.push({ break: `$for_end_${loopId}`, continue: `$for_cont_${loopId}` });
                
                if (stmt.init) {
                    if (stmt.init instanceof VarDeclStmt) {
                        this.generateStatement(stmt.init);
                    } else {
                        this.generateExpression(stmt.init);
                        this.emit(`(drop)`);
                    }
                }
                
                this.emit(`(block $for_end_${loopId}`);
                this.indent++;
                this.emit(`(loop $for_${loopId}`);
                this.indent++;
                
                if (stmt.condition) {
                    this.generateExpression(stmt.condition);
                    this.emit(`(i32.eqz)`);
                    this.emit(`(br_if $for_end_${loopId})`);
                }
                
                this.generateStatement(stmt.body);
                
                this.emit(`(block $for_cont_${loopId})`);
                
                if (stmt.update) {
                    this.generateExpression(stmt.update);
                    this.emit(`(drop)`);
                }
                
                this.emit(`(br $for_${loopId})`);
                this.indent--;
                this.emit(`)`);
                this.indent--;
                this.emit(`)`);
                
                this.loopLabels.pop();
                break;
            }
                
            case 'ForEachStmt': {
                const loopId = this.loopCounter++;
                const iterVar = `__iter_${loopId}`;
                this.loopLabels.push({ break: `$foreach_end_${loopId}`, continue: `$foreach_${loopId}` });
                
                // Initialize iterator to 0
                this.emit(`(i32.const 0)`);
                this.emit(`(local.set $${iterVar})`);
                
                this.emit(`(block $foreach_end_${loopId}`);
                this.indent++;
                this.emit(`(loop $foreach_${loopId}`);
                this.indent++;
                
                // Check if iterator < length
                this.emit(`(local.get $${iterVar})`);
                this.generateExpression(stmt.iterable);
                this.emit(`(call $__Vec_length)`);
                this.emit(`(i32.ge_u)`);
                this.emit(`(br_if $foreach_end_${loopId})`);
                
                // Get current element
                this.generateExpression(stmt.iterable);
                this.emit(`(local.get $${iterVar})`);
                this.emit(`(call $__Vec_get)`);
                this.emit(`(local.set $${stmt.variable})`);
                
                this.generateStatement(stmt.body);
                
                // Increment iterator
                this.emit(`(local.get $${iterVar})`);
                this.emit(`(i32.const 1)`);
                this.emit(`(i32.add)`);
                this.emit(`(local.set $${iterVar})`);
                
                this.emit(`(br $foreach_${loopId})`);
                this.indent--;
                this.emit(`)`);
                this.indent--;
                this.emit(`)`);
                
                this.loopLabels.pop();
                break;
            }
                
            case 'BreakStmt':
                if (this.loopLabels.length > 0) {
                    this.emit(`(br ${this.loopLabels[this.loopLabels.length - 1].break})`);
                }
                break;
                
            case 'ContinueStmt':
                if (this.loopLabels.length > 0) {
                    this.emit(`(br ${this.loopLabels[this.loopLabels.length - 1].continue})`);
                }
                break;
                
            case 'VarDeclStmt':
                if (stmt.initializer) {
                    this.generateExpression(stmt.initializer);
                    this.emit(`(local.set $${stmt.name})`);
                    
                    // Register for RAII cleanup
                    this.registerLocalInScope(stmt.name, stmt.resolvedType);
                }
                break;
                
            case 'BlockStmt':
                this.generateBlock(stmt);
                break;
               
            case 'SwitchStmt':
                const endLabel = `switch_end_${this.loopCounter++}`;
                this.loopLabels.push({ break: `$${endLabel}`, continue: null });
                
                this.emit(`(block $${endLabel}`);
                this.indent++;
                
                this.generateExpression(stmt.discriminant);
                this.emit(`(local.set $__switch_disc)`);
                this.emit(`(local.set $__switch_matched (i32.const 0))`);

                for (const c of stmt.cases) {
                    this.emit(`(local.get $__switch_matched)`);
                    this.emit(`(if (result i32) (then (i32.const 1)) (else`); 
                    this.indent++;
                        this.emit(`(local.get $__switch_disc)`);
                        this.generateExpression(c.value);
                        this.emit(`(i32.eq)`);
                    this.indent--;
                    this.emit(`))`);
                    this.emit(`(local.set $__switch_matched)`);

                    this.emit(`(local.get $__switch_matched)`);
                    this.emit(`(if (then`);
                    this.indent++;
                        this.generateStatement(c.body);
                    this.indent--;
                    this.emit(`))`);
                }

                if (stmt.defaultCase) {
                    this.emit(`(local.get $__switch_matched)`);
                    this.emit(`(i32.eqz)`);
                    this.emit(`(if (then`);
                    this.indent++;
                        this.generateStatement(stmt.defaultCase);
                    this.indent--;
                    this.emit(`))`);
                }

                this.indent--;
                this.emit(`)`); // End block
                this.loopLabels.pop();
                break;

            case 'TryStmt':
                this.generateStatement(stmt.tryBlock);
                // Catch is skipped in MVP as errors trap.
                if (stmt.finallyBlock) {
                    this.generateStatement(stmt.finallyBlock);
                }
                break;

            case 'ThrowStmt':
                this.generateExpression(stmt.expression);
                this.emit(`(drop)`);
                this.emit(`(unreachable)`);
                break;

            case 'BreakStmt':
                if (this.loopLabels.length > 0) {
                    this.emit(`(br ${this.loopLabels[this.loopLabels.length - 1].break})`);
                }
                break;

            default:
                this.emit(`;; Unknown statement: ${stmt.nodeType}`);
        }
    }
    
    generateExpression(expr) {
        switch (expr.nodeType) {
            case 'LiteralExpr':
                if (expr.literalType === 'number') {
                        // Check if the semantic analyzer marked this as an i64
                        if (expr.resolvedType && expr.resolvedType.name === 'i64') {
                            this.emit(`(i64.const ${expr.value})`);
                        } else if (Number.isInteger(expr.value)) {
                            this.emit(`(i32.const ${expr.value})`);
                        } else {
                            this.emit(`(f64.const ${expr.value})`);
                        }
                } else if (expr.literalType === 'bool') {
                    this.emit(`(i32.const ${expr.value ? 1 : 0})`);
                } else if (expr.literalType === 'string') {
                    const info = this.stringTable.get(expr.value);
                    this.emit(`(i32.const ${info ? info.offset : 0})`);
                }
                break;
                
            case 'NullExpr':
                this.emit(`(i32.const 0)`);
                break;
                
            case 'IdentifierExpr':
                if (expr.isLocal) {
                    this.emit(`(local.get $${expr.name})`);
                } else if (expr.isGlobal) {
                    this.emit(`(global.get $${expr.name})`);
                }
                break;
                
            case 'ThisExpr':
                this.emit(`(local.get $this)`);
                break;
                
            case 'BinaryExpr':
                this.generateExpression(expr.left);
                this.generateExpression(expr.right);
                this.generateBinaryOp(expr.operator, expr.resolvedType);
                break;
                
            case 'UnaryExpr':
                if (expr.isPrefix) {
                    if (expr.operator === '-') {
                        this.emit(`(i32.const 0)`);
                        this.generateExpression(expr.operand);
                        this.emit(`(i32.sub)`);
                    } else if (expr.operator === '!') {
                        this.generateExpression(expr.operand);
                        this.emit(`(i32.eqz)`);
                    } else if (expr.operator === '~') {
                        this.emit(`(i32.const -1)`);
                        this.generateExpression(expr.operand);
                        this.emit(`(i32.xor)`);
                    } else if (expr.operator === '++' || expr.operator === '--') {
                        this.generateExpression(expr.operand);
                        this.emit(`(i32.const 1)`);
                        this.emit(expr.operator === '++' ? `(i32.add)` : `(i32.sub)`);
                        if (expr.operand.nodeType === 'IdentifierExpr') {
                            this.emit(`(local.tee $${expr.operand.name})`);
                        }
                    }
                } else {
                    // NEW: POSTFIX HANDLERS (v++, v--)
                    // Returns the OLD value, updates to NEW value
                    const op = expr.operator === '++' ? 'i32.add' : 'i32.sub';
                    
                    if (expr.operand.nodeType === 'IdentifierExpr') {
                        if (expr.operand.isLocal) {
                            this.emit(`(local.get $${expr.operand.name})`); // Push OLD (result)
                            this.emit(`(local.get $${expr.operand.name})`); // Push OLD (for calc)
                            this.emit(`(i32.const 1)`);
                            this.emit(`(${op})`);
                            this.emit(`(local.set $${expr.operand.name})`); // Update
                        } else if (expr.operand.isGlobal) {
                            this.emit(`(global.get $${expr.operand.name})`); 
                            this.emit(`(global.get $${expr.operand.name})`); 
                            this.emit(`(i32.const 1)`);
                            this.emit(`(${op})`);
                            this.emit(`(global.set $${expr.operand.name})`); 
                        }
                    } 
                    // Handle Static Fields (VgaDriver.row++)
                    else if (expr.operand.nodeType === 'MemberExpr' && expr.operand.isStaticField) {
                        const globalName = expr.operand.staticFieldName;
                        this.emit(`(global.get ${globalName})`); // Push OLD (result)
                        this.emit(`(global.get ${globalName})`); // Push OLD (for calc)
                        this.emit(`(i32.const 1)`);
                        this.emit(`(${op})`);
                        this.emit(`(global.set ${globalName})`); // Update
                    }
                }
                break;
                
            case 'CallExpr':
                this.generateCallExpr(expr);
                break;
                
            case 'MemberExpr':
                this.generateMemberExpr(expr);
                break;
                
            case 'IndexExpr':
                if (expr.isVecIndex) {
                    this.generateExpression(expr.object);
                    this.generateExpression(expr.index);
                    this.emit(`(call $__Vec_get)`);
                } else if (expr.isStringIndex) {
                    this.generateExpression(expr.object);
                    this.generateExpression(expr.index);
                    this.emit(`(call $__str_charAt)`);
                } else {
                    this.generateExpression(expr.object);
                    this.generateExpression(expr.index);
                    this.emit(`(i32.const 4)`);
                    this.emit(`(i32.mul)`);
                    this.emit(`(i32.add)`);
                    this.emit(`(i32.load)`);
                }
                break;
                
            case 'AssignExpr':
                this.generateAssignExpr(expr);
                break;
                
            case 'NewExpr':
                this.generateNewExpr(expr);
                break;
                
            case 'TernaryExpr':
                this.generateExpression(expr.condition);
                this.emit(`(if (result i32)`);
                this.indent++;
                this.emit(`(then`);
                this.indent++;
                this.generateExpression(expr.thenExpr);
                this.indent--;
                this.emit(`)`);
                this.emit(`(else`);
                this.indent++;
                this.generateExpression(expr.elseExpr);
                this.indent--;
                this.emit(`)`);
                this.indent--;
                this.emit(`)`);
                break;
                
            case 'NullCoalesceExpr':
                // left ?? right: if left != 0 then left else right
                this.generateExpression(expr.left);
                this.emit(`(local.tee $__tmp)`);
                this.emit(`(if (result i32)`);
                this.indent++;
                this.emit(`(then (local.get $__tmp))`);
                this.emit(`(else`);
                this.indent++;
                this.generateExpression(expr.right);
                this.indent--;
                this.emit(`)`);
                this.indent--;
                this.emit(`)`);
                break;
                
            case 'CastExpr':
                this.generateExpression(expr.expression);
                
                // Handle type conversions
                const sourceType = expr.expression.resolvedType;
                const targetType = expr.resolvedType;
                
                if (sourceType && targetType) {
                    const sourceName = sourceType.name || sourceType.kind;
                    const targetName = targetType.name || targetType.kind;
                    
                    // i32 -> i64
                    if (sourceName === 'i32' && targetName === 'i64') {
                        this.emit(`(i64.extend_i32_s)`);
                    }
                    // i64 -> i32
                    else if (sourceName === 'i64' && targetName === 'i32') {
                        this.emit(`(i32.wrap_i64)`);
                    }
                    // f32 -> f64
                    else if (sourceName === 'f32' && targetName === 'f64') {
                        this.emit(`(f64.promote_f32)`);
                    }
                    // f64 -> f32
                    else if (sourceName === 'f64' && targetName === 'f32') {
                        this.emit(`(f32.demote_f64)`);
                    }
                    // i32 -> f64
                    else if (sourceName === 'i32' && targetName === 'f64') {
                        this.emit(`(f64.convert_i32_s)`);
                    }
                    // f64 -> i32
                    else if (sourceName === 'f64' && targetName === 'i32') {
                        this.emit(`(i32.trunc_f64_s)`);
                    }
                }
                break;
                
            case 'SizeofExpr':
                this.emit(`(i32.const ${expr.targetSize || 4})`);
                break;
               
            case 'InstanceOfExpr':
                if (!expr.targetClassInfo || expr.targetClassInfo.vtableOffset === undefined) {
                    this.emit(`(i32.const 0)`); 
                    this.generateExpression(expr.left); 
                    this.emit(`(drop)`); 
                    break;
                }

                const tempLocal = `__inst_temp_${this.localIndex++}`;
                this.emit(`(local $${tempLocal} i32)`);
                
                this.generateExpression(expr.left);
                this.emit(`(local.tee $${tempLocal})`);
                this.emit(`(i32.eqz)`);
                this.emit(`(if (result i32) (then (i32.const 0)) (else`); 
                this.indent++;
                    this.emit(`(block $found (result i32)`);
                    this.emit(`(local.get $${tempLocal})`); 
                    this.emit(`(i32.load)`);
                    this.emit(`(local.set $${tempLocal})`); 

                    this.emit(`(loop $search`);
                        this.emit(`(local.get $${tempLocal})`);
                        this.emit(`(i32.const ${expr.targetClassInfo.vtableOffset})`);
                        this.emit(`(i32.eq)`);
                        this.emit(`(br_if $found (i32.const 1))`); 
                        
                        this.emit(`(local.get $${tempLocal})`);
                        this.emit(`(i32.load)`); // Load Parent Offset
                        this.emit(`(local.tee $${tempLocal})`);
                        this.emit(`(i32.const -1)`);
                        this.emit(`(i32.eq)`);
                        this.emit(`(br_if $found (i32.const 0))`);
                        this.emit(`(br $search)`);
                    this.emit(`)`); // End loop
                    this.emit(`)`); // End block
                this.indent--;
                this.emit(`))`); // End if
                break;

            default:
                this.emit(`;; Unknown expression: ${expr.nodeType}`);
        }
    }
    
generateBinaryOp(operator, resultType) {
    const type = resultType && resultType.equals && resultType.equals(BUILTIN_TYPES.f64) ? 'f64' : 'i32';
    
    // String concatenation
    if (operator === '+' && resultType instanceof StringTypeInfo) {
        this.emit(`(call $__str_concat)`);
        return;
    }
    
    switch (operator) {
        case '+': this.emit(`(${type}.add)`); break;
        case '-': this.emit(`(${type}.sub)`); break;
        case '*': this.emit(`(${type}.mul)`); break;
        case '/': this.emit(`(${type}.div_s)`); break;
        case '%': this.emit(`(i32.rem_s)`); break;
        case '&': this.emit(`(i32.and)`); break;
        case '|': this.emit(`(i32.or)`); break;
        case '^': this.emit(`(i32.xor)`); break;
        case '<<': this.emit(`(i32.shl)`); break;
        case '>>': this.emit(`(i32.shr_s)`); break;
        case '==': 
            if (resultType.equals(BUILTIN_TYPES.String)) {
                this.emit(`(call $__str_equals)`);
            } else {
                this.emit(`(${type}.eq)`);
            }
            break;
        case '!=': this.emit(`(${type}.ne)`); break;
        case '<': this.emit(`(${type}.lt_s)`); break;
        case '>': this.emit(`(${type}.gt_s)`); break;
        case '<=': this.emit(`(${type}.le_s)`); break;
        case '>=': this.emit(`(${type}.ge_s)`); break;
        case '&&': this.emit(`(i32.and)`); break;
        case '||': this.emit(`(i32.or)`); break;
    }
}
    
    generateCallExpr(expr) {
        if (expr.isSuperCall) {
            this.emit(`(local.get $this)`);
            for (const arg of expr.args) {
                this.generateExpression(arg);
            }
            this.emit(`(call $${expr.baseClass.name}__init)`);
            return;
        }
        
        if (expr.callee.isStaticMethod) {
            for (const arg of expr.args) {
                this.generateExpression(arg);
            }
            this.emit(`(call $${expr.callee.classInfo.name}__${expr.callee.property})`);
            return;
        }
        
        if (expr.callee.nodeType === 'IdentifierExpr') {
            for (const arg of expr.args) {
                this.generateExpression(arg);
            }
            this.emit(`(call $${expr.callee.name})`);
            return;
        }
        
        if (expr.callee.nodeType === 'MemberExpr' && expr.callee.isMethod) {
            const methodInfo = expr.callee.methodInfo;
            const classInfo = expr.callee.classInfo;
            
            // Check for builtin methods
            if (methodInfo.isBuiltin) {
                this.generateBuiltinMethodCall(expr, classInfo, methodInfo);
                return;
            }
            
            // Push 'this'
            this.generateExpression(expr.callee.object);
            
            // Push args
            for (const arg of expr.args) {
                this.generateExpression(arg);
            }
            
            if (methodInfo.vtableIndex >= 0) {
                // Virtual dispatch
                this.generateExpression(expr.callee.object);
                this.emit(`(i32.load)`);
                if (methodInfo.vtableIndex > 0) {
                    this.emit(`(i32.const ${methodInfo.vtableIndex * 4})`);
                    this.emit(`(i32.add)`);
                }
                this.emit(`(i32.load)`);
                this.emit(`(call_indirect (type ${methodInfo.watTypeName}))`);
            } else {
                // Non-virtual: find the class that actually implements this method
                const implClass = this.findMethodImplementingClass(classInfo, expr.callee.property);
                this.emit(`(call $${implClass}__${expr.callee.property})`);
            }
            return;
        }
        
        if (expr.callee.isStringMethod) {
            this.generateStringMethodCall(expr);
            return;
        }
    }
    
    generateBuiltinMethodCall(expr, classInfo, methodInfo) {
        const methodName = expr.callee.property;
        
        if (classInfo.name === 'Vec') {
            switch (methodName) {
                case 'push':
                    this.generateExpression(expr.callee.object);
                    this.generateExpression(expr.args[0]);
                    this.emit(`(call $__Vec_push)`);
                    break;
                case 'get':
                    this.generateExpression(expr.callee.object);
                    this.generateExpression(expr.args[0]);
                    this.emit(`(call $__Vec_get)`);
                    break;
                case 'length':
                    this.generateExpression(expr.callee.object);
                    this.emit(`(call $__Vec_length)`);
                    break;
                case 'clone':
                    this.generateExpression(expr.callee.object);
                    this.emit(`(call $__Vec_clone)`);
                    break;                
                default:
                    this.emit(`;; Unknown Vec method: ${methodName}`);
            }
        } else if (classInfo.name === 'Map') {
            switch (methodName) {
                case 'size':
                    this.generateExpression(expr.callee.object);
                    this.emit(`(call $__Map_size)`);
                    break;
                case 'set':
                    this.generateExpression(expr.callee.object);
                    this.generateExpression(expr.args[0]); // key
                    this.generateExpression(expr.args[1]); // value
                    this.emit(`(call $__Map_set)`);
                    break;
                case 'get':
                    this.generateExpression(expr.callee.object);
                    this.generateExpression(expr.args[0]);
                    this.emit(`(call $__Map_get)`);
                    break;
                case 'has':  // ← NEW
                    this.generateExpression(expr.callee.object);
                    this.generateExpression(expr.args[0]);
                    this.emit(`(call $__Map_has)`);
                    break;
                case 'clone':
                    this.generateExpression(expr.callee.object);
                    this.emit(`(call $__Map_clone)`);
                    break;
                default:
                    this.emit(`;; Unknown Map method: ${methodName}`);
            }
            return;
        }
    }
    
    generateStringMethodCall(expr) {
        const methodName = expr.callee.property;
        
        switch (methodName) {
            case 'length':
                this.generateExpression(expr.callee.object);
                this.emit(`(call $__str_length)`);
                break;
            case 'charAt':
            case 'charCodeAt':
                this.generateExpression(expr.callee.object);
                this.generateExpression(expr.args[0]);
                this.emit(`(call $__str_charAt)`);
                break;
            case 'concat':
                this.generateExpression(expr.callee.object);
                this.generateExpression(expr.args[0]);
                this.emit(`(call $__str_concat)`);
                break;
            case 'equals':
                this.generateExpression(expr.callee.object);
                this.generateExpression(expr.args[0]);
                this.emit(`(call $__str_equals)`);
                break;
            default:
                this.emit(`;; Unknown String method: ${methodName}`);
        }
    }
    
    generateMemberExpr(expr) {
        if (expr.isMethod || expr.isStaticMethod) {
            return;
        }
        
        // NEW: Handle reading static fields
        if (expr.isStaticField) {
            this.emit(`(global.get ${expr.staticFieldName})`);
            return;
        }
        this.generateExpression(expr.object);
        const offset = expr.fieldOffset || 0;
        if (offset > 0) {
            this.emit(`(i32.const ${offset})`);
            this.emit(`(i32.add)`);
        }
        this.emit(`(i32.load)`);
    }
    
    generateAssignExpr(expr) {
        if (expr.target.nodeType === 'IdentifierExpr') {
            const varName = expr.target.name;
            const isGlobal = expr.target.isGlobal;
            
            if (expr.operator === '=') {
                this.generateExpression(expr.value);
            } else {
                if (isGlobal) {
                    this.emit(`(global.get $${varName})`);
                } else {
                    this.emit(`(local.get $${varName})`);
                }
                this.generateExpression(expr.value);
                switch (expr.operator) {
                    case '+=': this.emit(`(i32.add)`); break;
                    case '-=': this.emit(`(i32.sub)`); break;
                    case '*=': this.emit(`(i32.mul)`); break;
                    case '/=': this.emit(`(i32.div_s)`); break;
                }
            }
            
            if (isGlobal) {
                this.emit(`(global.set $${varName})`);
                this.emit(`(global.get $${varName})`);
            } else {
                this.emit(`(local.tee $${varName})`);
            }
        } else if (expr.target.nodeType === 'MemberExpr') {
        
            // NEW: Handle Static Field Assignment
            if (expr.target.isStaticField) {
                if (expr.operator === '=') {
                    this.generateExpression(expr.value);
                } else {
                    // Read-Modify-Write (+=, -=, etc)
                    this.emit(`(global.get ${expr.target.staticFieldName})`);
                    this.generateExpression(expr.value);
                    this.generateBinaryOp(expr.operator.slice(0, -1), expr.target.resolvedType);
                }
                
                // Store result in global
                this.emit(`(global.set ${expr.target.staticFieldName})`);
                // Return result (assignment expressions return the value)
                this.emit(`(global.get ${expr.target.staticFieldName})`);
                return;
            }
            this.generateExpression(expr.target.object);
            const offset = expr.target.fieldOffset || 0;
            if (offset > 0) {
                this.emit(`(i32.const ${offset})`);
                this.emit(`(i32.add)`);
            }
            this.generateExpression(expr.value);
            this.emit(`(i32.store)`);
            this.generateExpression(expr.value);
        }
    }
    
    generateNewExpr(expr) {
        // 1. Handle Structs (Add this block)
        if (expr.structInfo) {
            // Structs are simple: just malloc their size
            this.emit(`(call $__malloc (i32.const ${expr.structInfo.totalSize}))`);
            return;
        }
        const classInfo = expr.classInfo;
        
        if (classInfo && classInfo.isBuiltin) {
            if (classInfo.name === 'Vec') {
                this.emit(`(call $__Vec_new)`);
            } else if (classInfo.name === 'Map') {
                this.emit(`(call $__Map_new)`);
            }
            return;
        }
        
        for (const arg of expr.args) {
            this.generateExpression(arg);
        }
        this.emit(`(call $${expr.className}__new)`);
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7: MAIN COMPILER CLASS
// ═══════════════════════════════════════════════════════════════════════════

class ZDScriptCompiler {
    constructor() {
        this.errors = [];
    }
    
    compile(source) {
        try {
            // Lexical analysis
            const lexer = new Lexer(source);
            const tokens = lexer.tokenize();
            
            // Parsing
            const parser = new Parser(tokens);
            const ast = parser.parse();
            
            // Semantic analysis
            const analyzer = new SemanticAnalyzer();
            const semanticInfo = analyzer.analyze(ast);
            
            // Code generation (placeholder for now)
            const generator = new WATGenerator(semanticInfo);
            const wat = generator.generate(ast);
            
            return {
                success: true,
                ast,
                semanticInfo,
                wat,
            };
            
        } catch (e) {
            return {
                success: false,
                error: e.message,
            };
        }
    }
}


// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

export { ZDScriptCompiler };
export default ZDScriptCompiler;
