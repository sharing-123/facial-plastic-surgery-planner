"""Builds docs/Validation_Protocol_Facial_Analysis.docx (English edition)."""
from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

doc = Document()
sec = doc.sections[0]
sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
sec.left_margin = sec.right_margin = Cm(2.3)
sec.top_margin = sec.bottom_margin = Cm(2.2)

base = doc.styles["Normal"]
base.font.name = "Times New Roman"
base.font.size = Pt(11)
base.element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
base.paragraph_format.space_after = Pt(6)
base.paragraph_format.line_spacing = 1.15
for name, size in (("Heading 1", 14), ("Heading 2", 12), ("Heading 3", 11)):
    st = doc.styles[name]
    st.font.name = "Times New Roman"
    st.font.size = Pt(size)
    st.font.bold = True
    st.font.color.rgb = RGBColor(0, 0, 0)
    st.element.rPr.rFonts.set(qn("w:eastAsia"), "Times New Roman")
    st.paragraph_format.space_before = Pt(12 if name == "Heading 1" else 8)
    st.paragraph_format.space_after = Pt(4)
    st.paragraph_format.keep_with_next = True


def shade(cell, fill):
    pr = cell._tc.get_or_add_tcPr()
    s = OxmlElement("w:shd")
    s.set(qn("w:val"), "clear"); s.set(qn("w:color"), "auto"); s.set(qn("w:fill"), fill)
    pr.append(s)


def H(text, level=1):
    return doc.add_heading(text, level=level)


def P(text, italic=False, bold=False, size=None, align=None, after=None):
    p = doc.add_paragraph()
    r = p.add_run(text)
    r.italic, r.bold = italic, bold
    if size:
        r.font.size = Pt(size)
    if align is not None:
        p.alignment = align
    if after is not None:
        p.paragraph_format.space_after = Pt(after)
    return p


def B(items):
    for t in items:
        p = doc.add_paragraph(style="List Bullet")
        if isinstance(t, tuple):
            p.add_run(t[0]).bold = True
            p.add_run(" " + t[1])
        else:
            p.add_run(t)
        p.paragraph_format.space_after = Pt(2)


def T(header, rows, widths, font=9):
    t = doc.add_table(rows=1, cols=len(header))
    t.style = "Table Grid"
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    for i, h in enumerate(header):
        c = t.rows[0].cells[i]
        c.width = Cm(widths[i])
        c.text = ""
        r = c.paragraphs[0].add_run(h)
        r.bold, r.font.size = True, Pt(font)
        shade(c, "E4E7EB")
    pr = t.rows[0]._tr.get_or_add_trPr()
    th = OxmlElement("w:tblHeader"); th.set(qn("w:val"), "true"); pr.append(th)
    for row in rows:
        cells = t.add_row().cells
        for i, v in enumerate(row):
            cells[i].width = Cm(widths[i])
            cells[i].text = ""
            para = cells[i].paragraphs[0]
            para.paragraph_format.space_after = Pt(0)
            r = para.add_run(str(v))
            r.font.size = Pt(font)
            if i == 0:
                r.bold = True
    for row in t.rows:
        pr = row._tr.get_or_add_trPr()
        cs = OxmlElement("w:cantSplit"); cs.set(qn("w:val"), "true"); pr.append(cs)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)


fp = sec.footer.paragraphs[0]
fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
fr = fp.add_run("Validation protocol for facial analysis software, draft 1.0, page ")
fr.font.size = Pt(8.5)
for tag, txt in (("begin", None), (None, "PAGE"), ("end", None)):
    r = fp.add_run(); r.font.size = Pt(8.5)
    if tag:
        f = OxmlElement("w:fldChar"); f.set(qn("w:fldCharType"), tag); r._r.append(f)
    else:
        it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = txt; r._r.append(it)

