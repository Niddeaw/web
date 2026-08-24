// ==========================================
// ตัวแปรระบบ
// ==========================================
let currentUser = null;
let currentTermData = null;
let currentEvalRound = null;
let summaryDataTable = null;
let tomSelectInstance = null;
let isEditMode = false;
let editGroupId = null;
let detailDataTable = null;
let currentDetailTeacherId = null;

// ==========================================
// ฟังก์ชันเริ่มต้น
// ==========================================
window.onload = async () => {
    console.log('🚀 Admin Panel เริ่มโหลด...');

    try { await checkAdminAuth(); } catch (e) { console.error('❌ checkAdminAuth:', e); }
    try { await loadDashboard(); } catch (e) { console.error('❌ loadDashboard:', e); }
    try { await loadEvalRounds(); } catch (e) { console.error('❌ loadEvalRounds:', e); }
    try { await loadCommitteeGroups(); } catch (e) { console.error('❌ loadCommitteeGroups:', e); }
    try { await loadSummary(); } catch (e) { console.error('❌ loadSummary:', e); }
    try { await loadAdminList(); } catch (e) { console.error('❌ loadAdminList:', e); }
    try { await loadUsersForAdmin(); } catch (e) { console.error('❌ loadUsersForAdmin:', e); }
    try { await loadGASConfig(); } catch (e) { console.error('❌ loadGASConfig:', e); }

    // ตั้งค่า Tom Select
    await initTomSelect();

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', function (e) {
            e.preventDefault();
            console.log('📑 เปลี่ยน Tab:', this.dataset.tab);

            document.querySelectorAll('.tab-btn').forEach(b => {
                b.classList.remove('active', 'bg-purple-600', 'text-white');
                b.classList.add('bg-gray-200', 'text-gray-600');
            });

            this.classList.add('active', 'bg-purple-600', 'text-white');
            this.classList.remove('bg-gray-200', 'text-gray-600');

            document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');

            const targetTab = document.getElementById(this.dataset.tab);
            if (targetTab) {
                targetTab.style.display = 'block';
            }
        });
    });

    // Committee form submit
    const committeeForm = document.getElementById('committeeForm');
    if (committeeForm) {
        committeeForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await saveCommitteeGroup();
        });
    }

    // Eval round form submit
    const evalRoundForm = document.getElementById('evalRoundForm');
    if (evalRoundForm) {
        evalRoundForm.addEventListener('submit', async function (e) {
            e.preventDefault();
            await saveEvalRound();
        });
    }

    // Department select all
    document.getElementById('dept_select_all')?.addEventListener('click', function () {
        document.querySelectorAll('.dept-checkbox').forEach(cb => cb.checked = true);
        this.classList.add('active');
        document.getElementById('dept_deselect_all').classList.remove('active');
        document.getElementById('dept_select_science').classList.remove('active');
        document.getElementById('dept_select_language').classList.remove('active');
    });

    document.getElementById('dept_deselect_all')?.addEventListener('click', function () {
        document.querySelectorAll('.dept-checkbox').forEach(cb => cb.checked = false);
        this.classList.add('active');
        document.getElementById('dept_select_all').classList.remove('active');
        document.getElementById('dept_select_science').classList.remove('active');
        document.getElementById('dept_select_language').classList.remove('active');
    });

    // เลือกกลุ่มวิทยาศาสตร์
    document.getElementById('dept_select_science')?.addEventListener('click', function () {
        const scienceDepts = [
            'คณิตศาสตร์',
            'วิทยาศาสตร์และเทคโนโลยี (วิทยาศาสตร์)',
            'วิทยาศาสตร์และเทคโนโลยี (เทคโนโลยี)'
        ];
        document.querySelectorAll('.dept-checkbox').forEach(cb => {
            cb.checked = scienceDepts.includes(cb.value);
        });
        this.classList.add('active');
        document.getElementById('dept_select_all').classList.remove('active');
        document.getElementById('dept_deselect_all').classList.remove('active');
        document.getElementById('dept_select_language').classList.remove('active');
    });

    // เลือกกลุ่มภาษา
    document.getElementById('dept_select_language')?.addEventListener('click', function () {
        const languageDepts = [
            'ภาษาไทย',
            'ภาษาต่างประเทศ (ภาษาอังกฤษ)',
            'ภาษาต่างประเทศ (ภาษาจีน)'
        ];
        document.querySelectorAll('.dept-checkbox').forEach(cb => {
            cb.checked = languageDepts.includes(cb.value);
        });
        this.classList.add('active');
        document.getElementById('dept_select_all').classList.remove('active');
        document.getElementById('dept_deselect_all').classList.remove('active');
        document.getElementById('dept_select_science').classList.remove('active');
    });

    // Select all buttons for elements
    document.querySelectorAll('.select-all-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const element = this.dataset.element;
            const part = this.dataset.part;
            let checkboxes;

            if (part) {
                checkboxes = document.querySelectorAll(`.sub-item[data-element="${element}"][data-part="${part}"]`);
            } else {
                checkboxes = document.querySelectorAll(`.sub-item[data-element="${element}"]`);
            }

            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            checkboxes.forEach(cb => cb.checked = !allChecked);
            this.classList.toggle('active');
        });
    });

    // อัปเดตสถานะปุ่มเลือกกลุ่มสาระเมื่อ checkbox เปลี่ยน
    document.querySelectorAll('.dept-checkbox').forEach(cb => {
        cb.addEventListener('change', updateDeptButtons);
    });

    console.log('✅ Admin Panel โหลดเสร็จสมบูรณ์');
};

// ==========================================
// อัปเดตสถานะปุ่มเลือกกลุ่มสาระ
// ==========================================
function updateDeptButtons() {
    const checkboxes = document.querySelectorAll('.dept-checkbox');
    const checked = document.querySelectorAll('.dept-checkbox:checked');
    const allChecked = checkboxes.length === checked.length;

    const selectAllBtn = document.getElementById('dept_select_all');
    if (selectAllBtn) {
        selectAllBtn.classList.toggle('active', allChecked);
    }

    const deselectAllBtn = document.getElementById('dept_deselect_all');
    if (deselectAllBtn) {
        deselectAllBtn.classList.toggle('active', checked.length === 0);
    }
}

// ==========================================
// ตรวจสอบสิทธิ์ Admin
// ==========================================
async function checkAdminAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) return window.location.replace('index.html');

    const { data: profile } = await db.from('core_personnel').select('*').eq('id', session.user.id).single();
    currentUser = profile;
    console.log('👤 ผู้ใช้:', currentUser.first_name, currentUser.last_name, '(', currentUser.role, ')');

    if (!['admin', 'super_admin'].includes(currentUser.role)) {
        await Swal.fire({
            icon: 'error',
            title: 'ไม่มีสิทธิ์เข้าถึง',
            text: 'เฉพาะ Admin เท่านั้นที่สามารถเข้าถึงหน้านี้ได้',
            confirmButtonText: 'ตกลง'
        });
        window.location.replace('evaluation.html');
    }

    const { data: schoolInfo } = await db.from('core_school_info').select('*').single();
    currentTermData = schoolInfo;
}

// ==========================================
// ตั้งค่า Tom Select
// ==========================================
async function initTomSelect() {
    try {
        // ✅ แก้ไข: เพิ่ม super_admin และ admin เข้าไป
        const { data, error } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, role, academic_standing')
            .in('role', ['teacher', 'deputy', 'director', 'super_admin', 'admin']);

        if (error) throw error;

        const select = document.getElementById('admin_committee');
        if (!select) return;

        // สร้าง options
        const options = (data || []).map(p => {
            const roleMap = {
                'teacher': 'ครู',
                'deputy': 'รองผู้อำนวยการ',
                'director': 'ผู้อำนวยการ',
                'super_admin': 'Super Admin',
                'admin': 'Admin'
            };
            const roleThai = roleMap[p.role] || p.role;
            const standing = p.academic_standing ? ` (${p.academic_standing})` : '';
            const prefix = p.prefix || '';
            const label = `${prefix}${p.first_name} ${p.last_name} - ${roleThai}${standing}`;
            return { value: p.id, text: label };
        });

        // Tom Select
        tomSelectInstance = new TomSelect(select, {
            plugins: ['remove_button', 'dropdown_input'],
            maxItems: null,
            placeholder: 'ค้นหาและเลือกกรรมการ...',
            options: options,
            create: false,
            render: {
                option: function (data, escape) {
                    return `<div class="py-1 px-2 hover:bg-purple-50 cursor-pointer">${escape(data.text)}</div>`;
                }
            },
            onItemAdd: function () {
                updateSelectedDisplay();
            },
            onItemRemove: function () {
                updateSelectedDisplay();
            }
        });

        // เพิ่มปุ่มเลือกทั้งหมด
        const wrapper = select.closest('.ts-wrapper');
        if (wrapper) {
            const btnContainer = document.createElement('div');
            btnContainer.className = 'flex gap-2 mt-1 flex-wrap';

            const selectAllBtn = document.createElement('button');
            selectAllBtn.type = 'button';
            selectAllBtn.className = 'text-xs text-purple-600 hover:text-purple-800 font-medium';
            selectAllBtn.innerHTML = 'เลือกกรรมการทั้งหมด';
            selectAllBtn.onclick = function (e) {
                e.preventDefault();
                const allOptions = tomSelectInstance.options;
                const values = Object.keys(allOptions);
                tomSelectInstance.setValue(values);
                updateSelectedDisplay();
            };
            btnContainer.appendChild(selectAllBtn);

            const clearBtn = document.createElement('button');
            clearBtn.type = 'button';
            clearBtn.className = 'text-xs text-red-500 hover:text-red-700 font-medium ml-2';
            clearBtn.innerHTML = 'ล้างทั้งหมด';
            clearBtn.onclick = function (e) {
                e.preventDefault();
                tomSelectInstance.clear();
                updateSelectedDisplay();
            };
            btnContainer.appendChild(clearBtn);

            wrapper.parentNode.insertBefore(btnContainer, wrapper.nextSibling);
        }

        updateSelectedDisplay();

    } catch (err) {
        console.error('Error initializing Tom Select:', err);
    }
}

