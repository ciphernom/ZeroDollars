import { Utils } from '../../utils/index.js';

export class VirtualScroller {
    constructor(container, options = {}) {
        this.container = container;
        this.rowHeight = options.rowHeight || 60;
        this.renderRow = options.renderRow || (() => {});
        this.items = [];
        this.lastScrollTop = 0;
        this.ticking = false;

        this.container.innerHTML = '';
        this.spacer = Utils.createElement('div', { className: 'virtual-spacer' });
        this.content = Utils.createElement('div', { className: 'virtual-content' });
        
        this.container.appendChild(this.spacer);
        this.container.appendChild(this.content);

        this.container.addEventListener('scroll', this.onScroll.bind(this), { passive: true });

        // Trigger reflow when visibility changes
        if (window.ResizeObserver) {
            this.resizeObserver = new ResizeObserver(() => {
                this.onScroll(); 
            });
            this.resizeObserver.observe(this.container);
        }
    }

    setItems(items) {
        this.items = items;
        this.updateDimensions();
        this.renderViewport(this.container.scrollTop);
    }

    updateDimensions() {
        const totalHeight = this.items.length * this.rowHeight;
        this.spacer.style.height = `${totalHeight}px`;
    }

    onScroll() {
        if (!this.ticking) {
            window.requestAnimationFrame(() => {
                this.renderViewport(this.container.scrollTop);
                this.ticking = false;
            });
            this.ticking = true;
        }
    }

    renderViewport(scrollTop) {
        // Fallback height to prevent collapse
        const viewportHeight = this.container.clientHeight || 500;
        const buffer = 5;
        
        let startIndex = Math.floor(scrollTop / this.rowHeight) - buffer;
        let endIndex = Math.ceil((scrollTop + viewportHeight) / this.rowHeight) + buffer;

        startIndex = Math.max(0, startIndex);
        endIndex = Math.min(this.items.length, endIndex);

        this.content.innerHTML = '';
        this.content.style.transform = `translateY(${startIndex * this.rowHeight}px)`;
        
        const fragment = document.createDocumentFragment();
        
        for (let i = startIndex; i < endIndex; i++) {
            const item = this.items[i];
            const row = this.renderRow(item, i); 
            if (row) {
                row.style.height = `${this.rowHeight}px`;
                row.classList.add('virtual-row');
                fragment.appendChild(row);
            }
        }
        
        this.content.appendChild(fragment);
    }
}