C = WD_ALIGN_PARAGRAPH.CENTER
P("Validation Protocol", bold=True, size=11, align=C, after=0)
P("Facial Analysis Software for Plastic Surgery", bold=True, size=18, align=C, after=2)
P("Repeatability, accuracy, agreement with clinical assessment and responsiveness to change", italic=True, size=11.5, align=C, after=8)
T(["Item", "Description"], [
    ["Status", "Draft version 1.0 for review by the research team, a statistician and an ethics committee"],
    ["Date", "20 November 2026"],
    ["Study type", "Staged prospective measurement and accuracy validation (Phase 0 to 4) with blinded raters"],
    ["Software", "Research prototype with modules for image quality gating, proportions and symmetry, facial movement, nose, lines and wrinkles, red spots, wounds and scars, cleft lip, and before and after comparison"],
    ["Caution", "The acceptance thresholds and sample sizes below are proposals. The clinical team and a statistician should fix them before the protocol is registered and before the first validation data are collected."],
], [3.2, 13.2], font=10)

H("1. Aim and limits of the claims")
P("The software under validation measures symmetry, proportions, facial movement, lines and wrinkles, red spots, wounds and scars, and change before and after treatment from photographs or video. Testing to date used synthetic data and a small number of public photographs, and the same photographs were used to set thresholds. There is no evidence yet that its numbers agree with direct measurement or with physician judgement.")
P("The primary aims are listed below.", after=1)
B([("Repeatability.", "Whether two photographs of the same person taken on one occasion give the same numbers."),
   ("Accuracy.", "Whether distances in millimetres and ratios agree with a reference standard such as calipers and manual landmarking."),
   ("Clinical agreement.", "Whether the numbers correlate with the assessment of trained clinicians in real conditions."),
   ("Responsiveness.", "Whether reported changes match the changes judged by clinicians and stay absent in repeat photographs without true change."),
   ("Robustness.", "Whether results hold across realistic skin tones, cameras, lighting and head positions, and whether the quality gate rejects images that are truly unsuitable.")])
P("This protocol does not address whether a surgical result is attractive, whether patients are satisfied, or whether the tool improves clinical decisions or outcomes. Those questions need separate studies. The software does not produce a beauty score, a severity grade, a diagnosis or a prediction of outcome, and none of these is tested here.")

H("2. Design principles")
B([("Preregistration.", "The analysis plan and acceptance thresholds are registered, for example on the Open Science Framework, before any validation data are inspected."),
   ("Separation of data.", "Any photograph used to tune a threshold or to correct code, including the public photographs from development, is excluded from the validation set. The validation set is collected by people who took no part in tuning."),
   ("Frozen software.", "Before Phase 1 the SHA 256 hash of every code file, the MediaPipe model version and the library versions are recorded. A later change means that validation of the affected modules is repeated."),
   ("Blinded raters.", "Clinicians do not see the software output or each other's ratings. Image order is randomised. Analysts compute results with locked scripts."),
   ("Gate rejections count as results.", "Photographs rejected by the quality gate are reported as numbers with reasons and are not discarded silently. The primary analysis includes every image that was assessed."),
   ("Reporting guidelines.", "GRRAS for repeatability and agreement, STARD 2015 for diagnostic accuracy, COSMIN for measurement properties, and TRIPOD plus AI and CLAIM for the model based components.")])

