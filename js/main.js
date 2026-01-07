import './config.js';

import { DatabaseManager } from './db/database.js';
import { AppState } from './state/app-state.js';
import { UIManager } from './ui/ui-manager.js';
import { SimpleSync } from './services/sync.js';
import { Utils } from './utils/index.js';
import { MLManager } from './services/ml-manager.js';
import { Toaster } from './ui/toast-manager.js';
import { PluginSystem } from './core/PluginSystem.js';
import { GamificationEngine } from './services/gamification-engine.js'; 

// Main App
class ZeroDollarsApp {
  constructor() {
    this.db = new DatabaseManager();
    // 1. Initialize Plugin System
    this.plugins = new PluginSystem(this.db);
    // 2. Pass to State
    this.state = new AppState(this.db, this.plugins); 
    this.ui = null;
  }

  async init() {
    try {
      await this.db.open();
      
      // 1. Load Static Data & State
      await MLManager.loadRules();
      await this.state.load();
      await this.state.performIntegrityCheck();
      // 2. Background Maintenance: Prune large account histories
      for (const acc of this.state.data.accounts.values()) {
        if (acc.transactions.length > 600) {
          console.log(`🧹 Pruning history for ${acc.name}...`);
          acc.archiveHistory(this.db.instance)
            .then(didArchive => {
              if(didArchive) console.log(`✅ Archived ${acc.name}`);
            })
            .catch(console.error);
        }
      }

      // 3. Initialize UI (This now binds all events internally)
      this.ui = new UIManager(this.state, this.db, this.plugins);

    // 4. BOOT PLUGINS (Must happen before render so they can inject UI)
      await this.plugins.init(this.state, this.ui);

        this.gamification = new GamificationEngine(this.db, this.plugins);
      await this.gamification.init();

      // 5. Initial Render
      await this.ui.render();
      
           
      // 6. Update Header Month Display
      const currentMonthEl = document.getElementById('current-month');
      if (currentMonthEl) {
        currentMonthEl.textContent = new Date(this.state.data.currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      }

      // 7. Apply Theme
      const savedTheme = await this.db.get('settings', 'theme');
      const theme = savedTheme ? savedTheme.value : 'light';
      document.body.dataset.theme = theme;
      
      const themeToggle = document.getElementById('theme-toggle');
      if (themeToggle) themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';

      // 8. Check Security Lock
      if (this.state.data.locked) {
        this.ui.showPinLock();
      }

      // 9. Service Worker Logic
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js').then(reg => {
          // A. Update Waiting?
          if (reg.waiting) {
            showUpdateNotification(reg.waiting, this.ui);
          }
          // B. New Update Found?
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateNotification(newWorker, this.ui);
              }
            });
          });
        }).catch(console.error);

        const showUpdateNotification = (worker, uiInstance) => {
          // Prevent duplicates
          if(document.getElementById('sw-update-btn')) return;

          const updateBtn = document.createElement('button');
          updateBtn.id = 'sw-update-btn';
          updateBtn.textContent = '🎉 New version ready. Reload?';
          updateBtn.className = 'btn-primary';
          updateBtn.style.cssText = 'position:fixed; bottom:80px; left:50%; transform:translateX(-50%); z-index:9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3); width:auto;';
          
          updateBtn.onclick = () => {
            worker.postMessage({ action: 'SKIP_WAITING' });
          };
          
          document.body.appendChild(updateBtn);
        };

        // C. Reload when new SW takes control
        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            window.location.reload();
            refreshing = true;
          }
        });
      }
      
      console.log('App ready');

    } catch (error) {
      console.error('Init failed:', error);
      
      // Prevent Infinite Reload Loops
      const reloadCount = parseInt(sessionStorage.getItem('reload_count') || '0');
      
      if (reloadCount < 3) {
          sessionStorage.setItem('reload_count', (reloadCount + 1).toString());
          location.reload();
      } else {
          // We gave up, show error to user
          Toaster.show('Critical error: ' + (error.message || 'Unknown') + ' - Please clear site data.', 'error');
          sessionStorage.removeItem('reload_count');
      }
    }
  }
}

// Bootstrap Logic
let app;
document.addEventListener('DOMContentLoaded', () => {
  app = new ZeroDollarsApp();
  window.app = app; // Expose for debugging/Sync access
  
  app.init().then(() => {
    // Initialize Sync Service only after App is ready
    app.simpleSync = new SimpleSync(app.state, app.ui);
  });

  // --- Hamburger Menu Logic ---
  const hamburgerBtn = document.getElementById('hamburger-btn');
  const actionMenu = document.getElementById('action-menu');

  if (hamburgerBtn && actionMenu) {
    hamburgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      actionMenu.classList.toggle('show');
      hamburgerBtn.textContent = actionMenu.classList.contains('show') ? '✕' : '☰';
    });

    actionMenu.querySelectorAll('button, label').forEach(item => {
      item.addEventListener('click', () => {
        actionMenu.classList.remove('show');
        hamburgerBtn.textContent = '☰';
      });
    });

    document.addEventListener('click', (e) => {
      if (!actionMenu.contains(e.target) && e.target !== hamburgerBtn) {
        actionMenu.classList.remove('show');
        hamburgerBtn.textContent = '☰';
      }
    });
  }
});
