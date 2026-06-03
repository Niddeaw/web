let currentUserId = null;
let currentUserType = 'student';
let currentTicketId = null;
let isBanned = false;

window.onload = async () => {
    await checkAuth();
};

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        window.location.replace('index.html');
        return;
    }
    currentUserId = session.user.id;

    const userEmail = session.user.email;
    const studentIdCard = userEmail.split('@')[0];

    // ค้นหาใน core_personnel ก่อน (ครู/บุคลากร)
    const { data: teacherProfile, error: teacherError } = await db
        .from('core_personnel')
        .select('id, helpdesk_banned')
        .eq('id', currentUserId)
        .maybeSingle();

    if (teacherProfile && !teacherError) {
        currentUserType = 'teacher';
        isBanned = teacherProfile.helpdesk_banned || false;
    } else {
        // ค้นหาใน core_students ด้วย student_id_card จาก email
        const { data: studentProfile, error: studentError } = await db
            .from('core_students')
            .select('id, helpdesk_banned')
            .eq('student_id_card', studentIdCard)
            .maybeSingle();

        if (studentProfile && !studentError) {
            currentUserType = 'student';
            currentUserId = studentProfile.id; // ✅ ใช้ UUID จาก core_students
            isBanned = studentProfile.helpdesk_banned || false;
        } else {
            document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
            Swal.fire({
                title: 'ข้อผิดพลาดของบัญชี',
                text: 'ไม่พบข้อมูลโปรไฟล์ของคุณในระบบ (รหัสผู้ใช้ไม่ตรงกับฐานข้อมูล) กรุณาแจ้งผู้ดูแลระบบ',
                icon: 'error',
                confirmButtonText: 'กลับหน้าหลัก'
            }).then(() => {
                window.location.replace('index.html');
            });
            return;
        }
    }

    if (isBanned) {
        document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
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

    const backBtn = document.getElementById('backToHomeBtn');
    if (backBtn) {
        backBtn.onclick = () => {
            window.location.replace(currentUserType === 'teacher' ? 'index.html' : 'student_index.html');
        };
    }

    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    await loadUserTickets();
}

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
                if (ticket.status === 'replied') {
                    statusColor = 'bg-green-100 text-green-700';
                    statusText = 'แอดมินตอบกลับแล้ว';
                } else if (ticket.status === 'closed') {
                    statusColor = 'bg-gray-100 text-gray-500';
                    statusText = 'ปิดงานแล้ว';
                }
                const thaiDate = formatThaiDateTime(ticket.created_at);
                return `
                <div onclick="openTicket('${ticket.id}', '${ticket.topic.replace(/'/g, "\\'")}', '${ticket.status}')" 
                     class="p-3 bg-white border border-gray-100 rounded-xl hover:bg-slate-50 cursor-pointer transition-colors ${ticket.id === currentTicketId ? 'ring-2 ring-blue-500 bg-blue-50/50' : ''}">
                    <h4 class="font-bold text-gray-800 text-sm truncate mb-1">${escapeHtml(ticket.topic)}</h4>
                    <div class="flex justify-between items-center mt-2">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${statusColor}">${statusText}</span>
                        <span class="text-[10px] text-gray-400">${thaiDate}</span>
                    </div>
                </div>`;
            }).join('');
        } else {
            ticketList.innerHTML = `<div class="text-center py-12 text-gray-400 text-xs px-4">
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
        input.value = '';
        await fetchMessages();
    } catch (err) {
        Swal.fire('ส่งข้อความล้มเหลว', err.message, 'error');
    }
}