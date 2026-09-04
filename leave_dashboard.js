// =======================================================
// ฟังก์ชันแสดงการลาทุกประเภท (วันนี้ / สัปดาห์นี้)
// =======================================================
async function loadSickLeaveWidget() {
    try {
        const today = new Date();

        // ✅ ใช้ toLocaleDateString('sv-SE') เพื่อให้ได้วันที่ตามเวลาท้องถิ่น (YYYY-MM-DD)
        const todayStr = today.toLocaleDateString('sv-SE');

        // คำนวณวันเริ่มต้นสัปดาห์ (วันจันทร์)
        const startOfWeek = new Date(today);
        const dayOfWeek = today.getDay(); // 0=อาทิตย์, 1=จันทร์ ...
        const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startOfWeek.setDate(today.getDate() - diffToMonday);
        const startWeekStr = startOfWeek.toLocaleDateString('sv-SE');

        // คำนวณวันสิ้นสุดสัปดาห์ (วันอาทิตย์)
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        const endWeekStr = endOfWeek.toLocaleDateString('sv-SE');

        // แสดงช่วงวันที่
        const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
        const fmtDate = (d) => {
            const dt = new Date(d);
            return `${dt.getDate()} ${monthNames[dt.getMonth()]} ${dt.getFullYear() + 543}`;
        };
        document.getElementById('sick-today-date').textContent = fmtDate(todayStr);
        document.getElementById('sick-week-range').textContent = `${fmtDate(startWeekStr)} - ${fmtDate(endWeekStr)}`;

        // ---- 1. ดึงข้อมูลการลาทุกประเภท (วันนี้) ----
        const { data: todayData, error: err1 } = await db
            .from('leave_requests')
            .select('*, core_personnel(prefix, first_name, last_name, department)')
            .in('status', ['อนุมัติ', 'รออนุมัติ'])
            .lte('start_date', todayStr)
            .gte('end_date', todayStr);

        if (err1) throw err1;

        // ---- 2. ดึงข้อมูลการลาทุกประเภท (สัปดาห์นี้) ----
        const { data: weekData, error: err2 } = await db
            .from('leave_requests')
            .select('*, core_personnel(prefix, first_name, last_name, department)')
            .in('status', ['อนุมัติ', 'รออนุมัติ'])
            .lte('start_date', endWeekStr)
            .gte('end_date', startWeekStr);

        if (err2) throw err2;

        // ---- 3. แสดงผล ----
        renderSickLeaveWidget(todayData || [], weekData || []);

    } catch (error) {
        console.error('เกิดข้อผิดพลาดในการโหลดข้อมูลการลา:', error);
        document.getElementById('sick-leave-today').innerHTML = '<p class="text-red-500 text-sm"><i class="fa-solid fa-triangle-exclamation mr-1"></i> โหลดข้อมูลไม่สำเร็จ</p>';
        document.getElementById('sick-leave-week').innerHTML = '<p class="text-red-500 text-sm"><i class="fa-solid fa-triangle-exclamation mr-1"></i> โหลดข้อมูลไม่สำเร็จ</p>';
    }
}

