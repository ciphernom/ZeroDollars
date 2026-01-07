import { Utils } from '../../utils/index.js';

export const NetWorthWidget = {
    id: 'widget-net-worth',
    type: 'report-widget',
    order: 1,
    title: 'Net Worth',
    collapsible: false, // Too small to minimize
    
    render: (state) => {
        let netWorth = 0;
        Array.from(state.data.accounts.values()).forEach(acc => netWorth += acc.balance);

        const amount = Utils.createElement('div', {
            textContent: Utils.formatCurrency(netWorth),
            style: { fontSize: '1.8rem', fontWeight: '800', color: 'var(--accent)', textAlign: 'center' }
        });

        return amount;
    }
};

