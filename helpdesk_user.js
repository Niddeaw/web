// ==========================================
// helpdesk_user.js — ระบบศูนย์ช่วยเหลือ (ผู้ใช้งาน)
// ปรับปรุง: ใช้ logUserAction, logout มาตรฐาน และตรวจสอบสิทธิ์แบบเดิม (ค้นหา core_personnel และ core_students)
// ==========================================

let currentUserId = null;
let currentUserType = 'student';
let currentTicketId = null;
let isBanned = false;
let currentUserRole = 'student';

// ==========================================
// LOGOUT (มาตรฐานกลาง)
// ==========================================
async function logout() {
    const { isConfirmed } = await Swal.fire({
        title: 'ออกจากระบบ?',
        text: "คุณต้องการออกจากระบบใช่หรือไม่",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#64748b',
        confirmButtonText: 'ออกจากระบบ',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        await db.auth.signOut();
        window.location.replace("login.html");
    }
}

// ==========================================
// ฟังก์ชันกลับหน้า
// ==========================================
function goBack() {
    if (currentUserType === 'teacher') {
        window.location.replace('index.html');
    } else {
        window.location.replace('student_index.html');
    }
}

// ==========================================
// INIT — ตรวจสอบสิทธิ์แบบเดิม (รองรับนักเรียนและบุคลากร)
// ==========================================
window.onload = async () => {
    try {
        const { data: { session } } = await db.auth.getSession();
        if (!session) {
            window.location.replace('index.html');
            return;
        }

        const userEmail = session.user.email;
        const studentIdCard = userEmail.split('@')[0];

        // 1. ค้นหาใน core_personnel (ครู/บุคลากร)
        const { data: teacherProfile, error: teacherError } = await db
            .from('core_personnel')
            .select('id, helpdesk_banned, role')
            .eq('id', session.user.id)
            .maybeSingle();

        if (teacherProfile && !teacherError) {
            currentUserType = 'teacher';
            currentUserId = teacherProfile.id;
            currentUserRole = teacherProfile.role || 'teacher';
            isBanned = teacherProfile.helpdesk_banned || false;
        } else {
            // 2. ค้นหาใน core_students
            const { data: studentProfile, error: studentError } = await db
                .from('core_students')
                .select('id, helpdesk_banned')
                .eq('student_id_card', studentIdCard)
                .maybeSingle();

            if (studentProfile && !studentError) {
                currentUserType = 'student';
                currentUserId = studentProfile.id;
                currentUserRole = 'student';
                isBanned = studentProfile.helpdesk_banned || false;
            } else {
                // ไม่พบข้อมูลทั้งสองตาราง
                Swal.fire({
                    title: 'ข้อผิดพลาดของบัญชี',
                    text: 'ไม่พบข้อมูลโปรไฟล์ของคุณในระบบ กรุณาแจ้งผู้ดูแลระบบ',
                    icon: 'error',
                    confirmButtonText: 'กลับหน้าหลัก'
                }).then(() => {
                    window.location.replace('index.html');
                });
                return;
            }
        }

        if (isBanned) {
            Swal.fire({
                title: 'ถูกระงับการใช้งาน',
                text: 'คุณถูกแบนไม่สามารถใช้ระบบ Helpdesk ได้ กรุณาติดต่อผู้ดูแลระบบ',
                icon: 'error',
                confirmButtonText: 'กลับหน้าหลัก'
            }).then(() => {
                window.location.replace(currentUserType === 'teacher' ? 'index.html' : 'student_index.html');
            });
            return;
        }

        // ✅ บันทึก Log การเข้าใช้งาน
        await window.logUserAction('เข้าสู่ระบบศูนย์ช่วยเหลือ (ผู้ใช้)', 'helpdesk');

        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
        await loadUserTickets();

    } catch (err) {
        console.error('Initialization error:', err);
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
};

// ========== ฟังก์ชันที่เหลือ (ไม่มีการเปลี่ยนแปลง) ==========

function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" class="text-blue-500 underline hover:text-blue-700 break-all">${url}</a>`;
    });
}

