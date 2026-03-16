
export const FRONTEND_URL = process.env.E2E_FRONTEND_URL || 'http://127.0.0.1:3000';
export const BACKEND_URL = process.env.E2E_BACKEND_URL || 'http://127.0.0.1:8000';
export const TEST_SUPPORT_URL = `${BACKEND_URL}/api/v1/test-support`;
export const API_URL = `${BACKEND_URL}/api/v1`;
export const PASSWORD = process.env.E2E_DEFAULT_PASSWORD || 'StrongPass123!';