H("3. What is validated")
T(["Module", "Claimed output", "Reference standard", "Phase"], [
    ["Quality gate", "Rejects photographs that cannot be measured", "Suitable or unsuitable rating by two clinicians, blinded", "1, 2"],
    ["Landmarks and millimetre scale", "Facial points and a scale from iris width (11.7 mm)", "Manual landmarking by two raters, calipers, scale card", "1"],
    ["Frontal proportions and symmetry", "Proportion ratios, paired point asymmetry in mm, canthal tilt", "Manual measurement by two raters on the same photograph, calipers", "1"],
    ["Nose", "Nasal index (frontal), profile angles and Goode ratio from clicked points", "Calipers, two raters marking profile points", "1, 2"],
    ["Facial movement (video)", "Deviation of mouth corner, brow and lid, symmetry ratio", "eFACE, Sunnybrook and House Brackmann scores from three clinicians", "2"],
    ["Lines and wrinkles", "Length and density of fine lines and folds per zone", "Wrinkle severity score per zone by two clinicians", "2"],
    ["Red spots (acne)", "Count of red lesion candidates per zone", "Lesion marking by two dermatologists", "2"],
    ["Wounds and scars", "Contour, area, length, angle to RSTL, colour", "Manual contours by two clinicians, RSTL lines by plastic surgeons, POSAS or VSS", "2"],
    ["Cleft lip", "Nasolabial symmetry ratio from 12 clicked points", "Asher McDade score by trained raters, repeat clicking of points", "2"],
    ["Before and after comparison", "Change that exceeds the noise floor", "Global change rating by clinician and patient", "3"],
], [3.3, 5.0, 6.4, 1.7])
P("Not validated because not claimed are a beauty score, acne grade, cleft severity class, diagnosis, surgical outcome prediction, three dimensional analysis and dark spot detection. The dark spot detector was switched off because it proved unreliable in early testing.", italic=True)

H("4. Overview of phases")
T(["Phase", "Participants", "Number", "Purpose", "Main output"], [
    ["0. Preparation", "Pilot of 5 people", "5", "Freeze code, preregister, write procedures, test the data flow", "List of procedural problems, code hash"],
    ["1. Healthy volunteers", "Healthy adults in 3 skin tone groups", "45 (15 per group)", "Repeatability, accuracy, robustness, gate", "ICC, bias, 95% limits of agreement, MDC"],
    ["2. Patients by condition", "Facial palsy, cleft lip, wound or scar, active acne, age range for wrinkles", "35, 35, 40, 40, 40", "Agreement with clinicians per module", "Correlation, AUC, Dice, sensitivity and PPV (Section 7)"],
    ["3. Longitudinal", "Patients undergoing facial procedures", "30", "Responsiveness to change", "Agreement with global change ratings"],
    ["4. Implementation (optional)", "Clinic workflow", "As the workflow allows", "Rejection rate and false reassurance", "Case review results"],
], [2.6, 4.4, 2.6, 3.8, 3.0], font=8.8)
P("Healthy volunteers in Phase 1 also serve as the normal control group for the AUC analyses in Phase 2, so no new controls need to be recruited.")

H("5. Procedure for photographs and video")
T(["Aspect", "Requirement"], [
    ["Camera", "Two phones of different class (high end and mid range) and one mirrorless or DSLR camera for a subset. At least 12 MP. No beauty filter, skin smoothing or automatic HDR. Focus and exposure locked. Record model, lens and file format."],
    ["Distance and height", "1.0 to 1.5 m on a tripod, lens equivalent to 50 to 85 mm, camera at eye level. Face width in the image of at least 1000 pixels."],
    ["Light", "Two diffuse lights at about 45 degrees on each side with balanced intensity, neutral grey background, no direct flash. One 18% grey card photograph per session."],
    ["Scale", "A printed ruler card of known length near the chin in a subset, to test scaling from the iris."],
    ["Head position", "Frankfort plane horizontal, looking at the lens, lips closed, neutral expression, eyes open. Hair kept off the forehead and brows. No glasses except in robustness tests. No makeup for the wrinkle and acne modules."],
    ["Movement video", "30 fps at 1080p. Fixed sequence of 2 seconds at rest, brow raise, gentle eye closure, smile, and return to rest."],
    ["Profile photographs", "Left and right lateral views with the head aligned to the Frankfort plane and lips neutral."],
    ["Required metadata", "Pseudonymous ID, session, camera, distance, lighting, skin tone group (Fitzpatrick, rated by two people), age, sex, glasses, beard and skin condition."],
], [3.2, 13.2])

