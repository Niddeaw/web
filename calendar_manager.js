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
    store: new Map(),          // เก็บแยกตามเดือน (key = calendarId_start_end)
    expiry: 5 * 60 * 1000,     // 5 นาที

    set(key, events) {
        this.store.set(key, { events, timestamp: Date.now() });
    },

    get(key) {
        const hit = this.store.get(key);
        if (!hit) return null;
        if (Date.now() - hit.timestamp > this.expiry) {
            this.store.delete(key);
            return null;
        }
        return hit.events;
    },

    clear() {
        this.store.clear();
    }
};

// ----------------------------------------------
// ตัวช่วยวันที่ (ใช้เวลาท้องถิ่น ไม่ใช้ toISOString เพราะเลื่อนวันถอยหลังในไทย UTC+7)
// ----------------------------------------------
function toLocalYMD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDaysYMD(ymd, days) {
    const [y, m, d] = ymd.split('-').map(Number);
    return toLocalYMD(new Date(y, m - 1, d + days));
}

// ----------------------------------------------
// ฟังก์ชันดึงกิจกรรมจาก Google Calendar (พร้อม Cache)
// ----------------------------------------------
// startDate = วันแรกของเดือน 00:00, endDate = วันสุดท้ายของเดือน (เวลาใดก็ได้)
async function fetchGoogleCalendarEvents(calendarId, apiKey, startDate, endDate) {
    if (!calendarId || !apiKey) {
        console.warn("⚠️ ขาด Calendar ID หรือ API Key");
        return [];
    }

    // timeMax ต้องเป็น "เที่ยงคืนของวันถัดจากวันสุดท้าย" ไม่เช่นนั้นกิจกรรมวันสุดท้ายของเดือนจะหาย
    const rangeStart = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    const rangeEnd = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1);

    const cacheKey = `${calendarId}_${toLocalYMD(rangeStart)}_${toLocalYMD(rangeEnd)}`;
    const cached = googleCache.get(cacheKey);
    if (cached) {
        console.log("📦 ใช้ข้อมูล Google Calendar จาก Cache");
        return cached;
    }

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${encodeURIComponent(rangeStart.toISOString())}&timeMax=${encodeURIComponent(rangeEnd.toISOString())}&singleEvents=true&orderBy=startTime&maxResults=250`;
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

            if (item.start?.date) {
                start_date = item.start.date;
            } else if (item.start?.dateTime) {
                start_date = toLocalYMD(new Date(item.start.dateTime));
            }

            if (item.end?.date) {
                // all-day: Google ให้วันสิ้นสุดแบบ "ไม่รวมวันนั้น" ต้องลดลง 1 วัน
                end_date = addDaysYMD(item.end.date, -1);
            } else if (item.end?.dateTime) {
                end_date = toLocalYMD(new Date(item.end.dateTime));
            }

            if (!end_date || end_date <= start_date) end_date = null;

            return {
                id: `google_${item.id}`,
                dept_key: 'academic',
                title: item.summary || 'ไม่มีชื่อกิจกรรม',
                description: item.description || '',
                start_date: start_date,
                end_date: end_date,
                source: 'google'
            };
        }).filter(ev => ev.start_date);

        googleCache.set(cacheKey, events);
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
    const monthStart = toLocalYMD(startDate);
    const monthEnd = toLocalYMD(endDate);

    // กิจกรรมที่ทับซ้อนกับเดือนนี้: เริ่มก่อนสิ้นเดือน และ (จบหลังต้นเดือน หรือไม่มีวันจบแล้วเริ่มในเดือน)
    let query = db.from('calendar_events')
        .select('*')
        .eq('is_active', true)
        .lte('start_date', monthEnd)
        .or(`end_date.gte.${monthStart},and(end_date.is.null,start_date.gte.${monthStart})`);

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

    allEvents.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
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

    allEvents.sort((a, b) => String(a.start_date).localeCompare(String(b.start_date)));
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
    query = query.order('start_date', { ascending: true });
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