// ==========================================
// calendar_admin.js (ปรับใช้ config.js ฉบับใหม่)
// - ใช้ checkSessionAndRole() แทน checkAuth() เดิม
// - ใช้ hasModuleAccess() และ canManageSettings() ตรวจสอบสิทธิ์
// - ใช้ logUserAction() บันทึกประวัติ
// - ใช้ requireAdmin() สำหรับการกระทำที่ต้องเป็น Admin
// ==========================================

let currentUser = null;
let currentRole = '';
let isAdmin = false;
let currentSchoolInfo = null;
let calendar;

// ตั้งค่า Google Calendar API
const GOOGLE_CALENDAR_API_KEY = 'c_dc280d0a651d80f7cacaf303a76a64d84449aeee78152865dfbf0641635f2034@group.calendar.google.com';
const GOOGLE_CALENDAR_ID = 'th.th#holiday@group.v.calendar.google.com';

// ==========================================
// 1. เริ่มต้น (ใช้ checkSessionAndRole)
// ==========================================
window.onload = async () => {
    try {
        // 1. ตรวจสอบเซสชันและสิทธิ์ด้วย config.js
        const session = await checkSessionAndRole('ระบบปฏิทิน (Admin)', ['super_admin', 'admin', 'staff']);
        if (!session) return;

        const { user, personnel, role, isAdmin: sessionIsAdmin } = session;
        currentUser = user;
        currentRole = role;
        isAdmin = sessionIsAdmin || isAdminUser(role, false);

        // 2. ตรวจสอบสิทธิ์เข้าโมดูล (calendar_system)
        if (!isAdmin) {
            const hasAccess = await hasModuleAccess(role, 'calendar_system', user.id);
            if (!hasAccess) {
                await Swal.fire({
                    icon: 'warning',
                    title: 'ไม่มีสิทธิ์เข้าใช้งาน',
                    text: 'คุณไม่ได้รับอนุญาตให้ใช้ระบบจัดการปฏิทิน',
                    confirmButtonText: 'กลับหน้าหลัก'
                });
                window.location.href = 'index.html';
                return;
            }
        }

        // 3. ตรวจสอบว่ามีสิทธิ์ตั้งค่าระบบ (super_admin เท่านั้น)
        const hasSettings = canManageSettings(role);
        // เก็บไว้ใช้แสดงปุ่มตั้งค่า (ถ้ามีในอนาคต)

        // 4. บันทึก Log การเข้าใช้งาน
        await logUserAction('เข้าสู่ระบบจัดการปฏิทิน', 'calendar');

        // 5. โหลดข้อมูลโรงเรียน
        await loadSchoolInfo();

        // 6. เริ่มต้น FullCalendar
        await initCalendar();

        // 7. ตั้งค่า Flatpickr
        initFlatpickr();

        // 8. แสดงบทบาท
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');

        console.log('✅ Calendar Admin initialized successfully');

    } catch (err) {
        console.error('Initialization error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message || 'ไม่สามารถเริ่มระบบได้', 'error');
    }
};

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
    if (!calendarEl) return;

    calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: 'dayGridMonth',
        locale: 'th',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listMonth'
        },
        themeSystem: 'standard',
        events: fetchCustomEvents,
        googleCalendarApiKey: GOOGLE_CALENDAR_API_KEY,
        eventSources: [
            {
                googleCalendarId: GOOGLE_CALENDAR_ID,
                className: 'bg-emerald-500 border-none text-white text-xs p-1 rounded',
            }
        ],
        eventClick: function (info) {
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

// ดึงข้อมูลกิจกรรมจาก Supabase
async function fetchCustomEvents(fetchInfo, successCallback, failureCallback) {
    try {
        const { data, error } = await db.from('module_events')
            .select('*')
            .eq('academic_year', currentSchoolInfo.current_academic_year);

        if (error) throw error;

        let events = data.map(ev => {
            let color = '#21BCFF';
            if (ev.event_type === 'activity') color = '#f97316';
            if (ev.event_type === 'holiday') color = '#ef4444';

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
        academic_year: currentSchoolInfo.current_academic_year,
        semester: currentSchoolInfo.current_semester,
        created_by: currentUser.id
    };

    if (new Date(newEvent.start_date) > new Date(newEvent.end_date)) {
        return Swal.fire('ข้อมูลไม่ถูกต้อง', 'วันสิ้นสุดต้องอยู่หลังวันเริ่มต้น', 'warning');
    }

    try {
        const { error } = await db.from('module_events').insert([newEvent]);
        if (error) throw error;

        await logUserAction(`เพิ่มกิจกรรม "${newEvent.title}"`, 'calendar');
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
        closeEventModal();
        calendar.refetchEvents();
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// 5. ออกจากระบบ (ใช้ฟังก์ชันจาก config.js)
// ==========================================
async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        text: "คุณต้องการออกจากระบบใช่หรือไม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace("login.html");
    }
}

// ประกาศฟังก์ชัน global
window.openEventModal = openEventModal;
window.closeEventModal = closeEventModal;
window.saveEvent = saveEvent;
window.logout = logout;

console.log('✅ calendar_admin.js loaded with config.js integration');