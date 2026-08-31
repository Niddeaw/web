// ==========================================
// evaluation_ui.js - UI, Wizard, Form, Submit
// ==========================================

// ==========================================
// ตัวแปรระดับ Global ที่ใช้ใน UI
// ==========================================
let wizardCurrentStep = 1;
let evaluateeData = null;
let evaluationMode = 'self'; // 'self' หรือ 'committee'
let isEditingMode = false;
window._existingEvalId = null; // เก็บ ID ของการประเมินที่กำลังแก้ไข

// ==========================================
// ฟังก์ชันตรวจสอบว่าขั้นตอนมีเนื้อหาหรือไม่
// ==========================================
function checkStepHasContent(step) {
    if (step === 1) return window._hasElement1 === true;
    if (step === 2) return window._hasElement2 === true;
    if (step === 3) return window._hasElement3 === true;
    if (step === 4) return true;
    return false;
}

// ==========================================
// ฟังก์ชันเปลี่ยนขั้นตอน (ปรับให้ข้ามขั้นตอนว่าง)
// ==========================================
function changeStep(direction) {
    if (direction === 1) {
        // ตรวจสอบเฉพาะเมื่อมีองค์ประกอบที่ 1
        if (wizardCurrentStep === 1 && window._hasElement1) {
            const p1s1Groups = document.querySelectorAll('#step1 input[name^="p1s1_"]');
            const p1s2Groups = document.querySelectorAll('#step1 input[name^="p1s2_"]');
            let missing = false;
            const groupNames = new Set();
            p1s1Groups.forEach(el => groupNames.add(el.name));
            p1s2Groups.forEach(el => groupNames.add(el.name));

            if (groupNames.size > 0) {
                const missingItems = [];
                groupNames.forEach(name => {
                    const checked = document.querySelector(`#step1 input[name="${name}"]:checked`);
                    if (!checked) {
                        missing = true;
                        missingItems.push(name);
                    }
                });
                if (missing) {
                    return Swal.fire({
                        icon: 'warning',
                        title: 'กรุณาให้คะแนนองค์ประกอบที่ 1 ให้ครบทุกข้อ',
                        html: `ยังไม่เลือก: <b>${missingItems.join(', ')}</b>`,
                        confirmButtonText: 'ตกลง'
                    });
                }
            }
        }

        if (wizardCurrentStep === 2 && window._hasElement2) {
            const p2Inputs = document.querySelectorAll('#step2 input[name="sc_part2"]');
            if (p2Inputs.length > 0) {
                const p2Checked = document.querySelector('#step2 input[name="sc_part2"]:checked');
                if (!p2Checked) {
                    return Swal.fire('แจ้งเตือน', 'กรุณาเลือกระดับความสำเร็จองค์ประกอบที่ 2', 'warning');
                }
            }
        }

        if (wizardCurrentStep === 3 && window._hasElement3) {
            const p3Groups = document.querySelectorAll('#step3 input[name^="p3_"]');
            if (p3Groups.length > 0) {
                const groupNames3 = new Set();
                p3Groups.forEach(el => groupNames3.add(el.name));
                let missingP3 = false;
                const missingItems3 = [];
                groupNames3.forEach(name => {
                    const checked = document.querySelector(`#step3 input[name="${name}"]:checked`);
                    if (!checked) {
                        missingP3 = true;
                        missingItems3.push(name);
                    }
                });
                if (missingP3) {
                    return Swal.fire({
                        icon: 'warning',
                        title: 'กรุณาให้คะแนนส่วนที่ 3 ให้ครบทุกข้อ',
                        html: `ยังไม่เลือก: <b>${missingItems3.join(', ')}</b>`,
                        confirmButtonText: 'ตกลง'
                    });
                }
            }
        }
    }

    // ซ่อนขั้นตอนปัจจุบัน
    document.getElementById(`step${wizardCurrentStep}`).classList.remove('active');
    wizardCurrentStep += direction;

    // ข้ามขั้นตอนที่ไม่มีเนื้อหา
    while (wizardCurrentStep >= 1 && wizardCurrentStep <= 4) {
        const hasContent = checkStepHasContent(wizardCurrentStep);
        if (!hasContent && wizardCurrentStep < 4 && direction === 1) {
            wizardCurrentStep++;
        } else if (!hasContent && wizardCurrentStep > 1 && direction === -1) {
            wizardCurrentStep--;
        } else {
            break;
        }
    }

    // แสดงขั้นตอนใหม่
    document.getElementById(`step${wizardCurrentStep}`).classList.add('active');

    if (wizardCurrentStep === 4) {
        updateSummary();
    }

    updateWizardUI();
}

// ==========================================
// อัปเดต UI Wizard (ปรับให้แสดงปุ่มตามเนื้อหา)
// ==========================================
function updateWizardUI() {
    const totalSteps = 4;
    document.getElementById('currentStepText').innerText = wizardCurrentStep;
    document.getElementById('progressBar').style.width = `${(wizardCurrentStep / totalSteps) * 100}%`;

    // ปุ่มย้อนกลับ
    document.getElementById('btnPrev').classList.toggle('hidden', wizardCurrentStep === 1);

    // ปุ่มถัดไป
    const nextBtn = document.getElementById('btnNext');
    if (nextBtn) {
        let nextStep = wizardCurrentStep + 1;
        while (nextStep <= 4 && !checkStepHasContent(nextStep)) {
            nextStep++;
        }
        const hasNext = nextStep <= 4;

        if (wizardCurrentStep < 4 && hasNext) {
            nextBtn.classList.remove('hidden');
            let hasItems = false;
            if (wizardCurrentStep === 1) hasItems = window._hasElement1 === true;
            else if (wizardCurrentStep === 2) hasItems = window._hasElement2 === true;
            else if (wizardCurrentStep === 3) hasItems = window._hasElement3 === true;

            if (!hasItems) {
                nextBtn.innerHTML = 'ข้าม <i class="fa-solid fa-forward-step ml-1"></i>';
                nextBtn.className = 'bg-gray-400 hover:bg-gray-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-colors ml-auto';
            } else {
                nextBtn.innerHTML = 'ถัดไป <i class="fa-solid fa-chevron-right ml-1"></i>';
                nextBtn.className = 'bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-colors ml-auto';
            }
        } else {
            nextBtn.classList.add('hidden');
        }
    }

    // ปุ่มบันทึก
    const submitBtn = document.getElementById('btnSubmit');
    if (isEditingMode && submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-pen-to-square mr-1"></i> บันทึกการแก้ไข';
        submitBtn.classList.remove('bg-emerald-600', 'hover:bg-emerald-700');
        submitBtn.classList.add('bg-amber-600', 'hover:bg-amber-700');
        submitBtn.classList.remove('hidden');
    } else if (submitBtn) {
        submitBtn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> บันทึกผลการประเมิน';
        submitBtn.classList.remove('bg-amber-600', 'hover:bg-amber-700');
        submitBtn.classList.add('bg-emerald-600', 'hover:bg-emerald-700');
        // แสดงปุ่มบันทึกเฉพาะขั้นตอนสุดท้ายที่มีเนื้อหา
        let lastStep = 4;
        while (lastStep > 1 && !checkStepHasContent(lastStep)) {
            lastStep--;
        }
        submitBtn.classList.toggle('hidden', wizardCurrentStep !== lastStep);
    }
}

