let currentUser = null;
let currentProfile = null;
let systemSettings = null; 
let allMyLeaves = [];
let dataTable = null;

$(document).ready(async function() {
    Swal.fire({ title: 'กำลังโหลดข้อมูล...', didOpen: ()=>Swal.showLoading(), allowOutsideClick: false });
    await checkAuth();
    await loadSystemSettings();
    initFlatpickr();
    await loadLeaveData();
    Swal.close();
    document.getElementById('mainBody').classList.replace('opacity-0','opacity-100');
});

// ==========================================
// 1. ตรวจสอบสิทธิ์ (Authentication)
// ==========================================
async function checkAuth() {
    const { data: { session }, error } = await db.auth.getSession();
    if (!session) { window.location.replace('login.html'); return; }

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    if (!profile) { await db.auth.signOut(); window.location.replace('login.html'); return; }

    currentUser = session.user;
    currentProfile = profile;

    $('#display-name').text(`${profile.prefix||''}${profile.first_name} ${profile.last_name}`);

    // เช็คสิทธิ์ Admin
    const { data: modAdmin } = await db.from('core_module_admins').select('*').eq('user_id', currentUser.id).eq('module_id', 'leave').maybeSingle();
    if (profile.role === 'super_admin' || profile.role === 'admin' || modAdmin) {
        $('#btnAdminMode').removeClass('hidden').addClass('flex');
    }
}

async function handleLogout() {
    const { isConfirmed } = await Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626' });
    if(isConfirmed) { await db.auth.signOut(); window.location.replace('login.html'); }
}

// ==========================================
// 2. ดึงการตั้งค่าปีงบประมาณและรอบประเมิน
// ==========================================
async function loadSystemSettings() {
    const { data } = await db.from('core_system_modules').select('settings').eq('module_id', 'leave').single();
    
    systemSettings = data?.settings || {
        fiscal_year: (new Date().getFullYear() + 543).toString(),
        eval_round: '1'
    };

    $('#fiscal-badge').text(`ปีงบประมาณ ${systemSettings.fiscal_year} (รอบที่ ${systemSettings.eval_round})`);
}

