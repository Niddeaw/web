// ==========================================
// ตัวแปร Global ของระบบ
// ==========================================
let currentUser = null;
let currentProfile = null;
let isAdmin = false;
let currentMode = 'teacher'; // โหมดเริ่มต้น (teacher / admin)
let calendarInstance = null;
let roomsData = [];

document.addEventListener('DOMContentLoaded', async () => {
    await checkAuth();
});

// ==========================================
// 1. ระบบ Authentication & RBAC (ใช้ config.js)
// ==========================================
async function checkAuth() {
    const result = await checkSessionAndRole('meeting_room', WRK_ROLES.ALLOWED);
    if (!result) return;

    currentUser = result.user;
    currentProfile = result.personnel;

    // ตรวจสอบสิทธิ์ Admin (ใช้ isAdminUser และ hasModuleAccess)
    const isAdminByRole = isAdminUser(currentProfile.role, false);
    let isModuleAdmin = false;
    if (!isAdminByRole) {
        isModuleAdmin = await hasModuleAccess(currentProfile.role, 'meeting_room', currentUser.id);
    }
    isAdmin = isAdminByRole || isModuleAdmin;

    // เปิดแสดงปุ่มสลับโหมดและตั้งค่า หากเป็น Admin
    if (isAdmin) {
        document.getElementById('btnToggleMode').classList.remove('hidden');
        document.getElementById('btnSettings').classList.remove('hidden');
        updateToggleModeButton();
    }

    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');

    await loadRooms();

    // เริ่ม Flatpickr หลังจาก DOM elements พร้อมแล้ว
    flatpickr("#bk_start", { enableTime: true, dateFormat: "Y-m-d H:i", time_24hr: true, locale: "th" });
    flatpickr("#bk_end", { enableTime: true, dateFormat: "Y-m-d H:i", time_24hr: true, locale: "th" });

    // โหลดรายชื่อครูสำหรับ Tom Select
    await initPersonnelSelect();

    await initCalendar();
    applyModeUI(); // ตั้งค่า UI หน้าจอตามโหมด
}

async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการออกจากระบบ?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#e11d48',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace('login.html');
    }
}

// ==========================================
// 2. การควบคุม UI และโหมด (Mode & Tabs Switcher)
// ==========================================
function updateToggleModeButton() {
    const btn = document.getElementById('btnToggleMode');
    if (currentMode === 'teacher') {
        btn.className = "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95 bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200";
        btn.innerHTML = `<i class="fas fa-shield-halved text-sm"></i> สลับเป็นโหมดแอดมิน`;
    } else {
        btn.className = "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm active:scale-95 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200";
        btn.innerHTML = `<i class="fas fa-user text-sm"></i> สลับเป็นโหมดคุณครู`;
    }
}

function toggleTeacherAdminMode() {
    if (!isAdmin) return;
    currentMode = currentMode === 'teacher' ? 'admin' : 'teacher';
    updateToggleModeButton();
    applyModeUI();
}

