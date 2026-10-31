// =======================================================
// schedule.js — ตารางสอน + Telegram Notifications (ฉบับสมบูรณ์)
// =======================================================

const PERIODS = [
    { no: 1, start: '08:30', end: '09:20' },
    { no: 2, start: '09:20', end: '10:10' },
    { no: 3, start: '10:10', end: '11:00' },
    { no: 4, start: '11:00', end: '11:50' },
    { no: 5, start: '11:30', end: '12:40' },
    { no: 6, start: '12:40', end: '13:30' },
    { no: 7, start: '13:30', end: '14:20' },
    { no: 8, start: '14:20', end: '15:10' },
    { no: 9, start: '15:10', end: '16:00' }
];

const DAYS = [
    { no: 1, name: 'จันทร์', short: 'จ.' },
    { no: 2, name: 'อังคาร', short: 'อ.' },
    { no: 3, name: 'พุธ', short: 'พ.' },
    { no: 4, name: 'พฤหัสบดี', short: 'พฤ.' },
    { no: 5, name: 'ศุกร์', short: 'ศ.' }
];

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#f97316', '#ef4444', '#14b8a6'];

// ===== State =====
let currentUser = null;
let actualRole = '';
let isSuperAdmin = false;
let isTeacher = false;
let viewingTeacherId = null;
let allTeachers = [];
let subjects = [];
let slots = [];
let settings = null;
let currentRoomFilter = 'all';
let selectedSubjectId = null;
let notifTimer = null;
let isReadOnlyMode = false;
let _sentPerPeriodKeys = new Set();

// =======================================================
// HELPER: Format Location (ห้อง/กลุ่ม)
// =======================================================
function formatLocation(grade, room, teachRoom) {
    if (!grade) return '';
    let loc = '';
    const gStr = String(grade).trim();
    
    // ตรวจสอบว่าเป็นตัวเลข 1-6 หรือไม่
    if (/^[1-6]$/.test(gStr)) {
        loc = `ม.${gStr}/${room || ''}`;
    } else if (gStr === 'กลุ่ม') {
        loc = room ? `กลุ่ม ${room}` : 'กลุ่ม';
    } else {
        // กรณี ม.ต้น, ม.ปลาย
        loc = room ? `${gStr}/${room}` : gStr;
    }

    if (teachRoom) {
        loc += ` (${teachRoom})`;
    }
    return loc;
}

