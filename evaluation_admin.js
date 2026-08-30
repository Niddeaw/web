// ==========================================
// evaluation_admin.js - ไฟล์หลัก (Main File)
// ==========================================

// ==========================================
// ตัวแปรระบบ (Global Variables)
// ==========================================
let currentUser = null;
let currentTermData = null;
let currentEvalRound = null;
let allRounds = [];
let allGroups = [];
let allPersonnel = [];
let allDepartments = [];
let allSubItems = [];
let roundsDataTable = null;
let groupsDataTable = null;
let resultsDataTable = null;

// ✅ รายชื่อกลุ่มสาระที่อนุญาตให้ประเมิน
const ALLOWED_DEPARTMENTS = [
    'ภาษาไทย',
    'คณิตศาสตร์',
    'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
    'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)',
    'สังคมศึกษา ศาสนาและวัฒนธรรม',
    'สุขศึกษาและพลศึกษา',
    'ศิลปะ',
    'การงานอาชีพ',
    'ภาษาต่างประเทศ (ภาษาอังกฤษ)',
    'ภาษาต่างประเทศ (ภาษาจีน)',
    'แนะแนว'
];

// ==========================================
// ฐานข้อมูลข้อคำถาม (สำหรับแสดงในหัวข้อย่อย)
// ==========================================
const EVAL_SUB_ITEMS = {
    element1: {
        // ตอนที่ 1: ด้านการจัดการเรียนรู้ (1.1-1.8)
        part1: [
            { id: '1_1', label: '1.1 นำผลการวิเคราะห์หลักสูตร มาจัดทำรายวิชาและหน่วยการเรียนรู้' },
            { id: '1_2', label: '1.2 ปฏิบัติการสอน โดยออกแบบการจัดการเรียนรู้' },
            { id: '1_3', label: '1.3 จัดกิจกรรมการเรียนรู้' },
            { id: '1_4', label: '1.4 เลือกและใช้สื่อ เทคโนโลยี และแหล่งเรียนรู้' },
            { id: '1_5', label: '1.5 วัดและประเมินผลการเรียนรู้' },
            { id: '1_6', label: '1.6 จัดบรรยากาศที่ส่งเสริมและพัฒนาผู้เรียน' },
            { id: '1_7', label: '1.7 อบรมบ่มนิสัยให้ผู้เรียนมีคุณธรรม จริยธรรม' },
            { id: '1_8', label: '1.8 อบรมและพัฒนาคุณลักษณะที่ดีของผู้เรียน' }
        ],
        // ตอนที่ 1: ด้านการส่งเสริมและสนับสนุนการจัดการเรียนรู้ (2.1-2.4)
        part1_2: [
            { id: '2_1', label: '2.1 จัดทำข้อมูลสารสนเทศ' },
            { id: '2_2', label: '2.2 ดำเนินการตามระบบดูแลช่วยเหลือผู้เรียน' },
            { id: '2_3', label: '2.3 ร่วมปฏิบัติงานทางวิชาการและงานอื่น ๆ ของสถานศึกษา' },
            { id: '2_4', label: '2.4 ประสานความร่วมมือกับผู้ปกครอง หรือผู้เกี่ยวข้อง' }
        ],
        // ตอนที่ 1: ด้านการพัฒนาตนเอง และวิชาชีพ (3.1-3.3)
        part1_3: [
            { id: '3_1', label: '3.1 พัฒนาตนเองอย่างเป็นระบบและต่อเนื่อง' },
            { id: '3_2', label: '3.2 มีส่วนร่วมในการแลกเปลี่ยนเรียนรู้ทางวิชาชีพ' },
            { id: '3_3', label: '3.3 นำความรู้ ความสามารถ ทักษะ ที่ได้จากการพัฒนาตนเองและวิชาชีพมาใช้' }
        ],
        // ตอนที่ 2
        part2: [
            { id: '1', label: '1. วิธีการดำเนินการ (20 คะแนน)' },
            { id: '2.1', label: '2.1 ผลลัพธ์การเรียนรู้เชิงปริมาณ (10 คะแนน)' },
            { id: '2.2', label: '2.2 ผลลัพธ์การเรียนรู้เชิงคุณภาพ (10 คะแนน)' }
        ]
    },
    element2: [
        { id: '1', label: 'ความสำเร็จของงานที่ได้รับมอบหมายจากผู้บังคับบัญชา (ระดับ 1-5 คูณ 2)' }
    ],
    element3: [
        { id: '1', label: '1. ยึดมั่นในสถาบันหลักของประเทศ' },
        { id: '2', label: '2. มีความซื่อสัตย์ สุจริต มีจิตสำนึกที่ดี' },
        { id: '3', label: '3. มีความกล้าคิด กล้าตัดสินใจ กล้าแสดงออก' },
        { id: '4', label: '4. มีจิตอาสา จิตสาธารณะ มุ่งประโยชน์ส่วนรวม' },
        { id: '5', label: '5. มุ่งผลสัมฤทธิ์ของงาน มุ่งมั่นในการปฏิบัติงาน' },
        { id: '6', label: '6. ปฏิบัติหน้าที่อย่างเป็นธรรมและไม่เลือกปฏิบัติ' },
        { id: '7', label: '7. ดำรงตนเป็นแบบอย่างที่ดีและรักษาภาพลักษณ์' },
        { id: '8', label: '8. เคารพศักดิ์ศรีความเป็นมนุษย์' },
        { id: '9', label: '9. ยึดถือและปฏิบัติตามจรรยาบรรณของวิชาชีพ' },
        { id: '10', label: '10. มีวินัยและการรักษาวินัย' }
    ]
};

