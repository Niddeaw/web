// ==========================================
// ไฟล์: sdq_teacher.js (อัปเดตระบบสิทธิ์และดึงข้อมูลตามโหมด)
// ==========================================

let userInfo = null;
let currentSchoolInfo = null;
let systemDataList = []; 
let tableInstance = null;

// สถานะการจัดการสิทธิ์
let isTeacher = false;
let isAdmin = false;
let currentMode = ''; 
let myClassIds = []; // เก็บ ID ห้องที่ครูคนนี้ดูแล

$(document).ready(async function() {
    try {
        await fetchCoreInfo();
        const authorized = await checkAuthAndRoles();
        if (authorized) {
            setupUI();
            await loadData();
            document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        }
    } catch (err) {
        console.error("System Error:", err);
    }
});

// ------------------------------------------
// 1. ระบบ Auth & ตรวจสอบ Role (ครู/แอดมิน)
// ------------------------------------------
async function fetchCoreInfo() {
    const { data, error } = await db.from('core_school_info').select('*').single();
    if (error) throw error;
    currentSchoolInfo = data;
}

async function checkAuthAndRoles() {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) { window.location.href = 'login.html'; return false; }
    
    // ดึงข้อมูลบุคลากร
    const { data: personnel } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (!personnel) {
        window.location.href = 'index.html'; return false;
    }
    
    userInfo = personnel;
    $('#user-display').text(`${personnel.prefix}${personnel.first_name} ${personnel.last_name}`);

    // 1. เช็คสิทธิ์ Admin
    if (['admin', 'super_admin'].includes(personnel.role)) {
        isAdmin = true;
    }

    // 2. เช็คสิทธิ์ Teacher (เป็นที่ปรึกษาห้องไหนบ้าง)
    const { data: classrooms } = await db.from('core_classrooms').select('id')
        .or(`advisor_id.eq.${user.id},co_advisor_id.eq.${user.id}`);
    
    if (classrooms && classrooms.length > 0) {
        isTeacher = true;
        myClassIds = classrooms.map(c => c.id); // เก็บ ID ห้องไว้ดึงข้อมูล
    }

    console.log("🔒 ตรวจสอบสิทธิ์ผู้ใช้:");
    console.log("- เป็น Admin หรือไม่:", isAdmin);
    console.log("- เป็นครูที่ปรึกษาหรือไม่:", isTeacher, " ดูแลห้อง:", myClassIds);

    // กำหนดโหมดเริ่มต้น
    if (!isAdmin && !isTeacher) {
        Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์ในระบบนี้ (ไม่ได้เป็นแอดมิน และไม่ได้เป็นครูที่ปรึกษา)', 'error').then(() => window.location.href='index.html');
        return false;
    }

    // ถ้าเป็นครูให้เริ่มที่ครู ถ้าเป็นแอดมินอย่างเดียวให้เริ่มแอดมิน
    currentMode = isTeacher ? 'teacher' : 'admin';
    return true;
}

// ------------------------------------------
// 2. UI & ปุ่มสลับโหมด
// ------------------------------------------
function setupUI() {
    // แสดงปุ่มสลับโหมด ถ้ามี "ทั้ง 2 สิทธิ์" เท่านั้น
    if (isAdmin && isTeacher) {
        $('#roleSwitchContainer').html(`
            <button onclick="toggleMode()" class="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold shadow-sm transition-all">
                <i class="fas fa-exchange-alt"></i>
                <span class="hidden md:inline" id="switch-text">สลับโหมด</span>
            </button>
        `);
    } else {
        $('#roleSwitchContainer').empty();
    }
}

async function toggleMode() {
    currentMode = (currentMode === 'teacher') ? 'admin' : 'teacher';
    await loadData();
}

