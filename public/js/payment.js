let _pollingInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams  = new URLSearchParams(window.location.search);
    const paymentId  = urlParams.get('id');

    if (!paymentId) { window.location.href = '/'; return; }

    const loadingDiv     = document.getElementById('loading');
    const loadingText    = document.getElementById('loading-text');
    const paymentDetails = document.getElementById('payment-details');
    const successMessage = document.getElementById('success-message');
    const refusedMessage = document.getElementById('refused-message');
    const proofButton    = document.getElementById('proof-button');
    const proofFileInput = document.getElementById('proof-file');
    const proofFeedback  = document.getElementById('proof-feedback');
    const proofModal     = document.getElementById('proof-modal');
    const proofNameInput = document.getElementById('proof-name');
    const proofPhoneInput= document.getElementById('proof-phone');
    const proofSubmitBtn = document.getElementById('proof-submit');
    const proofCancelBtn = document.getElementById('proof-cancel');

    let hasSentProof    = false;
    let currentProductName = '';
    let currentAmount   = 0;
    let currentStatus   = 'pending';
    let timerStarted    = false;

    // Preenche dados salvos
    const storedName  = localStorage.getItem('proof-customer-name')  || '';
    const storedPhone = localStorage.getItem('proof-customer-phone') || '';
    if (storedName  && proofNameInput)  proofNameInput.value  = storedName;
    if (storedPhone && proofPhoneInput) proofPhoneInput.value = storedPhone;

    // ── Polling ──────────────────────────────────────────────────────────────
    const checkPaymentStatus = async () => {
        try {
            const response = await fetch(`/api/payment/status/${paymentId}`);
            const data     = await response.json();
            if (!data.success) return;

            currentStatus      = data.status || 'pending';
            currentProductName = data.productName || currentProductName;
            currentAmount      = data.amount || currentAmount;

            // Atualiza ID curto exibido
            if (data.shortId) {
                const shortEl = document.getElementById('payment-id');
                if (shortEl) shortEl.textContent = data.shortId;
            }

            // Mostra QR Code quando disponível
            if (data.qrCode && loadingDiv.style.display !== 'none') {
                showPixDetails(data.qrCode, data.amount, data.shortId || paymentId);
            }

            // Atualiza valor se disponível antes do QR
            if (data.amount) {
                const amtEl = document.getElementById('payment-amount');
                if (amtEl) amtEl.textContent = formatBRL(data.amount);
            }

            // ── Tratamento de status ─────────────────────────────────────────
            if (currentStatus === 'paid') {
                clearInterval(_pollingInterval);
                paymentDetails.style.display = 'none';
                if (refusedMessage) refusedMessage.style.display = 'none';
                successMessage.style.display = 'block';
                try {
                    const hist = JSON.parse(localStorage.getItem('historico-pedidos') || '[]');
                    hist.push({ data: new Date().toISOString(), paymentId });
                    localStorage.setItem('historico-pedidos', JSON.stringify(hist));
                } catch (e) {}
                try {
                    if (window.MetaPixel) {
                        const summary = JSON.parse(localStorage.getItem('checkout-summary') || 'null');
                        const ids      = summary ? summary.produto.map(p => String(p.id)).filter(Boolean) : [];
                        const numItems = summary ? summary.quantidade : 1;
                        window.MetaPixel.purchase({
                            orderId:  paymentId,
                            value:    currentAmount || (summary ? summary.total_final : 0),
                            ids,
                            numItems
                        });
                    }
                } catch (e) {}
                return;
            }

            if (currentStatus === 'refused') {
                clearInterval(_pollingInterval);
                paymentDetails.style.display = 'none';
                successMessage.style.display = 'none';
                if (refusedMessage) {
                    refusedMessage.style.display = 'block';
                    const reasonEl  = document.getElementById('refuse-reason-text');
                    const reasonBox = document.getElementById('refuse-reason-box');
                    if (data.refuseReason && reasonEl) {
                        reasonEl.textContent = data.refuseReason;
                        if (reasonBox) reasonBox.style.display = 'block';
                    }
                }
                return;
            }

            if (currentStatus === 'awaiting_validation') {
                if (proofButton) proofButton.style.display = 'none';
                setPaymentStatus('awaiting_validation', '⏳ Comprovante recebido — aguardando validação da equipe');
            }
        } catch (error) {
            console.error('Erro ao verificar status do pagamento:', error);
        }
    };

    // ── Exibe QR Code e detalhes do PIX ─────────────────────────────────────
    function showPixDetails(qrCode, amount, displayId) {
        if (loadingText) {
            clearInterval(loadingText._msgInterval);
        }
        if (loadingDiv)     loadingDiv.style.display     = 'none';
        if (paymentDetails) paymentDetails.style.display = 'block';

        const shortEl = document.getElementById('payment-id');
        if (shortEl) shortEl.textContent = displayId;

        const amtEl = document.getElementById('payment-amount');
        if (amtEl) amtEl.textContent = formatBRL(amount || currentAmount || 0);

        const qrCodeImg   = document.getElementById('qr-code-image');
        const pixCodeInput= document.getElementById('pix-code');

        if (qrCode.startsWith('data:image')) {
            if (qrCodeImg)    qrCodeImg.src      = qrCode;
            if (pixCodeInput) pixCodeInput.value = 'QR Code gerado — use a imagem acima';
        } else {
            if (qrCodeImg)    qrCodeImg.src      = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(qrCode)}`;
            if (pixCodeInput) pixCodeInput.value = qrCode;
        }

        if (!hasSentProof && currentStatus !== 'paid' && currentStatus !== 'awaiting_validation' && currentStatus !== 'refused') {
            if (proofButton) proofButton.style.display = 'inline-flex';
        }

        if (!timerStarted) {
            timerStarted = true;
            startTimer(30);
        }
    }

    // ── Eventos do botão comprovante ─────────────────────────────────────────
    if (proofButton) {
        proofButton.addEventListener('click', () => {
            if (hasSentProof || currentStatus === 'paid' || currentStatus === 'refused') return;
            const name  = proofNameInput?.value.trim() || '';
            const phone = proofPhoneInput?.value.trim() || '';
            if (!name || !phone) { showProofModal(); return; }
            proofFileInput.click();
        });
    }

    if (proofFileInput) {
        proofFileInput.addEventListener('change', async () => {
            if (!proofFileInput.files.length) return;
            await uploadProof(proofFileInput.files[0]);
        });
    }

    if (proofSubmitBtn) {
        proofSubmitBtn.addEventListener('click', () => {
            const name  = proofNameInput?.value.trim() || '';
            const phone = proofPhoneInput?.value.trim() || '';
            if (!name || !phone) {
                if (proofFeedback) {
                    proofFeedback.textContent     = 'Informe seu nome e telefone antes de enviar.';
                    proofFeedback.style.display   = 'block';
                }
                return;
            }
            localStorage.setItem('proof-customer-name',  name);
            localStorage.setItem('proof-customer-phone', phone);
            if (proofFeedback) proofFeedback.style.display = 'none';
            hideProofModal();
            proofFileInput.click();
        });
    }

    if (proofCancelBtn) {
        proofCancelBtn.addEventListener('click', () => {
            if (proofFeedback) proofFeedback.style.display = 'none';
            hideProofModal();
        });
    }

    // Inicia polling imediatamente
    _pollingInterval = setInterval(checkPaymentStatus, 5000);
    checkPaymentStatus();

    // ── Helpers UI ───────────────────────────────────────────────────────────
    function showProofModal() { if (proofModal) proofModal.classList.add('active'); }
    function hideProofModal()  { if (proofModal) proofModal.classList.remove('active'); }

    // ── Upload do comprovante ─────────────────────────────────────────────────
    async function uploadProof(file) {
        if (hasSentProof || currentStatus === 'paid' || currentStatus === 'refused') return;

        const allowedTypes = [
            'image/jpeg','image/png','image/webp','application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/plain'
        ];

        if (!allowedTypes.includes(file.type)) {
            if (proofFeedback) {
                proofFeedback.textContent   = 'Formato não permitido. Envie imagem, PDF ou documento compatível.';
                proofFeedback.style.display = 'block';
            }
            return;
        }
        if (file.size > 15 * 1024 * 1024) {
            if (proofFeedback) {
                proofFeedback.textContent   = 'Arquivo muito grande. Use um comprovante de até 15MB.';
                proofFeedback.style.display = 'block';
            }
            return;
        }

        const name  = proofNameInput?.value.trim()  || localStorage.getItem('proof-customer-name')  || 'Cliente';
        const phone = proofPhoneInput?.value.trim()  || localStorage.getItem('proof-customer-phone') || 'Não informado';

        if (proofFeedback) { proofFeedback.textContent = 'Enviando comprovante...'; proofFeedback.style.display = 'block'; }
        if (proofButton)   proofButton.disabled = true;

        try {
            const base64 = await fileToBase64(file);
            const [, fileData] = base64.split(',');
            const response = await fetch('/api/payment/proof', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                    paymentId,
                    customerName:  name,
                    customerPhone: phone,
                    productName:   currentProductName || 'Compra',
                    amount:        currentAmount,
                    fileName:      file.name,
                    mimeType:      file.type,
                    fileData
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                if (proofFeedback) proofFeedback.textContent = result.error || 'Erro ao enviar comprovante. Tente novamente.';
                if (proofButton)   proofButton.disabled = false;
                return;
            }

            hasSentProof = true;
            if (proofButton) { proofButton.disabled = true; proofButton.style.display = 'none'; }
            setPaymentStatus('awaiting_validation', '⏳ Comprovante recebido — aguardando validação da equipe');
            if (proofFeedback) {
                proofFeedback.textContent   = 'Comprovante recebido! Nossa equipe validará o pagamento em breve.';
                proofFeedback.style.display = 'block';
            }
        } catch (error) {
            console.error('Erro ao enviar comprovante:', error);
            if (proofFeedback) {
                proofFeedback.textContent   = 'Erro ao enviar. Verifique sua conexão e tente novamente.';
                proofFeedback.style.display = 'block';
            }
            if (proofButton) proofButton.disabled = false;
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader  = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
});

// ── Timer ────────────────────────────────────────────────────────────────────
function startTimer(minutes) {
    let seconds = minutes * 60;
    const timerEl = document.getElementById('time');
    if (!timerEl) return;

    const iv = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
            clearInterval(iv);
            timerEl.textContent = 'Expirado';
            const statusEl = document.getElementById('payment-status');
            if (statusEl) {
                statusEl.className   = 'payment-status';
                statusEl.textContent = 'Tempo expirado. Entre em contato para gerar um novo pagamento.';
            }
            const proofBtn = document.getElementById('proof-button');
            if (proofBtn) proofBtn.style.display = 'none';
        } else {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            timerEl.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
        }
    }, 1000);
}

// ── Status badge ─────────────────────────────────────────────────────────────
function setPaymentStatus(status, text) {
    const el = document.getElementById('payment-status');
    if (!el) return;
    el.className = 'payment-status';
    if (status === 'paid')              el.classList.add('paid');
    else if (status === 'refused')      el.classList.add('refused');
    else                                el.classList.add('pending');
    el.textContent = text;
}

// ── Copiar código PIX ─────────────────────────────────────────────────────────
function copyPixCode() {
    const pixCode = document.getElementById('pix-code');
    if (!pixCode || !pixCode.value) return;
    const text     = pixCode.value;
    const feedback = document.getElementById('proof-feedback');

    const onSuccess = () => {
        if (feedback) {
            feedback.textContent   = '✓ Código PIX copiado!';
            feedback.style.display = 'block';
            setTimeout(() => { if (feedback.textContent === '✓ Código PIX copiado!') feedback.style.display = 'none'; }, 2500);
        }
    };

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(onSuccess).catch(() => { pixCode.select(); try { document.execCommand('copy'); } catch {} onSuccess(); });
    } else {
        pixCode.select(); try { document.execCommand('copy'); } catch {} onSuccess();
    }
}

function formatBRL(value) {
    return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
