export const plugin = {
    _isProcessing: false,
    _recentlyProcessed: new Map(),
    
    getSettings() {
        return JSON.parse(localStorage.getItem('roundup_settings') || '{"active": false, "targetJarId": null}');
    },

    saveSettings(settings) {
        localStorage.setItem('roundup_settings', JSON.stringify(settings));
    },

    hooks: {
        'transaction:spend_logged': async (payload, context) => {
            const self = context.plugin || plugin;
            
            if (self._isProcessing) return;
            
            const settings = JSON.parse(localStorage.getItem('roundup_settings') || '{}');
            
            if (!settings.active || !settings.targetJarId) return;
            if (payload.amount === 0) return;
            
            const note = payload.note || '';
            if (note.toLowerCase().includes('round-up') || note.toLowerCase().includes('roundup')) return;
            if (payload.isTransfer || payload.type === 'transfer') return;

            const spentCents = Math.abs(payload.amount);
            const remainder = spentCents % 100;
            
            if (remainder === 0) return;

            const roundUpAmount = 100 - remainder;
            if (roundUpAmount <= 0) return;
            
            // Dedupe check
            const txKey = `${payload.id || ''}-${payload.amount}-${payload.envelopeId || 'none'}`;
            const now = Date.now();
            
            for (const [key, timestamp] of self._recentlyProcessed) {
                if (now - timestamp > 5000) self._recentlyProcessed.delete(key);
            }
            
            if (self._recentlyProcessed.has(txKey)) return;
            self._recentlyProcessed.set(txKey, now);

            try {
                self._isProcessing = true;
                
                const { state, utils } = context;
                const savingsJar = state.getEnvelope(settings.targetJarId);
                const sourceJarId = payload.envelopeId;

                if (sourceJarId === settings.targetJarId) return;
                if (!savingsJar) return;

                const roundUpNote = `Round-up for ${payload.note || 'spend'}`;
                
                if (sourceJarId) {
                    const sourceJar = state.getEnvelope(sourceJarId);
                    
                    // Only round up if source jar has enough balance
                    if (!sourceJar || sourceJar.balance < roundUpAmount) return;
                    
                    await state.transfer(sourceJarId, savingsJar.id, roundUpAmount, roundUpNote);
                    context.toast(`🪙 Rounded up ${utils.formatCurrency(roundUpAmount)} to ${savingsJar.name}`, 'success');
                } else {
                    // Uncategorized spend - pull from TBB
                    await state.addFundsToEnvelope(savingsJar.id, roundUpAmount, roundUpNote);
                    context.toast(`🪙 Rounded up ${utils.formatCurrency(roundUpAmount)} to ${savingsJar.name}`, 'success');
                }

            } catch (e) {
                console.error("Round-up failed", e);
            } finally {
                self._isProcessing = false;
            }
        }
    },

    ui: {
        'reports_grid': (context) => {
            const { utils, state } = context;
            let settings = JSON.parse(localStorage.getItem('roundup_settings') || '{"active": false, "targetJarId": null}');

            const container = utils.createElement('div', {
                style: { padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px', height: '100%' }
            });

            container.appendChild(utils.createElement('h4', { 
                textContent: '🪙 Round-Up Saver', 
                style: { margin: 0, color: 'var(--text-primary)' } 
            }));

            const controls = utils.createElement('div', {
                style: { display: 'flex', gap: '10px', alignItems: 'center' }
            });

            const toggleBtn = utils.createElement('button', {
                className: settings.active ? 'btn-primary' : 'btn-secondary',
                textContent: settings.active ? 'ON' : 'OFF',
                style: { width: '60px', fontWeight: 'bold', transition: 'all 0.2s ease' }
            });

            const select = utils.createElement('select', { 
                style: { flexGrow: 1, padding: '8px', margin: 0 } 
            });
            
            const populateSelect = () => {
                select.innerHTML = '<option value="">-- Select Savings Jar --</option>';
                Array.from(state.data.envelopes.values())
                    .filter(e => !e.deleted)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .forEach(env => {
                        const opt = utils.createElement('option', { value: env.id, textContent: env.name });
                        if (env.id === settings.targetJarId) opt.selected = true;
                        select.appendChild(opt);
                    });
            };
            populateSelect();
            select.disabled = !settings.active;

            const save = () => localStorage.setItem('roundup_settings', JSON.stringify(settings));

            const updateUI = () => {
                toggleBtn.className = settings.active ? 'btn-primary' : 'btn-secondary';
                toggleBtn.textContent = settings.active ? 'ON' : 'OFF';
                select.disabled = !settings.active;
            };

            toggleBtn.onclick = () => {
                settings.active = !settings.active;
                updateUI();
                save();
                context.toast(settings.active ? 'Round-ups enabled' : 'Round-ups disabled', 'info');
            };

            select.onchange = () => {
                settings.targetJarId = select.value;
                save();
                if (settings.active) context.toast('Savings jar updated', 'success');
            };

            controls.append(toggleBtn, select);
            container.appendChild(controls);

            container.appendChild(utils.createElement('div', {
                textContent: "Automatically transfers spare change to your savings jar when you log a spend.",
                style: { fontSize: '0.8rem', color: 'var(--text-secondary)' }
            }));

            return container;
        }
    },
    
    meta: {
        title: "Round-Up Saver",
        order: 10,
        gridSpan: 1,
        collapsible: true
    }
};
