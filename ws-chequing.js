(async function() {
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

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function findDateForButton(button) {
    let current = button.parentElement;

    while (current) {
      let sibling = current.previousElementSibling;

      while (sibling) {
        if (sibling.tagName === 'H2') {
          const text = sibling.textContent.trim();
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                              'July', 'August', 'September', 'October', 'November', 'December'];
          const looksLikeDate = monthNames.some(m => text.includes(m)) ||
                                text.toLowerCase() === 'yesterday' ||
                                text.toLowerCase() === 'today';
          if (looksLikeDate) {
            return sibling.textContent.trim();
          }
        }
        sibling = sibling.previousElementSibling;
      }

      current = current.parentElement;
    }

    return null;
  }

  function extractFieldFromDiv(div) {
    const innerDiv = div?.children[1];
    const deeperDiv = innerDiv?.children[0];
    const p = deeperDiv?.querySelector('p');
    return p?.textContent?.trim() || null;
  }

  function formatDateOFX(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  function mapTransactionType(type, amount) {
    const lower = type.toLowerCase();
    // Use amount sign as fallback: negative = debit, positive = credit
    if (lower.includes('interest')) return 'INT';
    if (lower.includes('transfer')) return 'XFER';
    if (lower.includes('withdrawal')) return 'DEBIT';
    if (lower.includes('deposit')) return 'DEP';
    if (lower.includes('credit card')) return 'PAYMENT';
    // Fallback based on amount sign
    return amount < 0 ? 'DEBIT' : 'CREDIT';
  }

  function generateFITID(date, payee, amount, index) {
    const payeeClean = payee.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const amountStr = Math.abs(Math.round(amount * 100)).toString();
    const dateStr = formatDateOFX(date);
    const suffix = index > 0 ? `-${index}` : '';
    return `${dateStr}${payeeClean}${amountStr}${suffix}`;
  }

  // Find all amount elements using the dollar pattern
  const allPs = document.querySelectorAll('p');
  const amountPattern = /^\s*[−-]?\s*\$[\d,]+\.\d{2}\s*CAD\s*$/;

  const amountElements = Array.from(allPs).filter(p => amountPattern.test(p.textContent));

  console.log(`Found ${amountElements.length} potential transactions`);

  if (amountElements.length === 0) {
    alert('No transactions found!');
    return;
  }

  // Process all transactions
  for (let i = 0; i < amountElements.length; i++) {
    const amountP = amountElements[i];

    if (i % 10 === 0) {
      console.log(`Processing transaction ${i + 1} of ${amountElements.length}...`);
    }

    try {
      const amountText = amountP.textContent.trim();
      const amount = parseAmount(amountText);

      let button = amountP;
      while (button && button.tagName !== 'BUTTON') {
        button = button.parentElement;
      }

      if (!button) {
        console.warn('Could not find button for amount:', amountText);
        continue;
      }

      const dateText = findDateForButton(button);
      const date = dateText ? parseDate(dateText) : null;

      const buttonFirstDiv = button.querySelector('div');
      const firstChildDiv = buttonFirstDiv?.children[0];
      const secondNestedDiv = firstChildDiv?.children[1];
      const typeP = secondNestedDiv?.querySelector('p');
      const type = typeP?.textContent?.trim() || 'UNKNOWN';

      const typeLower = type.toLowerCase();
      const skipDetailPanel = typeLower.includes('credit card') || typeLower === 'interest';

      let from = null;
      let to = null;
      let payee;

      if (skipDetailPanel) {
        payee = type;
      } else {
        button.click();
        await sleep(300);

        const buttonParent = button.parentElement;
        const detailPanel = buttonParent.nextElementSibling;

        const layer1 = detailPanel?.children[0];
        const layer2 = layer1?.children[0];

        const fromDiv = layer2?.children[0];
        const toDiv = layer2?.children[1];

        from = extractFieldFromDiv(fromDiv);
        to = extractFieldFromDiv(toDiv);

        if (typeLower.includes('transfer in')) {
          payee = from || to || type;
        } else {
          payee = to || from || type;
        }

        button.click();
        await sleep(200);
      }

      if (!date) {
        console.warn('Could not parse date for transaction:', amountText);
        continue;
      }

      transactions.push({
        date,
        payee,
        type,
        amount
      });

    } catch (e) {
      console.warn('Error processing transaction:', e);
    }
  }

  console.log(`Extracted ${transactions.length} transactions`);

  if (transactions.length === 0) {
    alert('No transactions could be extracted!');
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
  a.download = `bank-transactions-${formatDateOFX(now)}.qfx`;
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
