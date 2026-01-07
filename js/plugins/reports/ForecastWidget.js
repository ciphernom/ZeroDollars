import { Utils } from '../../utils/index.js';
import { BudgetForecaster } from '../../services/forecaster.js';

export const ForecastWidget = {
    id: 'widget-forecast',
    type: 'report-widget',
    order: 5,
    title: 'Account Forecast',
    collapsible: true,
    gridSpan: 'full',
    
    settings: {
        mode: localStorage.getItem('forecast_mode') || 'scheduled',
        duration: localStorage.getItem('forecast_duration') || '90',
        hiddenAccounts: JSON.parse(localStorage.getItem('forecast_hidden_accounts') || '[]'),
        showFilters: false
    },

    render: (state) => {
        const container = Utils.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });

        const controls = Utils.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' } });
        const modeSelect = Utils.createElement('select', { style: { width: 'auto', padding: '5px', flexGrow: 1 } }, [
            Utils.createElement('option', { value: 'scheduled', textContent: '📅 Bills Only' }),
            Utils.createElement('option', { value: 'model', textContent: '🤖 Trends' })
        ]);
        modeSelect.value = ForecastWidget.settings.mode;

        const durationSelect = Utils.createElement('select', { style: { width: 'auto', padding: '5px', flexGrow: 1 } }, [
            Utils.createElement('option', { value: '14', textContent: '14 Days' }),
            Utils.createElement('option', { value: '30', textContent: '30 Days' }),
            Utils.createElement('option', { value: '90', textContent: '3 Months' }),
            Utils.createElement('option', { value: '180', textContent: '6 Months' }),
            Utils.createElement('option', { value: '365', textContent: '1 Year' })
        ]);
        durationSelect.value = ForecastWidget.settings.duration;

        const filterBtn = Utils.createElement('button', {
            className: `btn-secondary`, textContent: '⚙️ Accounts', style: { padding: '5px 10px', fontSize: '0.85rem' }
        });

        controls.append(modeSelect, durationSelect, filterBtn);
        container.appendChild(controls);

        const filterContainer = Utils.createElement('div', { style: { display: 'none', flexWrap: 'wrap', gap: '8px', padding: '10px', background: 'var(--bg-primary)', borderRadius: '8px' } });
        container.appendChild(filterContainer);

        const canvasContainer = Utils.createElement('div', { style: { position: 'relative', height: '250px' } });
        const canvas = document.createElement('canvas');
        canvasContainer.appendChild(canvas);
        container.appendChild(canvasContainer);

        let chartInstance = null;

        const updateContent = () => {
            // UI State
            filterBtn.classList.toggle('active', ForecastWidget.settings.showFilters);
            filterContainer.style.display = ForecastWidget.settings.showFilters ? 'flex' : 'none';

            // Filters
            filterContainer.innerHTML = '';
            const accounts = Array.from(state.data.accounts.values()).filter(a => a.status === 'open' && !a.deleted);
            accounts.forEach(acc => {
                const isSelected = !ForecastWidget.settings.hiddenAccounts.includes(acc.id);
                const chip = Utils.createElement('button', {
                    textContent: (isSelected ? '✓ ' : '') + acc.name,
                    style: { padding: '4px 10px', borderRadius: '20px', fontSize: '0.8rem', border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)' },
                    onclick: () => {
                        if (isSelected) ForecastWidget.settings.hiddenAccounts.push(acc.id);
                        else ForecastWidget.settings.hiddenAccounts = ForecastWidget.settings.hiddenAccounts.filter(id => id !== acc.id);
                        localStorage.setItem('forecast_hidden_accounts', JSON.stringify(ForecastWidget.settings.hiddenAccounts));
                        updateContent();
                    }
                });
                filterContainer.appendChild(chip);
            });

            // Logic
            if (!window.Chart) return;
            const includedAccounts = accounts.filter(acc => !ForecastWidget.settings.hiddenAccounts.includes(acc.id));
            const includedIds = new Set(includedAccounts.map(a => a.id));
            let currentBalance = includedAccounts.reduce((sum, acc) => sum + acc.balance, 0);
            
            const relevantScheduled = Array.from(state.data.scheduled.values())
                .filter(bill => !bill.deleted && (!bill.accountId || includedIds.has(bill.accountId)));

            const ctx = canvas.getContext('2d');
            const mode = ForecastWidget.settings.mode;
            const days = parseInt(ForecastWidget.settings.duration, 10);
            const forecaster = new BudgetForecaster(state.data.envelopes, state.data.accounts);
            const { labels, data } = forecaster.generateBalanceForecast(currentBalance, relevantScheduled, mode, days);

            if(chartInstance) chartInstance.destroy();

            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels.map(d => new Date(d).toLocaleDateString(undefined, {month:'short', day:'numeric'})),
                    datasets: [{
                        label: 'Projected', data: data.map(v => v / 100),
                        borderColor: mode === 'scheduled' ? '#10b981' : '#6366f1',
                        backgroundColor: mode === 'scheduled' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                        fill: true, tension: 0.4, pointRadius: 0
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } } } }
            });
        };

        modeSelect.addEventListener('change', (e) => { ForecastWidget.settings.mode = e.target.value; localStorage.setItem('forecast_mode', e.target.value); updateContent(); });
        durationSelect.addEventListener('change', (e) => { ForecastWidget.settings.duration = e.target.value; localStorage.setItem('forecast_duration', e.target.value); updateContent(); });
        filterBtn.onclick = () => { ForecastWidget.settings.showFilters = !ForecastWidget.settings.showFilters; updateContent(); };

        requestAnimationFrame(() => updateContent());
        return container;
    }
};
