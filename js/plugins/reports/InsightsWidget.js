import { Utils } from '../../utils/index.js';
import { BudgetForecaster } from '../../services/forecaster.js';

export const InsightsWidget = {
    id: 'widget-insights',
    type: 'report-widget',
    order: 3,
    title: '⚡ Smart Insights',
    collapsible: true,
     gridSpan: 'full',
    render: (state) => {
        const container = Utils.createElement('div', { id: 'insights-list-container' });
        const forecaster = new BudgetForecaster(state.data.envelopes, state.data.accounts);
        
        const pacing = forecaster.analyzePacing(state.data.currentMonth);
        const changes = forecaster.detectPriceChanges();
        const currentMonthData = state.data.forecastInsights?.[state.data.currentMonth];
        const anomalies = [];

        if (currentMonthData && currentMonthData.confidenceIntervals) {
            Object.entries(currentMonthData.confidenceIntervals).forEach(([jarId, ci]) => {
                const observed = currentMonthData.observed[jarId] || 0;
                if (observed > ci.upper) {
                    const jar = state.getEnvelope(jarId);
                    if (jar) {
                        anomalies.push({
                            name: jar.name,
                            message: `Unusual spending. Normal max: ${Utils.formatCurrency(ci.upper)}`
                        });
                    }
                }
            });
        }

        let hasContent = false;

        const createGrid = (title, items, styleFn) => {
            container.appendChild(Utils.createElement('h4', { textContent: title, style: {marginTop: '0'} }));
            const grid = Utils.createElement('div', { className: 'insight-grid' });
            items.forEach(item => {
                grid.appendChild(Utils.createElement('div', { className: 'insight-card', style: styleFn(item) }, [
                    Utils.createElement('strong', { textContent: item.name }),
                    Utils.createElement('small', { textContent: item.message, style: {display:'block'} })
                ]));
            });
            container.appendChild(grid);
        };

        if (anomalies.length > 0) {
            hasContent = true;
            createGrid('🤖 ML Anomalies', anomalies, () => ({ backgroundColor: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe' }));
        }

        if (pacing.length > 0) {
            if (hasContent) container.appendChild(Utils.createElement('hr', { style: {margin: '15px 0', border: '0', borderTop: '1px solid var(--border)'} }));
            hasContent = true;
            createGrid('🔥 Burn Rate', pacing.slice(0, 4), (p) => ({
                backgroundColor: p.status === 'danger' ? 'var(--danger-light)' : '#d1fae5',
                color: p.status === 'danger' ? 'var(--danger)' : '#065f46'
            }));
        }

        if (changes.length > 0) {
            if (hasContent) container.appendChild(Utils.createElement('hr', { style: {margin: '15px 0', border: '0', borderTop: '1px solid var(--border)'} }));
            hasContent = true;
            createGrid('📊 Price Changes', changes, (c) => (c.type === 'hike' 
                ? { backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }
                : { backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }
            ));
        }

        if (!hasContent) {
            return Utils.createElement('div', { textContent: "No insights available yet.", style: { color: 'var(--text-secondary)', fontStyle: 'italic', textAlign: 'center', padding: '10px' }});
        }

        return container;
    }
};

