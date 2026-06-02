let currentUserId = null;
let currentTicketId = null;
let currentTicketSenderId = null;
let currentTicketSenderType = null;

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
    const { data: profile } = await db.from('core_personnel').select('role').eq('id', currentUserId).single();
    let isAuthorized = false;
    if (profile && profile.role === 'super_admin') {
        isAuthorized = true;
    } else {
        const { data: adminRight } = await db.from('core_module_admins')
            .select('id')
            .eq('user_id', currentUserId)
            .eq('module_id', 'helpdesk')
            .single();
        if (adminRight) isAuthorized = true;
    }
    if (!isAuthorized) {
        Swal.fire('ปฏิเสธการเข้าถึง', 'คุณไม่มีสิทธิ์เข้าถึงระบบฝากข้อความ', 'error');
        setTimeout(() => window.location.replace('index.html'), 2000);
        return;
    }
    document.getElementById('mainBody').classList.replace('opacity-0', 'opacity-100');
    await loadTickets();
}

function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" class="text-blue-500 underline hover:text-blue-700">${url}</a>`;
    });
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

function formatThaiDateTime(dateString) {
    const d = dayjs(dateString);
    const yearAD = d.year();
    const yearBE = yearAD + 543;
    return d.locale('th').format('DD MMM ') + yearBE + d.format(' HH:mm');
}

