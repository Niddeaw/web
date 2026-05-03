let adminData = [];
let tableInstance = null;
let currentSchoolInfo = null;

$(document).ready(async function() {
    await checkAuthAdmin();
    await loadAdminData();
});

// ตรวจสอบสิทธิ์
async function checkAuthAdmin() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error || !session) { window.location.href = 'login.html'; return; }
    
    const user = session.user;
    
    // 1. เช็ค role จากตารางกลาง
    const { data: personnel } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (personnel && personnel.role === 'super_admin') return true;
    
    // 2. เช็คสิทธิ์ระดับ Module (core_module_admins)
    const { data: moduleAdmin } = await db.from('core_module_admins')
        .select('*')
        .eq('user_id', user.id)
        .eq('module_id', 'SDQ_SYSTEM')
        .single();
        
    if (moduleAdmin) return true;

    Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์เป็นผู้ดูแลระบบโมดูลนี้', 'error').then(()=> window.location.href = 'index.html');
}

async function loadAdminData() {
    Swal.fire({title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading()});
    
    try {
        // 1. ดึงข้อมูลปีการศึกษา/ภาคเรียนปัจจุบัน
        const { data: school } = await db.from('core_school_info').select('*').single();
        currentSchoolInfo = school;

        // 2. ดึงข้อมูลห้องเรียนเฉพาะเทอมปัจจุบันมาใส่ Dropdown
        const { data: classrooms } = await db.from('core_classrooms')
            .select('grade_level, room_number')
            .eq('academic_year', school.current_academic_year)
            .eq('semester', school.current_semester)
            .order('grade_level', { ascending: true })
            .order('room_number', { ascending: true });

        populateClassroomFilters(classrooms);

        // 3. ดึงข้อมูลการประเมิน (แก้จาก supabase เป็น db แล้ว)
        const { data: assessments, error } = await db
            .from('sdq_assessments')
            .select(`
                id, assessor_type, total_difficulty_score,
                student_id (student_id_card, prefix, first_name, last_name),
                enrollment_id (student_number, core_classrooms (grade_level, room_number))
            `)
            .eq('academic_year', school.current_academic_year)
            .eq('semester', school.current_semester);

        if (error) throw error;
        
        adminData = assessments || [];
        renderAdminDashboard();
        initAdminTable();
        setupFilters(); // เปิดใช้งานระบบกรองตารางด้วย Dropdown

        Swal.close();
    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลได้: ' + err.message, 'error');
    }
}

// นำข้อมูลชั้น/ห้องมาสร้างตัวเลือกใน Dropdown
function populateClassroomFilters(classrooms) {
    if (!classrooms) return;
    
    let grades = new Set();
    let rooms = new Set();
    
    classrooms.forEach(c => {
        if (c.grade_level) grades.add(c.grade_level);
        if (c.room_number) rooms.add(c.room_number);
    });

    let gradeOptions = '<option value="">ทั้งหมด</option>';
    [...grades].sort((a,b)=>a-b).forEach(g => {
        gradeOptions += `<option value="${g}">ม.${g}</option>`;
    });
    $('#filterGrade').html(gradeOptions);

    let roomOptions = '<option value="">ทั้งหมด</option>';
    [...rooms].sort((a,b)=>a-b).forEach(r => {
        roomOptions += `<option value="${r}">ห้อง ${r}</option>`;
    });
    $('#filterRoom').html(roomOptions);

    // ถ้าโปรเจกต์มี Select2 ให้เรียกใช้งาน
    if ($.fn.select2) {
        $('#filterGrade, #filterRoom').select2({ minimumResultsForSearch: Infinity });
    }
}

function renderAdminDashboard() {
    let n=0, r=0, p=0;
    adminData.forEach(d => {
        if(d.total_difficulty_score <= 15) n++;
        else if(d.total_difficulty_score <= 18) r++;
        else p++;
    });
    $('#allCount').text(adminData.length);
    $('#normalCount').text(n);
    $('#riskCount').text(r);
    $('#probCount').text(p);
}

