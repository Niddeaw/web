// scholarship_dashboard.js
// ฟังก์ชันโหลดข้อมูล Dashboard + ฟังก์ชันคลิกการ์ดแสดงรายละเอียดด้วย DataTable

let dashboardChart = null;

/**
 * โหลดข้อมูลสำหรับ Dashboard
 * @param {string} academicYear - ปีการศึกษา เช่น '2566'
 * @param {string} semester - ภาคเรียน เช่น '1' หรือ '2'
 */
async function loadDashboard(academicYear, semester) {
    console.log('📊 loadDashboard called with:', academicYear, semester);
    try {
        const cardElements = {
            totalScholarships: document.getElementById('card-total-scholarships'),
            totalStudents: document.getElementById('card-total-students'),
            totalApplications: document.getElementById('card-total-applications'),
            approvedApplications: document.getElementById('card-approved-applications')
        };

        if (!cardElements.totalScholarships) {
            console.warn('⚠️ Dashboard elements not found in DOM. Skipping dashboard load.');
            return;
        }

        // 1. จำนวนทุนทั้งหมด (distinct scholarship_name)
        const { data: scholarships, error: err1 } = await db
            .from('core_scholarships')
            .select('scholarship_name')
            .eq('academic_year', academicYear)
            .eq('semester', semester);
        if (err1) throw err1;

        const uniqueScholarshipNames = new Set(scholarships.map(s => s.scholarship_name));
        const totalScholarships = uniqueScholarshipNames.size;

        // 2. จำนวนนักเรียนที่ได้รับทุน
        const { data: distinctStudents, error: err2 } = await db
            .from('core_scholarships')
            .select('student_id')
            .eq('academic_year', academicYear)
            .eq('semester', semester);
        if (err2) throw err2;
        const uniqueStudentIds = new Set(distinctStudents.map(s => s.student_id));
        const totalStudentsReceived = uniqueStudentIds.size;

        // 3. จำนวนผู้ขอทุน
        let totalApplications = 0;
        try {
            const startDate = new Date();
            startDate.setFullYear(parseInt(academicYear) - 543);
            startDate.setMonth(0, 1);
            const endDate = new Date(startDate);
            endDate.setFullYear(startDate.getFullYear() + 1);

            const { count, error } = await db
                .from('core_scholarship_applications')
                .select('*', { count: 'exact', head: true })
                .gte('created_at', startDate.toISOString())
                .lt('created_at', endDate.toISOString());
            if (!error) totalApplications = count || 0;
        } catch (e) { console.warn('ไม่สามารถนับคำขอทุนได้:', e); }

        // 4. จำนวนอนุมัติ
        let approvedApplications = 0;
        try {
            const startDate = new Date();
            startDate.setFullYear(parseInt(academicYear) - 543);
            startDate.setMonth(0, 1);
            const endDate = new Date(startDate);
            endDate.setFullYear(startDate.getFullYear() + 1);

            const { count, error } = await db
                .from('core_scholarship_applications')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'approved')
                .gte('created_at', startDate.toISOString())
                .lt('created_at', endDate.toISOString());
            if (!error) approvedApplications = count || 0;
        } catch (e) { console.warn('ไม่สามารถนับอนุมัติได้:', e); }

        // อัปเดตการ์ด
        cardElements.totalScholarships.textContent = totalScholarships || 0;
        cardElements.totalStudents.textContent = totalStudentsReceived || 0;
        cardElements.totalApplications.textContent = totalApplications || 0;
        cardElements.approvedApplications.textContent = approvedApplications || 0;

        // 5. Chart (เหมือนเดิม)
        const { data: scholarshipsForChart, error: err5 } = await db
            .from('core_scholarships')
            .select('student_id')
            .eq('academic_year', academicYear)
            .eq('semester', semester);
        if (err5) throw err5;

        const studentIds = scholarshipsForChart.map(s => s.student_id);
        const gradeCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

        if (studentIds.length > 0) {
            const { data: enrollments, error: err6 } = await db
                .from('student_enrollments')
                .select('student_id, academic_year, semester, core_classrooms(grade_level)')
                .in('student_id', studentIds)
                .order('academic_year', { ascending: false })
                .order('semester', { ascending: false });

            if (!err6 && enrollments) {
                const latestEnrollmentMap = new Map();
                enrollments.forEach(en => {
                    const existing = latestEnrollmentMap.get(en.student_id);
                    if (!existing ||
                        en.academic_year > existing.academic_year ||
                        (en.academic_year === existing.academic_year && en.semester > existing.semester)) {
                        latestEnrollmentMap.set(en.student_id, en);
                    }
                });
                latestEnrollmentMap.forEach(en => {
                    const grade = en.core_classrooms?.grade_level;
                    if (grade && grade >= 1 && grade <= 6) {
                        gradeCounts[grade] = (gradeCounts[grade] || 0) + 1;
                    }
                });
            }
        }

        const labels = ['ม.1', 'ม.2', 'ม.3', 'ม.4', 'ม.5', 'ม.6'];
        const data = [gradeCounts[1], gradeCounts[2], gradeCounts[3], gradeCounts[4], gradeCounts[5], gradeCounts[6]];

        const ctx = document.getElementById('scholarshipChart');
        if (ctx) {
            if (dashboardChart) dashboardChart.destroy();
            dashboardChart = new Chart(ctx.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'จำนวนนักเรียนที่ได้รับทุน',
                        data: data,
                        backgroundColor: [
                            'rgba(54, 162, 235, 0.6)',
                            'rgba(75, 192, 192, 0.6)',
                            'rgba(255, 206, 86, 0.6)',
                            'rgba(153, 102, 255, 0.6)',
                            'rgba(255, 159, 64, 0.6)',
                            'rgba(255, 99, 132, 0.6)'
                        ],
                        borderColor: [
                            'rgba(54, 162, 235, 1)',
                            'rgba(75, 192, 192, 1)',
                            'rgba(255, 206, 86, 1)',
                            'rgba(153, 102, 255, 1)',
                            'rgba(255, 159, 64, 1)',
                            'rgba(255, 99, 132, 1)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: {
                            display: true,
                            text: `จำนวนนักเรียนที่ได้รับทุน จำแนกตามระดับชั้น (ปี ${academicYear} เทอม ${semester})`
                        }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
        }

        attachCardClickEvents();
        console.log('✅ Dashboard loaded successfully');
    } catch (error) {
        console.error('❌ Error loading dashboard:', error);
    }
}

