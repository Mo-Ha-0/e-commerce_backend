module.exports = {
    apps: [
        {
            name: 'ecommerce-api',
            script: 'dist/main.js',
            instances: 'max',
            exec_mode: 'cluster',
            env: {
                NODE_ENV: 'production',
                PORT: 3000,
            },
        },
    ],
};
