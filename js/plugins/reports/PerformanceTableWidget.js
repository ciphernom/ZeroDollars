import { Utils } from '../../utils/index.js';

export const PerformanceTableWidget = {
    id: 'widget-performance-table',
    type: 'report-widget',
    order: 6,
    title: 'Monthly Performance',
    collapsible: true,
    gridSpan: 'full',
    
    render: (state) => {
        const tableContainer = Utils.createElement('div', { className: 'table-container' });
        const table = Utils.createElement('table', { className: 'styled-table' });
        
        const thead = Utils.createElement('thead', {}, [
            Utils.createElement('tr', {}, [
                Utils.createElement('th', { width: '40%', textContent: 'Jar' }),
                Utils.createElement('th', { width: '20%', style: {textAlign:'right'}, textContent: 'Budget' }),
                Utils.createElement('th', { width: '20%', style: {textAlign:'right'}, textContent: 'Spent' }),
                Utils.createElement('th', { width: '20%', style: {textAlign:'right'}, textContent: 'Left' })
            ])
        ]);

        const tbody = Utils.createElement('tbody');
        const rows = [];
        const month = state.data.currentMonth;

        state.data.envelopes.forEach(env => {
            if(env.deleted) return;
            const budgeted = env.budgets[month] || 0;
            const spent = Math.abs(env.transactions.filter(t => t.type === 'spend' && !t.deleted && new Date(t.date).toISOString().startsWith(month)).reduce((s,t) => s + t.amount, 0));
            if(budgeted === 0 && spent === 0) return;
            const percent = budgeted > 0 ? (spent/budgeted)*100 : (spent > 0 ? 100 : 0);
            rows.push({ name: env.name, budgeted, spent, remaining: budgeted - spent, percent });
        });

        rows.sort((a,b) => b.percent - a.percent);

        rows.forEach(r => {
            const tr = Utils.createElement('tr');
            let color = 'var(--accent)';
            if(r.percent > 100) color = 'var(--danger)';
            else if(r.percent > 85) color = '#f59e0b';

            const bar = Utils.createElement('div', { className: 'progress-mini-bg' }, [
                Utils.createElement('div', { className: 'progress-mini-fill', style: { width: `${Math.min(r.percent, 100)}%`, backgroundColor: color } })
            ]);

            tr.append(
                Utils.createElement('td', {}, [Utils.createElement('div', {textContent: r.name}), bar]),
                Utils.createElement('td', { textContent: Utils.formatCurrency(r.budgeted), style: {textAlign:'right'} }),
                Utils.createElement('td', { textContent: Utils.formatCurrency(r.spent), style: {textAlign:'right'} }),
                Utils.createElement('td', { textContent: Utils.formatCurrency(r.remaining), style: {textAlign:'right', color: r.remaining < 0 ? 'var(--danger)' : 'inherit'} })
            );
            tbody.appendChild(tr);
        });

        table.appendChild(thead);
        table.appendChild(tbody);
        tableContainer.appendChild(table);
        return tableContainer;
    }
};

