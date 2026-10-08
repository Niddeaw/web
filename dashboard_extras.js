/* =======================================================
   dashboard_extras.js
   ลูกเล่นเพิ่มเติม — B/C/D Categories
   - 🎉 Confetti
   - ✨ Skeleton Loading
   - 🔍 Global Search
   - 🔔 Notification Center
   - 🧭 Breadcrumb
   - 📅 Auto Reminder
   - 🎨 Icon Animations (helper)
   ======================================================= */

// =====================================================
// 🎉 1) CONFETTI
// =====================================================
const Confetti = {
    _hasLib() { return typeof window.confetti === 'function'; },

    fire(options = {}) {
        if (!this._hasLib()) return;
        window.confetti({
            particleCount: 100, spread: 70,
            origin: { y: 0.6 }, ...options
        });
    },

    burst() {
        if (!this._hasLib()) return;
        window.confetti({ particleCount: 80, spread: 100, origin: { y: 0.6 } });
        setTimeout(() => {
            window.confetti({ particleCount: 50, angle: 60, spread: 55, origin: { x: 0 } });
            window.confetti({ particleCount: 50, angle: 120, spread: 55, origin: { x: 1 } });
        }, 150);
    },

    success() {
        if (!this._hasLib()) return;
        window.confetti({
            particleCount: 120, spread: 90, origin: { y: 0.55 },
            colors: ['#10b981', '#34d399', '#6ee7b7', '#a7f3d0']
        });
    },

    warn() {
        if (!this._hasLib()) return;
        window.confetti({
            particleCount: 60, spread: 60, origin: { y: 0.6 },
            colors: ['#f59e0b', '#fbbf24', '#fcd34d']
        });
    }
};

// =====================================================
// ✨ 2) SKELETON LOADING
// =====================================================
const Skeleton = {
    _class: 'wrk-skeleton',

    table(cols = 4, rows = 5) {
        const widths = [40, 70, 90, 60, 80];
        let html = '';
        for (let i = 0; i < rows; i++) {
            html += '<tr>';
            for (let j = 0; j < cols; j++) {
                const w = widths[j % widths.length];
                html += `<td style="padding:12px 16px;">
                    <div class="${this._class}" style="width:${w}%;height:14px;border-radius:6px;"></div>
                </td>`;
            }
            html += '</tr>';
        }
        return html;
    },

    cards(count = 3) {
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `<div style="padding:16px;border-radius:14px;background:#fff;border:1px solid #e9eef5;">
                <div class="${this._class}" style="width:50%;height:16px;margin-bottom:10px;border-radius:6px;"></div>
                <div class="${this._class}" style="width:80%;height:12px;margin-bottom:8px;border-radius:6px;"></div>
                <div class="${this._class}" style="width:60%;height:12px;border-radius:6px;"></div>
            </div>`;
        }
        return html;
    },

    list(count = 4) {
        let html = '';
        for (let i = 0; i < count; i++) {
            html += `<div style="display:flex;align-items:center;gap:12px;padding:12px;">
                <div class="${this._class}" style="width:40px;height:40px;border-radius:50%;flex-shrink:0;"></div>
                <div style="flex:1;">
                    <div class="${this._class}" style="width:60%;height:14px;margin-bottom:6px;border-radius:6px;"></div>
                    <div class="${this._class}" style="width:40%;height:12px;border-radius:6px;"></div>
                </div>
            </div>`;
        }
        return html;
    },

    show(targetId, type = 'table', options = {}) {
        const el = typeof targetId === 'string' ? document.getElementById(targetId) : targetId;
        if (!el) return;
        el._skeletonBackup = el._skeletonBackup || el.innerHTML;
        if (type === 'table') el.innerHTML = this.table(options.cols || 4, options.rows || 5);
        else if (type === 'cards') el.innerHTML = this.cards(options.count || 3);
        else if (type === 'list') el.innerHTML = this.list(options.count || 4);
    },

    hide(targetId) {
        const el = typeof targetId === 'string' ? document.getElementById(targetId) : targetId;
        if (!el || !el._skeletonBackup) return;
        el.innerHTML = el._skeletonBackup;
        delete el._skeletonBackup;
    }
};