// ==========================================
// ฟังก์ชันคำนวณคะแนนรวม (Real-time)
// ==========================================
function calculateLiveTotal() {
    if (!evaluateeData) return 0;

    const academic = evaluateeData.academic_standing || 'ไม่มีวิทยฐานะ';
    const isAssistant = academic === 'ครูผู้ช่วย';

    let part1Total = 0;
    let part2Total = 0;
    let part3Total = 0;

    let p1s1Raw = 0;
    const p1s1Inputs = document.querySelectorAll('input[name^="p1s1_"]:checked');
    if (p1s1Inputs.length > 0) {
        p1s1Inputs.forEach(el => {
            p1s1Raw += parseInt(el.value) || 0;
        });
        if (isAssistant) {
            part1Total += (p1s1Raw * 80) / 56;
        } else {
            part1Total += (p1s1Raw / 60) * 60;
        }
    }

    let p1s2Raw = 0;
    const p1s2Inputs = document.querySelectorAll('input[name^="p1s2_"]:checked');
    if (p1s2Inputs.length > 0) {
        p1s2Inputs.forEach(el => {
            let val = parseInt(el.value) || 0;
            let max = parseInt(el.getAttribute('data-max')) || 0;
            p1s2Raw += (val * 0.25) * max;
        });
        part1Total += (p1s2Raw * 20) / 40;
    }

    const p2Inputs = document.querySelectorAll('input[name="sc_part2"]');
    if (p2Inputs.length > 0) {
        const p2Checked = document.querySelector('input[name="sc_part2"]:checked');
        if (p2Checked) {
            const p2Val = parseFloat(p2Checked.value) || 0;
            part2Total = p2Val * 2;
        }
    }

    let p3Raw = 0;
    const p3Inputs = document.querySelectorAll('input[name^="p3_"]:checked');
    if (p3Inputs.length > 0) {
        p3Inputs.forEach(el => {
            p3Raw += parseInt(el.value) || 0;
        });
        part3Total = p3Raw / 4;
    }

    const grandTotal = part1Total + part2Total + part3Total;

    const display = document.getElementById('liveTotalScoreDisplay');
    if (display) {
        display.innerHTML = `${grandTotal.toFixed(2)} <span class="text-xs font-normal text-gray-500 ml-1">/ 100</span>`;
        display.classList.add('scale-110', 'text-emerald-500');
        setTimeout(() => { display.classList.remove('scale-110', 'text-emerald-500'); }, 200);
    }

    return grandTotal;
}

// ==========================================
// ฟังก์ชันอัปเดตสรุปคะแนน (Step 4)
// ==========================================
function updateSummary() {
    if (!evaluateeData) return;

    const academic = evaluateeData.academic_standing || 'ไม่มีวิทยฐานะ';
    const isAssistant = academic === 'ครูผู้ช่วย';

    let p1s1Raw = 0;
    document.querySelectorAll('input[name^="p1s1_"]:checked').forEach(el => {
        p1s1Raw += parseInt(el.value) || 0;
    });

    let p1s1Final = 0;
    if (isAssistant) {
        p1s1Final = (p1s1Raw * 80) / 56;
    } else {
        p1s1Final = (p1s1Raw / 60) * 60;
    }

    let p1s2Raw = 0;
    document.querySelectorAll('input[name^="p1s2_"]:checked').forEach(el => {
        let val = parseInt(el.value) || 0;
        let max = parseInt(el.getAttribute('data-max')) || 0;
        p1s2Raw += (val * 0.25) * max;
    });
    let p1s2Final = (p1s2Raw * 20) / 40;

    let part1Total = p1s1Final + p1s2Final;

    const p2Checked = document.querySelector('input[name="sc_part2"]:checked');
    const p2Val = p2Checked ? parseFloat(p2Checked.value) : 0;
    const hasPart2 = document.querySelectorAll('input[name="sc_part2"]').length > 0;
    const part2Total = hasPart2 ? p2Val * 2 : 0;

    let p3Raw = 0;
    document.querySelectorAll('input[name^="p3_"]:checked').forEach(el => {
        p3Raw += parseInt(el.value) || 0;
    });
    const hasPart3 = document.querySelectorAll('input[name^="p3_"]').length > 0;
    const part3Total = hasPart3 ? p3Raw / 4 : 0;

    let grandTotal = part1Total;
    if (hasPart2) grandTotal += part2Total;
    if (hasPart3) grandTotal += part3Total;

    document.getElementById('summary_evaluatee_name').innerText =
        `${evaluateeData.first_name} ${evaluateeData.last_name}`;
    document.getElementById('summary_academic_standing').innerText = academic;
    document.getElementById('summary_term').innerText =
        `ภาคเรียนที่ ${currentTermData.current_semester} / ${currentTermData.current_academic_year}`;

    document.getElementById('summary_part1_score').innerText = part1Total.toFixed(2);
    document.getElementById('summary_part1_sec1').innerText = p1s1Final.toFixed(2);
    document.getElementById('summary_part1_sec2').innerText = p1s2Final.toFixed(2);

    const part2Section = document.getElementById('summary_part2_score')?.parentElement?.parentElement;
    if (part2Section) {
        if (hasPart2) {
            part2Section.style.display = 'block';
            document.getElementById('summary_part2_score').innerText = part2Total.toFixed(2);
            const levelText = {
                0: 'ยังไม่ประเมิน',
                1: 'ระดับ 1 (ต่ำกว่าร้อยละ 19.99)',
                2: 'ระดับ 2 (ร้อยละ 20.00 - 39.99)',
                3: 'ระดับ 3 (ร้อยละ 40.00 - 59.99)',
                4: 'ระดับ 4 (ร้อยละ 60.00 - 79.99)',
                5: 'ระดับ 5 (ร้อยละ 80.00 ขึ้นไป)'
            };
            document.getElementById('summary_part2_level').innerText = levelText[p2Val] || '-';
        } else {
            part2Section.style.display = 'none';
        }
    }

    const part3Section = document.getElementById('summary_part3_score')?.parentElement?.parentElement;
    if (part3Section) {
        if (hasPart3) {
            part3Section.style.display = 'block';
            document.getElementById('summary_part3_score').innerText = part3Total.toFixed(2);
            document.getElementById('summary_part3_raw').innerText = p3Raw;
        } else {
            part3Section.style.display = 'none';
        }
    }

    document.getElementById('summary_total_score').innerText = grandTotal.toFixed(2);

    let grade = '';
    let statusIcon = '';
    if (grandTotal >= 80) {
        grade = 'ดีมาก';
        statusIcon = '<i class="fa-solid fa-circle-check text-emerald-300"></i>';
    } else if (grandTotal >= 70) {
        grade = 'ดี';
        statusIcon = '<i class="fa-solid fa-circle-check text-blue-300"></i>';
    } else if (grandTotal >= 60) {
        grade = 'พอใช้';
        statusIcon = '<i class="fa-solid fa-circle-exclamation text-yellow-300"></i>';
    } else if (grandTotal > 0) {
        grade = 'ควรปรับปรุง';
        statusIcon = '<i class="fa-solid fa-circle-xmark text-red-300"></i>';
    } else {
        grade = 'ยังไม่ประเมิน';
        statusIcon = '<i class="fa-solid fa-clock text-gray-300"></i>';
    }
    document.getElementById('summary_grade').innerText = grade;
    document.getElementById('summary_status_icon').innerHTML = statusIcon;
}

