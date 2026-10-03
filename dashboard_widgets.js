/* =======================================================
   dashboard_widgets.js — Calendar + Search
   ต้องโหลด calendar_manager.js ก่อน (getEventsByMonthYear)
   ======================================================= */

let dashCurrentYear = new Date().getFullYear() + 543;
let dashCurrentMonth = new Date().getMonth();

/* ---------- Populate year dropdown ---------- */
function populateYearSelect() {
    const yearSelect = document.getElementById('yearSelect');
    if (!yearSelect) return;
    const startYear = dashCurrentYear - 1;
    const endYear = dashCurrentYear + 3;
    yearSelect.innerHTML = '';
    for (let y = startYear; y <= endYear; y++) {
        const option = document.createElement('option');
        option.value = y;
        option.textContent = y;
        if (y === dashCurrentYear) option.selected = true;
        yearSelect.appendChild(option);
    }
}

/* ---------- Format วันที่แบบไทย ---------- */
function formatThaiDate(date) {
    if (!date || isNaN(date.getTime())) return '-';
    const day = date.getDate();
    const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
                        'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear() + 543;
    return `${day} ${month} ${year}`;
}

/* ---------- สี badge ตามกลุ่ม ---------- */
function getDeptColorClass(dept) {
    const colors = {
        academic:  'bg-blue-100 text-blue-700',
        budget:    'bg-green-100 text-green-700',
        personnel: 'bg-purple-100 text-purple-700',
        general:   'bg-orange-100 text-orange-700'
    };
    return colors[dept] || 'bg-gray-100 text-gray-700';
}

/* ---------- ชื่อกลุ่ม (ไทย) ---------- */
const DEPT_NAMES = {
    academic:  'วิชาการ',
    budget:    'แผนงานและงบประมาณ',
    personnel: 'บริหารงานบุคคล',
    general:   'บริหารทั่วไป'
};

/* ---------- โหลดปฏิทิน ---------- */
async function loadEventsByMonth() {
    const yearEl = document.getElementById('yearSelect');
    const monthEl = document.getElementById('monthSelect');
    const tbody = document.getElementById('calendarEventsTableBody');
    if (!yearEl || !monthEl || !tbody) return;

    const year = parseInt(yearEl.value);
    const month = parseInt(monthEl.value);
    if (isNaN(year) || isNaN(month)) return;

    tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400"><i class="fa-solid fa-circle-notch fa-spin mr-2"></i>กำลังโหลด...</td></tr>';

    try {
        const events = await getEventsByMonthYear(year, month);
        if (document.getElementById('statEvents')) {
            setStat('statEvents', events.length);
        }

        if (!events.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-500">ไม่มีกิจกรรมในเดือนนี้</td></tr>';
            return;
        }

        tbody.innerHTML = events.map(ev => {
            const startDate = new Date(ev.start_date);
            const deptLabel = DEPT_NAMES[ev.dept_key] || ev.dept_key;
            return `
                <tr class="border-b border-gray-100 hover:bg-gray-50 transition">
                    <td class="py-3 px-4 whitespace-nowrap">${formatThaiDate(startDate)}</td>
                    <td class="py-3 px-4"><span class="px-2 py-1 text-xs rounded-full whitespace-nowrap ${getDeptColorClass(ev.dept_key)}">${deptLabel}</span></td>
                    <td class="py-3 px-4 font-medium text-gray-800">${escapeHtml(ev.title)}</td>
                    <td class="py-3 px-4 text-gray-600">${typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(ev.description || '-') : (ev.description || '-')}</td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error(err);
        if (document.getElementById('statEvents')) setStat('statEvents', '-');
        tbody.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-red-500">ไม่สามารถโหลดข้อมูลได้</td></tr>';
    }
}

/* ---------- เปิดใช้งาน widget ทั้งหมด ---------- */
function initDashboardWidgets(options = {}) {
    populateYearSelect();

    const todayChip = document.getElementById('todayChip');
    if (todayChip) {
        todayChip.textContent = new Date().toLocaleDateString('th-TH', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
    }

    const monthEl = document.getElementById('monthSelect');
    if (monthEl) monthEl.value = dashCurrentMonth;

    const btn = document.getElementById('btnLoadCalendar');
    if (btn) btn.addEventListener('click', loadEventsByMonth);

    if (options.autoLoad !== false) {
        loadEventsByMonth();
    }
}