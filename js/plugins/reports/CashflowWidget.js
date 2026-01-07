import { Utils } from '../../utils/index.js';

export const CashflowWidget = {
    id: 'widget-cashflow',
    type: 'report-widget',
    order: 8,
    title: 'Income vs Expense',
    collapsible: true,
    gridSpan: 'full',

    settings: {
        hiddenAccounts: JSON.parse(localStorage.getItem('cashflow_hidden_accounts') || '[]'),
        showFilters: false
    },
    
    render: (state) => {
        const container = Utils.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

        const controls = Utils.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center' } });
        const filterBtn = Utils.createElement('button', {
            className: `btn-secondary ${CashflowWidget.settings.showFilters ? 'active' : ''}`,
            textContent: CashflowWidget.settings.showFilters ? '▼ Accounts' : '⚙️ Accounts',
            style: { padding: '5px 10px', fontSize: '0.85rem', whiteSpace: 'nowrap' }
        });
        controls.appendChild(filterBtn);
        container.appendChild(controls);

        const filterContainer = Utils.createElement('div', {
            style: { display: 'none', flexWrap: 'wrap', gap: '8px', padding: '10px', background: 'var(--bg-primary)', borderRadius: '8px' }
        });
        container.appendChild(filterContainer);

        const canvasContainer = Utils.createElement('div', { style: { position: 'relative', height: '250px' } });
        const canvas = document.createElement('canvas');
        canvasContainer.appendChild(canvas);
        container.appendChild(canvasContainer);

        let chartInstance = null;

        const updateContent = () => {
            filterContainer.style.display = CashflowWidget.settings.showFilters ? 'flex' : 'none';
            filterBtn.classList.toggle('active', CashflowWidget.settings.showFilters);
            filterBtn.textContent = CashflowWidget.settings.showFilters ? '▼ Accounts' : '⚙️ Accounts';

            filterContainer.innerHTML = '';
            const accounts = Array.from(state.data.accounts.values()).filter(a => a.status === 'open' && !a.deleted);
            accounts.forEach(acc => {
                const isSelected = !CashflowWidget.settings.hiddenAccounts.includes(acc.id);
                const chip = Utils.createElement('button', {
                    textContent: (isSelected ? '✓ ' : '') + acc.name,
                    style: { padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)' },
                    onclick: () => {
                        if (isSelected) CashflowWidget.settings.hiddenAccounts.push(acc.id);
                        else CashflowWidget.settings.hiddenAccounts = CashflowWidget.settings.hiddenAccounts.filter(id => id !== acc.id);
                        localStorage.setItem('cashflow_hidden_accounts', JSON.stringify(CashflowWidget.settings.hiddenAccounts));
                        updateContent();
                    }
                });
                filterContainer.appendChild(chip);
            });

            if (!window.Chart) return;
            const ctx = canvas.getContext('2d');
            const months = [];
            const cursor = new Date(state.data.currentMonth + '-01');
            for (let i = 0; i < 6; i++) {
                const yyyy = cursor.getFullYear();
                const mm = String(cursor.getMonth() + 1).padStart(2, '0');
                months.unshift(`${yyyy}-${mm}`);
                cursor.setMonth(cursor.getMonth() - 1);
            }

            const incomeData = months.map(m => {
                let total = 0;
                Array.from(state.data.accounts.values()).forEach(acc => {
                    if (CashflowWidget.settings.hiddenAccounts.includes(acc.id)) return;
                    total += acc.transactions
                        .filter(tx => tx.type === 'income' && !tx.deleted && new Date(tx.date).toISOString().startsWith(m))
                        .reduce((sum, tx) => sum + tx.amount, 0);
                });
                return total;
            });

            const expData = months.map(m => {
                let total = 0;
                Array.from(state.data.accounts.values()).forEach(acc => {
                    if (CashflowWidget.settings.hiddenAccounts.includes(acc.id)) return;
                    total += acc.transactions
                        .filter(tx => tx.type === 'spend' && !tx.deleted && new Date(tx.date).toISOString().startsWith(m))
                        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
                });
                return total;
            });

            if (chartInstance) chartInstance.destroy();

            chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: months.map(m => new Date(m + '-02').toLocaleDateString('en-US', { month: 'short' })),
                    datasets: [
                        { label: 'Income', data: incomeData.map(v => v / 100), backgroundColor: '#10b981' },
                        { label: 'Expense', data: expData.map(v => v / 100), backgroundColor: '#ef4444' }
                    ]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        };

        filterBtn.onclick = () => {
            CashflowWidget.settings.showFilters = !CashflowWidget.settings.showFilters;
            updateContent();
        };

        requestAnimationFrame(() => updateContent());
        return container;
    }
};