H("6. Phase 1, healthy volunteers")
H("6.1 Participants", 2)
P("Forty five healthy adults aged 18 to 70 years, with 15 in each skin tone group (Fitzpatrick I to III, IV, and V to VI) and a mix of sexes and ages. Exclusions are previous facial surgery or trauma, facial palsy and extensive active skin disease (for the skin modules).")
H("6.2 Repeatability", 2)
P("Each participant is photographed in two sessions on the same day. Between sessions the participant stands up, sits down and is repositioned, with a gap of at least 10 minutes and the same photographer. A subset of 20 participants is photographed again 7 to 14 days later. From these data the ICC, SEM and MDC95 are computed, and the MDC95 also sets the noise floor for before and after comparison.")
H("6.3 Accuracy against calipers", 2)
P("Ten distances (intercanthal, right and left eye width, alar width, mouth width, glabella to subnasale height, subnasale to menton, bizygomatic width, bigonial width, and nasion to subnasale nose height) are measured by two raters with digital sliding calipers after the points are marked with a skin marker. Each rater measures each distance twice in random order and blinded to the software values. The reference is the mean of the four measurements. Photographs for the software are taken before the markers are applied. In a subset of 20 participants a three dimensional scan (VECTRA or phone photogrammetry) is added where available as a second reference.")
H("6.4 Landmark error", 2)
P("Two raters mark 25 landmarks on 20 photographs. The distance between each software point and the mean of the raters' points is calculated in millimetres, and agreement between raters is taken as a plausible upper bound of performance.")
H("6.5 Robustness and gate", 2)
P("In a subset of 20 participants one factor is changed at a time. The factors are lighting (diffuse, lateral, overhead), distance (1.0 and 2.0 m), head rotation (0, 5, 10 and 15 degrees), glasses, non neutral expression (smile, open mouth), camera type and heavy compression. The change in each metric and the gate rejection rate are recorded. Two clinicians rate every photograph as suitable or unsuitable for measurement, blinded. The sensitivity of the gate for rejecting truly unsuitable photographs and the proportion of suitable photographs wrongly rejected are calculated. The present gate thresholds were set by the prototype developers, and results from this section replace them with data based thresholds.")

H("7. Phase 2, patients by condition")
T(["Module", "Participants", "Raters and reference", "Main output", "Acceptance criterion (proposed)"], [
    ["Facial palsy", "35 patients, controls from Phase 1", "Three trained clinicians score the same video with eFACE, Sunnybrook and House Brackmann, blinded", "Spearman correlation of symmetry ratio or deviation with eFACE or Sunnybrook, AUC for palsy against normal", "rho of 0.70 or more, AUC of 0.85 or more with lower 95% CI bound of 0.75 or more"],
    ["Proportions and nose", "45 volunteers from Phase 1, 35 patients for profile", "Calipers, two raters marking profile points", "Bias and 95% limits of agreement, ICC", "Bias of 0.5 mm or less, limits within 2 mm, ICC of 0.90 or more"],
    ["Lines and wrinkles", "40 participants aged 25 to 75, all skin groups", "Two clinicians give a wrinkle severity score per zone on a harmonised 0 to 4 scale, blinded, with a same day repeat photograph", "Spearman per zone, ICC of the repeat photograph", "rho of 0.60 or more per zone, repeat ICC of 0.80 or more"],
    ["Red spots (acne)", "40 patients with active acne and at least 150 lesions", "Two dermatologists mark inflammatory lesions on photographs and resolve differences by consensus", "Lesion level sensitivity and PPV (a match when the distance is 2.5 mm or less), Bland Altman of counts per face", "Sensitivity and PPV of 0.70 or more, limits of agreement for counts reported"],
    ["Wounds and scars", "40 facial wounds or scars from at least 30 patients", "Two clinicians draw contours, two plastic surgeons draw RSTL direction on the photograph, two raters score POSAS or VSS", "Dice and area difference, RSTL angle difference between software and surgeons compared with the difference between surgeons, correlation of colour with POSAS", "Median Dice of 0.85 or more, median RSTL angle difference no greater than the difference between surgeons plus 10 degrees"],
    ["Cleft lip", "35 unilateral patients before or after repair, parental consent for children", "Two trained raters give Asher McDade scores on the same photographs, points clicked again by two people", "Click ICC, Spearman of symmetry ratio against score", "Click ICC of 0.85 or more, rho of 0.60 or more"],
    ["Gate in patients", "All Phase 2 participants", "Clinician review of 100% of rejected photographs and 20% of accepted photographs", "Rejection rate, accepted photographs with wrong facial points", "Accepted photographs with wrong points at 5% or less"],
], [2.5, 3.0, 4.2, 3.6, 3.2], font=8.3)
P("For the wound module it matters that the direction of the relaxed skin tension lines in the software is a prototype approximation that has not been matched to a standard atlas. Comparison with lines drawn by plastic surgeons in this section is the first validation of that component, and the result may lead to its replacement or restriction.")