// ==========================================
// ฟังก์ชันกลางสำหรับแสดง DataTable ใน SweetAlert
// ==========================================
function showDataTableInSwal(title, columns, data, rowCallback) {
    // ตรวจสอบว่า Swal เปิดอยู่หรือไม่ ถ้าเปิดอยู่ให้ปิดก่อน
    if (Swal.isVisible()) {
        Swal.close();
        // รอให้ปิดแล้วค่อยเปิดใหม่
        setTimeout(() => {
            showDataTableInSwal(title, columns, data, rowCallback);
        }, 200);
        return;
    }

    // กำหนด columns สำหรับ DataTable (ถ้าไม่มีการกำหนด render)
    const dtColumns = columns.map(col => {
        return {
            data: col.data,
            title: col.title,
            className: col.className || '',
            render: col.render || null
        };
    });

    Swal.fire({
        title: title,
        html: `<div id="swal-table-container" style="max-height:500px; overflow-y:auto; overflow-x:auto;">
                <table id="swal-data-table" class="display nowrap" style="width:100%"></table>
               </div>`,
        showCloseButton: true,
        showConfirmButton: true,
        confirmButtonText: 'ปิด',
        width: '1000px',
        didOpen: () => {
            const table = $('#swal-data-table').DataTable({
                data: data,
                columns: dtColumns,
                responsive: true,
                pageLength: 10,
                lengthMenu: [10, 25, 50, 100],
                order: [],
                language: {
                    url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json'
                },
                drawCallback: function() {
                    if (rowCallback) {
                        rowCallback(this);
                    }
                    // รองรับ Tooltip ถ้ามี
                    $('[data-toggle="tooltip"]').tooltip ? $('[data-toggle="tooltip"]').tooltip() : null;
                }
            });
        },
        willClose: () => {
            if ($.fn.DataTable.isDataTable('#swal-data-table')) {
                $('#swal-data-table').DataTable().destroy();
                $('#swal-data-table').empty();
            }
        }
    });
}

// ==========================================
// ฟังก์ชันคลิกการ์ด
// ==========================================

function attachCardClickEvents() {
    const cardScholarships = document.getElementById('card-scholarships');
    const cardStudents = document.getElementById('card-students');
    const cardApplicants = document.getElementById('card-applicants');
    const cardApproved = document.getElementById('card-approved');

    if (cardScholarships) {
        cardScholarships.addEventListener('click', showScholarshipList);
        cardScholarships.style.cursor = 'pointer';
    }
    if (cardStudents) {
        cardStudents.addEventListener('click', showStudentList);
        cardStudents.style.cursor = 'pointer';
    }
    if (cardApplicants) {
        cardApplicants.addEventListener('click', showApplicantList);
        cardApplicants.style.cursor = 'pointer';
    }
    if (cardApproved) {
        cardApproved.addEventListener('click', showApprovedList);
        cardApproved.style.cursor = 'pointer';
    }
}

