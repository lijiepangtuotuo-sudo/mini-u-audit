# Design QA

- Source visual reference: `/Users/lijie/Desktop/截屏2026-08-19 16.51.21.png`
- Implementation capture: `qa-desktop-final.png`
- Secondary responsive capture: `qa-mobile.png`
- Source size: 1055 x 664 px.
- Desktop implementation size: 1280 x 969 px at the browser's standard desktop viewport.
- Mobile implementation size: 390 x 2175 px at a 390 x 844 CSS viewport.
- State: 3D rendering audit selected; an uploaded image with four detected regions; first region selected.

## Comparison scope

The source is a functional reference for the three-column review workbench and its visual language. The implementation intentionally uses a different uploaded test image and adds an explicit report bar, so this is a structure-and-usability comparison rather than a pixel-for-pixel clone. The source and implementation were viewed together before this review.

## Fidelity surfaces

- Typography: Chinese UI text has a compact, clear hierarchy. Small supporting text remains readable and does not truncate critical content at desktop or 390 px mobile widths.
- Layout and spacing: The type selector, role list, annotated image, and result panel preserve the intended review order. The layout stacks into a readable single column on mobile.
- Colors and states: Violet is used for selection and action, while green, amber, and red distinguish pass, review, and fail states. State color is always paired with text and an icon.
- Image treatment: Uploaded images retain their aspect ratio. The annotation layer is positioned inside the image frame, preventing box drift in letterboxed images.
- Content: Copy clearly explains that low-confidence local recognition becomes review rather than a hard failure.

## Primary interactions verified

1. Uploaded `/Users/lijie/Desktop/截屏2026-08-19 15.20.13.png` through the visible upload action.
2. Confirmed four detected regions, selected a region, and displayed its result card and rule list.
3. Used `人工改判` to set a region to `通过`; the result, summary count, reasons, and all applicable rule rows updated together.
4. Confirmed the report export action becomes available after analysis.
5. Checked the browser console: no warnings or errors.
6. Uploaded `/Users/lijie/Desktop/截屏2026-08-20 12.06.45.png`; the refined horizontal-cluster pass returned 3 role candidates instead of applying the four-view reference shortcut.
7. Confirmed every detected frame exposes four resize handles and its own `删除` control. Deleted the second candidate and verified that the role count and review count changed from 3 to 2.
8. Confirmed that locally detected generated images no longer receive an automatic `通过`: hand/finger, lower-body, and full-proportion checks now render as `待核验` until a structural vision model or designer confirms them.
9. Confirmed the human-review form requires an outcome, at least one related audit dimension, and a written record. A `通过` decision explicitly requires a written basis; `需复核` and `不通过` require the current issue point.
10. Confirmed human-review records persist in the local audit library, are included in the exported JSON report, and non-pass records appear as clearly labelled historical review hints in later analyses. They do not alter the new image's check states or conclusion.
11. Confirmed tall 3D render detections use a compact, upper-subject frame by default and the stage footer no longer contains operational copy that competes with image editing.
12. Confirmed the 3D glasses check passes based on white round frames only; pink temples, eye style, and expression do not affect this dimension. In line-art mode, the check covers only round-frame placement and structure, without a white-colour requirement. Manual decisions update only the selected dimensions; untouched dimensions keep their original analysis state.
13. Confirmed the report area exposes a preview action and clearly labels the download as JSON. The preview lists source image, audit type, per-role result, non-pass dimensions, manual notes, and the audit-library count.
14. Confirmed strict 3D review reserves automatic pass for approved reference views only. Generated 3D images now require material, expression, limb, and scene-prop confirmation. Scene props such as headphones, microphones, books, cups, and trophies only require review when they obscure or replace a key character structure.
15. Confirmed the local detector returns up to 12 vertically and horizontally separated candidate regions. Historical issue-library records remain separate from the current per-role conclusion, so standard multi-view references cannot receive false issues from past cases.
16. Confirmed black-and-white line mode has an independent five-item checklist: U contour, body and limb proportion, glasses placement, facial-feature placement, and linework structure. Colour, material, and scene-prop checks are absent from this mode.

## Findings

No actionable P0, P1, or P2 visual issues remain in the tested desktop and mobile states.

## Follow-up polish

- P3: When a production visual-recognition service is connected, replace the local color-based detector note with the service confidence and model version.
- P3: The local detector is intentionally conservative: it routes uncertain results to review. Production-level recognition accuracy still requires a vision model trained or calibrated on approved small U examples.
- P3: The current local implementation can prevent false approval, but it cannot independently identify malformed fingers or lower-body proportions. Those checks require a connected multimodal vision model and a calibrated set of approved and rejected examples.
- P3: The current calibration set is documented in `calibration-baseline.md`. It separates permitted scene props and rendering styles from structural defects, so later vision-model tuning does not treat every accessory or dark-colored object as a failure.

final result: passed
