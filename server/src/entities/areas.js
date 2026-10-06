// Mappar entiteter -> behörighetsområden (från src/lib/staffPermissions.js)
// och markerar känsliga entiteter där reception ej ska läsa.
export const AREA = {
  Booking: 'bookings', Customer: 'customers', Treatment: 'treatments',
  JournalEntry: 'journal', ClinicalTreatmentRecord: 'journal', Complication: 'journal',
  TreatmentMedia: 'journal', TreatmentCompliance: 'journal', TreatmentPlan: 'journal',
  Consent: 'journal', HealthDeclaration: 'health', FormSubmission: 'forms',
  FormTemplate: 'forms', PatientFile: 'customers',
  Staff: 'staff', StaffSchedule: 'schedule', StaffTimeOff: 'schedule',
  Room: 'schedule', Resource: 'schedule', WaitingList: 'schedule',
  Payment: 'payments', GiftCard: 'gift_cards', Product: 'products',
  InventoryTransaction: 'products', Campaign: 'marketing', DiscountCode: 'marketing',
  Review: 'reviews', Message: 'messages', AuditLog: 'audit',
  ManagementDocument: 'management', FeatureFlag: 'settings', Clinic: 'settings',
  Task: 'dashboard', CommunicationLog: 'messages',
};

// Känsliga entiteter: reception (som har customers/bookings/forms) ska inte läsa.
export const SENSITIVE_READ = new Set([
  'JournalEntry', 'ClinicalTreatmentRecord', 'Complication', 'TreatmentMedia',
  'TreatmentCompliance', 'TreatmentPlan', 'Consent', 'HealthDeclaration',
  'Payment', 'GiftCard', 'Staff', 'AuditLog', 'ManagementDocument', 'FeatureFlag',
]);

export function readArea(entityName) {
  return AREA[entityName] || null;
}
export function writeArea(entityName) {
  return AREA[entityName] || null;
}
export function isSensitiveRead(entityName) {
  return SENSITIVE_READ.has(entityName);
}