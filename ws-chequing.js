(function() {
  const transactions = [];

  function parseDate(dateText) {
    const text = dateText.trim();
    const today = new Date();

    if (text.toLowerCase() === 'today') {
      return today;
    }

    if (text.toLowerCase() === 'yesterday') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday;
    }

    const parsed = new Date(text);
    if (!isNaN(parsed)) {
      return parsed;
    }

    console.warn('Could not parse date:', text);
    return null;
  }

  function parseAmount(amountText) {
    const text = amountText.trim();
    const isNegative = text.includes('−') || text.startsWith('-');
    const numberMatch = text.match(/[\d,]+\.?\d*/);
    if (!numberMatch) {
      console.warn('Could not parse amount:', text);
      return null;
    }
    const amount = parseFloat(numberMatch[0].replace(/,/g, ''));
    return isNegative ? -amount : amount;
  }

  function findDateForElement(el) {
    let current = el.parentElement;

    while (current) {
      let sibling = current.previousElementSibling;

      while (sibling) {
        const h2 = sibling.tagName === 'H2' ? sibling : sibling.querySelector('h2');
        if (h2) {
          const text = h2.textContent.trim();
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
          const looksLikeDate = monthNames.some(m => text.includes(m)) ||
                                text.toLowerCase() === 'yesterday' ||
                                text.toLowerCase() === 'today';
          if (looksLikeDate) {
            return h2.textContent.trim();
          }
        }
        sibling = sibling.previousElementSibling;
      }

      current = current.parentElement;
    }

    return null;
  }

  function formatDateOFX(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  function mapTransactionType(type, amount) {
    const lower = type.toLowerCase();
    if (lower.includes('interest')) return 'INT';
    if (lower.includes('transfer')) return 'XFER';
    if (lower.includes('withdrawal')) return 'DEBIT';
    if (lower.includes('deposit')) return 'DEP';
    if (lower.includes('credit card')) return 'PAYMENT';
    return amount < 0 ? 'DEBIT' : 'CREDIT';
  }

  function generateFITID(date, payee, amount, index) {
    const payeeClean = payee.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const amountStr = Math.abs(Math.round(amount * 100)).toString();
    const dateStr = formatDateOFX(date);
    const suffix = index > 0 ? `-${index}` : '';
    return `${dateStr}${payeeClean}${amountStr}${suffix}`;
  }

  // Find all buttons that contain a dollar amount span
  const amountRe = /^\s*[−\-]?\s*\$[\d,]+\.\d{2}/;

  const txButtons = Array.from(document.querySelectorAll('button')).filter(btn =>
    Array.from(btn.querySelectorAll('span')).some(s =>
      s.children.length === 0 && amountRe.test(s.textContent)
    )
  );

  console.log(`Found ${txButtons.length} transaction buttons`);

  if (txButtons.length === 0) {
    // Diagnostics to help identify the structure
    const allBtns = document.querySelectorAll('button');
    console.log(`Total buttons on page: ${allBtns.length}`);
    const sampleSpans = Array.from(document.querySelectorAll('span'))
      .filter(s => s.children.length === 0 && s.textContent.includes('$'))
      .slice(0, 5);
    console.log('Sample $ spans:', sampleSpans.map(s => `<${s.tagName}> "${s.textContent.trim()}"`));
    alert('No transactions found! Check the browser console for diagnostics.');
    return;
  }

  txButtons.forEach((button, i) => {
    try {
      // All text content is in leaf spans with data-fs-privacy-rule
      const spans = Array.from(button.querySelectorAll('span[data-fs-privacy-rule]'))
        .filter(s => s.children.length === 0 && s.textContent.trim().length > 0);

      const amountSpan = spans.find(s => amountRe.test(s.textContent));
      const textSpans = spans.filter(s => s !== amountSpan);

      const amount = parseAmount(amountSpan?.textContent || '');
      if (amount === null) {
        console.warn(`[${i}] Could not parse amount`);
        return;
      }

      // spans in order: payee, type, account name (we only need first two)
      const payee = textSpans[0]?.textContent.trim() || 'UNKNOWN';
      const type = textSpans[1]?.textContent.trim() || 'UNKNOWN';

      const dateText = findDateForElement(button);
      if (!dateText) {
        console.warn(`[${i}] Could not find date for: ${payee}`);
        return;
      }
      const date = parseDate(dateText);
      if (!date) return;

      transactions.push({ date, payee, type, amount });
    } catch (e) {
      console.warn(`Error processing button ${i}:`, e);
    }
  });

  console.log(`Extracted ${transactions.length} transactions`);

  if (transactions.length === 0) {
    alert('No transactions could be extracted! Check the browser console for warnings.');
    return;
  }

  // Generate FITIDs with collision handling
  const fitidCounts = {};
  transactions.forEach(tx => {
    const baseKey = `${formatDateOFX(tx.date)}|${tx.payee}|${tx.amount}`;
    fitidCounts[baseKey] = fitidCounts[baseKey] || 0;
    tx.fitid = generateFITID(tx.date, tx.payee, tx.amount, fitidCounts[baseKey]);
    fitidCounts[baseKey]++;
  });

  // Build QFX content
  const now = new Date();
  const nowOFX = formatDateOFX(now) + now.toTimeString().slice(0,8).replace(/:/g, '');

  const dates = transactions.map(t => t.date);
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));

  let qfx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>${nowOFX}
<LANGUAGE>ENG
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>CAD
<BANKACCTFROM>
<BANKID>0000
<ACCTID>0000
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>${formatDateOFX(minDate)}
<DTEND>${formatDateOFX(maxDate)}
`;

  transactions.forEach(tx => {
    const trnType = mapTransactionType(tx.type, tx.amount);
    const name = tx.payee.substring(0, 32).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    qfx += `<STMTTRN>
<TRNTYPE>${trnType}
<DTPOSTED>${formatDateOFX(tx.date)}
<TRNAMT>${tx.amount.toFixed(2)}
<FITID>${tx.fitid}
<NAME>${name}
</STMTTRN>
`;
  });

  qfx += `</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;

  // Trigger download
  const blob = new Blob([qfx], { type: 'application/x-ofx' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ws-chequing-transactions-${formatDateOFX(now)}.qfx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log('QFX file downloaded!');
  console.table(transactions.map(t => ({
    date: formatDateOFX(t.date),
    payee: t.payee,
    type: t.type,
    amount: t.amount,
    fitid: t.fitid
  })));

  alert(`Downloaded ${transactions.length} transactions`);
})();