function formatThaiDateTime(dateString) {
    const d = dayjs(dateString);
    const yearBE = d.year() + 543;
    return d.locale('th').format('DD MMM ') + yearBE + d.format(' HH:mm');
}

async function loadUserTickets() {
    try {
        const { data, error } = await db.from('module_helpdesk_tickets')
            .select('*')
            .eq('sender_id', currentUserId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const ticketList = document.getElementById('userTicketList');
        if (data && data.length > 0) {
            ticketList.innerHTML = data.map(ticket => {
                let statusColor = 'bg-amber-100 text-amber-700';
                let statusText = 'รอแอดมินตรวจสอบ';
                let redBadgeHtml = '';

                if (ticket.status === 'replied') {
                    statusColor = 'bg-green-100 text-green-700';
                    statusText = 'แอดมินตอบกลับแล้ว';
                    if (ticket.id !== currentTicketId) {
                        redBadgeHtml = `<span class="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_5px_rgba(239,68,68,0.6)]"></span>`;
                    }
                } else if (ticket.status === 'closed') {
                    statusColor = 'bg-gray-100 text-gray-500';
                    statusText = 'ปิดงานแล้ว';
                }
                
                return `
                <div onclick="openTicket('${ticket.id}', '${ticket.topic.replace(/'/g, "\\'")}', '${ticket.status}')" 
                     class="relative p-3 bg-white border border-gray-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors ${ticket.id === currentTicketId ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''}">
                    ${redBadgeHtml}
                    <h4 class="font-bold text-gray-800 text-sm truncate mb-1 pr-4">${ticket.topic}</h4>
                    <div class="flex justify-between items-center mt-2">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}">${statusText}</span>
                        <span>${formatThaiDateTime(ticket.created_at)}</span>
                    </div>
                </div>`;
            }).join('');
        } else {
            ticketList.innerHTML = `
            <div class="text-center py-12 text-gray-400 text-xs px-4">
                <p class="mb-2">ยังไม่มีประวัติการส่งข้อความ</p>
                <span class="text-[10px] text-gray-300">หากพบปัญหาการใช้งาน สามารถกดสร้างเรื่องใหม่ได้ทันที</span>
            </div>`;
        }
    } catch (err) {
        console.error(err);
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

async function openNewTicketModal() {
    if (isBanned) {
        Swal.fire('ถูกระงับการใช้งาน', 'คุณไม่สามารถสร้างเรื่องใหม่ได้', 'error');
        return;
    }
    const { value: topic } = await Swal.fire({
        title: 'ระบุหัวข้อที่ต้องการติดต่อ',
        input: 'text',
        inputPlaceholder: 'ตัวอย่าง: ลืมรหัสผ่าน, เข้าใช้งานระบบไม่ได้',
        showCancelButton: true,
        confirmButtonText: 'สร้างเรื่อง',
        cancelButtonText: 'ยกเลิก',
        inputValidator: (value) => {
            if (!value.trim()) return 'กรุณากรอกหัวข้อปัญหา!';
        }
    });
    if (topic) {
        try {
            const { data: newTicket, error } = await db.from('module_helpdesk_tickets').insert({
                sender_id: currentUserId,
                sender_type: currentUserType,
                topic: topic.trim(),
                status: 'open'
            }).select().single();
            if (error) throw error;
            
            // ✅ บันทึก Log
            await window.logUserAction(`สร้าง Ticket Helpdesk: "${topic.trim()}"`, 'helpdesk');
            
            Swal.fire({ icon: 'success', title: 'สร้างเรื่องสำเร็จ', text: 'กรุณาพิมพ์รายละเอียดปัญหาในช่องแชท', timer: 2000, showConfirmButton: false });
            await loadUserTickets();
            openTicket(newTicket.id, newTicket.topic, newTicket.status);
        } catch (err) {
            Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
        }
    }
}

async function openTicket(ticketId, topic, status) {
    if (isBanned) {
        Swal.fire('ถูกระงับการใช้งาน', 'คุณไม่สามารถเปิดแชทได้', 'error');
        return;
    }
    currentTicketId = ticketId;
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('messagesContainer').classList.remove('hidden');
    document.getElementById('replyBox').classList.remove('hidden');
    document.getElementById('activeTopic').innerText = topic;

    const statusBadge = document.getElementById('activeStatus');
    if (status === 'open') {
        statusBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700";
        statusBadge.innerText = "รอแอดมินตรวจสอบ";
    } else if (status === 'replied') {
        statusBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700";
        statusBadge.innerText = "แอดมินตอบกลับแล้ว";
    } else {
        statusBadge.className = "text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500";
        statusBadge.innerText = "ปิดงานแล้ว";
    }

    loadUserTickets();
    await fetchMessages();
    showChatOnMobile();
}

async function fetchMessages() {
    if (!currentTicketId) return;
    try {
        const { data, error } = await db.from('module_helpdesk_messages')
            .select('*')
            .eq('ticket_id', currentTicketId)
            .order('created_at', { ascending: true });
        if (error) throw error;
        const container = document.getElementById('messagesContainer');
        if (data) {
            container.innerHTML = data.map(msg => {
                const isMe = msg.sender_id === currentUserId;
                const alignment = isMe ? 'justify-end' : 'justify-start';
                const bubbleColor = isMe ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none';
                return `
                <div class="flex w-full ${alignment}">
                    <div class="max-w-[70%] p-3 rounded-2xl shadow-sm ${bubbleColor}">
                        <p class="text-sm whitespace-pre-wrap">${linkify(msg.message)}</p>
                        <p class="text-[9px] mt-1 text-right ${isMe ? 'text-blue-200' : 'text-gray-400'}">
                            ${dayjs(msg.created_at).locale('th').format('HH:mm')}
                        </p>
                    </div>
                </div>`;
            }).join('');
            container.scrollTop = container.scrollHeight;
        }
    } catch (err) {
        console.error(err);
    }
}

async function sendMessage(e) {
    e.preventDefault();
    if (!currentTicketId) return;
    if (isBanned) {
        Swal.fire('ถูกระงับการใช้งาน', 'คุณไม่สามารถส่งข้อความได้เนื่องจากถูกแบน', 'error');
        return;
    }
    const input = document.getElementById('userMessage');
    const message = input.value.trim();
    if (!message) return;
    try {
        const { error: msgErr } = await db.from('module_helpdesk_messages').insert({
            ticket_id: currentTicketId,
            sender_id: currentUserId,
            message: message
        });
        if (msgErr) throw msgErr;
        await db.from('module_helpdesk_tickets').update({ status: 'open' }).eq('id', currentTicketId);
        
        // ✅ บันทึก Log
        await window.logUserAction(`ส่งข้อความ Helpdesk (Ticket: ${currentTicketId})`, 'helpdesk');
        
        input.value = '';
        await fetchMessages();
    } catch (err) {
        Swal.fire('ส่งข้อความล้มเหลว', err.message, 'error');
    }
}

// ==========================================
// Mobile UI Handlers
// ==========================================
function showChatOnMobile() {
    if (window.innerWidth >= 768) return;
    const sidebar = document.getElementById('sidebarPanel');
    const chat = document.getElementById('chatPanel');
    sidebar.classList.remove('flex');
    sidebar.classList.add('hidden');
    chat.classList.remove('hidden');
    chat.classList.add('flex');
}

function showSidebarOnMobile() {
    const sidebar = document.getElementById('sidebarPanel');
    const chat = document.getElementById('chatPanel');
    sidebar.classList.remove('hidden');
    sidebar.classList.add('flex');
    chat.classList.remove('flex');
    chat.classList.add('hidden');
    currentTicketId = null;
    if (typeof loadUserTickets === 'function') loadUserTickets();
}

// ==========================================
// ประกาศฟังก์ชัน global
// ==========================================
window.logout = logout;
window.goBack = goBack;
window.openNewTicketModal = openNewTicketModal;
window.openTicket = openTicket;
window.sendMessage = sendMessage;
window.showSidebarOnMobile = showSidebarOnMobile;
window.loadUserTickets = loadUserTickets;

console.log('✅ helpdesk_user.js loaded with config.js integration (checkAuth style)');