function initAdminTable() {
    if(tableInstance) tableInstance.destroy();
    let tbody = '';
    
    adminData.forEach(d => {
        // ข้ามข้อมูลที่ผิดพลาด (นักเรียนไม่มีห้อง)
        if (!d.enrollment_id || !d.student_id || !d.enrollment_id.core_classrooms) return;

        const room = d.enrollment_id.core_classrooms;
        const student = d.student_id;
        const statusHTML = d.total_difficulty_score <= 15 ? '<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200">ปกติ</span>' : 
                           d.total_difficulty_score <= 18 ? '<span class="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold border border-amber-200">เสี่ยง</span>' : 
                           '<span class="px-3 py-1 bg-rose-100 text-rose-700 rounded-lg text-xs font-bold border border-rose-200">มีปัญหา</span>';

        tbody += `<tr class="hover:bg-slate-50 transition-colors">
            <td class="text-center font-medium text-slate-700">ม.${room.grade_level}/${room.room_number}</td>
            <td class="text-center text-slate-600">${d.enrollment_id.student_number}</td>
            <td class="text-slate-600">${student.student_id_card || '-'}</td>
            <td class="font-medium text-slate-800">${student.prefix || ''}${student.first_name} ${student.last_name}</td>
            <td class="text-center text-slate-600">${d.assessor_type === 'student' ? 'นักเรียน' : 'ผู้ปกครอง'}</td>
            <td class="text-center font-black text-indigo-600 text-lg">${d.total_difficulty_score}</td>
            <td class="text-center">${statusHTML}</td>
            <td class="text-center">
                <button onclick="deleteRecord('${d.id}')" class="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        </tr>`;
    });

    $('#adminTable tbody').html(tbody);
    
    // ตั้งค่า DataTables ให้สวยงามและรองรับ Responsive
    tableInstance = $('#adminTable').DataTable({
        responsive: true,
        dom: '<"flex flex-col md:flex-row justify-between items-center mb-4 gap-4"lf>rt<"flex flex-col md:flex-row justify-between items-center mt-4 gap-4"ip>',
        language: {url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json',
            search: "",
            searchPlaceholder: "ค้นหารายชื่อ...",
            lengthMenu: "แสดง _MENU_ รายการ",
            info: "แสดง _START_ ถึง _END_ จาก _TOTAL_ รายการ",
            paginate: { previous: "ก่อนหน้า", next: "ถัดไป" },
            emptyTable: "ยังไม่มีข้อมูลการประเมินในเทอมนี้"
        }
    });

    // ปรับแต่งหน้าตาช่องค้นหาของ DataTables (Tailwind)
    $('.dataTables_filter input').addClass('px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 w-full md:w-64');
    $('.dataTables_length select').addClass('px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500');
}

// ระบบกรองตารางเมื่อเลือก Dropdown ชั้น/ห้อง
function setupFilters() {
    $.fn.dataTable.ext.search.push(function(settings, data, dataIndex) {
        let filterGrade = $('#filterGrade').val(); 
        let filterRoom = $('#filterRoom').val();   
        let classText = data[0]; // คอลัมน์ที่ 0 คือ "ชั้น/ห้อง" (เช่น ม.1/1)

        let matchGrade = filterGrade === "" || classText.startsWith('ม.' + filterGrade + '/');
        let matchRoom = filterRoom === "" || classText.endsWith('/' + filterRoom);

        return matchGrade && matchRoom;
    });

    // เมื่อเปลี่ยนค่า Dropdown ให้ตารางคำนวณใหม่
    $('#filterGrade, #filterRoom').on('change', function() {
        tableInstance.draw();
    });
}

async function deleteRecord(id) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบ?',
        text: "ข้อมูลการประเมินนี้จะหายไปอย่างถาวร",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ลบข้อมูล'
    });

    if(result.isConfirmed) {
        Swal.fire({title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading()});
        await db.from('sdq_assessments').delete().eq('id', id);
        Swal.fire('ลบสำเร็จ!', '', 'success');
        loadAdminData(); // รีเฟรชตาราง
    }
}

function exportData() {
    // โค้ดสำหรับ Export เป็น Excel 
    Swal.fire('Coming Soon', 'ระบบ Export กำลังเตรียมพร้อม', 'info');
}

function importExcel() {
    Swal.fire('Coming Soon', 'ฟังก์ชันนำเข้าไฟล์ Offline SheetJS อยู่ระหว่างการพัฒนา', 'info');
}