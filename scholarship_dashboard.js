// scholarship_dashboard.js
// ปรับปรุงประสิทธิภาพด้วย Batch Query (Promise.all) + Dashboard Cache
// แก้ไข error .catch is not a function

let dashboardChart = null;
let dashboardPieChart = null;   // ✅ ใหม่

// ✅ Cache
let _dashboardCache = null;
let _dashboardCacheKey = '';
let _dashboardCacheTime = 0;
const DASHBOARD_TTL = 60 * 1000; // 60 seconds

/**
 * โหลดข้อมูลสำหรับ Dashboard (ใช้ Batch Query + Cache)
 */
async function loadDashboard(academicYear, semester) {
    console.log('📊 loadDashboard called with:', academicYear, semester);

    // ✅ Cache check
    const cacheKey = `${academicYear}_${semester}`;
    if (_dashboardCache && _dashboardCacheKey === cacheKey && (Date.now() - _dashboardCacheTime) < DASHBOARD_TTL) {
        console.log('⚡ loadDashboard: จาก cache');
        applyDashboardData(_dashboardCache, academicYear, semester);
        return;
    }

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

        const startDate = new Date();
        startDate.setFullYear(parseInt(academicYear) - 543);
        startDate.setMonth(0, 1);
        const endDate = new Date(startDate);
        endDate.setFullYear(startDate.getFullYear() + 1);

        const fetchApplicationsCount = async () => {
            try {
                const result = await db
                    .from('core_scholarship_applications')
                    .select('*', { count: 'exact', head: true })
                    .gte('created_at', startDate.toISOString())
                    .lt('created_at', endDate.toISOString());
                return result;
            } catch (e) {
                console.warn('ไม่สามารถกรองด้วย created_at ได้ (fallback):', e);
                const result = await db
                    .from('core_scholarship_applications')
                    .select('*', { count: 'exact', head: true });
                return result;
            }
        };

        const fetchApprovedCount = async () => {
            try {
                const result = await db
                    .from('core_scholarship_applications')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'approved')
                    .gte('created_at', startDate.toISOString())
                    .lt('created_at', endDate.toISOString());
                return result;
            } catch (e) {
                console.warn('ไม่สามารถกรองอนุมัติด้วย created_at ได้ (fallback):', e);
                const result = await db
                    .from('core_scholarship_applications')
                    .select('*', { count: 'exact', head: true })
                    .eq('status', 'approved');
                return result;
            }
        };

        // ✅ Batch Query 4 queries พร้อมกัน
        const [
            scholarshipsResult,
            distinctStudentsResult,
            applicationsCountResult,
            approvedCountResult
        ] = await Promise.all([
            db.from('core_scholarships')
                .select('scholarship_name')
                .eq('academic_year', academicYear)
                .eq('semester', semester),
            db.from('core_scholarships')
                .select('student_id')
                .eq('academic_year', academicYear)
                .eq('semester', semester),
            fetchApplicationsCount(),
            fetchApprovedCount()
        ]);

        if (scholarshipsResult.error) throw scholarshipsResult.error;
        if (distinctStudentsResult.error) throw distinctStudentsResult.error;

        const uniqueNames = new Set(scholarshipsResult.data.map(s => s.scholarship_name));
        const uniqueStudentIds = new Set(distinctStudentsResult.data.map(s => s.student_id));

        const stats = {
            totalScholarships: uniqueNames.size,
            totalStudentsReceived: uniqueStudentIds.size,
            totalApplications: applicationsCountResult.count || 0,
            approvedApplications: approvedCountResult.count || 0,
            studentIds: [...uniqueStudentIds]
        };

        // ✅ เก็บ cache
        _dashboardCache = stats;
        _dashboardCacheKey = cacheKey;
        _dashboardCacheTime = Date.now();

        await applyDashboardData(stats, academicYear, semester);

        attachCardClickEvents();
        console.log('✅ Dashboard loaded successfully');
    } catch (error) {
        console.error('❌ Error loading dashboard:', error);
    }
}