H("8. Phase 3, change before and after treatment")
P("Thirty patients undergoing facial procedures (reanimation, reconstruction, or aesthetic procedures such as rhinoplasty and blepharoplasty) are photographed and filmed with the same procedure before treatment and at 3 months afterwards, with 6 and 12 months added where available. The order of each photograph pair is randomised. Two clinicians, blinded to the order, rate for each area whether there is a change and in which direction (better, unchanged, worse). Patients complete their own global rating of change.")
B(["The primary outcome is agreement on the direction of change between the software (beyond the noise floor) and clinicians, measured with weighted kappa.",
   "As a negative control, same day repeat photograph pairs from Phase 1 are used. The proportion of metrics reported as changed in unchanged pairs must be 5% or less.",
   "For responsiveness, the AUC of the software change measure is used to separate pairs rated as changed from those rated as unchanged.",
   "The noise floor is currently derived from landmark jitter and one simulation experiment. Phase 1 replaces it with the MDC95 from real repeatability data."])

H("9. Statistical analysis plan")
B([("Repeatability.", "ICC(2,1) for absolute agreement with 95% CI. SEM equals the SD multiplied by the square root of one minus ICC, and MDC95 equals 1.96 multiplied by the square root of 2 and by the SEM. Results are given per metric and per skin tone group."),
   ("Accuracy.", "Bias and 95% limits of agreement (Bland Altman) with a CI for each limit, Lin's concordance correlation coefficient, difference against mean plots, and a check for proportional bias."),
   ("Clinical agreement.", "Spearman correlation with CI, quadratic weighted kappa for ordinal data, AUC with CI (DeLong), and cut points fixed on development data and never on validation data."),
   ("Segmentation.", "Dice and IoU per case with median and interquartile range, and relative area difference."),
   ("Lesion detection.", "One to one matching of software points to dermatologist points within 2.5 mm, with sensitivity and PPV and Wilson confidence intervals."),
   ("RSTL angle.", "Absolute angle difference in degrees (0 to 90), compared with the difference between surgeons."),
   ("Influencing factors.", "Mixed models with a random intercept per participant to assess the effect of skin tone, camera, lighting, distance, head rotation and glasses on error."),
   ("Missing data.", "Gate rejections are reported as an outcome and analysed separately. No photograph is excluded after the data have been seen."),
   ("Subgroups.", "All primary outcomes are reported per skin tone group. Claims are limited to the groups that meet the acceptance criteria.")])