function applyModeUI() {
    const badge = document.getElementById('pageBadge');
    const userTabs = document.getElementById('userTabsContainer');
    const teacherCalendarTab = document.getElementById('calendar-tab');
    const teacherMyBookingTab = document.getElementById('my-booking-tab');
    const adminContent = document.getElementById('admin-view-content');

    if (currentMode === 'teacher') {
        badge.innerText = "มุมมองผู้ขอใช้ห้อง (Teacher View)";
        badge.className = "text-xs text-slate-500";

        userTabs.classList.remove('hidden');
        adminContent.classList.add('hidden');
        switchTab('calendar-tab'); // กลับไปหน้าปฏิทินของครู
    } else {
        badge.innerText = "มุมมองผู้ดูแลระบบ (Admin View)";
        badge.className = "text-xs font-bold text-rose-600";

        userTabs.classList.add('hidden');
        teacherCalendarTab.classList.add('hidden');
        teacherMyBookingTab.classList.add('hidden');
        adminContent.classList.remove('hidden');
        loadAdminBookings(); // โหลดคิวงานของแอดมิน
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(el => {
        el.classList.remove('bg-blue-600', 'text-white');
        el.classList.add('bg-white', 'text-slate-600');
    });

    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.classList.remove('hidden');

    const activeBtn = document.getElementById('btn-' + tabId);
    if (activeBtn) {
        activeBtn.classList.add('bg-blue-600', 'text-white');
        activeBtn.classList.remove('bg-white', 'text-slate-600');
    }

    if (tabId === 'calendar-tab' && calendarInstance) calendarInstance.render();
    if (tabId === 'my-booking-tab') loadMyBookings();
}

// ==========================================
// 2.5 Tom Select - ค้นหาชื่อครู และกรอกเบอร์อัตโนมัติ
// ==========================================
let personnelData = [];
let responsibleSelect = null;

async function initPersonnelSelect() {
    const { data, error } = await db
        .from('core_personnel')
        .select('id, first_name, last_name, phone')
        .order('first_name', { ascending: true });

    if (error || !data) return;
    personnelData = data;

    if (responsibleSelect) {
        responsibleSelect.destroy();
        responsibleSelect = null;
    }

    responsibleSelect = new TomSelect('#bk_responsible', {
        valueField: 'fullname',
        labelField: 'fullname',
        searchField: ['fullname'],
        placeholder: 'ค้นหาชื่อครู...',
        options: personnelData.map(p => ({
            fullname: `${p.first_name} ${p.last_name}`,
            phone: p.phone || ''
        })),
        onChange(value) {
            const person = personnelData.find(p => `${p.first_name} ${p.last_name}` === value);
            document.getElementById('bk_phone').value = person ? (person.phone || '') : '';
        },
        render: {
            option(data, escape) {
                return `<div class="py-1">
                    <span class="font-bold">${escape(data.fullname)}</span>
                    ${data.phone ? `<span class="text-xs text-slate-400 ml-2"><i class="fa-solid fa-phone"></i> ${escape(data.phone)}</span>` : ''}
                </div>`;
            },
            item(data, escape) {
                return `<div>${escape(data.fullname)}</div>`;
            }
        }
    });
}

// ==========================================
// 3. จัดการห้องประชุม (Room Management & Modals)
// ==========================================
async function loadRooms() {
    const { data, error } = await db.from('mr_rooms').select('*').order('capacity', { ascending: false });
    if (error) return Swal.fire('Error', error.message, 'error');

    roomsData = data || [];

    const select = document.getElementById('bk_room');
    if (select) {
        select.innerHTML = '<option value="">-- เลือกห้อง --</option>' +
            roomsData.filter(r => r.is_active).map(r => `<option value="${r.id}">${r.room_name} (รับได้ ${r.capacity} คน)</option>`).join('');
    }

    const tbody = document.getElementById('tb-rooms');
    if (tbody) {
        tbody.innerHTML = roomsData.map(r => `
            <tr class="hover:bg-slate-50">
                <td class="py-3 px-4 font-bold text-blue-700">${r.room_name}</td>
                <td class="py-3 px-4 text-center">${r.capacity}</td>
                <td class="py-3 px-4 text-xs text-slate-500">${r.equipment || '-'}</td>
                <td class="py-3 px-4 text-center">
                    <span class="px-2 py-1 text-[10px] font-bold rounded-full ${r.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'}">${r.is_active ? 'เปิดใช้งาน' : 'ปิด'}</span>
                </td>
                <td class="py-3 px-4 text-center">
                    <button onclick="editRoom('${r.id}')" class="text-yellow-600 hover:text-yellow-800 px-2" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteRoom('${r.id}')" class="text-rose-600 hover:text-rose-800 px-2" title="ลบ"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `).join('');
    }
}

function openSettingsModal() {
    if (!isAdmin) return;
    document.getElementById('settingsModal').classList.remove('hidden');
    loadRooms();
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}

function openRoomFormModal() {
    document.getElementById('roomForm').reset();
    document.getElementById('r_id').value = '';
    document.getElementById('roomModalTitle').innerText = 'เพิ่มห้องประชุมใหม่';
    document.getElementById('roomModal').classList.remove('hidden');
}

function closeRoomModal() {
    document.getElementById('roomModal').classList.add('hidden');
}

async function editRoom(id) {
    const room = roomsData.find(r => r.id === id);
    if (!room) return;
    document.getElementById('r_id').value = room.id;
    document.getElementById('r_name').value = room.room_name;
    document.getElementById('r_capacity').value = room.capacity;
    document.getElementById('r_equipment').value = room.equipment || '';
    document.getElementById('r_active').checked = room.is_active;

    document.getElementById('roomModalTitle').innerText = 'แก้ไขห้องประชุม';
    document.getElementById('roomModal').classList.remove('hidden');
}

async function saveRoom(e) {
    e.preventDefault();
    const id = document.getElementById('r_id').value;
    const payload = {
        room_name: document.getElementById('r_name').value,
        capacity: document.getElementById('r_capacity').value,
        equipment: document.getElementById('r_equipment').value,
        is_active: document.getElementById('r_active').checked
    };

    Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
    let err;
    if (id) {
        const { error } = await db.from('mr_rooms').update(payload).eq('id', id);
        err = error;
    } else {
        const { error } = await db.from('mr_rooms').insert([payload]);
        err = error;
    }

    if (err) Swal.fire('ผิดพลาด', err.message, 'error');
    else {
        closeRoomModal();
        await loadRooms();
        Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
    }
}

async function deleteRoom(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'ลบห้องประชุม?',
        text: 'การลบจะทำให้ประวัติการจองห้องนี้หายไป (ถ้าตั้งเป็น CASCADE)',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626'
    });
    if (isConfirmed) {
        const { error } = await db.from('mr_rooms').delete().eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else { await loadRooms(); Swal.fire('ลบสำเร็จ', '', 'success'); }
    }
}

