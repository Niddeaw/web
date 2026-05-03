let teacherInfo = null;
let dtTable = null;
let currentSchoolInfo = null;
let mergedDataList = [];

$(document).ready(async function() {
    await checkAuthTeacher();
    await loadTeacherData();
});

// ตรวจสอบสิทธิ์และอัปเดตชื่อบน Navbar
async function checkAuthTeacher() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error || !session) { window.location.href = 'login.html'; return; }
    
    const user = session.user;
    
    const { data } = await db.from('core_personnel').select('*').eq('id', user.id).single();
    if (data && (data.role === 'teacher' || data.role === 'admin' || data.role === 'super_admin')) {
        teacherInfo = data;
        $('#user-display').text(`ครู${data.first_name} ${data.last_name}`);
    } else {
        Swal.fire('Access Denied', 'เฉพาะบุคลากรเท่านั้น', 'error').then(()=> window.location.href='index.html');
    }
}

// ฟังก์ชันออกจากระบบ
function logout() {
    Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        confirmButtonText: 'ออกจากระบบ'
    }).then(async (result) => {
        if (result.isConfirmed) {
            await db.auth.signOut();
            window.location.href = 'login.html';
        }
    });
}

async function loadTeacherData() {
    Swal.fire({title: 'กำลังโหลดข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false});
    
    try {
        // 1. ดึงข้อมูลปีการศึกษา/เทอม ปัจจุบัน
        const { data: schoolInfo } = await db.from('core_school_info').select('*').single();
        currentSchoolInfo = schoolInfo;
        
        // 2. ดึงห้องเรียนที่ครูคนนี้เป็นที่ปรึกษา (อิงตามเทอมปัจจุบัน)
        const { data: classrooms, error: classErr } = await db.from('core_classrooms')
            .select('*')
            .eq('academic_year', schoolInfo.current_academic_year)
            .eq('semester', schoolInfo.current_semester)
            .or(`adviser_id_1.eq.${teacherInfo.id},adviser_id_2.eq.${teacherInfo.id}`);
            
        if (classErr) throw classErr;

        if (!classrooms || classrooms.length === 0) {
            $('#advising-class-title').text('คุณไม่ได้เป็นที่ปรึกษาในภาคเรียนนี้');
            initTeacherTable([]);
            renderChart([]);
            Swal.close();
            return;
        }

        // สร้างข้อความแสดงชั้นเรียน (เช่น ม.1/1, ม.1/2)
        const classNames = classrooms.map(c => `ม.${c.grade_level}/${c.room_number}`).join(', ');
        $('#advising-class-title').text(`นักเรียนชั้น ${classNames}`);
        
        const classIds = classrooms.map(c => c.id);

        // 3. ดึงรายชื่อนักเรียน "ทั้งหมด" ที่อยู่ในห้องนั้น
        const { data: enrollments, error: enrollErr } = await db.from('student_enrollments')
            .select(`
                id, student_number, classroom_id,
                core_students (id, student_id_card, prefix, first_name, last_name)
            `)
            .in('classroom_id', classIds)
            .order('student_number', { ascending: true });

        if (enrollErr) throw enrollErr;

        // 4. ดึงข้อมูลแบบประเมิน SDQ เฉพาะของนักเรียนกลุ่มนี้
        const enrollmentIds = enrollments.map(e => e.id);
        const { data: assessments, error: sdqErr } = await db.from('sdq_assessments')
            .select('*')
            .in('enrollment_id', enrollmentIds);
            
        if (sdqErr) throw sdqErr;

        // 5. จับคู่ข้อมูล (นักเรียน + ผลประเมิน)
        mergedDataList = enrollments.map(enr => {
            // หาข้อมูลประเมินของเด็กคนนี้
            const assessment = assessments.find(a => a.enrollment_id === enr.id);
            return {
                enrollment: enr,
                student: enr.core_students,
                assessment: assessment || null // ถ้าไม่มีคือยังไม่ประเมิน
            };
        });
        
        initTeacherTable(mergedDataList);
        renderChart(mergedDataList);
        Swal.close();
        
    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}

function initTeacherTable(data) {
    if (dtTable) dtTable.destroy();
    
    let tbody = '';
    data.forEach(item => {
        const student = item.student;
        const enroll = item.enrollment;
        const sdq = item.assessment;

        let statusBadge = '';
        let scoreText = '-';
        let riskBadge = '-';
        let actionButtons = '';

        if (sdq) {
            // กรณีทำแบบประเมินแล้ว
            statusBadge = '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs"><i class="fa-solid fa-check-circle mr-1"></i>ประเมินแล้ว</span>';
            scoreText = `<span class="font-black text-indigo-600 text-lg">${sdq.total_difficulty_score}</span>`;
            
            riskBadge = sdq.total_difficulty_score <= 15 ? '<span class="px-2 py-1 bg-emerald-100 text-emerald-700 font-bold rounded-lg text-xs border border-emerald-200">ปกติ</span>' : 
                        sdq.total_difficulty_score <= 18 ? '<span class="px-2 py-1 bg-amber-100 text-amber-700 font-bold rounded-lg text-xs border border-amber-200">เสี่ยง</span>' : 
                        '<span class="px-2 py-1 bg-rose-100 text-rose-700 font-bold rounded-lg text-xs border border-rose-200">มีปัญหา</span>';

            // 🌟 สร้าง 4 ปุ่ม (ดู, แก้ไข, ลบ, พิมพ์)
            actionButtons = `
                <div class="flex justify-center gap-1.5">
                    <button onclick="viewSDQ('${sdq.id}')" class="h-8 w-8 bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white rounded-lg transition shadow-sm" title="ดูผลประเมิน"><i class="fa-solid fa-eye"></i></button>
                    <button onclick="editSDQ('${sdq.id}')" class="h-8 w-8 bg-amber-50 text-amber-600 hover:bg-amber-500 hover:text-white rounded-lg transition shadow-sm" title="แก้ไขข้อมูล"><i class="fa-solid fa-pen"></i></button>
                    <button onclick="deleteSDQ('${sdq.id}')" class="h-8 w-8 bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white rounded-lg transition shadow-sm" title="ลบแบบประเมิน"><i class="fa-solid fa-trash"></i></button>
                    <button onclick="printSDQ('${sdq.id}')" class="h-8 w-8 bg-slate-100 text-slate-600 hover:bg-slate-600 hover:text-white rounded-lg transition shadow-sm" title="พิมพ์รายงาน"><i class="fa-solid fa-print"></i></button>
                </div>
            `;
        } else {
            // กรณียังไม่ทำแบบประเมิน
            statusBadge = '<span class="px-2 py-1 bg-slate-100 text-slate-500 font-bold rounded-lg text-xs border border-slate-200">ยังไม่ประเมิน</span>';
            actionButtons = '<span class="text-xs text-slate-400 font-medium">ไม่มีข้อมูลจัดการ</span>';
        }

        tbody += `<tr class="hover:bg-indigo-50/50 transition-colors">
            <td class="p-4 border-b text-center text-slate-600 font-medium">${enroll.student_number || '-'}</td>
            <td class="p-4 border-b text-slate-600 font-mono text-xs">${student.student_id_card || '-'}</td>
            <td class="p-4 border-b font-bold text-slate-700">${student.prefix || ''}${student.first_name} ${student.last_name}</td>
            <td class="p-4 border-b text-center">${statusBadge}</td>
            <td class="p-4 border-b text-center">${scoreText}</td>
            <td class="p-4 border-b text-center">${riskBadge}</td>
            <td class="p-4 border-b text-center min-w-[140px]">${actionButtons}</td>
        </tr>`;
    });
    
    $('#teacherTable tbody').html(tbody);
    
    // ตั้งค่า DataTables
    dtTable = $('#teacherTable').DataTable({ 
        responsive: true,
        dom: '<"flex flex-col md:flex-row justify-between items-center mb-4 gap-4"lf>rt<"flex flex-col md:flex-row justify-between items-center mt-4 gap-4"ip>',
        language: {
            search: "",
            searchPlaceholder: "ค้นหาชื่อ หรือ เลขที่...",
            lengthMenu: "แสดง _MENU_ คน",
            info: "แสดง _START_ ถึง _END_ จากทั้งหมด _TOTAL_ คน",
            paginate: { previous: "ก่อนหน้า", next: "ถัดไป" }
        },
        pageLength: 50
    });
    
    // ตกแต่งช่องค้นหา DataTables
    $('.dataTables_filter input').addClass('px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 w-full md:w-64 bg-white');
    $('.dataTables_length select').addClass('px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 bg-white');
}

function renderChart(data) {
    let normal = 0, risk = 0, problem = 0;
    let assessedCount = 0;

    data.forEach(item => {
        if (item.assessment) {
            assessedCount++;
            const score = item.assessment.total_difficulty_score;
            if(score <= 15) normal++;
            else if(score <= 18) risk++;
            else problem++;
        }
    });

    // อัปเดตตัวเลขการประเมิน
    $('#statCompleted').text(`${assessedCount} / ${data.length}`);

    const chartContainer = document.getElementById('sdqChart');
    if(window.mySdqChart) { window.mySdqChart.destroy(); }

    if (assessedCount > 0) {
        window.mySdqChart = new Chart(chartContainer, {
            type: 'doughnut',
            data: {
                labels: ['ปกติ', 'เสี่ยง', 'มีปัญหา'],
                datasets: [{
                    data: [normal, risk, problem],
                    backgroundColor: ['#10b981', '#f59e0b', '#f43f5e'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                plugins: { legend: { position: 'right' } },
                cutout: '70%'
            }
        });
    } else {
        window.mySdqChart = new Chart(chartContainer, {
            type: 'doughnut',
            data: {
                labels: ['ยังไม่มีข้อมูลประเมิน'],
                datasets: [{ data: [1], backgroundColor: ['#f1f5f9'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

// ----------------------------------------------------
// ฟังก์ชันสำหรับ 4 ปุ่มการจัดการ (ดู, แก้ไข, ลบ, พิมพ์)
// ----------------------------------------------------

function viewSDQ(id) {
    Swal.fire('ดูรายละเอียด', 'ฟังก์ชันนี้จะเปิด Modal แสดงคะแนนย่อย 5 ด้าน', 'info');
    // โค้ดสำหรับดึงข้อมูลรายข้อมาแสดงใน Modal
}

function editSDQ(id) {
    Swal.fire('แก้ไขข้อมูล', 'ฟังก์ชันนี้จะพาไปยังหน้ากรอกฟอร์มเพื่อแก้ไขคำตอบ', 'info');
    // สามารถ window.location.href = `sdq_edit.html?id=${id}`
}

async function deleteSDQ(id) {
    const result = await Swal.fire({
        title: 'ยืนยันการลบผลประเมิน?',
        text: "ข้อมูลจะถูกลบอย่างถาวรและนักเรียนจะต้องทำใหม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'ใช่, ลบเลย!'
    });

    if(result.isConfirmed) {
        Swal.fire({title: 'กำลังลบ...', didOpen: () => Swal.showLoading()});
        await db.from('sdq_assessments').delete().eq('id', id);
        Swal.fire('ลบสำเร็จ!', '', 'success');
        loadTeacherData(); // รีเฟรชตารางใหม่
    }
}

function printSDQ(id) {
    Swal.fire('พิมพ์รายงาน', 'กำลังเตรียมสร้างไฟล์ PDF สำหรับนักเรียนคนนี้', 'info');
    // โค้ดสำหรับดึงข้อมูลและใช้ html2pdf หรือสร้างหน้าต่าง window.print()
}

function exportTeacherExcel() {
    if (!dtTable || !dtTable.data().any()) {
        return Swal.fire('แจ้งเตือน', 'ไม่มีข้อมูลให้ส่งออก', 'warning');
    }
    let wb = XLSX.utils.table_to_book(document.getElementById('teacherTable'), {sheet:"SDQ_Result"});
    XLSX.writeFile(wb, `SDQ_Class_Result.xlsx`);
}