// ✅ Helper: Apply stats + render charts (Bar + Pie)
async function applyDashboardData(stats, academicYear, semester) {
    const cardElements = {
        totalScholarships: document.getElementById('card-total-scholarships'),
        totalStudents: document.getElementById('card-total-students'),
        totalApplications: document.getElementById('card-total-applications'),
        approvedApplications: document.getElementById('card-approved-applications')
    };

    if (!cardElements.totalScholarships) return;

    cardElements.totalScholarships.textContent = stats.totalScholarships || 0;
    cardElements.totalStudents.textContent = stats.totalStudentsReceived || 0;
    cardElements.totalApplications.textContent = stats.totalApplications || 0;
    cardElements.approvedApplications.textContent = stats.approvedApplications || 0;

    // ===== คำนวณ grade counts =====
    const studentIds = stats.studentIds || [];
    const gradeCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

    if (studentIds.length > 0) {
        const { data: enrollments, error: enrollErr } = await db
            .from('student_enrollments')
            .select('student_id, academic_year, semester, core_classrooms(grade_level)')
            .in('student_id', studentIds)
            .order('academic_year', { ascending: false })
            .order('semester', { ascending: false });

        if (!enrollErr && enrollments) {
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

    const COLORS = [
        'rgba(54, 162, 235, 0.85)', 'rgba(75, 192, 192, 0.85)',
        'rgba(255, 206, 86, 0.85)', 'rgba(153, 102, 255, 0.85)',
        'rgba(255, 159, 64, 0.85)', 'rgba(255, 99, 132, 0.85)'
    ];
    const BORDER_COLORS = [
        'rgba(54, 162, 235, 1)', 'rgba(75, 192, 192, 1)',
        'rgba(255, 206, 86, 1)', 'rgba(153, 102, 255, 1)',
        'rgba(255, 159, 64, 1)', 'rgba(255, 99, 132, 1)'
    ];

    // ===== Bar Chart =====
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
                    backgroundColor: COLORS,
                    borderColor: BORDER_COLORS,
                    borderWidth: 2,
                    borderRadius: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    title: {
                        display: true,
                        text: `จำนวนนักเรียนที่ได้รับทุน (ปี ${academicYear} เทอม ${semester})`,
                        font: { size: 13, weight: '600' }
                    }
                },
                scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
        });
    }

    // ===== Pie Chart (Doughnut) — ใหม่ =====
    const pieCtx = document.getElementById('scholarshipPieChart');
    if (pieCtx) {
        if (dashboardPieChart) dashboardPieChart.destroy();

        // ✅ กรองเฉพาะระดับที่มีข้อมูล > 0
        const pieLabels = [];
        const pieData = [];
        const pieColors = [];
        const pieBorders = [];

        labels.forEach((lbl, i) => {
            if (data[i] > 0) {
                pieLabels.push(lbl);
                pieData.push(data[i]);
                pieColors.push(COLORS[i]);
                pieBorders.push(BORDER_COLORS[i]);
            }
        });

        const hasData = pieData.length > 0;
        const totalStudents = pieData.reduce((s, v) => s + v, 0);

        dashboardPieChart = new Chart(pieCtx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: hasData ? pieLabels : ['ยังไม่มีข้อมูล'],
                datasets: [{
                    data: hasData ? pieData : [1],
                    backgroundColor: hasData ? pieColors : ['#e2e8f0'],
                    borderColor: hasData ? pieBorders : ['#cbd5e1'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { padding: 12, font: { size: 12 }, usePointStyle: true }
                    },
                    title: {
                        display: true,
                        text: `สัดส่วนนักเรียนตามระดับชั้น (รวม ${totalStudents} คน)`,
                        font: { size: 13, weight: '600' }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                if (!hasData) return ' ยังไม่มีข้อมูล';
                                const pct = totalStudents > 0
                                    ? ((context.parsed / totalStudents) * 100).toFixed(1)
                                    : 0;
                                return ` ${context.label}: ${context.parsed} คน (${pct}%)`;
                            }
                        }
                    }
                },
                cutout: '58%'
            }
        });
    }
}

// ✅ Helper: Clear dashboard cache
window.clearDashboardCache = function () {
    _dashboardCache = null;
    _dashboardCacheKey = '';
    _dashboardCacheTime = 0;
};

