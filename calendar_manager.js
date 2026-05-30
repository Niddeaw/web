// ==========================================
// calendar_manager.js
// จัดการปฏิทินกิจกรรม (Google Calendar + Internal Events)
// ==========================================

// ----------------------------------------------
// ฟังก์ชันดึงกิจกรรมจาก Google Calendar
// ----------------------------------------------
async function fetchGoogleCalendarEvents(calendarId, apiKey, startDate, endDate) {
    if (!calendarId || !apiKey) return [];
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
        return data.items.map(item => {
            let start_date = null;
            let end_date = null;
            let isAllDay = false;
            
            // ดึงวันที่เริ่มต้น
            if (item.start?.date) {
                start_date = item.start.date;
                isAllDay = true;
            } else if (item.start?.dateTime) {
                start_date = item.start.dateTime.split('T')[0];
            }
            
            // ดึงวันที่สิ้นสุด
            if (item.end?.date) {
                end_date = item.end.date;
                isAllDay = true;
            } else if (item.end?.dateTime) {
                end_date = item.end.dateTime.split('T')[0];
            }
            
            // ✅ แก้ไข: ถ้าเป็นกิจกรรมทั้งวัน (all-day) และ end_date มากกว่า start_date 1 วัน → ให้ถือว่าเป็นวันเดียว
            if (isAllDay && start_date && end_date) {
                const start = new Date(start_date);
                const end = new Date(end_date);
                const diffDays = (end - start) / (1000 * 60 * 60 * 24);
                if (diffDays === 1) {
                    end_date = null; // แสดงแค่วันเดียว
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
// รวมกิจกรรมทั้งหมดของเดือนปัจจุบัน (แสดงทุกกลุ่มที่เปิด)
// ----------------------------------------------
async function getCurrentMonthEvents() {
    console.log("🔍 getCurrentMonthEvents เริ่มทำงาน");
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    console.log("📅 ช่วงเวลา:", startOfMonth.toISOString(), "ถึง", endOfMonth.toISOString());
    
    // ดึงการตั้งค่าปฏิทินจาก Supabase
    const { data: configs, error: cfgErr } = await db.from('calendar_config').select('*');
    if (cfgErr) {
        console.error("❌ Error fetching calendar_config:", cfgErr);
        throw cfgErr;
    }
    console.log("📋 calendar_config:", configs);
    
    let allEvents = [];
    const activeDepts = configs.filter(c => c.is_active).map(c => c.dept_key);
    console.log("✅ Active depts:", activeDepts);
    
    // ดึงจาก Google Calendar (เฉพาะกลุ่ม academic)
    const academicCfg = configs.find(c => c.dept_key === 'academic');
    if (academicCfg && academicCfg.is_active && academicCfg.source_type === 'google' && academicCfg.google_calendar_id && academicCfg.google_api_key) {
        console.log("🌐 กำลังดึง Google Calendar...");
        const googleEvents = await fetchGoogleCalendarEvents(
            academicCfg.google_calendar_id,
            academicCfg.google_api_key,
            startOfMonth,
            endOfMonth
        );
        allEvents.push(...googleEvents);
        console.log(`📅 ได้ ${googleEvents.length} รายการจาก Google Calendar`);
    } else {
        console.warn("⚠️ Google Calendar ยังไม่ได้ตั้งค่าหรือปิดใช้งาน");
    }
    
    // ดึงจาก internal events (ทุกกลุ่มยกเว้น academic)
    const internalDepts = activeDepts.filter(d => d !== 'academic');
    if (internalDepts.length) {
        console.log("📦 กำลังดึง Internal events สำหรับกลุ่ม:", internalDepts);
        const internalEvents = await fetchInternalEvents(internalDepts, startOfMonth, endOfMonth);
        allEvents.push(...internalEvents);
        console.log(`📅 ได้ ${internalEvents.length} รายการจาก Internal`);
    }
    
    // เรียงตามวันที่เริ่ม
    allEvents.sort((a,b) => new Date(a.start_date) - new Date(b.start_date));
    console.log(`✅ รวมกิจกรรมทั้งหมด ${allEvents.length} รายการ`);
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

// ดึงรายการกิจกรรมของกลุ่มใดกลุ่มหนึ่ง (สำหรับ admin) - ไม่จำกัดเดือน
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

// ตรวจสอบว่าผู้ใช้มีสิทธิ์จัดการกลุ่มใดบ้าง (super_admin ได้ทุกกลุ่ม)
async function getUserManagedDepts(userId) {
    const { data: profile } = await db.from('core_personnel').select('role').eq('id', userId).single();
    if (profile?.role === 'super_admin') {
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

// เพิ่มใน calendar_manager.js (ต่อท้ายไฟล์)
async function getEventsByMonthYear(yearBE, monthIndex) {
    // แปลงปี พ.ศ. เป็น ค.ศ.
    const yearCE = yearBE - 543;
    const startOfMonth = new Date(yearCE, monthIndex, 1);
    const endOfMonth = new Date(yearCE, monthIndex + 1, 0);
    
    console.log(`📅 ดึงกิจกรรมสำหรับ ${startOfMonth.toLocaleDateString('th-TH')} - ${endOfMonth.toLocaleDateString('th-TH')}`);
    
    const { data: configs, error: cfgErr } = await db.from('calendar_config').select('*');
    if (cfgErr) throw cfgErr;
    
    let allEvents = [];
    const activeDepts = configs.filter(c => c.is_active).map(c => c.dept_key);
    
    // Google Calendar (academic)
    const academicCfg = configs.find(c => c.dept_key === 'academic');
    if (academicCfg && academicCfg.is_active && academicCfg.source_type === 'google' && academicCfg.google_calendar_id && academicCfg.google_api_key) {
        const googleEvents = await fetchGoogleCalendarEvents(
            academicCfg.google_calendar_id,
            academicCfg.google_api_key,
            startOfMonth,
            endOfMonth
        );
        allEvents.push(...googleEvents);
    }
    
    // Internal events
    const internalDepts = activeDepts.filter(d => d !== 'academic');
    if (internalDepts.length) {
        // ใช้ fetchInternalEvents เดิม แต่ปรับช่วงวันที่
        let query = db.from('calendar_events')
            .select('*')
            .eq('is_active', true)
            .gte('start_date', startOfMonth.toISOString().split('T')[0])
            .lte('start_date', endOfMonth.toISOString().split('T')[0]);
        if (internalDepts.length) query = query.in('dept_key', internalDepts);
        const { data, error } = await query;
        if (!error && data) {
            allEvents.push(...data.map(ev => ({ ...ev, source: 'internal' })));
        }
    }
    
    allEvents.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));
    return allEvents;
}