// =======================================================
// INIT
// =======================================================
$(document).ready(async () => {
    try {
        const session = await checkSessionAndRole('ตารางสอน', ['super_admin', 'admin', 'teacher']);
        if (!session) return;

        currentUser = session.personnel;
        actualRole = session.role;
        isSuperAdmin = WRK_ROLES.ADMIN.includes(actualRole);
        isTeacher = actualRole === 'teacher';

        if (!isSuperAdmin && !isTeacher) {
            await Swal.fire('ไม่มีสิทธิ์', 'ระบบนี้ใช้ได้เฉพาะครูผู้สอน และผู้ดูแลระบบ', 'error');
            window.location.href = 'index.html';
            return;
        }

        if (typeof setUserDisplayName === 'function') setUserDisplayName(currentUser);
        if (typeof updateUserRoleLabel === 'function') updateUserRoleLabel(actualRole);
        if (typeof renderUserAvatar === 'function') renderUserAvatar(currentUser);

        viewingTeacherId = currentUser.id;

        if (isSuperAdmin) {
            document.getElementById('admin-teacher-panel').classList.remove('hidden');
            await loadAllTeachers();
        }

        await loadSettings();
        await loadAllData();
        renderGrid();
        renderPalette();
        updateRoomFilter();
        updateSummaryBadge();

        startNotificationTimer();
        console.log('✅ Schedule module ready');
    } catch (err) {
        console.error('Init error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    } finally {
        document.getElementById('mainBody')?.classList.replace('opacity-0', 'opacity-100');
    }
});

// =======================================================
// ADMIN: Load All Teachers
// =======================================================
async function loadAllTeachers() {
    const { data, error } = await db.from('core_personnel')
        .select('id, prefix, first_name, last_name, department')
        .in('role', ['teacher', 'admin', 'super_admin', 'director', 'deputy'])
        .order('first_name');
    if (error) { console.warn(error); return; }
    allTeachers = data || [];

    const sel = document.getElementById('admin-teacher-select');
    sel.innerHTML = allTeachers.map(t =>
        `<option value="${t.id}">${t.prefix || ''}${t.first_name} ${t.last_name}${t.department ? ' · ' + t.department : ''}</option>`
    ).join('');
    sel.value = currentUser.id;

    sel.addEventListener('change', async () => {
        viewingTeacherId = sel.value;
        isReadOnlyMode = false;
        await loadAllData();
        renderGrid();
        renderPalette();
        updateRoomFilter();
        updateSummaryBadge();
    });
}

// =======================================================
// Load Data
// =======================================================
async function loadAllData() {
    const [subjRes, slotRes, setRes] = await Promise.all([
        db.from('module_schedule_subjects').select('*').eq('teacher_id', viewingTeacherId).order('display_order').order('created_at'),
        db.from('module_schedule_slots').select('*').eq('teacher_id', viewingTeacherId),
        db.from('module_schedule_settings').select('*').eq('teacher_id', viewingTeacherId).maybeSingle()
    ]);
    subjects = subjRes.data || [];
    slots = slotRes.data || [];
    settings = setRes.data || null;
    if (subjRes.error) console.error(subjRes.error);
    if (slotRes.error) console.error(slotRes.error);
}

async function loadSettings() {
    const { data } = await db.from('module_schedule_settings')
        .select('*').eq('teacher_id', currentUser.id).maybeSingle();
    if (data) {
        settings = data;
    } else {
        const defaults = {
            teacher_id: currentUser.id,
            notifications_enabled: false,
            summary_time: '06:00',
            per_period_enabled: false,
            per_period_minutes: 5
        };
        await db.from('module_schedule_settings').insert(defaults);
        settings = defaults;
    }
}

// =======================================================
// Render Grid (Horizontal Periods)
// =======================================================
function renderGrid() {
    const grid = document.getElementById('schedule-grid');
    let html = '';

    // ----- Header Row (วัน / คาบ) -----
    html += `<div class="day-label" style="background:#e2e8f0; color:#334155;">วัน / คาบ</div>`;
    
    PERIODS.forEach(p => {
        html += `<div class="grid-header">
            <div>คาบ ${p.no}</div>
            <div style="font-size:9px; font-weight:normal; opacity:0.9;">${p.start}-${p.end}</div>
        </div>`;
    });

    // ----- Data Rows (วันจันทร์ - ศุกร์) -----
    DAYS.forEach(d => {
        html += `<div class="day-label">${d.name}</div>`; // ชื่อวัน
        
        PERIODS.forEach(p => {
            const slot = slots.find(s => s.day_of_week === d.no && s.period === p.no);
            const subject = slot ? subjects.find(s => s.id === slot.subject_id) : null;

            if (subject) {
                const roomLabel = formatLocation(subject.grade_level, subject.room_number, '');
                const fullLoc = formatLocation(subject.grade_level, subject.room_number, subject.teaching_room);
                
                if (currentRoomFilter !== 'all' && roomLabel !== currentRoomFilter) {
                    // ช่องของห้องอื่น (ถ้าใช้ตัวกรอง)
                    html += `<div class="grid-cell" data-day="${d.no}" data-period="${p.no}" ondragover="onCellDragOver(event)" ondragleave="onCellDragLeave(event)" ondrop="onCellDrop(event)" onclick="onEmptyCellClick(event)">
                        <div style="opacity:.35;text-align:center;font-size:10px;color:#94a3b8;padding-top:20px;">
                            <i class="fas fa-lock"></i><br>${roomLabel}
                        </div>
                    </div>`;
                } else {
                    // ช่องที่มีวิชา
                    html += `<div class="grid-cell has-slot" data-day="${d.no}" data-period="${p.no}" style="background:${subject.color};border-color:${subject.color};" onclick="removeSlot('${slot.id}', event)">
                        <div class="slot-block" title="${escapeHtml(subject.subject_name)}\nสถานที่: ${fullLoc}">
                            <div class="subj-code">${escapeHtml(subject.subject_code)}</div>
                            <div class="subj-name">${escapeHtml(subject.subject_name)}</div>
                            <div class="subj-room">📍 ${fullLoc}</div>
                        </div>
                    </div>`;
                }
            } else {
                // ช่องว่าง
                html += `<div class="grid-cell" data-day="${d.no}" data-period="${p.no}" ondragover="onCellDragOver(event)" ondragleave="onCellDragLeave(event)" ondrop="onCellDrop(event)" onclick="onEmptyCellClick(event)"></div>`;
            }
        });
    });

    grid.innerHTML = html;
}

// =======================================================
// Render Palette
// =======================================================
function renderPalette() {
    const palette = document.getElementById('subject-palette');
    if (!subjects.length) {
        palette.innerHTML = `<div class="text-center text-slate-400 py-10">
            <i class="fas fa-book-open text-3xl mb-2 text-slate-300"></i>
            <p class="text-xs font-bold">ยังไม่มีรายวิชา</p>
            <p class="text-[10px] mt-1">กดปุ่ม <b>+</b> เพื่อเพิ่มวิชาแรก</p>
        </div>`;
        return;
    }

    const filtered = currentRoomFilter === 'all'
        ? subjects
        : subjects.filter(s => formatLocation(s.grade_level, s.room_number, '') === currentRoomFilter);

    if (!filtered.length) {
        palette.innerHTML = `<div class="text-center text-slate-400 py-8 text-xs">ไม่มีวิชาในห้องนี้</div>`;
        return;
    }

    palette.innerHTML = filtered.map(s => {
        const used = slots.filter(sl => sl.subject_id === s.id).length;
        const isUsedUp = used >= s.total_periods;
        const fullLoc = formatLocation(s.grade_level, s.room_number, s.teaching_room);
        const isSelected = selectedSubjectId === s.id;
        
        return `<div class="subj-card ${isUsedUp ? 'used-up' : ''} ${isSelected ? 'selected' : ''}"
                     draggable="${!isUsedUp}" data-subject-id="${s.id}"
                     ondragstart="onSubjectDragStart(event)" ondragend="onSubjectDragEnd(event)"
                     onclick="selectSubject('${s.id}', event)">
            <div class="color-bar" style="background:${s.color};"></div>
            <div class="info">
                <div class="code">${escapeHtml(s.subject_code)}</div>
                <div class="name" title="${escapeHtml(s.subject_name)}">${escapeHtml(s.subject_name)}</div>
                <div class="meta">
                    <span><i class="fas fa-door-open"></i> ${fullLoc}</span>
                    <span style="color:${isUsedUp ? '#f43f5e' : '#10b981'};font-weight:700;">
                        ${used}/${s.total_periods} คาบ
                    </span>
                </div>
            </div>
            <div class="actions" onclick="event.stopPropagation()">
                <button onclick="copySubjectToRooms('${s.id}', event)" class="bg-blue-50 text-blue-600 hover:bg-blue-100" title="คัดลอกไปห้องอื่น"><i class="fas fa-copy"></i></button>
                <button onclick="editSubject('${s.id}')" class="bg-amber-50 text-amber-600 hover:bg-amber-100" title="แก้ไข"><i class="fas fa-pen"></i></button>
                <button onclick="deleteSubject('${s.id}')" class="bg-rose-50 text-rose-600 hover:bg-rose-100" title="ลบ"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
    }).join('');
}

// =======================================================
// Room Filter
// =======================================================
function updateRoomFilter() {
    const sel = document.getElementById('room-filter');
    // ใช้ formatLocation ในการดึงชื่อห้อง เพื่อให้แสดงผลได้ถูกต้อง (เช่น กลุ่ม บริหารวิชาการ)
    const rooms = [...new Set(subjects.map(s => formatLocation(s.grade_level, s.room_number, '')))].sort();
    
    sel.innerHTML = `<option value="all">ทุกห้อง / กลุ่ม</option>` +
        rooms.map(r => `<option value="${r}">${r}</option>`).join('');
        
    if (currentRoomFilter !== 'all' && !rooms.includes(currentRoomFilter)) currentRoomFilter = 'all';
    sel.value = currentRoomFilter;
    sel.onchange = () => {
        currentRoomFilter = sel.value;
        selectedSubjectId = null;
        renderGrid();
        renderPalette();
    };
}

function updateSummaryBadge() {
    const totalPeriods = subjects.reduce((s, x) => s + x.total_periods, 0);
    const placed = slots.length;
    const el = document.getElementById('schedule-summary');
    if (el) el.innerHTML = `<i class="fas fa-calendar-check mr-1"></i> วางแล้ว ${placed}/${totalPeriods} คาบ · ${subjects.length} วิชา`;
}

// =======================================================
// Drag & Drop
// =======================================================
let draggingSubjectId = null;

function onSubjectDragStart(e) {
    const card = e.target.closest('.subj-card');
    if (!card) return;
    const id = card.dataset.subjectId;
    const subject = subjects.find(s => s.id === id);
    const used = slots.filter(s => s.subject_id === id).length;
    if (!subject || used >= subject.total_periods) {
        e.preventDefault();
        return;
    }
    draggingSubjectId = id;
    card.classList.add('dragging');
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'copy';
}

function onSubjectDragEnd(e) {
    e.target.closest('.subj-card')?.classList.remove('dragging');
    draggingSubjectId = null;
    document.querySelectorAll('.grid-cell.drag-over').forEach(c => c.classList.remove('drag-over'));
}

function onCellDragOver(e) {
    if (!draggingSubjectId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    e.currentTarget.classList.add('drag-over');
}

function onCellDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

async function onCellDrop(e) {
    e.preventDefault();
    const cell = e.currentTarget;
    cell.classList.remove('drag-over');
    const subjectId = e.dataTransfer.getData('text/plain') || draggingSubjectId;
    if (!subjectId) return;
    const day = parseInt(cell.dataset.day);
    const period = parseInt(cell.dataset.period);
    await placeSlot(subjectId, day, period);
}

// =======================================================
// Click-to-Place
// =======================================================
function selectSubject(id, event) {
    if (event) event.stopPropagation();
    const subject = subjects.find(s => s.id === id);
    if (!subject) return;
    const used = slots.filter(s => s.subject_id === id).length;
    if (used >= subject.total_periods) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: 'วิชานี้วางครบแล้ว', timer: 1500, showConfirmButton: false });
    }
    selectedSubjectId = selectedSubjectId === id ? null : id;
    renderPalette();
}

async function onEmptyCellClick(e) {
    if (!selectedSubjectId) return;
    const cell = e.currentTarget;
    if (cell.classList.contains('has-slot')) return;
    const day = parseInt(cell.dataset.day);
    const period = parseInt(cell.dataset.period);
    await placeSlot(selectedSubjectId, day, period);
    selectedSubjectId = null;
    renderPalette();
}

// =======================================================
// Place / Remove Slot
// =======================================================
async function placeSlot(subjectId, day, period) {
    const subject = subjects.find(s => s.id === subjectId);
    if (!subject) return;

    const used = slots.filter(s => s.subject_id === subjectId).length;
    if (used >= subject.total_periods) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: `วิชานี้วางครบ ${subject.total_periods} คาบแล้ว`, timer: 1800, showConfirmButton: false });
    }

    const existing = slots.find(s => s.day_of_week === day && s.period === period);
    if (existing) {
        return Swal.fire({ toast: true, position: 'top-end', icon: 'warning', title: 'ช่องนี้มีวิชาอื่นอยู่แล้ว', timer: 1800, showConfirmButton: false });
    }

    const { data, error } = await db.from('module_schedule_slots').insert({
        teacher_id: viewingTeacherId,
        subject_id: subjectId,
        day_of_week: day,
        period: period
    }).select().single();

    if (error) {
        return Swal.fire('ผิดพลาด', error.message, 'error');
    }

    slots.push(data);
    renderGrid();
    renderPalette();
    updateSummaryBadge();

    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 900 })
        .fire({ icon: 'success', title: 'วางวิชาแล้ว (บันทึกอัตโนมัติ)' });
}

async function removeSlot(slotId, event) {
    if (event) event.stopPropagation();
    const slot = slots.find(s => s.id === slotId);
    if (!slot) return;
    const subject = subjects.find(s => s.id === slot.subject_id);
    const confirm = await Swal.fire({
        icon: 'warning',
        title: 'ลบวิชาออกจากตาราง?',
        html: `<div class="text-sm">${escapeHtml(subject?.subject_code || '')} ${escapeHtml(subject?.subject_name || '')}<br>
               <span class="text-xs text-slate-500">วัน${DAYS.find(d => d.no === slot.day_of_week)?.name} คาบ ${slot.period}</span></div>`,
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบออก',
        cancelButtonText: 'ยกเลิก'
    });
    if (!confirm.isConfirmed) return;

    const { error } = await db.from('module_schedule_slots').delete().eq('id', slotId);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    slots = slots.filter(s => s.id !== slotId);
    renderGrid();
    renderPalette();
    updateSummaryBadge();
    Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 900 })
        .fire({ icon: 'success', title: 'ลบวิชาออกแล้ว (คืนสถานะ)' });
}

// =======================================================
// Subject CRUD
// =======================================================
function openAddSubjectModal() {
    document.getElementById('subject-form').reset();
    document.getElementById('subj-id').value = '';
    document.getElementById('subj-color').value = COLORS[Math.floor(Math.random() * COLORS.length)];
    document.getElementById('subject-modal-title').innerHTML = '<i class="fas fa-book text-indigo-600"></i> เพิ่มรายวิชาใหม่';
    document.getElementById('subject-modal').classList.remove('hidden');
    document.getElementById('subject-modal').classList.add('flex');
}
function closeSubjectModal() {
    document.getElementById('subject-modal').classList.add('hidden');
    document.getElementById('subject-modal').classList.remove('flex');
}

async function saveSubject(e) {
    e.preventDefault();
    const id = document.getElementById('subj-id').value;
    const data = {
        teacher_id: viewingTeacherId,
        subject_code: document.getElementById('subj-code').value.trim(),
        subject_name: document.getElementById('subj-name').value.trim(),
        total_periods: parseInt(document.getElementById('subj-periods').value) || 1,
        grade_level: document.getElementById('subj-grade').value,
        room_number: document.getElementById('subj-room').value.trim(),
        teaching_room: document.getElementById('subj-teaching-room').value.trim() || null,
        color: document.getElementById('subj-color').value,
        updated_at: new Date().toISOString()
    };
    if (!data.subject_code || !data.subject_name) return;

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    let error;
    if (id) {
        const res = await db.from('module_schedule_subjects').update(data).eq('id', id);
        error = res.error;
    } else {
        const res = await db.from('module_schedule_subjects').insert(data);
        error = res.error;
    }
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    await loadAllData();
    renderGrid();
    renderPalette();
    updateRoomFilter();
    updateSummaryBadge();
    closeSubjectModal();
    Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1200, showConfirmButton: false });
}

async function editSubject(id) {
    const s = subjects.find(x => x.id === id);
    if (!s) return;
    document.getElementById('subj-id').value = s.id;
    document.getElementById('subj-code').value = s.subject_code;
    document.getElementById('subj-name').value = s.subject_name;
    document.getElementById('subj-periods').value = s.total_periods;
    document.getElementById('subj-grade').value = s.grade_level;
    document.getElementById('subj-room').value = s.room_number;
    document.getElementById('subj-teaching-room').value = s.teaching_room || '';
    document.getElementById('subj-color').value = s.color;
    document.getElementById('subject-modal-title').innerHTML = '<i class="fas fa-pen text-amber-600"></i> แก้ไขรายวิชา';
    document.getElementById('subject-modal').classList.remove('hidden');
    document.getElementById('subject-modal').classList.add('flex');
}

async function deleteSubject(id) {
    const s = subjects.find(x => x.id === id);
    if (!s) return;
    const usedCount = slots.filter(sl => sl.subject_id === id).length;
    const { isConfirmed } = await Swal.fire({
        icon: 'warning',
        title: 'ลบรายวิชา?',
        html: `<div class="text-sm">${escapeHtml(s.subject_code)} ${escapeHtml(s.subject_name)}<br>
               ${usedCount > 0 ? `<span class="text-rose-600 text-xs">วิชานี้ถูกวางในตารางแล้ว ${usedCount} คาบ จะถูกลบด้วย</span>` : ''}</div>`,
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ลบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;

    const { error } = await db.from('module_schedule_subjects').delete().eq('id', id);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    await loadAllData();
    renderGrid();
    renderPalette();
    updateRoomFilter();
    updateSummaryBadge();
    Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1000, showConfirmButton: false });
}

// =======================================================
// 📄 COPY SUBJECT TO MULTIPLE ROOMS (คัดลอกวิชาไปห้องอื่น)
// =======================================================
async function copySubjectToRooms(id, event) {
    if (event) event.stopPropagation();
    const s = subjects.find(x => x.id === id);
    if (!s) return;

    const { value: roomsStr } = await Swal.fire({
        title: 'คัดลอกวิชาไปยังห้องอื่น',
        html: `
            <div class="text-sm text-left mb-4 bg-blue-50 p-3 rounded-xl border border-blue-200">
                <p><b>วิชา:</b> ${escapeHtml(s.subject_code)} ${escapeHtml(s.subject_name)}</p>
                <p class="mt-1"><b>ระดับชั้น:</b> ${s.grade_level} | <b>ห้อง/กลุ่มต้นฉบับ:</b> ${s.room_number}</p>
                <p class="mt-1"><b>จำนวน:</b> ${s.total_periods} คาบ</p>
                ${s.teaching_room ? `<p class="mt-1 text-xs text-blue-600"><i class="fas fa-door-open"></i> ห้องที่ใช้สอน: ${escapeHtml(s.teaching_room)}</p>` : ''}
            </div>
            <label class="block text-xs font-bold text-slate-600 mb-1 text-left">ระบุห้อง/กลุ่ม ที่ต้องการคัดลอกไป (คั่นด้วย comma)</label>
            <input id="swal-rooms" class="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm outline-none focus:border-indigo-500 bg-white" placeholder="เช่น 2, 3, 4">
            <p class="text-[10px] text-slate-400 mt-2 text-left">*ระบบจะสร้างวิชาใหม่ให้ทันที โดยใช้ข้อมูลวิชาเดิม (ยังไม่ได้วางในตาราง)</p>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonColor: '#3b82f6',
        confirmButtonText: '<i class="fas fa-copy mr-1"></i> คัดลอกเลย',
        cancelButtonText: 'ยกเลิก',
        didOpen: () => {
            setTimeout(() => document.getElementById('swal-rooms')?.focus(), 100);
        },
        preConfirm: () => {
            const val = document.getElementById('swal-rooms').value.trim();
            if (!val) { Swal.showValidationMessage('กรุณาระบุห้องเรียน'); return false; }
            return val;
        }
    });

    if (!roomsStr) return;

    const targetRooms = roomsStr.split(',').map(r => r.trim()).filter(r => r);
    const existingRooms = subjects
        .filter(sub => sub.subject_code === s.subject_code && sub.grade_level === s.grade_level)
        .map(sub => sub.room_number);
        
    const newRooms = targetRooms.filter(r => !existingRooms.includes(r));

    if (newRooms.length === 0) {
        return Swal.fire('แจ้งเตือน', 'ห้องที่ระบุมีวิชานี้อยู่ในระบบแล้ว', 'info');
    }

    const payload = newRooms.map(r => ({
        teacher_id: viewingTeacherId,
        subject_code: s.subject_code,
        subject_name: s.subject_name,
        total_periods: s.total_periods,
        grade_level: s.grade_level,
        room_number: r,
        teaching_room: s.teaching_room,
        color: s.color,
        updated_at: new Date().toISOString()
    }));

    Swal.fire({ title: 'กำลังคัดลอก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    
    try {
        const { error } = await db.from('module_schedule_subjects').insert(payload);
        if (error) throw error;

        await loadAllData();
        renderPalette();
        updateRoomFilter();
        updateSummaryBadge();
        
        Swal.fire({ 
            icon: 'success', 
            title: 'คัดลอกสำเร็จ!', 
            html: `คัดลอกวิชาไปยังห้อง <b>${newRooms.join(', ')}</b> เรียบร้อยแล้ว<br><span class="text-xs text-slate-500">คุณสามารถลากวิชาใหม่เหล่านี้ไปวางในตารางได้เลย</span>`,
            timer: 3000,
            showConfirmButton: true
        });
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// =======================================================
// Save / Clear / Validate
// =======================================================
async function saveAll() {
    updateSummaryBadge();
    Swal.fire({
        icon: 'success',
        title: 'บันทึกเรียบร้อย',
        html: `<div class="text-sm text-left">
            <p>📚 รายวิชาทั้งหมด: <b>${subjects.length}</b> วิชา</p>
            <p>📅 วางในตารางแล้ว: <b>${slots.length}</b> คาบ</p>
            <p class="text-xs text-slate-400 mt-2">*ระบบบันทึกอัตโนมัติทุกครั้งที่วาง/ลบ</p>
        </div>`,
        confirmButtonText: 'OK'
    });
}

async function clearSchedule() {
    if (!slots.length) return Swal.fire('ไม่มีข้อมูล', 'ตารางว่างอยู่แล้ว', 'info');
    const { isConfirmed } = await Swal.fire({
        icon: 'warning',
        title: 'ล้างตารางสอน?',
        html: `จะลบวิชาทั้งหมด <b>${slots.length}</b> คาบ ออกจากตาราง<br><span class="text-xs text-slate-500">(รายวิชาใน palette ยังอยู่)</span>`,
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ล้างตาราง',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังล้าง...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('module_schedule_slots').delete().eq('teacher_id', viewingTeacherId);
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    slots = [];
    renderGrid();
    renderPalette();
    updateSummaryBadge();
    Swal.fire({ icon: 'success', title: 'ล้างตารางเรียบร้อย', timer: 1200, showConfirmButton: false });
}

function validateSchedule() {
    const issues = [];
    const warnings = [];

    subjects.forEach(s => {
        const used = slots.filter(sl => sl.subject_id === s.id).length;
        if (used < s.total_periods) {
            warnings.push(`<div class="text-amber-700 text-xs">⚠ ${escapeHtml(s.subject_code)} ${escapeHtml(s.subject_name)} — วาง ${used}/${s.total_periods} คาบ (ขาด ${s.total_periods - used})</div>`);
        } else if (used > s.total_periods) {
            issues.push(`<div class="text-rose-700 text-xs">❌ ${escapeHtml(s.subject_code)} — เกิน ${used - s.total_periods} คาบ</div>`);
        }
    });

    const seen = {};
    slots.forEach(sl => {
        const key = `${sl.day_of_week}_${sl.period}`;
        if (seen[key]) issues.push(`<div class="text-rose-700 text-xs">❌ ซ้ำ: วันที่ ${DAYS.find(d => d.no === sl.day_of_week)?.name} คาบ ${sl.period}</div>`);
        seen[key] = true;
    });

    const totalPossible = 45;
    const empty = totalPossible - slots.length;

    let html = `<div class="text-left space-y-3">
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-3">
            <p class="font-bold text-blue-800 text-sm mb-1">📊 สรุป</p>
            <p class="text-xs text-blue-700">รายวิชา: <b>${subjects.length}</b> · วางในตาราง: <b>${slots.length}</b>/${totalPossible} คาบ · ว่าง: <b>${empty}</b></p>
        </div>`;

    if (issues.length) {
        html += `<div class="bg-rose-50 border border-rose-200 rounded-xl p-3"><p class="font-bold text-rose-800 text-sm mb-1">❌ พบข้อผิดพลาด</p>${issues.join('')}</div>`;
    }
    if (warnings.length) {
        html += `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3"><p class="font-bold text-amber-800 text-sm mb-1">⚠ ยังไม่ครบ</p><div class="max-h-40 overflow-y-auto space-y-0.5">${warnings.join('')}</div></div>`;
    }
    if (!issues.length && !warnings.length) {
        html += `<div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <i class="fas fa-check-circle text-emerald-500 text-3xl mb-2"></i>
            <p class="font-bold text-emerald-800">ตารางสมบูรณ์</p>
            <p class="text-xs text-emerald-600">ทุกวิชาถูกวางครบตามจำนวนคาบ</p>
        </div>`;
    }
    html += `</div>`;

    Swal.fire({
        title: 'ตรวจสอบตารางสอน',
        html: html,
        width: 600,
        confirmButtonText: 'ปิด',
        confirmButtonColor: '#6366f1'
    });
}

// =======================================================
// Notification Settings Modal
// =======================================================
function openNotificationSettings() {
    if (!settings) settings = {};
    document.getElementById('notif-enabled').checked = !!settings.notifications_enabled;
    document.getElementById('notif-token').value = settings.telegram_bot_token || '';
    document.getElementById('notif-chat').value = settings.telegram_chat_id || '';
    document.getElementById('notif-summary-time').value = settings.summary_time || '06:00';
    document.getElementById('notif-per-period').checked = !!settings.per_period_enabled;
    document.getElementById('notif-modal').classList.remove('hidden');
    document.getElementById('notif-modal').classList.add('flex');
}
function closeNotificationSettings() {
    document.getElementById('notif-modal').classList.add('hidden');
    document.getElementById('notif-modal').classList.remove('flex');
}

async function saveNotificationSettings() {
    const payload = {
        teacher_id: currentUser.id,
        notifications_enabled: document.getElementById('notif-enabled').checked,
        telegram_bot_token: document.getElementById('notif-token').value.trim() || null,
        telegram_chat_id: document.getElementById('notif-chat').value.trim() || null,
        summary_time: document.getElementById('notif-summary-time').value,
        per_period_enabled: document.getElementById('notif-per-period').checked,
        per_period_minutes: 5,
        updated_at: new Date().toISOString()
    };

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const { error } = await db.from('module_schedule_settings').upsert(payload, { onConflict: 'teacher_id' });
    if (error) return Swal.fire('ผิดพลาด', error.message, 'error');

    settings = payload;
    closeNotificationSettings();
    Swal.fire({ icon: 'success', title: 'บันทึกการตั้งค่าแล้ว', timer: 1400, showConfirmButton: false });
}

async function testNotification() {
    const token = document.getElementById('notif-token').value.trim();
    const chat = document.getElementById('notif-chat').value.trim();
    if (!token || !chat) {
        return Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอก Bot Token และ Chat ID ก่อนทดสอบ', 'warning');
    }

    Swal.fire({ title: 'กำลังทดสอบ...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    const testMsg = `<b>🔔 ทดสอบการแจ้งเตือน</b>

📅 <b>ระบบตารางสอน WRK</b>
👤 ${escapeHtml(currentUser.prefix || '')}${escapeHtml(currentUser.first_name)} ${escapeHtml(currentUser.last_name)}
⏰ ${new Date().toLocaleString('th-TH')}

✅ การเชื่อมต่อ Telegram ทำงานปกติ`;

    const result = await sendTelegram(token, chat, testMsg);
    if (result.ok) {
        Swal.fire({ icon: 'success', title: 'ส่งสำเร็จ!', text: 'โปรดตรวจสอบข้อความใน Telegram', timer: 2500, showConfirmButton: false });
    } else {
        Swal.fire('ส่งไม่สำเร็จ', result.error || 'โปรดตรวจสอบ Token/Chat ID', 'error');
    }
}

// =======================================================
// Telegram Sender
// =======================================================
async function sendTelegram(token, chatId, text) {
    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
        });
        const data = await res.json();
        return { ok: data.ok, error: data.description };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

// =======================================================
// Notification Timer
// =======================================================
function startNotificationTimer() {
    if (notifTimer) clearInterval(notifTimer);
    notifTimer = setInterval(checkNotifications, 30 * 1000);
    setTimeout(checkNotifications, 3000);
}

async function checkNotifications() {
    const { data } = await db.from('module_schedule_settings')
        .select('*').eq('teacher_id', currentUser.id).maybeSingle();
    if (!data || !data.notifications_enabled) return;
    if (!data.telegram_bot_token || !data.telegram_chat_id) return;

    const now = new Date();
    const day = now.getDay();
    if (day < 1 || day > 5) return;

    const currentDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const currentMin = now.getHours() * 60 + now.getMinutes();

    // ============ 1) Summary Notification ============
    const summaryKey = `sched_summary_${currentDate}_${currentUser.id}`;
    if (!localStorage.getItem(summaryKey)) {
        const [sh, sm] = (data.summary_time || '06:00').split(':').map(Number);
        const summaryMin = sh * 60 + sm;
        if (currentMin >= summaryMin && currentMin < summaryMin + 30) {
            const ownSlots = await loadOwnSlotsForDay(day);
            const msg = await buildSummaryMessage(ownSlots, day, currentDate);
            const result = await sendTelegram(data.telegram_bot_token, data.telegram_chat_id, msg);
            if (result.ok) {
                localStorage.setItem(summaryKey, '1');
                console.log('✅ Sent summary notification');
            }
        }
    }

    // ============ 2) Per-Period Notification (5 min before) ============
    if (data.per_period_enabled) {
        const ownSlots = await loadOwnSlotsForDay(day);
        const minutes = data.per_period_minutes || 5;

        for (const period of PERIODS) {
            const [ph, pm] = period.start.split(':').map(Number);
            const periodStartMin = ph * 60 + pm;
            const notifyMin = periodStartMin - minutes;

            if (currentMin >= notifyMin && currentMin < notifyMin + 5) {
                const slotKey = `${currentDate}_${currentUser.id}_P${period.no}`;
                if (_sentPerPeriodKeys.has(slotKey) || localStorage.getItem(`sched_per_${slotKey}`)) continue;

                const slot = ownSlots.find(s => s.period === period.no);
                if (!slot) continue;

                const subject = subjects.find(s => s.id === slot.subject_id);
                if (!subject) continue;

                const fullLoc = formatLocation(subject.grade_level, subject.room_number, subject.teaching_room);
                const msg = `<b>⏰ อีก ${minutes} นาทีจะถึงคาบเรียน</b>

📚 <b>คาบที่ ${period.no}</b> (${period.start} - ${period.end})
📖 ${escapeHtml(subject.subject_code)} ${escapeHtml(subject.subject_name)}
🏫 ${fullLoc}

ขอให้สอนราบรื่นนะครับ 👨‍🏫`;

                const result = await sendTelegram(data.telegram_bot_token, data.telegram_chat_id, msg);
                if (result.ok) {
                    _sentPerPeriodKeys.add(slotKey);
                    localStorage.setItem(`sched_per_${slotKey}`, '1');
                    console.log(`✅ Sent per-period notification (คาบ ${period.no})`);
                }
            }
        }
    }
}

// =======================================================
// Load Own Slots for specific day
// =======================================================
async function loadOwnSlotsForDay(dayOfWeek) {
    const { data, error } = await db.from('module_schedule_slots')
        .select('*')
        .eq('teacher_id', currentUser.id)
        .eq('day_of_week', dayOfWeek)
        .order('period');
    if (error) return [];
    return data || [];
}

// =======================================================
// Build Summary Message
// =======================================================
async function buildSummaryMessage(slotsOfDay, dayOfWeek, dateStr) {
    const dayName = DAYS.find(d => d.no === dayOfWeek)?.name || '';
    const dateThai = formatThaiDateFull(dateStr);

    if (!slotsOfDay || slotsOfDay.length === 0) {
        return `<b>📅 ตารางสอนวันนี้ (${dayName})</b>
🗓 ${dateThai}

✨ วันนี้ไม่มีคาบสอน — พักผ่อนให้เต็มที่นะครับ`;
    }

    const subjectIds = slotsOfDay.map(s => s.subject_id);
    const { data: subjData } = await db.from('module_schedule_subjects')
        .select('*').in('id', subjectIds);
    const subjMap = {};
    (subjData || []).forEach(s => { subjMap[s.id] = s; });

    let lines = [`<b>📅 ตารางสอนวันนี้ (${dayName})</b>`, `🗓 ${dateThai}`, ''];
    slotsOfDay.forEach(sl => {
        const subj = subjMap[sl.subject_id];
        const p = PERIODS.find(x => x.no === sl.period);
        if (subj && p) {
            const fullLoc = formatLocation(subj.grade_level, subj.room_number, subj.teaching_room);
            lines.push(`<b>คาบ ${p.no}</b> (${p.start}-${p.end})`);
            lines.push(`   📖 ${escapeHtml(subj.subject_code)} ${escapeHtml(subj.subject_name)}`);
            lines.push(`   🏫 ${fullLoc}`);
            lines.push('');
        }
    });

    lines.push(`📊 รวม <b>${slotsOfDay.length}</b> คาบ`);
    return lines.join('\n');
}

// =======================================================
// Export Excel
// =======================================================
async function exportExcel() {
    if (typeof XLSX === 'undefined') {
        return Swal.fire('ไม่พบไลบรารี', 'ไม่สามารถสร้าง Excel ได้', 'error');
    }

    Swal.fire({ title: 'กำลังสร้าง Excel...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const header = ['วัน / คาบ', ...PERIODS.map(p => `คาบ ${p.no}\n${p.start}-${p.end}`)];
        const rows = [header];

        DAYS.forEach(d => {
            const row = [d.name];
            PERIODS.forEach(p => {
                const slot = slots.find(s => s.day_of_week === d.no && s.period === p.no);
                const subject = slot ? subjects.find(s => s.id === slot.subject_id) : null;
                if (subject) {
                    const roomLabel = formatLocation(subject.grade_level, subject.room_number, '');
                    if (currentRoomFilter !== 'all' && roomLabel !== currentRoomFilter) {
                        row.push('');
                    } else {
                        const fullLoc = formatLocation(subject.grade_level, subject.room_number, subject.teaching_room);
                        row.push(`${subject.subject_code}\n${subject.subject_name}\n${fullLoc}`);
                    }
                } else {
                    row.push('');
                }
            });
            rows.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [{ wch: 14 }, ...PERIODS.map(() => ({ wch: 22 }))];

        // Sheet 2: Subject list
        const subjRows = [['รหัสวิชา', 'ชื่อวิชา', 'จำนวนคาบ', 'ระดับชั้น/กลุ่ม', 'ห้อง/กลุ่มย่อย', 'ห้องที่ใช้สอน', 'วางแล้ว']];
        subjects.forEach(s => {
            const used = slots.filter(sl => sl.subject_id === s.id).length;
            subjRows.push([s.subject_code, s.subject_name, s.total_periods, s.grade_level, s.room_number, s.teaching_room || '-', used]);
        });
        const ws2 = XLSX.utils.aoa_to_sheet(subjRows);
        ws2['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 10 }];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'ตารางสอน');
        XLSX.utils.book_append_sheet(wb, ws2, 'รายวิชา');

        const teacherName = getTeacherName(viewingTeacherId);
        XLSX.writeFile(wb, `ตารางสอน_${teacherName}_${new Date().toISOString().split('T')[0]}.xlsx`);

        Swal.close();
        Swal.fire({ icon: 'success', title: 'สร้าง Excel สำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// =======================================================
// 🖨️ Helper: สร้าง HTML สำหรับรายงาน (ใช้ร่วมกันทั้ง PDF และ Print)
// =======================================================
async function buildScheduleReportHtml() {
    // 1. ดึงข้อมูลโรงเรียนและภาคเรียน (Fallback ไว้หาก DB ไม่มีข้อมูล)
    let schoolName = 'โรงเรียนวัดไร่ขิงวิทยา';
    let logoUrl = 'https://i.ibb.co/94wLv5v/WRK-PNG-200px.png';
    let semester = '1';
    let academicYear = (new Date().getFullYear() + 543).toString();

    try {
        const { data, error } = await db.from('core_school_info').select('*').eq('id', 1).single();
        if (data && !error) {
            if (data.school_name_th || data.school_name) schoolName = data.school_name_th || data.school_name;
            if (data.logo_url) logoUrl = data.logo_url;
            if (data.current_semester) semester = data.current_semester;
            if (data.current_academic_year) academicYear = data.current_academic_year;
        }
    } catch (err) {
        console.warn('ไม่สามารถดึงข้อมูลโรงเรียนได้ ใช้ค่าเริ่มต้นแทน', err);
    }

    // 2. ข้อมูลครูและกลุ่มสาระ
    const teacher = allTeachers.find(x => x.id === viewingTeacherId) || currentUser || {};
    const teacherName = `${teacher.prefix || ''}${teacher.first_name || ''} ${teacher.last_name || ''}`.trim() || 'ครูผู้สอน';
    const teacherDept = teacher.department ? ` (${teacher.department})` : '';

    // แปลงปีการศึกษาเป็น พ.ศ. (ถ้าฐานข้อมูลเก็บเป็น ค.ศ.)
    const thaiYear = isNaN(academicYear) ? academicYear : String(Number(academicYear) + (Number(academicYear) > 2500 ? 0 : 543));

    const today = new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });

    // 3. สร้างหัวตารางและแถวข้อมูล
    let tableHeaders = `<th style="width:8%;">วัน / คาบ</th>`;
    PERIODS.forEach(p => {
        tableHeaders += `<th style="width:10%;"><div>คาบ ${p.no}</div><div style="font-size:8px;font-weight:normal;">${p.start}-${p.end}</div></th>`;
    });

    const tableRows = DAYS.map(d => {
        const cells = PERIODS.map(p => {
            const slot = slots.find(s => s.day_of_week === d.no && s.period === p.no);
            const subject = slot ? subjects.find(s => s.id === slot.subject_id) : null;
            if (subject) {
                const roomLabel = formatLocation(subject.grade_level, subject.room_number, '');
                if (currentRoomFilter !== 'all' && roomLabel !== currentRoomFilter) {
                    return `<td style="border:1px solid #cbd5e1;padding:4px;text-align:center;color:#94a3b8;font-size:9px;">—</td>`;
                }
                const fullLoc = formatLocation(subject.grade_level, subject.room_number, subject.teaching_room);
                return `<td style="border:1px solid #cbd5e1;padding:4px;text-align:center;background:${hexToLight(subject.color)};font-size:9px;line-height:1.3;">
                    <div style="font-weight:800;color:${subject.color};">${escapeHtml(subject.subject_code)}</div>
                    <div style="font-weight:600;">${escapeHtml(subject.subject_name)}</div>
                    <div style="font-size:8px;opacity:.8;">${fullLoc}</div>
                </td>`;
            }
            return `<td style="border:1px solid #cbd5e1;padding:4px;text-align:center;"></td>`;
        }).join('');
        
        return `<tr>
            <td style="border:1px solid #cbd5e1;padding:6px;background:#f1f5f9;text-align:center;font-weight:700;font-size:10px;">
                ${d.name}
            </td>
            ${cells}
        </tr>`;
    }).join('');

    // 4. ประกอบ HTML
    const htmlContent = `<!DOCTYPE html>
    <html><head><meta charset="UTF-8"><style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family:'Sarabun','Noto Sans Thai','Tahoma',sans-serif; background:#fff; padding:20px; }
        .header { text-align:center; margin-bottom:20px; display:flex; flex-direction:column; align-items:center; }
        .logo { height:70px; margin-bottom:8px; }
        .school-name { font-size:20px; font-weight:bold; margin-bottom:4px; color:#1e3a8a; }
        .title { font-size:16px; font-weight:bold; margin-top:5px; }
        .subtitle { font-size:14px; font-weight:normal; margin-top:3px; }
        table { width:100%; border-collapse:collapse; margin-top:10px; }
        th { background:#e0e7ff; padding:6px 4px; font-size:10px; color:#3730a3; border:1px solid #cbd5e1; }
        .footer { margin-top:15px; font-size:10px; color:#64748b; text-align:right; }
        
        /* ✅ CSS สำหรับการพิมพ์ */
        @media print {
            body { padding: 0; }
            @page { size: landscape; margin: 10mm; }
        }
    </style></head><body>
        <div class="header">
            <img src="${logoUrl}" class="logo" crossorigin="anonymous" onerror="this.style.display='none'">
            <div class="school-name">${escapeHtml(schoolName)}</div>
            <div class="title">ตารางสอนของ ${escapeHtml(teacherName)}${escapeHtml(teacherDept)}</div>
            <div class="subtitle">ภาคเรียนที่ ${escapeHtml(semester)} ปีการศึกษา ${escapeHtml(thaiYear)}</div>
            ${currentRoomFilter !== 'all' ? `<div class="subtitle" style="font-size:12px;color:#4f46e5;">(ดูเฉพาะ: ${escapeHtml(currentRoomFilter)})</div>` : ''}
        </div>
        <table>
            <thead><tr>${tableHeaders}</tr></thead>
            <tbody>${tableRows}</tbody>
        </table>
        <div class="footer">พิมพ์เมื่อ: ${today}</div>
    </body></html>`;

    return htmlContent;
}

// =======================================================
// Export PDF
// =======================================================
async function exportPDF() {
    if (typeof html2pdf === 'undefined') {
        return Swal.fire('ไม่พบไลบรารี', 'ไม่สามารถสร้าง PDF ได้', 'error');
    }

    Swal.fire({ title: 'กำลังดึงข้อมูลและสร้าง PDF...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

    try {
        const htmlContent = await buildScheduleReportHtml();
        const teacherName = getTeacherName(viewingTeacherId);

        await html2pdf().set({
            margin: [10, 8, 10, 8],
            filename: `ตารางสอน_${teacherName.replace(/\s+/g, '_')}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
        }).from(htmlContent).save();
        
        Swal.close();
        Swal.fire({ icon: 'success', title: 'สร้าง PDF สำเร็จ', timer: 1500, showConfirmButton: false });
    } catch (err) {
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// =======================================================
// Print (ปรับให้ใช้ Template เดียวกับ PDF)
// =======================================================
async function printSchedule() {
    Swal.fire({ title: 'กำลังจัดเตรียมเอกสาร...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });
    
    try {
        const htmlContent = await buildScheduleReportHtml();
        Swal.close();

        const printWindow = window.open('', '_blank');
        printWindow.document.open();
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        
        // รอให้รูปภาพโหลดเสร็จก่อนเปิดหน้าต่าง Print
        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.focus();
                printWindow.print();
            }, 500);
        };
    } catch (err) {
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// =======================================================
// Helpers
// =======================================================
function pad(n) { return String(n).padStart(2, '0'); }

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function formatThaiDateFull(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const days = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
    const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function hexToLight(hex) {
    if (!hex || !hex.startsWith('#')) return '#f8fafc';
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const mix = (c) => Math.round(c * 0.15 + 255 * 0.85);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function getTeacherName(id) {
    const t = allTeachers.find(x => x.id === id) || currentUser;
    if (!t) return 'ครู';
    return `${t.prefix || ''}${t.first_name || ''} ${t.last_name || ''}`.trim();
}

// =======================================================
// Global Exports
// =======================================================
window.onSubjectDragStart = onSubjectDragStart;
window.onSubjectDragEnd = onSubjectDragEnd;
window.onCellDragOver = onCellDragOver;
window.onCellDragLeave = onCellDragLeave;
window.onCellDrop = onCellDrop;
window.onEmptyCellClick = onEmptyCellClick;
window.selectSubject = selectSubject;
window.placeSlot = placeSlot;
window.removeSlot = removeSlot;
window.openAddSubjectModal = openAddSubjectModal;
window.closeSubjectModal = closeSubjectModal;
window.saveSubject = saveSubject;
window.editSubject = editSubject;
window.deleteSubject = deleteSubject;
window.copySubjectToRooms = copySubjectToRooms;
window.saveAll = saveAll;
window.clearSchedule = clearSchedule;
window.validateSchedule = validateSchedule;
window.openNotificationSettings = openNotificationSettings;
window.closeNotificationSettings = closeNotificationSettings;
window.saveNotificationSettings = saveNotificationSettings;
window.testNotification = testNotification;
window.exportExcel = exportExcel;
window.exportPDF = exportPDF;
window.printSchedule = printSchedule;

console.log('✅ schedule.js loaded (Version: Full + Teaching Room + Custom Grade + Beautiful PDF + Unified Print)');