H("10. Sample size")
P("Calculations are based on the precision of estimates (the width of confidence intervals) and not on hypothesis tests. Assumptions come from general literature and from the prototype, so they should be confirmed in the Phase 0 pilot.")
T(["Aim", "Assumption", "Result", "Decision"], [
    ["Repeatability ICC (two sessions)", "Expected ICC of 0.85, full width of the 95% CI of 0.20, Bonett (2002) formula", "31 participants", "45, allowing for gate rejections and stratification into 3 skin groups"],
    ["Repeatability ICC, higher expectation", "ICC of 0.90, full CI width of 0.15", "26 participants", "Covered by 45"],
    ["Bland Altman limits of agreement", "SD of differences 1.0 mm, half width of the 95% CI of each limit of 0.6 mm", "35 participants (half width 0.55 mm at n of 40)", "45 (half width of about 0.52 mm)"],
    ["AUC for palsy against normal", "AUC of 0.90, half width of the 95% CI of 0.08, Hanley McNeil formula with equal groups", "32 per group", "35 patients, controls from the 45 volunteers"],
    ["Acne lesion detection", "Sensitivity of 0.80, Wilson half width of 0.064", "150 lesions", "40 patients with at least 150 marked lesions in total"],
    ["Segmentation, wrinkles, cleft", "Correlation and Dice estimates with reasonably narrow CI at 35 to 40 cases", "Practical judgement", "35 to 40 per condition, wounds from at least 30 patients so that cases are not counted twice"],
    ["Change before and after", "Expected weighted kappa of 0.6 on 30 pairs with several areas", "Rough estimate with a wide CI", "30 patients, reported as a pilot study"],
], [3.4, 5.5, 3.6, 3.9], font=8.5)
P("The figures in the result column were calculated with a script and can be reproduced. Phase 3 is deliberately described as a pilot, since 30 patients give limited precision for kappa.", italic=True)

H("11. Decision rules")
B([("Pass.", "All primary criteria of a module are met in every skin tone group and camera tested. The module may be used for research and monitoring within the limits reported."),
   ("Conditional pass.", "The criteria are met in some groups or conditions. Claims are restricted, for example to frontal photographs under diffuse light or to specific skin tone groups, and the gate is tightened for other conditions."),
   ("Fail.", "The primary criteria are not met. The module is switched off or replaced, and its validation is repeated on new data after the change. One example already exists, since the dark spot detector was switched off during development."),
   ("Safety stopping rule.", "If case review finds a photograph that passes the gate but gives a wrong result that creates false reassurance about a real clinical finding, the module is suspended until the cause is understood.")])

H("12. Safety during validation")
B(["Software output is not used for clinical decisions during validation and is not shown to the rating clinicians.",
   "If a photograph shows a finding that may be clinically important, for example a suspicious skin lesion, the clinical investigator contacts the participant and refers them in the usual way.",
   "Participants in Phases 2 and 3 receive standard care that is not influenced by taking part.",
   "If the software is later considered for clinical decisions, including in outpatient clinics or emergency departments, its regulatory status must be reviewed first and Phase 4 carried out."])

H("13. Ethics and data protection")
B(["Approval from the institutional health research ethics committee is obtained before recruitment.",
   "Written informed consent is obtained after explanation. For children, for example in cleft lip, consent from a parent or guardian is obtained together with assent from the child where age allows. Participants may withdraw without consequence.",
   "Facial photographs are personal data linked to identity, and covering the eyes does not make them anonymous. They are handled under applicable data protection law and institutional policy.",
   "Pseudonymous IDs are used. The key linking identity is kept separately and encrypted. Photographs are stored on encrypted storage with restricted access.",
   "Photographs are not uploaded to cloud or third party services, and all processing runs locally.",
   "Separate consent is obtained for use of images in publications or presentations. Without it the images are not published.",
   "Data retention and destruction are fixed before recruitment, and the policy for sharing anonymised data is stated in the final protocol."])

H("14. Data management and quality")
B(["Case report forms (Appendix A) are completed on the day of image capture, and two people check 10% of the data at random.",
   "Raw files are never altered. Each software output is stored with the code version and hash.",
   "Analyses run with scripts that are locked before the data are opened. Changes to the plan are recorded as dated amendments with reasons.",
   "Raters are trained and calibrated before rating, with 10 practice cases followed by a check of inter rater agreement. Calibration is repeated if agreement falls."])

