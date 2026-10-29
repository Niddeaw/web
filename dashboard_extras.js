/* =======================================================
   dashboard_extras.js — v2.2 OPTIMIZED
   -------------------------------------------------------
   🚀 Performance Improvements:
      - 60s cache for NotificationCenter
      - Prefetch on page idle
      - Role-based early exit
      - Head info cached 5 min in sessionStorage
      - Parallel queries with Promise.all
      - Combined system_settings query
   ======================================================= */

// =====================================================
// 🎉 1) CONFETTI
// =====================================================
const Confetti = {
    _hasLib() { return typeof window.confetti === 'function'; },
    fire(options = {}) {
        if (!this._hasLib()) return;
        window.confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, ...options });
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
// ✨ 2) SKELETON
// =====================================================
const Skeleton = {
    _class: 'wrk-skeleton',
    table(cols = 4, rows = 5) {
        const widths = [40, 70, 90, 60, 80];
        let html = '';
        for (let i = 0; i < rows; i++) {
            html += '<tr>';
            for (let j = 0; j < cols; j++) {
                html += `<td style="padding:12px 16px;"><div class="${this._class}" style="width:${widths[j % widths.length]}%;height:14px;border-radius:6px;"></div></td>`;
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
                <div class="${this._class}" style="width:60%;height:12px;border-radius:6px;"></div></div>`;
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
                    <div class="${this._class}" style="width:40%;height:12px;border-radius:6px;"></div></div></div>`;
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
    _searchCache: new Map(),      // 🚀 cache ผลลัพธ์
    _CACHE_TTL: 30000,

    registerSource(source) {
        if (!source.id || typeof source.search !== 'function') return;
        this._sources = this._sources.filter(s => s.id !== source.id);
        this._sources.push(source);
    },
    registerSources(sources) { (sources || []).forEach(s => this.registerSource(s)); },

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
                    <input id="wrkSearchInput" type="text" placeholder="ค้นหานักเรียน, ครู, เมนู... (Ctrl+K)"
                        class="flex-1 border-0 outline-none text-base font-medium text-slate-800 bg-transparent" autocomplete="off">
                    <kbd class="text-[10px] font-bold text-slate-400 border border-slate-200 rounded px-1.5 py-0.5">ESC</kbd>
                    <button onclick="GlobalSearch.close()" class="h-8 w-8 rounded-lg hover:bg-rose-50 hover:text-rose-500 text-slate-400 flex items-center justify-center transition-colors"><i class="fas fa-times"></i></button>
                </div>
                <div id="wrkSearchResults" class="overflow-y-auto flex-1 p-3"></div>
                <div class="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center gap-4 text-[10px] text-slate-500 font-bold">
                    <span><kbd class="border border-slate-300 rounded px-1 py-0.5">↑</kbd> <kbd class="border border-slate-300 rounded px-1 py-0.5">↓</kbd> เลื่อน</span>
                    <span><kbd class="border border-slate-300 rounded px-1 py-0.5">Enter</kbd> เลือก</span>
                    <span><kbd class="border border-slate-300 rounded px-1 py-0.5">ESC</kbd> ปิด</span>
                </div>
            </div>`;
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
        input.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
    },

    _showEmpty() {
        const results = document.getElementById('wrkSearchResults');
        if (!results) return;
        if (this._sources.length === 0) {
            results.innerHTML = `<div class="text-center py-12 text-slate-400"><i class="fas fa-magnifying-glass text-4xl mb-3 text-slate-300"></i><p class="font-bold">พิมพ์เพื่อค้นหา</p><p class="text-xs mt-1">ระบบจะค้นหาจากทุกแหล่งข้อมูลที่พร้อมใช้งาน</p></div>`;
            return;
        }
        results.innerHTML = `<div class="text-xs font-bold text-slate-400 uppercase tracking-widest px-3 py-2">หมวดหมู่ที่ค้นหาได้</div>` +
            this._sources.map(s => `<div class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm"><i class="fas ${s.icon || 'fa-circle'}" style="color:${s.color || '#64748b'}"></i><span class="font-medium text-slate-700">${s.label || s.id}</span></div>`).join('');
    },

    async _search(query) {
        this._lastQuery = query;
        const results = document.getElementById('wrkSearchResults');
        if (!results) return;

        // 🚀 cache hit?
        const cacheKey = query.toLowerCase();
        const cached = this._searchCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < this._CACHE_TTL) {
            this._renderResults(results, cached.grouped, cached.sourcesSnapshot);
            return;
        }

        results.innerHTML = `<div class="flex items-center justify-center py-8 text-slate-400"><i class="fas fa-circle-notch fa-spin text-2xl mr-2"></i><span>กำลังค้นหา...</span></div>`;

        const grouped = {};
        const sourcesSnapshot = {};

        await Promise.all(this._sources.map(async (source) => {
            try {
                const items = await source.search(query);
                if (items && items.length > 0) {
                    grouped[source.id] = { source, items };
                    sourcesSnapshot[source.id] = items;
                }
            } catch (err) { console.warn(`Search "${source.id}" error:`, err); }
        }));

        if (query !== this._lastQuery) return;

        this._searchCache.set(cacheKey, { grouped, sourcesSnapshot, ts: Date.now() });
        if (this._searchCache.size > 20) {
            const first = this._searchCache.keys().next().value;
            this._searchCache.delete(first);
        }

        this._renderResults(results, grouped, sourcesSnapshot);
    },

    _renderResults(results, grouped, sourcesSnapshot) {
        const totalItems = Object.values(grouped).reduce((s, g) => s + g.items.length, 0);
        if (totalItems === 0) {
            results.innerHTML = `<div class="text-center py-12 text-slate-400"><i class="fas fa-face-frown text-4xl mb-3 text-slate-300"></i><p class="font-bold">ไม่พบผลลัพธ์</p></div>`;
            return;
        }

        let html = '';
        Object.values(grouped).forEach(({ source, items }) => {
            html += `<div class="mb-2">
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
                    </div>`).join('')}
            </div>`;
            source._lastItems = items;
        });
        results.innerHTML = html;

        results.querySelectorAll('.gs-item').forEach(el => {
            el.addEventListener('click', () => {
                this._selectItem(el.dataset.gsSource, parseInt(el.dataset.gsIdx, 10));
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
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }
};

// =====================================================
// 🔔 4) NOTIFICATION CENTER (OPTIMIZED)
// =====================================================
const NotificationCenter = {
    _open: false,
    _categories: {
        attendance: { label: 'การเช็คชื่อ', icon: 'fa-clipboard-user', color: '#2588e8' },
        leave: { label: 'การลา', icon: 'fa-envelope-open-text', color: '#f43f5e' },
        calendar: { label: 'ปฏิทิน', icon: 'fa-calendar-alt', color: '#8b5cf6' },
        student: { label: 'นักเรียน', icon: 'fa-user-graduate', color: '#a855f7' },
        system: { label: 'ระบบ', icon: 'fa-gear', color: '#64748b' },
        other: { label: 'อื่นๆ', icon: 'fa-circle-info', color: '#94a3b8' }
    },
    _items: [],
    _sources: [],
    _currentTab: 'all',

    // 🚀 Cache + state
    _cache: { data: null, ts: 0, ttl: 60000 },     // 60s TTL
    _prefetching: false,
    _lastFetchError: null,

    registerSource(source) {
        if (!source.id || typeof source.fetch !== 'function') return;
        this._sources = this._sources.filter(s => s.id !== source.id);
        this._sources.push(source);
        // 🚀 reset cache เมื่อมี source ใหม่
        this._cache.data = null;
    },

    add(notification) {
        if (!notification.id) notification.id = 'n-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
        notification.time = notification.time || new Date();
        notification.category = notification.category || 'other';
        const existingIdx = this._items.findIndex(i => i.id === notification.id);
        if (existingIdx >= 0) this._items[existingIdx] = notification;
        else this._items.push(notification);
    },

    remove(id) { this._items = this._items.filter(i => i.id !== id); this._updateBadge(); },
    clearAll() { this._items = []; this._sources = []; this._cache.data = null; this._updateBadge(); },

    markAllRead() {
        this._items.forEach(i => { i.read = true; });
        try { localStorage.setItem('wrk_notif_read', JSON.stringify(this._items.map(i => i.id))); } catch (e) { }
        this._updateBadge();
    },

    invalidateCache() {
        this._cache.data = null;
        this._cache.ts = 0;
    },

    _unreadCount() {
        let readIds = [];
        try { readIds = JSON.parse(localStorage.getItem('wrk_notif_read') || '[]'); } catch (e) { }
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

    // 🚀 Prefetch เบื้องหลัง — เรียกหลังบ้านเงียบๆ
    async prefetch() {
        if (this._prefetching) return;
        if (this._cache.data && (Date.now() - this._cache.ts) < this._cache.ttl) return;

        this._prefetching = true;
        const t0 = performance.now();
        try {
            await this._loadFromSources();
            this._cache = { data: [...this._items], ts: Date.now(), ttl: this._cache.ttl };
            this._updateBadge();
            console.log(`⚡ [NotifCenter] prefetch: ${Math.round(performance.now() - t0)}ms (${this._items.length} items)`);
        } catch (err) {
            this._lastFetchError = err;
            console.warn('NotifCenter prefetch error:', err);
        } finally {
            this._prefetching = false;
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

        // 🚀 ใช้ cache ถ้ายังไม่หมดอายุ
        const cacheValid = this._cache.data && (Date.now() - this._cache.ts) < this._cache.ttl;

        if (cacheValid) {
            // แสดงทันที + ตรวจ background
            this._render('all');
            this._updateBadge();
            // refresh เงียบๆ (ไม่ block UI)
            this._refreshInBackground();
        } else {
            await this._loadFromSources();
            this._cache = { data: [...this._items], ts: Date.now(), ttl: this._cache.ttl };
            this._render('all');
            this._updateBadge();
        }
    },

    // 🚀 refresh เบื้องหลังโดยไม่ block UI
    async _refreshInBackground() {
        try {
            await this.prefetch();
            // ถ้ามีการเปลี่ยนแปลง → re-render
            if (this._open) this._render(this._currentTab || 'all');
        } catch (e) { /* ignore */ }
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
                    <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center"><i class="fas fa-bell"></i></div>
                    <div class="flex-1">
                        <h3 class="font-black text-slate-800">การแจ้งเตือน</h3>
                        <p class="text-[11px] text-slate-400">รวมทุกโมดูลไว้ที่นี่</p>
                    </div>
                    <button onclick="NotificationCenter.markAllRead()" class="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1 rounded-lg hover:bg-indigo-50 transition-colors"><i class="fas fa-check-double mr-1"></i>อ่านทั้งหมด</button>
                    <button onclick="NotificationCenter.close()" class="h-8 w-8 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-500 text-slate-500 flex items-center justify-center transition-colors"><i class="fas fa-times"></i></button>
                </div>
                <div class="px-3 py-2 border-b border-slate-100 flex gap-1 overflow-x-auto scrollbar-hide" id="wrkNotifTabs"></div>
                <div id="wrkNotifList" class="overflow-y-auto flex-1 p-3"></div>
            </div>`;
        return modal;
    },

    // 🚀 เคลียร์ items ก่อน fetch เสมอ + parallel
    async _loadFromSources() {
        this._items = [];
        
        // ✅ [Fallback] ถ้ายังไม่มี currentProfile ให้ลองดึงจาก Session ตรงๆ
        if (!window.currentProfile && typeof db !== 'undefined') {
            try {
                const { data: { session } } = await db.auth.getSession();
                if (session?.user) {
                    const { data: personnel } = await db.from('core_personnel')
                        .select('id, prefix, first_name, last_name, role')
                        .eq('id', session.user.id)
                        .single();
                    if (personnel) {
                        window.currentProfile = personnel;
                        window.currentUserRole = personnel.role;
                        window.currentUser = session.user;
                        console.log('🔄 [NotifCenter] Fallback Auth: Set Global Variables สำเร็จ');
                    }
                }
            } catch (e) { 
                console.warn('Notif fallback auth error:', e); 
            }
        }

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

        const cats = ['all', ...Object.keys(this._categories)];
        tabsEl.innerHTML = cats.map(cat => {
            const meta = cat === 'all' ? { label: 'ทั้งหมด', icon: 'fa-list', color: '#6366f1' } : this._categories[cat];
            const count = cat === 'all' ? this._items.length : this._items.filter(i => i.category === cat).length;
            if (count === 0 && cat !== 'all') return '';
            const active = cat === tab;
            return `<button onclick="NotificationCenter._render('${cat}')"
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${active ? 'text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'}"
                style="${active ? `background:${meta.color};` : ''}">
                <i class="fas ${meta.icon}" style="color:${active ? '#fff' : meta.color};"></i>
                <span>${meta.label}</span>
                <span class="ml-1 px-1.5 py-0.5 rounded-full text-[9px] ${active ? 'bg-white/25' : 'bg-slate-200 text-slate-600'}">${count}</span>
            </button>`;
        }).join('');

        const items = tab === 'all' ? this._items : this._items.filter(i => i.category === tab);
        if (items.length === 0) {
            listEl.innerHTML = `<div class="text-center py-16 text-slate-400"><i class="fas fa-bell-slash text-4xl mb-3 text-slate-300"></i><p class="font-bold">ไม่มีการแจ้งเตือน</p><p class="text-xs mt-1">เมื่อมีเรื่องใหม่ ระบบจะแจ้งที่นี่</p></div>`;
            return;
        }

        items.sort((a, b) => new Date(b.time) - new Date(a.time));
        const grouped = {};
        items.forEach(i => {
            const c = i.category || 'other';
            if (!grouped[c]) grouped[c] = [];
            grouped[c].push(i);
        });

        let html = '';
        Object.entries(grouped).forEach(([cat, catItems]) => {
            const meta = this._categories[cat] || { label: cat, icon: 'fa-circle', color: '#94a3b8' };
            html += `<div class="mb-3">
                <div class="flex items-center gap-2 px-2 py-1 text-[10px] font-bold uppercase tracking-widest" style="color:${meta.color};">
                    <i class="fas ${meta.icon}"></i><span>${meta.label}</span><span class="ml-auto opacity-60">${catItems.length}</span>
                </div>
                ${catItems.map(n => this._renderItem(n)).join('')}
            </div>`;
        });
        listEl.innerHTML = html;

        listEl.querySelectorAll('[data-notif-action]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const notif = this._items.find(i => i.id === btn.dataset.notifId);
                const actionIdx = parseInt(btn.dataset.notifAction, 10);
                if (notif && notif.actions && notif.actions[actionIdx]) notif.actions[actionIdx].onclick?.();
            });
        });
    },

    _renderItem(n) {
        const meta = this._categories[n.category] || { color: '#94a3b8', icon: 'fa-circle' };
        const icon = n.icon || meta.icon;
        const color = n.color || meta.color;
        const timeAgo = this._timeAgo(n.time);
        const actionsHtml = (n.actions || []).map((a, i) => `<button data-notif-action="${i}" data-notif-id="${n.id}" class="text-[11px] font-bold px-2.5 py-1 rounded-lg transition-colors" style="background:${color}15; color:${color};">${a.label}</button>`).join('');

        return `<div class="flex gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors mb-1">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style="background:${color}15; color:${color};"><i class="fas ${icon}"></i></div>
            <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-2 mb-0.5">
                    <div class="font-bold text-slate-800 text-sm">${n.title || ''}</div>
                    <div class="text-[10px] text-slate-400 whitespace-nowrap">${timeAgo}</div>
                </div>
                ${n.description ? `<div class="text-xs text-slate-500 leading-relaxed">${n.description}</div>` : ''}
                ${actionsHtml ? `<div class="flex gap-2 mt-2">${actionsHtml}</div>` : ''}
            </div>
        </div>`;
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
    set(items) { this._items = Array.isArray(items) ? items : []; this._render(); },
    _render() {
        const el = document.getElementById('wrkBreadcrumb');
        if (!el) return;
        if (this._items.length === 0) { el.innerHTML = ''; el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        el.innerHTML = this._items.map((item, i) => {
            const isLast = i === this._items.length - 1;
            const content = isLast ? `<span class="font-bold text-slate-800">${item.label}</span>`
                : item.href ? `<a href="${item.href}" class="text-slate-500 hover:text-indigo-600 transition-colors font-medium">${item.label}</a>`
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
    _tasks: [], _checkInterval: null,
    register(task) {
        if (!task.id || typeof task.check !== 'function') return;
        this._tasks = this._tasks.filter(t => t.id !== task.id);
        this._tasks.push(task);
        this._ensureRunning();
    },
    _ensureRunning() {
        if (this._checkInterval) return;
        this._checkInterval = setInterval(() => this._runChecks(), 5 * 60 * 1000);
        setTimeout(() => this._runChecks(), 10000);
    },
    async _runChecks() {
        const now = new Date();
        for (const task of this._tasks) {
            try {
                if (task.hour !== undefined) {
                    if (now.getHours() !== task.hour || Math.abs(now.getMinutes() - (task.minute || 0)) > 4) continue;
                }
                const key = `wrk_reminder_${task.id}_${now.toISOString().split('T')[0]}`;
                if (localStorage.getItem(key)) continue;
                if (await task.check()) {
                    localStorage.setItem(key, '1');
                    if (typeof task.onRemind === 'function') task.onRemind();
                    else this._defaultRemind(task);
                }
            } catch (err) { console.warn(`AutoReminder "${task.id}" error:`, err); }
        }
    },
    _defaultRemind(task) {
        if (typeof Swal === 'undefined') return;
        Swal.fire({ toast: true, position: 'top-end', icon: task.icon || 'info', title: task.title || 'แจ้งเตือน', text: task.message || '', showConfirmButton: false, timer: 8000, timerProgressBar: true });
    }
};

// =====================================================
// 🎨 7) ICON ANIM
// =====================================================
const IconAnim = {
    _classes: ['anim-bounce', 'anim-shake', 'anim-pulse', 'anim-wiggle', 'anim-spin'],
    apply(element, type = 'bounce', duration = 600) {
        const el = typeof element === 'string' ? document.querySelector(element) : element;
        if (!el) return;
        const cls = `anim-${type}`;
        this._classes.forEach(c => el.classList.remove(c));
        void el.offsetWidth;
        el.classList.add(cls);
        setTimeout(() => el.classList.remove(cls), duration);
    },
    bounce(el) { this.apply(el, 'bounce'); },
    shake(el) { this.apply(el, 'shake'); },
    pulse(el) { this.apply(el, 'pulse'); },
    wiggle(el) { this.apply(el, 'wiggle'); }
};

// =====================================================
// ✅ HELPERS
// =====================================================
function formatThaiShort(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    const M = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${d.getDate()} ${M[d.getMonth()]} ${(d.getFullYear() + 543).toString().slice(-2)}`;
}

function formatThaiDayMonth(input) {
    if (!input) return '-';
    const d = (typeof dayjs !== 'undefined') ? dayjs(input) : new Date(input);
    const dateObj = (d.$d instanceof Date) ? d.$d : d;
    if (isNaN(dateObj.getTime())) return '-';
    const M = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `${dateObj.getDate()} ${M[dateObj.getMonth()]}`;
}

// 🚀 Cache head info 5 นาที
async function _getCachedHeadInfo(userId, type = 'leave') {
    const key = `wrk_${type}_head_${userId}`;
    try {
        const cached = sessionStorage.getItem(key);
        if (cached) {
            const { data, ts } = JSON.parse(cached);
            if (Date.now() - ts < 5 * 60 * 1000) return data;
        }
    } catch (e) { }
    const fetcher = type === 'leave' ? window.getDepartmentHeadInfo : window.getTripDeptHeadInfo;
    const data = fetcher ? await fetcher(userId) : null;
    try { sessionStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch (e) { }
    return data;
}

// 🚀 Cache system settings
async function _getCachedSystemSettings() {
    const key = 'wrk_sys_settings_cache';
    try {
        const cached = sessionStorage.getItem(key);
        if (cached) {
            const { data, ts } = JSON.parse(cached);
            if (Date.now() - ts < 5 * 60 * 1000) return data;
        }
    } catch (e) { }

    // ดึงทั้ง 2 โมดูลในครั้งเดียว
    let result = { leave: null, government_trip: null };
    try {
        const { data } = await db.from('core_system_modules')
            .select('module_id, settings')
            .in('module_id', ['leave', 'government_trip']);
        (data || []).forEach(m => { result[m.module_id] = m.settings || {}; });
    } catch (e) { console.warn('system settings cache error:', e); }

    try { sessionStorage.setItem(key, JSON.stringify({ data: result, ts: Date.now() })); } catch (e) { }
    return result;
}

// =====================================================
// 🚀 INIT EXTRAS
// =====================================================
async function initExtras() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); GlobalSearch.open(); }
        if (e.key === 'Escape') { GlobalSearch.close(); NotificationCenter.close(); }
    });

    if (typeof db === 'undefined') return;

    // ---------- Search Sources ----------
    GlobalSearch.registerSources([
        {
            id: 'students', label: 'นักเรียน', icon: 'fa-user-graduate', color: '#8b5cf6',
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
            id: 'personnel', label: 'ครู / บุคลากร', icon: 'fa-chalkboard-user', color: '#e11d48',
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
            id: 'menus', label: 'เมนู', icon: 'fa-bars', color: '#0ea5e9',
            search: async (q) => {
                const menus = [];
                document.querySelectorAll('.d-nav a[href], .d-nav a[onclick]').forEach(a => {
                    const label = a.querySelector('.d-label')?.textContent?.trim() || '';
                    if (label && label.toLowerCase().includes(q.toLowerCase())) {
                        const href = a.getAttribute('href');
                        const onclick = a.getAttribute('onclick');
                        menus.push({
                            id: a.id || `menu-${menus.length}`,
                            title: label, subtitle: href || 'กดเพื่อเข้าใช้งาน', icon: 'fa-arrow-right',
                            onSelect: () => { if (href) window.location.href = href; else if (onclick) eval(onclick); GlobalSearch.close(); }
                        });
                    }
                });
                return menus;
            }
        }
    ]);

    // =====================================================
    // 🔔 NOTIFICATION SOURCES — OPTIMIZED
    // =====================================================

    // ---------- 3.1) Birthday ----------
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
                    // ✅ เปรียบเทียบ MM-DD ตรงๆ — ไม่ผ่าน Timezone
                    const bdStr = String(p.birth_date).split('T')[0];
                    const parts = bdStr.split('-');
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

    // ---------- 3.2) LEAVE PENDING (OPTIMIZED) ----------
    NotificationCenter.registerSource({
        id: 'leave-pending',
        category: 'leave',
        fetch: async () => {
            const user = window.currentProfile || window.currentUser || null;
            const role = window.currentUserRole || '';
            if (!user?.id) return [];

            const isAdminRole = ['super_admin', 'admin', 'director', 'deputy'].includes(role);
            const isModuleAdmin = typeof WRKModuleAdmin !== 'undefined' && WRKModuleAdmin.has('leave');
            const academicPersonnelId = window.academicPersonnelId;

            // 🚀 EARLY EXIT: ดึง head info ครั้งเดียวก่อน
            const [headInfo, sysSettings] = await Promise.all([
                _getCachedHeadInfo(user.id, 'leave'),
                _getCachedSystemSettings()
            ]);

            const isHead = !!headInfo;
            const isAcademic = academicPersonnelId && user.id === academicPersonnelId;
            const isDirector = role === 'director' || role === 'super_admin';
            const isDeputy = role === 'deputy' || role === 'super_admin';

            // 🚀 ข้ามถ้าไม่มี role ไหนที่ต้องใช้เลย
            if (!isHead && !isAcademic && !isAdminRole && !isModuleAdmin && !isDirector && !isDeputy) {
                console.log('🔔 [leave-pending] skip — no relevant role');
                return [];
            }

            // 🚀 ดึง fiscal_year จาก cache
            let lvYear = sysSettings.leave?.fiscal_year;
            let lvRound = sysSettings.leave?.eval_round || '1';

            if (!lvYear) {
                const { data: latest } = await db.from('leave_requests')
                    .select('fiscal_year, eval_round')
                    .order('fiscal_year', { ascending: false })
                    .order('eval_round', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                lvYear = latest?.fiscal_year || String(new Date().getFullYear() + 543);
                lvRound = latest?.eval_round || '1';
            }

            // 🚀 รวม queries ทั้งหมดเป็น Promise.all
            const promises = [];

            // ---- head ----
            if (isHead) {
                promises.push(
                    db.from('leave_requests')
                        .select('id, type, total_days, is_half_day, start_date, end_date, ack_head, status, personnel_id, core_personnel!personnel_id(prefix, first_name, last_name, department, position)')
                        .neq('status', 'ไม่อนุมัติ')
                        .eq('ack_head', false)
                        .eq('fiscal_year', lvYear)
                        .eq('eval_round', lvRound)
                        .order('created_at', { ascending: false })
                        .limit(10)
                        .then(r => ({ key: 'head', data: r.data || [] }))
                );
            }

            // ---- academic ----
            if (isAcademic) {
                promises.push(
                    db.from('leave_requests')
                        .select('id, type, total_days, is_half_day, start_date, end_date, core_personnel!personnel_id(prefix, first_name, last_name, department, position)')
                        .neq('status', 'ไม่อนุมัติ')
                        .eq('ack_academic', false)
                        .eq('fiscal_year', lvYear)
                        .eq('eval_round', lvRound)
                        .order('created_at', { ascending: false })
                        .limit(5)
                        .then(r => ({ key: 'academic', data: r.data || [] }))
                );
            }

            // ---- admin ----
            if (isAdminRole || isModuleAdmin) {
                promises.push(
                    db.from('leave_requests')
                        .select('id, type, total_days, ack_head, ack_academic, core_personnel!personnel_id(prefix, first_name, last_name, department, position)')
                        .neq('status', 'ไม่อนุมัติ')
                        .eq('ack_admin', false)
                        .eq('fiscal_year', lvYear)
                        .eq('eval_round', lvRound)
                        .order('created_at', { ascending: false })
                        .limit(10)
                        .then(r => ({ key: 'admin', data: r.data || [] }))
                );
            }

            // ---- deputy ----
            if (isDeputy) {
                promises.push(
                    db.from('leave_requests')
                        .select('id, type, total_days, core_personnel!personnel_id(prefix, first_name, last_name)')
                        .neq('status', 'ไม่อนุมัติ')
                        .eq('ack_admin', true)
                        .eq('ack_deputy', false)
                        .eq('fiscal_year', lvYear)
                        .eq('eval_round', lvRound)
                        .order('created_at', { ascending: false })
                        .limit(5)
                        .then(r => ({ key: 'deputy', data: r.data || [] }))
                );
            }

            // ---- director ----
            if (isDirector) {
                promises.push(
                    db.from('leave_requests')
                        .select('id, type, total_days, ack_head, ack_academic, core_personnel!personnel_id(prefix, first_name, last_name, department, position)')
                        .eq('status', 'รออนุมัติ')
                        .eq('ack_admin', true)
                        .eq('ack_deputy', true)
                        .eq('fiscal_year', lvYear)
                        .eq('eval_round', lvRound)
                        .order('created_at', { ascending: false })
                        .limit(5)
                        .then(r => ({ key: 'director', data: r.data || [] }))
                );
            }

            const responses = await Promise.all(promises);
            const byKey = {};
            responses.forEach(r => { byKey[r.key] = r.data; });

            const results = [];
            const MAX_ITEMS = 5;

            // process head
            if (byKey.head?.length) {
                const valid = byKey.head.filter(l => {
                    if (l.core_personnel?.department !== headInfo.department_name) return false;
                    if (l.personnel_id === user.id) return false;
                    const allHeads = window.allDeptHeads || [headInfo];
                    const cat = window.getPersonnelCategory ? window.getPersonnelCategory(l, allHeads) : 'teacher';
                    return cat === 'teacher';
                });
                valid.slice(0, MAX_ITEMS).forEach(l => {
                    const name = `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`.trim();
                    const days = l.is_half_day ? 0.5 : l.total_days;
                    results.push({
                        id: `leave-head-${l.id}`,
                        category: 'leave',
                        title: `📋 รอรับทราบใบลา: ${name}`,
                        description: `${l.type} • ${days} วัน • ${formatThaiShort(l.start_date)} - ${formatThaiShort(l.end_date)}`,
                        icon: 'fa-user-check', color: '#a855f7', time: new Date(),
                        actions: [{ label: 'ไปที่หน้า', onclick: () => { window.location.href = 'leave_dept_head.html'; } }]
                    });
                });
            }

            // process academic
            (byKey.academic || []).slice(0, MAX_ITEMS).forEach(l => {
                const name = `${l.core_personnel.prefix || ''}${l.core_personnel.first_name} ${l.core_personnel.last_name}`.trim();
                results.push({
                    id: `leave-academic-${l.id}`,
                    category: 'leave',
                    title: `📋 รอรับทราบ (รองวิชาการ): ${name}`,
                    description: `${l.type} • ${l.total_days} วัน`,
                    icon: 'fa-user-graduate', color: '#f43f5e', time: new Date(),
                    actions: [{ label: 'ไปที่หน้า', onclick: () => { window.location.href = 'leave_admin.html'; } }]
                });
            });

            // process admin
            (byKey.admin || []).forEach(l => {
                const allHeads = window.allDeptHeads || [];
                const cat = window.getPersonnelCategory ? window.getPersonnelCategory(l, allHeads) : 'teacher';
                if (cat === 'teacher' && !l.ack_head) return;
                if (cat === 'head' && !l.ack_academic) return;
                const p = l.core_personnel || {};
                const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim();
                results.push({
                    id: `leave-admin-${l.id}`,
                    category: 'leave',
                    title: `📋 รอแอดมินรับทราบ: ${name}`,
                    description: `${l.type} • ${l.total_days} วัน`,
                    icon: 'fa-user-shield', color: '#14b8a6', time: new Date(),
                    actions: [{ label: 'ไปที่หน้า', onclick: () => { window.location.href = 'leave_admin.html'; } }]
                });
            });

            // process deputy
            (byKey.deputy || []).slice(0, MAX_ITEMS).forEach(l => {
                const p = l.core_personnel || {};
                const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim();
                results.push({
                    id: `leave-deputy-${l.id}`,
                    category: 'leave',
                    title: `📋 รอรอง ผอ.รับทราบ: ${name}`,
                    description: `${l.type} • ${l.total_days} วัน`,
                    icon: 'fa-user-tie', color: '#6366f1', time: new Date(),
                    actions: [{ label: 'ไปที่หน้า', onclick: () => { window.location.href = 'leave_admin.html'; } }]
                });
            });

            // process director
            (byKey.director || []).forEach(l => {
                const allHeads = window.allDeptHeads || [];
                const cat = window.getPersonnelCategory ? window.getPersonnelCategory(l, allHeads) : 'teacher';
                if (cat === 'teacher' && !l.ack_head) return;
                if (cat === 'head' && !l.ack_academic) return;
                const p = l.core_personnel || {};
                const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim();
                results.push({
                    id: `leave-director-${l.id}`,
                    category: 'leave',
                    title: `👑 รออนุมัติใบลา: ${name}`,
                    description: `${l.type} • ${l.total_days} วัน`,
                    icon: 'fa-crown', color: '#f59e0b', time: new Date(),
                    actions: [{ label: 'ไปอนุมัติ', onclick: () => { window.location.href = 'leave_admin.html'; } }]
                });
            });

            return results;
        }
    });

    // ---------- 3.3) TRIP PENDING (OPTIMIZED) ----------
    NotificationCenter.registerSource({
        id: 'trip-pending',
        category: 'other',
        fetch: async () => {
            const user = window.currentProfile || window.currentUser || null;
            const role = window.currentUserRole || '';
            if (!user?.id) return [];

            const isAdminRole = ['super_admin', 'admin', 'director', 'deputy'].includes(role);
            const isModuleAdmin = typeof WRKModuleAdmin !== 'undefined' && WRKModuleAdmin.has('government_trip');
            const academicPersonnelId = window.academicPersonnelId;

            const [headInfo, sysSettings] = await Promise.all([
                _getCachedHeadInfo(user.id, 'trip'),
                _getCachedSystemSettings()
            ]);

            const isHead = !!headInfo;
            const isAcademic = academicPersonnelId && user.id === academicPersonnelId;
            const isDirector = role === 'director' || role === 'super_admin';
            const isDeputy = role === 'deputy' || role === 'super_admin';

            if (!isHead && !isAcademic && !isAdminRole && !isModuleAdmin && !isDirector && !isDeputy) {
                return [];
            }

            let gvYear = sysSettings.government_trip?.fiscal_year;
            let gvRound = sysSettings.government_trip?.eval_round || '1';

            if (!gvYear) {
                const { data: latest } = await db.from('government_trip_requests')
                    .select('fiscal_year, eval_round')
                    .order('fiscal_year', { ascending: false })
                    .order('eval_round', { ascending: false })
                    .limit(1).maybeSingle();
                gvYear = latest?.fiscal_year || String(new Date().getFullYear() + 543);
                gvRound = latest?.eval_round || '1';
            }

            const promises = [];

            if (isHead) {
                promises.push(
                    db.from('government_trip_requests')
                        .select('id, title, purpose, trip_type, total_days, start_date, end_date, ack_head, status, personnel_id, core_personnel!personnel_id(prefix, first_name, last_name, department, position)')
                        .neq('status', 'ไม่อนุมัติ')
                        .eq('ack_head', false)
                        .eq('fiscal_year', gvYear).eq('eval_round', gvRound)
                        .order('created_at', { ascending: false }).limit(10)
                        .then(r => ({ key: 'head', data: r.data || [] }))
                );
            }
            if (isAcademic) {
                promises.push(
                    db.from('government_trip_requests')
                        .select('id, title, purpose, trip_type, total_days, core_personnel!personnel_id(prefix, first_name, last_name, department, position)')
                        .neq('status', 'ไม่อนุมัติ').eq('ack_academic', false)
                        .eq('fiscal_year', gvYear).eq('eval_round', gvRound)
                        .order('created_at', { ascending: false }).limit(5)
                        .then(r => ({ key: 'academic', data: r.data || [] }))
                );
            }
            if (isAdminRole || isModuleAdmin) {
                promises.push(
                    db.from('government_trip_requests')
                        .select('id, title, purpose, trip_type, total_days, ack_head, ack_academic, core_personnel!personnel_id(prefix, first_name, last_name, department, position)')
                        .neq('status', 'ไม่อนุมัติ').eq('ack_admin', false)
                        .eq('fiscal_year', gvYear).eq('eval_round', gvRound)
                        .order('created_at', { ascending: false }).limit(10)
                        .then(r => ({ key: 'admin', data: r.data || [] }))
                );
            }
            if (isDeputy) {
                promises.push(
                    db.from('government_trip_requests')
                        .select('id, title, purpose, trip_type, total_days, core_personnel!personnel_id(prefix, first_name, last_name)')
                        .neq('status', 'ไม่อนุมัติ').eq('ack_admin', true).eq('ack_deputy_hr', false)
                        .eq('fiscal_year', gvYear).eq('eval_round', gvRound)
                        .order('created_at', { ascending: false }).limit(5)
                        .then(r => ({ key: 'deputy', data: r.data || [] }))
                );
            }
            if (isDirector) {
                promises.push(
                    db.from('government_trip_requests')
                        .select('id, title, purpose, trip_type, total_days, ack_head, ack_academic, core_personnel!personnel_id(prefix, first_name, last_name, department, position)')
                        .eq('status', 'รออนุมัติ').eq('ack_admin', true).eq('ack_deputy_hr', true)
                        .eq('fiscal_year', gvYear).eq('eval_round', gvRound)
                        .order('created_at', { ascending: false }).limit(5)
                        .then(r => ({ key: 'director', data: r.data || [] }))
                );
            }

            const responses = await Promise.all(promises);
            const byKey = {};
            responses.forEach(r => { byKey[r.key] = r.data; });

            const results = [];
            const MAX_ITEMS = 5;

            if (byKey.head?.length) {
                const valid = byKey.head.filter(t => {
                    if (t.core_personnel?.department !== headInfo.department_name) return false;
                    if (t.personnel_id === user.id) return false;
                    const allHeads = window.allDeptHeads || [headInfo];
                    const cat = window.getTripPersonnelCategory ? window.getTripPersonnelCategory(t, allHeads) : 'teacher';
                    return cat === 'teacher';
                });
                valid.slice(0, MAX_ITEMS).forEach(t => {
                    const p = t.core_personnel || {};
                    const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim();
                    results.push({
                        id: `trip-head-${t.id}`, category: 'other',
                        title: `✈️ รอรับทราบใบไปราชการ: ${name}`,
                        description: `${t.purpose || t.trip_type || '-'} • ${t.total_days} วัน`,
                        icon: 'fa-user-check', color: '#a855f7', time: new Date(),
                        actions: [{ label: 'ไปที่หน้า', onclick: () => { window.location.href = 'government_trip_dept_head.html'; } }]
                    });
                });
            }
            (byKey.academic || []).slice(0, MAX_ITEMS).forEach(t => {
                const p = t.core_personnel || {};
                const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim();
                results.push({
                    id: `trip-academic-${t.id}`, category: 'other',
                    title: `✈️ รอรับทราบ (รองวิชาการ): ${name}`,
                    description: `${t.purpose || t.trip_type || '-'} • ${t.total_days} วัน`,
                    icon: 'fa-user-graduate', color: '#f43f5e', time: new Date(),
                    actions: [{ label: 'ไปที่หน้า', onclick: () => { window.location.href = 'government_trip_admin.html'; } }]
                });
            });
            (byKey.admin || []).forEach(t => {
                const allHeads = window.allDeptHeads || [];
                const cat = window.getTripPersonnelCategory ? window.getTripPersonnelCategory(t, allHeads) : 'teacher';
                if (cat === 'teacher' && !t.ack_head) return;
                if (cat === 'head' && !t.ack_academic) return;
                const p = t.core_personnel || {};
                const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim();
                results.push({
                    id: `trip-admin-${t.id}`, category: 'other',
                    title: `✈️ รอแอดมินรับทราบ: ${name}`,
                    description: `${t.purpose || t.trip_type || '-'} • ${t.total_days} วัน`,
                    icon: 'fa-user-shield', color: '#14b8a6', time: new Date(),
                    actions: [{ label: 'ไปที่หน้า', onclick: () => { window.location.href = 'government_trip_admin.html'; } }]
                });
            });
            (byKey.deputy || []).slice(0, MAX_ITEMS).forEach(t => {
                const p = t.core_personnel || {};
                const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim();
                results.push({
                    id: `trip-deputy-${t.id}`, category: 'other',
                    title: `✈️ รอรอง ผอ.บุคคลรับทราบ: ${name}`,
                    description: `${t.purpose || t.trip_type || '-'} • ${t.total_days} วัน`,
                    icon: 'fa-user-tie', color: '#6366f1', time: new Date(),
                    actions: [{ label: 'ไปที่หน้า', onclick: () => { window.location.href = 'government_trip_admin.html'; } }]
                });
            });
            (byKey.director || []).forEach(t => {
                const allHeads = window.allDeptHeads || [];
                const cat = window.getTripPersonnelCategory ? window.getTripPersonnelCategory(t, allHeads) : 'teacher';
                if (cat === 'teacher' && !t.ack_head) return;
                if (cat === 'head' && !t.ack_academic) return;
                const p = t.core_personnel || {};
                const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`.trim();
                results.push({
                    id: `trip-director-${t.id}`, category: 'other',
                    title: `👑 รออนุมัติใบไปราชการ: ${name}`,
                    description: `${t.purpose || t.trip_type || '-'} • ${t.total_days} วัน`,
                    icon: 'fa-crown', color: '#f59e0b', time: new Date(),
                    actions: [{ label: 'ไปอนุมัติ', onclick: () => { window.location.href = 'government_trip_admin.html'; } }]
                });
            });

            return results;
        }
    });

    // ---------- 3.4) ATTENDANCE REMINDER (OPTIMIZED) ----------
    NotificationCenter.registerSource({
        id: 'attendance-today',
        category: 'attendance',
        fetch: async () => {
            const user = window.currentProfile || window.currentUser || null;
            if (!user?.id) return [];

            const hour = new Date().getHours();
            const dow = new Date().getDay();

            // 🚀 EARLY EXIT ก่อน query อะไรทั้งสิ้น
            if (hour < 6 || hour >= 10) return [];
            if (dow === 0 || dow === 6) return [];

            // 🚀 เช็ค role คร่าวๆ — เฉพาะครู
            const role = window.currentUserRole || '';
            if (!['teacher', 'head_of_level', 'discipline_head', 'super_admin', 'admin'].includes(role)) return [];

            const today = new Date().toLocaleDateString('sv-SE');

            try {
                // 🚀 หา classroom + เช็ค attendance พร้อมกัน (parallel)
                const { data: classrooms } = await db.from('core_classrooms')
                    .select('id, grade_level, room_number')
                    .or(`adviser_id_1.eq.${user.id},adviser_id_2.eq.${user.id}`);

                if (!classrooms?.length) return [];

                // 🚀 query count ทุกห้องพร้อมกัน
                const counts = await Promise.all(
                    classrooms.map(cls =>
                        db.from('homeroom_attendance')
                            .select('*', { count: 'exact', head: true })
                            .eq('classroom_id', cls.id)
                            .eq('check_date', today)
                            .then(r => ({ cls, count: r.count || 0 }))
                    )
                );

                const results = [];
                counts.forEach(({ cls, count }) => {
                    if (count === 0) {
                        results.push({
                            id: `attendance-${cls.id}-${today}`,
                            category: 'attendance',
                            title: `📅 ยังไม่เช็คชื่อ: ม.${cls.grade_level}/${cls.room_number}`,
                            description: `กรุณาเช็คชื่อนักเรียนห้องนี้ก่อน 10:00 น.`,
                            icon: 'fa-clipboard-user',
                            color: '#2588e8',
                            time: new Date(),
                            actions: [{ label: 'ไปเช็คชื่อ', onclick: () => { window.location.href = 'attendance_teacher.html'; } }]
                        });
                    }
                });
                return results;
            } catch (err) {
                console.warn('🔔 attendance source error:', err);
                return [];
            }
        }
    });

    // =====================================================
    // 🚀 PREFETCH — โหลดล่วงหน้าเบื้องหลัง (ไม่ block UI)
    // =====================================================
    const doPrefetch = () => {
        // รอ currentProfile set ก่อน
        let attempts = 0;
        const tryPrefetch = () => {
            attempts++;
            if (window.currentProfile?.id || attempts > 20) {
                NotificationCenter.prefetch().catch(() => { });
                return;
            }
            setTimeout(tryPrefetch, 300);
        };
        tryPrefetch();
    };

    if ('requestIdleCallback' in window) {
        requestIdleCallback(doPrefetch, { timeout: 3000 });
    } else {
        setTimeout(doPrefetch, 1500);
    }

    console.log('✅ initExtras v2.2: Search + Notifications (Optimized) + Skeleton + Confetti + Breadcrumb + AutoReminder');
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
window.formatThaiShort = formatThaiShort;
window.formatThaiDayMonth = formatThaiDayMonth;

console.log('✅ dashboard_extras.js loaded (v2.2 OPTIMIZED)');