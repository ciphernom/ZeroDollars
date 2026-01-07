export const plugin = {
    meta: {
        title: "Days of Buffering",
        order: 2, // Place near the top
        gridSpan: 1,
        collapsible: false
    },

    ui: {
        'reports_grid': (context) => {
            const { utils, state } = context;
            
            // 1. Calculate Total Liquid Cash
            // We count checking/savings, but usually exclude credit debt for this specific metric
            // to see "how long can I survive".
            let totalCash = 0;
            Array.from(state.data.accounts.values()).forEach(acc => {
                if (acc.type !== 'credit') {
                    totalCash += acc.balance;
                }
            });

            // 2. Calculate Average Daily Spending (Last 365 Days)
            const now = new Date();
            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(now.getFullYear() - 1);
            
            let totalSpent = 0;
            let firstTransactionDate = now.getTime();

            Array.from(state.data.envelopes.values()).forEach(env => {
                env.transactions.forEach(tx => {
                    if (tx.type === 'spend' && !tx.deleted) {
                        const txDate = new Date(tx.date).getTime();
                        if (txDate >= oneYearAgo.getTime()) {
                            totalSpent += Math.abs(tx.amount);
                            if (txDate < firstTransactionDate) firstTransactionDate = txDate;
                        }
                    }
                });
            });

            // Avoid division by zero
            const msDiff = now.getTime() - firstTransactionDate;
            const daysHistory = Math.max(1, Math.ceil(msDiff / (1000 * 60 * 60 * 24)));
            const avgDailySpend = totalSpent / daysHistory;

            // 3. Render
            const container = utils.createElement('div', {
                style: { 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    height: '100%',
                    padding: '15px'
                }
            });

            if (avgDailySpend <= 0) {
                container.textContent = "Insufficient history";
                return container;
            }

            const daysOfBuffering = (totalCash / avgDailySpend).toFixed(1);

            // Color coding (Traffic Light)
            let color = '#ef4444'; // Red (< 30 days)
            if (daysOfBuffering > 90) color = '#10b981'; // Green (> 3 months)
            else if (daysOfBuffering > 30) color = '#f59e0b'; // Orange

            const metric = utils.createElement('div', {
                textContent: `${daysOfBuffering} Days`,
                style: { fontSize: '2rem', fontWeight: '800', color: color }
            });

            const subtitle = utils.createElement('div', {
                textContent: `Based on avg spend of ${utils.formatCurrency(avgDailySpend)}/day`,
                style: { fontSize: '0.8rem', color: '#64748b', marginTop: '5px', textAlign: 'center' }
            });

            container.append(metric, subtitle);
            return container;
        }
    }
};
