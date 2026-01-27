Tasks / TODO

## 🎯 Goal

Improve stability, extraction quality, and UX trust
**without expanding product scope**

---

## 🔥 P0 — Stability & Critical Fixes (DO FIRST)

### ✅ P0.1 Fix download crash (CSV / JSON)

* [x] Wrap export logic in try/catch
* [x] Handle empty data before export
* [x] Prevent double-click on Download
* [x] Disable Download button while generating file
* [x] Show error message instead of silent crash

---

### ✅ P0.2 Prevent empty / broken exports

* [x] Block export when rows < 1
* [x] Show message: "No data to export"
* [x] Ensure CSV/JSON always valid UTF-8

---

### ✅ P0.3 Explicit product limitations in UI

* [x] Add text: "Extracts data only from the current page"
* [x] Show message on first run
* [x] Show message on empty result

---

## 🟠 P1 — UX & Trust Improvements

### ✅ P1.1 Text normalization

* [x] trim text values
* [x] remove `\n`, `\t`
* [x] normalize multiple spaces

---

### ✅ P1.2 Highlight source element on table hover

* [x] Store reference to source DOM element
* [x] Add outline on hover
* [x] Remove outline on mouseout
* [x] Ensure no layout shift

---

### ✅ P1.3 Result summary

* [x] Show "X rows extracted"
* [x] Show "Y columns detected"
* [x] Reset summary on new extract

---

### ✅ P1.4 Explicit error / empty states

* [x] No repeating elements found
* [x] Not enough rows (<3)
* [x] Region too small (handled via empty state)
* [x] Never fail silently

---

## 🟡 P2 — Extraction Quality (No Scope Creep)

### ⬜ P2.1 Extract mode selector

* [ ] Add mode: Auto / Text / Link / Image
* [ ] Default = Auto
* [ ] Apply mode consistently to all rows

---

### ⬜ P2.2 Re-extract button

* [ ] Add "Re-extract" action
* [ ] Allow manual scroll before re-run
* [ ] No auto pagination

---

### ⬜ P2.3 Limit number of rows (Top N)

* [ ] Add options: 20 / 50 / 100
* [ ] Default = unlimited
* [ ] Apply before export

---

## 🟢 P3 — Region-Based Extraction (v0.2 Core)

### ✅ P3.1 Region select UI

* [x] Add overlay
* [x] Drag & select rectangle
* [x] Store selection coordinates
* [x] Cancel selection

---

### ✅ P3.2 Detect region root container

* [x] Collect elements inside region
* [x] Find minimal common ancestor (LCA)
* [x] Fallback with error if not found

---

### ✅ P3.3 Auto-detect rows

* [x] Find repeating elements (≥3)
* [x] Same tag & structure
* [x] Avoid nested rows
* [x] Limit depth to 3

---

### ✅ P3.4 Detect columns (cell alignment)

* [x] Find atomic elements inside rows
* [x] Group by relative DOM path
* [x] Keep paths in ≥70% rows
* [x] Sort columns left → right

---

### ✅ P3.5 Region extraction preview

* [x] Show preview (5–10 rows)
* [x] Extract / Cancel buttons
* [x] No extract without confirmation

---

## 🟣 P4 — Feedback & Learning

### ⬜ P4.1 Contextual micro-feedback

* [ ] Ask: "Did it work?"
* [ ] Yes / No buttons
* [ ] Optional text input if No
* [ ] Non-blocking UX

---

### ⬜ P4.2 Local extraction metrics (optional)

* [ ] Track success / fail
* [ ] Track rows count
* [ ] No personal data
* [ ] Ability to disable

---

## ❌ Explicitly Out of Scope (DO NOT ADD)

```text
- Pagination
- Multi-page scraping
- Infinite scroll automation
- AI inference
- Schema editor
- Saved projects
- Accounts
- Integrations
```

---

## ✅ Recommended execution order (realistic)

**Week 1**

* P0.1 → P0.3
* P1.1 → P1.4

**Week 2**

* P3.1 → P3.5 (region)
* P2.2 (re-extract)
