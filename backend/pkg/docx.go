package pkg

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"note_all_backend/global"
)

type Rel struct {
	Id     string `xml:"Id,attr"`
	Target string `xml:"Target,attr"`
}

type Rels struct {
	Relationships []Rel `xml:"Relationship"`
}

type ValAttr struct {
	Val string `xml:"val,attr"`
}

type Lvl struct {
	Ilvl    int     `xml:"ilvl,attr"`
	NumFmt  ValAttr `xml:"numFmt"`
	LvlText ValAttr `xml:"lvlText"`
}

type AbstractNum struct {
	Id   string `xml:"abstractNumId,attr"`
	Lvls []Lvl  `xml:"lvl"`
}

type Num struct {
	Id            string  `xml:"numId,attr"`
	AbstractNumId ValAttr `xml:"abstractNumId"`
}

type Numbering struct {
	AbstractNums []AbstractNum `xml:"abstractNum"`
	Nums         []Num         `xml:"num"`
}

type NumPr struct {
	Ilvl  *ValAttr `xml:"ilvl"`
	NumId *ValAttr `xml:"numId"`
}

type Style struct {
	StyleId string `xml:"styleId,attr"`
	NumPr   *NumPr `xml:"pPr>numPr"`
}

type Styles struct {
	Styles []Style `xml:"style"`
}