// ==========================================
// 3. ระบบคำนวณปฏิทินและวันลา
// ==========================================
function initFlatpickr() {
    const config = {
        locale: 'th',
        dateFormat: 'd/m/Y',
        onChange: function(selectedDates, dateStr, instance) {
            if(selectedDates[0]) {
                const id = instance.element.id;
                const d = selectedDates[0];
                document.getElementById(id + '_iso').value = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                
                instance.element.value = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()+543}`;
            }
            calculateDays();
        },
        onReady: function(selectedDates, dateStr, instance) { updateYear(instance); },
        onMonthChange: function(selectedDates, dateStr, instance) { updateYear(instance); },
        onYearChange: function(selectedDates, dateStr, instance) { updateYear(instance); }
    };

    function updateYear(instance) {
        const yearEl = instance.calendarContainer?.querySelector('.cur-year');
        if(yearEl && parseInt(yearEl.value) < 2400) yearEl.value = parseInt(yearEl.value) + 543;
    }

    flatpickr("#start_date", config);
    flatpickr("#end_date", config);
}

function updateLeaveGuide() {
    const type = $('#leave_type').val();
    const guideBox = $('#leave_guide');
    
    const guides = {
        "ลาป่วย": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ลาป่วยตั้งแต่ 3 วันทำการขึ้นไป ให้แนบใบรับรองแพทย์ในวันแรกที่มาปฏิบัติราชการ</span>",
        "ลากิจส่วนตัว": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ต้องส่งใบอนุญาตล่วงหน้าก่อนวันลาอย่างน้อย 3 วันทำการ และรอรับการอนุมัติก่อนถึงจะหยุดได้</span>",
        "ลาคลอดบุตร": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ลาคลอดบุตรได้ 90 วัน (นับรวมวันหยุดราชการ) โดยได้รับเงินเดือน และลาเพิ่มได้อีกไม่เกิน 90 วัน (ไม่ได้รับเงินเดือน)</span>",
        "ลาไปช่วยเหลือภริยาที่คลอดบุตร": "<i class='fas fa-info-circle text-lg mt-0.5'></i> <span>ลาได้ครั้งหนึ่งติดต่อกันไม่เกิน 15 วันทำการ โดยต้องลาภายใน 30 วันนับแต่วันที่ภริยาคลอดบุตร</span>"
    };

    if(guides[type]) {
        guideBox.html(guides[type]).removeClass('hidden');
    } else {
        guideBox.addClass('hidden');
    }
    
    calculateDays(); 
}

function calculateDays() {
    const startIso = $('#start_date_iso').val();
    const endIso = $('#end_date_iso').val();
    const type = $('#leave_type').val();

    if(!startIso || !endIso || !type) { $('#calc_days').text('0'); return; }

    const startDate = new Date(startIso);
    const endDate = new Date(endIso);

    if(endDate < startDate) {
        Swal.fire({toast:true, position:'bottom-end', icon:'error', title:'วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น', showConfirmButton:false, timer:2000});
        $('#calc_days').text('0');
        return;
    }

    let count = 0;
    let curDate = new Date(startDate);

    while(curDate <= endDate) {
        const dayOfWeek = curDate.getDay(); 
        
        if(type === 'ลาคลอดบุตร') {
            count++;
        } else {
            if(dayOfWeek !== 0 && dayOfWeek !== 6) count++;
        }
        curDate.setDate(curDate.getDate() + 1);
    }

    $('#calc_days').text(count);
}

// ==========================================
// 4. จัดการข้อมูล (CRUD)
// ==========================================
async function loadLeaveData() {
    const { data, error } = await db.from('leave_requests')
        .select('*')
        .eq('personnel_id', currentUser.id)
        .order('created_at', { ascending: false });

    if(error) { console.error(error); return; }
    
    allMyLeaves = data || [];
    
    const validLeaves = allMyLeaves.filter(l => 
        l.fiscal_year === systemSettings.fiscal_year && 
        l.eval_round === systemSettings.eval_round && 
        l.status !== 'ไม่อนุมัติ'
    );
    
    let sick = 0, personal = 0, maternity = 0, times = validLeaves.length;
    
    validLeaves.forEach(l => {
        if(l.type === 'ลาป่วย') sick += l.total_days;
        if(l.type === 'ลากิจส่วนตัว') personal += l.total_days;
        if(l.type === 'ลาคลอดบุตร' || l.type === 'ลาไปช่วยเหลือภริยาที่คลอดบุตร') maternity += l.total_days;
    });

    $('#stat-sick').text(sick);
    $('#stat-personal').text(personal);
    $('#stat-maternity').text(maternity);
    $('#stat-times').text(times);

    renderTable();
}

function renderTable() {
    if($.fn.DataTable.isDataTable('#leaveTable')) $('#leaveTable').DataTable().destroy();
    
    const tbody = document.getElementById('tb-leave');
    
    if(allMyLeaves.length > 0) {
        tbody.innerHTML = allMyLeaves.map(l => {
            const createDate = new Date(l.created_at).toLocaleDateString('th-TH', { year:'2-digit', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
            const fmt = (iso) => { if(!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0])+543}`; };
            
            const isRejected = l.status === 'ไม่อนุมัติ';
            const displayDays = isRejected ? 0 : l.total_days;
            const displayTimes = isRejected ? 0 : 1; 

            // 🌟 ระบบแสดงสถานะแบบกดดูเหตุผลได้
            let statusHtml = '';
            if(l.status === 'รออนุมัติ') {
                statusHtml = '<span class="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-xs font-bold border border-amber-200"><i class="fas fa-clock mr-1"></i> รออนุมัติ</span>';
            } else if(l.status === 'อนุมัติ') {
                statusHtml = '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold border border-emerald-200"><i class="fas fa-check-circle mr-1"></i> อนุมัติ</span>';
            } else {
                const safeComment = l.reject_comment ? l.reject_comment.replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '<br>') : 'ไม่มีการระบุเหตุผล';
                statusHtml = `<button onclick="showRejectComment('${safeComment}')" class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full text-xs font-bold border border-rose-300 cursor-pointer hover:bg-rose-200 transition shadow-sm hover:scale-105"><i class="fas fa-times-circle mr-1"></i> ไม่อนุมัติ <i class="fas fa-hand-pointer ml-1 animate-pulse"></i></button>`;
            }

            let typeClass = l.type === 'ลาป่วย' ? 'text-blue-600' : (l.type === 'ลากิจส่วนตัว' ? 'text-orange-600' : 'text-rose-600');
            if (isRejected) typeClass = 'text-slate-400 line-through';

            // 🌟 ปุ่มปริ้น PDF แสดงเสมอ
            let btnHtml = `<button onclick="printLeavePDF('${l.id}')" class="bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="ปริ้นใบลา (PDF)"><i class="fas fa-print"></i></button>`;
            
            // ถ้ารออนุมัติ อนุญาตให้เห็นปุ่มแก้ไขหรือลบ
            if(l.status === 'รออนุมัติ') {
                btnHtml += `
                    <button onclick="editLeave('${l.id}')" class="text-yellow-600 hover:text-yellow-700 bg-yellow-50 px-2 py-1.5 rounded-lg transition shadow-sm mr-1" title="แก้ไขใบลา"><i class="fas fa-pen text-xs"></i></button>
                    <button onclick="deleteLeave('${l.id}')" class="text-rose-500 hover:text-rose-700 bg-rose-50 px-2 py-1.5 rounded-lg transition shadow-sm" title="ลบใบลา"><i class="fas fa-trash text-xs"></i></button>
                `;
            }

            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="py-3 px-4 text-center text-slate-500 text-xs">${createDate} น.</td>
                <td class="py-3 px-4 font-bold ${typeClass}">${l.type}</td>
                <td class="py-3 px-4 text-slate-600">${fmt(l.start_date)} - ${fmt(l.end_date)}</td>
                <td class="py-3 px-4 text-center font-black ${typeClass}">${displayDays}</td>
                <td class="py-3 px-4 text-center font-black ${typeClass}">${displayTimes}</td>
                <td class="py-3 px-4 text-slate-600 text-xs max-w-[200px] truncate" title="${l.reason}">${l.reason}</td>
                <td class="py-3 px-4 text-center">${statusHtml}</td>
                <td class="py-3 px-4 text-center whitespace-nowrap">${btnHtml}</td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = '';
    }

    dataTable = $('#leaveTable').DataTable({
        responsive: true, 
        scrollX: false, 
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        order: [[0, 'desc']], 
        columnDefs: [{ orderable: false, targets: [7] }],
        pageLength: 25
    });
}

