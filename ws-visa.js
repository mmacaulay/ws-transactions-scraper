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

  function formatDateOFX(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  function mapTransactionType(type) {
    const lower = type.toLowerCase();
    if (lower === 'refund') return 'CREDIT';
    if (lower.includes('from ') || lower === 'credit card payment') return 'PAYMENT';
    return 'DEBIT';
  }

  function generateFITID(date, payee, amount, index) {
    // Create a simple hash from payee
    const payeeClean = payee.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const amountStr = Math.abs(Math.round(amount * 100)).toString();
    const dateStr = formatDateOFX(date);
    const suffix = index > 0 ? `-${index}` : '';
    return `${dateStr}${payeeClean}${amountStr}${suffix}`;
  }

  // Extract transactions
  const allH2s = document.querySelectorAll('h2');

  allH2s.forEach(h2 => {
    const dateText = h2.textContent.trim();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const looksLikeDate = monthNames.some(m => dateText.includes(m)) ||
                          dateText.toLowerCase() === 'yesterday' ||
                          dateText.toLowerCase() === 'today';

    if (!looksLikeDate) return;

    const date = parseDate(dateText);
    if (!date) return;

    const transactionContainer = h2.nextElementSibling;
    if (!transactionContainer) return;

    const txRows = transactionContainer.querySelectorAll('[data-fullstory="cash-activities"]');

    txRows.forEach(row => {
      try {
        const secondChildDiv = row.children[1];
        const payeeP = secondChildDiv?.children[0];
        const payee = payeeP?.textContent?.trim() || 'UNKNOWN';

        const typeContainerDiv = secondChildDiv?.children[1];
        const typeP = typeContainerDiv?.children[0];
        const type = typeP?.textContent?.trim() || 'UNKNOWN';

        const amountContainer = row.nextElementSibling;
        const amountP = amountContainer?.children[0];
        const amountText = amountP?.textContent?.trim() || '';
        const amount = parseAmount(amountText);

        const pendingDiv = amountP?.nextElementSibling;
        const isPending = pendingDiv?.querySelector('span')?.textContent?.includes('Pending') || false;

        if (isPending) return;

        transactions.push({
          date,
          payee,
          type,
          amount
        });
      } catch (e) {
        console.warn('Error parsing transaction row:', e, row);
      }
    });
  });

  console.log(`Found ${transactions.length} transactions`);

  if (transactions.length === 0) {
    alert('No transactions found!');
    return;
  }

  // Generate FITIDs with collision handling
  const fitidCounts = {};
  transactions.forEach(tx => {
    const baseKey = `${formatDateOFX(tx.date)}|${tx.payee}|${tx.amount}`;
    fitidCounts[baseKey] = (fitidCounts[baseKey] || 0);
    tx.fitid = generateFITID(tx.date, tx.payee, tx.amount, fitidCounts[baseKey]);
    fitidCounts[baseKey]++;
  });

  // Build QFX content
  const now = new Date();
  const nowOFX = formatDateOFX(now) + now.toTimeString().slice(0,8).replace(/:/g, '');

  // Find date range
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
<CREDITCARDMSGSRSV1>
<CCSTMTTRNRS>
<TRNUID>1
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<CCSTMTRS>
<CURDEF>CAD
<CCACCTFROM>
<ACCTID>0000
</CCACCTFROM>
<BANKTRANLIST>
<DTSTART>${formatDateOFX(minDate)}
<DTEND>${formatDateOFX(maxDate)}
`;

  transactions.forEach(tx => {
    const trnType = mapTransactionType(tx.type);
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
</CCSTMTRS>
</CCSTMTTRNRS>
</CREDITCARDMSGSRSV1>
</OFX>`;

  // Trigger download
  const blob = new Blob([qfx], { type: 'application/x-ofx' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions-${formatDateOFX(now)}.qfx`;
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
})();