// ==========================================
// ✅ รายการหัวข้อมาตรฐานทั้งหมด (เต็ม 100 คะแนน)
// ==========================================
const STANDARD_FULL_ITEMS = [
    // องค์ประกอบที่ 1 (ตอนที่ 1) - 60 คะแนน
    { element: '1', value: '1_1', part: '1', label: '1.1 นำผลการวิเคราะห์หลักสูตร...', score: 4 },
    { element: '1', value: '1_2', part: '1', label: '1.2 ปฏิบัติการสอน...', score: 4 },
    { element: '1', value: '1_3', part: '1', label: '1.3 จัดกิจกรรมการเรียนรู้...', score: 4 },
    { element: '1', value: '1_4', part: '1', label: '1.4 เลือกและใช้สื่อ...', score: 4 },
    { element: '1', value: '1_5', part: '1', label: '1.5 วัดและประเมินผล...', score: 4 },
    { element: '1', value: '1_6', part: '1', label: '1.6 จัดบรรยากาศ...', score: 4 },
    { element: '1', value: '1_7', part: '1', label: '1.7 อบรมบ่มนิสัย...', score: 4 },
    { element: '1', value: '1_8', part: '1', label: '1.8 อบรมและพัฒนาคุณลักษณะ...', score: 4 },

    // องค์ประกอบที่ 1 (ตอนที่ 1) - ด้านส่งเสริมและสนับสนุน (2.1-2.4) - 16 คะแนน
    { element: '1', value: '2_1', part: '1', label: '2.1 จัดทำข้อมูลสารสนเทศ...', score: 4 },
    { element: '1', value: '2_2', part: '1', label: '2.2 ดำเนินการตามระบบดูแล...', score: 4 },
    { element: '1', value: '2_3', part: '1', label: '2.3 ร่วมปฏิบัติงานทางวิชาการ...', score: 4 },
    { element: '1', value: '2_4', part: '1', label: '2.4 ประสานความร่วมมือ...', score: 4 },

    // องค์ประกอบที่ 1 (ตอนที่ 1) - ด้านพัฒนาตนเองและวิชาชีพ (3.1-3.3) - 12 คะแนน
    { element: '1', value: '3_1', part: '1', label: '3.1 พัฒนาตนเอง...', score: 4 },
    { element: '1', value: '3_2', part: '1', label: '3.2 มีส่วนร่วมในการแลกเปลี่ยน...', score: 4 },
    { element: '1', value: '3_3', part: '1', label: '3.3 นำความรู้...', score: 4 },

    // องค์ประกอบที่ 1 (ตอนที่ 2) - 20 คะแนน
    { element: '1', value: '1', part: '2', label: '1. วิธีการดำเนินการ (20 คะแนน)', score: 20 },
    { element: '1', value: '2.1', part: '2', label: '2.1 ผลลัพธ์เชิงปริมาณ (10 คะแนน)', score: 10 },
    { element: '1', value: '2.2', part: '2', label: '2.2 ผลลัพธ์เชิงคุณภาพ (10 คะแนน)', score: 10 },

    // องค์ประกอบที่ 2 - 10 คะแนน
    { element: '2', value: '1', part: '', label: 'ความสำเร็จของงาน...', score: 10 },

    // องค์ประกอบที่ 3 - 10 คะแนน
    { element: '3', value: '1', part: '', label: '1. ยึดมั่นในสถาบันหลัก...', score: 1 },
    { element: '3', value: '2', part: '', label: '2. มีความซื่อสัตย์...', score: 1 },
    { element: '3', value: '3', part: '', label: '3. มีความกล้าคิด...', score: 1 },
    { element: '3', value: '4', part: '', label: '4. มีจิตอาสา...', score: 1 },
    { element: '3', value: '5', part: '', label: '5. มุ่งผลสัมฤทธิ์...', score: 1 },
    { element: '3', value: '6', part: '', label: '6. ปฏิบัติหน้าที่...', score: 1 },
    { element: '3', value: '7', part: '', label: '7. ดำรงตนเป็นแบบอย่าง...', score: 1 },
    { element: '3', value: '8', part: '', label: '8. เคารพศักดิ์ศรี...', score: 1 },
    { element: '3', value: '9', part: '', label: '9. ยึดถือและปฏิบัติตาม...', score: 1 },
    { element: '3', value: '10', part: '', label: '10. มีวินัย...', score: 1 }
];