// =====================================================
// 🔍 3) GLOBAL SEARCH
// =====================================================
const GlobalSearch = {
    _open: false,
    _sources: [],
    _debounceTimer: null,
    _lastQuery: '',

    registerSource(source) {
        if (!source.id || typeof source.search !== 'function') return;
        this._sources = this._sources.filter(s => s.id !== source.id);
        this._sources.push(source);
    },

    registerSources(sources) {
        (sources || []).forEach(s => this.registerSource(s));
    },

    open() {
        if (this._open) return;
        this._open = true;
        let modal = document.getElementById('wrkSearchModal');
        if (!modal) {
            modal = this._buildModal();
            document.body.appendChild(modal);
            this._bindEvents(modal);
        }
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        const input = document.getElementById('wrkSearchInput');
        if (input) { input.value = ''; input.focus(); this._showEmpty(); }
    },

    close() {
        const modal = document.getElementById('wrkSearchModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        this._open = false;
    },

    _buildModal() {
        const modal = document.createElement('div');
        modal.id = 'wrkSearchModal';
        modal.className = 'fixed inset-0 z-[100] hidden items-start justify-center p-4 pt-16';
        modal.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onclick="GlobalSearch.close()"></div>
            <div class="relative bg-white rounded-3xl shadow-2xl z-10 w-full max-w-2xl max-h-[75vh] flex flex-col overflow-hidden">
                <div class="p-4 border-b border-slate-100 flex items-center gap-3">
                    <i class="fas fa-magnifying-glass text-slate-400 text-lg"></i>
                    <input id="wrkSearchInput" type="text"
                        placeholder="ค้นหานักเรียน, ครู, เมนู... (Ctrl+K)"
                        class="flex-1 border-0 outline-none text-base font-medium text-slate-800 bg-transparent"
                        autocomplete="off">
                    <kbd class="text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">ESC</kbd>
                    <button onclick="GlobalSearch.close()" class="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-500 text-slate-400 flex items-center justify-center transition-colors">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div id="wrkSearchResults" class="overflow-y-auto flex-1 p-3"></div>
                <div class="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center gap-4 text-[10px] text-slate-500 font-bold">
                    <span><kbd class="border border-slate-300 rounded px-1 py-0.5">↑</kbd> <kbd class="border border-slate-300 rounded px-1 py-0.5">↓</kbd> เลื่อน</span>
                    <span><kbd class="border border-slate-300 rounded px-1 py-0.5">Enter</kbd> เลือก</span>
                    <span><kbd class="border border-slate-300 rounded px-1 py-0.5">ESC</kbd> ปิด</span>
                </div>
            </div>
        `;
        return modal;
    },

    _bindEvents(modal) {
        const input = modal.querySelector('#wrkSearchInput');
        input.addEventListener('input', (e) => {
            clearTimeout(this._debounceTimer);
            const q = e.target.value.trim();
            if (!q) { this._showEmpty(); return; }
            this._debounceTimer = setTimeout(() => this._search(q), 250);
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.close();
        });
    },

    _showEmpty() {
        const results = document.getElementById('wrkSearchResults');
        if (!results) return;
        if (this._sources.length === 0) {
            results.innerHTML = `
                <div class="text-center py-12 text-slate-400">
                    <i class="fas fa-magnifying-glass text-4xl mb-3 text-slate-300"></i>
                    <p class="font-bold">พิมพ์เพื่อค้นหา</p>
                    <p class="text-xs mt-1">ระบบจะค้นหาจากทุกแหล่งข้อมูลที่พร้อมใช้งาน</p>
                </div>`;
            return;
        }
        results.innerHTML = `
            <div class="text-xs font-bold text-slate-400 uppercase tracking-widest px-3 py-2">หมวดหมู่ที่ค้นหาได้</div>
            ${this._sources.map(s => `
                <div class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm">
                    <i class="fas ${s.icon || 'fa-circle'}" style="color:${s.color || '#64748b'}"></i>
                    <span class="font-medium text-slate-700">${s.label || s.id}</span>
                </div>
            `).join('')}
        `;
    },

    async _search(query) {
        this._lastQuery = query;
        const results = document.getElementById('wrkSearchResults');
        if (!results) return;

        results.innerHTML = `
            <div class="flex items-center justify-center py-8 text-slate-400">
                <i class="fas fa-circle-notch fa-spin text-2xl mr-2"></i>
                <span>กำลังค้นหา...</span>
            </div>`;

        const grouped = {};
        await Promise.all(this._sources.map(async (source) => {
            try {
                const items = await source.search(query);
                if (items && items.length > 0) grouped[source.id] = { source, items };
            } catch (err) { console.warn(`Search "${source.id}" error:`, err); }
        }));

        if (query !== this._lastQuery) return;

        const totalItems = Object.values(grouped).reduce((s, g) => s + g.items.length, 0);
        if (totalItems === 0) {
            results.innerHTML = `
                <div class="text-center py-12 text-slate-400">
                    <i class="fas fa-face-frown text-4xl mb-3 text-slate-300"></i>
                    <p class="font-bold">ไม่พบผลลัพธ์</p>
                </div>`;
            return;
        }

        let html = '';
        Object.values(grouped).forEach(({ source, items }) => {
            html += `
                <div class="mb-2">
                    <div class="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                        <i class="fas ${source.icon || 'fa-circle'}" style="color:${source.color || '#64748b'}"></i>
                        <span>${source.label || source.id}</span>
                        <span class="ml-auto text-slate-300">${items.length}</span>
                    </div>
                    ${items.slice(0, 6).map((item, idx) => `
                        <div data-gs-source="${source.id}" data-gs-idx="${idx}"
                             class="gs-item flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-indigo-50 cursor-pointer transition-colors group">
                            <div class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                                 style="background:${source.color || '#64748b'}20; color:${source.color || '#64748b'};">
                                <i class="fas ${item.icon || source.icon || 'fa-circle'}"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-bold text-slate-800 text-sm truncate">${this._esc(item.title || '')}</div>
                                ${item.subtitle ? `<div class="text-xs text-slate-500 truncate">${this._esc(item.subtitle)}</div>` : ''}
                            </div>
                            <i class="fas fa-arrow-right text-slate-300 group-hover:text-indigo-500 transition-colors"></i>
                        </div>
                    `).join('')}
                </div>
            `;
            // store items for select
            source._lastItems = items;
        });
        results.innerHTML = html;

        results.querySelectorAll('.gs-item').forEach(el => {
            el.addEventListener('click', () => {
                const sid = el.dataset.gsSource;
                const idx = parseInt(el.dataset.gsIdx, 10);
                this._selectItem(sid, idx);
            });
        });
    },

    _selectItem(sourceId, idx) {
        const source = this._sources.find(s => s.id === sourceId);
        if (!source || !source._lastItems) return;
        const item = source._lastItems[idx];
        if (!item) return;
        if (typeof item.onSelect === 'function') item.onSelect(item);
        else if (item.href) window.location.href = item.href;
        this.close();
    },

    _esc(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, m => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[m]));
    }
};

// =====================================================
// 🔔 4) NOTIFICATION CENTER
// =====================================================
const NotificationCenter = {
    _open: false,
    _categories: {
        attendance: { label: 'การเช็คชื่อ', icon: 'fa-clipboard-user', color: '#2588e8' },
        leave:      { label: 'การลา',        icon: 'fa-envelope-open-text', color: '#f43f5e' },
        calendar:   { label: 'ปฏิทิน',       icon: 'fa-calendar-alt', color: '#8b5cf6' },
        student:    { label: 'นักเรียน',      icon: 'fa-user-graduate', color: '#a855f7' },
        system:     { label: 'ระบบ',          icon: 'fa-gear', color: '#64748b' },
        other:      { label: 'อื่นๆ',          icon: 'fa-circle-info', color: '#94a3b8' }
    },
    _items: [],        // { id, category, title, description, time, icon, color, actions, read }
    _sources: [],      // { id, category, fetch: async () => [...] }
    _currentTab: 'all',

    /** ลงทะเบียน source แบบ dynamic (จะถูกเรียก fetch() ทุกครั้งที่เปิด) */
    registerSource(source) {
        if (!source.id || typeof source.fetch !== 'function') return;
        this._sources = this._sources.filter(s => s.id !== source.id);
        this._sources.push(source);
    },

    /** เพิ่ม notification แบบ static */
    add(notification) {
        if (!notification.id) notification.id = 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        notification.time = notification.time || new Date();
        notification.category = notification.category || 'other';
        const existingIdx = this._items.findIndex(i => i.id === notification.id);
        if (existingIdx >= 0) this._items[existingIdx] = notification;
        else this._items.push(notification);
        this._updateBadge();
    },

    remove(id) {
        this._items = this._items.filter(i => i.id !== id);
        this._updateBadge();
    },

    clearAll() {
        this._items = [];
        this._sources = [];
        this._updateBadge();
    },

    markAllRead() {
        this._items.forEach(i => { i.read = true; });
        try { localStorage.setItem('wrk_notif_read', JSON.stringify(this._items.map(i => i.id))); } catch (e) {}
        this._updateBadge();
    },

    _unreadCount() {
        let readIds = [];
        try { readIds = JSON.parse(localStorage.getItem('wrk_notif_read') || '[]'); } catch (e) {}
        return this._items.filter(i => !i.read && !readIds.includes(i.id)).length;
    },

    _updateBadge() {
        const badge = document.getElementById('wrkNotifBadge');
        if (!badge) return;
        const count = this._unreadCount();
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    },

    async open() {
        if (this._open) return;
        this._open = true;

        let modal = document.getElementById('wrkNotifModal');
        if (!modal) {
            modal = this._buildModal();
            document.body.appendChild(modal);
        }
        modal.classList.remove('hidden');
        modal.classList.add('flex');

        await this._loadFromSources();
        this._render('all');
        this._updateBadge();
    },

    close() {
        const modal = document.getElementById('wrkNotifModal');
        if (!modal) return;
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        this._open = false;
    },

    _buildModal() {
        const modal = document.createElement('div');
        modal.id = 'wrkNotifModal';
        modal.className = 'fixed inset-0 z-[100] hidden items-start justify-center p-4 pt-16';
        modal.innerHTML = `
            <div class="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onclick="NotificationCenter.close()"></div>
            <div class="relative bg-white rounded-3xl shadow-2xl z-10 w-full max-w-xl max-h-[80vh] flex flex-col overflow-hidden">
                <div class="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-gradient-to-r from-indigo-50 to-white">
                    <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                        <i class="fas fa-bell"></i>
                    </div>
                    <div class="flex-1">
                        <h3 class="font-black text-slate-800">การแจ้งเตือน</h3>
                        <p class="text-[11px] text-slate-400">รวมทุกโมดูลไว้ที่นี่</p>
                    </div>
                    <button onclick="NotificationCenter.markAllRead()" class="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors">
                        <i class="fas fa-check-double mr-1"></i>อ่านทั้งหมด
                    </button>
                    <button onclick="NotificationCenter.close()" class="h-8 w-8 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-500 text-slate-500 flex items-center justify-center transition-colors">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="px-3 py-2 border-b border-slate-100 flex gap-1 overflow-x-auto scrollbar-hide" id="wrkNotifTabs"></div>
                <div id="wrkNotifList" class="overflow-y-auto flex-1 p-3"></div>
            </div>
        `;
        return modal;
    },

    async _loadFromSources() {
        await Promise.all(this._sources.map(async (source) => {
            try {
                const items = await source.fetch();
                (items || []).forEach(item => {
                    if (!item.category) item.category = source.category || 'other';
                    this.add(item);
                });
            } catch (err) {
                console.warn(`Notif source "${source.id}" error:`, err);
            }
        }));
    },

    _render(tab = 'all') {
        this._currentTab = tab;
        const tabsEl = document.getElementById('wrkNotifTabs');
        const listEl = document.getElementById('wrkNotifList');
        if (!tabsEl || !listEl) return;

        // Tabs
        const cats = ['all', ...Object.keys(this._categories)];
        tabsEl.innerHTML = cats.map(cat => {
            const meta = cat === 'all'
                ? { label: 'ทั้งหมด', icon: 'fa-list', color: '#6366f1' }
                : this._categories[cat];
            const count = cat === 'all'
                ? this._items.length
                : this._items.filter(i => i.category === cat).length;
            if (count === 0 && cat !== 'all') return '';
            const active = cat === tab;
            return `
                <button onclick="NotificationCenter._render('${cat}')"
                    class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${active ? 'text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}"
                    style="${active ? `background:${meta.color};` : ''}">
                    <i class="fas ${meta.icon}" style="color:${active ? '#fff' : meta.color};"></i>
                    <span>${meta.label}</span>
                    <span class="ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${active ? 'bg-white/25' : 'bg-slate-200 text-slate-600'}">${count}</span>
                </button>
            `;
        }).join('');

        // List
        const items = tab === 'all' ? this._items : this._items.filter(i => i.category === tab);
        if (items.length === 0) {
            listEl.innerHTML = `
                <div class="text-center py-16 text-slate-400">
                    <i class="fas fa-bell-slash text-4xl mb-3 text-slate-300"></i>
                    <p class="font-bold">ไม่มีการแจ้งเตือน</p>
                    <p class="text-xs mt-1">เมื่อมีเรื่องใหม่ ระบบจะแจ้งที่นี่</p>
                </div>`;
            return;
        }

        // sort by time desc
        items.sort((a, b) => new Date(b.time) - new Date(a.time));

        // group by category
        const grouped = {};
        items.forEach(i => {
            const c = i.category || 'other';
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(i);
        });

        let html = '';
        Object.entries(grouped).forEach(([cat, catItems]) => {
            const meta = this._categories[cat] || { label: cat, icon: 'fa-circle', color: '#94a3b8' };
            html += `
                <div class="mb-3">
                    <div class="flex items-center gap-2 px-2 py-1 text-[10px] font-bold uppercase tracking-widest"
                         style="color:${meta.color};">
                        <i class="fas ${meta.icon}"></i>
                        <span>${meta.label}</span>
                        <span class="ml-auto opacity-60">${catItems.length}</span>
                    </div>
                    ${catItems.map(n => this._renderItem(n)).join('')}
                </div>
            `;
        });
        listEl.innerHTML = html;

        // bind action buttons
        listEl.querySelectorAll('[data-notif-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const notifId = btn.dataset.notifId;
                const actionIdx = parseInt(btn.dataset.notifAction, 10);
                const notif = this._items.find(i => i.id === notifId);
                if (notif && notif.actions && notif.actions[actionIdx]) {
                    notif.actions[actionIdx].onclick?.();
                }
            });
        });
    },

    _renderItem(n) {
        const meta = this._categories[n.category] || { color: '#94a3b8', icon: 'fa-circle' };
        const icon = n.icon || meta.icon;
        const color = n.color || meta.color;
        const timeAgo = this._timeAgo(n.time);
        const actionsHtml = (n.actions || []).map((a, i) => `
            <button data-notif-action="${i}" data-notif-id="${n.id}"
                class="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors"
                style="background:${color}15; color:${color};">
                ${a.label}
            </button>
        `).join('');

        return `
            <div class="flex gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors mb-1">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style="background:${color}15; color:${color};">
                    <i class="fas ${icon}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-start justify-between gap-2 mb-0.5">
                        <div class="font-bold text-slate-800 text-sm">${n.title || ''}</div>
                        <div class="text-[10px] text-slate-400 whitespace-nowrap">${timeAgo}</div>
                    </div>
                    ${n.description ? `<div class="text-xs text-slate-500 leading-relaxed">${n.description}</div>` : ''}
                    ${actionsHtml ? `<div class="flex gap-2 mt-2">${actionsHtml}</div>` : ''}
                </div>
            </div>
        `;
    },

    _timeAgo(time) {
        const diff = Date.now() - new Date(time).getTime();
        const min = Math.floor(diff / 60000);
        if (min < 1) return 'เมื่อกี้';
        if (min < 60) return `${min} นาทีที่แล้ว`;
        const hr = Math.floor(min / 60);
        if (hr < 24) return `${hr} ชม.ที่แล้ว`;
        const day = Math.floor(hr / 24);
        if (day < 7) return `${day} วันที่แล้ว`;
        return new Date(time).toLocaleDateString('th-TH');
    }
};

// =====================================================
// 🧭 5) BREADCRUMB
// =====================================================
const Breadcrumb = {
    _items: [],

    set(items) {
        this._items = Array.isArray(items) ? items : [];
        this._render();
    },

    _render() {
        const el = document.getElementById('wrkBreadcrumb');
        if (!el) return;
        if (this._items.length === 0) {
            el.innerHTML = '';
            el.classList.add('hidden');
            return;
        }
        el.classList.remove('hidden');
        el.innerHTML = this._items.map((item, i) => {
            const isLast = i === this._items.length - 1;
            const content = isLast
                ? `<span class="font-bold text-slate-800">${item.label}</span>`
                : item.href
                    ? `<a href="${item.href}" class="text-slate-500 hover:text-indigo-600 transition-colors font-medium">${item.label}</a>`
                    : `<span class="text-slate-500 font-medium">${item.label}</span>`;
            const sep = isLast ? '' : `<i class="fas fa-chevron-right text-[8px] text-slate-300 mx-1.5"></i>`;
            return content + sep;
        }).join('');
    }
};

// =====================================================
// 📅 6) AUTO REMINDER
// =====================================================
const AutoReminder = {
    _tasks: [],
    _checkInterval: null,

    /**
     * ลงทะเบียน task
     * @example
     * AutoReminder.register({
     *   id: 'attendance-check',
     *   hour: 9, minute: 0,
     *   check: async () => true,  // return true = ต้องเตือน
     *   onRemind: () => { ... }
     * });
     */
    register(task) {
        if (!task.id || typeof task.check !== 'function') return;
        this._tasks = this._tasks.filter(t => t.id !== task.id);
        this._tasks.push(task);
        this._ensureRunning();
    },

    _ensureRunning() {
        if (this._checkInterval) return;
        // Check every 5 minutes
        this._checkInterval = setInterval(() => this._runChecks(), 5 * 60 * 1000);
        // Run once after 10s
        setTimeout(() => this._runChecks(), 10000);
    },

    async _runChecks() {
        const now = new Date();
        for (const task of this._tasks) {
            try {
                // Check time window
                if (task.hour !== undefined) {
                    const h = task.hour;
                    const m = task.minute || 0;
                    if (now.getHours() !== h || Math.abs(now.getMinutes() - m) > 4) continue;
                }
                // Check once-per-day
                const today = now.toISOString().split('T')[0];
                const key = `wrk_reminder_${task.id}_${today}`;
                if (localStorage.getItem(key)) continue;

                const shouldRemind = await task.check();
                if (shouldRemind) {
                    localStorage.setItem(key, '1');
                    if (typeof task.onRemind === 'function') task.onRemind();
                    else this._defaultRemind(task);
                }
            } catch (err) {
                console.warn(`AutoReminder "${task.id}" error:`, err);
            }
        }
    },

    _defaultRemind(task) {
        if (typeof Swal === 'undefined') return;
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: task.icon || 'info',
            title: task.title || 'แจ้งเตือน',
            text: task.message || '',
            showConfirmButton: false,
            timer: 8000,
            timerProgressBar: true
        });
    }
};

// =====================================================
// 🎨 7) ICON ANIMATIONS (helper)
// =====================================================
const IconAnim = {
    _classes: ['anim-bounce', 'anim-shake', 'anim-pulse', 'anim-wiggle', 'anim-spin'],

    apply(element, type = 'bounce', duration = 600) {
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return;
        const cls = `anim-${type}`;
        this._classes.forEach(c => el.classList.remove(c));
        // force reflow
        void el.offsetWidth;
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), duration);
    },

    bounce(el) { this.apply(el, 'bounce'); },
    shake(el)  { this.apply(el, 'shake'); },
    pulse(el)  { this.apply(el, 'pulse'); },
    wiggle(el) { this.apply(el, 'wiggle'); }
};

// =====================================================
// 🚀 INIT EXTRAS (called by dashboard_ui.js)
// =====================================================
async function initExtras() {
    // 1) Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+K or Cmd+K → Global Search
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            GlobalSearch.open();
        }
        // ESC → close modals
        if (e.key === 'Escape') {
            GlobalSearch.close();
            NotificationCenter.close();
        }
    });

    // 2) Register default search sources
    if (typeof db !== 'undefined') {
        GlobalSearch.registerSources([
            {
                id: 'students',
                label: 'นักเรียน',
                icon: 'fa-user-graduate',
                color: '#8b5cf6',
                search: async (q) => {
                    try {
                        const { data } = await db.from('core_students')
                            .select('id, prefix, first_name, last_name, student_id_card')
                            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,student_id_card.ilike.%${q}%`)
                            .limit(8);
                        return (data || []).map(s => ({
                            id: s.id,
                            title: `${s.prefix || ''}${s.first_name} ${s.last_name}`,
                            subtitle: `รหัส: ${s.student_id_card || '-'}`,
                            icon: 'fa-user-graduate',
                            onSelect: () => Swal.fire({
                                title: `${s.prefix || ''}${s.first_name} ${s.last_name}`,
                                html: `<div class="text-sm">รหัส: <b>${s.student_id_card || '-'}</b></div>`,
                                icon: 'info'
                            })
                        }));
                    } catch (e) { return []; }
                }
            },
            {
                id: 'personnel',
                label: 'ครู / บุคลากร',
                icon: 'fa-chalkboard-user',
                color: '#e11d48',
                search: async (q) => {
                    try {
                        const { data } = await db.from('core_personnel')
                            .select('id, prefix, first_name, last_name, position, department')
                            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
                            .limit(8);
                        return (data || []).map(p => ({
                            id: p.id,
                            title: `${p.prefix || ''}${p.first_name} ${p.last_name}`,
                            subtitle: `${p.position || ''} ${p.department ? '· ' + p.department : ''}`,
                            icon: 'fa-chalkboard-user',
                            onSelect: () => Swal.fire({
                                title: `${p.prefix || ''}${p.first_name} ${p.last_name}`,
                                html: `<div class="text-sm">${p.position || ''}<br>${p.department || ''}</div>`,
                                icon: 'info'
                            })
                        }));
                    } catch (e) { return []; }
                }
            },
            {
                id: 'menus',
                label: 'เมนู',
                icon: 'fa-bars',
                color: '#0ea5e9',
                search: async (q) => {
                    const menus = [];
                    document.querySelectorAll('.d-nav a[href], .d-nav a[onclick]').forEach(a => {
                        const label = a.querySelector('.d-label')?.textContent?.trim() || '';
                        if (label && label.toLowerCase().includes(q.toLowerCase())) {
                            const href = a.getAttribute('href');
                            const onclick = a.getAttribute('onclick');
                            menus.push({
                                id: a.id || `menu-${menus.length}`,
                                title: label,
                                subtitle: href || 'กดเพื่อเข้าใช้งาน',
                                icon: 'fa-arrow-right',
                                onSelect: () => {
                                    if (href) window.location.href = href;
                                    else if (onclick) eval(onclick);
                                    GlobalSearch.close();
                                }
                            });
                        }
                    });
                    return menus;
                }
            }
        ]);
    }

    // 3) Register default notification sources
    if (typeof db !== 'undefined') {
        NotificationCenter.registerSource({
            id: 'birthday-today',
            category: 'system',
            fetch: async () => {
                try {
                    const today = new Date();
                    const mm = String(today.getMonth() + 1).padStart(2, '0');
                    const dd = String(today.getDate()).padStart(2, '0');
                    const { data } = await db.from('core_personnel')
                        .select('id, prefix, first_name, last_name, birth_date')
                        .not('birth_date', 'is', null);
                    return (data || []).filter(p => {
                        if (!p.birth_date) return false;
                        const parts = String(p.birth_date).split('-');
                        return parts[1] === mm && parts[2] === dd;
                    }).map(p => ({
                        id: `bday-${p.id}-${today.getFullYear()}`,
                        category: 'system',
                        icon: 'fa-birthday-cake',
                        color: '#f59e0b',
                        title: `🎂 ${p.prefix || ''}${p.first_name} ${p.last_name}`,
                        description: 'สุขสันต์วันเกิด! 🎉',
                        time: new Date()
                    }));
                } catch (e) { return []; }
            }
        });
    }

    console.log('✅ initExtras: Search + Notifications + Skeleton + Confetti + Breadcrumb + AutoReminder');
}

// =====================================================
// 🔗 EXPORTS
// =====================================================
window.Confetti = Confetti;
window.Skeleton = Skeleton;
window.GlobalSearch = GlobalSearch;
window.NotificationCenter = NotificationCenter;
window.Breadcrumb = Breadcrumb;
window.AutoReminder = AutoReminder;
window.IconAnim = IconAnim;
window.initExtras = initExtras;

console.log('✅ dashboard_extras.js loaded');