import { Utils } from '../../utils/index.js';

export const AgeOfMoneyWidget = {
    id: 'widget-age-of-money',
    type: 'report-widget',
    order: 2,
    title: 'Age of Money',
    collapsible: false,

    render: (state) => {
        const age = state.calculateAgeOfMoney();
        
        const value = Utils.createElement('div', {
            textContent: `${age} days`,
            style: { fontSize: '1.2rem', fontWeight: 'bold', textAlign: 'center' }
        });

        return value;
    }
};