// ==========================================
// ฟังก์ชันเริ่มต้น
// ==========================================
window.onload = async () => {
    await checkAuth();
};

// ==========================================
// ตรวจสอบสิทธิ์
// ==========================================
async function checkAuth() {
    Swal.fire({ title: 'กำลังโหลดระบบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('index.html');

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    currentUser = profile;

    // ✅ ตรวจสอบสิทธิ์ Admin
    if (!['admin', 'super_admin'].includes(currentUser.role)) {
        await Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าใช้งาน',
            text: 'เฉพาะผู้ดูแลระบบเท่านั้นที่สามารถเข้าใช้งานหน้านี้ได้',
            confirmButtonText: 'ตกลง'
        });
        window.location.replace('evaluation.html');
        return;
    }

    document.getElementById('header_user_name').innerText = `${currentUser.first_name} ${currentUser.last_name}`;
    document.getElementById('header_user_role').innerText = currentUser.role || '';

    // โหลดข้อมูลพื้นฐาน
    await loadSchoolInfo();
    await loadRounds();
    await loadPersonnel();
    await loadDepartments();
    await loadSubItems();

    // โหลดข้อมูลตาม Tab (เรียกใช้จากไฟล์ย่อย)
    await loadRoundsTable();
    await loadGroupsTable();
    await loadResultsTable();

    // โหลด dropdown
    await populateRoundDropdowns();

    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    Swal.close();
}

// ==========================================
// โหลดข้อมูลโรงเรียน
// ==========================================
async function loadSchoolInfo() {
    const { data: schoolInfo } = await db.from('core_school_info').select('*').single();
    currentTermData = schoolInfo;
    document.getElementById('header_school_term').innerText = `ภาคเรียนที่ ${schoolInfo.current_semester} / ${schoolInfo.current_academic_year}`;
}

// ==========================================
// โหลดรอบการประเมิน
// ==========================================
async function loadRounds() {
    const { data, error } = await db
        .from('eval_rounds')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading rounds:', error);
        return;
    }
    allRounds = data || [];
}

// ==========================================
// โหลดบุคลากรทั้งหมด
// ==========================================
async function loadPersonnel() {
    const { data, error } = await db
        .from('core_personnel')
        .select('id, prefix, first_name, last_name, academic_standing, department, role')
        .order('first_name', { ascending: true });

    if (error) {
        console.error('Error loading personnel:', error);
        return;
    }
    allPersonnel = data || [];
}