// ==========================================
// ฟังก์ชันเปิด-ปิด Modal (ต้องอยู่นอก $(document).ready เสมอ)
// ==========================================
function openLeaveModal() {
    document.getElementById('leaveForm').reset();
    document.getElementById('leave_id').value = '';
    document.getElementById('start_date_iso').value = '';
    document.getElementById('end_date_iso').value = '';
    document.getElementById('calc_days').innerText = '0';
    
    // เคลียร์ค่าที่อยู่และเบอร์โทร
    document.getElementById('contact_address').value = '';
    document.getElementById('phone_number').value = '';

    // ล้างค่าปฏิทิน Flatpickr
    if ($('#start_date')[0] && $('#start_date')[0]._flatpickr) {
        $('#start_date')[0]._flatpickr.clear();
    }
    if ($('#end_date')[0] && $('#end_date')[0]._flatpickr) {
        $('#end_date')[0]._flatpickr.clear();
    }
    
    $('#leave_guide').addClass('hidden');
    
    // แสดง Modal
    document.getElementById('leaveModal').classList.remove('hidden');
    document.getElementById('leaveModal').classList.add('flex');
}

function closeLeaveModal() {
    // ซ่อน Modal
    document.getElementById('leaveModal').classList.add('hidden');
    document.getElementById('leaveModal').classList.remove('flex');
}

