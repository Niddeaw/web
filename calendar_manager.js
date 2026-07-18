// ==========================================
// calendar_manager.js (ฉบับสมบูรณ์ พร้อมฟังก์ชัน getEventsByMonthYear)
// ==========================================
// ==========================================
// calendar_manager.js (ปรับปรุงเล็กน้อย)
// เพิ่มการตรวจสอบ Super Admin ด้วย canManageSettings
// ==========================================
// ----------------------------------------------
// ระบบ Cache สำหรับ Google Calendar
// ----------------------------------------------
const googleCache = {
    data: null,
    timestamp: null,
    expiry: 5 * 60 * 1000, // 5 นาที

    set(data) {
        this.data = data;
        this.timestamp = Date.now();
    },

    get() {
        if (!this.data || !this.timestamp) return null;
        if (Date.now() - this.timestamp > this.expiry) {
            this.clear();
            return null;
        }
        return this.data;
    },

    clear() {
        this.data = null;
        this.timestamp = null;
    }
};

// ----------------------------------------------
// ฟังก์ชันดึงกิจกรรมจาก Google Calendar (พร้อม Cache)
// ----------------------------------------------
async function fetchGoogleCalendarEvents(calendarId, apiKey, startDate, endDate) {
    if (!calendarId || !apiKey) {
        console.warn("⚠️ ขาด Calendar ID หรือ API Key");
        return [];
    }

    const cacheKey = `${calendarId}_${startDate.toISOString()}_${endDate.toISOString()}`;
    const cached = googleCache.get();
    if (cached && cached.key === cacheKey) {
        console.log("📦 ใช้ข้อมูล Google Calendar จาก Cache");
        return cached.events;
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${startDate.toISOString()}&timeMax=${endDate.toISOString()}&singleEvents=true&orderBy=startTime`;
    console.log("🌐 Fetching Google Calendar:", url);

    try {
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) {
            console.error("❌ Google API error:", data);
            return [];
        }
        if (!data.items) return [];

        const events = data.items.map(item => {
            let start_date = null;
            let end_date = null;
            let isAllDay = false;

            if (item.start?.date) {
                start_date = item.start.date;
                isAllDay = true;
            } else if (item.start?.dateTime) {
                start_date = item.start.dateTime.split('T')[0];
            }

            if (item.end?.date) {
                end_date = item.end.date;
                isAllDay = true;
            } else if (item.end?.dateTime) {
                end_date = item.end.dateTime.split('T')[0];
            }

            if (isAllDay && start_date && end_date) {
                const start = new Date(start_date);
                const end = new Date(end_date);
                const diffDays = (end - start) / (1000 * 60 * 60 * 24);
                if (diffDays === 1) {
                    end_date = null;
                }
            }

            return {
                id: `google_${item.id}`,
                dept_key: 'academic',
                title: item.summary || 'ไม่มีชื่อกิจกรรม',
                description: item.description || '',
                start_date: start_date,
                end_date: end_date,
                source: 'google'
            };
        });

        googleCache.set({ key: cacheKey, events });
        return events;
    } catch (err) {
        console.error("❌ Google Calendar fetch error:", err);
        return [];
    }
}

// ----------------------------------------------
// ดึงกิจกรรมภายในระบบ (จาก calendar_events)
// ----------------------------------------------
async function fetchInternalEvents(deptKeys, startDate, endDate) {
    let query = db.from('calendar_events')
        .select('*')
        .eq('is_active', true)
        .gte('start_date', startDate.toISOString().split('T')[0])
        .lte('start_date', endDate.toISOString().split('T')[0]);

    if (deptKeys && deptKeys.length) {
        query = query.in('dept_key', deptKeys);
    }
    const { data, error } = await query;
    if (error) {
        console.error("❌ fetchInternalEvents error:", error);
        throw error;
    }
    return data.map(ev => ({ ...ev, source: 'internal' }));
}

// ----------------------------------------------
// ดึงกิจกรรมตามเดือน/ปี สำหรับ Admin (สามารถกรองกลุ่มได้)
// ----------------------------------------------
async function getEventsByMonthYearForAdmin(yearBE, monthIndex, deptFilter = '') {
    const yearCE = yearBE - 543;
    const startOfMonth = new Date(yearCE, monthIndex, 1);
    const endOfMonth = new Date(yearCE, monthIndex + 1, 0);

    const { data: configs, error: cfgErr } = await db.from('calendar_config').select('*');
    if (cfgErr) throw cfgErr;

    let allEvents = [];

    // 1. Google Calendar (academic)
    if (deptFilter === 'academic' || deptFilter === '') {
        const academicCfg = configs.find(c => c.dept_key === 'academic');
        if (academicCfg?.is_active && academicCfg.source_type === 'google' && academicCfg.google_calendar_id && academicCfg.google_api_key) {
            const googleEvents = await fetchGoogleCalendarEvents(
                academicCfg.google_calendar_id,
                academicCfg.google_api_key,
                startOfMonth,
                endOfMonth
            );
            allEvents.push(...googleEvents);
        }
    }

    // 2. Internal events
    let internalDepts = [];
    if (deptFilter === '') {
        internalDepts = configs.filter(c => c.is_active && c.dept_key !== 'academic').map(c => c.dept_key);
    } else if (deptFilter !== 'academic') {
        internalDepts = [deptFilter];
    }

    if (internalDepts.length) {
        const internalEvents = await fetchInternalEvents(internalDepts, startOfMonth, endOfMonth);
        allEvents.push(...internalEvents);
    }

    allEvents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return allEvents;
}

// ----------------------------------------------
// ฟังก์ชันสำหรับผู้ใช้ทั่วไป (ดึงทุกกลุ่มที่เปิดใช้งาน)
// ----------------------------------------------
async function getEventsByMonthYear(yearBE, monthIndex) {
    const yearCE = yearBE - 543;
    const startOfMonth = new Date(yearCE, monthIndex, 1);
    const endOfMonth = new Date(yearCE, monthIndex + 1, 0);

    const { data: configs, error: cfgErr } = await db.from('calendar_config').select('*');
    if (cfgErr) throw cfgErr;

    let allEvents = [];

    // 1. Google Calendar (academic)
    const academicCfg = configs.find(c => c.dept_key === 'academic');
    if (academicCfg?.is_active && academicCfg.source_type === 'google' && academicCfg.google_calendar_id && academicCfg.google_api_key) {
        const googleEvents = await fetchGoogleCalendarEvents(
            academicCfg.google_calendar_id,
            academicCfg.google_api_key,
            startOfMonth,
            endOfMonth
        );
        allEvents.push(...googleEvents);
    }

    // 2. Internal events (ทุกกลุ่มที่เปิดใช้งาน)
    const internalDepts = configs.filter(c => c.is_active && c.dept_key !== 'academic').map(c => c.dept_key);
    if (internalDepts.length) {
        const internalEvents = await fetchInternalEvents(internalDepts, startOfMonth, endOfMonth);
        allEvents.push(...internalEvents);
    }

    allEvents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return allEvents;
}

// ----------------------------------------------
// CRUD กิจกรรมภายในระบบ (Internal Events)
// ----------------------------------------------
async function createInternalEvent(eventData, userId) {
    const { data, error } = await db.from('calendar_events').insert({
        dept_key: eventData.dept_key,
        title: eventData.title,
        description: eventData.description,
        start_date: eventData.start_date,
        end_date: eventData.end_date || null,
        created_by: userId,
        is_active: true
    }).select().single();
    if (error) throw error;
    return data;
}

async function updateInternalEvent(eventId, eventData) {
    const { data, error } = await db.from('calendar_events')
        .update({
            title: eventData.title,
            description: eventData.description,
            start_date: eventData.start_date,
            end_date: eventData.end_date || null,
            updated_at: new Date()
        })
        .eq('id', eventId)
        .select().single();
    if (error) throw error;
    return data;
}

async function deleteInternalEvent(eventId) {
    const { error } = await db.from('calendar_events').delete().eq('id', eventId);
    if (error) throw error;
    return true;
}

async function getEventsByDept(deptKey, startDate = null, endDate = null) {
    let query = db.from('calendar_events')
        .select('*')
        .eq('dept_key', deptKey)
        .eq('is_active', true);
    if (startDate) query = query.gte('start_date', startDate);
    if (endDate) query = query.lte('start_date', endDate);
    query.order('start_date', { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

// ----------------------------------------------
// จัดการ Admin ประจำกลุ่ม
// ----------------------------------------------
async function addDeptAdmin(userId, deptKey) {
    const { error } = await db.from('calendar_dept_admins').insert({ user_id: userId, dept_key: deptKey });
    if (error) throw error;
}

async function removeDeptAdmin(userId, deptKey) {
    const { error } = await db.from('calendar_dept_admins').delete().match({ user_id: userId, dept_key: deptKey });
    if (error) throw error;
}

async function getDeptAdmins(deptKey) {
    const { data, error } = await db.from('calendar_dept_admins')
        .select('user_id, core_personnel(first_name, last_name)')
        .eq('dept_key', deptKey);
    if (error) throw error;
    return data;
}

// ----------------------------------------------
// จัดการ Admin ประจำกลุ่ม (ปรับปรุง)
// ----------------------------------------------
async function getUserManagedDepts(userId) {
    // ✅ ใช้ canManageSettings เพื่อตรวจสอบ Super Admin
    const { data: profile } = await db.from('core_personnel').select('role').eq('id', userId).single();
    if (profile && window.canManageSettings && window.canManageSettings(profile.role)) {
        return ['academic', 'budget', 'personnel', 'general'];
    }

    const { data, error } = await db.from('calendar_dept_admins').select('dept_key').eq('user_id', userId);
    if (error) return [];
    return data.map(d => d.dept_key);
}
// ----------------------------------------------
// ตั้งค่า Config (Super Admin)
// ----------------------------------------------
async function updateCalendarConfig(deptKey, updates) {
    const { error } = await db.from('calendar_config').update(updates).eq('dept_key', deptKey);
    if (error) throw error;
}

async function getCalendarConfig() {
    const { data, error } = await db.from('calendar_config').select('*');
    if (error) throw error;
    return data;
}

// ----------------------------------------------
// ฟังก์ชันช่วย: ล้างแคช Google
// ----------------------------------------------
function clearGoogleCache() {
    googleCache.clear();
    console.log("🗑️ Google Calendar Cache cleared");
}

// ----------------------------------------------
// ประกาศฟังก์ชันให้เป็น Global (สำหรับเรียกจาก HTML)
// ----------------------------------------------
window.getEventsByMonthYearForAdmin = getEventsByMonthYearForAdmin;
window.getEventsByMonthYear = getEventsByMonthYear;
window.createInternalEvent = createInternalEvent;
window.updateInternalEvent = updateInternalEvent;
window.deleteInternalEvent = deleteInternalEvent;
window.getUserManagedDepts = getUserManagedDepts;
window.clearGoogleCache = clearGoogleCache;
window.getEventsByDept = getEventsByDept;
window.fetchGoogleCalendarEvents = fetchGoogleCalendarEvents; // เผื่อไว้