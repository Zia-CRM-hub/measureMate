/** Fictional-neutral starter templates seeded per tenant. Warning ranges are in centimetres. */
type F = [key: string, label: string, minCm: number, maxCm: number, required?: boolean, help?: string];
export interface SystemTemplate { name: string; category: string; sections: { name: string; fields: F[] }[] }

const upper: F[] = [
  ['neck', 'Neck', 25, 55, false, 'Measured at the base of the neck'],
  ['shoulder', 'Shoulder', 28, 60, true, 'Seam to seam across the back'],
  ['chest', 'Chest', 60, 160, true, 'Fullest part, tape level under the arms'],
  ['waist', 'Waist', 50, 160, true, 'Natural waistline'],
  ['hip', 'Hip', 60, 170, false, 'Fullest part of the hip'],
];
const sleeve: F[] = [
  ['sleeve_length', 'Sleeve length', 30, 80, true, 'Shoulder point to wrist'],
  ['bicep', 'Bicep', 18, 60, false],
  ['wrist', 'Wrist / cuff', 12, 30, false],
];
const lower: F[] = [
  ['waist', 'Waist', 50, 160, true],
  ['hip', 'Hip', 60, 170, true],
  ['thigh', 'Thigh', 30, 100, false],
  ['knee', 'Knee', 25, 60, false],
  ['bottom', 'Bottom opening', 15, 60, false],
  ['inseam', 'Inseam', 40, 100, false],
  ['outseam', 'Outseam / length', 60, 130, true],
  ['rise', 'Rise', 15, 50, false],
];