function editLeave(id) {
    const l = allMyLeaves.find(item => item.id === id);
    if(!l) return;
    
    document.getElementById('leave_id').value = l.id;
    document.getElementById('leave_type').value = l.type;
    document.getElementById('leave_reason').value = l.reason;
    document.getElementById('start_date_iso').value = l.start_date;
    document.getElementById('end_date_iso').value = l.end_date;
    document.getElementById('calc_days').innerText = l.total_days;

    // 🌟 โหลดค่าที่อยู่และเบอร์โทรมาแสดง
    document.getElementById('contact_address').value = l.contact_address || '';
    document.getElementById('phone_number').value = l.phone_number || '';

    const setFp = (iso, idDisplay) => {
        const parts = iso.split('-'); 
        const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
        const fp = $(`#${idDisplay}`)[0]._flatpickr;
        fp.setDate(new Date(y, m-1, d), false);
        $(`#${idDisplay}`).val(`${String(d).padStart(2,'0')}/${String(m).padStart(2,'0')}/${y+543}`);
    };
    setFp(l.start_date, 'start_date');
    setFp(l.end_date, 'end_date');

    updateLeaveGuide();
    document.getElementById('leaveModal').classList.remove('hidden');
    document.getElementById('leaveModal').classList.add('flex');
}