// ==========================================
// ฟังก์ชันกลางสำหรับแสดง DataTable ใน SweetAlert
// ✅ เพิ่ม onClose — callback เมื่อปิด modal
// ==========================================
function showDataTableInSwal(title, columns, data, rowCallback, onClose) {
    if (Swal.isVisible()) {
        Swal.close();
        setTimeout(() => {
            showDataTableInSwal(title, columns, data, rowCallback, onClose);
        }, 200);
        return;
    }

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
                drawCallback: function () {
                    if (rowCallback) {
                        rowCallback(this);
                    }
                    $('[data-toggle="tooltip"]').tooltip ? $('[data-toggle="tooltip"]').tooltip() : null;
                }
            });
        },
        willClose: () => {
            if ($.fn.DataTable.isDataTable('#swal-data-table')) {
                $('#swal-data-table').DataTable().destroy();
                $('#swal-data-table').empty();
            }

            // ✅ เรียก onClose callback — เพื่อกลับไปเปิด modal ก่อนหน้า
            if (typeof onClose === 'function') {
                setTimeout(() => {
                    try { onClose(); } catch (e) { console.warn('onClose error:', e); }
                }, 280);  // รอ Swal ปิด animation ให้เสร็จก่อน
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

// ---------- การ์ดที่ 1: ทุนทั้งหมด (คลิกชื่อทุนได้) ----------
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
            .select('scholarship_name, amount, student_id')
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
                grouped[name] = { count: 0, totalAmount: 0, studentIds: new Set() };
            }
            grouped[name].count += 1;
            grouped[name].totalAmount += (item.amount || 0);
            if (item.student_id) grouped[name].studentIds.add(item.student_id);
        });

        let totalAllAmount = 0;
        const tableData = [];
        Object.keys(grouped).forEach(name => {
            const { count, totalAmount, studentIds } = grouped[name];
            totalAllAmount += totalAmount;
            tableData.push({
                scholarship_name: name,
                count: count,
                student_count: studentIds.size,
                total_amount: totalAmount
            });
        });

        tableData.push({
            scholarship_name: '📊 รวมทั้งหมด',
            count: data.length,
            student_count: new Set(data.map(d => d.student_id)).size,
            total_amount: totalAllAmount,
            _isTotal: true
        });

        const columns = [
            {
                data: 'scholarship_name',
                title: 'ชื่อทุน',
                className: 'text-left',
                render: function (data, type, row) {
                    if (row._isTotal) {
                        return `<span class="font-bold">${escapeHtml(data)}</span>`;
                    }
                    return `<button class="scholarship-name-btn text-blue-600 hover:text-blue-800 hover:underline font-bold text-left transition" data-name="${escapeHtml(data)}">
                        <i class="fas fa-hand-pointer mr-1 text-xs"></i>${escapeHtml(data)}
                    </button>`;
                }
            },
            { data: 'count', title: 'จำนวน (ทุน)', className: 'text-center' },
            { data: 'student_count', title: 'จำนวน (คน)', className: 'text-center' },
            {
                data: 'total_amount',
                title: 'รวมเงิน (บาท)',
                className: 'text-right',
                render: (data) => data ? data.toLocaleString() : '0'
            }
        ];

        const rowCallback = function (api) {
            const dt = (api && typeof api.rows === 'function') ? api : $(api).DataTable();
            if (dt && typeof dt.rows === 'function') {
                dt.rows().every(function () {
                    const rowData = this.data();
                    if (rowData._isTotal) {
                        $(this.node()).addClass('font-bold bg-slate-100');
                    }
                });
            }

            // ✅ ผูก event คลิกชื่อทุน
            $('.scholarship-name-btn').off('click').on('click', function () {
                const name = $(this).data('name');
                showScholarshipStudents(name, academicYear, semester);
            });
        };

        showDataTableInSwal('💰 รายการทุนทั้งหมด', columns, tableData, rowCallback);

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
};

