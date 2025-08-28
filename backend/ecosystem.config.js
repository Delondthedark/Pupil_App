// backend/ecosystem.config.js
export const apps = [
    {
        name: 'backend',
        script: 'index.js',
        cwd: '/home/ubuntu/Pupil_App/backend',
        env: {
            PGUSER: 'pupil_user',
            PGPASSWORD: 'pupil_pass',
            PGHOST: 'localhost',
            PGDATABASE: 'pupil_app_db',
            PGPORT: '5432',
            PORT: '3001',
            PUBLIC_URL: 'https://hey.pupil.best',
            JWT_SECRET: 'supersecret',
            SHARED_UPLOAD_TOKEN: 'ipass'
        }
    }
];
