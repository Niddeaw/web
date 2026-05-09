// sdq_admin.js - Complete Version
// ระบบจัดการ SDQ สำหรับผู้ดูแลระบบ

let adminData = [];
let tableInstance = null;
let currentSchoolInfo = null;
let overviewChartInstance = null;
let gradeChartInstance = null;
let scoreByGradeChartInstance = null;

$(document).ready(async function () {
    await checkAuthAdmin();
    await loadAdminData();
});

// ==========================================
// 🔐 ตรวจสอบสิทธิ์ผู้ดูแลระบบ
// ==========================================
async function checkAuthAdmin() {
    const { data: { session }, error } = await db.auth.getSession();
    if (error || !session) {
        window.location.href = 'login.html';
        return;
    }

    const user = session.user;

    // 1. เช็ค role จากตารางกลาง
    const { data: personnel } = await db.from('core_personnel')
        .select('*')
        .eq('id', user.id)
        .single();

    if (personnel && personnel.role === 'super_admin') return true;

    // 2. เช็คสิทธิ์ระดับ Module (core_module_admins)
    const { data: moduleAdmin } = await db.from('core_module_admins')
        .select('*')
        .eq('user_id', user.id)
        .eq('module_id', 'sdq')
        .single();

    if (moduleAdmin) return true;

    // ไม่มีสิทธิ์
    Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์เป็นผู้ดูแลระบบโมดูลนี้', 'error')
        .then(() => window.location.href = 'index.html');
}

