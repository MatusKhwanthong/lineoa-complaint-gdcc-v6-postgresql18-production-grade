import test from 'node:test';
import assert from 'node:assert/strict';
import { complaintCreateSchema } from '../src/validators.js';

const validComplaint = {
  categoryId: '11111111-1111-4111-8111-111111111111',
  title: 'ไฟส่องสว่างดับ',
  description: '',
  locationText: '',
  latitude: null,
  longitude: null,
  contactName: 'สมชาย',
  contactPhone: '0812345678',
  contactEmail: '',
  privacyConsent: true,
};

test('accepts an empty description and missing coordinates', () => {
  const result = complaintCreateSchema.safeParse(validComplaint);

  assert.equal(result.success, true);
  assert.equal(result.data.description, '-');
  assert.equal(result.data.locationText, '-');
  assert.equal(result.data.latitude, null);
  assert.equal(result.data.longitude, null);
});

test('accepts a valid coordinate pair', () => {
  const result = complaintCreateSchema.safeParse({
    ...validComplaint,
    latitude: 9.1382,
    longitude: 99.3217,
  });

  assert.equal(result.success, true);
});

test('rejects a partial coordinate pair', () => {
  const result = complaintCreateSchema.safeParse({
    ...validComplaint,
    latitude: 9.1382,
  });

  assert.equal(result.success, false);
  assert.deepEqual(result.error.flatten().fieldErrors.longitude, [
    'กรุณาระบุ Latitude และ Longitude ให้ครบทั้งคู่',
  ]);
});
