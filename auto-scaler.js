const { execSync } = require('child_process');

const CONFIG = {
    minInstances: 3,
    maxInstances: 8,
    checkIntervalMs: 15000,
    cooldownMs: 45000,

    cpuLimit: 1.0,
    cpuScaleUpThreshold: 70,
    cpuScaleDownThreshold: 35,

    ramLimitMB: 256,
    ramScaleUpPercent: 70,
    ramScaleDownPercent: 35,
};

const RAM_UP_MB = CONFIG.ramLimitMB * (CONFIG.ramScaleUpPercent / 100);
const RAM_DOWN_MB = CONFIG.ramLimitMB * (CONFIG.ramScaleDownPercent / 100);

let lastScaleTime = 0;

function parseMemoryMB(str) {
    const match = str.trim().match(/^([\d.]+)\s*(GiB|GB|MiB|MB|KiB|KB|B)$/i);
    if (!match) return 0;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
        case 'GIB':
        case 'GB':
            return value * 1024;
        case 'MIB':
        case 'MB':
            return value;
        case 'KIB':
        case 'KB':
            return value / 1024;
        case 'B':
            return value / (1024 * 1024);
        default:
            return 0;
    }
}

function getCurrentInstanceCount() {
    const output = execSync('docker compose ps --format json app', {
        encoding: 'utf8',
    }).trim();

    if (!output) return 0;

    const lines = output.split('\n').filter(Boolean);
    return lines.length;
}

function getStats() {
    const ids = execSync('docker compose ps -q app')
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);

    if (ids.length === 0) return { avgCpu: 0, avgRamMB: 0, count: 0 };

    const lines = execSync(
        `docker stats --no-stream --format "{{.CPUPerc}}|{{.MemUsage}}" ${ids.join(' ')}`,
    )
        .toString()
        .trim()
        .split('\n')
        .filter(Boolean);

    let totalCpu = 0;
    let totalRam = 0;

    for (const line of lines) {
        const [cpuStr, memStr] = line.split('|');

        totalCpu += parseFloat(cpuStr.replace('%', '')) || 0;

        const usagePart = memStr.split('/')[0].trim();
        totalRam += parseMemoryMB(usagePart);
    }

    return {
        avgCpu: parseFloat((totalCpu / lines.length).toFixed(1)),
        avgRamMB: parseFloat((totalRam / lines.length).toFixed(1)),
        count: lines.length,
    };
}

function scale(target, reason) {
    const current = getCurrentInstanceCount();
    console.log(`\n⚡ Scaling: ${current} → ${target}  [reason: ${reason}]`);
    execSync(`docker compose up --scale app=${target} -d --no-recreate`, {
        stdio: 'inherit',
    });
    lastScaleTime = Date.now();
    console.log(`✅ Now running ${target} instances\n`);
}

function tick() {
    try {
        const { avgCpu, avgRamMB, count } = getStats();
        const currentInstances = count || getCurrentInstanceCount();
        const ramPercent = parseFloat(
            ((avgRamMB / CONFIG.ramLimitMB) * 100).toFixed(1),
        );
        const inCooldown = Date.now() - lastScaleTime < CONFIG.cooldownMs;
        const cooldownLeft = Math.max(
            0,
            Math.ceil(
                (CONFIG.cooldownMs - (Date.now() - lastScaleTime)) / 1000,
            ),
        );

        console.log(
            `[${new Date().toLocaleTimeString()}]` +
                `  Instances: ${currentInstances}` +
                `  │  CPU: ${avgCpu}% (limit ${CONFIG.cpuLimit * 100}%, threshold ${CONFIG.cpuScaleUpThreshold}%)` +
                `  │  RAM: ${avgRamMB}MB / ${CONFIG.ramLimitMB}MB (${ramPercent}%, threshold ${CONFIG.ramScaleUpPercent}%)` +
                (inCooldown ? `  │  Cooldown: ${cooldownLeft}s` : ''),
        );

        if (inCooldown) return;

        const cpuHigh = avgCpu > CONFIG.cpuScaleUpThreshold;
        const ramHigh = avgRamMB > RAM_UP_MB;

        if ((cpuHigh || ramHigh) && currentInstances < CONFIG.maxInstances) {
            const reason = [
                cpuHigh
                    ? `CPU ${avgCpu}% > ${CONFIG.cpuScaleUpThreshold}%`
                    : '',
                ramHigh ? `RAM ${avgRamMB}MB > ${RAM_UP_MB}MB` : '',
            ]
                .filter(Boolean)
                .join(' + ');

            scale(currentInstances + 1, reason);
            return;
        }

        const cpuLow = avgCpu < CONFIG.cpuScaleDownThreshold;
        const ramLow = avgRamMB < RAM_DOWN_MB;

        if (cpuLow && ramLow && currentInstances > CONFIG.minInstances) {
            scale(
                currentInstances - 1,
                `CPU ${avgCpu}% < ${CONFIG.cpuScaleDownThreshold}% AND RAM ${avgRamMB}MB < ${RAM_DOWN_MB}MB`,
            );
        }
    } catch (err) {
        console.error('Auto-scaler error:', err.message);
    }
}

console.log(' Auto-scaler started 😂\n');
console.log(
    `   Instances : min ${CONFIG.minInstances} → max ${CONFIG.maxInstances}`,
);
console.log(`   CPU limit : ${CONFIG.cpuLimit} cores per instance`);
console.log(
    `   CPU up    : avg > ${CONFIG.cpuScaleUpThreshold}%  (= ${CONFIG.cpuLimit * (CONFIG.cpuScaleUpThreshold / 100)} cores)`,
);
console.log(`   CPU down  : avg < ${CONFIG.cpuScaleDownThreshold}%`);
console.log(`   RAM limit : ${CONFIG.ramLimitMB}MB per instance`);
console.log(
    `   RAM up    : avg > ${RAM_UP_MB}MB  (${CONFIG.ramScaleUpPercent}% of limit)`,
);
console.log(
    `   RAM down  : avg < ${RAM_DOWN_MB}MB  (${CONFIG.ramScaleDownPercent}% of limit)\n`,
);

tick();
setInterval(tick, CONFIG.checkIntervalMs);
