package handlers

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

var cellRefRe = regexp.MustCompile(`^([A-Z]+)([0-9]+)$`)

func buildSimpleXLSX(headers []string, rows [][]string) ([]byte, error) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)

	files := map[string]string{
		"[Content_Types].xml":        contentTypesXML(),
		"_rels/.rels":                rootRelsXML(),
		"xl/workbook.xml":            workbookXML(),
		"xl/_rels/workbook.xml.rels": workbookRelsXML(),
		"xl/styles.xml":              stylesXML(),
		"xl/worksheets/sheet1.xml":   worksheetXML(headers, rows),
	}
	paths := make([]string, 0, len(files))
	for p := range files {
		paths = append(paths, p)
	}
	sort.Strings(paths)
	for _, path := range paths {
		w, err := zw.Create(path)
		if err != nil {
			return nil, err
		}
		if _, err := w.Write([]byte(files[path])); err != nil {
			return nil, err
		}
	}
	if err := zw.Close(); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

func parseSimpleXLSX(r io.Reader) ([][]string, error) {
	data, err := io.ReadAll(r)
	if err != nil {
		return nil, err
	}
	zr, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, fmt.Errorf("invalid xlsx zip: %w", err)
	}

	var worksheetData []byte
	var sharedData []byte
	for _, f := range zr.File {
		switch f.Name {
		case "xl/worksheets/sheet1.xml":
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			worksheetData, err = io.ReadAll(rc)
			_ = rc.Close()
			if err != nil {
				return nil, err
			}
		case "xl/sharedStrings.xml":
			rc, err := f.Open()
			if err != nil {
				return nil, err
			}
			sharedData, err = io.ReadAll(rc)
			_ = rc.Close()
			if err != nil {
				return nil, err
			}
		}
	}
	if len(worksheetData) == 0 {
		return nil, fmt.Errorf("worksheet xl/worksheets/sheet1.xml not found")
	}

	shared, err := parseSharedStrings(sharedData)
	if err != nil {
		return nil, err
	}
	return parseWorksheetRows(worksheetData, shared)
}

type worksheet struct {
	Rows []xmlRow `xml:"sheetData>row"`
}
type xmlRow struct {
	R     int       `xml:"r,attr"`
	Cells []xmlCell `xml:"c"`
}
type xmlCell struct {
	Ref string `xml:"r,attr"`
	T   string `xml:"t,attr"`
	V   string `xml:"v"`
	IS  struct {
		T string `xml:"t"`
	} `xml:"is"`
}

func parseWorksheetRows(data []byte, shared []string) ([][]string, error) {
	var ws worksheet
	if err := xml.Unmarshal(data, &ws); err != nil {
		return nil, fmt.Errorf("invalid worksheet xml: %w", err)
	}
	out := make([][]string, 0, len(ws.Rows))
	for _, r := range ws.Rows {
		maxCol := 0
		for _, c := range r.Cells {
			col, _, ok := parseCellRef(c.Ref)
			if ok && col > maxCol {
				maxCol = col
			}
		}
		if maxCol == 0 {
			maxCol = len(r.Cells)
		}
		row := make([]string, maxCol)
		for _, c := range r.Cells {
			col, _, ok := parseCellRef(c.Ref)
			if !ok || col <= 0 {
				continue
			}
			value := strings.TrimSpace(c.V)
			if c.T == "inlineStr" {
				value = c.IS.T
			} else if c.T == "s" && value != "" {
				i, err := strconv.Atoi(value)
				if err == nil && i >= 0 && i < len(shared) {
					value = shared[i]
				}
			}
			row[col-1] = value
		}
		out = append(out, row)
	}
	return out, nil
}

func parseSharedStrings(data []byte) ([]string, error) {
	if len(data) == 0 {
		return nil, nil
	}
	type si struct {
		T string `xml:"t"`
	}
	type sst struct {
		Items []si `xml:"si"`
	}
	var parsed sst
	if err := xml.Unmarshal(data, &parsed); err != nil {
		return nil, fmt.Errorf("invalid sharedStrings.xml: %w", err)
	}
	out := make([]string, 0, len(parsed.Items))
	for _, item := range parsed.Items {
		out = append(out, item.T)
	}
	return out, nil
}

func worksheetXML(headers []string, rows [][]string) string {
	allRows := make([][]string, 0, len(rows)+1)
	allRows = append(allRows, headers)
	allRows = append(allRows, rows...)
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`)
	b.WriteString(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`)
	for rIdx, row := range allRows {
		b.WriteString(fmt.Sprintf(`<row r="%d">`, rIdx+1))
		for cIdx, v := range row {
			ref := fmt.Sprintf("%s%d", colToLetters(cIdx+1), rIdx+1)
			b.WriteString(fmt.Sprintf(`<c r="%s" t="inlineStr"><is><t>%s</t></is></c>`, ref, xmlEscape(v)))
		}
		b.WriteString(`</row>`)
	}
	b.WriteString(`</sheetData></worksheet>`)
	return b.String()
}

func colToLetters(col int) string {
	if col <= 0 {
		return ""
	}
	var out []byte
	for col > 0 {
		col--
		out = append([]byte{byte('A' + (col % 26))}, out...)
		col /= 26
	}
	return string(out)
}

func parseCellRef(ref string) (col int, row int, ok bool) {
	m := cellRefRe.FindStringSubmatch(ref)
	if len(m) != 3 {
		return 0, 0, false
	}
	col = 0
	for _, ch := range m[1] {
		col = col*26 + int(ch-'A'+1)
	}
	row, err := strconv.Atoi(m[2])
	if err != nil {
		return 0, 0, false
	}
	return col, row, true
}

func xmlEscape(v string) string {
	var b bytes.Buffer
	_ = xml.EscapeText(&b, []byte(v))
	return b.String()
}

func contentTypesXML() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
}

func rootRelsXML() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
}

func workbookXML() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Sheet1" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
}

func workbookRelsXML() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
}

func stylesXML() string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border/></borders>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellXfs>
</styleSheet>`
}