// ==========================================
// โหลดกลุ่มสาระ (เฉพาะที่อนุญาต)
// ==========================================
async function loadDepartments() {
    try {
        const { data, error } = await db
            .from('core_personnel')
            .select('department')
            .not('department', 'is', null)
            .neq('department', '');

        if (error) {
            console.error('Error loading departments:', error);
            allDepartments = ALLOWED_DEPARTMENTS;
            return;
        }

        // ดึงกลุ่มสาระที่มีอยู่ในระบบจริง
        const existingDepts = new Set();
        data.forEach(item => {
            if (item.department) existingDepts.add(item.department);
        });

        // ✅ กรองเฉพาะกลุ่มสาระที่อยู่ในรายการอนุญาต AND มีอยู่ในระบบ
        allDepartments = ALLOWED_DEPARTMENTS.filter(dept => existingDepts.has(dept));

        console.log('✅ กลุ่มสาระที่แสดง:', allDepartments);
    } catch (err) {
        console.error('Error in loadDepartments:', err);
        allDepartments = ALLOWED_DEPARTMENTS;
    }
}

// ==========================================
// โหลดหัวข้อย่อย (จาก evalCriteriaDB) - แก้ไข
// ==========================================
async function loadSubItems() {
    // ✅ ใช้ getCriteriaByAcademic แทนการอ้าง evalCriteriaDB โดยตรง
    if (typeof getCriteriaByAcademic === 'function') {
        const sampleLevel = Object.keys(evalCriteriaDB)[0];
        if (sampleLevel) {
            // ✅ ใช้ getCriteriaByAcademic เพื่อให้แน่ใจว่าได้เกณฑ์ที่ถูกต้อง
            const criteria = getCriteriaByAcademic(sampleLevel);
            if (criteria && criteria.part1_sec1) {
                allSubItems = criteria.part1_sec1.flatMap(group =>
                    group.items.map(item => ({
                        id: item.id,
                        label: item.label,
                        desc: item.desc
                    }))
                );
            }
        }
    } else {
        // fallback
        if (typeof evalCriteriaDB !== 'undefined') {
            const sampleLevel = Object.keys(evalCriteriaDB)[0];
            if (sampleLevel) {
                const criteria = evalCriteriaDB[sampleLevel];
                if (criteria && criteria.part1_sec1) {
                    allSubItems = criteria.part1_sec1.flatMap(group =>
                        group.items.map(item => ({
                            id: item.id,
                            label: item.label,
                            desc: item.desc
                        }))
                    );
                }
            }
        }
    }

    if (allSubItems.length === 0) {
        allSubItems = EVAL_SUB_ITEMS.element1.part1;
    }
}

