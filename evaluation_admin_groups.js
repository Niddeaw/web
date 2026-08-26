// ==========================================
// evaluation_admin_groups.js - จัดการคณะกรรมการ (Groups)
// ==========================================

// ==========================================
// TAB 2: คณะกรรมการ (Responsive) - HTML ธรรมดา
// ==========================================
async function loadGroupsTable() {
    const tbody = document.getElementById('tb-groups');
    const mobileContainer = document.getElementById('groupsMobileContainer');
    if (!tbody) return;

    // ✅ ลบการทำลาย DataTable เก่าออก (เพราะไม่ใช้แล้ว)

    const roundId = document.getElementById('filter_round_for_groups').value;

    // ✅ โหลดข้อมูลล่าสุด (ไม่กรองเฉพาะ sub)
    await loadGroups(roundId);

    // ✅ ใช้ allGroups ที่เพิ่งโหลดมาใหม่
    const displayGroups = allGroups;

    if (displayGroups.length === 0) {
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

    for (const group of displayGroups) {
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

        // ✅ Desktop Table Row (HTML ธรรมดา)
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

        // ✅ Mobile Card View (HTML ธรรมดา)
        const typeLabel = group.group_type === 'main' ? 'ชุดหลัก' : 'ชุดย่อย';
        const typeColor = group.group_type === 'main' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
        const statusColor = isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        const statusText = isActive ? '✅ เปิดใช้งาน' : '❌ ปิดใช้งาน';

        const shortSubItems = truncateText(subItemsText, 25);
        const shortMembers = truncateText(memberNames.join(', '), 25);
        const shortTargets = truncateText(targetNames, 25);

        mobileHtml += `
            <div class="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow group-card">
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

    // ✅ จบฟังก์ชันโดยไม่มีการสร้าง DataTable อีกต่อไป
}

// ==========================================
// โหลดกลุ่มคณะกรรมการ (ทุกประเภท)
// ==========================================
async function loadGroups(roundId = null) {
    let query = db.from('eval_committee_groups').select('*');
    if (roundId) {
        query = query.eq('eval_round_id', roundId);
    }
    // ✅ ไม่กรองเฉพาะ sub ให้โหลดทั้ง main และ sub
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        console.error('Error loading groups:', error);
        return;
    }
    allGroups = data || [];
    console.log('✅ โหลดกลุ่มทั้งหมด:', allGroups.length, 'ชุด');
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
    // ✅ ปิด Modal ตรวจสอบความครบถ้วนก่อน (ถ้าเปิดอยู่)
    closeCompletenessModal();

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
                    option: function (data, escape) {
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
document.addEventListener('change', function (e) {
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
document.getElementById('groupForm')?.addEventListener('submit', async function (e) {
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
// ✅ [ฟังก์ชันใหม่] คัดลอกหัวข้อจากชุดหลักไปยังชุดย่อยทั้งหมด
// ==========================================
async function copySubItemsToAllSubGroups() {
    const roundId = document.getElementById('filter_round_for_groups').value;
    if (!roundId) return Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมิน', 'warning');

    const result = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการคัดลอก',
        text: 'ระบบจะคัดลอกหัวข้อของชุดหลัก ไปให้ชุดย่อยทุกชุดในรอบนี้ (ถ้าหัวข้อเดิมไม่ตรงจะถูกแทนที่) ต้องการดำเนินการต่อหรือไม่?',
        showCancelButton: true,
        confirmButtonText: 'ใช่, คัดลอกเลย',
        cancelButtonText: 'ยกเลิก'
    });
    if (!result.isConfirmed) return;

    Swal.fire({ title: 'กำลังคัดลอก...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        // ดึงข้อมูลทั้งหมดในรอบนี้
        const { data: groups, error: gErr } = await db
            .from('eval_committee_groups')
            .select('*')
            .eq('eval_round_id', roundId)
            .eq('is_active', true);

        if (gErr) throw gErr;

        const mainGroups = groups.filter(g => g.group_type === 'main');
        const subGroups = groups.filter(g => g.group_type === 'sub');

        const mainMap = {};
        mainGroups.forEach(m => mainMap[m.id] = m);

        let updatedCount = 0;
        for (const sub of subGroups) {
            const parent = mainMap[sub.parent_group_id];
            if (parent) {
                // อัปเดต selected_sub_items ของชุดย่อยให้เท่ากับชุดหลัก
                const { error: updateErr } = await db
                    .from('eval_committee_groups')
                    .update({ selected_sub_items: parent.selected_sub_items || [] })
                    .eq('id', sub.id);
                
                if (!updateErr) updatedCount++;
            }
        }

        Swal.close();
        await loadGroups(roundId);
        await loadGroupsTable();

        Swal.fire({
            icon: 'success',
            title: `คัดลอกสำเร็จ!`,
            text: `อัปเดตหัวข้อให้ชุดย่อยแล้ว ${updatedCount} ชุด`,
            timer: 2000,
            showConfirmButton: false
        });

    } catch (err) {
        console.error('Error copying sub items:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ตรวจสอบความครบถ้วนของการประเมิน (เวอร์ชันตรวจเทียบกับชุดหลัก)
// ==========================================
async function checkEvaluationCompleteness() {
    const roundId = document.getElementById('filter_round_for_groups').value;

    if (!roundId) {
        Swal.fire('แจ้งเตือน', 'กรุณาเลือกรอบการประเมินก่อนตรวจสอบ', 'warning');
        return;
    }

    const loadingHtml = `
        <div class="text-center py-8">
            <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p class="mt-4 text-gray-500">กำลังตรวจสอบข้อมูล...</p>
        </div>
    `;

    const modal = document.createElement('div');
    modal.id = 'completenessModal';
    modal.className = 'fixed inset-0 z-50 hidden';
    modal.innerHTML = `
        <div class="flex items-center justify-center min-h-screen p-4">
            <div class="bg-white rounded-2xl max-w-6xl w-full max-h-[90vh] shadow-2xl modal-content">
                <div class="flex justify-between items-center p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-2xl z-10">
                    <h3 class="text-xl font-bold text-gray-800">
                        <i class="fa-solid fa-check-double text-indigo-500 mr-2"></i>
                        ตรวจสอบความครบถ้วนของการประเมิน
                    </h3>
                    <button onclick="closeCompletenessModal()" 
                            class="text-gray-400 hover:text-gray-600 transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100">
                        <i class="fa-solid fa-xmark text-2xl"></i>
                    </button>
                </div>
                <div class="p-6 modal-body-scroll" id="completenessModalBody">
                    ${loadingHtml}
                </div>
                <div class="flex justify-end p-4 border-t border-gray-200 sticky bottom-0 bg-white rounded-b-2xl">
                    <button onclick="closeCompletenessModal()" 
                            class="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2.5 rounded-xl font-bold transition-colors">
                        ปิด
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.classList.remove('hidden');

    try {
        const { data: groups, error: gErr } = await db
            .from('eval_committee_groups')
            .select('*, eval_committee_targets(*), eval_committee_members(user_id)')
            .eq('eval_round_id', roundId)
            .eq('is_active', true);

        if (gErr) throw gErr;
        if (!groups || groups.length === 0) {
            document.getElementById('completenessModalBody').innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <i class="fa-solid fa-info-circle text-2xl mb-2"></i>
                    <p>ไม่พบชุดคณะกรรมการในรอบนี้</p>
                </div>
            `;
            return;
        }

        const mainGroups = groups.filter(g => g.group_type === 'main');
        const subGroups = groups.filter(g => g.group_type === 'sub');

        // ✅ สร้าง Map ของชุดหลัก เพื่อใช้หาหัวข้อมาตรฐานของชุดย่อย
        const mainGroupsMap = {};
        mainGroups.forEach(main => {
            mainGroupsMap[main.id] = main;
        });

        // ✅ ตัวแปรสำหรับสรุปผลรวม (ไม่นับซ้ำ)
        let globalSelectedKeys = new Set();

        // ==========================================
        // ส่วนที่ 1: Main Groups
        // ==========================================
        let mainTableHtml = `
            <div class="mb-6 p-4 bg-indigo-50 border border-indigo-200 rounded-xl">
                <h4 class="font-bold text-indigo-700 mb-3 text-lg">
                    <i class="fa-solid fa-users-rectangle mr-2"></i>
                    ส่วนที่ 1: ความครบถ้วนของการแต่งตั้งคณะกรรมการ (ชุดหลัก)
                </h4>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm bg-white rounded-lg overflow-hidden shadow-sm">
                        <thead class="bg-indigo-100 text-indigo-700">
                            <tr>
                                <th class="p-3 text-left border-b border-indigo-200">ชุดหลัก</th>
                                <th class="p-3 text-center border-b border-indigo-200">ชุดย่อย</th>
                                <th class="p-3 text-center border-b border-indigo-200">กลุ่มเป้าหมาย</th>
                                <th class="p-3 text-center border-b border-indigo-200">คะแนนรวม / 100</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        mainGroups.forEach(main => {
            const subCount = subGroups.filter(s => s.parent_group_id === main.id).length;
            const mainTargets = (main.eval_committee_targets || []).filter(t => t.target_type === 'department').map(t => t.target_value);
            const mainSubItems = main.selected_sub_items || [];

            // ✅ สร้าง Set ของหัวข้อที่ชุดหลักนี้เลือกไว้
            const selectedKeys = new Set(mainSubItems.map(item => `${item.element}-${item.value}-${item.part || ''}`));

            // ✅ คำนวณคะแนนรวมที่เลือกไว้ (ของชุดนี้)
            const selectedScore = mainSubItems.reduce((sum, item) => {
                const standard = STANDARD_FULL_ITEMS.find(s => s.element === item.element && s.value === item.value && s.part === (item.part || ''));
                return sum + (standard ? standard.score : 0);
            }, 0);

            // ✅ เก็บหัวข้อที่ชุดนี้เลือกไว้ลงใน "Global Set" เพื่อใช้เช็คภายหลัง
            mainSubItems.forEach(item => {
                globalSelectedKeys.add(`${item.element}-${item.value}-${item.part || ''}`);
            });

            mainTableHtml += `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="p-3 font-medium">${main.group_name || '-'}</td>
                    <td class="p-3 text-center font-bold">${subCount > 0 ? subCount + ' ชุด' : '-'}</td>
                    <td class="p-3 text-xs text-gray-500 max-w-[250px] truncate" title="${mainTargets.join(', ')}">
                        ${mainTargets.length > 0 ? mainTargets.join(', ') : '-'}
                    </td>
                    <td class="p-3 text-center font-bold ${selectedScore === 100 ? 'text-green-600' : 'text-gray-700'}">
                        ${selectedScore} / 100 คะแนน
                    </td>
                </tr>
            `;
        });

        if (mainGroups.length === 0) {
            mainTableHtml += `
                <tr>
                    <td colspan="4" class="p-4 text-center text-red-500 font-bold">
                        ⚠️ ไม่พบการตั้งค่าชุดหลัก (Main Group) ในระบบ
                    </td>
                </tr>
            `;
        }

        // ✅ หาหัวข้อที่ขาดหายไปจริง (ไม่มีชุดหลักชุดไหนเลือก)
        const actualMissingItems = STANDARD_FULL_ITEMS.filter(item => !globalSelectedKeys.has(`${item.element}-${item.value}-${item.part || ''}`));
        const actualMissingText = actualMissingItems.length > 0 ? actualMissingItems.map(item => item.value).join(', ') : '';
        const actualMissingScore = actualMissingItems.reduce((sum, item) => sum + item.score, 0);
        const actualScore = 100 - actualMissingScore;

        mainTableHtml += `
            </tbody>
            <tfoot class="bg-indigo-50 border-t-2 border-indigo-200">
                <tr>
                    <td class="p-3 font-bold text-indigo-800">สรุปคะแนนรวมทั้งหมด (ไม่นับซ้ำ)</td>
                    <td class="p-3 text-center font-bold text-indigo-800">${mainGroups.length} ชุด</td>
                    <td class="p-3 text-center text-xs text-gray-500">-</td>
                    <td class="p-3 text-center">
                        <div class="font-extrabold text-lg ${actualScore === 100 ? 'text-green-600' : 'text-red-600'}">
                            ${actualScore} / 100 คะแนน
                        </div>
                        ${actualScore < 100 ? `
                            <div class="text-[10px] text-red-500 mt-1 max-w-[300px] truncate" title="ขาด: ${actualMissingText}">
                                ขาด: ${actualMissingText}
                            </div>
                        ` : `<div class="text-[10px] text-green-500 mt-1">✅ ครบถ้วน 100 คะแนน</div>`}
                    </td>
                </tr>
            </tfoot>
        </table></div></div>`;

        // ==========================================
        // ส่วนที่ 2: Sub Groups (เทียบกับชุดหลัก)
        // ==========================================
        let subTableHtml = `
            <div class="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h4 class="font-bold text-blue-700 mb-3 text-lg">
                    <i class="fa-solid fa-clipboard-check mr-2"></i>
                    ส่วนที่ 2: ความครบถ้วนของหัวข้อประเมินและการประเมินครู (ชุดย่อย)
                </h4>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm bg-white rounded-lg overflow-hidden shadow-sm">
                        <thead class="bg-blue-100 text-blue-700">
                            <tr>
                                <th class="p-3 text-left border-b border-blue-200">ชุดย่อย</th>
                                <th class="p-3 text-center border-b border-blue-200">ชุดหลักที่สังกัด</th>
                                <th class="p-3 text-center border-b border-blue-200">หัวข้อที่ต้องประเมิน</th>
                                <th class="p-3 text-center border-b border-blue-200">หัวข้อที่ตั้งไว้</th>
                                <th class="p-3 text-center border-b border-blue-200">ความครบถ้วน</th>
                                <th class="p-3 text-center border-b border-blue-200">ครูทั้งหมด</th>
                                <th class="p-3 text-center border-b border-blue-200">ประเมินแล้ว</th>
                                <th class="p-3 text-center border-b border-blue-200">ยังไม่ประเมิน</th>
                                <th class="p-3 text-center border-b border-blue-200">สถานะรวม</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        let totalTeachers = 0;
        let totalEvaluated = 0;
        let totalNotEvaluated = 0;

        for (const group of subGroups) {
            // ✅ หาชุดหลักของชุดย่อยนี้
            const parentGroup = mainGroupsMap[group.parent_group_id];
            const parentSubItems = parentGroup ? (parentGroup.selected_sub_items || []) : [];
            const parentKeys = new Set(parentSubItems.map(item => `${item.element}-${item.value}-${item.part || ''}`));

            // ✅ หัวข้อที่ชุดย่อยเลือกไว้
            const selectedItems = group.selected_sub_items || [];
            const selectedKeys = new Set(selectedItems.map(item => `${item.element}-${item.value}-${item.part || ''}`));

            // ✅ ตรวจว่าชุดย่อยเลือกครบตามชุดหลักหรือไม่
            const missingItems = parentSubItems.filter(item => !selectedKeys.has(`${item.element}-${item.value}-${item.part || ''}`));
            const isSubItemsComplete = missingItems.length === 0;

            // ✅ กลุ่มเป้าหมาย
            const targets = group.eval_committee_targets || [];
            const departments = targets
                .filter(t => t.target_type === 'department')
                .map(t => t.target_value);

            // ✅ ตรวจครู
            let allTeachers = [];
            let evalResults = [];

            for (const dept of departments) {
                const { data: teachers, error: tErr } = await db
                    .from('core_personnel')
                    .select('id, prefix, first_name, last_name, academic_standing')
                    .eq('department', dept)
                    .in('academic_standing', ['ครูผู้ช่วย', 'ครู', 'ครูชำนาญการ', 'ครูชำนาญการพิเศษ']);

                if (!tErr && teachers) {
                    allTeachers = [...allTeachers, ...teachers];
                }
            }

            if (allTeachers.length > 0) {
                const teacherIds = allTeachers.map(t => t.id);
                const { data: evals, error: eErr } = await db
                    .from('eval_results')
                    .select('evaluatee_id, status, total_score')
                    .in('evaluatee_id', teacherIds)
                    .eq('eval_round_id', roundId)
                    .eq('eval_type', 'committee')
                    .eq('status', 'submitted');

                if (!eErr && evals) {
                    evalResults = evals;
                }
            }

            const teacherCount = allTeachers.length;
            const evaluatedIds = new Set(evalResults.map(e => e.evaluatee_id));
            const evaluatedCount = evaluatedIds.size;
            const notEvaluatedCount = teacherCount - evaluatedCount;
            const isTeacherComplete = notEvaluatedCount === 0 && teacherCount > 0;

            totalTeachers += teacherCount;
            totalEvaluated += evaluatedCount;
            totalNotEvaluated += notEvaluatedCount;

            // ✅ สถานะรวม
            let overallStatus;
            if (!parentGroup) {
                overallStatus = '<span class="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">❌ ไม่มีชุดหลัก</span>';
            } else if (!isSubItemsComplete) {
                overallStatus = '<span class="px-2 py-1 rounded-full text-xs font-bold bg-red-100 text-red-700">❌ หัวข้อไม่ครบ</span>';
            } else if (teacherCount === 0) {
                overallStatus = '<span class="px-2 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-500">⚠️ ไม่มีครู</span>';
            } else if (isTeacherComplete) {
                overallStatus = '<span class="px-2 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">✅ ครบถ้วนสมบูรณ์</span>';
            } else {
                overallStatus = `<span class="px-2 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">⏳ เหลือ ${notEvaluatedCount} คน</span>`;
            }

            const missingItemsText = missingItems.length > 0
                ? missingItems.map(item => item.value).join(', ')
                : 'ครบถ้วน';

            const parentName = parentGroup ? parentGroup.group_name : '-';
            const parentItemsText = parentSubItems.map(item => item.value).join(', ') || '-';
            const selectedItemsText = selectedItems.map(item => item.value).join(', ') || '-';

            subTableHtml += `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="p-3 font-medium">${group.group_name || '-'}</td>
                    <td class="p-3 text-xs text-center">${parentName}</td>
                    <td class="p-3 text-xs text-gray-500 max-w-[150px] truncate" title="${parentItemsText}">${parentItemsText}</td>
                    <td class="p-3 text-xs text-gray-500 max-w-[150px] truncate" title="${selectedItemsText}">${selectedItemsText}</td>
                    <td class="p-3 text-center">
                        <span class="px-2 py-1 rounded-full text-xs font-bold ${isSubItemsComplete ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
                            ${isSubItemsComplete ? '✅ ครบ' : '❌ ไม่ครบ'}
                        </span>
                        ${!isSubItemsComplete ? `<div class="text-[10px] text-red-500 mt-1 max-w-[200px] truncate" title="${missingItemsText}">ขาด: ${missingItemsText}</div>` : ''}
                    </td>
                    <td class="p-3 text-center font-bold">${teacherCount}</td>
                    <td class="p-3 text-center text-green-600 font-bold">${evaluatedCount}</td>
                    <td class="p-3 text-center text-red-500 font-bold">${notEvaluatedCount}</td>
                    <td class="p-3 text-center">${overallStatus}</td>
                </tr>
            `;
        }

        subTableHtml += `</tbody></table></div></div>`;

        // ✅ สรุปผลรวม
        const summaryHtml = `
            <div class="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div class="bg-indigo-50 p-3 rounded-lg text-center border border-indigo-200">
                    <p class="text-xs text-gray-500">ชุดหลัก</p>
                    <p class="text-2xl font-bold text-indigo-600">${mainGroups.length}</p>
                </div>
                <div class="bg-gray-50 p-3 rounded-lg text-center border border-gray-200">
                    <p class="text-xs text-gray-500">ชุดย่อย</p>
                    <p class="text-2xl font-bold text-gray-700">${subGroups.length}</p>
                </div>
                <div class="bg-green-50 p-3 rounded-lg text-center border border-green-200">
                    <p class="text-xs text-gray-500">ประเมินแล้ว</p>
                    <p class="text-2xl font-bold text-green-600">${totalEvaluated}</p>
                </div>
                <div class="bg-yellow-50 p-3 rounded-lg text-center border border-yellow-200">
                    <p class="text-xs text-gray-500">ยังไม่ประเมิน</p>
                    <p class="text-2xl font-bold text-yellow-600">${totalNotEvaluated}</p>
                </div>
            </div>
        `;

        document.getElementById('completenessModalBody').innerHTML = summaryHtml + mainTableHtml + subTableHtml;

    } catch (err) {
        console.error('Error checking completeness:', err);
        document.getElementById('completenessModalBody').innerHTML = `
            <div class="text-center py-8 text-red-400">
                <i class="fa-solid fa-circle-exclamation text-2xl mb-2"></i>
                <p>เกิดข้อผิดพลาด: ${err.message}</p>
                <button onclick="closeCompletenessModal()" 
                        class="mt-4 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold transition-colors">
                    ปิด
                </button>
            </div>
        `;
    }
}

// ==========================================
// ปิด Modal ตรวจสอบความครบถ้วน
// ==========================================
function closeCompletenessModal() {
    const modal = document.getElementById('completenessModal');
    if (modal) {
        modal.classList.add('hidden');

        // ✅ ลบ Modal ออกจาก DOM
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 100); // ลดเวลาเหลือ 100ms เพื่อให้ปิดไวขึ้น
    } else {
        // ถ้าหา Modal ไม่เจอ (เผื่อซ่อนอยู่) ให้ค้นหาจาก document
        const existingModal = document.querySelector('.fixed.inset-0.z-50');
        if (existingModal) {
            existingModal.remove();
        }
    }
}

// ==========================================
// EXPOSE GROUPS FUNCTIONS
// ==========================================
window.loadGroupsTable = loadGroupsTable;
window.loadGroups = loadGroups;
window.openGroupModal = openGroupModal;
window.closeGroupModal = closeGroupModal;
window.editGroup = editGroup;
window.populatePersonnelSelect = populatePersonnelSelect;
window.populateDepartmentCheckboxes = populateDepartmentCheckboxes;
window.toggleAllDepartments = toggleAllDepartments;
window.renderSubItems = renderSubItems;
window.toggleAllSubItems = toggleAllSubItems;
window.toggleGroupStatus = toggleGroupStatus;
window.deleteGroup = deleteGroup;
window.copySubItemsToAllSubGroups = copySubItemsToAllSubGroups;
window.checkEvaluationCompleteness = checkEvaluationCompleteness;
window.closeCompletenessModal = closeCompletenessModal;

console.log('✅ evaluation_admin_groups.js loaded successfully');