async function loadTickets() {
    try {
        const { data: tickets, error } = await db.from('module_helpdesk_tickets')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw error;
        if (!tickets || tickets.length === 0) {
            document.getElementById('ticketList').innerHTML = '<div class="text-center py-8 text-gray-400">ไม่มีข้อความใหม่</div>';
            return;
        }

        const teacherIds = [...new Set(tickets.filter(t => t.sender_type === 'teacher').map(t => t.sender_id))];
        const studentIds = [...new Set(tickets.filter(t => t.sender_type === 'student').map(t => t.sender_id))];

        let teachersMap = new Map();
        if (teacherIds.length) {
            try {
                const { data: teachers, error: err } = await db.from('core_personnel')
                    .select('id, prefix, first_name, last_name, avatar_url')
                    .in('id', teacherIds);
                if (err) throw err;
                if (teachers) {
                    teachers.forEach(t => {
                        const fullName = `${t.prefix || ''}${t.prefix ? ' ' : ''}${t.first_name} ${t.last_name}`.trim();
                        teachersMap.set(t.id, {
                            fullName: fullName || 'บุคลากร',
                            photoUrl: t.avatar_url || '',
                            shortName: (t.first_name || '') + ' ' + (t.last_name || '')
                        });
                    });
                }
            } catch (e) {
                console.error('โหลดข้อมูลครูผิดพลาด:', e);
                teacherIds.forEach(id => {
                    teachersMap.set(id, { fullName: 'บุคลากร', photoUrl: '', shortName: 'บุคลากร' });
                });
            }
        }

        let studentsMap = new Map();
        if (studentIds.length) {
            try {
                const { data: students, error: err } = await db.from('core_students')
                    .select('id, student_id_card, prefix, first_name, last_name, avatar_students_url')
                    .in('id', studentIds);
                if (err) throw err;
                if (students) {
                    students.forEach(s => {
                        const fullName = `${s.prefix || ''}${s.prefix ? ' ' : ''}${s.first_name} ${s.last_name}`.trim();
                        studentsMap.set(s.id, {
                            fullName: fullName || 'นักเรียน',
                            photoUrl: s.avatar_students_url || '',
                            shortName: (s.first_name || '') + ' ' + (s.last_name || ''),
                            detailLine: `เลขที่ ${s.student_id_card || '-'}`
                        });
                    });
                }
            } catch (e) {
                console.error('โหลดข้อมูลนักเรียนผิดพลาด:', e);
                studentIds.forEach(id => {
                    studentsMap.set(id, { fullName: 'นักเรียน', photoUrl: '', shortName: 'นักเรียน', detailLine: '' });
                });
            }
        }

        const enrichedTickets = tickets.map(ticket => {
            let senderInfo = { fullName: '', shortName: '', photoUrl: '', detailLine: '' };
            if (ticket.sender_type === 'teacher') {
                const info = teachersMap.get(ticket.sender_id) || { fullName: 'บุคลากร', shortName: 'บุคลากร', photoUrl: '', detailLine: '' };
                senderInfo = { ...info, detailLine: `👨‍🏫 ${info.shortName}` };
            } else {
                const info = studentsMap.get(ticket.sender_id) || { fullName: 'นักเรียน', shortName: 'นักเรียน', photoUrl: '', detailLine: '' };
                senderInfo = { ...info, detailLine: `🧑‍🎓 ${info.shortName} · ${info.detailLine}` };
            }
            return { ...ticket, senderInfo };
        });

        const ticketList = document.getElementById('ticketList');
        ticketList.innerHTML = enrichedTickets.map(ticket => {
            const statusColor = ticket.status === 'open' ? 'bg-amber-100 text-amber-700' : (ticket.status === 'closed' ? 'bg-gray-100 text-gray-500' : 'bg-blue-100 text-blue-700');
            const statusText = ticket.status === 'open' ? 'รอตรวจสอบ' : (ticket.status === 'closed' ? 'ปิดงาน' : 'ตอบแล้ว');
            const thaiDate = formatThaiDateTime(ticket.created_at);
            const senderData = encodeURIComponent(JSON.stringify({
                name: ticket.senderInfo.fullName,
                detail: ticket.senderInfo.detailLine,
                photoUrl: ticket.senderInfo.photoUrl
            }));
            return `
            <div onclick="openTicket('${ticket.id}', '${escapeHtml(ticket.topic)}', '${senderData}')" 
                 class="p-3 bg-white border border-gray-100 rounded-xl hover:bg-blue-50 cursor-pointer transition-colors ${ticket.id === currentTicketId ? 'ring-2 ring-blue-500 bg-blue-50' : ''}">
                <div class="flex justify-between items-start mb-1">
                    <h4 class="font-bold text-gray-800 text-sm truncate pr-2">${escapeHtml(ticket.topic)}</h4>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${statusColor}">${statusText}</span>
                </div>
                <div class="text-[11px] text-gray-500 mb-1 truncate">
                    <i class="fa-regular fa-user mr-1"></i> ${escapeHtml(ticket.senderInfo.shortName)}
                </div>
                <div class="text-[11px] text-gray-500 flex justify-between">
                    <span><i class="fa-regular fa-calendar mr-1"></i> ${thaiDate}</span>
                    <span class="uppercase tracking-wider">${ticket.sender_type === 'teacher' ? '👨‍🏫' : '🧑‍🎓'}</span>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error(err);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้', 'error');
    }
}

async function openTicket(ticketId, topic, senderDataEncoded) {
    currentTicketId = ticketId;
    const senderData = JSON.parse(decodeURIComponent(senderDataEncoded));

    // ดึง sender_id และ sender_type
    try {
        const { data: ticket, error } = await db.from('module_helpdesk_tickets')
            .select('sender_id, sender_type')
            .eq('id', ticketId)
            .single();
        if (!error && ticket) {
            currentTicketSenderId = ticket.sender_id;
            currentTicketSenderType = ticket.sender_type;
        }
    } catch(e) { console.error(e); }

    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('messagesContainer').classList.remove('hidden');
    document.getElementById('replyBox').classList.remove('hidden');

    document.getElementById('activeTopic').innerText = topic;
    document.getElementById('activeSenderName').innerText = senderData.name;
    document.getElementById('activeSenderDetail').innerText = senderData.detail;

    const avatarImg = document.getElementById('senderAvatarImg');
    if (senderData.photoUrl && senderData.photoUrl.trim() !== '') {
        avatarImg.src = senderData.photoUrl;
        avatarImg.onerror = () => {
            avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderData.name)}&background=3b82f6&color=fff`;
        };
    } else {
        avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(senderData.name)}&background=3b82f6&color=fff`;
    }
    document.getElementById('senderAvatar').onclick = () => {
        if (senderData.photoUrl && senderData.photoUrl.trim() !== '') {
            Swal.fire({ imageUrl: senderData.photoUrl, imageAlt: 'รูปโปรไฟล์', imageWidth: '80%', background: '#1e293b', confirmButtonText: 'ปิด' });
        } else {
            Swal.fire('ไม่มีรูปโปรไฟล์', 'สามารถอัปโหลดรูปได้ที่หน้าโปรไฟล์', 'info');
        }
    };

    await loadTickets();
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
                const isAdmin = msg.sender_id === currentUserId;
                const alignment = isAdmin ? 'justify-end' : 'justify-start';
                const bubbleColor = isAdmin ? 'bg-blue-600 text-white rounded-br-none' : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none';
                const showDeleteBtn = !isAdmin;
                return `
                <div class="flex w-full ${alignment} group message-item">
                    <div class="max-w-[70%] p-3 rounded-2xl shadow-sm ${bubbleColor} relative">
                        ${showDeleteBtn ? `
                        <button onclick="deleteMessage('${msg.id}')" 
                                class="absolute -top-2 -right-2 bg-red-500 hover:bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10"
                                title="ลบข้อความนี้">
                            <i class="fa-solid fa-trash-can text-xs"></i>
                        </button>
                        ` : ''}
                        <p class="text-sm whitespace-pre-wrap">${linkify(msg.message)}</p>
                        <p class="text-[9px] mt-1 text-right ${isAdmin ? 'text-blue-200' : 'text-gray-400'}">
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
    const input = document.getElementById('replyMessage');
    const message = input.value.trim();
    if (!message) return;
    try {
        const { error: msgErr } = await db.from('module_helpdesk_messages').insert({
            ticket_id: currentTicketId,
            sender_id: currentUserId,
            message: message
        });
        if (msgErr) throw msgErr;
        await db.from('module_helpdesk_tickets').update({ status: 'replied' }).eq('id', currentTicketId);
        input.value = '';
        await fetchMessages();
        await loadTickets();
    } catch (err) {
        Swal.fire('ข้อผิดพลาด', err.message, 'error');
    }
}

async function closeTicket() {
    if (!currentTicketId) return;
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการปิดงาน?',
        text: "คุณได้แก้ไขปัญหานี้เรียบร้อยแล้วใช่หรือไม่?",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'ปิดงาน',
        cancelButtonText: 'ยกเลิก'
    });
    if (isConfirmed) {
        try {
            await db.from('module_helpdesk_tickets').update({ status: 'closed' }).eq('id', currentTicketId);
            Swal.fire({ icon: 'success', title: 'ปิดงานสำเร็จ', timer: 1500, showConfirmButton: false });
            await db.from('module_helpdesk_messages').insert({
                ticket_id: currentTicketId,
                sender_id: currentUserId,
                message: '🟢 ผู้ดูแลระบบได้ทำการปิดเคสนี้เรียบร้อยแล้ว'
            });
            await fetchMessages();
            await loadTickets();
        } catch (err) {
            Swal.fire('ข้อผิดพลาด', err.message, 'error');
        }
    }
}

