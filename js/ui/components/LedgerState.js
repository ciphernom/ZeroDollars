export class LedgerState {
    constructor() {
        this.rawTransactions = [];
        this.processedTransactions = [];
        
        this.filters = {
            search: '',
            type: 'all' // 'all', 'categorized', 'uncategorized'
        };
        
        this.sort = {
            field: 'date', // 'date', 'amount', 'payee'
            direction: 'desc' // 'asc', 'desc'
        };
    }

    setData(transactions) {
        // We clone to avoid mutating the original AppState
        this.rawTransactions = [...transactions];
        this.process();
    }

    setFilter(key, value) {
        this.filters[key] = value;
        this.process();
    }

    toggleSort(field) {
        if (this.sort.field === field) {
            this.sort.direction = this.sort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this.sort.field = field;
            this.sort.direction = 'desc';
        }
        this.process();
        return this.sort; // Return new state for UI update
    }

    process() {
        let result = this.rawTransactions;

        // 1. Filtering
        if (this.filters.search) {
            const term = this.filters.search.toLowerCase();
            result = result.filter(tx => {
                const note = (tx.note || '').toLowerCase();
                const payee = (tx.payee || '').toLowerCase(); // If you have a separate payee field
                const amt = (tx.amount / 100).toFixed(2);
                return note.includes(term) || payee.includes(term) || amt.includes(term);
            });
        }

        if (this.filters.type === 'categorized') {
            result = result.filter(tx => tx.jarId);
        } else if (this.filters.type === 'uncategorized') {
            result = result.filter(tx => !tx.jarId);
        }

        // 2. Sorting
        result.sort((a, b) => {
            let valA, valB;

            switch (this.sort.field) {
                case 'amount':
                    valA = a.amount;
                    valB = b.amount;
                    break;
                case 'payee':
                    // Fallback to note if payee is missing
                    valA = (a.note || '').toLowerCase();
                    valB = (b.note || '').toLowerCase();
                    break;
                case 'date':
                default:
                    valA = a.date;
                    valB = b.date;
                    break;
            }

            if (valA < valB) return this.sort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return this.sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        this.processedTransactions = result;
    }

    get result() {
        return this.processedTransactions;
    }
}