// // ==========================================
// อัปเดตฟังก์ชัน Save ลง Supabase
// ==========================================
async function saveLeave(e) {
    e.preventDefault();
    const id = $('#leave_id').val();
    const type = $('#leave_type').val();
    const reason = $('#leave_reason').val().trim();
    const startDate = $('#start_date_iso').val();
    const endDate = $('#end_date_iso').val();
    const totalDays = parseInt($('#calc_days').text());
    
    // 🌟 ดึงข้อมูลที่อยู่และเบอร์โทร
    const contactAddress = $('#contact_address').val().trim();
    const phoneNumber = $('#phone_number').val().trim();

    if(totalDays <= 0) return Swal.fire('ข้อมูลไม่ถูกต้อง', 'จำนวนวันลาต้องมากกว่า 0 วัน', 'warning');

    Swal.fire({ title: 'กำลังบันทึกข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const payload = {
        personnel_id: currentUser.id,
        type: type,
        reason: reason,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        contact_address: contactAddress, // 🌟 ส่งเข้า DB
        phone_number: phoneNumber,       // 🌟 ส่งเข้า DB
        fiscal_year: systemSettings.fiscal_year,
        eval_round: systemSettings.eval_round,
        status: 'รออนุมัติ',
        reject_comment: null 
    };

    try {
        if(id) {
            const { error } = await db.from('leave_requests').update({...payload, updated_at: new Date().toISOString()}).eq('id', id);
            if(error) throw error;
        } else {
            const { error } = await db.from('leave_requests').insert([payload]);
            if(error) throw error;
        }
        
        closeLeaveModal();
        await loadLeaveData();
        Swal.fire({ icon: 'success', title: 'ส่งใบลาเรียบร้อยแล้ว', text: 'ข้อมูลของคุณถูกส่งเข้าสู่ระบบส่วนกลางแล้ว', timer: 1500, showConfirmButton: false });
    } catch(err) { Swal.fire('เกิดข้อผิดพลาด', err.message, 'error'); }
}

async function deleteLeave(id) {
    const { isConfirmed } = await Swal.fire({ title: 'ยกเลิกใบลา?', text: "ต้องการยกเลิกและลบรายการลานี้ใช่หรือไม่?", icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc2626', confirmButtonText: 'ใช่, ลบเลย' });
    if(isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('leave_requests').delete().eq('id', id);
        if(!error) { await loadLeaveData(); Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false}); }
        else Swal.fire('ผิดพลาด', error.message, 'error');
    }
}

// ==========================================
// อัปเดตฟังก์ชันส่งออก Excel ให้มีข้อมูลการติดต่อ
// ==========================================
function exportExcel() {
    if(allMyLeaves.length === 0) return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'info');
    
    const fmt = (iso) => { if(!iso) return '-'; const p = iso.split('-'); return `${p[2]}/${p[1]}/${parseInt(p[0])+543}`; };
    
    const exportData = allMyLeaves.map(l => ({
        'วันที่ส่งใบลา': new Date(l.created_at).toLocaleDateString('th-TH'),
        'ปีงบประมาณ': l.fiscal_year,
        'รอบประเมิน': l.eval_round,
        'ประเภทการลา': l.type,
        'เริ่มวันที่': fmt(l.start_date),
        'ถึงวันที่': fmt(l.end_date),
        'จำนวน (วัน)': l.status === 'ไม่อนุมัติ' ? 0 : l.total_days, 
        'จำนวน (ครั้ง)': l.status === 'ไม่อนุมัติ' ? 0 : 1, 
        'สาเหตุ': l.reason,
        'ที่อยู่ติดต่อ': l.contact_address || '-', // 🌟 เพิ่มใน Excel
        'เบอร์โทรศัพท์': l.phone_number || '-',     // 🌟 เพิ่มใน Excel
        'สถานะ': l.status,
        'เหตุผล (กรณีไม่อนุมัติ)': l.reject_comment || ''
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [{wch:15}, {wch:12}, {wch:12}, {wch:20}, {wch:15}, {wch:15}, {wch:12}, {wch:12}, {wch:35}, {wch:35}, {wch:15}, {wch:15}, {wch:30}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "ประวัติการลา");
    XLSX.writeFile(wb, `ประวัติการลา_${currentProfile.first_name}.xlsx`);
}

// ==========================================
// 🌟 ฟังก์ชันพิมพ์ใบลา PDF (ด้วย GAS + Slides) ที่อัปเดตแล้ว
// ==========================================
async function printLeavePDF(id) {
    if (!systemSettings.gas_url || !systemSettings.slide_template_id) {
        return Swal.fire('ยังไม่ได้ตั้งค่า', 'กรุณาระบุ GAS URL และ Slide ID ในเมนู "ตั้งค่าระบบ" (ผ่านแอดมิน) ก่อนใช้งาน', 'warning');
    }

    Swal.fire({
        title: 'กำลังสร้างไฟล์ PDF...',
        html: 'ระบบกำลังดึงข้อมูลและประมวลผลผ่านระบบส่วนกลาง<br><span class="text-xs text-slate-400">อาจใช้เวลา 5-10 วินาที</span>',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    try {
        const { data: leave, error } = await db.from('leave_requests').select('*, core_personnel(*)').eq('id', id).single();
        if (error) throw error;
        const p = leave.core_personnel;

        const { data: school } = await db.from('core_school_info').select('*').single();
        const directorName = school?.director_name || '...................................................';
        const schoolName = school?.school_name || '........................';
        const deputyAcademicName = school?.deputy_academic || '...................................................';

        let commanderName = '...................................................';
        let commanderPosition = `หัวหน้ากลุ่มสาระการเรียนรู้${p.department || ''}`;
        
        // ใช้ optional chaining (?.) เพื่อป้องกัน Error หาก position มีค่าเป็น null
        const isHeadOfDepartment = p.position?.includes('หัวหน้า');

        if (isHeadOfDepartment) {
            commanderName = deputyAcademicName;
            commanderPosition = 'รองผู้อำนวยการกลุ่มบริหารวิชาการ';
        } else {
            const { data: headPerson } = await db.from('core_personnel')
                .select('prefix, first_name, last_name')
                .eq('department', p.department)
                .ilike('position', '%หัวหน้า%') 
                .maybeSingle();

            if (headPerson) {
                commanderName = `${headPerson.prefix || ''}${headPerson.first_name} ${headPerson.last_name}`;
            }
        }

        const { data: stats } = await db.from('leave_requests')
            .select('type, total_days')
            .eq('personnel_id', leave.personnel_id)
            .eq('fiscal_year', leave.fiscal_year)
            .neq('status', 'ไม่อนุมัติ')
            .lte('created_at', leave.created_at);

        let sick = 0, personal = 0, maternity = 0;
        if (stats) stats.forEach(s => {
            if (s.type === 'ลาป่วย') sick += s.total_days;
            if (s.type === 'ลากิจส่วนตัว') personal += s.total_days;
            if (s.type.includes('คลอด')) maternity += s.total_days;
        });

        const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        const position = `${p.position || 'ครู'}${p.academic_standing ? ' วิทยฐานะ' + p.academic_standing : ''}`;

        const formatDate = (isoString) => {
            if (!isoString) return '-';
            const d = new Date(isoString);
            const months = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
            return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
        };

        const writeDate = new Date(leave.created_at);
        const strWriteDate = `วันที่ ${writeDate.getDate()} เดือน ${['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'][writeDate.getMonth()]} พ.ศ. ${writeDate.getFullYear() + 543}`;

        const priorSick = sick - (leave.type === 'ลาป่วย' ? leave.total_days : 0);
        const priorPersonal = personal - (leave.type === 'ลากิจส่วนตัว' ? leave.total_days : 0);
        const priorMat = maternity - (leave.type.includes('คลอด') ? leave.total_days : 0);

        const thMonths = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

        const sDate = new Date(leave.start_date);
        const startDay = sDate.getDate().toString();
        const startMonth = thMonths[sDate.getMonth()];
        const startYear = (sDate.getFullYear() + 543).toString();

        const wDate = new Date(leave.created_at);
        const writeDay = wDate.getDate().toString();
        const writeMonth = thMonths[wDate.getMonth()];
        const writeYear = (wDate.getFullYear() + 543).toString();

        const eDate = new Date(leave.end_date);
        const endDay = eDate.getDate().toString();
        const endMonth = thMonths[eDate.getMonth()];
        const endYear = (eDate.getFullYear() + 543).toString();

        const payload = {
            templateId: systemSettings.slide_template_id,
            fileName: `ใบลา_${p.first_name}_${leave.start_date.replace(/-/g, '')}`,
            replacements: {
                "{{W_DAY}}": writeDay,
                "{{W_MONTH}}": writeMonth,
                "{{W_YEAR}}": writeYear,
                "{{START_D}}": startDay,
                "{{START_M}}": startMonth,
                "{{START_Y}}": startYear,
                "{{END_D}}": endDay,
                "{{END_M}}": endMonth,
                "{{END_Y}}": endYear,
                "{{WRITE_DATE}}": strWriteDate,
                "{{SCHOOL_NAME}}": schoolName,
                "{{LEAVE_TYPE}}": leave.type,
                "{{FULL_NAME}}": fullName,
                "{{POSITION}}": position,
                "{{DEPARTMENT}}": p.department || '-',
                "{{REASON}}": leave.reason,
                "{{START_DATE}}": formatDate(leave.start_date),
                "{{END_DATE}}": formatDate(leave.end_date),
                "{{TOTAL_DAYS}}": leave.total_days.toString(),
                
                // 🌟 เพิ่มข้อมูลติดต่อเข้าไปใน Payload ส่งให้ GAS
                "{{CONTACT_ADDRESS}}": leave.contact_address || '-',
                "{{PHONE_NUMBER}}": leave.phone_number || '-',

                "{{COMMANDER_NAME}}": commanderName,
                "{{COMMANDER_POSITION}}": commanderPosition,
                "{{STAT_SICK_PRIOR}}": priorSick.toString(),
                "{{STAT_SICK_NOW}}": (leave.type === 'ลาป่วย' ? leave.total_days : 0).toString(),
                "{{STAT_SICK_TOTAL}}": sick.toString(),
                "{{STAT_PERS_PRIOR}}": priorPersonal.toString(),
                "{{STAT_PERS_NOW}}": (leave.type === 'ลากิจส่วนตัว' ? leave.total_days : 0).toString(),
                "{{STAT_PERS_TOTAL}}": personal.toString(),
                "{{STAT_MAT_PRIOR}}": priorMat.toString(),
                "{{STAT_MAT_NOW}}": (leave.type.includes('คลอด') ? leave.total_days : 0).toString(),
                "{{STAT_MAT_TOTAL}}": maternity.toString(),
                "{{DIRECTOR_NAME}}": directorName
            }
        };

        const response = await fetch(systemSettings.gas_url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.status === 'success' && result.url) {
            Swal.close();
            window.open(result.url, '_blank');
        } else {
            throw new Error(result.message || 'ประมวลผล PDF ไม่สำเร็จ');
        }

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// 🌟 7. ฟังก์ชันแสดงเหตุผลที่ไม่อนุมัติ
function showRejectComment(comment) {
    Swal.fire({
        icon: 'info',
        title: 'เหตุผลที่ไม่อนุมัติ',
        html: `<div class="text-left bg-rose-50 p-4 rounded-xl border border-rose-100 text-rose-800 mt-2 font-medium">${comment}</div>`,
        confirmButtonColor: '#4f46e5',
        confirmButtonText: 'ปิดหน้าต่าง'
    });
}