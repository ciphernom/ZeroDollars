# ZDScript Language Reference

**Version 2.0** | A statically-typed, object-oriented language for ZeroDollars extensions

---

## Overview

ZDScript V2 expands on the C++ philosophy of V1 with modern, TypeScript-inspired syntax. It compiles to efficient WebAssembly and runs entirely in the browser. V2 introduces generics (`Vec<T>`, `Map<K,V>`), built-in string handling, nullable types, and enhanced control flow to make extension development faster and safer.

## Table of Contents

1. [Types](#types)
2. [Variables](#variables)
3. [Functions](#functions)
4. [Classes](#classes)
5. [Inheritance](#inheritance)
6. [Generics & Collections](#generics--collections)
7. [Strings](#strings)
8. [Control Flow](#control-flow)
9. [Operators](#operators)
10. [External Imports](#external-imports)
11. [Memory & Pointers](#memory--pointers)
12. [ZeroDollars API](#zerodollars-api)

---

## Types

### Primitive Types

| Type     | Size    | Description                    |
|----------|---------|--------------------------------|
| `i32`    | 4 bytes | 32-bit signed integer          |
| `i64`    | 8 bytes | 64-bit signed integer          |
| `f32`    | 4 bytes | 32-bit floating point          |
| `f64`    | 8 bytes | 64-bit floating point          |
| `bool`   | 4 bytes | Boolean (true/false)           |
| `void`   | 0 bytes | No value (for return types)    |
| `String` | 4 bytes | **New**: Managed UTF-8 string reference |

### Complex Types

**Nullable Types (New in V2)**
Any type can be made nullable by appending `?`.
```zdscript
i32?          // Can hold an integer or null
String?       // Can hold a string or null

```

**Generic Types (New in V2)**

```zdscript
Vec<i32>      // Dynamic array of integers
Map<String, i32> // Hash map with String keys

```

**Pointer Types**

```zdscript
ptr<i32>      // Raw pointer to i32

```

---

## Variables

### Declaration

```zdscript
let x: i32 = 10;           // Mutable variable
const PI: f64 = 3.14159;   // Immutable constant
var count: i32;            // Uninitialized (defaults to 0)

```

### Type Inference

The compiler can automatically determine types in many cases.

```zdscript
let x = 42;                // Inferred as i32
let message = "Hello";     // Inferred as String
let list = new Vec<i32>(); // Inferred as Vec<i32>

```

### Global Variables

Declared at the top level of a file.

```zdscript
let globalCounter: i32 = 0;

export function increment(): i32 {
    globalCounter += 1;
    return globalCounter;
}

```

---

## Functions

### Basic Syntax

```zdscript
function calculate(a: i32, b: i32): i32 {
    return a + b;
}

```

### Exported Functions

Functions marked with `export` are accessible from the host JavaScript environment.

```zdscript
export function main(): i32 {
    return 1;
}

```

---

## Classes

### Basic Class

Classes are the building blocks of ZDScript. They support encapsulation and object-oriented design.

```zdscript
class BankAccount {
    private balance: i32;      // Private field
    public name: String;       // Public field
    
    constructor(name: String, initial: i32) {
        this.name = name;
        this.balance = initial;
    }
    
    public deposit(amount: i32): void {
        this.balance += amount;
    }
    
    public getBalance(): i32 {
        return this.balance;
    }
}

```

### Visibility Modifiers

| Modifier | Access |
| --- | --- |
| `public` | Accessible from anywhere (default) |
| `private` | Only within the class |
| `protected` | Within class and subclasses |

### Static Members

Static members belong to the class itself rather than instances.

```zdscript
class Config {
    static MAX_ITEMS: i32 = 100;
    
    static isValid(count: i32): bool {
        return count <= Config.MAX_ITEMS;
    }
}

```

---

## Inheritance

### Basic Inheritance

ZDScript supports single inheritance.

```zdscript
class Transaction {
    protected amount: i32;
    
    constructor(amount: i32) {
        this.amount = amount;
    }
}

class Expense extends Transaction {
    private category: String;
    
    constructor(amount: i32, category: String) {
        super(amount);      // Call base constructor
        this.category = category;
    }
}

```

### Polymorphism (Virtual/Override)

Use `virtual` to allow a method to be overridden, and `override` to implement it in a child class.

```zdscript
class Metric {
    virtual calculate(): i32 {
        return 0;
    }
}

class SavingsMetric extends Metric {
    override calculate(): i32 {
        return 100;
    }
}

```

### Abstract Classes

Abstract classes cannot be instantiated and enforce implementation details on children.

```zdscript
abstract class Report {
    abstract generate(): String;
}

```

---

## Generics & Collections

**New in Version 2.0**, ZDScript provides built-in generic collections.

### Vectors (`Vec<T>`)

A dynamic, resizable array.

```zdscript
let numbers = new Vec<i32>();

// Adding items
numbers.push(10);
numbers.push(20);

// Accessing items
let first: i32 = numbers[0];  // Array-style access
let len: i32 = numbers.length();

```

### Maps (`Map<K,V>`)

A hash map key-value store.

```zdscript
let scores = new Map<String, i32>();

scores.set("Alice", 95);
scores.set("Bob", 88);

if (scores.has("Alice")) {
    let aliceScore = scores.get("Alice");
}

```

---

## Strings

**New in Version 2.0**, `String` is a first-class citizen.

```zdscript
let greeting = "Hello";
let target = "World";

// Concatenation
let message = greeting + " " + target; // "Hello World"

// Properties
let len = message.length;

```

---

## Control Flow

### If/Else

```zdscript
if (x > 0) {
    // positive
} else if (x < 0) {
    // negative
} else {
    // zero
}

```

### Loops

**Standard For Loop**

```zdscript
for (let i: i32 = 0; i < 10; i++) {
    // body
}

```

**For-In Loop (New in V2)**
Iterate directly over collections.

```zdscript
let list = new Vec<i32>();
// ...
for (let item in list) {
    // item is typed as i32 automatically
    log(item);
}

```

**While / Do-While**

```zdscript
while (condition) { ... }

do { ... } while (condition);

```

---

## Operators

### New Operators in V2

| Operator | Name | Description |
| --- | --- | --- |
| `??` | Null Coalesce | `let name = input ?? "Default";` |
| `?.` | Optional Chain | `let len = user?.data?.length;` |

### Standard Operators

| Category | Operators |
| --- | --- |
| Arithmetic | `+`, `-`, `*`, `/`, `%` |
| Comparison | `==`, `!=`, `<`, `>`, `<=`, `>=` |
| Logical | `&&`, `||`, `!` |
| Bitwise | `&`, `|`, `^`, `~`, `<<`, `>>` |
| Assignment | `=`, `+=`, `-=`, `*=`, `/=` |
| Other | `? :` (ternary), `sizeof`, `as` (cast) |

---

## External Imports

Import functions from the host environment (ZeroDollars) using the `@external` decorator.

```zdscript
@external("zd", "get_total_balance")
declare function getTotalBalance(): i32;

@external("zd", "show_toast")
declare function showToast(msg: String, type: String): void;

```

---

## Memory & Pointers

ZDScript compiles to WebAssembly using a manual memory model.

### Allocation

Use `new` to allocate objects on the heap.

```zdscript
let obj = new MyClass();

```

### Deallocation

Because there is no Garbage Collector for custom classes, you must explicitly free memory using `delete` when you are done with an object.

```zdscript
delete obj;

```

*Note: Built-in types like Strings and Collections manage their internal data buffers automatically, but the container object itself typically follows the scope of where it was defined.*

---

## ZeroDollars API

Common functions available in the ZeroDollars runtime `zd`.

### Financial Data

* `get_total_balance(): i32` - Returns total balance in cents.
* `get_account_count(): i32` - Returns number of accounts.
* `get_envelope_count(): i32` - Returns number of envelopes.
* `get_monthly_spending(): i32` - Returns total spending for current month.

### UI Interaction

* `console_log(msg: String): void` - Logs to debug console.
* `show_toast(msg: String, type: String): void` - Shows a notification popup.
* `set_result_i32(key: i32, val: i32): void` - Passes integer result back to JS.

---

## Complete Example

**Account Health Analyzer (Using V2 Features)**

```zdscript
// Imports
@external("zd", "get_total_balance")
declare function getTotalBalance(): i32;

@external("zd", "console_log")
declare function log(msg: String): void;

class HealthReport {
    public score: i32;
    public notes: Vec<String>;

    constructor() {
        this.score = 0;
        this.notes = new Vec<String>();
    }

    destructor() {
        // Clean up the vector when report is deleted
        delete this.notes;
    }
}

class Analyzer {
    public run(): void {
        let report = new HealthReport();
        let balance = getTotalBalance();

        if (balance > 100000) {
            report.score = 100;
            report.notes.push("Excellent balance!");
        } else if (balance > 0) {
            report.score = 50;
            report.notes.push("Positive balance.");
        } else {
            report.score = 0;
            report.notes.push("Negative balance warning.");
        }

        // V2 For-In Loop
        for (let note in report.notes) {
            log(note);
        }

        log("Final Score: " + report.score);

        delete report;
    }
}

export function main(): i32 {
    let app = new Analyzer();
    app.run();
    delete app;
    return 1;
}

```

---

## Compilation Pipeline

1. **Lexer:** Tokenizes source code (supports `<T>`, `String`, `??`).
2. **Parser:** Generates AST with generic nodes.
3. **Semantic Analyzer:** Resolves types, inheritance, and vtables.
4. **WAT Generator:** Emits WebAssembly Text with a runtime for `malloc`, `String`, and `Map`.

*ZDScript v2.0 - For ZeroDollars Extension Studio*