// ==========================================
// 4. ระบบการจอง และ ตรวจสอบปฏิทิน
// ==========================================
async function initCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    calendarInstance = new FullCalendar.Calendar(calendarEl, {
        initialView: window.innerWidth < 768 ? 'listWeek' : 'timeGridWeek',
        headerToolbar: {
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,listWeek'
        },
        locale: 'th',
        events: async function (info, successCallback, failureCallback) {
            const { data, error } = await db.from('mr_reservations')
                .select('*, mr_rooms(room_name)')
                .gte('end_time', info.startStr)
                .lte('start_time', info.endStr);

            if (error) { failureCallback(error); return; }

            const events = data.map(res => ({
                id: res.id,
                title: `${res.mr_rooms.room_name} : ${res.title}`,
                start: res.start_time,
                end: res.end_time,
                color: res.status === 'approved' ? '#10b981' : (res.status === 'pending' ? '#f59e0b' : '#ef4444'),
                extendedProps: { ...res }
            }));
            successCallback(events);
        },
        eventClick: function (info) {
            const p = info.event.extendedProps;
            let statusBadge = p.status === 'approved' ? '🟢 อนุมัติแล้ว' : (p.status === 'pending' ? '🟡 รออนุมัติ' : '🔴 ไม่อนุมัติ');
            Swal.fire({
                title: info.event.title,
                html: `
                    <div class="text-left text-sm space-y-2 mt-4">
                        <p><b>สถานะ:</b> ${statusBadge}</p>
                        <p><b>ผู้รับผิดชอบ:</b> ${p.responsible_person} (${p.department})</p>
                        <p><b>เบอร์ติดต่อ:</b> ${p.phone}</p>
                        <p><b>เริ่ม:</b> ${formatThaiDate(p.start_time)}</p>
                        <p><b>สิ้นสุด:</b> ${formatThaiDate(p.end_time)}</p>
                        ${p.reject_reason ? `<p class="text-red-600 border-t pt-2 mt-2"><b>เหตุผลที่ไม่อนุมัติ:</b> ${p.reject_reason}</p>` : ''}
                    </div>
                `,
                confirmButtonColor: '#3085d6',
                confirmButtonText: 'ปิด'
            });
        }
    });
    calendarInstance.render();
}