// ==========================================
// ✅ แสดงรายชื่อนักเรียนที่ได้รับทุนนั้น
// ✅ เมื่อปิด → กลับไปเปิด Modal รายชื่อทุนเดิม
// ==========================================
window.showScholarshipStudents = async function (scholarshipName, academicYear, semester) {
    try {
        const { data: scholarships, error } = await db
            .from('core_scholarships')
            .select('id, student_id, amount, note, core_students(id, student_id_card, prefix, first_name, last_name)')
            .eq('scholarship_name', scholarshipName)
            .eq('academic_year', academicYear)
            .eq('semester', semester);

        if (error) throw error;

        if (!scholarships || scholarships.length === 0) {
            Swal.fire('ไม่มีข้อมูล', `ไม่พบนักเรียนที่ได้รับทุน "${scholarshipName}"`, 'info');
            return;
        }

        // ✅ ดึงชั้นเรียนล่าสุด
        const studentIds = [...new Set(scholarships.map(s => s.student_id))];
        let classroomMap = {};
        try {
            const { data: enrolls } = await db
                .from('student_enrollments')
                .select('student_id, core_classrooms(grade_level, room_number)')
                .in('student_id', studentIds)
                .eq('academic_year', academicYear)
                .eq('semester', semester);

            (enrolls || []).forEach(en => {
                if (en.core_classrooms) {
                    classroomMap[en.student_id] = `ม.${en.core_classrooms.grade_level}/${en.core_classrooms.room_number}`;
                }
            });
        } catch (e) {
            console.warn('โหลดชั้นเรียนไม่สำเร็จ:', e);
        }

        const totalAmount = scholarships.reduce((sum, s) => sum + (s.amount || 0), 0);

        const tableData = scholarships.map(s => {
            const std = s.core_students;
            return {
                grade: classroomMap[s.student_id] || '-',
                id_card: std?.student_id_card || '-',
                name: std ? `${std.prefix || ''}${std.first_name} ${std.last_name}` : 'ไม่พบข้อมูล',
                amount: s.amount || 0,
                note: s.note || '-'
            };
        });

        // ✅ เพิ่มแถวรวมท้าย
        tableData.push({
            grade: '',
            id_card: '',
            name: `📊 รวมทั้งหมด ${scholarships.length} คน`,
            amount: totalAmount,
            note: '',
            _isTotal: true
        });

        const columns = [
            { data: 'grade', title: 'ชั้น', className: 'text-left' },
            { data: 'id_card', title: 'เลขประจำตัว', className: 'text-left' },
            { data: 'name', title: 'ชื่อ-สกุล', className: 'text-left font-medium' },
            {
                data: 'amount',
                title: 'จำนวนเงิน (บาท)',
                className: 'text-right font-bold text-emerald-700',
                render: (d) => d.toLocaleString()
            },
            { data: 'note', title: 'หมายเหตุ', className: 'text-sm text-slate-500' }
        ];

        const rowCallback = function (api) {
            const dt = (api && typeof api.rows === 'function') ? api : $(api).DataTable();
            if (dt && typeof dt.rows === 'function') {
                dt.rows().every(function () {
                    const rowData = this.data();
                    if (rowData._isTotal) {
                        $(this.node()).addClass('font-bold bg-emerald-50');
                    }
                });
            }
        };

        // ✅ ส่ง onClose → กลับไปเปิด Modal รายชื่อทุนเดิม
        showDataTableInSwal(
            `🏆 รายชื่อนักเรียนที่ได้รับทุน "${scholarshipName}"`,
            columns,
            tableData,
            rowCallback,
            () => {
                // ✅ กลับมาเปิด Modal รายชื่อทุนอีกครั้ง
                showScholarshipList();
            }
        );

    } catch (err) {
        console.error(err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดรายชื่อนักเรียนได้', 'error');
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

        const [studentsRes, enrollmentsRes] = await Promise.all([
            db.from('core_students')
                .select('id, student_id_card, prefix, first_name, last_name')
                .in('id', studentIds),
            db.from('student_enrollments')
                .select('student_id, core_classrooms(grade_level, room_number)')
                .in('student_id', studentIds)
                .order('academic_year', { ascending: false })
                .order('semester', { ascending: false })
        ]);

        if (studentsRes.error) throw studentsRes.error;
        if (enrollmentsRes.error) throw enrollmentsRes.error;

        const studentMap = {};
        studentsRes.data.forEach(s => { studentMap[s.id] = s; });

        const latestEnroll = {};
        enrollmentsRes.data.forEach(en => {
            if (!latestEnroll[en.student_id]) {
                latestEnroll[en.student_id] = en;
            }
        });

        const tableData = studentIds.map(id => {
            const student = studentMap[id];
            if (!student) return null;
            const enroll = latestEnroll[id];
            const grade = enroll?.core_classrooms ? `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}` : '-';
            const name = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
            return { student_id: student.id, grade, id_card: student.student_id_card, name };
        }).filter(Boolean);

        const columns = [
            { data: 'grade', title: 'ชั้น', className: 'text-left' },
            { data: 'id_card', title: 'เลขประจำตัว', className: 'text-left' },
            { data: 'name', title: 'ชื่อ-สกุล', className: 'text-left' },
            {
                data: 'student_id',
                title: 'จัดการ',
                className: 'text-center',
                render: function (data) {
                    return `<button class="btn-view-history bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded-lg text-sm transition" data-student-id="${data}">
                                <i class="fas fa-eye mr-1"></i> ดูประวัติ
                            </button>`;
                }
            }
        ];

        const rowCallback = function () {
            $('.btn-view-history').off('click').on('click', function () {
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

        const [studentsRes, enrollmentsRes] = await Promise.all([
            db.from('core_students')
                .select('id, student_id_card, prefix, first_name, last_name')
                .in('id', studentIds),
            db.from('student_enrollments')
                .select('student_id, core_classrooms(grade_level, room_number)')
                .in('student_id', studentIds)
                .order('academic_year', { ascending: false })
                .order('semester', { ascending: false })
        ]);

        if (studentsRes.error) throw studentsRes.error;
        if (enrollmentsRes.error) throw enrollmentsRes.error;

        const studentMap = {};
        studentsRes.data.forEach(s => { studentMap[s.id] = s; });

        const latestEnroll = {};
        enrollmentsRes.data.forEach(en => {
            if (!latestEnroll[en.student_id]) {
                latestEnroll[en.student_id] = en;
            }
        });

        const tableData = studentIds.map(id => {
            const student = studentMap[id];
            if (!student) return null;
            const enroll = latestEnroll[id];
            const grade = enroll?.core_classrooms ? `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}` : '-';
            const name = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
            return { student_id: student.id, grade, id_card: student.student_id_card, name };
        }).filter(Boolean);

        const columns = [
            { data: 'grade', title: 'ชั้น', className: 'text-left' },
            { data: 'id_card', title: 'เลขประจำตัว', className: 'text-left' },
            { data: 'name', title: 'ชื่อ-สกุล', className: 'text-left' },
            {
                data: 'student_id',
                title: 'จัดการ',
                className: 'text-center',
                render: function (data) {
                    return `<button class="btn-view-history bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded-lg text-sm transition" data-student-id="${data}">
                                <i class="fas fa-eye mr-1"></i> ดูประวัติ
                            </button>`;
                }
            }
        ];

        const rowCallback = function () {
            $('.btn-view-history').off('click').on('click', function () {
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

        const [studentsRes, enrollmentsRes] = await Promise.all([
            db.from('core_students')
                .select('id, student_id_card, prefix, first_name, last_name')
                .in('id', studentIds),
            db.from('student_enrollments')
                .select('student_id, core_classrooms(grade_level, room_number)')
                .in('student_id', studentIds)
                .order('academic_year', { ascending: false })
                .order('semester', { ascending: false })
        ]);

        if (studentsRes.error) throw studentsRes.error;
        if (enrollmentsRes.error) throw enrollmentsRes.error;

        const studentMap = {};
        studentsRes.data.forEach(s => { studentMap[s.id] = s; });

        const latestEnroll = {};
        enrollmentsRes.data.forEach(en => {
            if (!latestEnroll[en.student_id]) {
                latestEnroll[en.student_id] = en;
            }
        });

        const tableData = studentIds.map(id => {
            const student = studentMap[id];
            if (!student) return null;
            const enroll = latestEnroll[id];
            const grade = enroll?.core_classrooms ? `ม.${enroll.core_classrooms.grade_level}/${enroll.core_classrooms.room_number}` : '-';
            const name = `${student.prefix || ''}${student.first_name} ${student.last_name}`;
            return { student_id: student.id, grade, id_card: student.student_id_card, name };
        }).filter(Boolean);

        const columns = [
            { data: 'grade', title: 'ชั้น', className: 'text-left' },
            { data: 'id_card', title: 'เลขประจำตัว', className: 'text-left' },
            { data: 'name', title: 'ชื่อ-สกุล', className: 'text-left' },
            {
                data: 'student_id',
                title: 'จัดการ',
                className: 'text-center',
                render: function (data) {
                    return `<button class="btn-view-history bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1 rounded-lg text-sm transition" data-student-id="${data}">
                                <i class="fas fa-eye mr-1"></i> ดูประวัติ
                            </button>`;
                }
            }
        ];

        const rowCallback = function () {
            $('.btn-view-history').off('click').on('click', function () {
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