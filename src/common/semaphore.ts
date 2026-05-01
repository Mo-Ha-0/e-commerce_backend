export class Semaphore {
    private active = 0;
    private readonly waiters: Array<() => void> = [];

    constructor(private readonly maxConcurrent: number) {}

    async acquire(): Promise<() => void> {
        if (this.active >= this.maxConcurrent) {
            await new Promise<void>((resolve) => this.waiters.push(resolve));
        }

        this.active += 1;

        return () => {
            this.active -= 1;
            const next = this.waiters.shift();
            if (next) {
                next();
            }
        };
    }
}