// ==========================================
// ✅ ฟังก์ชันสร้าง UI แบบ Dynamic (ฉบับสมบูรณ์)
// ==========================================
// ==========================================
// ✅ ฟังก์ชันสร้าง UI แบบ Dynamic (ฉบับสมบูรณ์ - แก้ไข)
// ==========================================
function generateDynamicForm(academicLevel, allowedSubItems = null) {
    console.log('📋 generateDynamicForm - academicLevel:', academicLevel);
    console.log('📋 generateDynamicForm - allowedSubItems:', allowedSubItems);

    // ✅ ใช้ Helper Function แทนการอ้าง evalCriteriaDB โดยตรง
    const criteriaSet = getCriteriaByAcademic(academicLevel);
    // ✅ ใช้ Helper Function ตรวจสอบครูผู้ช่วย
    const isAssistant = isAssistantTeacher(academicLevel);

    const allowedSet = new Set();
    const allowedPart2Set = new Set();
    const allowedPart3Set = new Set();
    let hasAnyElement1 = false;
    let hasAnyElement2 = false;
    let hasAnyElement3 = false;

    const isSelfMode = allowedSubItems === null;

    if (isSelfMode) {
        hasAnyElement1 = true;
        hasAnyElement2 = true;
        hasAnyElement3 = true;
        console.log('📋 โหมดประเมินตนเอง: แสดงทุกองค์ประกอบ');
    } else if (allowedSubItems && Array.isArray(allowedSubItems)) {
        allowedSubItems.forEach(item => {
            if (item.element === '1') {
                hasAnyElement1 = true;
                let convertedValue = item.value;
                if (convertedValue.includes('.')) {
                    convertedValue = convertedValue.replace('.', '_');
                }
                if (item.part === '1') {
                    allowedSet.add(convertedValue);
                    allowedSet.add(item.value);
                } else if (item.part === '2') {
                    allowedPart2Set.add(item.value);
                    if (item.value.includes('.')) {
                        allowedPart2Set.add(item.value.replace('.', '_'));
                    }
                }
            } else if (item.element === '2') {
                hasAnyElement2 = true;
            } else if (item.element === '3') {
                hasAnyElement3 = true;
                const idx = parseInt(item.value) - 1;
                if (!isNaN(idx) && idx >= 0 && idx < PART3_ITEMS.length) {
                    allowedPart3Set.add(idx);
                }
            }
        });
    }

    const isRestricted = allowedSubItems !== null && allowedSubItems.length > 0;

    window._hasElement1 = hasAnyElement1;
    window._hasElement2 = hasAnyElement2;
    window._hasElement3 = hasAnyElement3;

    console.log('✅ ตั้งค่า _hasElement1:', hasAnyElement1);
    console.log('✅ ตั้งค่า _hasElement2:', hasAnyElement2);
    console.log('✅ ตั้งค่า _hasElement3:', hasAnyElement3);

    // ==========================================
    // STEP 1: องค์ประกอบที่ 1
    // ==========================================
    let step1HTML = `
        <h3 class="text-lg font-bold text-blue-800 mb-4 border-b pb-2">ส่วนที่ 1: การประเมินประสิทธิภาพและประสิทธิผล (80 คะแนน)</h3>
        <p class="text-sm text-blue-600 mb-4">* ระบบตรวจพบวิทยฐานะ: <span class="font-bold">${academicLevel}</span></p>
    `;

    if (!hasAnyElement1 && !isSelfMode) {
        step1HTML += `
            <div class="bg-blue-50 p-6 rounded-xl text-center border border-blue-200">
                <div class="flex items-center justify-center gap-3 mb-2">
                    <i class="fa-solid fa-check-circle text-2xl text-blue-400"></i>
                    <span class="text-lg font-bold text-blue-600">✅ ไม่มีการประเมินองค์ประกอบที่ 1</span>
                </div>
                <p class="text-sm text-blue-500">ชุดคณะกรรมการนี้ไม่ได้รับมอบหมายให้ประเมินองค์ประกอบที่ 1</p>
                <p class="text-xs text-blue-400 mt-1">กรุณากดปุ่ม <span class="font-bold">"ถัดไป"</span> เพื่อข้ามขั้นตอนนี้</p>
            </div>
        `;
    } else if (hasAnyElement1) {
        step1HTML += `
            <div class="mb-4 bg-amber-50 p-3 rounded-xl border border-amber-200">
                <div class="flex items-center gap-2">
                    <i class="fa-solid fa-info-circle text-amber-500"></i>
                    <span class="text-sm text-amber-700 font-medium">กรุณาประเมินตามหัวข้อย่อยที่ได้รับมอบหมาย</span>
                </div>
                ${!isSelfMode ? `<p class="text-xs text-amber-500 mt-1 ml-6">หัวข้อย่อยที่ต้องประเมิน: ${allowedSubItems.filter(s => s.element === '1').map(s => s.value).join(', ')}</p>` : ''}
            </div>
            <div class="mb-4 bg-blue-100 p-3 rounded-xl border border-blue-200">
                <h4 class="font-bold text-blue-800"><i class="fa-solid fa-book-open text-blue-600 mr-2"></i>ตอนที่ 1 : ระดับความสำเร็จในการพัฒนางานตามมาตรฐานตำแหน่ง (${criteriaSet.part1_sec1_base} คะแนน)</h4>
                ${isAssistant ? `<p class="text-sm text-blue-600 mt-1">* ครูผู้ช่วย ใช้ฐานคะแนน 80 คะแนน (14 ข้อ)</p>` : `<p class="text-sm text-blue-600 mt-1">* ใช้ฐานคะแนน 60 คะแนน (15 ข้อ)</p>`}
            </div>
        `;

        let hasAnyItem = false;
        let totalItems = 0;

        criteriaSet.part1_sec1.forEach((group) => {
            let filteredItems = group.items;
            if (isRestricted) {
                filteredItems = group.items.filter(item => {
                    const dotVersion = item.id.replace('_', '.');
                    return allowedSet.has(item.id) || allowedSet.has(dotVersion);
                });
            }

            if (filteredItems.length === 0) return;
            hasAnyItem = true;
            totalItems += filteredItems.length;

            step1HTML += `<div class="bg-blue-50/50 border border-blue-100 rounded-xl p-5 mb-6">`;
            step1HTML += `<h4 class="font-bold text-blue-800 mb-4 border-b border-blue-200 pb-2">${group.group}</h4>`;

            filteredItems.forEach((item) => {
                step1HTML += `
                <div class="mb-5 bg-white p-4 rounded-lg shadow-sm border border-gray-100 transition-all hover:shadow-md">
                    <label class="block text-sm font-bold text-gray-800 mb-1">${item.label}</label>
                    <p class="text-xs text-gray-500 mb-3 leading-relaxed">${item.desc}</p>
                    <div class="flex items-center gap-4 flex-wrap">
                        <span class="text-xs font-bold text-gray-400">ให้คะแนน:</span>
                        <div class="flex gap-2">
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                <input type="radio" name="p1s1_${item.id}" value="1" class="live-calc p1s1-input w-4 h-4 text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-medium text-gray-700">1</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                <input type="radio" name="p1s1_${item.id}" value="2" class="live-calc p1s1-input w-4 h-4 text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-medium text-gray-700">2</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                <input type="radio" name="p1s1_${item.id}" value="3" class="live-calc p1s1-input w-4 h-4 text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-medium text-gray-700">3</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-blue-200">
                                <input type="radio" name="p1s1_${item.id}" value="4" class="live-calc p1s1-input w-4 h-4 text-blue-600 focus:ring-blue-500">
                                <span class="text-sm font-medium text-gray-700">4</span>
                            </label>
                        </div>
                    </div>
                </div>`;
            });
            step1HTML += `</div>`;
        });

        if (!hasAnyItem) {
            step1HTML += `
                <div class="bg-yellow-50 p-6 rounded-xl text-center border border-yellow-200">
                    <i class="fa-solid fa-triangle-exclamation text-2xl text-yellow-400 mb-2"></i>
                    <p class="text-yellow-700 font-medium">ไม่พบหัวข้อย่อยที่ตรงกับวิทยฐานะ ${academicLevel}</p>
                    <p class="text-xs text-yellow-500 mt-1">หัวข้อย่อยที่ได้รับมอบหมาย: ${allowedSubItems ? allowedSubItems.filter(s => s.element === '1' && s.part === '1').map(s => s.value).join(', ') : 'ไม่มี'}</p>
                    <p class="text-xs text-yellow-400 mt-2">กรุณาติดต่อผู้ดูแลระบบเพื่อตรวจสอบการตั้งค่า</p>
                </div>
            `;
        } else {
            step1HTML += `
                <div class="text-sm text-gray-400 text-center mt-2">
                    <i class="fa-solid fa-list-check mr-1"></i> จำนวนข้อที่ต้องประเมิน: <span class="font-bold text-blue-600">${totalItems}</span> ข้อ
                </div>
            `;
        }

        let hasPart2Items = false;
        let part2Items = [];
        if (isRestricted) {
            const part2Allowed = allowedSubItems.filter(s => s.element === '1' && s.part === '2');
            hasPart2Items = part2Allowed.length > 0;
            if (hasPart2Items) {
                const allowedIds = new Set();
                part2Allowed.forEach(s => {
                    allowedIds.add(s.value);
                    if (s.value.includes('.')) {
                        allowedIds.add(s.value.replace('.', '_'));
                    }
                });
                part2Items = criteriaSet.part1_sec2.filter(item => {
                    const mappedId = item.id === 's2_1' ? '1' :
                        item.id === 's2_2_1' ? '2.1' :
                            item.id === 's2_2_2' ? '2.2' : item.id;
                    const mappedIdUnderscore = mappedId.replace('.', '_');
                    return allowedIds.has(mappedId) || allowedIds.has(mappedIdUnderscore);
                });
                hasPart2Items = part2Items.length > 0;
            }
        } else if (!isRestricted) {
            hasPart2Items = criteriaSet.part1_sec2.length > 0;
            part2Items = criteriaSet.part1_sec2;
        }

        if (hasPart2Items && part2Items.length > 0) {
            step1HTML += `
                <div class="mt-8 mb-4 bg-indigo-100 p-3 rounded-xl border border-indigo-200">
                    <h4 class="font-bold text-indigo-800"><i class="fa-solid fa-bullseye text-indigo-600 mr-2"></i>ตอนที่ 2 : ระดับความสำเร็จในการพัฒนางานที่เสนอเป็นประเด็นท้าทาย (20 คะแนน)</h4>
                    <p class="text-xs text-indigo-500 mt-1">จำนวนข้อที่ต้องประเมิน: <span class="font-bold">${part2Items.length}</span> ข้อ</p>
                </div>
                <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-6">
            `;

            part2Items.forEach((item) => {
                step1HTML += `
                <div class="mb-5 bg-white p-4 rounded-lg shadow-sm border border-gray-100 transition-all hover:shadow-md">
                    <label class="block text-sm font-bold text-gray-800 mb-1">${item.label} (เต็ม ${item.max_raw} คะแนน)</label>
                    <p class="text-xs text-gray-500 mb-3 leading-relaxed">${item.desc}</p>
                    <div class="flex items-center gap-4 flex-wrap">
                        <span class="text-xs font-bold text-gray-400">ระดับคุณภาพ:</span>
                        <div class="flex gap-2">
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                                <input type="radio" name="p1s2_${item.id}" value="1" data-max="${item.max_raw}" class="live-calc p1s2-input w-4 h-4 text-indigo-600 focus:ring-indigo-500">
                                <span class="text-sm font-medium text-gray-700">ระดับ 1</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                                <input type="radio" name="p1s2_${item.id}" value="2" data-max="${item.max_raw}" class="live-calc p1s2-input w-4 h-4 text-indigo-600 focus:ring-indigo-500">
                                <span class="text-sm font-medium text-gray-700">ระดับ 2</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                                <input type="radio" name="p1s2_${item.id}" value="3" data-max="${item.max_raw}" class="live-calc p1s2-input w-4 h-4 text-indigo-600 focus:ring-indigo-500">
                                <span class="text-sm font-medium text-gray-700">ระดับ 3</span>
                            </label>
                            <label class="flex items-center gap-1.5 cursor-pointer hover:bg-indigo-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-indigo-200">
                                <input type="radio" name="p1s2_${item.id}" value="4" data-max="${item.max_raw}" class="live-calc p1s2-input w-4 h-4 text-indigo-600 focus:ring-indigo-500">
                                <span class="text-sm font-medium text-gray-700">ระดับ 4</span>
                            </label>
                        </div>
                    </div>
                </div>`;
            });
            step1HTML += `</div>`;
        } else if (isRestricted) {
            step1HTML += `
                <div class="mt-4 bg-gray-50 p-4 rounded-xl border border-gray-200 text-center">
                    <i class="fa-solid fa-check-circle text-green-400 mr-2"></i>
                    <span class="text-sm text-gray-500">ไม่มีการประเมินตอนที่ 2 ในชุดคณะกรรมการนี้</span>
                    <span class="text-xs text-gray-400 block mt-1">✔ ข้ามขั้นตอนนี้ได้</span>
                </div>
            `;
        }
    } else {
        step1HTML += `
            <div class="bg-yellow-50 p-6 rounded-xl text-center border border-yellow-200">
                <i class="fa-solid fa-triangle-exclamation text-2xl text-yellow-400 mb-2"></i>
                <p class="text-yellow-700 font-medium">ไม่พบข้อมูลการประเมิน</p>
                <p class="text-xs text-yellow-500 mt-1">กรุณาติดต่อผู้ดูแลระบบ</p>
            </div>
        `;
    }

    document.getElementById('step1').innerHTML = step1HTML;

    // ==========================================
    // STEP 2: องค์ประกอบที่ 2
    // ==========================================
    if (hasAnyElement2) {
        let step2HTML = `
            <h3 class="text-lg font-bold text-emerald-800 mb-4 border-b pb-2">ส่วนที่ 2: การประเมินการมีส่วนร่วมในการพัฒนาการศึกษา (10 คะแนน)</h3>
            <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
                ${!isSelfMode ? `
                <div class="mb-3 bg-emerald-100 p-2 rounded-lg">
                    <p class="text-sm text-emerald-700 font-medium"><i class="fa-solid fa-info-circle mr-2"></i>ท่านได้รับมอบหมายให้ประเมินองค์ประกอบที่ 2</p>
                </div>
                ` : `
                <div class="mb-3 bg-emerald-100 p-2 rounded-lg">
                    <p class="text-sm text-emerald-700 font-medium"><i class="fa-solid fa-info-circle mr-2"></i>ประเมินตนเอง องค์ประกอบที่ 2</p>
                </div>
                `}
                <label class="block text-sm font-bold text-gray-800 mb-3">ความสำเร็จของงานที่ได้รับมอบหมายจากผู้บังคับบัญชา</label>
                <div class="flex flex-wrap items-center gap-3">
                    <span class="text-xs font-bold text-gray-400">ระดับความสำเร็จ:</span>
                    <div class="flex flex-wrap gap-2">
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="1" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 1</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="2" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 2</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="3" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 3</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="4" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 4</span>
                        </label>
                        <label class="flex items-center gap-1.5 cursor-pointer hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors border border-transparent hover:border-emerald-200">
                            <input type="radio" name="sc_part2" value="5" class="live-calc p2-input w-4 h-4 text-emerald-600 focus:ring-emerald-500">
                            <span class="text-sm font-medium text-gray-700">ระดับ 5</span>
                        </label>
                    </div>
                </div>
                <div class="mt-3 text-xs text-gray-400 grid grid-cols-2 md:grid-cols-5 gap-1">
                    <span>ระดับ 1: ต่ำกว่าร้อยละ 19.99</span>
                    <span>ระดับ 2: ร้อยละ 20.00 - 39.99</span>
                    <span>ระดับ 3: ร้อยละ 40.00 - 59.99</span>
                    <span>ระดับ 4: ร้อยละ 60.00 - 79.99</span>
                    <span>ระดับ 5: ร้อยละ 80.00 ขึ้นไป</span>
                </div>
            </div>
        `;
        document.getElementById('step2').innerHTML = step2HTML;
    } else {
        document.getElementById('step2').innerHTML = `
            <div class="bg-gray-50 p-8 rounded-xl text-center border border-gray-200">
                <div class="flex items-center justify-center gap-3 mb-2">
                    <i class="fa-solid fa-check-circle text-2xl text-gray-400"></i>
                    <span class="text-lg font-bold text-gray-500">✅ ไม่มีการประเมินองค์ประกอบที่ 2</span>
                </div>
                <p class="text-sm text-gray-400">ชุดคณะกรรมการนี้ไม่ได้รับมอบหมายให้ประเมินองค์ประกอบที่ 2</p>
                <div class="mt-3 inline-block bg-blue-50 px-4 py-2 rounded-lg">
                    <span class="text-sm text-blue-500">👉 กดปุ่ม <span class="font-bold">"ถัดไป"</span> เพื่อข้ามขั้นตอนนี้</span>
                </div>
            </div>
        `;
    }

    // ==========================================
    // STEP 3: องค์ประกอบที่ 3
    // ==========================================
    if (hasAnyElement3) {
        let part3Items = PART3_ITEMS;
        if (isRestricted && allowedPart3Set.size > 0) {
            part3Items = PART3_ITEMS.filter((_, index) => allowedPart3Set.has(index));
        }

        let step3HTML = `
            <h3 class="text-lg font-bold text-purple-800 mb-4 border-b pb-2">ส่วนที่ 3: การประเมินการปฏิบัติตนในการรักษาวินัย คุณธรรม จริยธรรม (10 คะแนน)</h3>
            <div class="bg-purple-50 border border-purple-100 rounded-xl p-5">
                <div class="mb-3 bg-purple-100 p-2 rounded-lg">
                    <p class="text-sm text-purple-700 font-medium"><i class="fa-solid fa-info-circle mr-2"></i>ท่านได้รับมอบหมายให้ประเมินองค์ประกอบที่ 3 จำนวน ${part3Items.length} ข้อ</p>
                </div>
        `;

        if (part3Items.length === 0) {
            step3HTML += `
                <div class="text-center text-gray-400 py-4">
                    <i class="fa-solid fa-info-circle mr-2"></i>ไม่มีการประเมินองค์ประกอบที่ 3 ในชุดคณะกรรมการนี้
                </div>
            `;
        } else {
            part3Items.forEach((text, index) => {
                const realIndex = PART3_ITEMS.indexOf(text);
                step3HTML += `
                <div class="mb-4 bg-white p-3 rounded-lg shadow-sm border border-gray-100">
                    <label class="text-sm font-bold text-gray-800 flex-1 leading-relaxed block mb-2"><span class="text-purple-600 mr-1">${realIndex + 1}.</span> ${text}</label>
                    <div class="flex items-center gap-4 flex-wrap">
                        <span class="text-xs font-bold text-gray-400">คะแนน:</span>
                        <div class="flex gap-2">
                            <label class="flex items-center gap-1 cursor-pointer hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-purple-200">
                                <input type="radio" name="p3_${realIndex}" value="1" class="live-calc p3-input w-4 h-4 text-purple-600 focus:ring-purple-500">
                                <span class="text-sm font-medium text-gray-700">1</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-purple-200">
                                <input type="radio" name="p3_${realIndex}" value="2" class="live-calc p3-input w-4 h-4 text-purple-600 focus:ring-purple-500">
                                <span class="text-sm font-medium text-gray-700">2</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-purple-200">
                                <input type="radio" name="p3_${realIndex}" value="3" class="live-calc p3-input w-4 h-4 text-purple-600 focus:ring-purple-500">
                                <span class="text-sm font-medium text-gray-700">3</span>
                            </label>
                            <label class="flex items-center gap-1 cursor-pointer hover:bg-purple-50 px-2.5 py-1 rounded-lg transition-colors border border-transparent hover:border-purple-200">
                                <input type="radio" name="p3_${realIndex}" value="4" class="live-calc p3-input w-4 h-4 text-purple-600 focus:ring-purple-500">
                                <span class="text-sm font-medium text-gray-700">4</span>
                            </label>
                        </div>
                    </div>
                </div>`;
            });
        }
        step3HTML += `</div>`;
        document.getElementById('step3').innerHTML = step3HTML;
    } else {
        document.getElementById('step3').innerHTML = `
            <div class="bg-gray-50 p-8 rounded-xl text-center border border-gray-200">
                <div class="flex items-center justify-center gap-3 mb-2">
                    <i class="fa-solid fa-check-circle text-2xl text-gray-400"></i>
                    <span class="text-lg font-bold text-gray-500">✅ ไม่มีการประเมินองค์ประกอบที่ 3</span>
                </div>
                <p class="text-sm text-gray-400">ชุดคณะกรรมการนี้ไม่ได้รับมอบหมายให้ประเมินองค์ประกอบที่ 3</p>
                <div class="mt-3 inline-block bg-blue-50 px-4 py-2 rounded-lg">
                    <span class="text-sm text-blue-500">👉 กดปุ่ม <span class="font-bold">"ถัดไป"</span> เพื่อข้ามขั้นตอนนี้</span>
                </div>
            </div>
        `;
    }

    document.querySelectorAll('.live-calc').forEach(el => {
        el.addEventListener('change', calculateLiveTotal);
    });

    updateWizardUI();
}

