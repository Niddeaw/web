// ==========================================
// ไฟล์ calendar_admin.js (ระบบปฏิทินกิจกรรม)
// ==========================================

let currentUser = null;
let currentSchoolInfo = null;
let calendar;

// ตั้งค่า Google Calendar API (คุณครูต้องนำ API Key และ Calendar ID ของโรงเรียนมาใส่ตรงนี้)
const GOOGLE_CALENDAR_API_KEY = 'c_dc280d0a651d80f7cacaf303a76a64d84449aeee78152865dfbf0641635f2034@group.calendar.google.com';
const GOOGLE_CALENDAR_ID = 'th.th#holiday@group.v.calendar.google.com'; // ตัวอย่าง: วันหยุดไทย

window.onload = async () => {
    await checkAuth();
    initFlatpickr();
};

// ==========================================
// 1. ระบบตรวจสอบสิทธิ์ (RBAC - กฎเหล็ก 2 ชั้น)
// ==========================================
async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }

    const userId = session.user.id;
    currentUser = userId;

    // เช็คสิทธิ์จาก core_personnel
    const { data: profile } = await db.from('core_personnel').select('role').eq('id', userId).single();
    
    // เช็คว่าเป็น Super Admin หรือไม่
    let isAuthorized = false;
    if (profile && profile.role === 'super_admin') {
        isAuthorized = true;
    } else {
        // เช็คใน core_module_admins ว่าดูแลระบบ calendar_system หรือไม่
        const { data: moduleAdmin } = await db.from('core_module_admins')
            .select('id')
            .eq('user_id', userId)
            .eq('module_id', 'calendar_system')
            .single();
            
        if (moduleAdmin) isAuthorized = true;
    }

    if (!isAuthorized) {
        Swal.fire('ไม่มีสิทธิ์เข้าถึง', 'คุณไม่ใช่ผู้ดูแลระบบปฏิทิน', 'error').then(() => window.location.replace('index.html'));
        return;
    }

    // ผ่านการเช็คสิทธิ์ โหลดข้อมูลส่วนกลางต่อ
    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    await loadSchoolInfo();
    await initCalendar();
}

// ==========================================
// 2. โหลดข้อมูล Single Source of Truth
// ==========================================
async function loadSchoolInfo() {
    const { data, error } = await db.from('core_school_info').select('*').limit(1).single();
    if (error || !data) {
        Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลปีการศึกษาจากส่วนกลาง', 'error');
        return;
    }
    currentSchoolInfo = data;
    document.getElementById('currentTermText').innerText = `(ภาคเรียนที่ ${data.current_semester}/${data.current_academic_year})`;
}

// ==========================================
// 3. เริ่มต้น FullCalendar
// ==========================================
async function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'th',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listMonth'
        },
        themeSystem: 'standard',
        // ดึงกิจกรรมที่สร้างเองจาก Supabase
        events: fetchCustomEvents,
        // รวมปฏิทินจาก Google
        googleCalendarApiKey: GOOGLE_CALENDAR_API_KEY,
        eventSources: [
            {
                googleCalendarId: GOOGLE_CALENDAR_ID,
                className: 'bg-emerald-500 border-none text-white text-xs p-1 rounded', // จัด Style ให้ Google Events
            }
        ],
        eventClick: function(info) {
            info.jsEvent.preventDefault();
            Swal.fire({
                title: info.event.title,
                html: `<b>เริ่มต้น:</b> ${info.event.start.toLocaleString('th-TH')}<br>
                       <b>รายละเอียด:</b> ${info.event.extendedProps.description || 'ไม่มีรายละเอียด'}`,
                icon: 'info',
                confirmButtonColor: '#21BCFF'
            });
        }
    });

    calendar.render();
}

// ดึงข้อมูลกิจกรรมจาก Supabase (เพื่อโยนเข้า Calendar)
async function fetchCustomEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const { data, error } = await db.from('module_events')
            .select('*')
            .eq('academic_year', currentSchoolInfo.current_academic_year); // ดึงเฉพาะปีการศึกษาปัจจุบัน

        if (error) throw error;

        let events = data.map(ev => {
            let color = '#21BCFF'; // สีฟ้า (academic)
            if (ev.event_type === 'activity') color = '#f97316'; // สีส้ม
            if (ev.event_type === 'holiday') color = '#ef4444'; // สีแดง

            return {
                id: ev.id,
                title: ev.title,
                start: ev.start_date,
                end: ev.end_date,
                backgroundColor: color,
                borderColor: 'transparent',
                extendedProps: {
                    description: ev.description
                }
            };
        });

        successCallback(events);
    } catch (err) {
        console.error("Fetch Events Error:", err);
        failureCallback(err);
    }
}

// ==========================================
// 4. จัดการ Form & Modal
// ==========================================
function initFlatpickr() {
    flatpickr("#evStart", { enableTime: true, dateFormat: "Y-m-d H:i", locale: "th" });
    flatpickr("#evEnd", { enableTime: true, dateFormat: "Y-m-d H:i", locale: "th" });
}

function openEventModal() {
    document.getElementById('eventForm').reset();
    document.getElementById('eventModal').classList.remove('hidden');
}

function closeEventModal() {
    document.getElementById('eventModal').classList.add('hidden');
}

async function saveEvent(e) {
    e.preventDefault();
    
    const newEvent = {
        title: document.getElementById('evTitle').value,
        start_date: document.getElementById('evStart').value,
        end_date: document.getElementById('evEnd').value,
        event_type: document.getElementById('evType').value,
        description: document.getElementById('evDesc').value,
        academic_year: currentSchoolInfo.current_academic_year, // อิงจาก Single Source of Truth
        semester: currentSchoolInfo.current_semester,
        created_by: currentUser
    };

    if (new Date(newEvent.start_date) > new Date(newEvent.end_date)) {
        return Swal.fire('ข้อมูลไม่ถูกต้อง', 'วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น', 'warning');
    }

    try {
        const { error } = await db.from('module_events').insert([newEvent]);
        if (error) throw error;

        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
        closeEventModal();
        calendar.refetchEvents(); // รีเฟรชปฏิทินทันที
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}