// ลบข้อความเดียว
async function deleteMessage(messageId) {
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบข้อความ',
        text: 'คุณต้องการลบข้อความนี้ใช่หรือไม่? (ข้อความจะหายจากระบบทันที)',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    try {
        const { data: msg, error: fetchErr } = await db.from('module_helpdesk_messages')
            .select('sender_id')
            .eq('id', messageId)
            .single();
        if (fetchErr) throw fetchErr;
        if (msg.sender_id === currentUserId) {
            Swal.fire('ไม่สามารถลบได้', 'คุณไม่สามารถลบข้อความที่แอดมินส่งเองได้', 'error');
            return;
        }
        const { error } = await db.from('module_helpdesk_messages').delete().eq('id', messageId);
        if (error) throw error;
        Swal.fire({ icon: 'success', title: 'ลบข้อความเรียบร้อย', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        await fetchMessages();
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ลบข้อความทั้งหมดใน Ticket
async function deleteAllMessages() {
    if (!currentTicketId) return;
    const { isConfirmed } = await Swal.fire({
        title: 'ยืนยันการลบข้อความทั้งหมด',
        html: `คุณต้องการลบ <strong>ข้อความทั้งหมด</strong> ในแชทนี้ใช่หรือไม่?<br>(ข้อความของผู้แจ้งและผู้ดูแลระบบจะถูกลบอย่างถาวร)`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ลบทั้งหมดทันที',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    try {
        const { error } = await db.from('module_helpdesk_messages').delete().eq('ticket_id', currentTicketId);
        if (error) throw error;
        await db.from('module_helpdesk_messages').insert({
            ticket_id: currentTicketId,
            sender_id: currentUserId,
            message: '🗑️ ผู้ดูแลระบบได้ลบข้อความทั้งหมดในแชทนี้แล้ว'
        });
        Swal.fire({ icon: 'success', title: 'ลบข้อความทั้งหมดเรียบร้อย', toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
        await fetchMessages();
        await loadTickets();
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ลบ Ticket ทั้งใบ
async function deleteTicket() {
    if (!currentTicketId) return;
    const { isConfirmed } = await Swal.fire({
        title: 'ลบ Ticket นี้ทิ้งทั้งใบ?',
        html: `คุณต้องการลบ <strong>หัวข้อและข้อความทั้งหมด</strong> ของ Ticket นี้ใช่หรือไม่?<br>(การดำเนินการนี้ไม่สามารถกู้คืนได้)`,
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'ลบเลย',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    try {
        await db.from('module_helpdesk_messages').delete().eq('ticket_id', currentTicketId);
        await db.from('module_helpdesk_tickets').delete().eq('id', currentTicketId);
        Swal.fire({ icon: 'success', title: 'ลบ Ticket สำเร็จ', timer: 1500, showConfirmButton: false });
        currentTicketId = null;
        document.getElementById('emptyState').classList.remove('hidden');
        document.getElementById('chatHeader').classList.add('hidden');
        document.getElementById('messagesContainer').classList.add('hidden');
        document.getElementById('replyBox').classList.add('hidden');
        await loadTickets();
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// แบนผู้ใช้
async function banUser() {
    if (!currentTicketSenderId || !currentTicketSenderType) {
        Swal.fire('ไม่พบข้อมูลผู้ใช้', 'ไม่สามารถระบุผู้ใช้ได้', 'error');
        return;
    }
    if (currentTicketSenderId === currentUserId) {
        Swal.fire('ไม่สามารถแบนตัวเองได้', 'คุณคือผู้ดูแลระบบ', 'error');
        return;
    }
    const { isConfirmed } = await Swal.fire({
        title: 'แบนผู้ใช้นี้',
        html: `คุณต้องการแบนผู้ใช้นี้ไม่ให้สร้างเรื่องใหม่หรือส่งข้อความในระบบ Helpdesk ใช่หรือไม่?<br><strong>ผู้ใช้จะยังคงเห็นข้อความเดิม แต่ไม่สามารถโต้ตอบได้</strong>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'แบน',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    try {
        const table = currentTicketSenderType === 'teacher' ? 'core_personnel' : 'core_students';
        const { error } = await db.from(table).update({ helpdesk_banned: true }).eq('id', currentTicketSenderId);
        if (error) throw error;
        await db.from('module_helpdesk_messages').insert({
            ticket_id: currentTicketId,
            sender_id: currentUserId,
            message: `🚫 ผู้ดูแลระบบได้ทำการแบนผู้ใช้นี้ (${currentTicketSenderType}) ไม่ให้ส่งข้อความเพิ่มเติม`
        });
        Swal.fire({ icon: 'success', title: 'แบนผู้ใช้สำเร็จ', timer: 2000, showConfirmButton: false });
        await fetchMessages();
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}

// ยกเลิกแบนผู้ใช้
async function unbanUser() {
    if (!currentTicketSenderId || !currentTicketSenderType) {
        Swal.fire('ไม่พบข้อมูลผู้ใช้', 'ไม่สามารถระบุผู้ใช้ได้', 'error');
        return;
    }
    const { isConfirmed } = await Swal.fire({
        title: 'ยกเลิกแบนผู้ใช้',
        text: `คุณต้องการยกเลิกแบนผู้ใช้นี้ใช่หรือไม่? เขาจะสามารถส่งข้อความและสร้างเรื่องใหม่ได้อีกครั้ง`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10b981',
        confirmButtonText: 'ยกเลิกแบน',
        cancelButtonText: 'ยกเลิก'
    });
    if (!isConfirmed) return;
    try {
        const table = currentTicketSenderType === 'teacher' ? 'core_personnel' : 'core_students';
        const { error } = await db.from(table).update({ helpdesk_banned: false }).eq('id', currentTicketSenderId);
        if (error) throw error;
        await db.from('module_helpdesk_messages').insert({
            ticket_id: currentTicketId,
            sender_id: currentUserId,
            message: `✅ ผู้ดูแลระบบได้ยกเลิกแบนผู้ใช้นี้ (${currentTicketSenderType}) แล้ว`
        });
        Swal.fire({ icon: 'success', title: 'ยกเลิกแบนสำเร็จ', timer: 2000, showConfirmButton: false });
        await fetchMessages();
    } catch (err) {
        Swal.fire('เกิดข้อผิดพลาด', err.message, 'error');
    }
}