export const plugin = {
    // 1. Setup metadata for the Reports View
    meta: {
        title: "Net Worth in BTC",
        order: 1, // Put it at the top
        gridSpan: 1,
        collapsible: false
    },

    // 2. Define the UI renderer
    ui: {
        'reports_grid': (context) => {
            const { utils, state } = context;
            
            // Create container
            const container = utils.createElement('div', {
                style: { 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    height: '100%',
                    padding: '20px'
                }
            });

            const amountEl = utils.createElement('div', {
                textContent: 'Loading...',
                style: { fontSize: '1.8rem', fontWeight: 'bold', color: '#f7931a' }
            });

            const labelEl = utils.createElement('div', {
                textContent: '1 BTC = ...',
                style: { fontSize: '0.8rem', color: '#64748b', marginTop: '5px' }
            });

            container.append(amountEl, labelEl);

            // Calculate Net Worth in Cents
            let netWorthCents = 0;
            Array.from(state.data.accounts.values()).forEach(acc => netWorthCents += acc.balance);

            // Fetch Bitcoin Price from Coinbase (More reliable/CORS friendly than Yahoo)
            fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot')
                .then(r => r.json())
                .then(data => {
                    const rate = parseFloat(data.data.amount);
                    const netWorthUSD = netWorthCents / 100;
                    const btcValue = netWorthUSD / rate;

                    amountEl.textContent = `₿ ${btcValue.toFixed(6)}`;
                    labelEl.textContent = `1 BTC = $${rate.toLocaleString()}`;
                })
                .catch((err) => {
                    console.error(err);
                    amountEl.textContent = "API Error";
                    labelEl.textContent = "Could not fetch price";
                });

            return container;
        }
    }
};