function updateSelectedDisplay() {
    const display = document.getElementById('selected_committee_display');
    if (!display || !tomSelectInstance) return;

    const values = tomSelectInstance.getValue();
    if (!values || values.length === 0) {
        display.innerHTML = '<span class="text-sm text-gray-400">ยังไม่ได้เลือกกรรมการ</span>';
        return;
    }

    const selectedTexts = values.map(v => {
        const opt = tomSelectInstance.options[v];
        return opt ? opt.text : v;
    });

    display.innerHTML = selectedTexts.map(text =>
        `<span class="pill">${text}</span>`
    ).join('');
}

// ==========================================
// Tab 1: Dashboard
// ==========================================
async function loadDashboard() {
    try {
        console.log('📊 กำลังโหลด Dashboard...');

        const { data: allPersonnel, error } = await db
            .from('core_personnel')
            .select('*');

        if (error) throw error;

        // ✅ แก้ไข: รวม role ที่มีสิทธิ์เป็นครู
        const teacherRoles = ['teacher', 'admin', 'super_admin', 'deputy', 'director'];
        const validStandings = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'];

        const teacherList = (allPersonnel || []).filter(p => {
            const isTeacher = teacherRoles.includes(p.role);
            const hasValidStanding = p.academic_standing && validStandings.includes(p.academic_standing.trim());
            return isTeacher && hasValidStanding;
        });

        console.log('👨‍🏫 ข้าราชการครูทั้งหมด:', teacherList.length, 'คน');

        const total = teacherList.length;
        const assistant = teacherList.filter(t => t.academic_standing.trim() === 'ครูผู้ช่วย').length;
        const teacher = teacherList.filter(t => t.academic_standing.trim() === 'ครู').length;
        const specialist = teacherList.filter(t => t.academic_standing.trim() === 'ครูชำนาญการ').length;
        const expert = teacherList.filter(t => t.academic_standing.trim() === 'ครูชำนาญการพิเศษ').length;

        document.getElementById('stat_total').innerText = total;
        document.getElementById('stat_assistant').innerText = assistant;
        document.getElementById('stat_teacher').innerText = teacher;
        document.getElementById('stat_specialist').innerText = specialist;
        document.getElementById('stat_expert').innerText = expert;

        const teacherIds = teacherList.map(t => t.id);
        let evalResults = [];

        if (teacherIds.length > 0) {
            const { data: evalData, error: evalError } = await db
                .from('eval_results')
                .select('evaluatee_id, status, total_score, eval_type')
                .in('evaluatee_id', teacherIds)
                .eq('eval_type', 'self');

            if (!evalError) {
                evalResults = evalData || [];
            }
        }

        const evaluated = new Set();
        const approved = new Set();

        evalResults.forEach(r => {
            evaluated.add(r.evaluatee_id);
            if (r.status === 'approved') approved.add(r.evaluatee_id);
        });

        document.getElementById('evalStatusSummary').innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="bg-yellow-50 p-4 rounded-xl text-center border border-yellow-200">
                    <p class="text-3xl font-bold text-yellow-600">${evaluated.size}</p>
                    <p class="text-sm text-gray-500">ประเมินตนเองแล้ว</p>
                </div>
                <div class="bg-green-50 p-4 rounded-xl text-center border border-green-200">
                    <p class="text-3xl font-bold text-green-600">${approved.size}</p>
                    <p class="text-sm text-gray-500">ผ่านการอนุมัติ</p>
                </div>
                <div class="bg-red-50 p-4 rounded-xl text-center border border-red-200">
                    <p class="text-3xl font-bold text-red-600">${total - evaluated.size}</p>
                    <p class="text-sm text-gray-500">ยังไม่ประเมิน</p>
                </div>
                <div class="bg-blue-50 p-4 rounded-xl text-center border border-blue-200">
                    <p class="text-3xl font-bold text-blue-600">${total}</p>
                    <p class="text-sm text-gray-500">รวมครูทั้งหมด</p>
                </div>
            </div>
        `;

    } catch (err) {
        console.error('❌ Error loading dashboard:', err);
    }
}

// ==========================================
// Tab 2: จัดการกรรมการ
// ==========================================

// ดึงข้อมูลรอบการประเมิน
async function loadEvalRounds() {
    try {
        const { data, error } = await db
            .from('eval_rounds')
            .select('*')
            .order('fiscal_year', { ascending: false })
            .order('round_number', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('admin_eval_round');
        if (!select) return;

        select.innerHTML = '<option value="">-- เลือกรอบ --</option>';
        data?.forEach(round => {
            const active = round.is_active ? ' ✅ Active' : '';
            select.innerHTML += `
                <option value="${round.id}" ${round.is_active ? 'selected' : ''}>
                    ${round.round_name}${active}
                </option>
            `;
        });

        await loadAllEvalRounds();
        await loadActiveRound();
    } catch (err) {
        console.error('Error loading eval rounds:', err);
    }
}

// บันทึก/อัปเดตชุดคณะกรรมการ
async function saveCommitteeGroup() {
    const evalRoundId = document.getElementById('admin_eval_round').value;
    const groupName = document.getElementById('committee_group_name').value.trim();
    const evaluatorIds = tomSelectInstance ? tomSelectInstance.getValue() : [];

    // ดึง department ที่เลือก
    const deptCheckboxes = document.querySelectorAll('.dept-checkbox:checked');
    const departments = Array.from(deptCheckboxes).map(cb => cb.value);

    // ดึง sub-items ที่เลือก
    const selectedSubItems = [];
    document.querySelectorAll('.sub-item:checked').forEach(cb => {
        selectedSubItems.push({
            element: cb.dataset.element,
            part: cb.dataset.part || null,
            value: cb.value
        });
    });

    // Validation
    if (!evalRoundId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมิน', 'warning');
    }
    if (!groupName) {
        return Swal.fire('แจ้งเตือน', 'กรุณากรอกชื่อชุดคณะกรรมการ', 'warning');
    }
    if (!evaluatorIds || evaluatorIds.length === 0) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกรรมการอย่างน้อย 1 คน', 'warning');
    }
    if (departments.length === 0) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกกลุ่มสาระที่ถูกประเมินอย่างน้อย 1 กลุ่ม', 'warning');
    }

    // ✅ แทนที่ด้วย:
    const element1Items = selectedSubItems.filter(s => s.element === '1');
    const element2Items = selectedSubItems.filter(s => s.element === '2');
    const element3Items = selectedSubItems.filter(s => s.element === '3');

    // ✅ ตรวจสอบว่ามีการเลือกอย่างน้อย 1 องค์ประกอบ
    if (element1Items.length === 0 && element2Items.length === 0 && element3Items.length === 0) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกหัวข้อย่อยอย่างน้อย 1 รายการจากองค์ประกอบใดก็ได้', 'warning');
    }

    const isEdit = isEditMode;
    Swal.fire({
        title: isEdit ? 'กำลังอัปเดต...' : 'กำลังบันทึก...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
    });

    try {
        const groupData = {
            eval_round_id: evalRoundId,
            group_name: groupName,
            evaluator_ids: evaluatorIds,
            target_departments: departments,
            selected_sub_items: selectedSubItems,
            updated_at: new Date().toISOString()
        };

        let result;
        if (isEdit && editGroupId) {
            // ✅ อัปเดต
            result = await db
                .from('eval_committee_groups')
                .update(groupData)
                .eq('id', editGroupId);
        } else {
            // ✅ สร้างใหม่
            groupData.created_by = currentUser.id;
            groupData.created_at = new Date().toISOString();
            groupData.is_active = true;
            result = await db.from('eval_committee_groups').insert([groupData]);
        }

        if (result.error) throw result.error;

        // ✅ รีเซ็ตฟอร์ม
        resetCommitteeForm();

        Swal.fire(
            isEdit ? 'อัปเดตสำเร็จ' : 'สำเร็จ',
            isEdit ? `อัปเดตชุดคณะกรรมการ "${groupName}" เรียบร้อย` : `บันทึกชุดคณะกรรมการ "${groupName}" เรียบร้อย`,
            'success'
        );

        await loadCommitteeGroups();

    } catch (err) {
        console.error('Error saving committee group:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// โหลดชุดคณะกรรมการทั้งหมด
async function loadCommitteeGroups() {
    try {
        const { data, error } = await db
            .from('eval_committee_groups')
            .select('*')
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const container = document.getElementById('committeeList');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-400">ยังไม่มีชุดคณะกรรมการ</p>';
            return;
        }

        // ดึงข้อมูลรอบการประเมิน
        const roundIds = [...new Set(data.map(g => g.eval_round_id))];
        const { data: roundData } = await db
            .from('eval_rounds')
            .select('id, round_name')
            .in('id', roundIds);

        const roundMap = {};
        roundData?.forEach(r => { roundMap[r.id] = r; });

        // ดึงข้อมูลบุคลากร
        const allEvaluatorIds = [];
        data.forEach(g => {
            if (g.evaluator_ids) {
                allEvaluatorIds.push(...g.evaluator_ids);
            }
        });
        const uniqueIds = [...new Set(allEvaluatorIds)];

        const { data: personnelData } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, role')
            .in('id', uniqueIds);

        const personnelMap = {};
        personnelData?.forEach(p => {
            const roleMap = { 'teacher': 'ครู', 'deputy': 'รองผอ.', 'director': 'ผอ.' };
            const prefix = p.prefix || '';
            personnelMap[p.id] = `${prefix}${p.first_name} ${p.last_name} (${roleMap[p.role] || p.role})`;
        });

        let html = '';
        data.forEach(group => {
            const round = roundMap[group.eval_round_id];
            const evaluatorNames = (group.evaluator_ids || [])
                .map(id => personnelMap[id] || id)
                .join(', ');

            const depts = (group.target_departments || []).join(', ');

            // แสดงหัวข้อย่อยแบบจัดกลุ่มตามองค์ประกอบ
            const subItems = (group.selected_sub_items || []);
            const element1Items = subItems.filter(s => s.element === '1').map(s => s.value).join(', ');
            const element2Items = subItems.filter(s => s.element === '2').map(s => s.value).join(', ');
            const element3Items = subItems.filter(s => s.element === '3').map(s => s.value).join(', ');

            const displaySubItems = [];
            if (element1Items) displaySubItems.push(`องค์ประกอบที่ 1: ${element1Items}`);
            if (element2Items) displaySubItems.push(`องค์ประกอบที่ 2: ${element2Items}`);
            if (element3Items) displaySubItems.push(`องค์ประกอบที่ 3: ${element3Items}`);
            const subItemsDisplay = displaySubItems.join(' | ');

            html += `
                <div class="committee-group-card border border-gray-200 rounded-xl p-4 mb-3 bg-white hover:shadow-md transition-shadow">
                    <div class="flex flex-wrap justify-between items-start gap-2">
                        <div class="flex-1 min-w-[200px]">
                            <div class="flex items-center gap-2 flex-wrap">
                                <span class="font-bold text-purple-700">📋 ${group.group_name}</span>
                                <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">${round?.round_name || '-'}</span>
                                <span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">${group.evaluator_ids?.length || 0} คน</span>
                            </div>
                            <div class="text-sm text-gray-600 mt-1">
                                <span class="font-medium">กรรมการ:</span> ${evaluatorNames}
                            </div>
                            <div class="text-sm text-gray-600">
                                <span class="font-medium">กลุ่มสาระ:</span> ${depts}
                            </div>
                            <div class="text-xs text-gray-500 mt-1 leading-relaxed">
                                <span class="font-medium">หัวข้อย่อย:</span><br>
                                ${subItemsDisplay || '-'}
                            </div>
                        </div>
                        <div class="flex gap-2 flex-shrink-0">
                            <button onclick="editCommitteeGroup('${group.id}')" 
                                    class="text-blue-400 hover:text-blue-600 text-sm px-3 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                                <i class="fa-solid fa-pen"></i> แก้ไข
                            </button>
                            <button onclick="deleteCommitteeGroup('${group.id}')" 
                                    class="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">
                                <i class="fa-solid fa-trash-can"></i> ลบ
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;

    } catch (err) {
        console.error('Error loading committee groups:', err);
        const container = document.getElementById('committeeList');
        if (container) {
            container.innerHTML = '<p class="text-red-500">โหลดข้อมูลล้มเหลว</p>';
        }
    }
}