// ==========================================
// ฟังก์ชันสลับ Tab
// ==========================================
function switchTab(tabName) {
    // ซ่อนทุก Panel
    document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    // แสดง Panel ที่เลือก
    document.getElementById(`panel-${tabName}`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');

    // โหลดข้อมูลใหม่ตาม Tab
    if (tabName === 'rounds') loadRoundsTable();
    else if (tabName === 'groups') loadGroupsTable();
    else if (tabName === 'results') loadResultsTable();
}

// ==========================================
// ฟังก์ชัน populate Round Dropdowns
// ==========================================
async function populateRoundDropdowns() {
    const selectors = ['filter_round_for_groups', 'filter_round_for_results', 'group_round_id'];
    for (const selector of selectors) {
        const el = document.getElementById(selector);
        if (!el) continue;
        const currentValue = el.value;
        el.innerHTML = '<option value="">-- เลือกรอบการประเมิน --</option>';
        allRounds.forEach(round => {
            const opt = document.createElement('option');
            opt.value = round.id;
            opt.textContent = `${round.round_name} (ครั้งที่ ${round.round_number})`;
            if (round.is_active) opt.textContent += ' ✅';
            el.appendChild(opt);
        });
        if (currentValue) el.value = currentValue;
    }

    // ✅ กรอง dropdown ชุดหลัก
    await populateParentGroupDropdown();
}

// ==========================================
// ฟังก์ชัน populate Parent Group Dropdown
// ==========================================
async function populateParentGroupDropdown() {
    const el = document.getElementById('group_parent_id');
    if (!el) return;
    const currentValue = el.value;
    const roundId = document.getElementById('group_round_id').value;

    el.innerHTML = '<option value="">-- เลือกชุดหลัก --</option>';

    if (!roundId) return;

    // กรองเฉพาะชุดหลัก
    const mainGroups = allGroups.filter(g =>
        g.eval_round_id === roundId &&
        g.group_type === 'main' &&
        g.is_active !== false
    );

    mainGroups.forEach(group => {
        const opt = document.createElement('option');
        opt.value = group.id;
        opt.textContent = group.group_name;
        if (group.is_active === false) opt.textContent += ' (ปิดใช้งาน)';
        el.appendChild(opt);
    });

    if (currentValue) el.value = currentValue;
}

// ==========================================
// TAB 1: รอบการประเมิน
// ==========================================
async function loadRoundsTable() {
    const tbody = document.getElementById('tb-rounds');
    if (!tbody) return;

    // ทำลาย DataTable เก่า
    if (roundsDataTable) {
        roundsDataTable.destroy();
        roundsDataTable = null;
    }

    if (allRounds.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-8 text-gray-400">
                    <i class="fa-solid fa-info-circle mr-2"></i>ยังไม่มีรอบการประเมิน
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    allRounds.forEach(round => {
        const isActive = round.is_active;
        const statusBadge = isActive
            ? '<span class="status-badge active">✅ เปิดใช้งาน</span>'
            : '<span class="status-badge inactive">❌ ปิดใช้งาน</span>';

        const startDate = round.start_date ? new Date(round.start_date).toLocaleDateString('th-TH') : '-';
        const endDate = round.end_date ? new Date(round.end_date).toLocaleDateString('th-TH') : '-';

        html += `
            <tr>
                <td class="font-medium">${round.round_name || '-'}</td>
                <td class="text-center">${round.round_number || '-'}</td>
                <td>${startDate}</td>
                <td>${endDate}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center">
                    <button onclick="editRound('${round.id}')" 
                            class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        <i class="fa-solid fa-pen-to-square mr-1"></i>แก้ไข
                    </button>
                    <button onclick="toggleRoundStatus('${round.id}')" 
                            class="${isActive ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-1">
                        <i class="fa-solid ${isActive ? 'fa-pause' : 'fa-play'} mr-1"></i>${isActive ? 'ปิด' : 'เปิด'}
                    </button>
                    <button onclick="deleteRound('${round.id}')" 
                            class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-1">
                        <i class="fa-solid fa-trash mr-1"></i>ลบ
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

    // ✅ สร้าง DataTable
    setTimeout(() => {
        try {
            if ($.fn.DataTable.isDataTable('#roundsTable')) {
                $('#roundsTable').DataTable().destroy();
            }
            roundsDataTable = $('#roundsTable').DataTable({
                scrollX: true,
                language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
                pageLength: 10,
                lengthMenu: [[5, 10, 25, -1], [5, 10, 25, 'ทั้งหมด']],
                columnDefs: [
                    { targets: [0], width: '25%' },
                    { targets: [1], width: '10%' },
                    { targets: [2], width: '15%' },
                    { targets: [3], width: '15%' },
                    { targets: [4], width: '15%' },
                    { targets: [5], width: '20%', orderable: false }
                ],
                dom: '<"flex flex-wrap justify-between items-center gap-2 mb-3"lf>rt<"flex flex-wrap justify-between items-center gap-2 mt-3"ip>'
            });
        } catch (e) {
            console.warn('DataTable init error:', e);
        }
    }, 200);
}

// ==========================================
// เปิด Modal สร้างรอบการประเมิน
// ==========================================
function openRoundModal() {
    document.getElementById('roundModalTitle').innerHTML = `
        <i class="fa-solid fa-calendar-plus text-blue-500 mr-2"></i>สร้างรอบการประเมิน
    `;
    document.getElementById('round_edit_id').value = '';
    document.getElementById('roundForm').reset();
    document.getElementById('round_is_active').checked = true;
    document.getElementById('roundModal').classList.remove('hidden');
}

// ==========================================
// ปิด Modal รอบการประเมิน
// ==========================================
function closeRoundModal() {
    document.getElementById('roundModal').classList.add('hidden');
}

// ==========================================
// แก้ไขรอบการประเมิน
// ==========================================
async function editRound(roundId) {
    const round = allRounds.find(r => r.id === roundId);
    if (!round) return;

    document.getElementById('roundModalTitle').innerHTML = `
        <i class="fa-solid fa-pen-to-square text-amber-500 mr-2"></i>แก้ไขรอบการประเมิน
    `;
    document.getElementById('round_edit_id').value = round.id;
    document.getElementById('round_name').value = round.round_name || '';
    document.getElementById('round_number').value = round.round_number || '';
    document.getElementById('round_start_date').value = round.start_date ? round.start_date.split('T')[0] : '';
    document.getElementById('round_end_date').value = round.end_date ? round.end_date.split('T')[0] : '';
    document.getElementById('round_is_active').checked = round.is_active || false;

    document.getElementById('roundModal').classList.remove('hidden');
}

// ==========================================
// บันทึกรอบการประเมิน
// ==========================================
document.getElementById('roundForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();

    const id = document.getElementById('round_edit_id').value;
    const round_name = document.getElementById('round_name').value.trim();
    const round_number = parseInt(document.getElementById('round_number').value);
    const start_date = document.getElementById('round_start_date').value;
    const end_date = document.getElementById('round_end_date').value;
    const is_active = document.getElementById('round_is_active').checked;

    if (!round_name) {
        return Swal.fire('แจ้งเตือน', 'กรุณากรอกชื่อรอบการประเมิน', 'warning');
    }
    if (!round_number || round_number < 1) {
        return Swal.fire('แจ้งเตือน', 'กรุณากรอกครั้งที่ให้ถูกต้อง', 'warning');
    }
    if (!start_date) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกวันที่เริ่ม', 'warning');
    }
    if (!end_date) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกวันที่สิ้นสุด', 'warning');
    }
    if (new Date(start_date) > new Date(end_date)) {
        return Swal.fire('แจ้งเตือน', 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด', 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const payload = {
            round_name,
            round_number,
            start_date,
            end_date,
            is_active,
            updated_at: new Date().toISOString()
        };

        let result;
        if (id) {
            // ✅ ถ้าเปิดใช้งานรอบนี้ ให้ปิดรอบอื่น
            if (is_active) {
                await db.from('eval_rounds').update({ is_active: false }).neq('id', id);
            }
            const { data, error } = await db
                .from('eval_rounds')
                .update(payload)
                .eq('id', id)
                .select();
            if (error) throw error;
            result = data;
        } else {
            // ✅ ถ้าเปิดใช้งาน ให้ปิดรอบอื่น
            if (is_active) {
                await db.from('eval_rounds').update({ is_active: false });
            }
            const { data, error } = await db
                .from('eval_rounds')
                .insert([payload])
                .select();
            if (error) throw error;
            result = data;
        }

        Swal.close();
        closeRoundModal();
        await loadRounds();
        await loadRoundsTable();
        await populateRoundDropdowns();

        Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ!',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error saving round:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// เปลี่ยนสถานะรอบการประเมิน
// ==========================================
async function toggleRoundStatus(roundId) {
    const round = allRounds.find(r => r.id === roundId);
    if (!round) return;

    const newStatus = !round.is_active;
    const action = newStatus ? 'เปิดใช้งาน' : 'ปิดใช้งาน';

    const result = await Swal.fire({
        icon: 'warning',
        title: `ยืนยันการ${action}`,
        text: `คุณต้องการ${action}รอบ "${round.round_name}" ใช่หรือไม่?`,
        showCancelButton: true,
        confirmButtonText: 'ใช่',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (newStatus) {
            // ✅ ปิดรอบอื่นทั้งหมด
            await db.from('eval_rounds').update({ is_active: false });
        }
        await db.from('eval_rounds').update({ is_active: newStatus }).eq('id', roundId);

        Swal.close();
        await loadRounds();
        await loadRoundsTable();
        await populateRoundDropdowns();

        Swal.fire({
            icon: 'success',
            title: `✅ ${action}สำเร็จ!`,
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error toggling round:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ลบรอบการประเมิน
// ==========================================
async function deleteRound(roundId) {
    const round = allRounds.find(r => r.id === roundId);
    if (!round) return;

    const result = await Swal.fire({
        icon: 'error',
        title: 'ยืนยันการลบ',
        text: `คุณต้องการลบรอบ "${round.round_name}" ใช่หรือไม่? ข้อมูลที่เกี่ยวข้องจะถูกลบทั้งหมด`,
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        await db.from('eval_rounds').delete().eq('id', roundId);

        Swal.close();
        await loadRounds();
        await loadRoundsTable();
        await populateRoundDropdowns();

        Swal.fire({
            icon: 'success',
            title: 'ลบสำเร็จ!',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error deleting round:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// Event Listeners
// ==========================================

// ✅ กรองคณะกรรมการตามรอบ
document.getElementById('filter_round_for_groups')?.addEventListener('change', function () {
    loadGroupsTable();
});

// ✅ กรองผลการประเมินตามรอบ
document.getElementById('filter_round_for_results')?.addEventListener('change', function () {
    loadResultsTable();
});

// ✅ เมื่อเลือกรอบใน Modal ให้โหลด Parent Groups
document.getElementById('group_round_id')?.addEventListener('change', function () {
    populateParentGroupDropdown();
});

// ==========================================
// ตรวจสอบรายละเอียดการประเมินของแต่ละคน (ฟังก์ชันเดิมย้ายมาจากไฟล์หลัก)
// ==========================================
async function checkTeacherEvaluationDetail(teacherId, groupId, roundId) {
    try {
        // ดึงข้อมูลการประเมินของครูคนนี้
        const { data: results, error } = await db
            .from('eval_results')
            .select('*, evaluator_id')
            .eq('evaluatee_id', teacherId)
            .eq('eval_round_id', roundId)
            .eq('eval_type', 'committee')
            .eq('status', 'submitted');

        if (error) throw error;

        // ดึงข้อมูลครู
        const { data: teacher, error: tErr } = await db
            .from('core_personnel')
            .select('prefix, first_name, last_name, academic_standing')
            .eq('id', teacherId)
            .single();

        if (tErr) throw tErr;

        const name = `${teacher.prefix || ''}${teacher.first_name} ${teacher.last_name}`;

        // ดึงหัวข้อย่อยที่ต้องประเมินของชุดนี้
        const { data: group, error: gErr } = await db
            .from('eval_committee_groups')
            .select('selected_sub_items')
            .eq('id', groupId)
            .single();

        if (gErr) throw gErr;

        const requiredItems = group?.selected_sub_items || [];
        const requiredKeys = requiredItems.map(item => {
            if (item.element === '1') {
                if (item.part === '1') return 'p1_s1';
                if (item.part === '2') return 'p1_s2';
            }
            if (item.element === '2') return 'p2';
            if (item.element === '3') return 'p3';
            return null;
        }).filter(key => key !== null);

        // สร้างรายงาน
        let detailHtml = `
            <div class="text-left">
                <div class="flex justify-between items-center mb-4">
                    <div>
                        <h4 class="font-bold text-gray-800">${name}</h4>
                        <p class="text-sm text-gray-500">วิทยฐานะ: ${teacher.academic_standing || '-'}</p>
                    </div>
                    <span class="text-xs text-gray-400">${new Date().toLocaleString('th-TH')}</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm border-collapse">
                        <thead>
                            <tr class="bg-gray-100">
                                <th class="p-2 text-left border">หัวข้อที่ต้องประเมิน</th>
                                <th class="p-2 text-center border">สถานะ</th>
                                <th class="p-2 text-center border">คะแนน</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        const evalResult = results && results.length > 0 ? results[0] : null;

        requiredItems.forEach(item => {
            let status = '❌ ยังไม่ประเมิน';
            let score = '-';
            let key = '';

            if (item.element === '1') {
                if (item.part === '1') {
                    key = 'p1_s1';
                } else if (item.part === '2') {
                    key = 'p1_s2';
                }
            } else if (item.element === '2') {
                key = 'p2';
            } else if (item.element === '3') {
                key = 'p3';
            }

            if (evalResult && evalResult.detailed_scores) {
                const scores = evalResult.detailed_scores[key];
                if (scores !== undefined && scores !== null) {
                    status = '✅ ประเมินแล้ว';
                    if (Array.isArray(scores)) {
                        score = scores.join(', ');
                    } else {
                        score = String(scores);
                    }
                }
            }

            const displayText = `${item.element}:${item.value}${item.part ? ` (ตอนที่ ${item.part})` : ''}`;

            detailHtml += `
                <tr class="border-b">
                    <td class="p-2 border text-sm">${displayText}</td>
                    <td class="p-2 text-center border ${status.includes('✅') ? 'text-green-600' : 'text-red-500'}">${status}</td>
                    <td class="p-2 text-center border font-bold">${score}</td>
                </tr>
            `;
        });

        detailHtml += `
                        </tbody>
                    </table>
                </div>
                ${evalResult ? `<div class="mt-3 text-sm text-gray-500">คะแนนรวม: <b>${evalResult.total_score?.toFixed(2) || 0}</b> / 100</div>` : ''}
            </div>
        `;

        await Swal.fire({
            title: '📋 รายละเอียดการประเมิน',
            html: detailHtml,
            width: '700px',
            confirmButtonText: 'ปิด',
            confirmButtonColor: '#6366f1'
        });

    } catch (err) {
        console.error('Error checking teacher detail:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// แสดงรายชื่อครูที่ยังไม่ประเมิน (ฟังก์ชันเดิมย้ายมาจากไฟล์หลัก)
// ==========================================
async function showNotEvaluated(groupId, groupName, departments) {
    const roundId = document.getElementById('filter_round_for_groups').value;

    if (!roundId) {
        Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมิน', 'warning');
        return;
    }

    try {
        // ดึงกลุ่มสาระของชุดนี้
        const deptList = departments.split(', ').filter(d => d && d !== '-');

        if (deptList.length === 0) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบกลุ่มสาระของชุดนี้', 'info');
        }

        // ดึงรายชื่อครูในกลุ่มสาระ
        let allTeachers = [];
        for (const dept of deptList) {
            const { data: teachers, error: tErr } = await db
                .from('core_personnel')
                .select('id, prefix, first_name, last_name, academic_standing')
                .eq('department', dept)
                .in('academic_standing', ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ']);

            if (!tErr && teachers) {
                allTeachers = [...allTeachers, ...teachers];
            }
        }

        if (allTeachers.length === 0) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบครูในกลุ่มสาระนี้', 'info');
        }

        // ดึงผลการประเมิน
        const teacherIds = allTeachers.map(t => t.id);
        const { data: evals, error: eErr } = await db
            .from('eval_results')
            .select('evaluatee_id')
            .in('evaluatee_id', teacherIds)
            .eq('eval_round_id', roundId)
            .eq('eval_type', 'committee')
            .eq('status', 'submitted');

        if (eErr) throw eErr;

        const evaluatedIds = new Set(evals.map(e => e.evaluatee_id));
        const notEvaluated = allTeachers.filter(t => !evaluatedIds.has(t.id));

        if (notEvaluated.length === 0) {
            return Swal.fire('✅ ครบถ้วน', 'ครูทุกคนได้รับการประเมินแล้ว', 'success');
        }

        // แสดงรายชื่อ
        let nameList = notEvaluated.map((t, i) =>
            `${i + 1}. ${t.prefix || ''}${t.first_name} ${t.last_name} (${t.academic_standing || '-'})`
        ).join('\n');

        await Swal.fire({
            title: `📋 ครูที่ยังไม่ประเมิน (${notEvaluated.length} คน)`,
            html: `
                <div class="text-left">
                    <p class="text-sm text-gray-500 mb-2">ชุด: <b>${groupName}</b></p>
                    <p class="text-sm text-gray-500 mb-3">กลุ่มสาระ: <b>${departments}</b></p>
                    <div class="bg-gray-50 p-3 rounded-lg max-h-60 overflow-y-auto">
                        <pre class="text-sm whitespace-pre-wrap font-sans">${nameList}</pre>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">💡 คลิกปุ่ม "แก้ไข" เพื่อเพิ่มกรรมการหรือปรับเปลี่ยนชุด</p>
                </div>
            `,
            confirmButtonText: 'ปิด',
            confirmButtonColor: '#6366f1',
            width: '500px'
        });

    } catch (err) {
        console.error('Error showing not evaluated:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// LOGOUT
// ==========================================
async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace('login.html');
    }
}

// ==========================================
// EXPOSE GLOBAL FUNCTIONS
// ==========================================
window.switchTab = switchTab;
window.openRoundModal = openRoundModal;
window.closeRoundModal = closeRoundModal;
window.editRound = editRound;
window.toggleRoundStatus = toggleRoundStatus;
window.deleteRound = deleteRound;
window.checkTeacherEvaluationDetail = checkTeacherEvaluationDetail;
window.showNotEvaluated = showNotEvaluated;
window.logout = logout;

console.log('✅ evaluation_admin.js loaded successfully');