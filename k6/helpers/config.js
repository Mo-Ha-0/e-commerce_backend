export const BASE_URL = 'http://localhost:8080';

export const SEEDED_USERS = {
    superadmin: { email: 'superadmin@example.com', password: 'password123' },
    admin: { email: 'admin@example.com', password: 'password123' },
    customer: { email: 'hamadmohamad937@gmail.com', password: 'password123' },
    customer2: { email: 'customer2@example.com', password: 'password123' },
};

export const TEST_USER = (n) => ({
    email: `testuser${n}@test.com`,
    password: 'password123',
});

export const PRODUCTS = {
    raceCondition: 'Seed Race Condition Product',
    outOfStock: 'Seed Wireless Mouse',
    lowStock: 'Seed Mechanical Keyboard',
    normal: 'Seed Laptop Pro',
};