// ------------------------------------------
// 3. โหลดข้อมูล (แยกโหมดชัดเจน)
// ------------------------------------------
async function loadData() {
    Swal.fire({title: 'กำลังโหลดข้อมูล...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
    systemDataList = []; 

    // ปรับ UI หัวข้อตามโหมด
    if (currentMode === 'teacher') {
        $('#mode-subtitle').text('Teacher Dashboard').removeClass('text-rose-500').addClass('text-slate-500');
        $('#table-title').html('<i class="fa-solid fa-users mr-2 text-indigo-500"></i> รายชื่อนักเรียนประจำชั้น');
        $('#adminFilters').addClass('hidden');
        if(isAdmin && isTeacher) $('#switch-text').text('สลับไปโหมดแอดมิน');
    } else {
        $('#mode-subtitle').text('Admin Dashboard').removeClass('text-slate-500').addClass('text-rose-500');
        $('#table-title').html('<i class="fa-solid fa-globe mr-2 text-indigo-500"></i> นักเรียนทั้งหมดทุกระดับชั้น');
        $('#adminFilters').removeClass('hidden');
        if(isAdmin && isTeacher) $('#switch-text').text('สลับไปโหมดครู');
    }

    try {
        let query = db.from('student_enrollments')
            .select(`
                id, student_number, classroom_id,
                core_students (id, prefix, first_name, last_name, student_id_card),
                core_classrooms (grade_level, room_number),
                sdq_assessments (*)
            `)
            .eq('academic_year', currentSchoolInfo.current_academic_year);

        // ==========================================
        // 🎯 หัวใจหลักของการดึงข้อมูล
        // ==========================================
        if (currentMode === 'teacher') {
            // โหมดครู: ดึงเฉพาะนักเรียนในห้องที่เป็นที่ปรึกษา
            query = query.in('classroom_id', myClassIds).order('student_number', { ascending: true });
        } else {
            // โหมดแอดมิน: ดึงทั้งหมดทุกระดับชั้น 
            query = query.range(0, 4000).order('classroom_id', { ascending: true }).order('student_number', { ascending: true });
        }

        const { data, error } = await query;
        if (error) throw error;

        systemDataList = data;
        
        updateDashboard(data);
        renderTable(data);
        Swal.close();

    } catch (err) {
        console.error(err);
        Swal.fire('Error', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
}

// ------------------------------------------
// 4. Dashboard & Table Render
// ------------------------------------------
function updateDashboard(data) {
    let stats = { total: data.length, assessed: 0, normal: 0, risk: 0, problem: 0 };

    data.forEach(item => {
        const assessments = item.sdq_assessments || [];
        const teaEval = assessments.find(a => a.assessor_type === 'teacher');
        const parEval = assessments.find(a => a.assessor_type === 'parent');
        const stdEval = assessments.find(a => a.assessor_type === 'student');
        
        const mainEval = teaEval || parEval || stdEval; 
        
        if (mainEval) {
            stats.assessed++;
            if (mainEval.total_difficulty_score <= 15) stats.normal++;
            else if (mainEval.total_difficulty_score <= 18) stats.risk++;
            else stats.problem++;
        }
    });

    $('#stat-total').text(stats.total);
    $('#stat-assessed').text(stats.assessed);
    $('#stat-normal').text(stats.normal);
    $('#stat-risk').text(stats.risk);
    $('#stat-problem').text(stats.problem);
}

function renderTable(data) {
    if ($.fn.DataTable.isDataTable('#mainTable')) {
        $('#mainTable').DataTable().destroy();
    }
    
    const thead = $('#dynamicThead');
    thead.empty();
    
    if (currentMode === 'teacher') {
        thead.html(`
            <tr>
                <th class="p-4 rounded-tl-lg text-center">ชั้น/ห้อง</th>
                <th class="p-4 text-center">เลขที่</th>
                <th class="p-4">ชื่อ-สกุล</th>
                <th class="p-4 text-center">นร.ประเมิน</th>
                <th class="p-4 text-center">ผปค.ประเมิน</th>
                <th class="p-4 text-center">ครูประเมิน</th>
                <th class="p-4 text-center">คะแนนรวม(ครู)</th>
                <th class="p-4 text-center rounded-tr-lg">จัดการ (ครู)</th>
            </tr>
        `);
    } else {
        thead.html(`
            <tr>
                <th class="p-4 rounded-tl-lg text-center">ชั้น/ห้อง</th>
                <th class="p-4 text-center">เลขที่</th>
                <th class="p-4">ชื่อ-สกุล</th>
                <th class="p-4 text-center">ผู้ประเมินหลัก</th>
                <th class="p-4 text-center">คะแนนรวม</th>
                <th class="p-4 text-center">สถานะ</th>
                <th class="p-4 text-center rounded-tr-lg">จัดการ (แอดมิน)</th>
            </tr>
        `);
    }

    const tbody = $('#mainTable tbody');
    tbody.empty();

    data.forEach(item => {
        if (!item.core_classrooms) return;
        const student = item.core_students;
        const roomTxt = `ม.${item.core_classrooms.grade_level}/${item.core_classrooms.room_number}`;
        const assessments = item.sdq_assessments || [];
        
        const stdEval = assessments.find(a => a.assessor_type === 'student');
        const parEval = assessments.find(a => a.assessor_type === 'parent');
        const teaEval = assessments.find(a => a.assessor_type === 'teacher');
        const mainEval = teaEval || parEval || stdEval;

        if (currentMode === 'teacher') {
            // ==========================================
            // ตารางโหมดครู (มีปุ่มประเมินนักเรียน)
            // ==========================================
            const getStatusBadge = (evalData) => evalData 
                ? `<span class="px-2 py-1 bg-emerald-50 text-emerald-600 rounded-lg text-[10px] font-bold border border-emerald-200"><i class="fas fa-check"></i> ทำแล้ว</span>`
                : `<span class="px-2 py-1 bg-slate-50 text-slate-400 rounded-lg text-[10px] font-bold border border-slate-200">ยังไม่ทำ</span>`;

            // ปุ่มจัดการ: ถ้าครูประเมินแล้วให้ขึ้นปุ่มดู/รีเซ็ต ถ้ายังไม่ประเมินให้ขึ้นปุ่ม "ประเมิน"
            let actionBtn = teaEval 
                ? `<div class="flex gap-2 justify-center">
                    <button onclick="viewSDQ('${teaEval.id}')" class="text-blue-600 hover:text-blue-800" title="ดูผล"><i class="fas fa-eye"></i></button>
                    <button onclick="deleteSDQ('${teaEval.id}')" class="text-orange-500 hover:text-orange-700" title="ให้ครูประเมินใหม่"><i class="fas fa-undo"></i></button>
                   </div>`
                : `<button onclick="startTeacherAssessment('${item.id}')" class="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-sm">
                    <i class="fas fa-edit mr-1"></i> ประเมิน
                   </button>`;

            tbody.append(`
                <tr class="border-b hover:bg-slate-50">
                    <td class="p-3 text-center text-slate-500">${roomTxt}</td>
                    <td class="p-3 text-center">${item.student_number}</td>
                    <td class="p-3 font-bold text-slate-700">${student.prefix}${student.first_name} ${student.last_name}</td>
                    <td class="p-3 text-center">${getStatusBadge(stdEval)}</td>
                    <td class="p-3 text-center">${getStatusBadge(parEval)}</td>
                    <td class="p-3 text-center">${getStatusBadge(teaEval)}</td>
                    <td class="p-3 text-center font-black text-indigo-600">${teaEval ? teaEval.total_difficulty_score : '-'}</td>
                    <td class="p-3 text-center">${actionBtn}</td>
                </tr>
            `);

        } else {
            // ==========================================
            // ตารางโหมดแอดมิน (ดูภาพรวม ลบได้ทุกอย่าง)
            // ==========================================
            let scoreText = '-'; let assessorText = '-'; let actionBtn = '-';
            let resultBadge = '<span class="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold">ยังไม่ประเมิน</span>';

            if (mainEval) {
                scoreText = `<span class="font-black text-indigo-600">${mainEval.total_difficulty_score}</span>`;
                assessorText = mainEval.assessor_type === 'teacher' ? 'ครู' : mainEval.assessor_type === 'parent' ? 'ผู้ปกครอง' : 'นักเรียน';
                
                if (mainEval.total_difficulty_score <= 15) resultBadge = '<span class="text-emerald-600 font-bold">ปกติ</span>';
                else if (mainEval.total_difficulty_score <= 18) resultBadge = '<span class="text-amber-500 font-bold">เสี่ยง</span>';
                else resultBadge = '<span class="text-rose-600 font-bold">มีปัญหา</span>';

                actionBtn = `<div class="flex gap-2 justify-center">
                    <button onclick="viewSDQ('${mainEval.id}')" class="text-blue-600 hover:text-blue-800" title="ดูผล"><i class="fas fa-eye"></i></button>
                    <button onclick="deleteSDQ('${mainEval.id}')" class="text-red-500 hover:text-red-700" title="ลบข้อมูลถาวร"><i class="fas fa-trash"></i></button>
                </div>`;
            }

            tbody.append(`
                <tr class="border-b hover:bg-slate-50">
                    <td class="p-3 text-center font-medium">${roomTxt}</td>
                    <td class="p-3 text-center">${item.student_number}</td>
                    <td class="p-3 font-bold text-slate-700">${student.prefix}${student.first_name} ${student.last_name}</td>
                    <td class="p-3 text-center text-xs font-bold text-slate-500">${assessorText}</td>
                    <td class="p-3 text-center">${scoreText}</td>
                    <td class="p-3 text-center">${resultBadge}</td>
                    <td class="p-3 text-center">${actionBtn}</td>
                </tr>
            `);
        }
    });

    tableInstance = $('#mainTable').DataTable({
        language: { url: '//cdn.datatables.net/plug-ins/1.13.6/i18n/th.json' },
        pageLength: 50, destroy: true
    });
}

// ------------------------------------------
// 5. ระบบค้นหา & ฟังก์ชันการกระทำ
// ------------------------------------------
$.fn.dataTable.ext.search = [];
$.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
    if (currentMode !== 'admin') return true; 
    let fGrade = $('#filterGrade').val(); 
    let fRoom = $('#filterRoom').val();   
    let classText = data[0]; 
    let matchGrade = !fGrade || classText.includes('ม.' + fGrade + '/');
    let matchRoom = !fRoom || classText.endsWith('/' + fRoom);
    return matchGrade && matchRoom;
});

$(document).on('change', '#filterGrade, #filterRoom', function() {
    if (tableInstance) tableInstance.draw();
});

function startTeacherAssessment(enrollmentId) {
    window.location.href = `sdq_form_teacher.html?enrollment_id=${enrollmentId}`;
}

function viewSDQ(sdqId) {
    let sdqData = null; let stdName = "";
    systemDataList.forEach(item => {
        if(item.sdq_assessments) {
            let found = item.sdq_assessments.find(a => a.id === sdqId);
            if (found) { sdqData = found; stdName = `${item.core_students.first_name} ${item.core_students.last_name}`; }
        }
    });
    if(!sdqData) return;

    Swal.fire({
        title: `ผลประเมินของ ${stdName}`,
        html: `
            <div class="text-left text-sm space-y-3 p-4 bg-slate-50 rounded-xl border">
                <div class="flex justify-between border-b pb-2"><b>คะแนนรวม:</b> <span class="text-lg font-black text-indigo-600">${sdqData.total_difficulty_score}</span></div>
                <div class="flex justify-between"><span>ด้านอารมณ์:</span> <b>${sdqData.score_emotional}</b></div>
                <div class="flex justify-between"><span>ความประพฤติ:</span> <b>${sdqData.score_conduct}</b></div>
                <div class="flex justify-between"><span>สมาธิสั้น:</span> <b>${sdqData.score_hyper}</b></div>
                <div class="flex justify-between"><span>ความสัมพันธ์กับเพื่อน:</span> <b>${sdqData.score_peer}</b></div>
                <div class="flex justify-between border-t pt-2 text-emerald-600"><span>สัมพันธภาพทางสังคม:</span> <b>${sdqData.score_prosocial}</b></div>
            </div>
        `,
        icon: 'info'
    });
}

async function deleteSDQ(id) {
    const txt = currentMode === 'admin' ? "ข้อมูลจะถูกลบอย่างถาวร" : "ลบเพื่อให้ครูสามารถประเมินนักเรียนคนนี้ใหม่ได้";
    const result = await Swal.fire({ title: 'ยืนยันการทำรายการ?', text: txt, icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ยืนยัน' });
    if(result.isConfirmed) {
        Swal.fire({title: 'กำลังจัดการ...', didOpen: () => Swal.showLoading()});
        await db.from('sdq_assessments').delete().eq('id', id);
        Swal.fire('สำเร็จ!', '', 'success');
        loadData();
    }
}

function exportExcel() {
    // (ฟังก์ชันส่งออก Excel ใช้โค้ดเดิมได้เลย)
    Swal.fire('กำลังสร้างไฟล์', 'รอสักครู่...', 'info');
    if (systemDataList.length === 0) return Swal.fire('ไม่มีข้อมูล', '', 'warning');
    
    const excelData = systemDataList.map(item => {
        const roomTxt = `ม.${item.core_classrooms?.grade_level}/${item.core_classrooms?.room_number}`;
        const assessments = item.sdq_assessments || [];
        const teaEval = assessments.find(a => a.assessor_type === 'teacher');
        const parEval = assessments.find(a => a.assessor_type === 'parent');
        const stdEval = assessments.find(a => a.assessor_type === 'student');
        const mainEval = teaEval || parEval || stdEval;

        if (currentMode === 'teacher') {
            return {
                'เลขที่': item.student_number, 'ชื่อ-นามสกุล': `${item.core_students?.prefix}${item.core_students?.first_name} ${item.core_students?.last_name}`,
                'นร.ประเมิน': stdEval ? 'แล้ว' : 'ยัง', 'ผปค.ประเมิน': parEval ? 'แล้ว' : 'ยัง', 'ครูประเมิน': teaEval ? 'แล้ว' : 'ยัง',
                'คะแนนรวม(ครู)': teaEval ? teaEval.total_difficulty_score : '-'
            };
        } else {
            return {
                'ชั้น/ห้อง': roomTxt, 'เลขที่': item.student_number, 'ชื่อ-นามสกุล': `${item.core_students?.prefix}${item.core_students?.first_name} ${item.core_students?.last_name}`,
                'ผู้ประเมินหลัก': mainEval ? mainEval.assessor_type : '-', 'คะแนนรวม': mainEval ? mainEval.total_difficulty_score : '-',
                'อารมณ์': mainEval ? mainEval.score_emotional : '-', 'ประพฤติ': mainEval ? mainEval.score_conduct : '-',
                'สมาธิสั้น': mainEval ? mainEval.score_hyper : '-', 'เพื่อน': mainEval ? mainEval.score_peer : '-', 'สังคม': mainEval ? mainEval.score_prosocial : '-'
            };
        }
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SDQ_Report");
    XLSX.writeFile(wb, `SDQ_${currentMode}_${new Date().getTime()}.xlsx`);
}

function logout() {
    Swal.fire({ title: 'ออกจากระบบ?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ออกจากระบบ' }).then(async (result) => {
        if (result.isConfirmed) { await db.auth.signOut(); window.location.href = 'login.html'; }
    });
}