// ✅ แก้ไขชุดคณะกรรมการ
async function editCommitteeGroup(groupId) {
    try {
        // ดึงข้อมูลชุดคณะกรรมการ
        const { data: group, error } = await db
            .from('eval_committee_groups')
            .select('*')
            .eq('id', groupId)
            .single();

        if (error) throw error;

        // ตั้งค่าโหมดแก้ไข
        isEditMode = true;
        editGroupId = groupId;

        // แสดง indicator
        document.getElementById('editModeIndicator').style.display = 'flex';
        document.getElementById('editGroupNameDisplay').innerText = `กำลังแก้ไข: ${group.group_name}`;

        // เปลี่ยนปุ่ม Submit
        const submitBtn = document.getElementById('committeeSubmitBtn');
        submitBtn.innerHTML = '<i class="fa-solid fa-pen mr-1"></i> อัปเดตชุดคณะกรรมการ';
        submitBtn.className = 'bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-colors';

        // เติมข้อมูลลงในฟอร์ม
        document.getElementById('admin_eval_round').value = group.eval_round_id;
        document.getElementById('committee_group_name').value = group.group_name;

        // ✅ เติมกรรมการที่เลือก (Tom Select)
        if (tomSelectInstance && group.evaluator_ids) {
            tomSelectInstance.setValue(group.evaluator_ids);
            updateSelectedDisplay();
        }

        // ✅ เติมกลุ่มสาระที่เลือก
        const deptCheckboxes = document.querySelectorAll('.dept-checkbox');
        deptCheckboxes.forEach(cb => {
            cb.checked = group.target_departments?.includes(cb.value) || false;
        });
        updateDeptButtons();

        // ✅ เติมหัวข้อย่อยที่เลือก
        document.querySelectorAll('.sub-item').forEach(cb => {
            const isSelected = group.selected_sub_items?.some(
                s => s.element === cb.dataset.element &&
                    s.part === (cb.dataset.part || null) &&
                    s.value === cb.value
            );
            cb.checked = isSelected || false;
        });

        // อัปเดตปุ่ม select-all
        document.querySelectorAll('.select-all-btn').forEach(btn => {
            const element = btn.dataset.element;
            const part = btn.dataset.part;
            let checkboxes;
            if (part) {
                checkboxes = document.querySelectorAll(`.sub-item[data-element="${element}"][data-part="${part}"]`);
            } else {
                checkboxes = document.querySelectorAll(`.sub-item[data-element="${element}"]`);
            }
            const allChecked = Array.from(checkboxes).every(cb => cb.checked);
            btn.classList.toggle('active', allChecked);
        });

        // เลื่อนไปที่ฟอร์ม
        document.getElementById('committeeForm').scrollIntoView({ behavior: 'smooth' });

        Swal.fire('📝 พร้อมแก้ไข', 'คุณสามารถแก้ไขข้อมูลและกดอัปเดตได้', 'info');

    } catch (err) {
        console.error('Error loading committee group for edit:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ✅ ยกเลิกการแก้ไข
function cancelEdit() {
    resetCommitteeForm();
    Swal.fire('ยกเลิก', 'ยกเลิกการแก้ไขเรียบร้อย', 'info');
}

// ✅ รีเซ็ตฟอร์ม
function resetCommitteeForm() {
    document.getElementById('committee_group_name').value = '';
    if (tomSelectInstance) tomSelectInstance.clear();
    document.querySelectorAll('.dept-checkbox').forEach(cb => cb.checked = false);
    // ✅ แทนที่ด้วย:
    document.querySelectorAll('.sub-item').forEach(cb => {
        cb.checked = false;  // ✅ ยกเลิกทั้งหมด
    });
    updateSelectedDisplay();
    updateDeptButtons();

    // อัปเดตปุ่ม select-all
    document.querySelectorAll('.select-all-btn').forEach(btn => {
        const element = btn.dataset.element;
        const part = btn.dataset.part;
        let checkboxes;
        if (part) {
            checkboxes = document.querySelectorAll(`.sub-item[data-element="${element}"][data-part="${part}"]`);
        } else {
            checkboxes = document.querySelectorAll(`.sub-item[data-element="${element}"]`);
        }
        const allChecked = Array.from(checkboxes).every(cb => cb.checked);
        btn.classList.toggle('active', allChecked);
    });

    // รีเซ็ตปุ่ม
    const submitBtn = document.getElementById('committeeSubmitBtn');
    submitBtn.innerHTML = '<i class="fa-solid fa-save mr-1"></i> บันทึกชุดคณะกรรมการ';
    submitBtn.className = 'bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-colors';

    // ซ่อน indicator
    document.getElementById('editModeIndicator').style.display = 'none';
    document.getElementById('editGroupNameDisplay').innerText = '';

    isEditMode = false;
    editGroupId = null;
}

// ✅ ลบชุดคณะกรรมการ
async function deleteCommitteeGroup(groupId) {
    // ดึงชื่อกลุ่ม
    const { data: group } = await db
        .from('eval_committee_groups')
        .select('group_name')
        .eq('id', groupId)
        .single();

    const result = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันการลบ',
        html: `
            <p>คุณต้องการลบชุดคณะกรรมการ <b>${group?.group_name || 'นี้'}</b> หรือไม่?</p>
            <p class="text-sm text-red-500 mt-2">⚠️ ข้อมูลนี้จะถูกลบอย่างถาวร</p>
        `,
        showCancelButton: true,
        confirmButtonText: '🗑️ ลบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#d33'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { error } = await db
            .from('eval_committee_groups')
            .update({ is_active: false })
            .eq('id', groupId);

        if (error) throw error;

        Swal.fire('สำเร็จ', 'ลบชุดคณะกรรมการเรียบร้อย', 'success');
        await loadCommitteeGroups();
    } catch (err) {
        console.error('Error deleting committee group:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// Tab 3: สรุปผล
// ==========================================
async function loadSummary() {
    try {
        console.log('📋 กำลังโหลดสรุปผล...');

        // ✅ แก้ไข: รวม role ที่มีสิทธิ์เป็นครู
        const { data: teachers, error: tErr } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, academic_standing, department, role')
            .in('role', ['teacher', 'admin', 'super_admin', 'deputy', 'director']);

        if (tErr) throw tErr;

        const validStandings = ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ'];
        const allTeachers = (teachers || []).filter(t =>
            t.academic_standing && validStandings.includes(t.academic_standing.trim())
        );

        if (allTeachers.length === 0) {
            document.getElementById('summaryBody').innerHTML =
                '<tr><td colspan="7" class="text-center py-8 text-gray-400">ไม่พบข้อมูลครู</td></tr>';
            return;
        }

        const teacherIds = allTeachers.map(t => t.id);

        const [{ data: selfData }, { data: committeeData }] = await Promise.all([
            db.from('eval_results')
                .select('evaluatee_id, total_score, status, created_at')
                .in('evaluatee_id', teacherIds)
                .eq('eval_type', 'self')
                .order('created_at', { ascending: false }),
            db.from('eval_results')
                .select('evaluatee_id, total_score, status, created_at')
                .in('evaluatee_id', teacherIds)
                .eq('eval_type', 'committee')
                .order('created_at', { ascending: false })
        ]);

        const latestSelf = {};
        (selfData || []).forEach(r => {
            if (!latestSelf[r.evaluatee_id]) latestSelf[r.evaluatee_id] = r;
        });
        const latestCommittee = {};
        (committeeData || []).forEach(r => {
            if (!latestCommittee[r.evaluatee_id]) latestCommittee[r.evaluatee_id] = r;
        });

        // ลำดับกลุ่มสาระตามที่กำหนด
        const deptOrder = [
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

        allTeachers.sort((a, b) => {
            const ai = deptOrder.indexOf(a.department) !== -1 ? deptOrder.indexOf(a.department) : 99;
            const bi = deptOrder.indexOf(b.department) !== -1 ? deptOrder.indexOf(b.department) : 99;
            return ai !== bi ? ai - bi : (a.first_name || '').localeCompare(b.first_name || '', 'th');
        });

        let html = '';
        allTeachers.forEach(teacher => {
            const self = latestSelf[teacher.id];
            const committee = latestCommittee[teacher.id];
            const selfScore = self?.total_score || 0;
            const committeeScore = committee?.total_score || 0;
            // ✅ แทนที่ด้วย (ใช้ค่าเฉลี่ยถ่วงน้ำหนัก):
            const total = (selfScore + committeeScore) / 2;

            // หรือใช้แบบเฉลี่ยเฉพาะที่มีค่า:
            // let total = 0;
            // let count = 0;
            // if (selfScore > 0) { total += selfScore; count++; }
            // if (committeeScore > 0) { total += committeeScore; count++; }
            // const finalTotal = count > 0 ? total / count : 0;

            let grade = '-', gradeColor = 'bg-gray-100 text-gray-500';
            if (total >= 80) { grade = 'ดีมาก'; gradeColor = 'bg-emerald-100 text-emerald-700'; }
            else if (total >= 70) { grade = 'ดี'; gradeColor = 'bg-blue-100 text-blue-700'; }
            else if (total >= 60) { grade = 'พอใช้'; gradeColor = 'bg-yellow-100 text-yellow-700'; }
            else if (total > 0) { grade = 'ควรปรับปรุง'; gradeColor = 'bg-red-100 text-red-700'; }

            const selfClass = selfScore >= 60 ? 'text-green-600 font-bold' : (selfScore > 0 ? 'text-red-500' : 'text-gray-400');
            const committeeClass = committeeScore >= 60 ? 'text-green-600 font-bold' : (committeeScore > 0 ? 'text-red-500' : 'text-gray-400');

            const fullName = teacher.prefix
                ? `${teacher.prefix}${teacher.first_name} ${teacher.last_name}`
                : `${teacher.first_name} ${teacher.last_name}`;

            html += `
    <tr>
        <td class="font-medium">${fullName}</td>
        <td>${teacher.academic_standing || '-'}</td>
        <td class="text-center">${teacher.department || '-'}</td>
        <td class="text-center ${selfClass}">${selfScore > 0 ? selfScore.toFixed(2) : '-'}</td>
        <td class="text-center ${committeeClass}">${committeeScore > 0 ? committeeScore.toFixed(2) : '-'}</td>
        <td class="text-center font-bold text-blue-600">${total > 0 ? total.toFixed(2) : '-'}</td>
        <td class="text-center">
            <span class="px-2 py-1 rounded-full text-xs font-bold ${gradeColor}">${grade}</span>
        </td>
        <td class="text-center">
            <button onclick='openEvalDetailModal("${teacher.id}", "${fullName.replace(/'/g, "\\'")}")' 
                    class="text-blue-500 hover:text-blue-700 transition-colors" 
                    title="ดูรายละเอียดการประเมิน">
                <i class="fa-solid fa-eye text-lg"></i>
            </button>
        </td>
    </tr>
`;
        });

        document.getElementById('summaryBody').innerHTML = html;

        if (summaryDataTable) {
            summaryDataTable.destroy();
            summaryDataTable = null;
        }

        summaryDataTable = new DataTable('#summaryTable', {
            language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
            pageLength: 25,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'ทั้งหมด']],
            order: [[2, 'asc'], [0, 'asc']],
            columnDefs: [
                { targets: [3, 4, 5], type: 'num-fmt' },
                { targets: [3, 4, 5, 6, 7], className: 'text-center' },
                { targets: [7], orderable: false, width: '50px' }
            ],
            dom: '<"flex flex-wrap justify-between items-center gap-2 mb-3"lf>rt<"flex flex-wrap justify-between items-center gap-2 mt-3"ip>'
        });

        console.log('✅ โหลดสรุปผลสำเร็จ ครูทั้งหมด:', allTeachers.length, 'คน');

    } catch (err) {
        console.error('❌ Error loading summary:', err);
        document.getElementById('summaryBody').innerHTML =
            '<tr><td colspan="7" class="text-center py-8 text-red-500">โหลดข้อมูลล้มเหลว: ' + err.message + '</td></tr>';
    }
}

// ==========================================
// Export Excel / PDF
// ==========================================
function exportExcel() {
    if (!summaryDataTable) {
        Swal.fire('แจ้งเตือน', 'ยังไม่มีข้อมูล กรุณารอโหลดให้เสร็จก่อน', 'warning');
        return;
    }
    try {
        const headers = ['ชื่อ-สกุล', 'วิทยฐานะ', 'กลุ่มสาระ', 'ประเมินตนเอง', 'กรรมการ', 'คะแนนรวม', 'ระดับ'];
        const rows = summaryDataTable.rows({ search: 'applied' }).data().toArray().map(row => {
            return row.map(cell => {
                const tmp = document.createElement('div');
                tmp.innerHTML = cell;
                return tmp.innerText.trim();
            });
        });

        const wsData = [headers, ...rows];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [{ wch: 25 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];

        XLSX.utils.book_append_sheet(wb, ws, 'สรุปผลประเมิน');
        XLSX.writeFile(wb, `สรุปผลการประเมิน_${new Date().toLocaleDateString('th-TH')}.xlsx`);
    } catch (err) {
        console.error('Export Excel error:', err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถส่งออก Excel ได้', 'error');
    }
}

// ==========================================
// Tab 4: ตั้งค่าระบบ - รอบการประเมิน
// ==========================================

async function loadActiveRound() {
    try {
        const { data, error } = await db
            .from('eval_rounds')
            .select('*')
            .eq('is_active', true)
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error loading active round:', error);
            return;
        }

        currentEvalRound = data;

        const displayElement = document.getElementById('current_active_round');
        const periodElement = document.getElementById('current_active_period');

        if (data) {
            if (displayElement) {
                displayElement.innerText = `${data.round_name}`;
                displayElement.className = 'text-xl font-bold text-blue-700';
            }
            if (periodElement) {
                periodElement.innerText = `${formatDate(data.start_date)} - ${formatDate(data.end_date)}`;
            }
        } else {
            if (displayElement) {
                displayElement.innerText = '❌ ยังไม่มีรอบ Active';
                displayElement.className = 'text-xl font-bold text-red-500';
            }
            if (periodElement) {
                periodElement.innerText = 'กรุณาตั้งค่ารอบ Active';
            }
        }

    } catch (err) {
        console.error('Error loading active round:', err);
    }
}

async function loadAllEvalRounds() {
    try {
        const { data, error } = await db
            .from('eval_rounds')
            .select('*')
            .order('fiscal_year', { ascending: false })
            .order('round_number', { ascending: true });

        if (error) throw error;

        const container = document.getElementById('roundList');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-400">ยังไม่มีรอบการประเมิน</p>';
            return;
        }

        const grouped = {};
        data.forEach(r => {
            if (!grouped[r.fiscal_year]) {
                grouped[r.fiscal_year] = [];
            }
            grouped[r.fiscal_year].push(r);
        });

        let html = '';
        const sortedYears = Object.keys(grouped).sort((a, b) => b - a);

        sortedYears.forEach(year => {
            const rounds = grouped[year];
            const hasActive = rounds.some(r => r.is_active);

            html += `
                <div class="mb-4 border border-gray-200 rounded-xl overflow-hidden">
                    <div class="bg-gray-50 px-4 py-2 flex justify-between items-center border-b border-gray-200">
                        <span class="font-bold text-gray-700">
                            <i class="fa-solid fa-calendar text-blue-500 mr-2"></i>
                            ปีงบประมาณ ${year}
                            ${hasActive ? '<span class="ml-2 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">มีรอบ Active</span>' : ''}
                        </span>
                        <span class="text-sm text-gray-400">${rounds.length} รอบ</span>
                    </div>
                    <div class="p-2 space-y-1">
            `;

            rounds.forEach(r => {
                const isActive = r.is_active;
                const roundThai = r.round_number === 1 ? 'ครั้งที่ 1 (ต.ค.-มี.ค.)' : 'ครั้งที่ 2 (เม.ย.-ก.ย.)';

                html += `
                    <div class="flex flex-wrap justify-between items-center p-3 rounded-lg ${isActive ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-100'} hover:shadow-sm transition-shadow">
                        <div class="flex-1 min-w-[200px]">
                            <div class="flex items-center gap-3 flex-wrap">
                                <span class="font-bold ${isActive ? 'text-blue-700' : 'text-gray-700'}">
                                    ${r.round_name}
                                </span>
                                <span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                                    ${roundThai}
                                </span>
                                ${isActive ? '<span class="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">🟢 Active</span>' : ''}
                            </div>
                            <div class="text-xs text-gray-400 mt-0.5">
                                ${formatDate(r.start_date)} - ${formatDate(r.end_date)}
                            </div>
                        </div>
                        <div class="flex items-center gap-2 mt-2 md:mt-0">
                            ${isActive ? `
                                <button onclick="deactivateRound('${r.id}')" 
                                        class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1">
                                    <i class="fa-solid fa-power-off"></i> ปิด Active
                                </button>
                            ` : `
                                <button onclick="toggleActiveRound('${r.id}')" 
                                        class="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-1">
                                    <i class="fa-solid fa-check-circle"></i> ตั้ง Active
                                </button>
                            `}
                            <button onclick="deleteEvalRound('${r.id}')" 
                                    class="text-red-400 hover:text-red-600 text-sm px-2 py-1 rounded-lg hover:bg-red-50 transition-colors">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
        await updateEvalRoundSelect();

    } catch (err) {
        console.error('Error loading eval rounds:', err);
        const container = document.getElementById('roundList');
        if (container) {
            container.innerHTML = '<p class="text-red-500">โหลดข้อมูลล้มเหลว</p>';
        }
    }
}

async function updateEvalRoundSelect() {
    try {
        const { data, error } = await db
            .from('eval_rounds')
            .select('*')
            .order('fiscal_year', { ascending: false })
            .order('round_number', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('admin_eval_round');
        if (!select) return;

        // เก็บค่าที่เลือกไว้
        const currentValue = select.value;

        select.innerHTML = '<option value="">-- เลือกรอบ --</option>';
        data?.forEach(round => {
            const active = round.is_active ? ' ✅ Active' : '';
            select.innerHTML += `
                <option value="${round.id}" ${round.id === currentValue ? 'selected' : ''}>
                    ${round.round_name}${active}
                </option>
            `;
        });
    } catch (err) {
        console.error('Error updating eval round select:', err);
    }
}

async function toggleActiveRound(roundId) {
    const { data: activeRounds } = await db
        .from('eval_rounds')
        .select('id, round_name')
        .eq('is_active', true)
        .neq('id', roundId);

    if (activeRounds && activeRounds.length > 0) {
        const activeNames = activeRounds.map(r => r.round_name).join(', ');
        const result = await Swal.fire({
            icon: 'warning',
            title: 'มีรอบ Active อยู่แล้ว',
            html: `
                <p>ปัจจุบันมีรอบ Active: <b>${activeNames}</b></p>
                <p class="text-sm text-gray-500 mt-2">ต้องการเปลี่ยนเป็นรอบนี้หรือไม่?</p>
                <p class="text-sm text-red-500">(รอบเดิมจะถูกปิดอัตโนมัติ)</p>
            `,
            showCancelButton: true,
            confirmButtonText: '✅ เปลี่ยนทันที',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#3085d6'
        });

        if (!result.isConfirmed) return;
    }

    const { data: roundData } = await db
        .from('eval_rounds')
        .select('round_name')
        .eq('id', roundId)
        .single();

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { error } = await db
            .from('eval_rounds')
            .update({ is_active: true })
            .eq('id', roundId);

        if (error) throw error;

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire({
            icon: 'success',
            title: 'สำเร็จ!',
            html: `เปลี่ยนรอบ Active เป็น <b>${roundData?.round_name || 'รอบที่เลือก'}</b> เรียบร้อย`,
            timer: 2000,
            showConfirmButton: true
        });
    } catch (err) {
        console.error('Error toggling active round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function deactivateRound(roundId) {
    const { data: roundData } = await db
        .from('eval_rounds')
        .select('round_name')
        .eq('id', roundId)
        .single();

    const result = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการปิด Active',
        html: `
            <p>คุณต้องการปิด Active ของ <b>${roundData?.round_name || 'รอบนี้'}</b> หรือไม่?</p>
            <p class="text-sm text-gray-500 mt-2">(หลังจากปิด จะไม่มีรอบ Active)</p>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ ปิด Active',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#d33'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { error } = await db
            .from('eval_rounds')
            .update({ is_active: false })
            .eq('id', roundId);

        if (error) throw error;

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire({
            icon: 'success',
            title: 'สำเร็จ!',
            html: `ปิด Active ของ <b>${roundData?.round_name || 'รอบที่เลือก'}</b> เรียบร้อย`,
            timer: 2000,
            showConfirmButton: true
        });
    } catch (err) {
        console.error('Error deactivating round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function saveEvalRound() {
    if (currentUser.role !== 'super_admin') {
        return Swal.fire('ไม่มีสิทธิ์', 'เฉพาะ Super Admin เท่านั้นที่ตั้งค่ารอบการประเมินได้', 'error');
    }

    const fiscalYear = parseInt(document.getElementById('round_fiscal_year').value);
    const roundNumber = parseInt(document.getElementById('round_number').value);
    const roundName = document.getElementById('round_name').value;
    const startDate = document.getElementById('round_start').value;
    const endDate = document.getElementById('round_end').value;
    const isActive = document.getElementById('round_is_active').checked;

    if (!fiscalYear || !roundName || !startDate || !endDate) {
        return Swal.fire('แจ้งเตือน', 'กรุณากรอกข้อมูลให้ครบถ้วน', 'warning');
    }

    if (new Date(startDate) >= new Date(endDate)) {
        return Swal.fire('แจ้งเตือน', 'วันที่เริ่มต้องน้อยกว่าวันที่สิ้นสุด', 'warning');
    }

    const { data: existing } = await db
        .from('eval_rounds')
        .select('id')
        .eq('fiscal_year', fiscalYear)
        .eq('round_number', roundNumber)
        .maybeSingle();

    if (existing) {
        return Swal.fire('แจ้งเตือน', `มีรอบที่ ${roundNumber} ของปีงบประมาณ ${fiscalYear} อยู่แล้ว`, 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        if (isActive) {
            await db.from('eval_rounds').update({ is_active: false }).neq('id', '');
        }

        const data = {
            fiscal_year: fiscalYear,
            round_number: roundNumber,
            round_name: roundName,
            start_date: startDate,
            end_date: endDate,
            is_active: isActive
        };

        const { error } = await db.from('eval_rounds').insert([data]);
        if (error) throw error;

        Swal.fire('สำเร็จ', 'บันทึกรอบการประเมินเรียบร้อย', 'success');
        document.getElementById('evalRoundForm').reset();
        document.getElementById('round_is_active').checked = false;
        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();
    } catch (err) {
        console.error('❌ Error saving eval round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function deleteEvalRound(roundId) {
    const { data: roundData } = await db
        .from('eval_rounds')
        .select('round_name, is_active')
        .eq('id', roundId)
        .single();

    if (roundData?.is_active) {
        return Swal.fire('⚠️ ไม่สามารถลบรอบที่กำลัง Active', `"${roundData.round_name}" กำลังถูกใช้งานอยู่`, 'warning');
    }

    const result = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันการลบ',
        html: `
            <p>คุณต้องการลบรอบ <b>${roundData?.round_name || 'นี้'}</b> หรือไม่?</p>
            <p class="text-sm text-red-500 mt-2">⚠️ ข้อมูลที่เกี่ยวข้องจะถูกลบด้วย</p>
        `,
        showCancelButton: true,
        confirmButtonText: '🗑️ ลบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#d33'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // ลบชุดคณะกรรมการที่เกี่ยวข้อง
        await db.from('eval_committee_groups').update({ is_active: false }).eq('eval_round_id', roundId);

        const { error } = await db.from('eval_rounds').delete().eq('id', roundId);
        if (error) throw error;

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire('สำเร็จ', 'ลบรอบการประเมินเรียบร้อย', 'success');
    } catch (err) {
        console.error('Error deleting eval round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function generateDefaultRounds() {
    const result = await Swal.fire({
        icon: 'question',
        title: 'สร้างรอบปีงบประมาณอัตโนมัติ',
        html: `
            <p>ระบบจะสร้างรอบการประเมินสำหรับปีงบประมาณถัดไป</p>
            <p class="text-sm text-gray-500 mt-2">ปีงบประมาณปัจจุบัน: <b>${getCurrentFiscalYear()}</b></p>
            <p class="text-sm text-gray-500">จะสร้างรอบสำหรับปีงบประมาณ: <b>${getCurrentFiscalYear() + 1}</b></p>
            <p class="text-xs text-gray-400 mt-2">* จะไม่สร้างซ้ำถ้ามีอยู่แล้ว</p>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ สร้าง',
        cancelButtonText: 'ยกเลิก'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังสร้าง...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const nextYear = getCurrentFiscalYear() + 1;

        const rounds = [
            {
                fiscal_year: nextYear,
                round_number: 1,
                round_name: `การประเมินครั้งที่ 1/${nextYear}`,
                start_date: new Date(nextYear - 1, 9, 1).toISOString().split('T')[0],
                end_date: new Date(nextYear, 2, 31).toISOString().split('T')[0],
                is_active: false
            },
            {
                fiscal_year: nextYear,
                round_number: 2,
                round_name: `การประเมินครั้งที่ 2/${nextYear}`,
                start_date: new Date(nextYear, 3, 1).toISOString().split('T')[0],
                end_date: new Date(nextYear, 8, 30).toISOString().split('T')[0],
                is_active: false
            }
        ];

        let inserted = 0;
        for (const round of rounds) {
            const { data: existing } = await db
                .from('eval_rounds')
                .select('id')
                .eq('fiscal_year', round.fiscal_year)
                .eq('round_number', round.round_number)
                .maybeSingle();

            if (!existing) {
                const { error } = await db.from('eval_rounds').insert([round]);
                if (error) throw error;
                inserted++;
            }
        }

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire({
            icon: 'success',
            title: 'สำเร็จ!',
            html: `สร้างรอบปีงบประมาณ ${nextYear} เรียบร้อย (เพิ่ม ${inserted} รอบ)`,
            timer: 2000,
            showConfirmButton: true
        });
    } catch (err) {
        console.error('Error generating default rounds:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

async function autoSetActiveRound() {
    const today = new Date();
    const currentYear = getCurrentFiscalYear();
    const currentMonth = today.getMonth();

    let targetRound = 1;
    if (currentMonth >= 3 && currentMonth <= 8) {
        targetRound = 2;
    }

    Swal.fire({ title: 'กำลังตรวจสอบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: targetRoundData } = await db
            .from('eval_rounds')
            .select('*')
            .eq('fiscal_year', currentYear)
            .eq('round_number', targetRound)
            .maybeSingle();

        if (!targetRoundData) {
            Swal.close();
            return Swal.fire('แจ้งเตือน', `ไม่พบรอบที่ ${targetRound} ของปีงบประมาณ ${currentYear}`, 'warning');
        }

        await db.from('eval_rounds').update({ is_active: false }).neq('id', '');

        await db.from('eval_rounds')
            .update({ is_active: true })
            .eq('id', targetRoundData.id);

        await loadAllEvalRounds();
        await loadEvalRounds();
        await loadActiveRound();

        Swal.fire({
            icon: 'success',
            title: 'ตั้งค่า Active อัตโนมัติ',
            html: `ตั้ง <b>${targetRoundData.round_name}</b> เป็น Active<br><span class="text-sm text-gray-500">ตามวันปัจจุบัน</span>`,
            timer: 2000,
            showConfirmButton: true
        });
    } catch (err) {
        console.error('Error auto setting active round:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

function getCurrentFiscalYear() {
    const now = new Date();
    const year = now.getFullYear() + 543;
    const month = now.getMonth();

    if (month < 9) {
        return year - 1;
    }
    return year;
}

// ==========================================
// GAS Config
// ==========================================
async function loadGASConfig() {
    try {
        const { data, error } = await db
            .from('system_config')
            .select('*')
            .in('key', ['gas_api_url', 'gas_template_id']);

        if (error) throw error;

        data?.forEach(item => {
            if (item.key === 'gas_api_url') {
                document.getElementById('gas_api_url').value = item.value || '';
            } else if (item.key === 'gas_template_id') {
                document.getElementById('gas_template_id').value = item.value || '';
            }
        });
    } catch (err) {
        console.error('Error loading GAS config:', err);
    }
}

async function saveGASConfig() {
    const configs = [
        { key: 'gas_api_url', value: document.getElementById('gas_api_url').value },
        { key: 'gas_template_id', value: document.getElementById('gas_template_id').value }
    ];

    Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        for (const config of configs) {
            const { error } = await db
                .from('system_config')
                .upsert([config], { onConflict: 'key' });

            if (error) throw error;
        }

        Swal.fire('สำเร็จ', 'บันทึกการตั้งค่า GAS เรียบร้อย', 'success');
    } catch (err) {
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// Admin Management
// ==========================================
// ==========================================
// โหลดผู้ใช้สำหรับเพิ่มแอดมิน (ใช้ Tom Select)
// ==========================================
async function loadUsersForAdmin() {
    try {
        // ✅ กรองเฉพาะ role: teacher, deputy, director
        const { data, error } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, role, academic_standing')
            .in('role', ['teacher', 'deputy', 'director']);

        if (error) throw error;

        const select = document.getElementById('admin_user_select');
        if (!select) return;

        // ✅ สร้าง options สำหรับ Tom Select
        const options = (data || []).map(p => {
            const roleMap = {
                'teacher': 'ครู',
                'deputy': 'รองผู้อำนวยการ',
                'director': 'ผู้อำนวยการ'
            };
            const roleThai = roleMap[p.role] || p.role;
            const standing = p.academic_standing ? ` (${p.academic_standing})` : '';
            const prefix = p.prefix || '';
            const label = `${prefix}${p.first_name} ${p.last_name} - ${roleThai}${standing}`;
            return { value: p.id, text: label };
        });

        // ✅ ถ้ามี Tom Select instance เก่า ให้ทำลายทิ้ง
        if (window._adminTomSelect) {
            window._adminTomSelect.destroy();
            window._adminTomSelect = null;
        }

        // ✅ สร้าง Tom Select ใหม่
        window._adminTomSelect = new TomSelect(select, {
            plugins: ['dropdown_input', 'remove_button'],
            maxItems: 1,
            placeholder: 'ค้นหาและเลือกผู้ใช้...',
            options: options,
            create: false,
            render: {
                option: function (data, escape) {
                    return `<div class="py-1 px-2 hover:bg-amber-50 cursor-pointer">${escape(data.text)}</div>`;
                },
                item: function (data, escape) {
                    return `<div class="flex items-center gap-2 bg-amber-100 text-amber-800 px-3 py-1 rounded-full">${escape(data.text)}</div>`;
                }
            }
        });

        console.log('✅ โหลดผู้ใช้สำหรับเพิ่มแอดมินสำเร็จ:', data?.length || 0, 'คน');

    } catch (err) {
        console.error('Error loading users for admin:', err);
    }
}

// ==========================================
// โหลดรายชื่อแอดมิน
// ==========================================
async function loadAdminList() {
    try {
        const { data, error } = await db
            .from('core_personnel')
            .select('id, prefix, first_name, last_name, role')
            .in('role', ['admin', 'super_admin']);

        if (error) throw error;

        const container = document.getElementById('adminList');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = `
                <div class="text-center py-4 text-gray-400">
                    <i class="fa-solid fa-user-slash text-2xl mb-2 block"></i>
                    ยังไม่มีแอดมิน
                </div>
            `;
            return;
        }

        container.innerHTML = data.map(user => {
            const roleMap = {
                'admin': '🛡️ Admin',
                'super_admin': '👑 Super Admin'
            };
            const roleDisplay = roleMap[user.role] || user.role;
            const prefix = user.prefix || '';
            const fullName = `${prefix}${user.first_name} ${user.last_name}`;
            const isCurrentUser = user.id === currentUser.id;

            return `
                <div class="flex flex-wrap justify-between items-center border-b py-2.5 hover:bg-gray-50 px-2 rounded-lg transition-colors">
                    <div class="flex items-center gap-3">
                        <span class="font-medium text-gray-800">${fullName}</span>
                        <span class="text-xs ${user.role === 'super_admin' ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'} px-2 py-0.5 rounded-full">
                            ${roleDisplay}
                        </span>
                        ${isCurrentUser ? '<span class="text-xs text-gray-400 font-medium">(คุณ)</span>' : ''}
                    </div>
                    ${!isCurrentUser ? `
                        <button onclick="removeAdmin('${user.id}')" 
                                class="text-red-400 hover:text-red-600 text-sm px-3 py-1 rounded-lg hover:bg-red-50 transition-colors">
                            <i class="fa-solid fa-user-minus mr-1"></i> ลบ
                        </button>
                    ` : `
                        <span class="text-xs text-gray-400">👤 ตัวเอง</span>
                    `}
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading admin list:', err);
        const container = document.getElementById('adminList');
        if (container) {
            container.innerHTML = '<p class="text-red-500">โหลดข้อมูลล้มเหลว</p>';
        }
    }
}

// ==========================================
// เพิ่มแอดมิน
// ==========================================
async function addAdmin() {
    // ✅ ดึงค่าจาก Tom Select
    const userId = window._adminTomSelect ? window._adminTomSelect.getValue() : '';
    const role = document.getElementById('admin_role_select').value;

    if (!userId) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกผู้ใช้', 'warning');
    }

    if (!role) {
        return Swal.fire('แจ้งเตือน', 'กรุณาเลือกบทบาท', 'warning');
    }

    // ✅ ตรวจสอบว่าผู้ใช้ที่เลือกเป็น admin อยู่แล้วหรือไม่
    const { data: existingUser } = await db
        .from('core_personnel')
        .select('role')
        .eq('id', userId)
        .single();

    if (existingUser && ['admin', 'super_admin'].includes(existingUser.role)) {
        return Swal.fire({
            icon: 'warning',
            title: 'แจ้งเตือน',
            text: 'ผู้ใช้นี้เป็นแอดมินอยู่แล้ว',
            confirmButtonText: 'ตกลง'
        });
    }

    // ✅ ดึงชื่อผู้ใช้เพื่อแสดง
    const selectedOption = window._adminTomSelect.options[userId];
    const userName = selectedOption ? selectedOption.text : userId;

    const result = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการเพิ่มแอดมิน',
        html: `
            <div class="text-left">
                <p>คุณต้องการเพิ่ม <b>${userName}</b> เป็น <b>${role}</b> หรือไม่?</p>
                <p class="text-sm text-gray-500 mt-2">⚠️ ผู้ใช้จะได้รับสิทธิ์ในการจัดการระบบ</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '✅ เพิ่ม',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#f59e0b'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังเพิ่ม...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { error } = await db
            .from('core_personnel')
            .update({ role: role })
            .eq('id', userId);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'สำเร็จ!',
            html: `เพิ่ม <b>${userName}</b> เป็น <b>${role}</b> เรียบร้อย`,
            timer: 2000,
            showConfirmButton: true
        });

        // ✅ รีเซ็ต Tom Select
        if (window._adminTomSelect) {
            window._adminTomSelect.clear();
        }

        await loadAdminList();
        await loadUsersForAdmin();

    } catch (err) {
        console.error('Error adding admin:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ลบแอดมิน
// ==========================================
async function removeAdmin(userId) {
    // ดึงชื่อผู้ใช้
    const { data: user } = await db
        .from('core_personnel')
        .select('prefix, first_name, last_name, role')
        .eq('id', userId)
        .single();

    const prefix = user?.prefix || '';
    const fullName = `${prefix}${user?.first_name || ''} ${user?.last_name || ''}`;
    const roleDisplay = user?.role === 'super_admin' ? 'Super Admin' : 'Admin';

    const result = await Swal.fire({
        icon: 'warning',
        title: 'ยืนยันการลบแอดมิน',
        html: `
            <div class="text-left">
                <p>คุณต้องการลบ <b>${fullName}</b> (${roleDisplay}) ออกจากระบบแอดมินหรือไม่?</p>
                <p class="text-sm text-red-500 mt-2">⚠️ ผู้ใช้จะถูกลดบทบาทเป็น "ครู"</p>
            </div>
        `,
        showCancelButton: true,
        confirmButtonText: '🗑️ ลบ',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#d33'
    });

    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังลบ...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { error } = await db
            .from('core_personnel')
            .update({ role: 'teacher' })
            .eq('id', userId);

        if (error) throw error;

        Swal.fire({
            icon: 'success',
            title: 'สำเร็จ!',
            html: `ลบ <b>${fullName}</b> ออกจากระบบแอดมินเรียบร้อย`,
            timer: 2000,
            showConfirmButton: true
        });

        await loadAdminList();
        await loadUsersForAdmin();

    } catch (err) {
        console.error('Error removing admin:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ฟังก์ชันช่วยเหลือ
// ==========================================
function formatDate(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ==========================================
// LOGOUT (มาตรฐานกลาง)
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
// เปิด Modal รายละเอียดการประเมิน
// ==========================================
async function openEvalDetailModal(teacherId, teacherName) {
    currentDetailTeacherId = teacherId;

    // ตั้งชื่อครู
    document.getElementById('modal_teacher_name').innerText = `👤 ${teacherName}`;

    // แสดง Modal
    document.getElementById('evalDetailModal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');

    // โหลดข้อมูล
    await loadDetailData(teacherId);
}

// ==========================================
// ปิด Modal
// ==========================================
function closeEvalDetailModal() {
    document.getElementById('evalDetailModal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');

    // ทำลาย DataTable เพื่อป้องกัน memory leak
    if (detailDataTable) {
        detailDataTable.destroy();
        detailDataTable = null;
    }
}

// ✅ คลิกนอก Modal เพื่อปิด
document.getElementById('evalDetailModal')?.addEventListener('click', function (e) {
    if (e.target === this) {
        closeEvalDetailModal();
    }
});

// ✅ กด ESC เพื่อปิด
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        closeEvalDetailModal();
    }
});

// ==========================================
// โหลดข้อมูลรายละเอียดการประเมิน
// ==========================================
async function loadDetailData(teacherId) {
    try {
        const { data: selfData } = await db
            .from('eval_results')
            .select('*')
            .eq('evaluatee_id', teacherId)
            .eq('eval_type', 'self')
            .order('created_at', { ascending: false })
            .limit(1);

        const { data: committeeData } = await db
            .from('eval_results')
            .select('*')
            .eq('evaluatee_id', teacherId)
            .eq('eval_type', 'committee')
            .order('created_at', { ascending: false });

        renderSelfDetail(selfData?.[0]);
        await renderCommitteeDetail(committeeData || []);
        renderSummaryDetail(selfData?.[0], committeeData || []);

        setupDetailTabs();

    } catch (err) {
        console.error('Error loading detail data:', err);
        document.getElementById('detail_self_content').innerHTML =
            '<p class="text-red-500">โหลดข้อมูลล้มเหลว: ' + err.message + '</p>';
    }
}

// ==========================================
// ตั้งค่า Tab
// ==========================================
function setupDetailTabs() {
    document.querySelectorAll('.detail-tab-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            // เปลี่ยนสถานะปุ่ม
            document.querySelectorAll('.detail-tab-btn').forEach(b => {
                b.classList.remove('active', 'bg-blue-600', 'text-white');
                b.classList.add('bg-gray-200', 'text-gray-600');
            });
            this.classList.add('active', 'bg-blue-600', 'text-white');
            this.classList.remove('bg-gray-200', 'text-gray-600');

            // เปลี่ยนเนื้อหา
            document.querySelectorAll('.detail-tab-content').forEach(t => t.style.display = 'none');
            const targetTab = document.getElementById(this.dataset.tab);
            if (targetTab) {
                targetTab.style.display = 'block';
            }
        });
    });
}

// ==========================================
// แสดงข้อมูลประเมินตนเอง
// ==========================================
function renderSelfDetail(selfData) {
    const container = document.getElementById('detail_self_content');

    if (!selfData) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fa-solid fa-user-slash text-4xl mb-3 block"></i>
                <p>ยังไม่มีการประเมินตนเอง</p>
            </div>
        `;
        return;
    }

    const detailedScores = selfData.detailed_scores || {};
    const p1s1 = detailedScores.p1_s1 || [];
    const p1s2 = detailedScores.p1_s2 || [];
    const p2 = detailedScores.p2 || 0;
    const p3 = detailedScores.p3 || [];

    // ✅ ตรวจสอบว่ามีการประเมินองค์ประกอบใดบ้าง
    const hasP1 = p1s1.length > 0 || p1s2.length > 0;
    const hasP2 = p2 > 0;
    const hasP3 = p3.length > 0;

    container.innerHTML = `
        <div class="space-y-4">
            <!-- สถานะ -->
            <div class="flex items-center gap-3 p-3 rounded-xl ${selfData.status === 'submitted' ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}">
                <span class="text-2xl">${selfData.status === 'submitted' ? '✅' : '📝'}</span>
                <div>
                    <p class="font-bold ${selfData.status === 'submitted' ? 'text-green-700' : 'text-yellow-700'}">${selfData.status === 'submitted' ? 'ส่งแล้ว' : 'ร่าง'}</p>
                    <p class="text-xs text-gray-400">อัปเดตล่าสุด: ${new Date(selfData.updated_at).toLocaleString('th-TH')}</p>
                </div>
                <div class="ml-auto bg-blue-100 px-3 py-1 rounded-lg">
                    <span class="font-bold text-blue-700">${selfData.total_score.toFixed(2)} / 100</span>
                </div>
            </div>

            <!-- รายละเอียดคะแนน -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div class="bg-blue-50 p-4 rounded-xl border border-blue-200">
                    <p class="text-sm text-gray-500">องค์ประกอบที่ 1</p>
                    <p class="font-bold text-blue-600 text-lg">${hasP1 ? '✅ ประเมินแล้ว' : '❌ ไม่ได้ประเมิน'}</p>
                    <p class="text-xs text-gray-400 mt-1">ตอนที่ 1: ${p1s1.length} ข้อ | ตอนที่ 2: ${p1s2.length} ข้อ</p>
                    ${p1s1.length > 0 ? `<p class="text-xs text-gray-500 mt-1">คะแนน: ${p1s1.join(', ')}</p>` : ''}
                </div>
                <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                    <p class="text-sm text-gray-500">องค์ประกอบที่ 2</p>
                    <p class="font-bold text-emerald-600 text-lg">${hasP2 ? `✅ ระดับ ${p2}` : '❌ ไม่ได้ประเมิน'}</p>
                </div>
                <div class="bg-purple-50 p-4 rounded-xl border border-purple-200">
                    <p class="text-sm text-gray-500">องค์ประกอบที่ 3</p>
                    <p class="font-bold text-purple-600 text-lg">${hasP3 ? `✅ ${p3.length} ข้อ` : '❌ ไม่ได้ประเมิน'}</p>
                    ${p3.length > 0 ? `<p class="text-xs text-gray-500 mt-1">คะแนน: ${p3.join(', ')}</p>` : ''}
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// แสดงข้อมูลการประเมินโดยกรรมการ
// ==========================================
async function renderCommitteeDetail(committeeData) {
    const container = document.getElementById('detail_committee_content');

    if (!committeeData || committeeData.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fa-solid fa-users-slash text-4xl mb-3 block"></i>
                <p>ยังไม่มีการประเมินโดยกรรมการ</p>
            </div>
        `;
        return;
    }

    if (detailDataTable) {
        detailDataTable.destroy();
        detailDataTable = null;
    }

    let tableHTML = `
        <table id="detailCommitteeTable" class="display w-full text-sm">
            <thead>
                <tr>
                    <th>กรรมการ</th>
                    <th>องค์ประกอบที่ 1</th>
                    <th>องค์ประกอบที่ 2</th>
                    <th>องค์ประกอบที่ 3</th>
                    <th class="text-center">คะแนนรวม</th>
                    <th class="text-center">สถานะ</th>
                    <th class="text-center">วันที่</th>
                </tr>
            </thead>
            <tbody>
    `;

    const evaluatorIds = committeeData.map(d => d.evaluator_id);
    const { data: evaluators } = await db
        .from('core_personnel')
        .select('id, prefix, first_name, last_name, role')
        .in('id', evaluatorIds);

    const evaluatorMap = {};
    evaluators?.forEach(e => {
        const prefix = e.prefix || '';
        evaluatorMap[e.id] = `${prefix}${e.first_name} ${e.last_name}`;
    });

    committeeData.forEach(d => {
        const detailedScores = d.detailed_scores || {};
        const p1s1 = detailedScores.p1_s1 || [];
        const p1s2 = detailedScores.p1_s2 || [];
        const p2 = detailedScores.p2 || 0;
        const p3 = detailedScores.p3 || [];

        const hasP1 = p1s1.length > 0 || p1s2.length > 0;
        const hasP2 = p2 > 0;
        const hasP3 = p3.length > 0;

        let statusBadge = '';
        const totalItems = (hasP1 ? 1 : 0) + (hasP2 ? 1 : 0) + (hasP3 ? 1 : 0);
        if (totalItems === 3) {
            statusBadge = '<span class="status-badge-complete">✅ ครบทุกองค์ประกอบ</span>';
        } else if (totalItems > 0) {
            statusBadge = `<span class="status-badge-partial">📝 ประเมินแล้ว ${totalItems}/3</span>`;
        } else {
            statusBadge = '<span class="status-badge-none">❌ ยังไม่ประเมิน</span>';
        }

        const evaluatorName = evaluatorMap[d.evaluator_id] || 'ไม่ระบุ';

        tableHTML += `
            <tr>
                <td class="font-medium">${evaluatorName}</td>
                <td>
                    ${hasP1 ? `<span class="text-green-600">✅ ${p1s1.length + p1s2.length} ข้อ</span>` : '<span class="text-gray-400">-</span>'}
                    ${p1s1.length > 0 ? `<span class="text-xs text-gray-400 block">ตอนที่1: ${p1s1.join(',')}</span>` : ''}
                    ${p1s2.length > 0 ? `<span class="text-xs text-gray-400 block">ตอนที่2: ${p1s2.join(',')}</span>` : ''}
                </td>
                <td>${hasP2 ? `ระดับ ${p2}` : '-'}</td>
                <td>${hasP3 ? `${p3.length} ข้อ` : '-'}</td>
                <td class="text-center font-bold text-blue-600">${d.total_score.toFixed(2)}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center text-xs text-gray-400">${new Date(d.updated_at).toLocaleDateString('th-TH')}</td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;

    detailDataTable = new DataTable('#detailCommitteeTable', {
        language: { url: 'https://cdn.datatables.net/plug-ins/2.3.7/i18n/th.json' },
        pageLength: 10,
        lengthMenu: [[5, 10, 25, -1], [5, 10, 25, 'ทั้งหมด']],
        order: [[6, 'desc']],
        columnDefs: [
            { targets: [4, 5, 6], className: 'text-center' }
        ],
        dom: '<"flex flex-wrap justify-between items-center gap-2 mb-3"lf>rt<"flex flex-wrap justify-between items-center gap-2 mt-3"ip>'
    });
}

// ==========================================
// แสดงสรุปคะแนน
// ==========================================
function renderSummaryDetail(selfData, committeeData) {
    const container = document.getElementById('detail_summary_content');

    // ✅ คำนวณคะแนนรวมจากกรรมการ
    let committeeTotal = 0;
    let committeeCount = 0;
    committeeData.forEach(d => {
        if (d.total_score > 0) {
            committeeTotal += d.total_score;
            committeeCount++;
        }
    });
    const avgCommitteeScore = committeeCount > 0 ? committeeTotal / committeeCount : 0;

    const selfScore = selfData?.total_score || 0;
    const finalScore = Math.max(selfScore, avgCommitteeScore);

    // ✅ ตรวจสอบว่าแต่ละองค์ประกอบได้รับการประเมินครบหรือไม่
    const selfDetailed = selfData?.detailed_scores || {};
    const selfP1 = (selfDetailed.p1_s1 || []).length + (selfDetailed.p1_s2 || []).length > 0;
    const selfP2 = (selfDetailed.p2 || 0) > 0;
    const selfP3 = (selfDetailed.p3 || []).length > 0;

    // ตรวจสอบกรรมการ
    let committeeP1 = false, committeeP2 = false, committeeP3 = false;
    committeeData.forEach(d => {
        const det = d.detailed_scores || {};
        if ((det.p1_s1 || []).length > 0 || (det.p1_s2 || []).length > 0) committeeP1 = true;
        if ((det.p2 || 0) > 0) committeeP2 = true;
        if ((det.p3 || []).length > 0) committeeP3 = true;
    });

    const isSelfComplete = selfP1 && selfP2 && selfP3;
    const isCommitteeComplete = committeeP1 && committeeP2 && committeeP3;

    container.innerHTML = `
        <div class="space-y-4">
            <!-- สรุปภาพรวม -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="bg-blue-50 p-4 rounded-xl border border-blue-200 text-center">
                    <p class="text-sm text-gray-500">ประเมินตนเอง</p>
                    <p class="text-3xl font-bold text-blue-600">${selfScore.toFixed(2)}</p>
                    <p class="text-xs text-gray-400">${isSelfComplete ? '✅ ครบทุกองค์ประกอบ' : '⚠️ ยังไม่ครบ'}</p>
                </div>
                <div class="bg-emerald-50 p-4 rounded-xl border border-emerald-200 text-center">
                    <p class="text-sm text-gray-500">กรรมการ (${committeeCount} คน)</p>
                    <p class="text-3xl font-bold text-emerald-600">${avgCommitteeScore.toFixed(2)}</p>
                    <p class="text-xs text-gray-400">${isCommitteeComplete ? '✅ ครบทุกองค์ประกอบ' : '⚠️ ยังไม่ครบ'}</p>
                </div>
                <div class="bg-purple-50 p-4 rounded-xl border border-purple-200 text-center">
                    <p class="text-sm text-gray-500">คะแนนรวมสูงสุด</p>
                    <p class="text-3xl font-bold text-purple-600">${finalScore.toFixed(2)}</p>
                    <p class="text-xs text-gray-400">/ 100</p>
                </div>
            </div>

            <!-- องค์ประกอบที่ประเมินครบ/ไม่ครบ -->
            <div class="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <p class="font-bold text-gray-700 mb-2">📋 สถานะการประเมินแต่ละองค์ประกอบ</p>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div class="flex items-center gap-2 p-2 rounded-lg ${isSelfComplete || committeeP1 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}">
                        <span class="text-lg">${isSelfComplete || committeeP1 ? '✅' : '⚠️'}</span>
                        <div>
                            <p class="text-sm font-medium">องค์ประกอบที่ 1</p>
                            <p class="text-xs ${isSelfComplete || committeeP1 ? 'text-green-600' : 'text-yellow-600'}">${isSelfComplete || committeeP1 ? 'ประเมินครบแล้ว' : 'รอการประเมิน'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 p-2 rounded-lg ${isSelfComplete || committeeP2 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}">
                        <span class="text-lg">${isSelfComplete || committeeP2 ? '✅' : '⚠️'}</span>
                        <div>
                            <p class="text-sm font-medium">องค์ประกอบที่ 2</p>
                            <p class="text-xs ${isSelfComplete || committeeP2 ? 'text-green-600' : 'text-yellow-600'}">${isSelfComplete || committeeP2 ? 'ประเมินครบแล้ว' : 'รอการประเมิน'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 p-2 rounded-lg ${isSelfComplete || committeeP3 ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}">
                        <span class="text-lg">${isSelfComplete || committeeP3 ? '✅' : '⚠️'}</span>
                        <div>
                            <p class="text-sm font-medium">องค์ประกอบที่ 3</p>
                            <p class="text-xs ${isSelfComplete || committeeP3 ? 'text-green-600' : 'text-yellow-600'}">${isSelfComplete || committeeP3 ? 'ประเมินครบแล้ว' : 'รอการประเมิน'}</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ระดับคุณภาพ -->
            <div class="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 rounded-xl text-white text-center">
                <p class="text-sm opacity-80">ระดับคุณภาพโดยรวม</p>
                <p class="text-4xl font-bold">${getGradeText(finalScore)}</p>
                <p class="text-sm opacity-80">${finalScore.toFixed(2)} / 100</p>
            </div>
        </div>
    `;
}

// ==========================================
// ฟังก์ชันช่วยเหลือระดับคะแนน
// ==========================================
function getGradeText(score) {
    if (score >= 80) return 'ดีมาก 🌟';
    if (score >= 70) return 'ดี 👍';
    if (score >= 60) return 'พอใช้ 📝';
    if (score > 0) return 'ควรปรับปรุง ⚠️';
    return 'ยังไม่ประเมิน ⏳';
}