// ---------- การ์ดที่ 1: ทุนทั้งหมด ----------
window.showScholarshipList = async function () {
    const academicYear = currentYear;
    const semester = currentTerm;
    if (!academicYear || !semester) {
        Swal.fire('ยังไม่พร้อม', 'กรุณารอระบบโหลดข้อมูล', 'info');
        return;
    }

    try {
        const { data, error } = await db
            .from('core_scholarships')
            .select('scholarship_name, amount')
            .eq('academic_year', academicYear)
            .eq('semester', semester);

        if (error) throw error;

        if (!data || data.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีรายการทุนในปี/เทอมนี้', 'info');
            return;
        }

        const grouped = {};
        data.forEach(item => {
            const name = item.scholarship_name || 'ไม่ระบุชื่อทุน';
            if (!grouped[name]) {
                grouped[name] = { count: 0, totalAmount: 0 };
            }
            grouped[name].count += 1;
            grouped[name].totalAmount += (item.amount || 0);
        });

        let totalAllAmount = 0;
        const tableData = [];
        Object.keys(grouped).forEach(name => {
            const { count, totalAmount } = grouped[name];
            totalAllAmount += totalAmount;
            tableData.push({
                scholarship_name: name,
                count: count,
                total_amount: totalAmount
            });
        });

        tableData.push({
            scholarship_name: '📊 รวมทั้งหมด',
            count: data.length,
            total_amount: totalAllAmount
        });

        const columns = [
            { data: 'scholarship_name', title: 'ชื่อทุน', className: 'text-left' },
            { data: 'count', title: 'จำนวน (ทุน)', className: 'text-center' },
            { 
                data: 'total_amount', 
                title: 'รวมเงิน (บาท)', 
                className: 'text-right',
                render: function(data) {
                    return data ? data.toLocaleString() : '0';
                }
            }
        ];

        const rowCallback = function(api) {
            const dt = (api && typeof api.rows === 'function') ? api : $(api).DataTable();
            if (dt && typeof dt.rows === 'function') {
                dt.rows().every(function() {
                    const rowData = this.data();
                    if (rowData.scholarship_name === '📊 รวมทั้งหมด') {
                        $(this.node()).addClass('font-bold bg-slate-100');
                    }
                });
            }
        };

        showDataTableInSwal('💰 รายการทุนทั้งหมด', columns, tableData, rowCallback);

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
};

// ---------- การ์ดที่ 2: นักเรียนที่ได้รับทุน ----------
window.showStudentList = async function () {
    const academicYear = currentYear;
    const semester = currentTerm;
    if (!academicYear || !semester) {
        Swal.fire('ยังไม่พร้อม', 'กรุณารอระบบโหลดข้อมูล', 'info');
        return;
    }

    try {
        // ดึง student_id ที่ได้รับทุน
        const { data: scholarships, error: err1 } = await db
            .from('core_scholarships')
            .select('student_id')
            .eq('academic_year', academicYear)
            .eq('semester', semester);
        if (err1) throw err1;

        const studentIds = [...new Set(scholarships.map(s => s.student_id))];
        if (studentIds.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ไม่มีนักเรียนที่ได้รับทุนในปี/เทอมนี้', 'info');
            return;
        }

        // ดึงข้อมูลนักเรียน
        const { data: students, error: err2 } = await db
            .from('core_students')
            .select('id, student_id_card, prefix, first_name, last_name')
            .in('id', studentIds);
        if (err2) throw err2;

        const studentMap = {};
        students.forEach(s => { studentMap[s.id] = s; });

        // ดึง enrollment ล่าสุด
        const { data: enrollments, error: err3 } = await db
            .from('student_enrollments')
            .select('student_id, core_classrooms(grade_level, room_number)')
            .in('student_id', studentIds)
            .order('academic_year', { ascending: false })
            .order('semester', { ascending: false });
        if (err3) throw err3;

        const latestEnroll = {};
        enrollments.forEach(en => {
            if (!latestEnroll[en.student_id]) {
                latestEnroll[en.student_id] = en;
            }
        });

        const tableData = [];
        studentIds.forEach(id => {
            const student = studentMap[id];
            if (!student) return;
            const enroll = latestEnroll[id];
            const grade = enroll?.core_classrooms ? `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}` : '-';
            const name = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
            tableData.push({
                student_id: student.id,
                grade: grade,
                id_card: student.student_id_card,
                name: name,
                // ใช้ render แทนการเก็บ HTML
            });
        });

        const columns = [
            { data: 'grade', title: 'ชั้น', className: 'text-left' },
            { data: 'id_card', title: 'เลขประจำตัว', className: 'text-left' },
            { data: 'name', title: 'ชื่อ-สกุล', className: 'text-left' },
            {
                data: 'student_id',
                title: 'จัดการ',
                className: 'text-center',
                render: function(data) {
                    return `<button class="btn-view-history bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded-lg text-sm transition" data-student-id="${data}">
                                <i class="fas fa-eye mr-1"></i> ดูประวัติ
                            </button>`;
                }
            }
        ];

        const rowCallback = function() {
            $('.btn-view-history').off('click').on('click', function() {
                const studentId = $(this).data('student-id');
                if (Swal.isVisible()) {
                    Swal.close();  // ปิด Swal
                    // รอให้ Swal ปิดสนิท แล้วค่อยเรียก viewStudentDetail
                    setTimeout(() => {
                        if (typeof viewStudentDetail === 'function') {
                            viewStudentDetail(studentId);
                        } else {
                            console.error('viewStudentDetail is not defined');
                            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบฟังก์ชันดูประวัติ', 'error');
                        }
                    }, 300);
                }
            });
        };

        showDataTableInSwal('👨‍🎓 รายชื่อนักเรียนที่ได้รับทุน', columns, tableData, rowCallback);

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
};

// ---------- การ์ดที่ 3: ผู้ขอทุน ----------
window.showApplicantList = async function () {
    const academicYear = currentYear;
    const semester = currentTerm;
    if (!academicYear || !semester) {
        Swal.fire('ยังไม่พร้อม', 'กรุณารอระบบโหลดข้อมูล', 'info');
        return;
    }

    try {
        // ดึง applications ในปี/เทอมนี้
        const startDate = new Date();
        startDate.setFullYear(parseInt(academicYear) - 543);
        startDate.setMonth(0, 1);
        const endDate = new Date(startDate);
        endDate.setFullYear(startDate.getFullYear() + 1);

        let { data: applications, error: err1 } = await db
            .from('core_scholarship_applications')
            .select('student_id')
            .gte('created_at', startDate.toISOString())
            .lt('created_at', endDate.toISOString());

        if (err1) {
            // fallback
            const { data: allApps, error: err2 } = await db
                .from('core_scholarship_applications')
                .select('student_id');
            if (err2) throw err2;
            applications = allApps;
        }

        const studentIds = [...new Set(applications.map(a => a.student_id))];
        if (studentIds.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีผู้ขอทุนในปี/เทอมนี้', 'info');
            return;
        }

        // ดึงข้อมูลนักเรียนและ enrollment (เหมือนเดิม)
        const { data: students, error: err3 } = await db
            .from('core_students')
            .select('id, student_id_card, prefix, first_name, last_name')
            .in('id', studentIds);
        if (err3) throw err3;

        const studentMap = {};
        students.forEach(s => { studentMap[s.id] = s; });

        const { data: enrollments, error: err4 } = await db
            .from('student_enrollments')
            .select('student_id, core_classrooms(grade_level, room_number)')
            .in('student_id', studentIds)
            .order('academic_year', { ascending: false })
            .order('semester', { ascending: false });
        if (err4) throw err4;

        const latestEnroll = {};
        enrollments.forEach(en => {
            if (!latestEnroll[en.student_id]) {
                latestEnroll[en.student_id] = en;
            }
        });

        const tableData = [];
        studentIds.forEach(id => {
            const student = studentMap[id];
            if (!student) return;
            const enroll = latestEnroll[id];
            const grade = enroll?.core_classrooms ? `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}` : '-';
            const name = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
            tableData.push({
                student_id: student.id,
                grade: grade,
                id_card: student.student_id_card,
                name: name,
            });
        });

        const columns = [
            { data: 'grade', title: 'ชั้น', className: 'text-left' },
            { data: 'id_card', title: 'เลขประจำตัว', className: 'text-left' },
            { data: 'name', title: 'ชื่อ-สกุล', className: 'text-left' },
            {
                data: 'student_id',
                title: 'จัดการ',
                className: 'text-center',
                render: function(data) {
                    return `<button class="btn-view-history bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded-lg text-sm transition" data-student-id="${data}">
                                <i class="fas fa-eye mr-1"></i> ดูประวัติ
                            </button>`;
                }
            }
        ];

        const rowCallback = function() {
            $('.btn-view-history').off('click').on('click', function() {
                const studentId = $(this).data('student-id');
                if (Swal.isVisible()) {
                    Swal.close();
                    setTimeout(() => {
                        if (typeof viewStudentDetail === 'function') {
                            viewStudentDetail(studentId);
                        } else {
                            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบฟังก์ชันดูประวัติ', 'error');
                        }
                    }, 300);
                }
            });
        };

        showDataTableInSwal('📝 รายชื่อผู้ขอทุน (จากระบบคำขอ)', columns, tableData, rowCallback);

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
};

// ---------- การ์ดที่ 4: อนุมัติแล้ว ----------
window.showApprovedList = async function () {
    const academicYear = currentYear;
    const semester = currentTerm;
    if (!academicYear || !semester) {
        Swal.fire('ยังไม่พร้อม', 'กรุณารอระบบโหลดข้อมูล', 'info');
        return;
    }

    try {
        const startDate = new Date();
        startDate.setFullYear(parseInt(academicYear) - 543);
        startDate.setMonth(0, 1);
        const endDate = new Date(startDate);
        endDate.setFullYear(startDate.getFullYear() + 1);

        let { data: applications, error: err1 } = await db
            .from('core_scholarship_applications')
            .select('student_id')
            .eq('status', 'approved')
            .gte('created_at', startDate.toISOString())
            .lt('created_at', endDate.toISOString());

        if (err1) {
            const { data: allApps, error: err2 } = await db
                .from('core_scholarship_applications')
                .select('student_id')
                .eq('status', 'approved');
            if (err2) throw err2;
            applications = allApps;
        }

        const studentIds = [...new Set(applications.map(a => a.student_id))];
        if (studentIds.length === 0) {
            Swal.fire('ไม่มีข้อมูล', 'ยังไม่มีผู้ได้รับการอนุมัติในปี/เทอมนี้', 'info');
            return;
        }

        // ดึงข้อมูลนักเรียนและ enrollment (เหมือนเดิม)
        const { data: students, error: err3 } = await db
            .from('core_students')
            .select('id, student_id_card, prefix, first_name, last_name')
            .in('id', studentIds);
        if (err3) throw err3;

        const studentMap = {};
        students.forEach(s => { studentMap[s.id] = s; });

        const { data: enrollments, error: err4 } = await db
            .from('student_enrollments')
            .select('student_id, core_classrooms(grade_level, room_number)')
            .in('student_id', studentIds)
            .order('academic_year', { ascending: false })
            .order('semester', { ascending: false });
        if (err4) throw err4;

        const latestEnroll = {};
        enrollments.forEach(en => {
            if (!latestEnroll[en.student_id]) {
                latestEnroll[en.student_id] = en;
            }
        });

        const tableData = [];
        studentIds.forEach(id => {
            const student = studentMap[id];
            if (!student) return;
            const enroll = latestEnroll[id];
            const grade = enroll?.core_classrooms ? `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}` : '-';
            const name = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
            tableData.push({
                student_id: student.id,
                grade: grade,
                id_card: student.student_id_card,
                name: name,
            });
        });

        const columns = [
            { data: 'grade', title: 'ชั้น', className: 'text-left' },
            { data: 'id_card', title: 'เลขประจำตัว', className: 'text-left' },
            { data: 'name', title: 'ชื่อ-สกุล', className: 'text-left' },
            {
                data: 'student_id',
                title: 'จัดการ',
                className: 'text-center',
                render: function(data) {
                    return `<button class="btn-view-history bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded-lg text-sm transition" data-student-id="${data}">
                                <i class="fas fa-eye mr-1"></i> ดูประวัติ
                            </button>`;
                }
            }
        ];

        const rowCallback = function() {
            $('.btn-view-history').off('click').on('click', function() {
                const studentId = $(this).data('student-id');
                if (Swal.isVisible()) {
                    Swal.close();
                    setTimeout(() => {
                        if (typeof viewStudentDetail === 'function') {
                            viewStudentDetail(studentId);
                        } else {
                            Swal.fire('เกิดข้อผิดพลาด', 'ไม่พบฟังก์ชันดูประวัติ', 'error');
                        }
                    }, 300);
                }
            });
        };

        showDataTableInSwal('✅ รายชื่อผู้ได้รับการอนุมัติ (จากระบบคำขอ)', columns, tableData, rowCallback);

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
};

// เปิดให้เรียกจากภายนอก
window.loadDashboard = loadDashboard;