export const SYSTEM_TEMPLATES: SystemTemplate[] = [
  { name: "Men's Shirt", category: 'Shirt', sections: [
    { name: 'Upper body', fields: upper }, { name: 'Sleeve', fields: sleeve },
    { name: 'Length', fields: [['shirt_length', 'Shirt length', 50, 110, true]] } ] },
  { name: "Men's Trousers", category: 'Trousers', sections: [{ name: 'Lower body', fields: lower }] },
  { name: 'Suit Jacket', category: 'Jacket', sections: [
    { name: 'Upper body', fields: upper }, { name: 'Sleeve', fields: sleeve },
    { name: 'Length', fields: [['jacket_length', 'Jacket length', 55, 100, true], ['back_width', 'Back width', 25, 60, false]] } ] },
  { name: 'Kurta', category: 'Kurta', sections: [
    { name: 'Upper body', fields: upper }, { name: 'Sleeve', fields: sleeve },
    { name: 'Length', fields: [['kurta_length', 'Kurta length', 60, 140, true], ['slit', 'Side slit', 10, 50, false]] } ] },
  { name: 'Sherwani', category: 'Sherwani', sections: [
    { name: 'Upper body', fields: upper }, { name: 'Sleeve', fields: sleeve },
    { name: 'Length', fields: [['sherwani_length', 'Sherwani length', 80, 140, true]] },
    { name: 'Lower', fields: lower.slice(0, 2) } ] },
  { name: "Women's Blouse", category: 'Blouse', sections: [
    { name: 'Upper body', fields: [
      ['bust', 'Bust', 60, 160, true], ['under_bust', 'Under bust', 55, 140, false], ['waist', 'Waist', 50, 150, true],
      ['shoulder', 'Shoulder', 28, 55, true], ['armhole', 'Armhole', 30, 65, false], ['front_neck_depth', 'Front neck depth', 5, 30, false],
      ['back_neck_depth', 'Back neck depth', 5, 40, false]] },
    { name: 'Sleeve', fields: [['sleeve_length', 'Sleeve length', 5, 70, false], ['sleeve_round', 'Sleeve round', 18, 50, false]] },
    { name: 'Length', fields: [['blouse_length', 'Blouse length', 25, 70, true]] } ] },
  { name: 'Salwar', category: 'Salwar', sections: [{ name: 'Lower body', fields: [
    ['waist', 'Waist', 50, 150, true], ['hip', 'Hip', 60, 170, true], ['thigh', 'Thigh', 35, 100, false],
    ['knee', 'Knee', 25, 60, false], ['bottom', 'Bottom', 15, 60, false], ['length', 'Length', 70, 130, true]] }] },
  { name: 'Churidar', category: 'Churidar', sections: [{ name: 'Lower body', fields: [
    ['waist', 'Waist', 50, 150, true], ['hip', 'Hip', 60, 170, true], ['thigh', 'Thigh', 35, 100, false],
    ['calf', 'Calf', 20, 55, false], ['ankle', 'Ankle', 15, 40, true], ['length', 'Length', 70, 130, true]] }] },
  { name: 'Saree Blouse', category: 'Blouse', sections: [
    { name: 'Upper body', fields: [
      ['bust', 'Bust', 60, 160, true], ['waist', 'Waist', 50, 150, true], ['shoulder', 'Shoulder', 28, 55, true],
      ['armhole', 'Armhole', 30, 65, false], ['front_neck_depth', 'Front neck depth', 5, 30, false],
      ['back_neck_depth', 'Back neck depth', 5, 40, false]] },
    { name: 'Sleeve & length', fields: [['sleeve_length', 'Sleeve length', 5, 70, false], ['blouse_length', 'Blouse length', 25, 60, true]] } ] },
  { name: 'Gown', category: 'Gown', sections: [
    { name: 'Upper body', fields: [['bust', 'Bust', 60, 160, true], ['waist', 'Waist', 50, 150, true], ['hip', 'Hip', 60, 170, true], ['shoulder', 'Shoulder', 28, 55, false]] },
    { name: 'Length', fields: [['shoulder_to_floor', 'Shoulder to floor', 100, 200, true], ['waist_to_floor', 'Waist to floor', 70, 130, false]] } ] },
  { name: 'Dress', category: 'Dress', sections: [
    { name: 'Upper body', fields: [['bust', 'Bust', 60, 160, true], ['waist', 'Waist', 50, 150, true], ['hip', 'Hip', 60, 170, true], ['shoulder', 'Shoulder', 28, 55, false]] },
    { name: 'Length', fields: [['dress_length', 'Dress length', 50, 160, true], ['sleeve_length', 'Sleeve length', 5, 70, false]] } ] },
  { name: 'Skirt', category: 'Skirt', sections: [{ name: 'Lower body', fields: [
    ['waist', 'Waist', 50, 150, true], ['hip', 'Hip', 60, 170, true], ['skirt_length', 'Skirt length', 30, 120, true]] }] },
  { name: 'School Uniform', category: 'Uniform', sections: [
    { name: 'Upper body', fields: [['chest', 'Chest', 45, 130, true], ['shoulder', 'Shoulder', 25, 50, true], ['shirt_length', 'Shirt length', 35, 90, true], ['sleeve_length', 'Sleeve length', 25, 70, false]] },
    { name: 'Lower body', fields: [['waist', 'Waist', 40, 120, true], ['hip', 'Hip', 45, 130, false], ['bottom_length', 'Trouser / skirt length', 40, 110, true]] } ] },
  { name: 'Alteration', category: 'Alteration', sections: [{ name: 'Adjustments', fields: [
    ['shorten_by', 'Shorten by', 0, 40, false], ['lengthen_by', 'Lengthen by', 0, 40, false], ['take_in_waist', 'Take in at waist', 0, 20, false],
    ['let_out_waist', 'Let out at waist', 0, 20, false], ['sleeve_adjust', 'Sleeve adjust', 0, 20, false]] }] },
  { name: 'Custom Garment', category: 'Custom', sections: [{ name: 'Measurements', fields: [
    ['measure_1', 'Measurement 1', 0, 300, false], ['measure_2', 'Measurement 2', 0, 300, false], ['measure_3', 'Measurement 3', 0, 300, false]] }] },
];
