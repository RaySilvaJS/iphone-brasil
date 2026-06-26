'use strict';

const SENSITIVE_PATTERNS = [
  { re: /\b(?:\d[ \-.*]*){13,19}\b/g,                  replace: '[CARTÃO OCULTADO]' },
  { re: /\bcvv\s*[:\-]?\s*\d{3,4}\b/gi,                replace: '[CVV OCULTADO]' },
  { re: /\b(0[1-9]|1[0-2])\s*[\/\-]\s*(\d{2}|\d{4})\b/g, replace: '[VALIDADE OCULTADA]' },
  { re: /\bsenh[a]?\s*[:\-]?\s*\S+/gi,                 replace: '[SENHA OCULTADA]' },
  { re: /\btoken\s*[:\-]?\s*\S+/gi,                    replace: '[TOKEN OCULTADO]' },
  { re: /\bc[oó]digo\s+(sms|otp|auth|verificacao|verificação)\s*[:\-]?\s*\d+/gi, replace: '[CÓDIGO OCULTADO]' },
];

const SAFETY_WARNING =
  'Para sua segurança, não envie dados de cartão, CVV, senha ou código de confirmação pelo WhatsApp. ' +
  'Utilize somente o checkout seguro do site.';

function hasSensitiveData(text) {
  if (!text) return false;
  for (const { re } of SENSITIVE_PATTERNS) {
    re.lastIndex = 0;
    if (re.test(text)) { re.lastIndex = 0; return true; }
  }
  return false;
}

function sanitize(text) {
  if (!text) return text;
  let result = text;
  for (const { re, replace } of SENSITIVE_PATTERNS) {
    re.lastIndex = 0;
    result = result.replace(re, replace);
  }
  return result;
}

module.exports = { hasSensitiveData, sanitize, SAFETY_WARNING };
