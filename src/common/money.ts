export function moneyToCents(value: number | string): number {
    const raw = typeof value === 'number' ? value.toString() : value;
    const normalized = raw.trim();

    if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
        throw new Error('Money values must be positive with up to 2 decimals');
    }

    const [whole, fraction = ''] = normalized.split('.');
    return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function centsToMoney(cents: number): string {
    if (!Number.isInteger(cents) || cents < 0) {
        throw new Error('Money cents must be a non-negative integer');
    }

    return (cents / 100).toFixed(2);
}
