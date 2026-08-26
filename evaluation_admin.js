// ==========================================
// evaluation_admin.js - จัดการระบบประเมินผล
// ==========================================

// ==========================================
// ตัวแปรระบบ
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

    // โหลดข้อมูลตาม Tab
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
// โหลดหัวข้อย่อย (จาก evalCriteriaDB)
// ==========================================
async function loadSubItems() {
    // ใช้ evalCriteriaDB จาก evaluation.js
    // ถ้า evalCriteriaDB ไม่มี ให้ใช้ค่าจาก EVAL_SUB_ITEMS
    if (typeof evalCriteriaDB !== 'undefined') {
        // ดึงหัวข้อจาก evalCriteriaDB
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
    if (allSubItems.length === 0) {
        // ใช้ค่าเริ่มต้น
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
document.getElementById('roundForm')?.addEventListener('submit', async function(e) {
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
// TAB 2: คณะกรรมการ (Responsive)
// ==========================================
async function loadGroupsTable() {
    const tbody = document.getElementById('tb-groups');
    const mobileContainer = document.getElementById('groupsMobileContainer');
    if (!tbody) return;

    // ทำลาย DataTable เก่า
    if (groupsDataTable) {
        groupsDataTable.destroy();
        groupsDataTable = null;
    }

    const roundId = document.getElementById('filter_round_for_groups').value;
    let filteredGroups = allGroups;

    if (roundId) {
        filteredGroups = allGroups.filter(g => g.eval_round_id === roundId);
    }

    // โหลดข้อมูลล่าสุด
    await loadGroups(roundId);

    if (filteredGroups.length === 0) {
        const emptyMsg = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-400">
                    <i class="fa-solid fa-info-circle mr-2"></i>ยังไม่มีคณะกรรมการ${roundId ? ' ในรอบนี้' : ''}
                </td>
            </tr>
        `;
        tbody.innerHTML = emptyMsg;
        if (mobileContainer) {
            mobileContainer.innerHTML = `
                <div class="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200 p-6">
                    <i class="fa-solid fa-info-circle text-2xl mb-2"></i>
                    <p>ยังไม่มีคณะกรรมการ${roundId ? ' ในรอบนี้' : ''}</p>
                </div>
            `;
        }
        return;
    }

    let html = '';
    let mobileHtml = '';

    for (const group of filteredGroups) {
        const isActive = group.is_active !== false;
        const statusBadge = isActive
            ? '<span class="status-badge active">✅ เปิดใช้งาน</span>'
            : '<span class="status-badge inactive">❌ ปิดใช้งาน</span>';

        // ✅ หาสมาชิก
        const { data: members } = await db
            .from('eval_committee_members')
            .select('user_id, core_personnel(first_name, last_name)')
            .eq('committee_group_id', group.id)
            .eq('is_active', true);

        const memberNames = members ? members.map(m => 
            m.core_personnel ? `${m.core_personnel.first_name} ${m.core_personnel.last_name}` : '-'
        ) : [];

        // ✅ หากลุ่มเป้าหมาย
        const { data: targets } = await db
            .from('eval_committee_targets')
            .select('target_type, target_value')
            .eq('committee_group_id', group.id)
            .eq('is_active', true);

        const targetNames = targets ? targets.map(t => t.target_value).join(', ') : '-';

        // ✅ แสดงหัวข้อย่อย
        const subItems = group.selected_sub_items || [];
        const subItemsText = subItems.map(s => `${s.element}:${s.value}`).join(', ') || '-';

        // ✅ หาชื่อชุดหลัก (ถ้าเป็นชุดย่อย)
        let parentName = '-';
        if (group.group_type === 'sub' && group.parent_group_id) {
            const parent = allGroups.find(g => g.id === group.parent_group_id);
            if (parent) parentName = parent.group_name;
        }

        // ✅ ฟังก์ชันตัดข้อความ
        function truncateText(text, maxLength = 40) {
            if (!text || text === '-') return text;
            return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        }

        // ✅ ข้อความที่ตัดแล้ว + เตรียม tooltip
        const subItemsDisplay = truncateText(subItemsText, 35);
        const membersDisplay = truncateText(memberNames.join(', '), 35);
        const targetsDisplay = truncateText(targetNames, 35);
        const groupNameDisplay = truncateText(group.group_name || '-', 25);
        const parentNameDisplay = truncateText(parentName, 20);

        // ✅ Desktop Table Row
        html += `
            <tr>
                <td class="font-medium" title="${group.group_name || '-'}">${groupNameDisplay}</td>
                <td class="text-center">
                    <span class="px-2 py-1 rounded-full text-xs font-bold ${group.group_type === 'main' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}">
                        ${group.group_type === 'main' ? 'ชุดหลัก' : 'ชุดย่อย'}
                    </span>
                </td>
                <td title="${parentName}">${parentNameDisplay}</td>
                <td class="text-sm" title="${subItemsText}">${subItemsDisplay}</td>
                <td class="text-sm" title="${memberNames.join(', ')}">${membersDisplay || '-'}</td>
                <td class="text-sm" title="${targetNames}">${targetsDisplay}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center whitespace-nowrap">
                    <button onclick="editGroup('${group.id}')" 
                            class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        <i class="fa-solid fa-pen-to-square mr-1"></i>แก้ไข
                    </button>
                    <button onclick="toggleGroupStatus('${group.id}')" 
                            class="${isActive ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-1">
                        <i class="fa-solid ${isActive ? 'fa-pause' : 'fa-play'} mr-1"></i>${isActive ? 'ปิด' : 'เปิด'}
                    </button>
                    <button onclick="deleteGroup('${group.id}')" 
                            class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-1">
                        <i class="fa-solid fa-trash mr-1"></i>ลบ
                    </button>
                </td>
            </tr>
        `;

        // ✅ Mobile Card View
        const typeLabel = group.group_type === 'main' ? 'ชุดหลัก' : 'ชุดย่อย';
        const typeColor = group.group_type === 'main' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
        const statusColor = isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        const statusText = isActive ? '✅ เปิดใช้งาน' : '❌ ปิดใช้งาน';

        // ตัดข้อความสำหรับมือถือให้สั้นลง
        const shortSubItems = truncateText(subItemsText, 25);
        const shortMembers = truncateText(memberNames.join(', '), 25);
        const shortTargets = truncateText(targetNames, 25);

        mobileHtml += `
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <h4 class="font-bold text-gray-800" title="${group.group_name || '-'}">${groupNameDisplay}</h4>
                            <span class="px-2 py-0.5 rounded-full text-xs font-bold ${typeColor}">${typeLabel}</span>
                            <span class="px-2 py-0.5 rounded-full text-xs font-bold ${statusColor}">${statusText}</span>
                        </div>
                        ${group.group_type === 'sub' ? `<p class="text-xs text-gray-400 mt-1" title="${parentName}">ชุดหลัก: ${parentNameDisplay}</p>` : ''}
                    </div>
                    <div class="flex gap-1 flex-shrink-0">
                        <button onclick="editGroup('${group.id}')" 
                                class="bg-amber-500 hover:bg-amber-600 text-white px-2 py-1 rounded-lg text-xs font-bold transition-colors">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button onclick="toggleGroupStatus('${group.id}')" 
                                class="${isActive ? 'bg-red-500 hover:bg-red-600' : 'bg-emerald-500 hover:bg-emerald-600'} text-white px-2 py-1 rounded-lg text-xs font-bold transition-colors">
                            <i class="fa-solid ${isActive ? 'fa-pause' : 'fa-play'}"></i>
                        </button>
                        <button onclick="deleteGroup('${group.id}')" 
                                class="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded-lg text-xs font-bold transition-colors">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div>
                        <span class="text-gray-400">หัวข้อย่อย</span>
                        <p class="font-medium text-gray-700 truncate" title="${subItemsText}">${shortSubItems}</p>
                    </div>
                    <div>
                        <span class="text-gray-400">กลุ่มเป้าหมาย</span>
                        <p class="font-medium text-gray-700 truncate" title="${targetNames}">${shortTargets}</p>
                    </div>
                    <div class="col-span-2">
                        <span class="text-gray-400">สมาชิก</span>
                        <p class="font-medium text-gray-700 truncate" title="${memberNames.join(', ')}">${shortMembers || '-'}</p>
                    </div>
                </div>
            </div>
        `;
    }

    // ✅ อัปเดต Desktop Table
    tbody.innerHTML = html;

    // ✅ อัปเดต Mobile View
    if (mobileContainer) {
        mobileContainer.innerHTML = mobileHtml || `
            <div class="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-200 p-6">
                <i class="fa-solid fa-info-circle text-2xl mb-2"></i>
                <p>ไม่มีข้อมูล</p>
            </div>
        `;
    }

    // ✅ สร้าง DataTable (เฉพาะ Desktop)
    setTimeout(() => {
        try {
            if (window.innerWidth >= 768) {
                if ($.fn.DataTable.isDataTable('#groupsTable')) {
                    $('#groupsTable').DataTable().destroy();
                }
                groupsDataTable = $('#groupsTable').DataTable({
                    scrollX: true,
                    responsive: true,
                    language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
                    pageLength: 10,
                    lengthMenu: [[5, 10, 25, -1], [5, 10, 25, 'ทั้งหมด']],
                    columnDefs: [
                        { targets: [0], width: '12%' },
                        { targets: [1], width: '8%' },
                        { targets: [2], width: '10%' },
                        { targets: [3], width: '20%' },
                        { targets: [4], width: '20%' },
                        { targets: [5], width: '14%' },
                        { targets: [6], width: '8%' },
                        { targets: [7], width: '8%', orderable: false }
                    ],
                    dom: '<"flex flex-wrap justify-between items-center gap-2 mb-3"lf>rt<"flex flex-wrap justify-between items-center gap-2 mt-3"ip>',
                    drawCallback: function() {
                        if (window.innerWidth < 768) {
                            $('.dataTables_filter, .dataTables_length').hide();
                        } else {
                            $('.dataTables_filter, .dataTables_length').show();
                        }
                    }
                });
            }
        } catch (e) {
            console.warn('DataTable init error:', e);
        }
    }, 200);
}

// ==========================================
// โหลดกลุ่มคณะกรรมการ
// ==========================================
async function loadGroups(roundId = null) {
    let query = db.from('eval_committee_groups').select('*');
    if (roundId) {
        query = query.eq('eval_round_id', roundId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading groups:', error);
        return;
    }
    allGroups = data || [];
}

// ==========================================
// เปิด Modal สร้างคณะกรรมการ
// ==========================================
async function openGroupModal() {
    document.getElementById('groupModalTitle').innerHTML = `
        <i class="fa-solid fa-users-plus text-purple-500 mr-2"></i>สร้างชุดคณะกรรมการ
    `;
    document.getElementById('group_edit_id').value = '';
    document.getElementById('groupForm').reset();
    document.getElementById('group_is_active').checked = true;
    document.getElementById('group_type').value = 'main';
    document.getElementById('parent_group_container').style.display = 'none';

    await populateRoundDropdowns();
    await populatePersonnelSelect([]);  // ✅ ส่ง array ว่าง (ไม่มีข้อมูลเดิม)
    await populateDepartmentCheckboxes();
    await renderSubItems();

    document.getElementById('groupModal').classList.remove('hidden');
}

// ==========================================
// ปิด Modal คณะกรรมการ
// ==========================================
function closeGroupModal() {
    document.getElementById('groupModal').classList.add('hidden');
}

// ==========================================
// แก้ไขคณะกรรมการ (ปรับปรุง)
// ==========================================
async function editGroup(groupId) {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;

    document.getElementById('groupModalTitle').innerHTML = `
        <i class="fa-solid fa-pen-to-square text-amber-500 mr-2"></i>แก้ไขชุดคณะกรรมการ
    `;
    document.getElementById('group_edit_id').value = group.id;

    await populateRoundDropdowns();
    await populateDepartmentCheckboxes();
    await renderSubItems();

    // ✅ เติมข้อมูลทั่วไป
    document.getElementById('group_round_id').value = group.eval_round_id || '';
    document.getElementById('group_name').value = group.group_name || '';
    document.getElementById('group_type').value = group.group_type || 'main';
    document.getElementById('group_is_active').checked = group.is_active !== false;

    // ✅ แสดง/ซ่อน parent group
    if (group.group_type === 'sub') {
        document.getElementById('parent_group_container').style.display = 'block';
        await populateParentGroupDropdown();
        document.getElementById('group_parent_id').value = group.parent_group_id || '';
    } else {
        document.getElementById('parent_group_container').style.display = 'none';
    }

    // ✅ เลือกหัวข้อย่อย
    const subItems = group.selected_sub_items || [];
    document.querySelectorAll('#sub_items_container input[type="checkbox"]').forEach(cb => {
        const element = cb.dataset.element;
        const value = cb.dataset.value;
        const part = cb.dataset.part || '';
        const found = subItems.some(s => s.element === element && s.value === value && s.part === part);
        cb.checked = found;
    });

    // ✅ โหลดสมาชิกที่บันทึกไว้
    const { data: members, error: memError } = await db
        .from('eval_committee_members')
        .select('user_id')
        .eq('committee_group_id', group.id)
        .eq('is_active', true);

    if (memError) {
        console.error('Error loading members:', memError);
    }

    const memberIds = members ? members.map(m => m.user_id) : [];
    console.log('✅ สมาชิกที่บันทึกไว้:', memberIds);

    // ✅ โหลด Personnel Select พร้อมส่ง memberIds
    await populatePersonnelSelect(memberIds);

    // ✅ เลือกกลุ่มเป้าหมาย
    const { data: targets } = await db
        .from('eval_committee_targets')
        .select('target_value')
        .eq('committee_group_id', group.id)
        .eq('target_type', 'department')
        .eq('is_active', true);

    if (targets) {
        const targetValues = new Set(targets.map(t => t.target_value));
        document.querySelectorAll('#target_departments_container input[type="checkbox"]').forEach(cb => {
            cb.checked = targetValues.has(cb.value);
        });
    }

    document.getElementById('groupModal').classList.remove('hidden');
}

// ==========================================
// Populate Personnel Select (Tom Select) - รองรับการโหลดข้อมูลเดิม
// ==========================================
async function populatePersonnelSelect(selectedIds = []) {
    const el = document.getElementById('group_members');
    if (!el) return;

    const eligiblePersonnel = allPersonnel.filter(p => 
        ['teacher', 'admin', 'super_admin', 'deputy', 'director'].includes(p.role)
    );

    el.innerHTML = '';
    eligiblePersonnel.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        const name = `${p.prefix || ''}${p.first_name} ${p.last_name}`;
        const standing = p.academic_standing || '-';
        opt.textContent = `${name} (${standing})`;
        if (selectedIds.includes(p.id)) {
            opt.selected = true;
        }
        el.appendChild(opt);
    });

    if (el.tomselect) {
        el.tomselect.destroy();
        el.tomselect = null;
    }

    setTimeout(() => {
        try {
            const ts = new TomSelect(el, {
                plugins: ['remove_button', 'dropdown_input'],
                maxItems: null,
                placeholder: 'เลือกสมาชิกคณะกรรมการ...',
                create: false,
                sortField: 'text',
                searchField: ['text'],
                render: {
                    option: function(data, escape) {
                        return `<div class="option" data-value="${data.value}">${escape(data.text)}</div>`;
                    }
                }
            });
            el.tomselect = ts;
            
            // ✅ บังคับเลือกค่าที่ส่งมา
            if (selectedIds && selectedIds.length > 0) {
                setTimeout(() => {
                    ts.setValue(selectedIds);
                    console.log('✅ ตั้งค่า Tom Select เป็น:', selectedIds);
                }, 150);
            }
        } catch (err) {
            console.error('Error creating Tom Select:', err);
        }
    }, 100);
}

// ==========================================
// Populate Department Checkboxes (พร้อมปุ่มเลือกทั้งหมด)
// ==========================================
function populateDepartmentCheckboxes() {
    const container = document.getElementById('target_departments_container');
    if (!container) return;

    const currentValues = [];
    container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        currentValues.push(cb.value);
    });

    container.innerHTML = '';
    
    if (allDepartments.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400">ไม่พบกลุ่มสาระในระบบ</p>';
        return;
    }

    // ✅ เพิ่มปุ่มเลือกทั้งหมด
    const headerDiv = document.createElement('div');
    headerDiv.className = 'flex justify-between items-center mb-2';
    headerDiv.innerHTML = `
        <span class="text-xs font-bold text-gray-400">เลือกกลุ่มเป้าหมาย</span>
        <button type="button" onclick="toggleAllDepartments()" class="select-all-btn text-xs">
            <i class="fa-solid fa-check-double mr-1"></i>เลือกทั้งหมด
        </button>
    `;
    container.appendChild(headerDiv);

    // ✅ แสดงเป็น checkbox grid
    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-2 md:grid-cols-3 gap-2';

    allDepartments.forEach(dept => {
        const label = document.createElement('label');
        label.className = 'dept-checkbox-label';
        label.innerHTML = `
            <input type="checkbox" value="${dept}" ${currentValues.includes(dept) ? 'checked' : ''}>
            <span>${dept}</span>
        `;
        grid.appendChild(label);
    });

    container.appendChild(grid);
}

// ==========================================
// เลือก/ยกเลิกทั้งหมด (กลุ่มเป้าหมาย)
// ==========================================
function toggleAllDepartments() {
    const container = document.getElementById('target_departments_container');
    if (!container) return;

    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

// ==========================================
// Render หัวข้อย่อย (แก้ไขให้ครบถ้วน)
// ==========================================
function renderSubItems() {
    const container = document.getElementById('sub_items_container');
    if (!container) return;

    // ✅ เก็บค่าที่เลือกไว้
    const checkedValues = [];
    container.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
        checkedValues.push({
            element: cb.dataset.element,
            value: cb.dataset.value,
            part: cb.dataset.part || ''
        });
    });

    let html = '';

    // ==========================================
    // ✅ องค์ประกอบที่ 1: ประสิทธิภาพและประสิทธิผล
    // ==========================================
    html += `
        <div class="element-section mb-4">
            <div class="element-section-title">
                <i class="fa-solid fa-list text-blue-500"></i>
                องค์ประกอบที่ 1: การประเมินประสิทธิภาพและประสิทธิผล (80 คะแนน)
                <button type="button" onclick="toggleAllSubItems('element1')" class="select-all-btn text-xs">
                    <i class="fa-solid fa-check-double mr-1"></i>เลือกทั้งหมด
                </button>
            </div>
            
            <!-- ตอนที่ 1 -->
            <div class="mb-3">
                <div class="text-xs font-bold text-blue-600 mb-2">ตอนที่ 1 : ระดับความสำเร็จในการพัฒนางานตามมาตรฐานตำแหน่ง (60 คะแนน)</div>
                
                <!-- 1. ด้านการจัดการเรียนรู้ -->
                <div class="text-xs font-semibold text-gray-600 mt-2 mb-1">1. ด้านการจัดการเรียนรู้</div>
                <div class="sub-items-grid" id="element1_part1_1">
                    ${EVAL_SUB_ITEMS.element1.part1.map(item => `
                        <label class="sub-item-label">
                            <input type="checkbox" data-element="1" data-part="1" data-value="${item.id}"
                                ${checkedValues.some(c => c.element === '1' && c.value === item.id && c.part === '1') ? 'checked' : ''}>
                            <span>${item.label}</span>
                        </label>
                    `).join('')}
                </div>
                
                <!-- 2. ด้านการส่งเสริมและสนับสนุนการจัดการเรียนรู้ -->
                <div class="text-xs font-semibold text-gray-600 mt-3 mb-1">2. ด้านการส่งเสริมและสนับสนุนการจัดการเรียนรู้</div>
                <div class="sub-items-grid" id="element1_part1_2">
                    ${EVAL_SUB_ITEMS.element1.part1_2.map(item => `
                        <label class="sub-item-label">
                            <input type="checkbox" data-element="1" data-part="1" data-value="${item.id}"
                                ${checkedValues.some(c => c.element === '1' && c.value === item.id && c.part === '1') ? 'checked' : ''}>
                            <span>${item.label}</span>
                        </label>
                    `).join('')}
                </div>
                
                <!-- 3. ด้านการพัฒนาตนเอง และวิชาชีพ -->
                <div class="text-xs font-semibold text-gray-600 mt-3 mb-1">3. ด้านการพัฒนาตนเอง และวิชาชีพ</div>
                <div class="sub-items-grid" id="element1_part1_3">
                    ${EVAL_SUB_ITEMS.element1.part1_3.map(item => `
                        <label class="sub-item-label">
                            <input type="checkbox" data-element="1" data-part="1" data-value="${item.id}"
                                ${checkedValues.some(c => c.element === '1' && c.value === item.id && c.part === '1') ? 'checked' : ''}>
                            <span>${item.label}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
            
            <!-- ตอนที่ 2 -->
            <div class="mt-3">
                <div class="text-xs font-bold text-blue-600 mb-2">ตอนที่ 2 : ระดับความสำเร็จในการพัฒนางานที่เสนอเป็นประเด็นท้าทาย (20 คะแนน)</div>
                <div class="sub-items-grid" id="element1_part2">
                    ${EVAL_SUB_ITEMS.element1.part2.map(item => `
                        <label class="sub-item-label">
                            <input type="checkbox" data-element="1" data-part="2" data-value="${item.id}"
                                ${checkedValues.some(c => c.element === '1' && c.value === item.id && c.part === '2') ? 'checked' : ''}>
                            <span>${item.label}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        </div>
    `;

    // ==========================================
    // ✅ องค์ประกอบที่ 2
    // ==========================================
    html += `
        <div class="element-section mb-4">
            <div class="element-section-title">
                <i class="fa-solid fa-handshake text-emerald-500"></i>
                องค์ประกอบที่ 2: การมีส่วนร่วมในการพัฒนาการศึกษา (10 คะแนน)
                <button type="button" onclick="toggleAllSubItems('element2')" class="select-all-btn text-xs">
                    <i class="fa-solid fa-check-double mr-1"></i>เลือกทั้งหมด
                </button>
            </div>
            <div class="text-xs text-gray-500 mb-2">ความสำเร็จของงานที่ได้รับมอบหมายจากผู้บังคับบัญชา (ระดับ 1-5 คูณ 2)</div>
            <div class="sub-items-grid">
                ${EVAL_SUB_ITEMS.element2.map(item => `
                    <label class="sub-item-label">
                        <input type="checkbox" data-element="2" data-value="${item.id}"
                            ${checkedValues.some(c => c.element === '2' && c.value === item.id) ? 'checked' : ''}>
                        <span>${item.label}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    // ==========================================
    // ✅ องค์ประกอบที่ 3
    // ==========================================
    html += `
        <div class="element-section">
            <div class="element-section-title">
                <i class="fa-solid fa-scale-balanced text-purple-500"></i>
                องค์ประกอบที่ 3: วินัย คุณธรรม จริยธรรม (10 คะแนน)
                <button type="button" onclick="toggleAllSubItems('element3')" class="select-all-btn text-xs">
                    <i class="fa-solid fa-check-double mr-1"></i>เลือกทั้งหมด
                </button>
            </div>
            <div class="text-xs text-gray-500 mb-2">ข้อ 1-10 ระดับคะแนนข้อละ 1-4 (เต็ม 40 คะแนน คิดเป็น 10 คะแนน)</div>
            <div class="sub-items-grid">
                ${EVAL_SUB_ITEMS.element3.map(item => `
                    <label class="sub-item-label">
                        <input type="checkbox" data-element="3" data-value="${item.id}"
                            ${checkedValues.some(c => c.element === '3' && c.value === item.id) ? 'checked' : ''}>
                        <span>${item.label}</span>
                    </label>
                `).join('')}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// ==========================================
// เลือก/ยกเลิกทั้งหมด
// ==========================================
function toggleAllSubItems(element) {
    let selector = '';
    if (element === 'element1') {
        selector = '#sub_items_container input[data-element="1"]';
    } else if (element === 'element2') {
        selector = '#sub_items_container input[data-element="2"]';
    } else if (element === 'element3') {
        selector = '#sub_items_container input[data-element="3"]';
    }

    const checkboxes = document.querySelectorAll(selector);
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

// ==========================================
// เปลี่ยนประเภทชุด (แสดง/ซ่อน Parent Group)
// ==========================================
document.addEventListener('change', function(e) {
    if (e.target.id === 'group_type') {
        const container = document.getElementById('parent_group_container');
        if (e.target.value === 'sub') {
            container.style.display = 'block';
            populateParentGroupDropdown();
        } else {
            container.style.display = 'none';
        }
    }
});

// ==========================================
// บันทึกคณะกรรมการ
// ==========================================
document.getElementById('groupForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const id = document.getElementById('group_edit_id').value;
    const eval_round_id = document.getElementById('group_round_id').value;
    const group_name = document.getElementById('group_name').value.trim();
    const group_type = document.getElementById('group_type').value;
    const parent_group_id = document.getElementById('group_parent_id').value;
    const is_active = document.getElementById('group_is_active').checked;

    if (!eval_round_id) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมิน', 'warning');
    }
    if (!group_name) {
        return Swal.fire('แจ้งเตือน', 'กรุณากรอกชื่อชุดคณะกรรมการ', 'warning');
    }
    if (group_type === 'sub' && !parent_group_id) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกชุดหลักสำหรับชุดย่อย', 'warning');
    }

    // ✅ ดึงหัวข้อย่อยที่เลือก
    const selectedSubItems = [];
    document.querySelectorAll('#sub_items_container input[type="checkbox"]:checked').forEach(cb => {
        selectedSubItems.push({
            element: cb.dataset.element,
            value: cb.dataset.value,
            part: cb.dataset.part || ''
        });
    });

    if (selectedSubItems.length === 0) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกหัวข้อย่อยอย่างน้อย 1 รายการ', 'warning');
    }

    // ✅ ดึงสมาชิกที่เลือก
    const membersSelect = document.getElementById('group_members');
    const selectedMembers = Array.from(membersSelect.options)
        .filter(opt => opt.selected)
        .map(opt => opt.value);

    if (selectedMembers.length === 0) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกสมาชิกคณะกรรมการอย่างน้อย 1 คน', 'warning');
    }

    // ✅ ดึงกลุ่มเป้าหมายที่เลือก
    const selectedTargets = [];
    document.querySelectorAll('#target_departments_container input[type="checkbox"]:checked').forEach(cb => {
        selectedTargets.push({
            target_type: 'department',
            target_value: cb.value
        });
    });

    if (selectedTargets.length === 0) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกลุ่มเป้าหมายอย่างน้อย 1 รายการ', 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const payload = {
            eval_round_id,
            group_name,
            group_type,
            parent_group_id: group_type === 'sub' ? parent_group_id : null,
            selected_sub_items: selectedSubItems,
            is_active,
            updated_at: new Date().toISOString()
        };

        let groupResult;
        if (id) {
            const { data, error } = await db
                .from('eval_committee_groups')
                .update(payload)
                .eq('id', id)
                .select();
            if (error) throw error;
            groupResult = data;
        } else {
            const { data, error } = await db
                .from('eval_committee_groups')
                .insert([payload])
                .select();
            if (error) throw error;
            groupResult = data;
        }

        const groupId = groupResult[0].id;

        // ✅ บันทึกสมาชิก
        await db.from('eval_committee_members').delete().eq('committee_group_id', groupId);
        if (selectedMembers.length > 0) {
            const memberPayload = selectedMembers.map(user_id => ({
                committee_group_id: groupId,
                user_id,
                role: 'member',
                is_active: true
            }));
            await db.from('eval_committee_members').insert(memberPayload);
        }

        // ✅ บันทึกกลุ่มเป้าหมาย
        await db.from('eval_committee_targets').delete().eq('committee_group_id', groupId);
        if (selectedTargets.length > 0) {
            const targetPayload = selectedTargets.map(t => ({
                committee_group_id: groupId,
                target_type: t.target_type,
                target_value: t.target_value,
                is_active: true
            }));
            await db.from('eval_committee_targets').insert(targetPayload);
        }

        Swal.close();
        closeGroupModal();
        await loadGroups(document.getElementById('filter_round_for_groups').value);
        await loadGroupsTable();
        await populateRoundDropdowns();

        Swal.fire({
            icon: 'success',
            title: 'บันทึกสำเร็จ!',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error saving group:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
});

// ==========================================
// เปลี่ยนสถานะคณะกรรมการ
// ==========================================
async function toggleGroupStatus(groupId) {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;

    const newStatus = group.is_active !== false ? false : true;
    const action = newStatus ? 'เปิดใช้งาน' : 'ปิดใช้งาน';

    const result = await Swal.fire({
        icon: 'warning',
        title: `ยืนยันการ${action}`,
        text: `คุณต้องการ${action}ชุด "${group.group_name}" ใช่หรือไม่?`,
        showCancelButton: true,
        confirmButtonText: 'ใช่',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        await db.from('eval_committee_groups').update({ is_active: newStatus }).eq('id', groupId);

        Swal.close();
        await loadGroups(document.getElementById('filter_round_for_groups').value);
        await loadGroupsTable();

        Swal.fire({
            icon: 'success',
            title: `✅ ${action}สำเร็จ!`,
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error toggling group:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ลบคณะกรรมการ
// ==========================================
async function deleteGroup(groupId) {
    const group = allGroups.find(g => g.id === groupId);
    if (!group) return;

    const result = await Swal.fire({
        icon: 'error',
        title: 'ยืนยันการลบ',
        text: `คุณต้องการลบชุด "${group.group_name}" ใช่หรือไม่? ข้อมูลที่เกี่ยวข้องจะถูกลบทั้งหมด`,
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        confirmButtonText: 'ใช่, ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        await db.from('eval_committee_groups').delete().eq('id', groupId);

        Swal.close();
        await loadGroups(document.getElementById('filter_round_for_groups').value);
        await loadGroupsTable();

        Swal.fire({
            icon: 'success',
            title: 'ลบสำเร็จ!',
            timer: 1500,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error deleting group:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// TAB 3: ผลการประเมิน
// ==========================================
async function loadResultsTable() {
    const tbody = document.getElementById('tb-results');
    if (!tbody) return;

    if (resultsDataTable) {
        resultsDataTable.destroy();
        resultsDataTable = null;
    }

    const roundId = document.getElementById('filter_round_for_results').value;

    let query = db.from('eval_final_results').select('*, core_personnel(first_name, last_name, academic_standing)');
    if (roundId) {
        query = query.eq('eval_round_id', roundId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading results:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-red-400">
                    <i class="fa-solid fa-circle-exclamation mr-2"></i>โหลดข้อมูลล้มเหลว
                </td>
            </tr>
        `;
        return;
    }

    if (!data || data.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-gray-400">
                    <i class="fa-solid fa-info-circle mr-2"></i>ยังไม่มีผลการประเมิน${roundId ? ' ในรอบนี้' : ''}
                </td>
            </tr>
        `;
        return;
    }

    let html = '';
    data.forEach(result => {
        const user = result.core_personnel;
        const name = user ? `${user.first_name || ''} ${user.last_name || ''}` : '-';
        const standing = user ? user.academic_standing || '-' : '-';
        const score = result.average_score || 0;
        const level = getLevelText(score);
        const status = result.status === 'finalized' 
            ? '<span class="status-badge done">✅ สรุปแล้ว</span>'
            : '<span class="status-badge pending">⏳ รอสรุป</span>';

        html += `
            <tr>
                <td class="font-medium">${name}</td>
                <td>${standing}</td>
                <td class="text-center font-bold text-blue-600">${score.toFixed(2)}</td>
                <td class="text-center">${result.evaluator_count || 0}</td>
                <td class="text-center">${result.committee_group_count || 0}</td>
                <td class="text-center">
                    <span class="px-3 py-1 rounded-full text-xs font-bold ${level.color}">
                        ${level.text}
                    </span>
                </td>
                <td class="text-center">${status}</td>
                <td class="text-center">
                    <button onclick="viewResultDetail('${result.evaluatee_id}', '${result.eval_round_id}')" 
                            class="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">
                        <i class="fa-solid fa-eye mr-1"></i>ดูรายละเอียด
                    </button>
                    <button onclick="recalculateResult('${result.evaluatee_id}', '${result.eval_round_id}')" 
                            class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ml-1">
                        <i class="fa-solid fa-rotate mr-1"></i>คำนวณใหม่
                    </button>
                </td>
            </tr>
        `;
    });

    tbody.innerHTML = html;

// ✅ สร้าง DataTable (ปรับ columnDefs ให้เล็กลง)
setTimeout(() => {
    try {
        if (window.innerWidth >= 768) {
            if ($.fn.DataTable.isDataTable('#groupsTable')) {
                $('#groupsTable').DataTable().destroy();
            }
            groupsDataTable = $('#groupsTable').DataTable({
                scrollX: false,  // ✅ ปิด scroll แนวนอน
                responsive: false, // ✅ ปิด responsive (ใช้ CSS จัดการ)
                autoWidth: false,  // ✅ ปิด auto width
                language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
                pageLength: 10,
                lengthMenu: [[5, 10, 25, -1], [5, 10, 25, 'ทั้งหมด']],
                columnDefs: [
                    { targets: [0], width: '12%' },  // ชื่อชุด
                    { targets: [1], width: '8%' },   // ประเภท
                    { targets: [2], width: '10%' },  // ชุดหลัก
                    { targets: [3], width: '18%' },  // หัวข้อย่อย
                    { targets: [4], width: '18%' },  // สมาชิก
                    { targets: [5], width: '14%' },  // กลุ่มเป้าหมาย
                    { targets: [6], width: '8%' },   // สถานะ
                    { targets: [7], width: '12%', orderable: false } // ดำเนินการ
                ],
                dom: '<"flex flex-wrap justify-between items-center gap-2 mb-2"lf>rt<"flex flex-wrap justify-between items-center gap-2 mt-2"ip>',
                drawCallback: function() {
                    if (window.innerWidth < 768) {
                        $('.dataTables_filter, .dataTables_length').hide();
                    } else {
                        $('.dataTables_filter, .dataTables_length').show();
                    }
                }
            });
        }
    } catch (e) {
        console.warn('DataTable init error:', e);
    }
}, 200);
}

// ==========================================
// ฟังก์ชันแสดงระดับคุณภาพ
// ==========================================
function getLevelText(score) {
    if (score >= 80) return { text: 'ดีมาก', color: 'bg-emerald-100 text-emerald-700' };
    if (score >= 70) return { text: 'ดี', color: 'bg-blue-100 text-blue-700' };
    if (score >= 60) return { text: 'พอใช้', color: 'bg-yellow-100 text-yellow-700' };
    return { text: 'ควรปรับปรุง', color: 'bg-red-100 text-red-700' };
}

// ==========================================
// ดูรายละเอียดผลการประเมิน
// ==========================================
async function viewResultDetail(evaluateeId, evalRoundId) {
    // เปิด modal ในหน้า evaluation.html
    window.open(`evaluation.html?view=${evaluateeId}&round=${evalRoundId}`, '_blank');
}

// ==========================================
// คำนวณผลใหม่
// ==========================================
async function recalculateResult(evaluateeId, evalRoundId) {
    const result = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการคำนวณใหม่',
        text: 'คุณต้องการคำนวณผลการประเมินใหม่ใช่หรือไม่?',
        showCancelButton: true,
        confirmButtonText: 'ใช่, คำนวณใหม่',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    // เรียกใช้ฟังก์ชันจาก evaluation.js
    if (typeof saveFinalScore === 'function') {
        await saveFinalScore(evaluateeId, evalRoundId);
        await loadResultsTable();
    } else {
        Swal.fire('ผิดพลาด', 'ไม่พบฟังก์ชันคำนวณผล กรุณาตรวจสอบการโหลดไฟล์', 'error');
    }
}

// ==========================================
// ส่งออก Excel ทั้งหมด
// ==========================================
async function exportAllResults() {
    const roundId = document.getElementById('filter_round_for_results').value;

    if (!roundId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมินก่อนส่งออก', 'warning');
    }

    try {
        const { data: results, error } = await db
            .from('eval_final_results')
            .select('*, core_personnel(first_name, last_name, academic_standing, department)')
            .eq('eval_round_id', roundId)
            .eq('status', 'finalized');

        if (error) throw error;

        if (!results || results.length === 0) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบข้อมูลที่สรุปผลแล้วในรอบนี้', 'warning');
        }

        const excelData = results.map(r => ({
            'ชื่อ-สกุล': `${r.core_personnel?.first_name || ''} ${r.core_personnel?.last_name || ''}`,
            'กลุ่มสาระ': r.core_personnel?.department || '-',
            'วิทยฐานะ': r.core_personnel?.academic_standing || '-',
            'คะแนนเฉลี่ย': r.average_score?.toFixed(2) || '0.00',
            'จำนวนกรรมการ': r.evaluator_count || 0,
            'จำนวนชุด': r.committee_group_count || 0,
            'ระดับคุณภาพ': getLevelText(r.average_score).text,
            'สถานะ': r.status === 'finalized' ? 'สรุปแล้ว' : 'รอสรุป'
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(excelData);
        XLSX.utils.book_append_sheet(wb, ws, 'ผลสรุปการประเมิน');
        
        const roundName = allRounds.find(r => r.id === roundId)?.round_name || 'รอบประเมิน';
        XLSX.writeFile(wb, `ผลสรุป_${roundName}_${new Date().toLocaleDateString('th-TH')}.xlsx`);

    } catch (err) {
        console.error('Error exporting:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// สรุปผลทั้งหมด
// ==========================================
async function generateAllFinalScores() {
    const roundId = document.getElementById('filter_round_for_results').value;

    if (!roundId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมินก่อนสรุปผล', 'warning');
    }

    if (typeof window.generateAllFinalScores === 'function') {
        await window.generateAllFinalScores(roundId);
        await loadResultsTable();
    } else {
        Swal.fire('ผิดพลาด', 'ไม่พบฟังก์ชันสรุปผล กรุณาตรวจสอบการโหลดไฟล์', 'error');
    }
}

// ==========================================
// Event Listeners
// ==========================================

// ✅ กรองคณะกรรมการตามรอบ
document.getElementById('filter_round_for_groups')?.addEventListener('change', function() {
    loadGroupsTable();
});

// ✅ กรองผลการประเมินตามรอบ
document.getElementById('filter_round_for_results')?.addEventListener('change', function() {
    loadResultsTable();
});

// ✅ เมื่อเลือกรอบใน Modal ให้โหลด Parent Groups
document.getElementById('group_round_id')?.addEventListener('change', function() {
    populateParentGroupDropdown();
});

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
window.openGroupModal = openGroupModal;
window.closeGroupModal = closeGroupModal;
window.editGroup = editGroup;
window.toggleGroupStatus = toggleGroupStatus;
window.deleteGroup = deleteGroup;
window.toggleAllSubItems = toggleAllSubItems;
window.toggleAllDepartments = toggleAllDepartments;  // ✅ เพิ่มบรรทัดนี้
window.viewResultDetail = viewResultDetail;
window.recalculateResult = recalculateResult;
window.exportAllResults = exportAllResults;
window.generateAllFinalScores = generateAllFinalScores;
window.logout = logout;

console.log('✅ evaluation_admin.js loaded successfully');