H("15. Methodological risks and mitigation")
T(["Risk", "Mitigation"], [
    ["Leakage of data from development to validation", "A new validation set is collected, development photographs are not used, and the code is frozen and hashed"],
    ["Spectrum bias (only clear cases or only ideal faces)", "Consecutive recruitment, inclusion of mild cases, and recording of reasons for exclusion"],
    ["Underrepresented skin tone groups", "A quota of 15 per group, results per group, and restricted claims where criteria fail"],
    ["Differences in light and camera between visits", "Standard procedure, grey card, recording of conditions, robustness analysis, and texture comparison only when conditions are comparable"],
    ["Landmark failure on pathological faces", "Review of 100% of rejected and 20% of accepted photographs, reporting of point failures, and clicked points for cleft lip"],
    ["Gate rejections removing difficult cases", "Rejections counted as results and every assessed image analysed"],
    ["Rater drift", "Training and calibration, periodic inter rater agreement checks, and randomised order"],
    ["Investigators too familiar with the software", "Clinical raters take no part in development and analysts are blinded where possible"],
], [6.2, 10.2])

H("16. Timeline and resources")
T(["Month", "Activity"], [
    ["0 to 2", "Preparation, preregistration, ethics approval, equipment, rater training and Phase 0"],
    ["3 to 4", "Phase 1 (healthy volunteers) and first repeatability analysis"],
    ["4 to 8", "Phase 2 (patients by condition), run in parallel across conditions"],
    ["6 to 11", "Phase 3 (before and after treatment, follow up at 3 months)"],
    ["10 to 12", "Final analysis, decision for each module and manuscript"],
], [3.0, 13.4])
P("The team consists of a clinical principal investigator, two rating clinicians and one reserve, two dermatologists, two plastic surgeons for RSTL lines and wound rating, one statistician, one trained photographer and one software developer who does not rate. Equipment comprises two phones of different class, one mirrorless or DSLR camera, two diffuse lights with a tripod, digital sliding calipers, an 18% grey card, a printed scale card and encrypted storage.")

H("17. Reporting and outputs")
P("The manuscript follows GRRAS, STARD 2015, COSMIN, TRIPOD plus AI and CLAIM. Code, versions and analysis scripts are provided as supplements. Negative results and failed modules are reported as fully as positive results.")

H("Appendix A. Content of the case report form for each session")
B(["Pseudonymous ID, date, session, capture number and photographer name.",
   "Age, sex, skin tone group (raters 1 and 2), glasses, beard, makeup, skin condition and history of facial procedures.",
   "Camera, lens, distance, lighting, grey card result and file name.",
   "Caliper measurements (rater, repetition, value).",
   "Clinician scores (scale, rater, subscores), suitable or unsuitable rating and change rating.",
   "Adverse event notes and reasons for exclusion."])
H("Appendix B. Checklist before taking photographs")
B(["Camera on standard mode with beauty filters off and focus and exposure locked.",
   "Distance and camera height correct and the grey card photographed.",
   "Head aligned to the Frankfort plane, eyes open and looking at the lens, lips closed, and hair away from the forehead and brows.",
   "No glasses (except in robustness tests) and no makeup (skin modules).",
   "Metadata completed and two spare photographs taken.",
   "Movement video recorded in the fixed sequence where applicable."])
H("Appendix C. Template of the results table for each module")
T(["Metric", "n", "ICC (95% CI)", "Bias (mm)", "95% limits of agreement", "MDC95", "Decision"], [
    ["Example, alar width", "", "", "", "", "", ""],
    ["Example, smile symmetry ratio", "", "", "", "", "", ""],
], [3.8, 1.2, 2.6, 1.8, 3.0, 1.7, 2.3], font=8.5)
P("Each row is completed per skin tone group and overall. The decision is entered as pass, conditional pass or fail according to Section 11.", italic=True)

OUT = Path(__file__).resolve().parent.parent / "docs" / "Validation_Protocol_Facial_Analysis.docx"
OUT.parent.mkdir(exist_ok=True)
doc.save(str(OUT))
print("saved", OUT)
