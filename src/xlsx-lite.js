/* ============================================================
   xlsx-lite.js
   Generador mínimo de archivos .xlsx (OOXML) sin dependencias.
   Funciona en el navegador y en Node. ZIP con método "stored".

   Uso:
     const wb = XLSX.create();
     const ws = wb.addSheet('Resumen');
     ws.widths([30, 12, 12]);
     ws.merge('A1', 'C1');
     ws.push(['Título'], 'title');
     ws.set(2, 0, new Date(2026, 10, 7), 'date');
     ws.freeze(1, 0);
     const bytes = wb.build();       // Uint8Array
   ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.XLSX = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ---------------- ZIP (stored, sin compresión) --------------- */
  const CRC_TABLE = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  const enc = new TextEncoder();

  function zip(files) {
    // files: [{ name, data: Uint8Array }]
    const chunks = [];
    const central = [];
    let offset = 0;
    const DOS_TIME = 0x6000; // 12:00:00
    const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;

      const lh = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);       // versión necesaria
      dv.setUint16(6, 0x0800, true);   // flag: nombres en UTF-8
      dv.setUint16(8, 0, true);        // método: stored
      dv.setUint16(10, DOS_TIME, true);
      dv.setUint16(12, DOS_DATE, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);

      chunks.push(lh, f.data);

      const cd = new Uint8Array(46 + nameBytes.length);
      const cv = new DataView(cd.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, DOS_TIME, true);
      cv.setUint16(14, DOS_DATE, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, size, true);
      cv.setUint32(24, size, true);
      cv.setUint16(28, nameBytes.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      central.push(cd);

      offset += lh.length + size;
    }

    const centralSize = central.reduce((a, c) => a + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, centralSize, true);
    ev.setUint32(16, offset, true);

    const total = offset + centralSize + 22;
    const out = new Uint8Array(total);
    let p = 0;
    for (const c of chunks) { out.set(c, p); p += c.length; }
    for (const c of central) { out.set(c, p); p += c.length; }
    out.set(eocd, p);
    return out;
  }

  /* ------------------------- Utilidades ------------------------ */
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  }

  function colName(n) { // 0 -> A
    let s = '';
    n = n + 1;
    while (n > 0) {
      const r = (n - 1) % 26;
      s = String.fromCharCode(65 + r) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function cellRef(r, c) { return colName(c) + (r + 1); }

  function dateSerial(d) {
    const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    return Math.round((utc - Date.UTC(1899, 11, 30)) / 86400000);
  }

  /* ------------------------- Estilos --------------------------- */
  // numFmtId: 0 general | 164 fecha dd-mm-yyyy | 165 dd-mm-yy | 166 0.0
  const STYLES = {
    default:  { font: 0, fill: 0, border: 0, fmt: 0,  align: 0 },
    title:    { font: 1, fill: 0, border: 0, fmt: 0,  align: 1 },
    h1:       { font: 2, fill: 2, border: 1, fmt: 0,  align: 2 },
    h2:       { font: 3, fill: 3, border: 1, fmt: 0,  align: 2 },
    label:    { font: 3, fill: 0, border: 0, fmt: 0,  align: 1 },
    text:     { font: 0, fill: 0, border: 1, fmt: 0,  align: 1 },
    wrap:     { font: 0, fill: 0, border: 1, fmt: 0,  align: 3 },
    center:   { font: 0, fill: 0, border: 1, fmt: 0,  align: 2 },
    date:     { font: 0, fill: 0, border: 1, fmt: 164, align: 2 },
    num:      { font: 0, fill: 0, border: 1, fmt: 166, align: 2 },
    int:      { font: 0, fill: 0, border: 1, fmt: 1,  align: 2 },
    pct:      { font: 0, fill: 0, border: 1, fmt: 10, align: 2 },
    absent:   { font: 4, fill: 4, border: 1, fmt: 0,  align: 2 },
    present:  { font: 5, fill: 5, border: 1, fmt: 0,  align: 2 },
    note:     { font: 6, fill: 0, border: 0, fmt: 0,  align: 3 },
    total:    { font: 3, fill: 3, border: 1, fmt: 0,  align: 1 },
  };
  const STYLE_KEYS = Object.keys(STYLES);

  function stylesXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="3">' +
        '<numFmt numFmtId="164" formatCode="dd-mm-yyyy"/>' +
        '<numFmt numFmtId="165" formatCode="dd-mm-yy"/>' +
        '<numFmt numFmtId="166" formatCode="0.0"/>' +
      '</numFmts>' +
      '<fonts count="7">' +
        '<font><sz val="10"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><b/><sz val="14"/><color rgb="FF1F3B57"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><b/><sz val="10"/><color rgb="FF1F3B57"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><sz val="10"/><color rgb="FFB42318"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><sz val="10"/><color rgb="FF12715B"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><i/><sz val="9"/><color rgb="FF6B7280"/><name val="Calibri"/><family val="2"/></font>' +
      '</fonts>' +
      '<fills count="6">' +
        '<fill><patternFill patternType="none"/></fill>' +
        '<fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1F3B57"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF5"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFFDE7E4"/><bgColor indexed="64"/></patternFill></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFE4F3EC"/><bgColor indexed="64"/></patternFill></fill>' +
      '</fills>' +
      '<borders count="2">' +
        '<border><left/><right/><top/><bottom/><diagonal/></border>' +
        '<border><left style="thin"><color rgb="FFD5DCE4"/></left><right style="thin"><color rgb="FFD5DCE4"/></right>' +
        '<top style="thin"><color rgb="FFD5DCE4"/></top><bottom style="thin"><color rgb="FFD5DCE4"/></bottom><diagonal/></border>' +
      '</borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="' + STYLE_KEYS.length + '">' +
        STYLE_KEYS.map(function (k) {
          const s = STYLES[k];
          return '<xf numFmtId="' + s.fmt + '" fontId="' + s.font + '" fillId="' + s.fill + '" borderId="' + s.border + '" xfId="0"' +
            (s.fmt ? ' applyNumberFormat="1"' : '') +
            (s.font ? ' applyFont="1"' : '') +
            (s.fill ? ' applyFill="1"' : '') +
            (s.border ? ' applyBorder="1"' : '') +
            ' applyAlignment="1">' +
            ['', '<alignment vertical="center"/>', '<alignment horizontal="center" vertical="center" wrapText="1"/>',
             '<alignment vertical="top" wrapText="1"/>'][s.align] +
            '</xf>';
        }).join('') +
      '</cellXfs>' +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>';
  }

  /* -------------------------- Hoja ----------------------------- */
  function Sheet(name, index) {
    this.name = name;
    this.index = index;
    this.cells = {};       // "r,c" -> {v, s, t}
    this.maxR = -1;
    this.maxC = -1;
    this.colWidths = {};
    this.freezeRow = 0;
    this.freezeCol = 0;
    this.filterRef = null;
    this.merges = [];
    this.rowHeights = {};
  }

  Sheet.prototype.set = function (r, c, v, style) {
    if (v === null || v === undefined || v === '') {
      if (!style) { return this; }
    }
    this.cells[r + ',' + c] = { v: v, s: style || 'default' };
    if (r > this.maxR) this.maxR = r;
    if (c > this.maxC) this.maxC = c;
    return this;
  };

  Sheet.prototype.push = function (values, style) {
    const r = this.maxR + 1;
    for (let c = 0; c < values.length; c++) this.set(r, c, values[c], style);
    if (values.length === 0) { this.maxR = r; }
    return r;
  };

  Sheet.prototype.blank = function (n) {
    this.maxR += (n === undefined ? 1 : n);
    return this;
  };

  Sheet.prototype.widths = function (arr) {
    for (let i = 0; i < arr.length; i++) this.colWidths[i] = arr[i];
    return this;
  };

  Sheet.prototype.freeze = function (row, col) {
    this.freezeRow = row || 0;
    this.freezeCol = col || 0;
    return this;
  };

  Sheet.prototype.autofilter = function (r1, c1, r2, c2) {
    this.filterRef = cellRef(r1, c1) + ':' + cellRef(r2, c2);
    return this;
  };

  Sheet.prototype.merge = function (r1, c1, r2, c2) {
    this.merges.push(cellRef(r1, c1) + ':' + cellRef(r2, c2));
    if (r2 > this.maxR) this.maxR = r2;
    if (c2 > this.maxC) this.maxC = c2;
    return this;
  };

  Sheet.prototype.rowHeight = function (r, h) { this.rowHeights[r] = h; return this; };

  Sheet.prototype.toXml = function () {
    const self = this;
    const ref = this.maxR < 0 ? 'A1' : cellRef(0, 0) + ':' + cellRef(this.maxR, this.maxC);
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    x += '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    x += '<dimension ref="' + ref + '"/>';

    const pane = (this.freezeRow || this.freezeCol) ? (function () {
      const tl = cellRef(self.freezeRow, self.freezeCol);
      const active = self.freezeRow && self.freezeCol ? 'bottomRight' : (self.freezeRow ? 'bottomLeft' : 'topRight');
      return '<pane xSplit="' + (self.freezeCol || 0) + '" ySplit="' + (self.freezeRow || 0) + '" topLeftCell="' + tl + '" activePane="' + active + '" state="frozen"/>' +
        '<selection pane="' + active + '" activeCell="' + tl + '" sqref="' + tl + '"/>';
    })() : '<selection activeCell="A1" sqref="A1"/>';
    x += '<sheetViews><sheetView tabSelected="' + (this.index === 0 ? 1 : 0) + '" workbookViewId="0">' + pane + '</sheetView></sheetViews>';
    x += '<sheetFormatPr defaultRowHeight="15"/>';

    const cw = Object.keys(this.colWidths);
    if (cw.length) {
      x += '<cols>';
      cw.sort(function (a, b) { return a - b; }).forEach(function (k) {
        x += '<col min="' + (+k + 1) + '" max="' + (+k + 1) + '" width="' + self.colWidths[k] + '" customWidth="1"/>';
      });
      x += '</cols>';
    }

    x += '<sheetData>';
    const rows = {};
    Object.keys(this.cells).forEach(function (k) {
      const p = k.split(',');
      const r = +p[0];
      if (!rows[r]) rows[r] = [];
      rows[r].push({ r: r, c: +p[1], cell: self.cells[k] });
    });
    Object.keys(rows).map(Number).sort(function (a, b) { return a - b; }).forEach(function (r) {
      const rh = self.rowHeights[r];
      x += '<row r="' + (r + 1) + '"' + (rh ? ' ht="' + rh + '" customHeight="1"' : '') + '>';
      rows[r].sort(function (a, b) { return a.c - b.c; }).forEach(function (item) {
        const v = item.cell.v;
        const s = STYLE_KEYS.indexOf(item.cell.s);
        const sAttr = s > 0 ? ' s="' + s + '"' : '';
        if (v === null || v === undefined || v === '') {
          x += '<c r="' + cellRef(r, item.c) + '"' + sAttr + '/>';
        } else if (typeof v === 'number' && isFinite(v)) {
          x += '<c r="' + cellRef(r, item.c) + '"' + sAttr + '><v>' + v + '</v></c>';
        } else if (typeof v === 'boolean') {
          x += '<c r="' + cellRef(r, item.c) + '"' + sAttr + ' t="b"><v>' + (v ? 1 : 0) + '</v></c>';
        } else if (v instanceof Date) {
          x += '<c r="' + cellRef(r, item.c) + '"' + sAttr + '><v>' + dateSerial(v) + '</v></c>';
        } else {
          x += '<c r="' + cellRef(r, item.c) + '"' + sAttr + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
        }
      });
      x += '</row>';
    });
    x += '</sheetData>';

    if (this.filterRef) x += '<autoFilter ref="' + this.filterRef + '"/>';
    if (this.merges.length) {
      x += '<mergeCells count="' + this.merges.length + '">';
      this.merges.forEach(function (m) { x += '<mergeCell ref="' + m + '"/>'; });
      x += '</mergeCells>';
    }
    x += '</worksheet>';
    return x;
  };

  /* ------------------------ Libro ------------------------------ */
  function Workbook() { this.sheets = []; }

  Workbook.prototype.addSheet = function (name) {
    const clean = String(name).replace(/[\\\/\?\*\[\]:]/g, ' ').slice(0, 31) || ('Hoja' + (this.sheets.length + 1));
    const s = new Sheet(clean, this.sheets.length);
    this.sheets.push(s);
    return s;
  };

  Workbook.prototype.build = function () {
    const files = [];
    const n = this.sheets.length;

    let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    ct += '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">';
    ct += '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>';
    ct += '<Default Extension="xml" ContentType="application/xml"/>';
    ct += '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
    ct += '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>';
    for (let i = 0; i < n; i++) {
      ct += '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
    }
    ct += '</Types>';

    const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>';

    let wbXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    wbXml += '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">';
    wbXml += '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="20000" windowHeight="12000"/></bookViews>';
    wbXml += '<sheets>';
    for (let i = 0; i < n; i++) {
      wbXml += '<sheet name="' + esc(this.sheets[i].name) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>';
    }
    wbXml += '</sheets><calcPr calcId="191029"/></workbook>';

    let wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    wbRels += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    for (let i = 0; i < n; i++) {
      wbRels += '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>';
    }
    wbRels += '<Relationship Id="rId' + (n + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>';
    wbRels += '</Relationships>';

    files.push({ name: '[Content_Types].xml', data: enc.encode(ct) });
    files.push({ name: '_rels/.rels', data: enc.encode(rels) });
    files.push({ name: 'xl/workbook.xml', data: enc.encode(wbXml) });
    files.push({ name: 'xl/_rels/workbook.xml.rels', data: enc.encode(wbRels) });
    files.push({ name: 'xl/styles.xml', data: enc.encode(stylesXml()) });
    for (let i = 0; i < n; i++) {
      files.push({ name: 'xl/worksheets/sheet' + (i + 1) + '.xml', data: enc.encode(this.sheets[i].toXml()) });
    }
    return zip(files);
  };

  return { create: function () { return new Workbook(); }, colName: colName, dateSerial: dateSerial, _zip: zip };
});