// ExtractTextFromDocx extracts structured markdown (text, headings, basic styles, tables, images, and auto-numbering) from a DOCX file byte slice
func ExtractTextFromDocx(fileBytes []byte) (string, error) {
	reader, err := zip.NewReader(bytes.NewReader(fileBytes), int64(len(fileBytes)))
	if err != nil {
		return "", fmt.Errorf("failed to open docx as zip: %v", err)
	}

	relsMap := make(map[string]string)
	numIdToAbs := make(map[string]string)
	absToLvls := make(map[string]map[int]Lvl)
	styleToNumPr := make(map[string]*NumPr)

	for _, f := range reader.File {
		switch f.Name {
		case "word/_rels/document.xml.rels":
			if rc, err := f.Open(); err == nil {
				var rels Rels
				if err := xml.NewDecoder(rc).Decode(&rels); err == nil {
					for _, r := range rels.Relationships {
						relsMap[r.Id] = r.Target
					}
				}
				rc.Close()
			}
		case "word/numbering.xml":
			if rc, err := f.Open(); err == nil {
				var num Numbering
				if err := xml.NewDecoder(rc).Decode(&num); err == nil {
					for _, n := range num.Nums {
						numIdToAbs[n.Id] = n.AbstractNumId.Val
					}
					for _, an := range num.AbstractNums {
						lvlMap := make(map[int]Lvl)
						for _, l := range an.Lvls {
							lvlMap[l.Ilvl] = l
						}
						absToLvls[an.Id] = lvlMap
					}
				}
				rc.Close()
			}
		case "word/styles.xml":
			if rc, err := f.Open(); err == nil {
				var styles Styles
				if err := xml.NewDecoder(rc).Decode(&styles); err == nil {
					for _, s := range styles.Styles {
						if s.NumPr != nil {
							styleToNumPr[s.StyleId] = s.NumPr
						}
					}
				}
				rc.Close()
			}
		}
	}

	extractMedia := func(rId string) string {
		target, ok := relsMap[rId]
		if !ok {
			return ""
		}
		target = strings.TrimPrefix(target, "/")
		if !strings.HasPrefix(target, "word/") && !strings.HasPrefix(target, "media/") {
			target = "word/" + target
		} else if strings.HasPrefix(target, "media/") {
			target = "word/" + target
		}

		for _, f := range reader.File {
			if f.Name == target {
				rc, err := f.Open()
				if err != nil {
					return ""
				}
				defer rc.Close()
				ext := filepath.Ext(target)
				secureName := fmt.Sprintf("img_%d%s", time.Now().UnixNano(), ext)
				storageID, err := global.Storage.Save(secureName, rc)
				if err != nil {
					return ""
				}
				return fmt.Sprintf("![image](/api/file/%s)", storageID)
			}
		}
		return ""
	}

	var documentFile *zip.File
	for _, f := range reader.File {
		if f.Name == "word/document.xml" {
			documentFile = f
			break
		}
	}

	if documentFile == nil {
		return "", fmt.Errorf("word/document.xml not found in docx")
	}

	rc, err := documentFile.Open()
	if err != nil {
		return "", fmt.Errorf("failed to open word/document.xml: %v", err)
	}
	defer rc.Close()

	decoder := xml.NewDecoder(rc)
	var textBuf strings.Builder

	inRun := false
	inTableCell := false
	
	isBold := false
	isItalic := false

	headingLevel := 0
	rowCount := 0
	cellCount := 0

	var path []string

	counters := make(map[string]map[int]int)

	var currentPStyle string
	var currentNumPr *NumPr
	prefixWritten := false

	writePrefix := func() {
		if prefixWritten {
			return
		}
		prefixWritten = true

		if headingLevel > 0 && headingLevel <= 6 {
			textBuf.WriteString(strings.Repeat("#", headingLevel) + " ")
		}

		numPr := currentNumPr
		if numPr == nil && currentPStyle != "" {
			numPr = styleToNumPr[currentPStyle]
		}

		if numPr != nil && numPr.NumId != nil {
			numId := numPr.NumId.Val
			ilvl := 0
			if numPr.Ilvl != nil {
				ilvl, _ = strconv.Atoi(numPr.Ilvl.Val)
			}

			absId, ok := numIdToAbs[numId]
			if ok {
				lvlMap := absToLvls[absId]
				lvl, lvlOk := lvlMap[ilvl]
				if lvlOk {
					if counters[absId] == nil {
						counters[absId] = make(map[int]int)
					}
					counters[absId][ilvl]++
					for k := range counters[absId] {
						if k > ilvl {
							counters[absId][k] = 0
						}
					}

					if lvl.NumFmt.Val == "bullet" {
						textBuf.WriteString("- ")
					} else {
						txt := lvl.LvlText.Val
						for i := 1; i <= 9; i++ {
							placeholder := fmt.Sprintf("%%%d", i)
							if strings.Contains(txt, placeholder) {
								val := counters[absId][i-1]
								txt = strings.ReplaceAll(txt, placeholder, strconv.Itoa(val))
							}
						}
						textBuf.WriteString(txt + " ")
					}
				}
			}
		}
	}

	var tempNumPr *NumPr

	for {
		t, err := decoder.Token()
		if err == io.EOF {
			break
		}
		if err != nil {
			break
		}

		switch se := t.(type) {
		case xml.StartElement:
			name := se.Name.Local
			path = append(path, name)

			switch name {
			case "p":
				headingLevel = 0
				currentPStyle = ""
				currentNumPr = nil
				tempNumPr = nil
				prefixWritten = false
			case "pStyle":
				for _, attr := range se.Attr {
					if attr.Name.Local == "val" {
						currentPStyle = attr.Value
						if strings.HasPrefix(currentPStyle, "Heading") {
							fmt.Sscanf(currentPStyle, "Heading%d", &headingLevel)
						} else if currentPStyle == "1" || currentPStyle == "2" || currentPStyle == "3" || currentPStyle == "4" || currentPStyle == "5" || currentPStyle == "6" {
							fmt.Sscanf(currentPStyle, "%d", &headingLevel)
						}
					}
				}
			case "numPr":
				tempNumPr = &NumPr{}
			case "ilvl":
				if tempNumPr != nil {
					for _, attr := range se.Attr {
						if attr.Name.Local == "val" {
							tempNumPr.Ilvl = &ValAttr{Val: attr.Value}
						}
					}
				}
			case "numId":
				if tempNumPr != nil {
					for _, attr := range se.Attr {
						if attr.Name.Local == "val" {
							tempNumPr.NumId = &ValAttr{Val: attr.Value}
						}
					}
				}
			case "r":
				inRun = true
				isBold = false
				isItalic = false
			case "b":
				if inRun {
					isBold = true
				}
			case "i":
				if inRun {
					isItalic = true
				}
			case "tbl":
				textBuf.WriteString("\n\n")
				rowCount = 0
			case "tr":
				textBuf.WriteString("|")
				cellCount = 0
			case "tc":
				inTableCell = true
				cellCount++
				textBuf.WriteString(" ")
			case "blip":
				for _, attr := range se.Attr {
					if attr.Name.Local == "embed" {
						imgTag := extractMedia(attr.Value)
						if imgTag != "" {
							writePrefix()
							textBuf.WriteString(imgTag)
						}
					}
				}
			}

		case xml.EndElement:
			name := se.Name.Local
			if len(path) > 0 {
				path = path[:len(path)-1]
			}

			switch name {
			case "p":
				if inTableCell {
					textBuf.WriteString("<br>")
				} else {
					textBuf.WriteString("\n\n")
				}
			case "numPr":
				if tempNumPr != nil {
					currentNumPr = tempNumPr
					tempNumPr = nil
				}
			case "r":
				inRun = false
			case "tbl":
				textBuf.WriteString("\n")
			case "tr":
				textBuf.WriteString("\n")
				rowCount++
				if rowCount == 1 {
					textBuf.WriteString("|")
					for i := 0; i < cellCount; i++ {
						textBuf.WriteString("---|")
					}
					textBuf.WriteString("\n")
				}
			case "tc":
				inTableCell = false
				s := textBuf.String()
				if strings.HasSuffix(s, "<br>") {
					s = strings.TrimSuffix(s, "<br>")
					textBuf.Reset()
					textBuf.WriteString(s)
				}
				textBuf.WriteString(" |")
			}

		case xml.CharData:
			if len(path) > 0 && path[len(path)-1] == "t" {
				str := string(se)
				str = strings.ReplaceAll(str, "\n", "")
				str = strings.ReplaceAll(str, "\r", "")
				
				if str != "" {
					writePrefix()
					
					if isBold && isItalic {
						textBuf.WriteString("***" + str + "***")
					} else if isBold {
						textBuf.WriteString("**" + str + "**")
					} else if isItalic {
						textBuf.WriteString("*" + str + "*")
					} else {
						textBuf.WriteString(str)
					}
				}
			}
		}
	}

	res := textBuf.String()
	for strings.Contains(res, "\n\n\n") {
		res = strings.ReplaceAll(res, "\n\n\n", "\n\n")
	}

	return strings.TrimSpace(res), nil
}
