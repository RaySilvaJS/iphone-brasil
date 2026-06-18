// Gerador de PIX BR Code (EMV QR Code Merchant Presented Mode)
// Conforme especificação oficial do Banco Central do Brasil (BR Code / QRCPS)
// Sem dependências externas — cálculo puro de CRC-16 CCITT

function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      else crc = (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Formata um campo EMV: ID (2 dígitos) + TAMANHO (2 dígitos) + VALOR
function f(id, value) {
  const v = String(value);
  return `${id}${v.length.toString().padStart(2, '0')}${v}`;
}

/**
 * Gera o código PIX Copia e Cola (string completa com CRC).
 *
 * @param {object} opts
 * @param {string}        opts.key          Chave Pix (CPF, CNPJ, email, telefone ou chave aleatória)
 * @param {string}        opts.name         Nome do recebedor — máx. 25 caracteres
 * @param {string}        opts.city         Cidade do recebedor — máx. 15 caracteres
 * @param {number|string} [opts.amount]     Valor em BRL (omitir para valor livre)
 * @param {string}        [opts.txid]       Referência/ID do pedido — máx. 25 chars alfanuméricos
 * @param {string}        [opts.description] Descrição exibida em alguns bancos — máx. 72 chars
 */
function generatePix({ key, name, city, amount, txid, description }) {
  // --- Merchant Account Information (tag 26) ---
  let mai = f('00', 'BR.GOV.BCB.PIX') + f('01', key);
  if (description) mai += f('02', description.substring(0, 72));

  // --- Additional Data Field (tag 62): Reference Label (tag 05) ---
  const refLabel = (txid || '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 25) || '***';
  const addData = f('05', refLabel);

  let emv = f('00', '01')                              // Payload Format Indicator
           + f('26', mai)                               // Merchant Account Information
           + f('52', '0000')                            // Merchant Category Code (genérico)
           + f('53', '986')                             // Transaction Currency — 986 = BRL
           + (amount ? f('54', Number(amount).toFixed(2)) : '')
           + f('58', 'BR')                              // Country Code
           + f('59', name.substring(0, 25))             // Merchant Name
           + f('60', city.substring(0, 15))             // Merchant City
           + f('62', addData)                           // Additional Data Field
           + '6304';                                    // CRC placeholder (4 chars seguem abaixo)

  return emv + crc16(emv);
}

module.exports = { generatePix };
