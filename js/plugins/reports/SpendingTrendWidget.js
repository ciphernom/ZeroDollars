import { Utils } from '../../utils/index.js';

export const SpendingTrendWidget = {
    id: 'widget-spending-trend',
    type: 'report-widget',
    order: 7,
    title: 'Spending Trend (6 Months)',
    collapsible: true,
    gridSpan: 'full',
    
    settings: {
        hiddenAccounts: JSON.parse(localStorage.getItem('trend_hidden_accounts') || '[]'),
        showFilters: false
    },

    render: (state) => {
        const container = Utils.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

        // 1. Controls
        const controls = Utils.createElement('div', { style: { display: 'flex', justifyContent: 'flex-end', alignItems: 'center' } });
        const filterBtn = Utils.createElement('button', {
            className: `btn-secondary ${SpendingTrendWidget.settings.showFilters ? 'active' : ''}`,
            textContent: SpendingTrendWidget.settings.showFilters ? '▼ Accounts' : '⚙️ Accounts',
            style: { padding: '5px 10px', fontSize: '0.85rem', whiteSpace: 'nowrap' }
        });
        controls.appendChild(filterBtn);
        container.appendChild(controls);

        // 2. Filters
        const filterContainer = Utils.createElement('div', {
            style: { 
                display: SpendingTrendWidget.settings.showFilters ? 'flex' : 'none', 
                flexWrap: 'wrap', gap: '8px', padding: '10px', background: 'var(--bg-primary)', borderRadius: '8px'
            }
        });
        container.appendChild(filterContainer);

        // 3. Chart
        const canvasContainer = Utils.createElement('div', { style: { position: 'relative', height: '250px' } });
        const canvas = document.createElement('canvas');
        canvasContainer.appendChild(canvas);
        container.appendChild(canvasContainer);

        let chartInstance = null;

        // --- INTERNAL UPDATE ---
        const updateContent = () => {
            // Update UI State
            filterContainer.style.display = SpendingTrendWidget.settings.showFilters ? 'flex' : 'none';
            filterBtn.textContent = SpendingTrendWidget.settings.showFilters ? '▼ Accounts' : '⚙️ Accounts';
            filterBtn.classList.toggle('active', SpendingTrendWidget.settings.showFilters);

            // Re-render Chips
            filterContainer.innerHTML = '';
            const accounts = Array.from(state.data.accounts.values()).filter(a => a.status === 'open' && !a.deleted);
            accounts.forEach(acc => {
                const isHidden = SpendingTrendWidget.settings.hiddenAccounts.includes(acc.id);
                const isSelected = !isHidden;
                const chip = Utils.createElement('button', {
                    textContent: (isSelected ? '✓ ' : '') + acc.name,
                    style: {
                        padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                        backgroundColor: isSelected ? 'var(--accent-light)' : 'var(--bg-secondary)',
                        color: isSelected ? 'var(--accent-dark)' : 'var(--text-secondary)'
                    },
                    onclick: () => {
                        if (isSelected) SpendingTrendWidget.settings.hiddenAccounts.push(acc.id);
                        else SpendingTrendWidget.settings.hiddenAccounts = SpendingTrendWidget.settings.hiddenAccounts.filter(id => id !== acc.id);
                        localStorage.setItem('trend_hidden_accounts', JSON.stringify(SpendingTrendWidget.settings.hiddenAccounts));
                        updateContent();
                    }
                });
                filterContainer.appendChild(chip);
            });

            // Re-render Chart
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

            const data = months.map(m => {
                let spent = 0;
                Array.from(state.data.accounts.values()).forEach(acc => {
                    if (SpendingTrendWidget.settings.hiddenAccounts.includes(acc.id)) return;
                    spent += acc.transactions
                        .filter(tx => tx.type === 'spend' && !tx.deleted && new Date(tx.date).toISOString().startsWith(m))
                        .reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
                });
                return spent;
            });

            let runningTotal = 0;
            const cumulativeData = data.map(val => { runningTotal += val; return runningTotal; });

            if(chartInstance) chartInstance.destroy();

            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(99, 102, 241, 0.5)'); gradient.addColorStop(1, 'rgba(99, 102, 241, 0.0)');

            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: months.map(m => new Date(m + '-02').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })),
                    datasets: [
                        { label: 'Monthly', data: data.map(v => v / 100), borderColor: '#6366f1', borderWidth: 3, backgroundColor: gradient, fill: true, tension: 0.4, yAxisID: 'y' },
                        { label: 'Cumulative', data: cumulativeData.map(v => v / 100), borderColor: '#f59e0b', borderWidth: 2, borderDash: [5, 5], yAxisID: 'y1' }
                    ]
                },
                options: { 
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { display: false }, y1: { display: false, grid: { drawOnChartArea: false } }, x: { grid: { display: false } } }
                }
            });
        };

        filterBtn.onclick = () => {
            SpendingTrendWidget.settings.showFilters = !SpendingTrendWidget.settings.showFilters;
            updateContent();
        };

        requestAnimationFrame(() => updateContent());
        return container;
    }
};