function renderSickLeaveWidget(todayList, weekList) {
    // ฟังก์ชันแปลงประเภทการลาเป็นสี
    function getTypeBadge(type) {
        const typeMap = {
            'ลาป่วย': 'bg-blue-100 text-blue-700',
            'ลากิจส่วนตัว': 'bg-orange-100 text-orange-700',
            'ลาคลอดบุตร': 'bg-rose-100 text-rose-700',
            'ลาไปช่วยเหลือภริยาที่คลอดบุตร': 'bg-purple-100 text-purple-700',
            'ลาพักผ่อน': 'bg-emerald-100 text-emerald-700',
            'ลาอุปสมบทหรือการไปประกอบพิธีฮัจย์': 'bg-amber-100 text-amber-700',
            'ลาเข้ารับการตรวจเลือกหรือเข้ารับการเตรียมพล': 'bg-indigo-100 text-indigo-700',
            'ลาไปศึกษา ฝึกอบรม ปฏิบัติการวิจัย หรือดูงาน': 'bg-cyan-100 text-cyan-700',
            'ลาไปปฏิบัติงานในองค์การระหว่างประเทศ': 'bg-teal-100 text-teal-700',
            'ลาติดตามคู่สมรส': 'bg-pink-100 text-pink-700',
            'ลาไปฟื้นฟูสมรรถภาพด้านอาชีพ': 'bg-violet-100 text-violet-700'
        };
        return typeMap[type] || 'bg-gray-100 text-gray-700';
    }

    // ---- วันนี้ ----
    const todayContainer = document.getElementById('sick-leave-today');
    if (todayList.length === 0) {
        todayContainer.innerHTML = `<p class="text-emerald-600 text-sm"><i class="fa-regular fa-circle-check mr-1"></i> ไม่มีการลาในวันนี้</p>`;
    } else {
        let html = '<ul class="space-y-1.5">';
        todayList.forEach(item => {
            const name = `${item.core_personnel.prefix || ''}${item.core_personnel.first_name} ${item.core_personnel.last_name}`;
            const dept = item.core_personnel.department || '-';
            const typeLabel = item.type;
            const typeClass = getTypeBadge(typeLabel);
            const statusIcon = item.status === 'อนุมัติ' ? '✅' : '⏳';
            const statusText = item.status === 'อนุมัติ' ? 'อนุมัติ' : 'รออนุมัติ';
            html += `<li class="text-sm flex flex-wrap justify-between items-center hover:bg-gray-50 px-2 py-1 rounded-lg gap-1">
                <span class="font-medium text-gray-700">${name}</span>
                <span class="flex items-center gap-1 flex-wrap">
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded-full ${typeClass}">${typeLabel}</span>
                    <span class="text-xs text-gray-400 flex items-center gap-1">${statusIcon} ${statusText}</span>
                    <span class="text-xs text-gray-300">|</span>
                    <span class="text-xs text-gray-400">${dept}</span>
                </span>
            </li>`;
        });
        html += '</ul>';
        todayContainer.innerHTML = html;
    }

    // ---- สัปดาห์นี้ ----
    const weekContainer = document.getElementById('sick-leave-week');
    if (weekList.length === 0) {
        weekContainer.innerHTML = `<p class="text-emerald-600 text-sm"><i class="fa-regular fa-circle-check mr-1"></i> ไม่มีการลาในสัปดาห์นี้</p>`;
    } else {
        // จัดกลุ่มตามวัน (เรียงตามวันที่)
        const grouped = {};
        weekList.forEach(item => {
            const key = item.start_date;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(item);
        });
        const sortedKeys = Object.keys(grouped).sort();

        let html = '<ul class="space-y-2 max-h-[200px] overflow-y-auto pr-1">';
        sortedKeys.forEach(date => {
            const items = grouped[date];
            const d = new Date(date);
            const dateLabel = `${d.getDate()} ${['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'][d.getMonth()]}`;
            html += `<li class="text-xs font-bold text-gray-400 border-b border-gray-100 pb-1 pt-1">📅 ${dateLabel}</li>`;
            items.forEach(item => {
                const name = `${item.core_personnel.prefix || ''}${item.core_personnel.first_name} ${item.core_personnel.last_name}`;
                const typeLabel = item.type;
                const typeClass = getTypeBadge(typeLabel);
                const statusIcon = item.status === 'อนุมัติ' ? '✅' : '⏳';
                html += `<li class="text-sm flex justify-between items-center pl-3 py-0.5 gap-1">
                    <span class="text-gray-700">${name}</span>
                    <span class="flex items-center gap-1">
                        <span class="px-1.5 py-0.5 text-[9px] font-bold rounded-full ${typeClass}">${typeLabel}</span>
                        <span class="text-xs text-gray-400">${statusIcon}</span>
                    </span>
                </li>`;
            });
        });
        html += '</ul>';
        weekContainer.innerHTML = html;
    }
}