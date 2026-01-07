import { Utils } from '../../utils/index.js';

export const SpendingBarWidget = {
    id: 'widget-spending-bar',
    type: 'report-widget',
    order: 4,
    title: 'Spending Breakdown',
    collapsible: true,
    gridSpan: 'full',
    
    settings: {
        filterMode: localStorage.getItem('spending_bar_mode') || 'all',
        timeRange: localStorage.getItem('spending_bar_time') || 'current',
        hiddenAccounts: JSON.parse(localStorage.getItem('spending_bar_hidden_accounts') || '[]'),
        showFilters: false
    },

    render: (state) => {
        const container = Utils.createElement('div', { 
            style: { display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' } 
        });

        // --- 1. CONTROLS HEADER ---
        const controls = Utils.createElement('div', { 
            style: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end', alignItems: 'center' } 
        });

        const timeSelect = Utils.createElement('select', { 
            style: { width: 'auto', padding: '5px', fontSize: '0.85rem', margin: 0, cursor: 'pointer', flexGrow: 1 } 
        }, [
            Utils.createElement('option', { value: 'current', textContent: '📅 This Month' }),
            Utils.createElement('option', { value: 'last', textContent: '⏮️ Last Month' }),
            Utils.createElement('option', { value: '3months', textContent: '📉 Last 3 Months' }),
            Utils.createElement('option', { value: '6months', textContent: '📉 Last 6 Months' }),
            Utils.createElement('option', { value: 'ytd', textContent: '🗓️ Year to Date' }),
            Utils.createElement('option', { value: 'lastyear', textContent: '📅 Last Year' })
        ]);
        timeSelect.value = SpendingBarWidget.settings.timeRange;

        const filterSelect = Utils.createElement('select', { 
            style: { width: 'auto', padding: '5px', fontSize: '0.85rem', margin: 0, cursor: 'pointer', flexGrow: 1 } 
        }, [
            Utils.createElement('option', { value: 'all', textContent: '👁️ Show All' }),
            Utils.createElement('option', { value: 'pareto', textContent: '🎯 Top 80% (Pareto)' })
        ]);
        filterSelect.value = SpendingBarWidget.settings.filterMode;

        const accountBtn = Utils.createElement('button', {
            className: `btn-secondary ${SpendingBarWidget.settings.showFilters ? 'active' : ''}`,
            textContent: SpendingBarWidget.settings.showFilters ? '▼ Accounts' : '⚙️ Accounts',
            style: { padding: '5px 10px', fontSize: '0.85rem', whiteSpace: 'nowrap' }
        });

        controls.append(timeSelect, filterSelect, accountBtn);
        container.appendChild(controls);

        // --- 2. FILTERS (Collapsible) ---
        const filterContainer = Utils.createElement('div', {
            style: { 
                display: SpendingBarWidget.settings.showFilters ? 'flex' : 'none', 
                flexWrap: 'wrap', 
                gap: '8px', 
                padding: '10px', 
                background: 'var(--bg-primary)', 
                borderRadius: '8px',
                border: '1px solid var(--border)'
            }
        });
        container.appendChild(filterContainer);

        // --- 3. CHART CONTAINER ---
        const chartHeight = 350;
        const canvasContainer = Utils.createElement('div', { 
            style: { position: 'relative', height: `${chartHeight}px`, width: '100%', overflow: 'hidden' } 
        });
        const canvas = document.createElement('canvas');
        canvasContainer.appendChild(canvas);
        container.appendChild(canvasContainer);

        let chartInstance = null;

        // --- INTERNAL UPDATE FUNCTION ---
        // This function redraws ONLY the chart content without reloading the page
        const updateContent = () => {
            // Update Filter UI
            filterContainer.style.display = SpendingBarWidget.settings.showFilters ? 'flex' : 'none';
            accountBtn.textContent = SpendingBarWidget.settings.showFilters ? '▼ Accounts' : '⚙️ Accounts';
            accountBtn.classList.toggle('active', SpendingBarWidget.settings.showFilters);

            filterContainer.innerHTML = '';
            const accounts = Array.from(state.data.accounts.values()).filter(a => a.status === 'open' && !a.deleted);
            
            accounts.forEach(acc => {
                const isHidden = SpendingBarWidget.settings.hiddenAccounts.includes(acc.id);
                const isSelected = !isHidden;
                const chip = Utils.createElement('button', {
                    textContent: (isSelected ? '✓ ' : '') + acc.name,
                    style: {
                        padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', cursor: 'pointer',
                        border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                        backgroundColor: isSelected ? 'var(--accent-light)' : 'var(--bg-secondary)',
                        color: isSelected ? 'var(--accent-dark)' : 'var(--text-secondary)',
                        fontWeight: isSelected ? '600' : '400', opacity: isSelected ? '1' : '0.8'
                    },
                    onclick: () => {
                        if (isSelected) SpendingBarWidget.settings.hiddenAccounts.push(acc.id);
                        else SpendingBarWidget.settings.hiddenAccounts = SpendingBarWidget.settings.hiddenAccounts.filter(id => id !== acc.id);
                        localStorage.setItem('spending_bar_hidden_accounts', JSON.stringify(SpendingBarWidget.settings.hiddenAccounts));
                        updateContent(); // Recursively update local content only
                    }
                });
                filterContainer.appendChild(chip);
            });

            // Logic & Chart Render
            if (!window.Chart) return;
            const ctx = canvas.getContext('2d');
            
            // --- DATE LOGIC ---
            const anchorDate = new Date(state.data.currentMonth + '-01'); 
            let startDate = new Date(anchorDate);
            let endDate = new Date(anchorDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0); 

            switch (SpendingBarWidget.settings.timeRange) {
                case 'last': startDate.setMonth(startDate.getMonth() - 1); endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0); break;
                case '3months': startDate.setMonth(startDate.getMonth() - 2); break;
                case '6months': startDate.setMonth(startDate.getMonth() - 5); break;
                case 'ytd': startDate = new Date(anchorDate.getFullYear(), 0, 1); break;
                case 'lastyear': startDate = new Date(anchorDate.getFullYear() - 1, 0, 1); endDate = new Date(anchorDate.getFullYear() - 1, 11, 31); break;
            }

            // --- DATA AGGREGATION ---
            const breakdown = new Map();
            Array.from(state.data.accounts.values()).forEach(acc => {
                if (SpendingBarWidget.settings.hiddenAccounts.includes(acc.id)) return;
                acc.transactions.forEach(tx => {
                    if (tx.type !== 'spend' || tx.deleted) return;
                    const tDate = new Date(tx.date);
                    if (tDate < startDate || tDate > endDate) return;
                    let categoryName = 'Uncategorized';
                    if (tx.jarId) {
                        if (tx.jarId === 'split') categoryName = 'Split Transaction';
                        else { const env = state.getEnvelope(tx.jarId); if (env) categoryName = env.name; }
                    }
                    breakdown.set(categoryName, (breakdown.get(categoryName) || 0) + Math.abs(tx.amount));
                });
            });

            let spends = Array.from(breakdown.entries()).map(([name, spent]) => ({ name, spent })).sort((a, b) => b.spent - a.spent);
            const totalSpend = spends.reduce((sum, s) => sum + s.spent, 0);
            
            let runningTotal = 0;
            const fullCumulative = spends.map(s => { runningTotal += s.spent; return runningTotal; });

            if (SpendingBarWidget.settings.filterMode === 'pareto') {
                let paretoTotal = 0, cutoff = totalSpend * 0.8, paretoSpends = [], paretoCumulative = [];
                for (let i = 0; i < spends.length; i++) {
                    paretoSpends.push(spends[i]); paretoCumulative.push(fullCumulative[i]);
                    paretoTotal += spends[i].spent;
                    if (paretoTotal >= cutoff) break;
                }
                spends = paretoSpends;
            }

            // --- CHART RENDER ---
            if (chartInstance) chartInstance.destroy(); // Cleanup old chart
            
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, '#6366f1'); gradient.addColorStop(1, '#8b5cf6');
            const bgColors = spends.map(s => (s.name === 'Uncategorized' || s.name === 'Split Transaction') ? '#94a3b8' : gradient);

            chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: spends.map(s => s.name),
                    datasets: [
                        { label: 'Spent', data: spends.map(s => s.spent / 100), backgroundColor: bgColors, borderRadius: 4, order: 1, yAxisID: 'y' },
                        { label: 'Cumulative', data: fullCumulative.slice(0, spends.length).map(v => v / 100), type: 'line', borderColor: '#f59e0b', tension: 0.4, yAxisID: 'y1', order: 0 }
                    ]
                },
                options: { 
                    responsive: true, maintainAspectRatio: false, indexAxis: 'x',
                    plugins: { 
                        legend: { display: true },
                        title: { display: true, text: `Total: ${Utils.formatCurrency(totalSpend)}`, align: 'start' }
                    },
                    scales: {
                        y: { beginAtZero: true, display: false },
                        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { callback: v => '$' + v } },
                        x: { grid: { display: false } }
                    }
                }
            });
        };

        // --- BIND EVENTS TO LOCAL UPDATE ---
        timeSelect.addEventListener('change', (e) => {
            SpendingBarWidget.settings.timeRange = e.target.value;
            localStorage.setItem('spending_bar_time', e.target.value);
            updateContent();
        });
        filterSelect.addEventListener('change', (e) => {
            SpendingBarWidget.settings.filterMode = e.target.value;
            localStorage.setItem('spending_bar_mode', e.target.value);
            updateContent();
        });
        accountBtn.onclick = () => {
            SpendingBarWidget.settings.showFilters = !SpendingBarWidget.settings.showFilters;
            updateContent();
        };

        // Initial Draw
        requestAnimationFrame(() => updateContent());

        return container;
    }
};