// ==========================================
// 📊 โหลดข้อมูลทั้งหมด
// ==========================================
async function loadAdminData() {
    Swal.fire({
        title: 'กำลังโหลดข้อมูล...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

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

        // 3. ดึงข้อมูลการประเมิน
        const { data: assessments, error } = await db
            .from('sdq_assessments')
            .select(`
                id, 
                assessor_type, 
                total_difficulty_score,
                score_emotional, 
                score_conduct, 
                score_hyper, 
                score_peer, 
                score_prosocial,
                created_at,
                academic_year,
                semester,
                student_id (student_id_card, prefix, first_name, last_name),
                enrollment_id (student_number, core_classrooms (grade_level, room_number))
            `)
            .eq('academic_year', school.current_academic_year)
            .eq('semester', school.current_semester);

        if (error) throw error;

        adminData = assessments || [];
        renderAdminDashboard();
        initAdminTable();
        setupFilters();

        Swal.close();
    } catch (err) {
        console.error('Load data error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลได้: ' + err.message, 'error');
    }
}

// ==========================================
// 🏫 จัดการ Dropdown กรองชั้น/ห้อง
// ==========================================
function populateClassroomFilters(classrooms) {
    if (!classrooms) return;

    let grades = new Set();
    let rooms = new Set();

    classrooms.forEach(c => {
        if (c.grade_level) grades.add(c.grade_level);
        if (c.room_number) rooms.add(c.room_number);
    });

    let gradeOptions = '<option value="">ทั้งหมด</option>';
    [...grades].sort((a, b) => a - b).forEach(g => {
        gradeOptions += `<option value="${g}">ม.${g}</option>`;
    });
    $('#filterGrade').html(gradeOptions);

    let roomOptions = '<option value="">ทั้งหมด</option>';
    [...rooms].sort((a, b) => a - b).forEach(r => {
        roomOptions += `<option value="${r}">ห้อง ${r}</option>`;
    });
    $('#filterRoom').html(roomOptions);
}

// ==========================================
// 📈 แสดงแดชบอร์ดและกราฟ
// ==========================================
function renderAdminDashboard() {
    let n = 0, r = 0, p = 0;
    adminData.forEach(d => {
        if (d.total_difficulty_score <= 15) n++;
        else if (d.total_difficulty_score <= 18) r++;
        else p++;
    });

    $('#allCount').text(adminData.length);
    $('#normalCount').text(n);
    $('#riskCount').text(r);
    $('#probCount').text(p);

    // Render กราฟ
    populateGradeFilter();
    renderOverviewChart();
    renderGradeChart('all');
    renderScoreByGradeChart();
}

function populateGradeFilter() {
    const grades = new Set();
    adminData.forEach(d => {
        const room = d.enrollment_id?.core_classrooms;
        if (room && room.grade_level) grades.add(room.grade_level);
    });

    let options = '<option value="all">ทุกชั้น</option>';
    [...grades].sort((a, b) => a - b).forEach(g => {
        options += `<option value="${g}">มัธยมศึกษาปีที่ ${g}</option>`;
    });
    $('#chartGradeFilter').html(options);

    $('#chartGradeFilter').off('change').on('change', function () {
        renderGradeChart($(this).val());
    });
}

function renderOverviewChart() {
    const ctx = document.getElementById('overviewChart');
    if (!ctx) return;

    if (overviewChartInstance) overviewChartInstance.destroy();

    let normalCount = 0, riskCount = 0, problemCount = 0;
    adminData.forEach(d => {
        if (d.total_difficulty_score <= 15) normalCount++;
        else if (d.total_difficulty_score <= 18) riskCount++;
        else problemCount++;
    });

    overviewChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['ปกติ (0-15)', 'เสี่ยง (16-18)', 'มีปัญหา (19-40)'],
            datasets: [{
                data: [normalCount, riskCount, problemCount],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 2,
                hoverBorderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true,
                        font: { size: 13, family: "'Sarabun', sans-serif" }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${context.label}: ${context.parsed} คน (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderGradeChart(selectedGrade = 'all') {
    const ctx = document.getElementById('gradeChart');
    if (!ctx) return;

    if (gradeChartInstance) gradeChartInstance.destroy();

    let filteredData = adminData;
    if (selectedGrade !== 'all') {
        filteredData = adminData.filter(d => {
            const room = d.enrollment_id?.core_classrooms;
            return room && room.grade_level == selectedGrade;
        });
    }

    const normalCount = filteredData.filter(d => d.total_difficulty_score <= 15).length;
    const riskCount = filteredData.filter(d => d.total_difficulty_score > 15 && d.total_difficulty_score <= 18).length;
    const problemCount = filteredData.filter(d => d.total_difficulty_score > 18).length;

    const title = selectedGrade === 'all' ? 'ทุกชั้น' : `ม.${selectedGrade}`;

    gradeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['ปกติ', 'เสี่ยง', 'มีปัญหา'],
            datasets: [{
                label: `จำนวนนักเรียน (${title})`,
                data: [normalCount, riskCount, problemCount],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.8)',
                    'rgba(245, 158, 11, 0.8)',
                    'rgba(239, 68, 68, 0.8)'
                ],
                borderColor: [
                    'rgba(16, 185, 129, 1)',
                    'rgba(245, 158, 11, 1)',
                    'rgba(239, 68, 68, 1)'
                ],
                borderWidth: 2,
                borderRadius: 8,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.parsed.y / total) * 100).toFixed(1) : 0;
                            return `${context.parsed.y} คน (${percentage}%)`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: { family: "'Sarabun', sans-serif" }
                    },
                    grid: { display: true, color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    ticks: {
                        font: { family: "'Sarabun', sans-serif", weight: 'bold' }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

function renderScoreByGradeChart() {
    const ctx = document.getElementById('scoreByGradeChart');
    if (!ctx) return;

    if (scoreByGradeChartInstance) scoreByGradeChartInstance.destroy();

    const gradeMap = {};
    adminData.forEach(d => {
        const room = d.enrollment_id?.core_classrooms;
        if (!room || !room.grade_level) return;

        const g = room.grade_level;
        if (!gradeMap[g]) {
            gradeMap[g] = {
                emotional: [], conduct: [], hyper: [], peer: [], prosocial: []
            };
        }
        gradeMap[g].emotional.push(d.score_emotional || 0);
        gradeMap[g].conduct.push(d.score_conduct || 0);
        gradeMap[g].hyper.push(d.score_hyper || 0);
        gradeMap[g].peer.push(d.score_peer || 0);
        gradeMap[g].prosocial.push(d.score_prosocial || 0);
    });

    const grades = Object.keys(gradeMap).sort((a, b) => a - b);

    const avgScores = {
        emotional: [],
        conduct: [],
        hyper: [],
        peer: [],
        prosocial: []
    };

    grades.forEach(g => {
        const data = gradeMap[g];
        avgScores.emotional.push((data.emotional.reduce((a, b) => a + b, 0) / data.emotional.length).toFixed(1));
        avgScores.conduct.push((data.conduct.reduce((a, b) => a + b, 0) / data.conduct.length).toFixed(1));
        avgScores.hyper.push((data.hyper.reduce((a, b) => a + b, 0) / data.hyper.length).toFixed(1));
        avgScores.peer.push((data.peer.reduce((a, b) => a + b, 0) / data.peer.length).toFixed(1));
        avgScores.prosocial.push((data.prosocial.reduce((a, b) => a + b, 0) / data.prosocial.length).toFixed(1));
    });

    scoreByGradeChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: grades.map(g => `ม.${g}`),
            datasets: [
                {
                    label: 'ด้านอารมณ์',
                    data: avgScores.emotional,
                    borderColor: 'rgba(99, 102, 241, 1)',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'ความประพฤติ',
                    data: avgScores.conduct,
                    borderColor: 'rgba(239, 68, 68, 1)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'ไม่อยู่นิ่ง',
                    data: avgScores.hyper,
                    borderColor: 'rgba(245, 158, 11, 1)',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'ความสัมพันธ์กับเพื่อน',
                    data: avgScores.peer,
                    borderColor: 'rgba(16, 185, 129, 1)',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 7
                },
                {
                    label: 'ด้านสังคม',
                    data: avgScores.prosocial,
                    borderColor: 'rgba(139, 92, 246, 1)',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: { family: "'Sarabun', sans-serif" }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 10,
                    ticks: {
                        font: { family: "'Sarabun', sans-serif" }
                    },
                    grid: { display: true, color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    ticks: {
                        font: { family: "'Sarabun', sans-serif", weight: 'bold' }
                    },
                    grid: { display: false }
                }
            }
        }
    });
}

// ==========================================
// 📋 ตารางข้อมูล DataTables
// ==========================================
function initAdminTable() {
    if (tableInstance) tableInstance.destroy();

    let tbody = '';

    adminData.forEach(d => {
        if (!d.enrollment_id || !d.student_id || !d.enrollment_id.core_classrooms) return;

        const room = d.enrollment_id.core_classrooms;
        const student = d.student_id;
        const statusHTML = d.total_difficulty_score <= 15
            ? '<span class="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold border border-emerald-200">ปกติ</span>'
            : d.total_difficulty_score <= 18
                ? '<span class="px-3 py-1 bg-amber-100 text-amber-700 rounded-lg text-xs font-bold border border-amber-200">เสี่ยง</span>'
                : '<span class="px-3 py-1 bg-rose-100 text-rose-700 rounded-lg text-xs font-bold border border-rose-200">มีปัญหา</span>';

        tbody += `<tr class="hover:bg-slate-50 transition-colors">
            <td class="text-center font-medium text-slate-700">ม.${room.grade_level}/${room.room_number}</td>
            <td class="text-center text-slate-600">${d.enrollment_id.student_number}</td>
            <td class="text-slate-600">${student.student_id_card || '-'}</td>
            <td class="font-medium text-slate-800">${student.prefix || ''}${student.first_name} ${student.last_name}</td>
            <td class="text-center text-slate-600">${d.assessor_type === 'student' ? 'นักเรียน' : 'ผู้ปกครอง'}</td>
            <td class="text-center font-black text-indigo-600 text-lg">${d.total_difficulty_score}</td>
            <td class="text-center">${statusHTML}</td>
            <td class="text-center">
                <div class="flex justify-center gap-1">
                    <button onclick="viewAssessment('${d.id}')" 
                            class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-500 hover:text-white transition-colors"
                            title="ดูรายละเอียด">
                        <i class="fa-solid fa-eye"></i>
                    </button>
                    <button onclick="resetRecord('${d.id}')" 
                            class="w-8 h-8 rounded-lg bg-yellow-50 text-yellow-600 hover:bg-yellow-500 hover:text-white transition-colors"
                            title="รีเซ็ตให้นักเรียนทำใหม่">
                        <i class="fa-solid fa-rotate-right"></i>
                    </button>
                    <button onclick="printAssessmentPDF('${d.id}')" 
                            class="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-500 hover:text-white transition-colors"
                            title="พิมพ์ PDF">
                        <i class="fa-solid fa-file-pdf"></i>
                    </button>
                    <button onclick="deleteRecord('${d.id}')" 
                            class="w-8 h-8 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors"
                            title="ลบข้อมูล">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>`;
    });

    $('#adminTable tbody').html(tbody);

    tableInstance = $('#adminTable').DataTable({
        responsive: true,
        dom: '<"flex flex-col md:flex-row justify-between items-center mb-4 gap-4"lf>rt<"flex flex-col md:flex-row justify-between items-center mt-4 gap-4"ip>',
        language: {
            url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json',
            search: "",
            searchPlaceholder: "ค้นหารายชื่อ...",
            lengthMenu: "แสดง _MENU_ รายการ",
            info: "แสดง _START_ ถึง _END_ จาก _TOTAL_ รายการ",
            paginate: { previous: "ก่อนหน้า", next: "ถัดไป" },
            emptyTable: "ยังไม่มีข้อมูลการประเมินในเทอมนี้"
        }
    });

    $('.dataTables_filter input').addClass('px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 w-full md:w-64');
    $('.dataTables_length select').addClass('px-4 py-2 border border-slate-200 rounded-xl outline-none focus:border-indigo-500');
}

function setupFilters() {
    $.fn.dataTable.ext.search.push(function (settings, data, dataIndex) {
        let filterGrade = $('#filterGrade').val();
        let filterRoom = $('#filterRoom').val();
        let classText = data[0];
        let matchGrade = filterGrade === "" || classText.startsWith('ม.' + filterGrade + '/');
        let matchRoom = filterRoom === "" || classText.endsWith('/' + filterRoom);
        return matchGrade && matchRoom;
    });

    $('#filterGrade, #filterRoom').on('change', function () {
        tableInstance.draw();
    });
}

// ==========================================
// 👁️ ดูผลการประเมิน
// ==========================================
async function viewAssessment(id) {
    const record = adminData.find(d => d.id == id);
    if (!record) return Swal.fire('ไม่พบข้อมูล', '', 'error');

    const student = record.student_id;
    const room = record.enrollment_id?.core_classrooms;
    const status = record.total_difficulty_score <= 15 ? 'ปกติ' : record.total_difficulty_score <= 18 ? 'เสี่ยง' : 'มีปัญหา';
    const statusColor = status === 'ปกติ' ? 'emerald' : status === 'เสี่ยง' ? 'amber' : 'rose';

    const html = `
        <div class="text-left space-y-3">
            <div class="text-lg font-bold">${student.prefix || ''}${student.first_name} ${student.last_name}</div>
            <div class="text-sm text-slate-500">
                ${room ? `ม.${room.grade_level}/${room.room_number}` : ''} | 
                ผู้ประเมิน: ${record.assessor_type === 'student' ? 'นักเรียน' : 'ผู้ปกครอง'}
            </div>
            <hr/>
            <div class="grid grid-cols-2 gap-2">
                <div class="flex justify-between"><span>😢 ด้านอารมณ์</span> <span class="font-bold">${record.score_emotional}</span></div>
                <div class="flex justify-between"><span>😠 ความประพฤติ</span> <span class="font-bold">${record.score_conduct}</span></div>
                <div class="flex justify-between"><span>⚡ ไม่อยู่นิ่ง</span> <span class="font-bold">${record.score_hyper}</span></div>
                <div class="flex justify-between"><span>🤝 ความสัมพันธ์กับเพื่อน</span> <span class="font-bold">${record.score_peer}</span></div>
                <div class="flex justify-between"><span>🌟 ด้านสังคม</span> <span class="font-bold">${record.score_prosocial}</span></div>
            </div>
            <hr/>
            <div class="text-xl font-black text-center text-indigo-600">
                คะแนนรวม: ${record.total_difficulty_score} / 40
            </div>
            <div class="text-center text-sm font-bold text-${statusColor}-600">
                สถานะ: ${status}
            </div>
        </div>
    `;
    Swal.fire({ title: 'ผลการประเมิน SDQ', html: html, confirmButtonText: 'ปิด' });
}

// ==========================================
// 🔄 รีเซ็ตข้อมูล
// ==========================================
async function resetRecord(id) {
    const result = await Swal.fire({
        title: 'ยืนยันการรีเซ็ต',
        text: 'ข้อมูลการประเมินนี้จะถูกลบ นักเรียนจะสามารถทำแบบประเมินใหม่ได้ในเทอมนี้',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f59e0b',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: 'รีเซ็ตเลย'
    });

    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังรีเซ็ต...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('sdq_assessments').delete().eq('id', id);
        if (error) {
            Swal.fire('ผิดพลาด', 'ไม่สามารถรีเซ็ตได้: ' + error.message, 'error');
        } else {
            Swal.fire('รีเซ็ตสำเร็จ!', 'นักเรียนสามารถเข้าไปทำแบบประเมินใหม่ได้', 'success');
            loadAdminData();
        }
    }
}

// ==========================================
// 🖨️ พิมพ์ PDF รายบุคคล
// ==========================================
async function printAssessmentPDF(id) {
    const record = adminData.find(d => d.id == id);
    if (!record) return Swal.fire('ไม่พบข้อมูล', '', 'error');

    const student = record.student_id;
    const room = record.enrollment_id?.core_classrooms;
    const status = record.total_difficulty_score <= 15 ? 'ปกติ' : record.total_difficulty_score <= 18 ? 'เสี่ยง' : 'มีปัญหา';
    const statusColor = status === 'ปกติ' ? '#10b981' : status === 'เสี่ยง' ? '#f59e0b' : '#ef4444';

    const assessmentDate = record.created_at
        ? new Date(record.created_at).toLocaleDateString('th-TH', {
            year: 'numeric', month: 'long', day: 'numeric',
        })
        : new Date().toLocaleDateString('th-TH', {
            year: 'numeric', month: 'long', day: 'numeric',
        });

    // 🔑 ชื่อโรงเรียน
    const schoolName = currentSchoolInfo?.school_name || currentSchoolInfo?.name || 'โรงเรียน';
    const academicYear = record.academic_year || currentSchoolInfo?.current_academic_year || '-';
    const semester = record.semester || currentSchoolInfo?.current_semester || '-';
    const semesterText = semester === 1 ? 'ภาคเรียนที่ 1' : semester === 2 ? 'ภาคเรียนที่ 2' : `ภาคเรียนที่ ${semester}`;

    const tempDiv = document.createElement('div');
    tempDiv.style.cssText = 'font-family: "Sarabun", sans-serif; padding: 15px; max-width: 700px; margin: auto;';
    tempDiv.innerHTML = `
        <!-- 🔑 เพิ่มชื่อโรงเรียนด้านบน -->
        <div style="text-align: center; margin-bottom: 10px;">
            <div style="font-size: 14px; color: #4f46e5; font-weight: bold; letter-spacing: 1px;">${schoolName}</div>
        </div>
        
        <div style="text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-bottom: 15px;">
            <h2 style="color: #1e293b; margin: 0 0 3px 0; font-size: 20px;">📋 ผลการประเมิน SDQ</h2>
            <p style="color: #64748b; margin: 0; font-size: 12px;">Strengths and Difficulties Questionnaire</p>
        </div>
        
        <div style="display: flex; gap: 15px; margin-bottom: 15px; page-break-inside: avoid;">
            <div style="flex: 1; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 10px; padding: 10px 15px; color: white;">
                <div style="font-size: 11px; opacity: 0.9;">📅 ปีการศึกษา</div>
                <div style="font-size: 18px; font-weight: 900;">${academicYear}</div>
                <div style="font-size: 12px; opacity: 0.9;">${semesterText}</div>
            </div>
            <div style="flex: 1; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 10px; padding: 10px 15px; color: white;">
                <div style="font-size: 11px; opacity: 0.9;">📆 วันที่ประเมิน</div>
                <div style="font-size: 14px; font-weight: 700; margin-top: 3px;">${assessmentDate}</div>
            </div>
        </div>
        
        <div style="display: flex; gap: 20px; margin-bottom: 15px; page-break-inside: avoid;">
            <div style="flex: 1; background: #f8fafc; border-radius: 10px; padding: 12px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <tr><td style="padding: 3px 0; color: #64748b; width: 80px;">👤 ชื่อ-สกุล</td><td style="padding: 3px 0; font-weight: bold;">${student.prefix || ''}${student.first_name} ${student.last_name}</td></tr>
                    <tr><td style="padding: 3px 0; color: #64748b;">📚 ระดับชั้น</td><td style="padding: 3px 0; font-weight: bold;">${room ? `ม.${room.grade_level}/${room.room_number}` : '-'}</td></tr>
                    <tr><td style="padding: 3px 0; color: #64748b;">🆔 รหัส</td><td style="padding: 3px 0; font-weight: bold;">${student.student_id_card || '-'}</td></tr>
                    <tr><td style="padding: 3px 0; color: #64748b;">👥 ผู้ประเมิน</td><td style="padding: 3px 0; font-weight: bold;">${record.assessor_type === 'student' ? 'นักเรียนประเมินตนเอง' : 'ผู้ปกครองประเมิน'}</td></tr>
                </table>
            </div>
            <div style="flex: 1.2; page-break-inside: avoid;">
                <canvas id="pdfChart_${id}" width="300" height="200" style="max-width: 100%;"></canvas>
            </div>
        </div>
        
        <div style="page-break-inside: avoid; margin-bottom: 15px;">
            <h3 style="color: #334155; margin-bottom: 8px; font-size: 16px;">📝 คะแนนรายด้าน</h3>
            <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 13px;">
                <thead>
                    <tr style="background: #f1f5f9;">
                        <th style="padding: 8px 10px; text-align: left; border-bottom: 2px solid #e2e8f0;">ด้าน</th>
                        <th style="padding: 8px 10px; text-align: center; border-bottom: 2px solid #e2e8f0;">คะแนน</th>
                        <th style="padding: 8px 10px; text-align: center; border-bottom: 2px solid #e2e8f0;">เต็ม</th>
                        <th style="padding: 8px 10px; text-align: center; border-bottom: 2px solid #e2e8f0;">ระดับ</th>
                    </tr>
                </thead>
                <tbody>
                    ${createScoreRow('😢 ด้านอารมณ์', record.score_emotional)}
                    ${createScoreRow('😠 ความประพฤติ', record.score_conduct)}
                    ${createScoreRow('⚡ ไม่อยู่นิ่ง/สมาธิสั้น', record.score_hyper)}
                    ${createScoreRow('🤝 ความสัมพันธ์กับเพื่อน', record.score_peer)}
                    ${createScoreRow('🌟 ด้านสังคม', record.score_prosocial)}
                </tbody>
            </table>
        </div>
        
        <div style="page-break-inside: avoid; background: ${statusColor}15; border: 2px solid ${statusColor}; border-radius: 10px; padding: 15px; text-align: center;">
            <div style="font-size: 13px; color: #64748b; margin-bottom: 3px;">คะแนนรวมความยากลำบาก</div>
            <div style="font-size: 42px; font-weight: 900; color: ${statusColor};">${record.total_difficulty_score}<span style="font-size: 16px; font-weight: normal; color: #94a3b8;"> / 40</span></div>
            <div style="display: inline-block; margin-top: 8px; background: ${statusColor}; color: white; padding: 6px 20px; border-radius: 20px; font-weight: bold; font-size: 14px;">สถานะ: ${status}</div>
        </div>
        
        <div style="text-align: center; margin-top: 12px; color: #94a3b8; font-size: 11px; page-break-inside: avoid;">
            <div>🏫 ${schoolName}</div>
            <div>📅 ปีการศึกษา ${academicYear} | ${semesterText}</div>
            <div>พิมพ์เมื่อ: ${new Date().toLocaleDateString('th-TH')} | ระบบดูแลช่วยเหลือนักเรียน WRK System</div>
        </div>
    `;

    document.body.appendChild(tempDiv);
    await new Promise(resolve => setTimeout(resolve, 200));

    const canvas = tempDiv.querySelector(`#pdfChart_${id}`);
    if (canvas) {
        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['ด้านอารมณ์', 'ความประพฤติ', 'ไม่อยู่นิ่ง', 'ความสัมพันธ์เพื่อน', 'ด้านสังคม'],
                datasets: [{
                    label: 'คะแนน SDQ',
                    data: [record.score_emotional, record.score_conduct, record.score_hyper, record.score_peer, record.score_prosocial],
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgba(99, 102, 241, 1)',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 10,
                        ticks: { stepSize: 2, font: { size: 9 } },
                        pointLabels: { font: { size: 10 } }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    await html2pdf().set({
        margin: [0.3, 0.3, 0.3, 0.3],
        filename: `SDQ_${academicYear}_S${semester}_${student.student_id_card || student.first_name}_${record.assessor_type}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'], avoid: ['tr', '.keep-together'] }
    }).from(tempDiv).save();

    setTimeout(() => {
        if (tempDiv && tempDiv.parentNode) document.body.removeChild(tempDiv);
    }, 500);
}

function createScoreRow(label, score) {
    return `
        <tr>
            <td style="padding: 6px 10px; border-bottom: 1px solid #f1f5f9;">${label}</td>
            <td style="padding: 6px 10px; text-align: center; font-weight: bold;">${score}</td>
            <td style="padding: 6px 10px; text-align: center; color: #94a3b8;">10</td>
            <td style="padding: 6px 10px; text-align: center;">${getScoreBar(score, 10)}</td>
        </tr>
    `;
}

function getScoreBar(score, max) {
    const percentage = (score / max) * 100;
    let color = '#10b981';
    if (percentage > 70) color = '#ef4444';
    else if (percentage > 50) color = '#f59e0b';

    return `
        <div style="display: flex; align-items: center; gap: 4px; justify-content: center;">
            <div style="width: 50px; height: 5px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                <div style="width: ${percentage}%; height: 100%; background: ${color}; border-radius: 3px;"></div>
            </div>
            <span style="font-size: 10px; color: #64748b;">${percentage.toFixed(0)}%</span>
        </div>
    `;
}

// ==========================================
// 🗑️ ลบข้อมูล
// ==========================================
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

    if (result.isConfirmed) {
        Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        const { error } = await db.from('sdq_assessments').delete().eq('id', id);
        if (error) {
            Swal.fire('ผิดพลาด', 'ไม่สามารถลบได้: ' + error.message, 'error');
        } else {
            Swal.fire('ลบสำเร็จ!', '', 'success');
            loadAdminData();
        }
    }
}

// ==========================================
// 📊 พิมพ์สรุปภาพรวม PDF
// ==========================================
async function printSummaryPDF() {
    if (adminData.length === 0) {
        return Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีข้อมูลการประเมินในเทอมนี้', 'info');
    }

    Swal.fire({
        title: 'กำลังสร้าง PDF...',
        didOpen: () => Swal.showLoading(),
        allowOutsideClick: false
    });

    try {
        const totalStudents = adminData.length;
        let normalCount = 0, riskCount = 0, problemCount = 0;

        const gradeStats = {};
        const domainScores = {
            emotional: [], conduct: [], hyper: [], peer: [], prosocial: []
        };

        adminData.forEach(d => {
            if (d.total_difficulty_score <= 15) normalCount++;
            else if (d.total_difficulty_score <= 18) riskCount++;
            else problemCount++;

            domainScores.emotional.push(d.score_emotional || 0);
            domainScores.conduct.push(d.score_conduct || 0);
            domainScores.hyper.push(d.score_hyper || 0);
            domainScores.peer.push(d.score_peer || 0);
            domainScores.prosocial.push(d.score_prosocial || 0);

            const room = d.enrollment_id?.core_classrooms;
            if (room && room.grade_level) {
                const grade = room.grade_level;
                if (!gradeStats[grade]) {
                    gradeStats[grade] = { total: 0, normal: 0, risk: 0, problem: 0 };
                }
                gradeStats[grade].total++;
                if (d.total_difficulty_score <= 15) gradeStats[grade].normal++;
                else if (d.total_difficulty_score <= 18) gradeStats[grade].risk++;
                else gradeStats[grade].problem++;
            }
        });

        const avgScore = (arr) => (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
        const sortedGrades = Object.keys(gradeStats).sort((a, b) => a - b);

        let gradeTableRows = '';
        sortedGrades.forEach(grade => {
            const stats = gradeStats[grade];
            gradeTableRows += `
                <tr>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: bold;">ม.${grade}</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">${stats.total}</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #10b981;">${stats.normal}</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #f59e0b;">${stats.risk}</td>
                    <td style="padding: 8px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; color: #ef4444;">${stats.problem}</td>
                </tr>
            `;
        });

        // 🔑 ชื่อโรงเรียน
        const schoolName = currentSchoolInfo?.school_name || currentSchoolInfo?.name || 'โรงเรียน';
        const tempDiv = document.createElement('div');
        tempDiv.style.cssText = 'font-family: "Sarabun", sans-serif; padding: 20px; max-width: 800px; margin: auto; background: white;';
        tempDiv.innerHTML = `

            <div style="text-align: center; margin-bottom: 5px;">
                <div style="font-size: 18px; color: #4f46e5; font-weight: bold; letter-spacing: 1px;">${schoolName}</div>
            </div>
            
            <div style="text-align: center; border-bottom: 3px solid #4f46e5; padding-bottom: 15px; margin-bottom: 20px;">
                <h1 style="color: #1e293b; margin: 0 0 5px 0; font-size: 24px;">📊 รายงานสรุปผลการประเมิน SDQ</h1>
                <p style="color: #64748b; margin: 0; font-size: 14px;">Strengths and Difficulties Questionnaire - Summary Report</p>
                <div style="margin-top: 10px; display: flex; justify-content: center; gap: 30px; flex-wrap: wrap;">
                    <div><span style="color: #64748b;">ปีการศึกษา:</span> <span style="font-weight: bold; color: #1e293b;">${currentSchoolInfo?.current_academic_year || '-'}</span></div>
                    <div><span style="color: #64748b;">ภาคเรียนที่:</span> <span style="font-weight: bold; color: #1e293b;">${currentSchoolInfo?.current_semester || '-'}</span></div>
                    <div><span style="color: #64748b;">วันที่พิมพ์:</span> <span style="font-weight: bold; color: #1e293b;">${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</span></div>
                </div>
            </div>

            <div style="page-break-inside: avoid; margin-bottom: 25px;">
                <h2 style="color: #334155; font-size: 18px; border-left: 4px solid #4f46e5; padding-left: 10px; margin-bottom: 15px;">📈 ภาพรวมการประเมิน</h2>
                <div style="display: flex; gap: 15px;">
                    <div style="flex: 1; background: #f0fdf4; border: 2px solid #bbf7d0; border-radius: 12px; padding: 15px; text-align: center;">
                        <div style="font-size: 13px; color: #166534; margin-bottom: 5px;">กลุ่มปกติ (0-15)</div>
                        <div style="font-size: 36px; font-weight: 900; color: #16a34a;">${normalCount}</div>
                        <div style="font-size: 12px; color: #166534;">${totalStudents > 0 ? ((normalCount / totalStudents) * 100).toFixed(1) : 0}%</div>
                    </div>
                    <div style="flex: 1; background: #fffbeb; border: 2px solid #fde68a; border-radius: 12px; padding: 15px; text-align: center;">
                        <div style="font-size: 13px; color: #92400e; margin-bottom: 5px;">กลุ่มเสี่ยง (16-18)</div>
                        <div style="font-size: 36px; font-weight: 900; color: #d97706;">${riskCount}</div>
                        <div style="font-size: 12px; color: #92400e;">${totalStudents > 0 ? ((riskCount / totalStudents) * 100).toFixed(1) : 0}%</div>
                    </div>
                    <div style="flex: 1; background: #fef2f2; border: 2px solid #fecaca; border-radius: 12px; padding: 15px; text-align: center;">
                        <div style="font-size: 13px; color: #991b1b; margin-bottom: 5px;">กลุ่มมีปัญหา (19-40)</div>
                        <div style="font-size: 36px; font-weight: 900; color: #dc2626;">${problemCount}</div>
                        <div style="font-size: 12px; color: #991b1b;">${totalStudents > 0 ? ((problemCount / totalStudents) * 100).toFixed(1) : 0}%</div>
                    </div>
                </div>
                <div style="text-align: center; margin-top: 15px; font-size: 14px; color: #64748b;">
                    จำนวนผู้ทำแบบประเมินทั้งหมด: <span style="font-weight: bold; color: #1e293b;">${totalStudents} คน</span>
                </div>
            </div>

            <div style="page-break-inside: avoid; margin-bottom: 25px; text-align: center;">
                <canvas id="summaryChart" width="600" height="250" style="max-width: 100%;"></canvas>
            </div>

            <div style="page-break-inside: avoid; margin-bottom: 25px;">
                <h2 style="color: #334155; font-size: 18px; border-left: 4px solid #4f46e5; padding-left: 10px; margin-bottom: 15px;">🏫 สรุปผลแยกตามระดับชั้น</h2>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <thead>
                        <tr style="background: #f8fafc;">
                            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">ระดับชั้น</th>
                            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">ทั้งหมด</th>
                            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">ปกติ 🟢</th>
                            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">เสี่ยง 🟡</th>
                            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">มีปัญหา 🔴</th>
                        </tr>
                    </thead>
                    <tbody>${gradeTableRows}</tbody>
                    <tfoot>
                        <tr style="background: #f1f5f9; font-weight: bold;">
                            <td style="padding: 10px 12px; text-align: center; border-top: 2px solid #e2e8f0;">รวม</td>
                            <td style="padding: 10px 12px; text-align: center; border-top: 2px solid #e2e8f0;">${totalStudents}</td>
                            <td style="padding: 10px 12px; text-align: center; border-top: 2px solid #e2e8f0; color: #10b981;">${normalCount}</td>
                            <td style="padding: 10px 12px; text-align: center; border-top: 2px solid #e2e8f0; color: #f59e0b;">${riskCount}</td>
                            <td style="padding: 10px 12px; text-align: center; border-top: 2px solid #e2e8f0; color: #ef4444;">${problemCount}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div style="page-break-inside: avoid; margin-bottom: 25px;">
                <h2 style="color: #334155; font-size: 18px; border-left: 4px solid #4f46e5; padding-left: 10px; margin-bottom: 15px;">📊 คะแนนเฉลี่ยรายด้าน</h2>
                <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                    <thead>
                        <tr style="background: #f8fafc;">
                            <th style="padding: 10px 12px; text-align: left; border-bottom: 2px solid #e2e8f0;">ด้าน</th>
                            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">คะแนนเฉลี่ย</th>
                            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">คะแนนเต็ม</th>
                            <th style="padding: 10px 12px; text-align: center; border-bottom: 2px solid #e2e8f0;">ร้อยละ</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${createAvgRow('😢 ด้านอารมณ์', avgScore(domainScores.emotional))}
                        ${createAvgRow('😠 ความประพฤติ', avgScore(domainScores.conduct))}
                        ${createAvgRow('⚡ ไม่อยู่นิ่ง/สมาธิสั้น', avgScore(domainScores.hyper))}
                        ${createAvgRow('🤝 ความสัมพันธ์กับเพื่อน', avgScore(domainScores.peer))}
                        ${createAvgRow('🌟 ด้านสังคม', avgScore(domainScores.prosocial))}
                    </tbody>
                </table>
            </div>

            <div style="text-align: center; margin-top: 20px; padding-top: 10px; border-top: 2px solid #e2e8f0; color: #94a3b8; font-size: 11px;">
                <p style="margin: 0; font-weight: bold; color: #4f46e5;">🏫 ${schoolName}</p>
                <p style="margin: 5px 0 0 0;">รายงานนี้สร้างโดยระบบ SDQ Admin | WRK System</p>
                <p style="margin: 5px 0 0 0;">พิมพ์เมื่อ: ${new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
        `;

        document.body.appendChild(tempDiv);
        await new Promise(resolve => setTimeout(resolve, 200));

        const summaryCanvas = tempDiv.querySelector('#summaryChart');
        if (summaryCanvas) {
            const ctx = summaryCanvas.getContext('2d');
            new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: sortedGrades.map(g => `ม.${g}`),
                    datasets: [
                        {
                            label: 'ปกติ',
                            data: sortedGrades.map(g => gradeStats[g].normal),
                            backgroundColor: 'rgba(16, 185, 129, 0.8)',
                            borderColor: 'rgba(16, 185, 129, 1)',
                            borderWidth: 1,
                            borderRadius: 5,
                        },
                        {
                            label: 'เสี่ยง',
                            data: sortedGrades.map(g => gradeStats[g].risk),
                            backgroundColor: 'rgba(245, 158, 11, 0.8)',
                            borderColor: 'rgba(245, 158, 11, 1)',
                            borderWidth: 1,
                            borderRadius: 5,
                        },
                        {
                            label: 'มีปัญหา',
                            data: sortedGrades.map(g => gradeStats[g].problem),
                            backgroundColor: 'rgba(239, 68, 68, 0.8)',
                            borderColor: 'rgba(239, 68, 68, 1)',
                            borderWidth: 1,
                            borderRadius: 5,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: true,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: { usePointStyle: true, padding: 15, font: { size: 12 } }
                        },
                        title: {
                            display: true,
                            text: 'กราฟแสดงจำนวนนักเรียนแยกตามระดับชั้นและสถานะ',
                            font: { size: 14 }
                        }
                    },
                    scales: {
                        x: { stacked: true, ticks: { font: { size: 11 } } },
                        y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1, font: { size: 11 } } }
                    }
                }
            });
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        await html2pdf().set({
            margin: [0.5, 0.5, 0.5, 0.5],
            filename: `SDQ_Summary_${currentSchoolInfo?.current_academic_year}_S${currentSchoolInfo?.current_semester}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, letterRendering: true },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['avoid-all', 'css', 'legacy'], avoid: ['tr', '.keep-together'] }
        }).from(tempDiv).save();

        setTimeout(() => {
            if (tempDiv && tempDiv.parentNode) document.body.removeChild(tempDiv);
        }, 500);

        Swal.close();
    } catch (err) {
        console.error('Print Summary PDF Error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถสร้าง PDF ได้: ' + err.message, 'error');
    }
}

function createAvgRow(label, avgScore) {
    return `
        <tr>
            <td style="padding: 8px 12px; border-bottom: 1px solid #f1f5f9;">${label}</td>
            <td style="padding: 8px 12px; text-align: center; font-weight: bold;">${avgScore}</td>
            <td style="padding: 8px 12px; text-align: center; color: #94a3b8;">10</td>
            <td style="padding: 8px 12px; text-align: center;">${((avgScore / 10) * 100).toFixed(1)}%</td>
        </tr>
    `;
}

// ==========================================
// 📥📤 นำเข้า/ส่งออก Excel
// ==========================================
function exportData() {
    if (adminData.length === 0) {
        return Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีข้อมูลให้ส่งออก', 'info');
    }

    const exportArray = adminData.map(d => {
        const student = d.student_id;
        const room = d.enrollment_id?.core_classrooms;
        const status = d.total_difficulty_score <= 15 ? 'ปกติ' : d.total_difficulty_score <= 18 ? 'เสี่ยง' : 'มีปัญหา';

        return {
            'ชั้น/ห้อง': room ? `ม.${room.grade_level}/${room.room_number}` : '',
            'เลขที่': d.enrollment_id?.student_number || '',
            'รหัสนักเรียน': student?.student_id_card || '',
            'ชื่อ-สกุล': `${student?.prefix || ''}${student?.first_name} ${student?.last_name}`,
            'ผู้ประเมิน': d.assessor_type === 'student' ? 'นักเรียน' : 'ผู้ปกครอง',
            'ด้านอารมณ์': d.score_emotional,
            'ความประพฤติ': d.score_conduct,
            'ไม่อยู่นิ่ง': d.score_hyper,
            'ความสัมพันธ์กับเพื่อน': d.score_peer,
            'ด้านสังคม': d.score_prosocial,
            'คะแนนรวม': d.total_difficulty_score,
            'สถานะ': status
        };
    });

    const ws = XLSX.utils.json_to_sheet(exportArray);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SDQ_สรุป");
    XLSX.writeFile(wb, `SDQ_Summary_${currentSchoolInfo?.current_academic_year}_S${currentSchoolInfo?.current_semester}.xlsx`);
}

async function importExcel(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.SheetNames[0];
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);

            if (rows.length === 0) {
                Swal.fire('ไฟล์ว่างเปล่า', 'ไม่พบข้อมูลใน Excel', 'warning');
                return;
            }

            const requiredCols = ['รหัสนักเรียน', 'ผู้ประเมิน', 'ด้านอารมณ์', 'ความประพฤติ', 'ไม่อยู่นิ่ง', 'ความสัมพันธ์กับเพื่อน', 'ด้านสังคม'];
            const firstRow = rows[0];
            for (let col of requiredCols) {
                if (!(col in firstRow)) {
                    Swal.fire('รูปแบบไฟล์ไม่ถูกต้อง', `ไม่พบคอลัมน์ "${col}"`, 'error');
                    return;
                }
            }

            Swal.fire({ title: 'กำลังนำเข้าข้อมูล...', didOpen: () => Swal.showLoading(), allowOutsideClick: false });

            let success = 0, failed = 0;
            for (let row of rows) {
                try {
                    const studentCard = row['รหัสนักเรียน'].toString();
                    const assessor = row['ผู้ประเมิน'];
                    const assessorType = assessor.includes('นักเรียน') ? 'student' : 'parent';

                    const { data: student } = await db.from('core_students')
                        .select('id')
                        .eq('student_id_card', studentCard)
                        .single();

                    if (!student) { failed++; continue; }

                    const { data: enrollment } = await db.from('student_enrollments')
                        .select('id')
                        .eq('student_id', student.id)
                        .eq('academic_year', currentSchoolInfo.current_academic_year)
                        .eq('semester', currentSchoolInfo.current_semester)
                        .single();

                    if (!enrollment) { failed++; continue; }

                    const payload = {
                        student_id: student.id,
                        enrollment_id: enrollment.id,
                        academic_year: currentSchoolInfo.current_academic_year,
                        semester: currentSchoolInfo.current_semester,
                        assessor_type: assessorType,
                        score_emotional: parseInt(row['ด้านอารมณ์']) || 0,
                        score_conduct: parseInt(row['ความประพฤติ']) || 0,
                        score_hyper: parseInt(row['ไม่อยู่นิ่ง']) || 0,
                        score_peer: parseInt(row['ความสัมพันธ์กับเพื่อน']) || 0,
                        score_prosocial: parseInt(row['ด้านสังคม']) || 0,
                        total_difficulty_score: (parseInt(row['ด้านอารมณ์']) || 0) + (parseInt(row['ความประพฤติ']) || 0) + (parseInt(row['ไม่อยู่นิ่ง']) || 0) + (parseInt(row['ความสัมพันธ์กับเพื่อน']) || 0)
                    };

                    const { error: upsertErr } = await db.from('sdq_assessments')
                        .upsert(payload, { onConflict: 'student_id, academic_year, semester, assessor_type' });

                    if (upsertErr) { failed++; continue; }
                    success++;
                } catch (e) {
                    failed++;
                }
            }

            Swal.fire('นำเข้าเสร็จสิ้น', `สำเร็จ ${success} รายการ, ล้มเหลว ${failed} รายการ`, success === rows.length ? 'success' : 'warning');
            loadAdminData();
        } catch (err) {
            console.error(err);
            Swal.fire('ผิดพลาด', 'ไม่สามารถอ่านไฟล์ Excel ได้', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

// ==========================================
// 🛡️ จัดการผู้ดูแลระบบ SDQ
// ==========================================

// เปิด Modal จัดการแอดมิน
async function openAdminManager() {
    document.getElementById('adminManagerModal').classList.remove('hidden');
    await Promise.all([
        loadPersonnelOptions(),
        loadCurrentAdmins()
    ]);
}

// ปิด Modal
function closeAdminManager() {
    document.getElementById('adminManagerModal').classList.add('hidden');
}

// โหลดรายชื่อครู/บุคลากรทั้งหมดใส่ Tom Select
async function loadPersonnelOptions() {
    try {
        // ดึงเฉพาะบุคลากรที่ยังไม่เป็นแอดมิน SDQ
        const { data: currentAdmins } = await db
            .from('core_module_admins')
            .select('user_id')
            .eq('module_id', 'sdq');

        const adminUserIds = currentAdmins ? currentAdmins.map(a => a.user_id) : [];

        const { data: personnel, error } = await db
            .from('core_personnel')
            .select(`
                id,
                prefix,
                first_name,
                last_name,
                position,
                department
            `)
            .order('first_name', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('personnelSelect');
        select.innerHTML = '';

        if (select.tomselect) {
            select.tomselect.destroy();
        }

        const emptyOption = document.createElement('option');
        emptyOption.value = '';
        emptyOption.textContent = '-- เลือกบุคลากร --';
        select.appendChild(emptyOption);

        if (personnel) {
            personnel.forEach(p => {
                if (adminUserIds.includes(p.id)) return;

                const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
                const dept = p.department ? ` [${p.department}]` : '';
                const pos = p.position ? ` - ${p.position}` : '';

                const option = document.createElement('option');
                option.value = p.id;
                option.textContent = `${fullName}${pos}${dept}`;
                select.appendChild(option);
            });
        }

        new TomSelect(select, {
            placeholder: 'ค้นหาชื่อครู/บุคลากร...',
            allowEmptyOption: true,
            plugins: ['clear_button'],
            maxOptions: null,
            dropdownParent: 'body',
            render: {
                option: function (data, escape) {
                    return `<div>${escape(data.text)}</div>`;
                },
                no_results: function () {
                    return '<div class="no-results">ไม่พบบุคลากร</div>';
                }
            }
        });

    } catch (err) {
        console.error('Load personnel error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดรายชื่อบุคลากรได้', 'error');
    }
}

// โหลดรายชื่อแอดมินปัจจุบัน
async function loadCurrentAdmins() {
    try {
        const { data: moduleAdmins, error: adminError } = await db
            .from('core_module_admins')
            .select(`
                id,
                user_id,
                created_at,
                core_personnel!inner (
                    id,
                    prefix,
                    first_name,
                    last_name,
                    position,
                    department
                )
            `)
            .eq('module_id', 'sdq');

        if (adminError) {
            console.error('Load module admins error:', adminError);
            throw adminError;
        }

        console.log('Module admins:', moduleAdmins); // Debug

        const { data: superAdmins, error: superError } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, position, department')
            .eq('role', 'super_admin');

        if (superError) throw superError;

        const adminListDiv = document.getElementById('adminList');

        let html = '';
        let totalCount = 0;

        if (superAdmins && superAdmins.length > 0) {
            superAdmins.forEach(admin => {
                const fullName = `${admin.prefix || ''}${admin.first_name} ${admin.last_name}`;
                const dept = admin.department || '';
                const pos = admin.position || '';

                html += `
                    <div class="flex items-center justify-between p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-800 flex items-center justify-center">
                                <i class="fa-solid fa-crown text-amber-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800 dark:text-white">${fullName}</div>
                                <div class="text-xs text-slate-500">${pos}${dept ? ` · ${dept}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 text-xs rounded-full font-bold">
                                    <i class="fa-solid fa-star mr-1"></i>Super Admin
                                </span>
                            </div>
                        </div>
                        <span class="text-xs text-slate-400">ถาวร</span>
                    </div>
                `;
                totalCount++;
            });
        }

        if (moduleAdmins && moduleAdmins.length > 0) {
            moduleAdmins.forEach(admin => {
                const p = admin.core_personnel;
                const fullName = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
                const dept = p.department || '';
                const pos = p.position || '';
                const createdDate = admin.created_at
                    ? new Date(admin.created_at).toLocaleDateString('th-TH')
                    : 'ไม่ระบุ';

                html += `
                    <div class="flex items-center justify-between p-4 bg-white dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 rounded-xl">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center">
                                <i class="fa-solid fa-user-shield text-indigo-600"></i>
                            </div>
                            <div>
                                <div class="font-bold text-slate-800 dark:text-white">${fullName}</div>
                                <div class="text-xs text-slate-500">${pos}${dept ? ` · ${dept}` : ''}</div>
                                <span class="inline-block mt-1 px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-xs rounded-full font-medium">
                                    <i class="fa-solid fa-clock mr-1"></i>ตั้งแต่ ${createdDate}
                                </span>
                            </div>
                        </div>
                        <button onclick="removeSDQAdmin('${admin.id}', '${fullName}')" 
                                class="px-3 py-2 bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 rounded-lg text-sm font-bold transition-colors">
                            <i class="fa-solid fa-trash mr-1"></i>ถอดถอน
                        </button>
                    </div>
                `;
                totalCount++;
            });
        }

        if (html === '') {
            html = `
                <div class="text-center text-slate-400 py-8">
                    <i class="fa-solid fa-user-slash text-3xl mb-2"></i>
                    <p>ยังไม่มีผู้ดูแลระบบ SDQ</p>
                </div>
            `;
        }

        adminListDiv.innerHTML = html;
        document.getElementById('adminCount').textContent = `(${totalCount} คน)`;
    } catch (err) {
        console.error('Load admins error:', err);
        document.getElementById('adminList').innerHTML = `
            <div class="text-center text-rose-400 py-8">
                <i class="fa-solid fa-triangle-exclamation text-3xl mb-2"></i>
                <p>ไม่สามารถโหลดข้อมูลได้</p>
                <p class="text-xs mt-1">${err.message}</p>
            </div>
        `;
    }
}

// เพิ่มแอดมิน SDQ
async function addSDQAdmin() {
    const select = document.getElementById('personnelSelect');
    const personnelId = select.tomselect ? select.tomselect.getValue() : select.value;

    if (!personnelId || personnelId === '') {
        return Swal.fire('กรุณาเลือก', 'กรุณาเลือกครู/บุคลากรก่อน', 'warning');
    }

    try {
        // 🔑 1. ดึงข้อมูลบุคลากรเพื่อตรวจสอบว่ามี email หรือไม่
        const { data: personnel, error: personnelError } = await db
            .from('core_personnel')
            .select('id, email, prefix, first_name, last_name')
            .eq('id', personnelId)
            .single();

        if (personnelError || !personnel) {
            return Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลบุคลากร', 'error');
        }

        // 🔑 2. ใช้ personnel.id เป็น user_id (เพราะ core_personnel.id = auth.users.id)
        const userId = personnel.id;

        // 🔑 3. ตรวจสอบว่าเป็นแอดมินอยู่แล้วหรือไม่
        const { data: existing, error: existingError } = await db
            .from('core_module_admins')
            .select('id')
            .eq('user_id', userId)
            .eq('module_id', 'sdq')
            .maybeSingle();  // ใช้ maybeSingle แทน single

        if (existingError) {
            console.error('Check existing error:', existingError);
            return Swal.fire('ข้อผิดพลาด', 'ไม่สามารถตรวจสอบข้อมูลได้', 'error');
        }

        if (existing) {
            return Swal.fire('ซ้ำซ้อน', 'บุคลากรนี้เป็นผู้ดูแล SDQ อยู่แล้ว', 'info');
        }

        // 🔑 4. เพิ่มแอดมิน
        const { error: insertError } = await db
            .from('core_module_admins')
            .insert({
                user_id: userId,
                module_id: 'sdq',
                created_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('Insert error:', insertError);
            throw insertError;
        }

        Swal.fire({
            icon: 'success',
            title: 'แต่งตั้งสำเร็จ!',
            text: `${personnel.prefix || ''}${personnel.first_name} ${personnel.last_name} มีสิทธิ์จัดการระบบ SDQ แล้ว`,
            timer: 2000,
            showConfirmButton: false
        });

        // ล้างค่าและรีเฟรช
        if (select.tomselect) {
            select.tomselect.clear();
        }

        await loadCurrentAdmins();
        await loadPersonnelOptions();

    } catch (err) {
        console.error('Add admin error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถเพิ่มผู้ดูแลได้: ' + err.message, 'error');
    }
}
// ถอดถอนแอดมิน SDQ
async function removeSDQAdmin(adminId, adminName) {
    const result = await Swal.fire({
        title: 'ยืนยันการถอดถอน?',
        html: `คุณต้องการถอดถอน <strong>${adminName}</strong> จากการเป็นผู้ดูแลระบบ SDQ ใช่หรือไม่?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#ef4444',
        cancelButtonText: 'ยกเลิก',
        confirmButtonText: '<i class="fa-solid fa-trash mr-1"></i> ถอดถอน'
    });

    if (!result.isConfirmed) return;

    try {
        const { error } = await db
            .from('core_module_admins')
            .delete()
            .eq('id', adminId);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'ถอดถอนสำเร็จ!',
            text: `${adminName} ไม่มีสิทธิ์จัดการระบบ SDQ แล้ว`,
            timer: 2000,
            showConfirmButton: false
        });

        await loadCurrentAdmins();
        await loadPersonnelOptions();
    } catch (err) {
        console.error('Remove admin error:', err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถถอดถอนได้: ' + err.message, 'error');
    }
}