// ==========================================
// ฟังก์ชันเริ่มการประเมิน (แก้ไขแล้ว)
// ==========================================
async function startEvaluation(type, teacherData = null) {
    if (window._viewOnly) {
        return Swal.fire({
            icon: 'info',
            title: 'โหมดดูข้อมูล',
            text: 'คุณอยู่ในโหมดดูข้อมูลเท่านั้น ไม่สามารถประเมินได้',
            confirmButtonText: 'ตกลง'
        });
    }

    try {
        if (!currentEvalRound) {
            return Swal.fire('แจ้งเตือน', 'ไม่พบรอบการประเมินที่เปิดใช้งาน', 'warning');
        }

        if (!systemConfigs) {
            await loadSystemConfigs();
        }

        const evalCheck = canEvaluate(type);
        if (!evalCheck.allowed) {
            return Swal.fire({
                icon: 'warning',
                title: '⚠️ ไม่สามารถประเมินได้',
                text: evalCheck.message,
                confirmButtonText: 'ตกลง'
            });
        }

        evaluationMode = type;
        isEditingMode = false;

        if (type === 'self') {
            evaluateeData = currentUser;
            document.getElementById('wizardTargetName').innerText =
                `ผู้รับการประเมิน: ${currentUser.first_name} ${currentUser.last_name}`;
        } else if (type === 'committee' && teacherData) {
            evaluateeData = teacherData;
            document.getElementById('wizardTargetName').innerText =
                `ผู้รับการประเมิน: ${teacherData.prefix || ''}${teacherData.first_name} ${teacherData.last_name}`;
        } else {
            return Swal.fire('แจ้งเตือน', 'ข้อมูลไม่ถูกต้อง กรุณาลองใหม่', 'warning');
        }

        // ✅ โหลดข้อมูลเดิมก่อนสร้างฟอร์ม (จะตั้งค่า isEditingMode และ _existingEvalId)
        let hasExisting = false;
        if (!window._existingEvalId && !isEditingMode) {
            hasExisting = await loadExistingEvaluation();
            // ถ้าผู้ใช้ยกเลิก จะ return false และเราไม่ต้องทำต่อ
            if (hasExisting === false) {
                return;
            }
        }

        let allowedSubItems = null;
        if (type === 'committee') {
            let subGroupId = null;
            if (typeof getSelectedSubGroupId === 'function') {
                subGroupId = getSelectedSubGroupId();
                allowedSubItems = getSelectedSubGroupItems() || [];
                console.log('📋 ได้จาก getter - subGroupId:', subGroupId, 'items:', allowedSubItems);
            } else {
                subGroupId = window._currentSubGroupId || null;
                allowedSubItems = window._currentSelectedItems || [];
                console.log('📋 ได้จาก fallback - subGroupId:', subGroupId, 'items:', allowedSubItems);
            }

            if (subGroupId && (!allowedSubItems || allowedSubItems.length === 0)) {
                try {
                    console.log('📥 ดึงข้อมูลจากฐานข้อมูลสำหรับชุดย่อย:', subGroupId);
                    const { data, error } = await db
                        .from('eval_committee_groups')
                        .select('selected_sub_items')
                        .eq('id', subGroupId)
                        .single();
                    if (!error && data) {
                        allowedSubItems = data.selected_sub_items || [];
                        console.log('✅ ดึงจากฐานข้อมูลสำเร็จ:', allowedSubItems);
                    } else {
                        console.warn('⚠️ ไม่พบข้อมูลในฐานข้อมูล', error);
                    }
                } catch (err) {
                    console.error('❌ Error fetching sub group items:', err);
                }
            }

            if (!allowedSubItems) allowedSubItems = [];
            console.log('📋 allowedSubItems สุดท้าย:', allowedSubItems);
        }

        const academic = evaluateeData.academic_standing || 'ครู';
        generateDynamicForm(academic, allowedSubItems);

        document.getElementById('dashboardView').classList.add('hidden');
        document.getElementById('wizardView').classList.remove('hidden');

        wizardCurrentStep = 1;
        updateWizardUI();

        // ✅ ถ้ามีการโหลดข้อมูลเดิม (แก้ไข) ให้โหลดคะแนนลงฟอร์มและข้ามการตรวจสอบการส่งแล้ว
        if (window._existingEvalId && isEditingMode) {
            // โหลดข้อมูลเดิมที่เรามีอยู่แล้ว (loadExistingEvaluation ได้ตั้งค่า window._existingEvalId)
            // แต่เรายังต้องโหลดคะแนน (ถ้าทำไม่ได้ ให้ดึงใหม่)
            if (!document.querySelector('input[name^="p1s1_"]:checked')) {
                // ถ้ายังไม่มีคะแนนในฟอร์ม ให้ลองโหลดอีกครั้ง
                const { data: existingEval } = await db
                    .from('eval_results')
                    .select('*')
                    .eq('id', window._existingEvalId)
                    .single();
                if (existingEval) {
                    loadScoresToForm(existingEval);
                }
            }
            // ไม่ต้องตรวจสอบ existingSubmitted
        } else if (!window._existingEvalId) {
            // ถ้ายังไม่มีข้อมูลเดิม (ไม่ใช่แก้ไข) ให้ตรวจสอบว่ามีการส่งแล้วหรือไม่
            const { data: existingSubmitted, error } = await db
                .from('eval_results')
                .select('id, total_score, detailed_scores, status')
                .eq('evaluatee_id', evaluateeData.id)
                .eq('eval_round_id', currentEvalRound.id)
                .eq('evaluator_id', currentUser.id)
                .eq('eval_type', type)
                .eq('status', 'submitted')
                .maybeSingle();

            if (existingSubmitted && !window._existingEvalId) {
                const result = await Swal.fire({
                    icon: 'info',
                    title: 'พบการประเมินที่ส่งแล้ว',
                    html: `
                        <p>คุณได้ส่งการประเมินนี้แล้ว</p>
                        <p class="text-sm text-gray-500">คะแนน: <b>${existingSubmitted.total_score.toFixed(2)}</b> / 100</p>
                        <p class="text-sm text-gray-500 mt-2">ต้องการดำเนินการอย่างไร?</p>
                    `,
                    showDenyButton: true,
                    confirmButtonText: '📝 แก้ไข',
                    denyButtonText: '🗑️ เริ่มใหม่',
                    cancelButtonText: '❌ ยกเลิก'
                });

                if (result.isConfirmed) {
                    window._existingEvalId = existingSubmitted.id;
                    isEditingMode = true;
                    loadScoresToForm(existingSubmitted);
                    Swal.fire('โหลดข้อมูลสำเร็จ', 'คุณสามารถแก้ไขคะแนนได้', 'success');
                } else if (result.isDenied) {
                    await db.from('eval_results').delete().eq('id', existingSubmitted.id);
                    window._existingEvalId = null;
                    isEditingMode = false;
                    resetForm();
                    Swal.fire('เริ่มใหม่', 'ลบข้อมูลเดิมเรียบร้อย', 'success');
                } else {
                    document.getElementById('dashboardView').classList.remove('hidden');
                    document.getElementById('wizardView').classList.add('hidden');
                    return;
                }
            }
        }

        console.log('✅ เริ่มการประเมิน:', type, evaluateeData.id);

    } catch (err) {
        console.error('Error starting evaluation:', err);
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// ฟังก์ชันเริ่มแก้ไขการประเมิน
// ==========================================
async function startEditEvaluation(evalId) {
    try {
        const { data: existingEval, error } = await db
            .from('eval_results')
            .select('*')
            .eq('id', evalId)
            .single();

        if (error) throw error;

        isEditingMode = true;
        window._existingEvalId = evalId;

        const { data: evaluatee } = await db
            .from('core_personnel')
            .select('*')
            .eq('id', existingEval.evaluatee_id)
            .single();

        evaluateeData = evaluatee;
        evaluationMode = existingEval.eval_type;

        document.getElementById('dashboardView').classList.add('hidden');
        document.getElementById('wizardView').classList.remove('hidden');
        document.getElementById('wizardTargetName').innerText = `ผู้รับการประเมิน: ${evaluatee.first_name} ${evaluatee.last_name}`;

        const academic = evaluatee.academic_standing || 'ไม่มีวิทยฐานะ';
        generateDynamicForm(academic);

        loadScoresToForm(existingEval);

        wizardCurrentStep = 1;
        updateWizardUI();

        Swal.fire({
            icon: 'info',
            title: 'โหมดแก้ไข',
            text: 'คุณกำลังแก้ไขการประเมินที่ส่งแล้ว กรุณาตรวจสอบข้อมูลและบันทึกใหม่',
            timer: 3000,
            showConfirmButton: true
        });

    } catch (err) {
        console.error('Error starting edit:', err);
        Swal.fire('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลสำหรับแก้ไขได้', 'error');
    }
}

// ==========================================
// ฟังก์ชันโหลดข้อมูลการประเมินเดิม
// ==========================================
async function loadExistingEvaluation() {
    try {
        if (!currentEvalRound?.id) return;

        const { data: existingEval, error } = await db
            .from('eval_results')
            .select('*')
            .eq('academic_year', currentTermData.current_academic_year)
            .eq('semester', currentTermData.current_semester)
            .eq('eval_round_id', currentEvalRound.id)
            .eq('evaluatee_id', evaluateeData.id)
            .eq('evaluator_id', currentUser.id)
            .eq('eval_type', evaluationMode)
            .maybeSingle();

        if (error) return;

        if (existingEval) {
            const p1s1Values = existingEval.detailed_scores?.p1_s1 || [];
            const p1s2Values = existingEval.detailed_scores?.p1_s2 || [];
            const p2Value = existingEval.detailed_scores?.p2 || 0;
            const p3Values = existingEval.detailed_scores?.p3 || [];

            let detailHtml = `
                <div class="text-left text-sm mt-2">
                    <p class="font-bold text-blue-600">คะแนนเดิม:</p>
                    <p class="text-gray-600">องค์ประกอบที่ 1: <b>${existingEval.total_score.toFixed(2)}</b> / 100</p>
                    <p class="text-gray-500 text-xs mt-1">ตอนที่ 1: ${p1s1Values.join(', ') || 'ยังไม่ประเมิน'}</p>
                    <p class="text-gray-500 text-xs">ตอนที่ 2: ${p1s2Values.join(', ') || 'ยังไม่ประเมิน'}</p>
                    <p class="text-gray-500 text-xs">องค์ประกอบที่ 2: ระดับ ${p2Value || 'ยังไม่ประเมิน'}</p>
                    <p class="text-gray-500 text-xs">องค์ประกอบที่ 3: ${p3Values.join(', ') || 'ยังไม่ประเมิน'}</p>
                    <p class="text-gray-500 text-xs mt-1">สถานะ: <b>${existingEval.status === 'draft' ? 'ร่าง' : 'ส่งแล้ว'}</b></p>
                </div>
            `;

            const result = await Swal.fire({
                icon: 'info',
                title: 'พบการประเมินเดิม',
                html: `
                    <p>คุณเคยประเมินบุคลากรนี้แล้วในภาคเรียนนี้</p>
                    ${detailHtml}
                    <p class="mt-3">ต้องการดำเนินการอย่างไร?</p>
                `,
                showDenyButton: true,
                showCancelButton: true,
                confirmButtonText: '✅ แก้ไขต่อ (โหลดข้อมูลเดิม)',
                denyButtonText: '🗑️ เริ่มใหม่ (ลบข้อมูลเดิม)',
                cancelButtonText: '❌ ยกเลิก',
                confirmButtonColor: '#3085d6',
                denyButtonColor: '#d33',
                cancelButtonColor: '#6c757d'
            });

            if (result.isConfirmed) {
                isEditingMode = true;
                window._existingEvalId = existingEval.id;
                loadScoresToForm(existingEval);
                return true;
            } else if (result.isDenied) {
                await db.from('eval_results').delete().eq('id', existingEval.id);
                window._existingEvalId = null;
                isEditingMode = false;
                resetForm();
                return false;
            } else {
                // ยกเลิก
                document.getElementById('dashboardView').classList.remove('hidden');
                document.getElementById('wizardView').classList.add('hidden');
                return false;
            }
        }
        return true;
    } catch (err) {
        console.error('Error in loadExistingEvaluation:', err);
        return true;
    }
}

// ==========================================
// ฟังก์ชันโหลดคะแนนเดิมใส่ฟอร์ม (ปรับปรุง)
// ==========================================
function loadScoresToForm(existingEval) {
    const detailedScores = existingEval.detailed_scores || {};
    console.log('📥 โหลดข้อมูลเดิม:', detailedScores);

    // ✅ รอให้ DOM พร้อม แล้วโหลดคะแนน
    setTimeout(() => {
        // องค์ประกอบที่ 1 ตอนที่ 1
        if (detailedScores.p1_s1 && Array.isArray(detailedScores.p1_s1)) {
            const p1s1Inputs = document.querySelectorAll('input[name^="p1s1_"]');
            const groups = {};
            p1s1Inputs.forEach(input => {
                if (!groups[input.name]) groups[input.name] = [];
                groups[input.name].push(input);
            });

            const sortedNames = Object.keys(groups).sort();
            sortedNames.forEach((name, index) => {
                if (index < detailedScores.p1_s1.length) {
                    const value = detailedScores.p1_s1[index];
                    if (value && value >= 1 && value <= 4) {
                        const radioToCheck = document.querySelector(`input[name="${name}"][value="${value}"]`);
                        if (radioToCheck) radioToCheck.checked = true;
                    }
                }
            });
        }

        // องค์ประกอบที่ 1 ตอนที่ 2
        if (detailedScores.p1_s2 && Array.isArray(detailedScores.p1_s2)) {
            const p1s2Inputs = document.querySelectorAll('input[name^="p1s2_"]');
            const groups = {};
            p1s2Inputs.forEach(input => {
                if (!groups[input.name]) groups[input.name] = [];
                groups[input.name].push(input);
            });

            const sortedNames = Object.keys(groups).sort();
            sortedNames.forEach((name, index) => {
                if (index < detailedScores.p1_s2.length) {
                    const value = detailedScores.p1_s2[index];
                    if (value && value >= 1 && value <= 4) {
                        const radioToCheck = document.querySelector(`input[name="${name}"][value="${value}"]`);
                        if (radioToCheck) radioToCheck.checked = true;
                    }
                }
            });
        }

        // องค์ประกอบที่ 2
        if (detailedScores.p2) {
            const p2Value = detailedScores.p2;
            const p2Input = document.querySelector(`input[name="sc_part2"][value="${p2Value}"]`);
            if (p2Input) p2Input.checked = true;
        }

        // องค์ประกอบที่ 3
        if (detailedScores.p3 && Array.isArray(detailedScores.p3)) {
            const p3Inputs = document.querySelectorAll('input[name^="p3_"]');
            const groups = {};
            p3Inputs.forEach(input => {
                if (!groups[input.name]) groups[input.name] = [];
                groups[input.name].push(input);
            });

            const sortedNames = Object.keys(groups).sort();
            sortedNames.forEach((name, index) => {
                if (index < detailedScores.p3.length) {
                    const value = detailedScores.p3[index];
                    if (value && value >= 1 && value <= 4) {
                        const radioToCheck = document.querySelector(`input[name="${name}"][value="${value}"]`);
                        if (radioToCheck) radioToCheck.checked = true;
                    }
                }
            });
        }

        // ✅ อัปเดตคะแนนรวม live และ UI
        setTimeout(() => {
            calculateLiveTotal();
            // ✅ อัปเดต UI เพื่อให้ปุ่มและขั้นตอนแสดงถูกต้อง
            updateWizardUI();
            console.log('✅ โหลดคะแนนเสร็จ, อัปเดต UI แล้ว');
        }, 50);

    }, 150); // เพิ่มเวลาเล็กน้อยเพื่อให้ DOM พร้อม
}

// ==========================================
// ฟังก์ชันรีเซ็ตฟอร์ม
// ==========================================
function resetForm() {
    document.querySelectorAll('input[type="radio"]').forEach(el => {
        el.checked = false;
    });

    const display = document.getElementById('liveTotalScoreDisplay');
    if (display) {
        display.innerHTML = `0.00 <span class="text-xs font-normal text-gray-500 ml-1">/ 100</span>`;
    }

    window._existingEvalId = null;
    isEditingMode = false;
}

// ==========================================
// ✅ ฟังก์ชันรีเฟรชตารางรายชื่อครู (หลังบันทึก/ลบ/แก้ไข) - ฉบับปรับปรุง v2
// ==========================================
async function refreshCommitteeTeacherList() {
    if (evaluationMode !== 'committee') return;

    let subGroupId = window._currentSubGroupId;
    let selectedItems = window._currentSelectedItems;
    let deptTargets = window._selectedSubGroupTargets?.filter(t => t.target_type === 'department') || [];

    // ✅ Fallback 1: ดึงจาก sessionStorage
    if (!subGroupId) {
        subGroupId = sessionStorage.getItem('lastCommitteeSubGroupId') || null;
    }
    if (!selectedItems || selectedItems.length === 0) {
        try {
            selectedItems = JSON.parse(sessionStorage.getItem('lastCommitteeSelectedItems') || '[]');
        } catch (e) {
            selectedItems = [];
        }
    }

    // ✅ Fallback 2: หา subGroupId จาก select ใน DOM
    if (!subGroupId) {
        const subGroupSelect = document.getElementById('subGroupSelect');
        if (subGroupSelect) subGroupId = subGroupSelect.value;
    }

    // ✅ Fallback 3: ดึงจาก memberships ของกรรมการ
    if (!subGroupId) {
        const evaluatorId = _impersonationMode ? _impersonatedEvaluatorId : currentUser.id;
        const { data: memberships } = await db
            .from('eval_committee_members')
            .select('committee_group_id')
            .eq('user_id', evaluatorId)
            .eq('is_active', true);
        if (memberships && memberships.length > 0) {
            subGroupId = memberships[0].committee_group_id;
        }
    }

    // ✅ ถ้าไม่มี deptTargets ให้ดึงจากฐานข้อมูลโดยใช้ subGroupId
    if (deptTargets.length === 0 && subGroupId) {
        try {
            const { data: subGroup, error } = await db
                .from('eval_committee_groups')
                .select('*, eval_committee_targets(*)')
                .eq('id', subGroupId)
                .single();

            if (!error && subGroup && subGroup.eval_committee_targets) {
                deptTargets = subGroup.eval_committee_targets.filter(t => t.target_type === 'department');
            }
        } catch (err) {
            console.error('Error fetching targets for refresh:', err);
        }
    }

    // ✅ ถ้าพบ deptTargets และ subGroupId ให้โหลดตารางครู
    if (deptTargets.length > 0 && subGroupId) {
        for (const t of deptTargets) {
            await loadTeachersForEvalBySubGroup(subGroupId, t.target_value, selectedItems, false);
        }
    } else {
        // แสดงข้อความแบบไม่รบกวน (ไม่ใช่ warning)
        console.log('ℹ️ ไม่พบกลุ่มเป้าหมายสำหรับรีเฟรชตารางครู (อาจไม่ได้อยู่ในหน้า committee)');
    }
}

// ==========================================
// ✅ Submit Evaluation
// ==========================================
async function submitEvaluation() {
    const evaluatorIdToUse = _impersonationMode ? _impersonatedEvaluatorId : currentUser.id;
    const evaluatorNameToUse = _impersonationMode ? _impersonatedEvaluatorName : currentUser.first_name + ' ' + currentUser.last_name;

    let missingP1 = false;
    const p1s1Groups = document.querySelectorAll('[name^="p1s1_"]');
    const p1s2Groups = document.querySelectorAll('[name^="p1s2_"]');

    const hasElement1 = p1s1Groups.length > 0 || p1s2Groups.length > 0;

    if (hasElement1) {
        const groupNames = new Set();
        p1s1Groups.forEach(el => groupNames.add(el.name));
        p1s2Groups.forEach(el => groupNames.add(el.name));

        groupNames.forEach(name => {
            const checked = document.querySelector(`input[name="${name}"]:checked`);
            if (!checked) missingP1 = true;
        });

        if (missingP1) {
            return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนองค์ประกอบที่ 1 ให้ครบทุกข้อ', 'warning');
        }
    }

    const p2Inputs = document.querySelectorAll('input[name="sc_part2"]');
    if (p2Inputs.length > 0) {
        const p2Checked = document.querySelector('input[name="sc_part2"]:checked');
        if (!p2Checked) {
            return Swal.fire('แจ้งเตือน', 'กรุณาเลือกระดับความสำเร็จองค์ประกอบที่ 2', 'warning');
        }
    }

    const p3Groups = document.querySelectorAll('[name^="p3_"]');
    if (p3Groups.length > 0) {
        const groupNames3 = new Set();
        p3Groups.forEach(el => groupNames3.add(el.name));

        let missingP3 = false;
        groupNames3.forEach(name => {
            const checked = document.querySelector(`input[name="${name}"]:checked`);
            if (!checked) missingP3 = true;
        });

        if (missingP3) {
            return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนส่วนที่ 3 ให้ครบทุกข้อ', 'warning');
        }
    }

    const hasAnyScore = p1s1Groups.length > 0 || p1s2Groups.length > 0 ||
        p2Inputs.length > 0 || p3Groups.length > 0;

    if (!hasAnyScore) {
        return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนอย่างน้อย 1 องค์ประกอบ', 'warning');
    }

    updateSummary();
    const total = calculateLiveTotal();

    const rawScores = {
        p1_s1: Array.from(document.querySelectorAll('input[name^="p1s1_"]:checked')).map(el => parseInt(el.value) || 0),
        p1_s2: Array.from(document.querySelectorAll('input[name^="p1s2_"]:checked')).map(el => parseInt(el.value) || 0),
    };

    const p2Checked = document.querySelector('input[name="sc_part2"]:checked');
    if (p2Checked) {
        rawScores.p2 = parseInt(p2Checked.value) || 0;
    }

    const p3Checked = document.querySelectorAll('input[name^="p3_"]:checked');
    if (p3Checked.length > 0) {
        rawScores.p3 = Array.from(p3Checked).map(el => parseInt(el.value) || 0);
    }

    const hasScores = rawScores.p1_s1.length > 0 || rawScores.p1_s2.length > 0 ||
        rawScores.p2 !== undefined || (rawScores.p3 && rawScores.p3.length > 0);

    if (!hasScores) {
        return Swal.fire('แจ้งเตือน', 'กรุณาให้คะแนนอย่างน้อย 1 องค์ประกอบ', 'warning');
    }

    Swal.fire({ title: 'กำลังบันทึกคะแนน...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
        const { data: existingEval, error: checkError } = await db
            .from('eval_results')
            .select('id')
            .eq('academic_year', currentTermData.current_academic_year)
            .eq('semester', currentTermData.current_semester)
            .eq('evaluatee_id', evaluateeData.id)
            .eq('evaluator_id', evaluatorIdToUse)
            .eq('eval_type', evaluationMode)
            .maybeSingle();

        if (checkError) throw checkError;

        const payload = {
            eval_round_id: currentEvalRound?.id || null,
            academic_year: currentTermData.current_academic_year,
            semester: currentTermData.current_semester,
            evaluatee_id: evaluateeData.id,
            evaluator_id: evaluatorIdToUse,
            eval_type: evaluationMode,
            total_score: total,
            detailed_scores: rawScores,
            status: 'submitted'
        };

        if (existingEval) {
            const { error: updateError } = await db
                .from('eval_results')
                .update(payload)
                .eq('id', existingEval.id);

            if (updateError) throw updateError;
        } else {
            const { error: insertError } = await db.from('eval_results').insert([payload]);
            if (insertError) throw insertError;
        }

        if (_impersonationMode) {
            await logUserAction(
                `impersonate_submit: super_admin บันทึกคะแนน ${total.toFixed(2)} ในนาม ${evaluatorNameToUse} (${evaluatorIdToUse}) สำหรับ ${evaluateeData.first_name} ${evaluateeData.last_name}`,
                'evaluation'
            );
        }

        Swal.close();

        await Swal.fire({
            icon: 'success',
            title: '✅ บันทึกผลสำเร็จ!',
            html: `
                <div class="text-left space-y-2">
                    <p><b>องค์ประกอบที่ 1:</b> ${document.getElementById('summary_part1_score').innerText || '0'} / 80</p>
                    ${document.querySelector('#summary_part2_score') ? `<p><b>องค์ประกอบที่ 2:</b> ${document.getElementById('summary_part2_score').innerText} / 10</p>` : ''}
                    ${document.querySelector('#summary_part3_score') ? `<p><b>องค์ประกอบที่ 3:</b> ${document.getElementById('summary_part3_score').innerText} / 10</p>` : ''}
                    <hr class="my-2">
                    <p class="text-lg font-bold text-blue-600">รวม: ${total.toFixed(2)} / 100</p>
                    <p class="text-sm text-gray-500">ระดับ: ${document.getElementById('summary_grade').innerText}</p>
                    ${_impersonationMode ? `<p class="text-xs text-orange-500 mt-2">⚠️ บันทึกในนาม: <b>${evaluatorNameToUse}</b></p>` : ''}
                </div>
            `,
            confirmButtonText: 'กลับหน้าหลัก'
        }).then(() => {
            if (_impersonationMode) {
                cancelImpersonation();
                window.location.reload();
            } else if (evaluationMode === 'committee') {
                document.getElementById('dashboardView').classList.remove('hidden');
                document.getElementById('wizardView').classList.add('hidden');

                // ✅ เก็บค่า subGroupId และ selectedItems ลง sessionStorage เพื่อใช้ตอนรีเฟรช
                if (window._currentSubGroupId) {
                    sessionStorage.setItem('lastCommitteeSubGroupId', window._currentSubGroupId);
                }
                if (window._currentSelectedItems) {
                    sessionStorage.setItem('lastCommitteeSelectedItems', JSON.stringify(window._currentSelectedItems));
                }

                setTimeout(() => {
                    refreshCommitteeTeacherList();
                }, 500);
            } else {
                window.location.reload();
            }
        });

    } catch (err) {
        console.error('Error:', err);
        Swal.close();
        Swal.fire('ผิดพลาด', err.message, 'error');
    }
}

// ==========================================
// Export UI Functions
// ==========================================
window.changeStep = changeStep;
window.updateWizardUI = updateWizardUI;
window.calculateLiveTotal = calculateLiveTotal;
window.updateSummary = updateSummary;
window.generateDynamicForm = generateDynamicForm;
window.startEvaluation = startEvaluation;
window.startEditEvaluation = startEditEvaluation;
window.loadExistingEvaluation = loadExistingEvaluation;
window.loadScoresToForm = loadScoresToForm;
window.resetForm = resetForm;
window.submitEvaluation = submitEvaluation;

console.log('✅ evaluation_ui.js loaded successfully');