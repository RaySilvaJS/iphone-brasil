let _pollingInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentId = urlParams.get('id');
    
    if (!paymentId) {
        window.location.href = '/';
        return;
    }

    const loadingText = document.getElementById('loading-text');
    const loadingDiv = document.getElementById('loading');
    const paymentDetails = document.getElementById('payment-details');
    const successMessage = document.getElementById('success-message');
    const proofButton = document.getElementById('proof-button');
    const proofFileInput = document.getElementById('proof-file');
    const proofFeedback = document.getElementById('proof-feedback');
    const proofModal = document.getElementById('proof-modal');
    const proofNameInput = document.getElementById('proof-name');
    const proofPhoneInput = document.getElementById('proof-phone');
    const proofSubmitBtn = document.getElementById('proof-submit');
    const proofCancelBtn = document.getElementById('proof-cancel');

    let hasSentProof = false;
    let currentProductName = '';
    let currentAmount = 0;
    let currentStatus = 'pending';

    const storedName = localStorage.getItem('proof-customer-name') || '';
    const storedPhone = localStorage.getItem('proof-customer-phone') || '';

    if (storedName) proofNameInput.value = storedName;
    if (storedPhone) proofPhoneInput.value = storedPhone;

    // Mensagens sequenciais de carregamento
    const loadingMessages = [
        'Gerando pagamento...',
        'Aguardando QR Code...',
        'Conectando ao sistema...',
        'Processando solicitação...'
    ];
    
    let messageIndex = 0;
    const messageInterval = setInterval(() => {
        loadingText.textContent = loadingMessages[messageIndex];
        messageIndex = (messageIndex + 1) % loadingMessages.length;
    }, 3000);

    // Polling para verificar o status do pagamento
    const checkPaymentStatus = async () => {
        try {
            const response = await fetch(`/api/payment/status/${paymentId}`);
            const data = await response.json();
            
            if (data.success) {
                currentStatus = data.status || 'pending';
                currentProductName = data.productName || currentProductName;
                currentAmount = data.amount || currentAmount;

                if (data.qrCode) {
                    // QR Code recebido
                    clearInterval(messageInterval);
                    loadingDiv.style.display = 'none';
                    paymentDetails.style.display = 'block';
                    
                    document.getElementById('payment-id').textContent = paymentId;
                    document.getElementById('payment-amount').textContent = formatBRL(currentAmount || 0);
                    
                    const qrCodeImg = document.getElementById('qr-code-image');
                    const pixCodeInput = document.getElementById('pix-code');
                    
                    if (data.qrCode.includes('data:image')) {
                        qrCodeImg.src = data.qrCode;
                        pixCodeInput.value = 'QR Code gerado - Use a imagem acima';
                    } else {
                        qrCodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(data.qrCode)}`;
                        pixCodeInput.value = data.qrCode;
                    }

                    if (!hasSentProof && currentStatus !== 'paid' && currentStatus !== 'awaiting_validation') {
                        proofButton.style.display = 'inline-flex';
                    }
                    
                    startTimer(30); // 30 minutos para pagamento
                }
                
                if (currentStatus === 'paid') {
                    // Pagamento confirmado
                    clearInterval(_pollingInterval);
                    paymentDetails.style.display = 'none';
                    successMessage.style.display = 'block';
                    // [LOJA OFICIAL] Registra compra no histórico para controle de frete grátis 1ª compra
                    try {
                        var hist = JSON.parse(localStorage.getItem('historico-pedidos') || '[]');
                        hist.push({ data: new Date().toISOString(), paymentId: paymentId });
                        localStorage.setItem('historico-pedidos', JSON.stringify(hist));
                    } catch(e) {}
                    document.getElementById('payment-status').className = 'payment-status paid';
                    document.getElementById('payment-status').textContent = 'Pagamento confirmado com sucesso!';
                } else if (currentStatus === 'awaiting_validation') {
                    proofButton.style.display = 'none';
                    setPaymentStatus('awaiting_validation', 'Aguardando Validação do Pagamento');
                }
            }
        } catch (error) {
            console.error('Erro ao verificar status do pagamento:', error);
        }
    };
    
    proofButton.addEventListener('click', () => {
        if (hasSentProof || currentStatus === 'paid') return;
        const storedName = proofNameInput.value.trim();
        const storedPhone = proofPhoneInput.value.trim();

        if (!storedName || !storedPhone) {
            showProofModal();
            return;
        }

        proofFileInput.click();
    });

    proofFileInput.addEventListener('change', async () => {
        if (!proofFileInput.files.length) return;
        const file = proofFileInput.files[0];
        await uploadProof(file);
    });

    proofSubmitBtn.addEventListener('click', () => {
        const name = proofNameInput.value.trim();
        const phone = proofPhoneInput.value.trim();
        if (!name || !phone) {
            proofFeedback.textContent = 'Informe seu nome e telefone antes de enviar o comprovante.';
            proofFeedback.style.display = 'block';
            return;
        }
        localStorage.setItem('proof-customer-name', name);
        localStorage.setItem('proof-customer-phone', phone);
        proofFeedback.style.display = 'none';
        hideProofModal();
        proofFileInput.click();
    });

    proofCancelBtn.addEventListener('click', () => {
        proofFeedback.style.display = 'none';
        hideProofModal();
    });

    _pollingInterval = setInterval(checkPaymentStatus, 5000);
    checkPaymentStatus(); // Chamada inicial

    function showProofModal() {
        proofModal.classList.add('active');
    }

    function hideProofModal() {
        proofModal.classList.remove('active');
    }

    async function uploadProof(file) {
        if (hasSentProof || currentStatus === 'paid') return;

        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain'
        ];

        if (!allowedTypes.includes(file.type)) {
            proofFeedback.textContent = 'Formato não permitido. Envie imagem, PDF ou documento compatível.';
            proofFeedback.style.display = 'block';
            return;
        }

        if (file.size > 15 * 1024 * 1024) {
            proofFeedback.textContent = 'Arquivo muito grande. Use um comprovante de até 15MB.';
            proofFeedback.style.display = 'block';
            return;
        }

        const name = proofNameInput.value.trim() || localStorage.getItem('proof-customer-name') || 'Cliente';
        const phone = proofPhoneInput.value.trim() || localStorage.getItem('proof-customer-phone') || 'Telefone não informado';

        proofFeedback.textContent = 'Enviando comprovante...';
        proofFeedback.style.display = 'block';
        proofButton.disabled = true;

        try {
            const base64 = await fileToBase64(file);
            const [, fileData] = base64.split(',');
            const response = await fetch('/api/payment/proof', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentId,
                    customerName: name,
                    customerPhone: phone,
                    productName: currentProductName || 'Compra',
                    amount: currentAmount,
                    fileName: file.name,
                    mimeType: file.type,
                    fileData
                })
            });

            const result = await response.json();
            if (!response.ok || !result.success) {
                proofFeedback.textContent = result.error || 'Erro ao enviar comprovante. Tente novamente.';
                proofButton.disabled = false;
                return;
            }

            hasSentProof = true;
            proofButton.disabled = true;
            proofButton.style.display = 'none';
            setPaymentStatus('awaiting_validation', 'Aguardando Validação do Pagamento');
            proofFeedback.textContent = 'Comprovante recebido! Nossa equipe validará o pagamento em breve.';
            proofFeedback.style.display = 'block';
        } catch (error) {
            console.error('Erro ao enviar comprovante:', error);
            proofFeedback.textContent = 'Erro ao enviar comprovante. Verifique sua conexão e tente novamente.';
            proofButton.disabled = false;
        }
    }

    function fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
});

function startTimer(minutes) {
    let seconds = minutes * 60;
    const timerElement = document.getElementById('time');

    const timerInterval = setInterval(() => {
        seconds--;

        if (seconds <= 0) {
            clearInterval(timerInterval);
            clearInterval(_pollingInterval);
            timerElement.textContent = 'Tempo esgotado!';
            const statusEl = document.getElementById('payment-status');
            if (statusEl) {
                statusEl.className = 'payment-status';
                statusEl.textContent = 'Tempo expirado. Entre em contato para gerar um novo pagamento.';
            }
            const proofBtn = document.getElementById('proof-button');
            if (proofBtn) proofBtn.style.display = 'none';
        } else {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            timerElement.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
    }, 1000);
}

function setPaymentStatus(status, text) {
    const statusElement = document.getElementById('payment-status');
    statusElement.className = 'payment-status';
    if (status === 'paid') {
        statusElement.classList.add('paid');
    } else {
        statusElement.classList.add('pending');
    }
    statusElement.textContent = text;
}

function formatBRL(value) {
    return Number(value).toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    });
}

function copyPixCode() {
    const pixCode = document.getElementById('pix-code');
    const text = pixCode.value;
    if (!text) return;

    const feedback = document.getElementById('proof-feedback');

    function showCopySuccess() {
        if (feedback) {
            feedback.textContent = 'Código PIX copiado!';
            feedback.style.display = 'block';
            setTimeout(() => { if (feedback.textContent === 'Código PIX copiado!') feedback.style.display = 'none'; }, 2500);
        }
    }

    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(showCopySuccess).catch(() => {
            pixCode.select();
            try { document.execCommand('copy'); } catch(e) {}
            showCopySuccess();
        });
    } else {
        pixCode.select();
        try { document.execCommand('copy'); } catch(e) {}
        showCopySuccess();
    }
}