async function submitBooking(e) {
    e.preventDefault();

    const start = document.getElementById('bk_start').value;
    const end = document.getElementById('bk_end').value;
    const roomId = document.getElementById('bk_room').value;
    const attendees = parseInt(document.getElementById('bk_attendees').value);

    if (new Date(start) >= new Date(end)) {
        return Swal.fire('เวลาไม่ถูกต้อง', 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น', 'warning');
    }

    const selectedRoom = roomsData.find(r => r.id === roomId);
    if (selectedRoom && attendees > selectedRoom.capacity) {
        const { isConfirmed } = await Swal.fire({
            title: 'จำนวนคนเกินความจุห้อง',
            html: `<div class="text-sm space-y-2 mt-2">
                <p>ห้อง <b>${selectedRoom.room_name}</b> รับได้สูงสุด <b class="text-rose-600">${selectedRoom.capacity} คน</b></p>
                <p>คุณระบุจำนวนผู้เข้าร่วม <b class="text-rose-600">${attendees} คน</b></p>
                <p class="text-slate-500 text-xs mt-3">ต้องการส่งคำขอต่อหรือเลือกห้องใหม่?</p>
            </div>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#f59e0b',
            confirmButtonText: '<i class="fa-solid fa-paper-plane mr-1"></i> ส่งต่อไป',
            cancelButtonText: '<i class="fa-solid fa-door-open mr-1"></i> เลือกห้องใหม่'
        });
        if (!isConfirmed) return;
    }

    Swal.fire({ title: 'กำลังตรวจสอบคิวว่าง...', didOpen: () => Swal.showLoading() });

    const { data: overlaps, error: overlapErr } = await db.from('mr_reservations')
        .select('*')
        .eq('room_id', roomId)
        .in('status', ['pending', 'approved'])
        .lt('start_time', new Date(end).toISOString())
        .gt('end_time', new Date(start).toISOString());

    if (overlapErr) return Swal.fire('Error', overlapErr.message, 'error');

    if (overlaps && overlaps.length > 0) {
        const { data: allRes } = await db.from('mr_reservations')
            .select('room_id')
            .in('status', ['pending', 'approved'])
            .lt('start_time', new Date(end).toISOString())
            .gt('end_time', new Date(start).toISOString());

        const busyRoomIds = allRes.map(r => r.room_id);
        const availableRooms = roomsData.filter(r => r.is_active && r.capacity >= attendees && !busyRoomIds.includes(r.id));

        if (availableRooms.length > 0) {
            let suggestions = availableRooms.map(r => `<button onclick="switchRoomAndSubmit('${r.id}')" class="w-full text-left p-3 my-1 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg text-blue-800 font-bold transition-colors"><i class="fa-solid fa-door-open mr-2"></i>เปลี่ยนเป็น ${r.room_name} (ความจุ ${r.capacity})</button>`).join('');

            return Swal.fire({
                title: 'ห้องไม่ว่างในเวลานี้',
                html: `<p class="text-sm text-rose-600 mb-4">มีการจองห้องนี้ไว้แล้วในช่วงเวลาที่คุณเลือก</p><p class="text-sm text-slate-700 font-bold mb-2">ข้อเสนอแนะห้องอื่นที่ว่างในเวลาเดียวกัน:</p>${suggestions}`,
                showConfirmButton: false,
                showCancelButton: true,
                cancelButtonText: 'ยกเลิกการจอง'
            });
        } else {
            return Swal.fire('คิวเต็ม', 'ห้องที่คุณเลือกไม่ว่าง และไม่มีห้องอื่นที่รองรับจำนวนคนได้เพียงพอในช่วงเวลานี้ครับ', 'error');
        }
    }

    executeBooking(roomId);
}

function switchRoomAndSubmit(newRoomId) {
    document.getElementById('bk_room').value = newRoomId;
    Swal.close();
    executeBooking(newRoomId);
}

async function executeBooking(roomId) {
    Swal.fire({ title: 'กำลังส่งคำขอ...', didOpen: () => Swal.showLoading() });
    const payload = {
        user_id: currentUser.id,
        room_id: roomId,
        title: document.getElementById('bk_title').value,
        department: document.getElementById('bk_department').value,
        work_group: document.getElementById('bk_workgroup').value,
        responsible_person: responsibleSelect ? responsibleSelect.getValue() : document.getElementById('bk_responsible').value,
        phone: document.getElementById('bk_phone').value,
        attendee_count: parseInt(document.getElementById('bk_attendees').value),
        start_time: new Date(document.getElementById('bk_start').value).toISOString(),
        end_time: new Date(document.getElementById('bk_end').value).toISOString()
    };

    const { error } = await db.from('mr_reservations').insert([payload]);
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        document.getElementById('bookingForm').reset();
        if (responsibleSelect) responsibleSelect.clear();
        document.getElementById('bk_phone').value = '';
        if (calendarInstance) calendarInstance.refetchEvents();
        Swal.fire('สำเร็จ', 'ส่งคำขอจองห้องเรียบร้อย รอแอดมินอนุมัติครับ', 'success');
    }
}

// ==========================================
// 5. แสดงผลตาราง DataTables สำหรับคุณครู และ แอดมิน
// ==========================================
async function loadMyBookings() {
    if ($.fn.DataTable.isDataTable('#myTable')) $('#myTable').DataTable().destroy();

    const { data, error } = await db.from('mr_reservations').select('*, mr_rooms(room_name)').eq('user_id', currentUser.id).order('created_at', { ascending: false });

    const tbody = document.getElementById('tb-my-bookings');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map(r => `
            <tr>
                <td class="py-2 px-3 font-bold text-blue-700">${r.title}</td>
                <td class="py-2 px-3 text-sm">${r.mr_rooms.room_name}</td>
                <td class="py-2 px-3 text-center text-xs">${formatThaiDate(r.start_time)}</td>
                <td class="py-2 px-3 text-center text-xs">${formatThaiDate(r.end_time)}</td>
                <td class="py-2 px-3 text-center">${getStatusBadge(r.status)}</td>
                <td class="py-2 px-3 text-center whitespace-nowrap">
                    ${r.status === 'pending' ? `
                        <button onclick="openEditBookingModal('${r.id}')"
                            class="inline-flex items-center gap-1 text-blue-600 text-xs font-bold bg-blue-50 hover:bg-blue-100 transition px-2 py-1 rounded mr-1"
                            title="แก้ไขคำขอ">
                            <i class="fa-solid fa-pen text-[10px]"></i> แก้ไข
                        </button>
                        <button onclick="cancelBooking('${r.id}')"
                            class="inline-flex items-center gap-1 text-amber-600 text-xs font-bold bg-amber-50 hover:bg-amber-100 transition px-2 py-1 rounded"
                            title="ยกเลิกคำขอ">
                            <i class="fa-solid fa-ban text-[10px]"></i> ยกเลิก
                        </button>
                    ` : r.status === 'approved' ? `
                        <span class="text-xs text-slate-400 italic">อนุมัติแล้ว</span>
                    ` : `
                        <button onclick="deleteBooking('${r.id}', true)"
                            class="inline-flex items-center gap-1 text-rose-600 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition px-2 py-1 rounded"
                            title="ลบรายการ">
                            <i class="fa-solid fa-trash text-[10px]"></i> ลบ
                        </button>
                    `}
                </td>
            </tr>
        `).join('');
    } else { tbody.innerHTML = ''; }

    $('#myTable').DataTable({
        responsive: true,
        language: {
            url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json',
            emptyTable: 'ไม่มีประวัติการจอง'
        },
        columnDefs: [{ orderable: false, targets: [4, 5] }]
    });
}

async function loadAdminBookings() {
    if (!isAdmin) return;
    if ($.fn.DataTable.isDataTable('#adminBookingTable')) $('#adminBookingTable').DataTable().destroy();

    const { data, error } = await db.from('mr_reservations')
        .select('*, mr_rooms(room_name), core_personnel(first_name, last_name)')
        .order('created_at', { ascending: false });

    const tbody = document.getElementById('tb-admin-bookings');
    if (data && data.length > 0) {
        tbody.innerHTML = data.map(r => `
            <tr>
                <td class="py-2 px-3">
                    <div class="font-bold text-blue-700">${r.title}</div>
                    <div class="text-[10px] text-slate-500">หน่วยงาน: ${r.department}</div>
                </td>
                <td class="py-2 px-3 text-sm">
                    ${r.core_personnel.first_name} ${r.core_personnel.last_name}<br>
                    <span class="text-xs text-slate-500"><i class="fa-solid fa-phone"></i> ${r.phone}</span>
                </td>
                <td class="py-2 px-3 text-center text-sm">${r.mr_rooms.room_name}<br><span class="text-xs text-slate-500">(${r.attendee_count} คน)</span></td>
                <td class="py-2 px-3 text-center text-xs">
                    ${formatThaiDate(r.start_time, true)} -<br>${formatThaiDate(r.end_time, true)}
                </td>
                <td class="py-2 px-3 text-center">${getStatusBadge(r.status)}</td>
                <td class="py-2 px-3 text-center whitespace-nowrap">
                    ${r.status === 'pending' ? `
                        <button onclick="updateBookingStatus('${r.id}', 'approved')" class="text-emerald-600 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded font-bold text-xs shadow-sm"><i class="fa-solid fa-check"></i> อนุมัติ</button>
                        <button onclick="rejectBooking('${r.id}')" class="text-rose-600 bg-rose-50 hover:bg-rose-100 px-2 py-1 rounded font-bold text-xs shadow-sm"><i class="fa-solid fa-xmark"></i> ปฏิเสธ</button>
                    ` : `
                        <button onclick="deleteBooking('${r.id}', false)" class="text-slate-400 hover:text-rose-600 px-2 py-1 transition-colors" title="ลบรายการ"><i class="fa-solid fa-trash"></i></button>
                    `}
                </td>
            </tr>
        `).join('');
    } else { tbody.innerHTML = ''; }

    $('#adminBookingTable').DataTable({
        responsive: true,
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        dom: 'Bfrtip',
        buttons: [
            { extend: 'excelHtml5', text: '<i class="fa-solid fa-file-excel mr-1"></i> ส่งออก Excel', className: 'bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-3 rounded-lg text-sm border-none shadow-sm' }
        ]
    });
}

// ==========================================
// 6. Helper Functions (Approve, Reject, Delete, Statuses)
// ==========================================
function formatThaiDate(dateStr, short = false) {
    const d = dayjs(dateStr);
    const buddhistYear = d.year() + 543;
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const day = d.date().toString().padStart(2, '0');
    const month = months[d.month()];
    const year = short ? (buddhistYear % 100).toString().padStart(2, '0') : buddhistYear;
    const time = d.format('HH:mm');
    return `${day} ${month} ${year} ${time} น.`;
}

function getStatusBadge(status) {
    if (status === 'approved') return '<span class="px-2 py-1 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-700">อนุมัติแล้ว</span>';
    if (status === 'rejected') return '<span class="px-2 py-1 text-[10px] font-bold rounded-full bg-rose-100 text-rose-700">ไม่อนุมัติ</span>';
    return '<span class="px-2 py-1 text-[10px] font-bold rounded-full bg-amber-100 text-amber-700">รออนุมัติ</span>';
}

async function updateBookingStatus(id, newStatus, reason = null) {
    Swal.fire({ title: 'กำลังอัปเดต...', didOpen: () => Swal.showLoading() });
    const payload = { status: newStatus };
    if (reason) payload.reject_reason = reason;

    const { error } = await db.from('mr_reservations').update(payload).eq('id', id);
    if (error) Swal.fire('ผิดพลาด', error.message, 'error');
    else {
        if (calendarInstance) calendarInstance.refetchEvents();
        await loadAdminBookings();
        Swal.fire({ icon: 'success', title: 'อัปเดตสถานะสำเร็จ', timer: 1500, showConfirmButton: false });
    }
}

async function rejectBooking(id) {
    const result = await Swal.fire({
        title: 'ระบุเหตุผลที่ไม่อนุมัติ',
        input: 'text',
        inputPlaceholder: 'เช่น ห้องไม่พร้อมใช้งาน, กำลังซ่อมแซมแอร์',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ยืนยันไม่อนุมัติ',
        cancelButtonText: 'ยกเลิก'
    });
    if (result.isConfirmed) {
        updateBookingStatus(id, 'rejected', result.value || '');
    }
}

// ==========================================
// 6.1 แก้ไขการจองของฉัน (Edit Booking Modal)
// ==========================================
let editFlatStart = null;
let editFlatEnd = null;
let editResponsibleSelect = null;

async function openEditBookingModal(id) {
    const { data: r, error } = await db.from('mr_reservations').select('*').eq('id', id).single();
    if (error || !r) return Swal.fire('ผิดพลาด', 'ไม่พบข้อมูลการจอง', 'error');

    document.getElementById('eb_id').value = r.id;
    document.getElementById('eb_title').value = r.title;
    document.getElementById('eb_attendees').value = r.attendee_count;
    document.getElementById('eb_department').value = r.department;
    document.getElementById('eb_phone').value = r.phone || '';

    const roomSel = document.getElementById('eb_room');
    roomSel.innerHTML = roomsData.filter(rm => rm.is_active).map(rm =>
        `<option value="${rm.id}" ${rm.id === r.room_id ? 'selected' : ''}>${rm.room_name} (รับได้ ${rm.capacity} คน)</option>`
    ).join('');

    if (editFlatStart) editFlatStart.destroy();
    if (editFlatEnd) editFlatEnd.destroy();
    editFlatStart = flatpickr('#eb_start', { enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true, locale: 'th', defaultDate: r.start_time });
    editFlatEnd   = flatpickr('#eb_end',   { enableTime: true, dateFormat: 'Y-m-d H:i', time_24hr: true, locale: 'th', defaultDate: r.end_time });

    if (editResponsibleSelect) { editResponsibleSelect.destroy(); editResponsibleSelect = null; }
    editResponsibleSelect = new TomSelect('#eb_responsible', {
        valueField: 'fullname',
        labelField: 'fullname',
        searchField: ['fullname'],
        placeholder: 'ค้นหาชื่อครู...',
        options: personnelData.map(p => ({ fullname: `${p.first_name} ${p.last_name}`, phone: p.phone || '' })),
        items: [r.responsible_person],
        onChange(value) {
            const person = personnelData.find(p => `${p.first_name} ${p.last_name}` === value);
            document.getElementById('eb_phone').value = person ? (person.phone || '') : '';
        },
        render: {
            option(data, escape) {
                return `<div class="py-1"><span class="font-bold">${escape(data.fullname)}</span>${data.phone ? `<span class="text-xs text-slate-400 ml-2"><i class="fa-solid fa-phone"></i> ${escape(data.phone)}</span>` : ''}</div>`;
            },
            item(data, escape) { return `<div>${escape(data.fullname)}</div>`; }
        }
    });

    document.getElementById('editBookingModal').classList.remove('hidden');
}

function closeEditBookingModal() {
    document.getElementById('editBookingModal').classList.add('hidden');
    if (editFlatStart) { editFlatStart.destroy(); editFlatStart = null; }
    if (editFlatEnd)   { editFlatEnd.destroy();   editFlatEnd   = null; }
    if (editResponsibleSelect) { editResponsibleSelect.destroy(); editResponsibleSelect = null; }
}

async function saveEditBooking(e) {
    e.preventDefault();

    const id       = document.getElementById('eb_id').value;
    const start    = document.getElementById('eb_start').value;
    const end      = document.getElementById('eb_end').value;
    const roomId   = document.getElementById('eb_room').value;
    const attendees = parseInt(document.getElementById('eb_attendees').value);

    if (new Date(start) >= new Date(end)) {
        return Swal.fire('เวลาไม่ถูกต้อง', 'เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น', 'warning');
    }

    const selectedRoom = roomsData.find(r => r.id === roomId);
    if (selectedRoom && attendees > selectedRoom.capacity) {
        const { isConfirmed } = await Swal.fire({
            title: 'จำนวนคนเกินความจุห้อง',
            html: `<div class="text-sm space-y-2 mt-2">
                <p>ห้อง <b>${selectedRoom.room_name}</b> รับได้สูงสุด <b class="text-rose-600">${selectedRoom.capacity} คน</b></p>
                <p>คุณระบุจำนวนผู้เข้าร่วม <b class="text-rose-600">${attendees} คน</b></p>
            </div>`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#f59e0b',
            confirmButtonText: 'บันทึกต่อไป',
            cancelButtonText: 'แก้ไขใหม่'
        });
        if (!isConfirmed) return;
    }

    Swal.fire({ title: 'กำลังตรวจสอบ...', didOpen: () => Swal.showLoading() });
    const { data: overlaps } = await db.from('mr_reservations')
        .select('id')
        .eq('room_id', roomId)
        .neq('id', id)
        .in('status', ['pending', 'approved'])
        .lt('start_time', new Date(end).toISOString())
        .gt('end_time', new Date(start).toISOString());

    if (overlaps && overlaps.length > 0) {
        return Swal.fire('ห้องไม่ว่าง', 'มีการจองห้องนี้ในช่วงเวลาเดียวกันอยู่แล้ว กรุณาเลือกเวลาหรือห้องอื่น', 'error');
    }

    const payload = {
        room_id:            roomId,
        title:              document.getElementById('eb_title').value,
        department:         document.getElementById('eb_department').value,
        responsible_person: editResponsibleSelect ? editResponsibleSelect.getValue() : document.getElementById('eb_responsible').value,
        phone:              document.getElementById('eb_phone').value,
        attendee_count:     attendees,
        start_time:         new Date(start).toISOString(),
        end_time:           new Date(end).toISOString(),
        status:             'pending'
    };

    const { error } = await db.from('mr_reservations').update(payload).eq('id', id);
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        closeEditBookingModal();
        if (calendarInstance) calendarInstance.refetchEvents();
        await loadMyBookings();
        Swal.fire({ icon: 'success', title: 'แก้ไขสำเร็จ', text: 'ระบบจะส่งคำขอรออนุมัติใหม่', timer: 2000, showConfirmButton: false });
    }
}

async function cancelBooking(id) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยกเลิกคำขอจองห้อง?',
        text: 'คำขอนี้จะถูกยกเลิกและไม่สามารถกู้คืนได้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        confirmButtonText: '<i class="fa-solid fa-ban mr-1"></i> ยืนยันยกเลิก',
        cancelButtonText: 'ไม่ยกเลิก'
    });
    if (!isConfirmed) return;

    Swal.fire({ title: 'กำลังดำเนินการ...', didOpen: () => Swal.showLoading() });
    const { error } = await db.from('mr_reservations').delete().eq('id', id);
    if (error) {
        Swal.fire('ผิดพลาด', error.message, 'error');
    } else {
        if (calendarInstance) calendarInstance.refetchEvents();
        await loadMyBookings();
        Swal.fire({ icon: 'success', title: 'ยกเลิกสำเร็จ', timer: 1500, showConfirmButton: false });
    }
}

async function deleteBooking(id, isUserInitiated) {
    const { isConfirmed } = await Swal.fire({
        title: isUserInitiated ? 'ยกเลิกคำขอจองห้อง?' : 'ลบประวัติการจองนี้อย่างถาวร?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ยืนยัน',
        cancelButtonText: 'ยกเลิก'
    });

    if (isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', didOpen: () => Swal.showLoading() });
        const { error } = await db.from('mr_reservations').delete().eq('id', id);
        if (error) Swal.fire('ผิดพลาด', error.message, 'error');
        else {
            if (calendarInstance) calendarInstance.refetchEvents();
            if (isAdmin && !isUserInitiated) await loadAdminBookings();
            if (isUserInitiated) await loadMyBookings();
            Swal.fire({ icon: 'success', title: 'ดำเนินการสำเร็จ', timer: 1500, showConfirmButton: false });
        }
    }
}